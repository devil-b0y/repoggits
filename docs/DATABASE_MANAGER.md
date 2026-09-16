# Database manager

Repoggits runs on more than one kind of database. The Neon PostgreSQL connection named by `DATABASE_URL` still starts
and works exactly as before — it is the **bootstrap** connection and can never be removed or disabled — but a Super
Admin can also register a self-hosted PostgreSQL server, a cPanel MySQL/MariaDB database, or a future provider, copy
the site's data across, verify the copy, and switch the application onto it, all from `/admin/database`. Nothing about
existing PostgreSQL behaviour changes unless an administrator deliberately switches away from it.

This document is for administrators and developers, and describes the code as it stands.

## Why this exists

The application talks to PostgreSQL through 206 call sites across 27 files, none of it behind an ORM. Making those
call sites indifferent to which database answers them, without rewriting any of them, is the whole design problem this
feature solves.

```
Next.js  →  lib/db.ts: db.query() / transaction()      (every one of the 206 call sites, unchanged)
              ↓
         lib/database/manager.ts   pooled, cached adapters; the write freeze; which one is "active"
              ↓
         Adapter (lib/database/types.ts)
           ├── lib/database/postgres.ts     Neon, self-hosted, any PostgreSQL 12+
           ├── lib/database/mysql.ts        cPanel MySQL/MariaDB, via the dialect translator
           └── (future providers, loaded by name — see "Adding a provider" below)
```

Every call site still writes the same PostgreSQL-flavoured SQL with `$1`-style placeholders it always has. `lib/db.ts`
resolves the *currently active* adapter and hands the statement to it; only the MySQL adapter has to do any translation,
and it does that itself, in one place, rather than asking every caller to know or care.

## The registry

Configured connections live in a server-side JSON file — `.data/databases.json` by default, overridable with
`DATABASE_REGISTRY_FILE` — not inside any database. That is deliberate: the record of where to switch cannot live
inside the database being switched away from, or the very first switch would destroy it. Passwords are sealed with the
existing `DATA_ENCRYPTION_KEY` in a companion file (`DATABASE_SECRETS_FILE`, next to the registry by default) and a
record only ever carries a **reference** to where its password lives — `env:DATABASE_URL` for the bootstrap connection,
`vault:<id>` for everything else. No `DatabaseRecord` has a `password` field; nothing in the type system lets one leak.

`DATABASE_URL` is always present as the `bootstrap` record (id `bootstrap`). It is synthesised from the environment if
the registry file is missing or damaged, and it can never be removed, disabled, or have its connection details edited —
editing it always re-reads them from `DATABASE_URL` itself. This is what guarantees Neon support is never lost: however
badly a registry file is edited by hand, the application can always fall back to the database it shipped with.

Every write to the registry is atomic (write to a temp file, then rename) and serialised, so two admin clicks in quick
succession cannot lose one another's change, and a crash mid-write leaves either the old file or the new one, never a
half-written one.

## Connections are pooled and cached, never reopened per request

`lib/database/manager.ts` keeps one adapter per configured database alive on `globalThis` for the life of the process.
Opening a fresh connection to a managed database costs a TCP handshake, a TLS handshake and an authentication round
trip — several seconds against a database in another region — so nothing here pays that cost per request. Switching
active databases (`setActive`) does not tear anything down immediately: the previous pool is drained of in-flight
queries first, and only then closed, so a request already in progress against the old database is never cut off.

The bootstrap PostgreSQL connection is a special case: its adapter reuses `lib/db.ts`'s own existing pool rather than
opening a second one, so today's behaviour against `DATABASE_URL` is bit-for-bit unchanged, and switching back to it
after trying something else costs nothing to reconnect.

## The write freeze

A database switch has one moment that matters: the last few changes have to be copied across without anything writing
to the *old* database while that happens, or the copy would miss them. Rather than reject writes outright during that
window, `lib/db.ts` **queues** them — a save made during the switch waits, briefly, and then lands, instead of failing
in front of whoever made it:

- `freezeWrites()` / `unfreezeWrites()` / `writesFrozen()` are the whole interface. Detecting a write is a single
  regex over the statement (`INSERT`/`UPDATE`/`DELETE`/`ALTER`/`CREATE`/`DROP`/`TRUNCATE`/`GRANT`/`REVOKE`, and a `WITH`
  whose body contains one) applied at `db.query`'s one choke point, so nothing anywhere else needs to know a freeze
  can happen.
- Reads are **never** held back — only a write waits.
- A held write waits up to 10 seconds (`FREEZE_WAIT_MS`) before it is refused with a clear, user-facing 503
  ("The database is briefly read-only while it is being switched..."), rather than hanging forever.
- A freeze that is never explicitly lifted — the process it belongs to crashed, say — releases itself automatically
  after 30 seconds (`FREEZE_WATCHDOG_MS`), so a failed switch can never leave the site read-only until someone restarts it.

## Switching to another database

`POST /api/admin/database/:id/switch` runs, in order, and records every step (with its own timing) in the audit log and
in the response the admin page shows:

1. **test** — the target must answer a ping before anything else is tried.
2. **compare** — table and column shapes must agree well enough to copy (see "Comparison" below); the switch refuses
   to continue otherwise.
3. **schema** — `applySchema()` runs on the target. It only ever adds; it never drops or alters existing data.
4. **sync** (full) — every row is copied across while the old database still serves live traffic.
5. **freeze** — `freezeWrites()`.
6. **final-sync** (incremental) — a second pass while nothing can be writing to the source (see the honest limitation
   below).
7. **verify** — the integrity check (below) must pass, or the switch stops here.
8. **activate** — `setActive()` points the application at the new database; the one it came from becomes `standby`.
9. **unfreeze** — writes resume.

If any step throws, the switch stops immediately, records the error, and rolls back: the old database is reactivated
and writes are unfrozen. **The database being switched away from is never emptied or altered**, so "rolling back" is
only ever making it active again — there is nothing to restore. A switch is never allowed to mark a database active
after a failed synchronisation or a failed verification; `requireCondition` enforces this at each step, not just the
last one.

### Honest limitation: the final sync is a full re-copy, not a true incremental one

Copying only the rows that changed since the first pass needs reliable change tracking — an `updated_at`, a
`deleted_at`/tombstone, or a sync-version column — that most tables here do not have (only `created_at`). Adding those
columns automatically was explicitly out of scope for this pass: a schema change made silently, on a system built for
data-integrity, is exactly the kind of thing that should be a deliberate decision, not something a sync engine does for
you.

Because the final pass runs *after* `freezeWrites()`, nothing on the source can change underneath it — so a full
re-copy there is still **correct**, just not the fastest possible one. On a small-to-medium database that finishes
comfortably inside the freeze window; on a very large one it can simply take long enough that some requests see the
503 above until it finishes, never wrong or missing data. If this matters for your deployment, add the change-tracking
columns above and extend `lib/database/sync/copy.ts`'s `copyTable()` to filter by them — the engine's row-copying,
retry, and verification machinery does not need to change to support that.

## Comparison

`lib/database/sync/compare.ts` reads both sides' `snapshot()` (tables, columns, row counts) and reports, per table:
columns only on one side, columns whose types this engine cannot convert, and row counts on each side. Two databases
are `compatible` only when every table the source has exists on the target with every column convertible — this is the
same pairing (`columnRules`) the copy engine itself uses, so "compatible" is never a second opinion that disagrees with
what a sync would actually do.

## Verification

`lib/database/sync/verify.ts` is the gate a switch depends on, and it is written to **fail closed**: a check that could
not be run counts as a failed check, never as a passed one, because a false "passed" here is exactly how data gets lost
— the switch happens, the old database is left behind, and the gap is found weeks later.

- Row counts for `users`, `projects`, `activity_events` and `audit` must match on both sides.
- Foreign keys are checked by querying the target directly for orphaned rows (`LEFT JOIN ... WHERE parent.id IS NULL`),
  not by trusting that a constraint exists — cPanel MySQL installs vary in whether constraints survive an import.
- A 200-row sample of `users`, `projects`, `versions`, `settings`, `audit` and `activity_events` is hashed and compared
  row-for-row by key (never by position — the two servers do not sort text identically).
- `passed` is `true` only when every one of the above is true and nothing threw while checking.

## Running the application on MySQL/MariaDB

This is the harder half of the feature, and the most important thing to understand about it: **the SQL translator is
not a general-purpose one.** Every one of the application's 206 query call sites funnels through one choke point
(`sql()` in `lib/db.ts`), so the set of PostgreSQL constructs that can ever reach `lib/database/dialect/mysql.ts` is
closed and known — and that file's own tests (`tests/mysql-dialect.spec.ts`) lift real statements verbatim from
`lib/admin/*`, `lib/auth.ts`, `lib/api-auth.ts` and `lib/projects.ts` to prove it against exactly that set, not against
SQL nobody writes. Anything the translator does not recognise **throws**, loudly, naming the construct and the
statement — it never guesses, because a wrong translation that runs is far more dangerous than one that fails.

Handled: `$n` → `?` (including a placeholder used twice, or out of order — the value list is rebuilt by walking the
finished statement, not assumed to line up with the input array), `FILTER (WHERE …)` → `CASE WHEN`, `interval '…'` →
`INTERVAL … unit`, `date_trunc(...) AT TIME ZONE tz` → `CONVERT_TZ`/`DATE_FORMAT`, `ILIKE` → `LIKE`, `=ANY($n::text[])`
→ `IN (…)`, `ON CONFLICT … DO UPDATE` → `ON DUPLICATE KEY UPDATE`, `ON CONFLICT DO NOTHING` → `INSERT IGNORE`, jsonb
`->>` → `JSON_UNQUOTE(JSON_EXTRACT(...))`, and `RETURNING` — MySQL cannot return rows from a write, so this application
(which generates every id in JS with `randomUUID()` and never needs a database-generated key back) replays it as a
companion `SELECT`, run in the same transaction as the write so the row it reads cannot change in between: before the
statement for a `DELETE`/`UPDATE` (the rows are about to disappear or change), after it for an upsert (the row the
caller wants is the one the write just settled on).

**Refused outright, on purpose:** `pg_catalog` references, `DISTINCT ON`, `string_agg`/`array_agg` and friends,
dollar-quoted bodies, and PostgreSQL's jsonb containment operators `@>`/`<@` (used by `fileReference()` in
`lib/projects.ts` for file-deletion safety checks) — MySQL has no equivalent, and worse, `@` opens a session-variable
reference there, so left unhandled this would not fail loudly, it would silently answer wrong. There is currently no
MySQL translation for that operator, so **the file-reference safety check is unavailable on a MySQL-backed
installation** until someone adds one; it fails the request rather than silently skipping the check.

### The schema on MySQL

`lib/database/dialect/ddl.ts` is a hand-written MySQL/MariaDB schema mirroring `lib/db.ts`'s `applySchema()` table for
table, not a mechanical translation of the PostgreSQL DDL string (which is one statement with a `DO $$ ... $$` body and
an advisory lock — regex-translating arbitrary DDL is far riskier than transcribing a 21-table schema once). It only
ever runs against a brand-new or already-migrated target, so every table is written in its final shape.

Notable divergences, all deliberate:

| PostgreSQL | MySQL | Why |
| --- | --- | --- |
| `uuid` | `CHAR(36)` | ids are generated in JS with `randomUUID()`; nothing needs a native uuid type |
| `timestamptz` | `DATETIME(6)` | MySQL has no zoned type; every value is written and read as UTC |
| `boolean` | `TINYINT(1)` | MySQL's own convention; the driver maps it back to a JS boolean |
| `jsonb` | `JSON` | MySQL 5.7.8+ / MariaDB 10.2.7+ |
| `email text UNIQUE` | dropped | the column holds encrypted ciphertext with no fixed length, which MySQL cannot index; the constraint the app actually enforces and queries by is `email_hash` (`CHAR(64)`), which keeps its unique index |
| the partial unique index "one active version per project" | a generated column (`active_slot`) that is `NULL` for every other status, with a normal unique index on it | MySQL has no partial indexes; NULL is excluded from uniqueness on both engines, so this reproduces the same guarantee |
| `CHECK` constraints | written as-is | enforced on MySQL 8.0.16+/MariaDB 10.2+; MySQL 5.7 parses and silently ignores them — a known, stated gap, not a silent one |
| the two GIN/expression indexes (`versions_data_idx`, `users_avatar_idx`) | not recreated | MySQL's functional indexes must match a query's expression verbatim, which the translator's rewritten SQL would not reliably do; every row is still found, just by a table scan — a speed cost, never a correctness one |

**Deployment requirement:** the admin analytics lean heavily on `AT TIME ZONE`, which the translator turns into
`CONVERT_TZ()`. That function needs MySQL's time zone tables populated (`mysql_tzinfo_to_sql` on the server, once) to
resolve named zones like `Asia/Kolkata`. Most cPanel hosts have this; if analytics charts come back empty on MySQL,
this is the first thing to check.

## Adding a provider

A new provider is a module at `lib/database/<name>.ts` exporting a `create<Name>Adapter(record, password): Adapter`
function, matching the `Adapter` type in `lib/database/types.ts`. `lib/database/manager.ts` loads it *by the provider's
name* (`import('./${record.provider}')`), so a provider nobody has installed fails only when someone tries to use it —
never at build time, and never for anyone using a provider that already works. Add the name to `PROVIDERS` in
`lib/database/types.ts` and to the provider list on the admin form.

## Security

- Every endpoint under `/api/admin/database` requires `user.role==='superadmin'` — deliberately not a grantable
  Teacher-Admin permission, because these actions move every row in the product from one server to another.
- Every mutation requires the `Origin` header to match `APP_ORIGIN`, exactly like the rest of the admin API.
- A password is accepted on add/edit and immediately sealed; it is never returned by any response, and `redact()` walks
  every response body and every audit detail so a credential or connection string cannot leave even if a lower layer
  starts returning one by accident.
- Every action — add, edit, remove, test, sync, compare, verify, switch, disable — is written to the admin audit log
  with who did it, when, the source and destination (as `provider://host:port/database`, never a full connection
  string), and the result.
- Nothing ever logs a password or a full `DATABASE_URL`; `safe()` in `lib/admin/database.ts` masks both out of any
  error text before it is stored or shown.

## Admin UI

`/admin/database` (Super Admin only, linked from the Platform group in the admin sidebar) shows the active database in
a banner, every configured connection as a card with its health, role and last sync time, and the actions that apply to
it: **Test**, **Sync**, **Compare**, **Verify**, **Schema**, **Switch**, **Disable**, **Edit**, **Remove**, or
**Configure** for an entry that has no connection details yet. Switching, disabling and removing all require typing the
database's own name before the button enables, so a mis-click cannot move the site between servers.

## API

| Endpoint | Notes |
| --- | --- |
| `GET /api/admin/database` | The full `DatabaseOverview`: every configured database, which one is active, whether writes are currently frozen. |
| `POST /api/admin/database` | Add a connection. |
| `PATCH /api/admin/database/:id` | Edit one. Omitting `password` keeps the one already stored. |
| `DELETE /api/admin/database/:id` | Forgets the connection. Never drops a table or deletes a row on that server. Refused for the bootstrap connection or the currently active one. |
| `POST /api/admin/database/:id/test` | Pings the target; never throws — a refused connection is an answer the page shows, not a 500. |
| `POST /api/admin/database/:id/schema` | Runs `applySchema()` on the target. |
| `POST /api/admin/database/:id/sync` | Body `{"mode":"full"\|"incremental"}`. Returns a `SyncReport`. |
| `POST /api/admin/database/:id/compare` | Returns a `Comparison` against the currently active database. |
| `POST /api/admin/database/:id/verify` | Returns an `IntegrityCheck` against the currently active database. |
| `POST /api/admin/database/:id/switch` | Runs the full switch sequence above. Returns a `SwitchReport`. |
| `POST /api/admin/database/:id/disable` | Marks it disabled; refused for the active database. |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | *(required)* | The bootstrap connection, exactly as before this feature existed. |
| `DATABASE_REGISTRY_FILE` | `.data/databases.json` | Where configured connections are recorded. |
| `DATABASE_SECRETS_FILE` | next to the registry, `secrets.json` | Where sealed passwords are kept. |
| `DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE_MS` | `5`, `600000` | Shared by every adapter's own pool, including the bootstrap one. |
| `DATABASE_CA_CERT` / `DATABASE_CA_CERT_FILE` | — | A certificate authority for a configured connection's TLS, same convention as the bootstrap connection's own `DATABASE_CA_CERT*`. |

No new variable is required to keep the application exactly as it was: with no registry file present, the only
database that exists is the `bootstrap` one built from `DATABASE_URL`, and every code path behaves identically to
before this feature.

## Docker

Nothing here changes how the container starts. `.data/` (the registry and sealed secrets) is server-side state, like
uploaded files or the database itself — mount it as a volume if configured connections should survive a container
recreate, the same way you would for anything else you do not want to lose on redeploy. No connection credential is
ever baked into an image or a Dockerfile; every one of them is entered through the admin page and sealed at rest.

## Commands

```bash
npx tsc --noEmit                                    # the whole application still typechecks with this feature in
npm run build                                        # and still builds — no route, page or import is left dangling
npx playwright test tests/mysql-dialect.spec.ts      # the SQL translator, as pure unit tests — no database needed
npx playwright test tests/database-manager.spec.ts   # the registry and the write freeze, against the test schema
npx playwright test tests/admin-database.spec.ts     # the admin page and API contract, with the API mocked
```

## Testing performed

- `npx tsc --noEmit` and `npm run build` both succeed for the whole application, including every existing route.
- `tests/mysql-dialect.spec.ts`: 16 pure unit tests against the translator, using real statements lifted from the
  application's own source, including the placeholder-reordering edge cases and the RETURNING emulation.
- `tests/database-manager.spec.ts`: the bootstrap record's guarantees, that a password never appears in any registry
  read, that exactly one database is ever active, and the write freeze's queue/release/timeout behaviour — all against
  a real (test-isolated) PostgreSQL schema.
- `tests/admin-database.spec.ts`: the admin page's own contract with its API — access control, that a submitted
  password never reaches a response or the page, typed confirmation on risky actions, and a phone-width layout.
- `tests/admin-security.spec.ts` and the rest of the pre-existing admin suite still pass unmodified, which is what
  proves nothing about authentication, users, projects, or the existing admin panel broke.

**Not yet proven, because it needs a real second server this environment does not have:** an actual live sync against
a running MySQL/MariaDB instance, and an actual completed switch-and-rollback against one. Everything the translator,
the DDL, the copy engine and the verification gate do has been proven at the unit level and against a second
PostgreSQL-shaped target; the remaining risk is dialect-specific behaviour a real MySQL server might surface that a
unit test cannot (exact error codes and messages, `sql_mode` quirks on a specific cPanel build, whether its time zone
tables are populated). Before relying on this for a real cPanel migration, run **Test**, then **Compare**, then a
**Sync** in `full` mode, then **Verify** against the real target first, and read what each one reports.
