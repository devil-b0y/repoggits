# Repoggits

A student project repository built with Next.js 16, TypeScript, Neon PostgreSQL, and an original Three.js workbench. The interface keeps the cream graph paper, cobalt blue, orange details, and dimensional illustrations of the initial design.

## Run locally

Requires Node.js 24+ and a Neon PostgreSQL connection.

```sh
npm install
# Put service credentials in .env.local, using .env.example as a guide.
npm run db:setup
npm run dev
```

Open http://localhost:3000. `APP_ORIGIN` must match the browser address including its port; state-changing requests enforce that origin. Use HTTPS in a hosted environment so session cookies are marked Secure. The connection is stored only in the ignored `.env.local` file. Application tables live inside the `repoggits` PostgreSQL schema; unrelated schemas are untouched. TLS certificate verification stays enabled. Transactions pin one pooled connection through commit or rollback.

## First administrator

```sh
npm run db:setup -- administrator@example.edu
```

When no Super Admin exists, this creates one and writes a single-use, 24-hour setup link to `.local/admin-invitation.txt`. Open that private link, choose a password, and sign in. Running the command again does not replace an existing administrator. Assign roles and exact `department:Computer Science` or `subject:Final Year Project` review scopes from `/admin`. There are no default passwords, public setup endpoints, or automatic first-signup admin privileges.

## Main flows

- `/`: approved projects with title/team/technology search, type/department/subject/technology/year filters, and featured/newest/download/view sorting.
- `/auth`: signup, login, optional email verification, forgotten-password and single-use reset flows.
- `/account`: name, department, batch, student ID, bio, avatar, and external profile links.
- `/submit`: account-backed drafts, team contributions, stack fields, media, dates, conditional itemized costs, and changelogs.
- `/workspace`: owned/team projects, resumable drafts, review feedback, saved projects, and in-app notifications.
- `/projects/:id`: images, video, costs, source downloads, team, comments, related projects, and version history. Unpublished versions require ownership or review authorization.
- `/admin`: scoped queues, one/two-reviewer approval, bulk decisions, charts, audit history, CSV export, featuring/archive, user management, and categories.
- `/api/feed`: RSS for recently approved projects.
- `/demo`: the original browser-local prototype, preserved separately for design reference and regression tests. It does not publish into the live repository.

Roles are enforced server-side. Contributors cannot review their own work. Each submitted version snapshots its required approval count; two approvals require two different assigned reviewers. Approved versions are immutable. A new version starts as a private draft, while the previous approved version stays published until its successor is approved.

## Email delivery

Email verification is temporarily optional (`EMAIL_VERIFICATION_REQUIRED=false`, the default). New users can sign in immediately; existing unverified accounts can submit, comment, review according to their role, and download. Signup does not queue verification emails. Set this option to `true` to restore verification gates. Actual email-verification records, password resets, and single-use administrator invitations remain intact.

The local setup currently uses `MAIL_MODE=outbox`. Password-reset and review messages (plus verification messages when enabled) are stored privately in Neon and **are not sent** in this mode.

```sh
npm run mail:outbox
```

This writes pending messages to `.local/outbox.txt` for development. Never serve that directory publicly. To deliver real messages, set `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` in `.env.local`, then restart. `npm run mail:send` retries queued mail; run only one delivery worker at a time. Failed deliveries stay queued.

Email/password authentication uses salted scrypt hashes, opaque server-side sessions, expiry, revocation, and single-use tokens. Optional Google OAuth is not implemented.

## Uploads and downloads

Uploads use built-in structural and content validation, without an external scanning service. This is a source-file safety policy, not a general antivirus engine: malicious source code can still pass and must never be executed by the server.

- At most 20 MB per upload, enforced on actual request bytes.
- PNG/JPEG/WebP must decode within 25 megapixels, then are re-encoded as WebP with metadata removed.
- ZIP inspection never writes archive entries to disk. Limits: 2,000 entries, 100 MB actual decompressed content, compression-ratio checks, CRC verification, and a processing timeout.
- Traversal paths, symlinks, duplicates, encrypted/nested archives, unsupported types, and detected executable signatures are rejected.
- All accepted uploads pass validation before storage, recorded as `validated_internal`. Source entries must be UTF-8 text; embedded raster images must decode successfully. Each entry is limited to 20 MB.
- Validated bytes are stored privately in Neon, outside the public web root. Source files are never executed. For a larger collection, migrate file storage to private object storage before increasing limits.
- Source downloads require a signed-in account (and email verification when enabled) and a five-minute HMAC URL bound to that account. Authorization is rechecked on every download. Images use an authorization-aware handler with explicit MIME and nosniff headers.
- Server-side rate limits cover authentication, uploads, submissions, downloads, and comments.

## Verification

```sh
npm test                # Production suite, then Turbopack checks
npm run test:e2e        # Production build + browser/API tests
npm run test:dev        # Development styles, fonts, compilation, hydration
npm run typecheck
npm run build
```

Tests require installed Google Chrome. They create isolated `repoggits_test_<process>` schemas in the configured Neon database and remove only those test schemas afterward. Fixtures never touch application accounts or projects. Production tests use port 3107; development checks use port 3108 and a separate cache. Do not point `PLAYWRIGHT_BASE_URL` at a live installation for backend integration tests.

Coverage includes signup without email verification, password reset, role escalation, origin checks, ownership, teacher scopes, immutable publication, review reasons, distinct approvals, version visibility, team-email privacy, signed downloads, suspension, UI draft persistence, ZIP/image validation, built-in upload acceptance and rejection, and the original design. Failed checks retain local screenshots/traces. Screenshot captures are review artifacts, not pixel-diff assertions.

## Deployment

Configure an HTTPS origin, Neon and SMTP. Restart after environment changes. Back up Neon and restrict database credentials to the deployment. Apply a proxy request-size limit consistent with the app limit. Current list responses cap discovery at 500 projects and administration at 1,000 versions; add cursor pagination before a larger rollout. Automated certificates, department leaderboards, OAuth, and email digests remain optional future work; RSS, dark mode, and duplicate-title/repository hints are included.

Fonts are bundled in `public/fonts` with their SIL licenses. Coding-tool branding is not displayed. Repository links are ordinary user-provided URLs; the app performs no GitHub repository operations.

References: [OWASP uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [password reset](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), and [PostgreSQL transactions](https://node-postgres.com/features/transactions).


## Project stories and community

Project cards show the cover thumbnail, working-demo indicator, star count, and like count. Thumbnail clicks open the demo with muted playback and controls; visitors can switch to the cover or gallery photos. YouTube watch/share/shorts links and direct MP4/WebM URLs work in the player. Other video URLs have an external watch link. Reduced-motion preferences prevent automatic playback on arrival.

Each team member can have a photo, contribution, branch, semester (1-8), and GGITS/GGCT college. Member emails remain private. The editor also records highlighted features, development dates, calculated elapsed calendar days (same-day projects display one day), languages, services with purposes/links, and itemized hardware/software costs. GitHub links remain optional. Team photos use the same built-in image validation and authorization checks as gallery images.

Stars and likes are separate, reversible account actions with one vote of each kind per account/project. The default public ranking orders by stars, then likes, then newest publication; suspended accounts do not contribute votes. Project discussion supports replies grouped under the original thread.

"Create a modified version" creates a separate private project with a permanent link to the original approved version. The new team supplies its own media/source, describes the changes, and submits through moderation. Approved modified builds appear on the original project. The original team's existing version-history flow is unchanged.

Project editor recovery: unfinished form data and completed upload references are saved automatically in this browser, separately per account and version. Save draft also stores progress in Neon for access from another device. Successful saves clear the previous recovery copy. Changed server versions are not overwritten by stale recovery. In-progress uploads prompt before refresh; browser storage failures are shown in the form.

Super Admin website backups: open Admin > Backups to download a source ZIP. The export follows root and nested .gitignore files, skips symlinks, dependencies, builds, private environment files, Git metadata and private key files, and includes restore instructions. It requires a Super Admin session and same-origin POST, is rate-limited, and writes an audit entry. Limits: 128 MB of source and 10,000 files. The full source tree must be present on the server. Neon records and uploaded files in Neon require a separate database backup; this source export does not include them.
