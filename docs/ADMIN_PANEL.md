# Admin panel

The admin panel is where Super Admins and permitted Teacher-Admins watch how Repoggits is used: dashboards, live
monitoring, users and sessions, activity, prompt, security and audit logs, and system health. It sits next to the
original **Review desk** (`/admin`), which keeps project review, the project library, People, AI activity and Backups.

This document is for administrators and developers, and describes the code as it stands.

- Start page: `/admin/overview` (or the **Admin panel** tab on the review desk, which opens the first section you may see).
- Deployment settings (proxy headers, environment variables, retention defaults): [DEPLOYMENT.md](DEPLOYMENT.md#tracking-ip-addresses-and-the-admin-panel).

## Tracking is not collecting yet

The pages, the API and the schema below are complete, but the code that *fills* the tracked tables is still a
placeholder: every function in `lib/tracking/index.ts` returns an empty result without writing anything
(`recordEvent`, `activityRoute`, `startTrackedSession`, `endTrackedSessions`, `recordApiRequest`, `recordServerError`,
`clientIp`, `pruneTrackingData`). Its supporting modules are written — `config.ts` (retention and presence settings),
`device.ts` (User-Agent parsing) and `ip.ts` (`X-Forwarded-For` with `TRUSTED_PROXY_HOPS`) — so what remains is the
bodies in `index.ts` and the browser tracker that calls `POST /api/activity`.

Until that lands, every section reads real but almost empty tables, so dashboards and logs show zeroes and "Nothing
matches these filters". Two parts do not depend on it and work today: the **Admin audit log**, written by `audit()` in
`lib/auth.ts`, and the parts of **System health** that measure the database, storage and runtime directly.

Anything the collection code adds must keep the promises in [Privacy and retention](#privacy-and-retention), and should
add Global Privacy Control and Do Not Track handling, which nothing implements yet.

---

## Sections

Defined in `components/platform/admin/nav.ts`. A link appears only to someone who may open it; the API enforces the same rule.

| Group | Section | Page | Permission |
| --- | --- | --- | --- |
| Dashboard | Overview | `/admin/overview` | `analytics` |
| Dashboard | Live monitoring | `/admin/live` | `live` |
| Dashboard | Analytics | `/admin/analytics` | `analytics` |
| People | Users | `/admin/users`, detail `/admin/users/<id>` | `users` |
| People | Sessions | `/admin/sessions` | `sessions` |
| Projects | Project analytics | `/admin/projects` | `analytics` |
| Projects | Review desk | `/admin` (tabs: `?tab=queue\|library\|activity\|people\|ai\|backups`) | any Teacher-Admin or Super Admin |
| Logs | Global activity | `/admin/logs` | `activity` |
| Logs | Prompt logs | `/admin/logs/prompts` | `prompts` |
| Logs | Security logs | `/admin/logs/security` | `security` |
| Logs | Admin audit log | `/admin/logs/audit` | `audit` |
| Platform | AI usage | `/admin/ai` | `prompts` |
| Platform | System health | `/admin/system` | `system` |
| Platform | Settings | `/admin/settings` | Super Admin only |

Students who open any admin page see *"This space is reserved for assigned reviewers."*; a Teacher-Admin without the
section's permission sees a notice instead of the page, and no data is requested.

## Permissions

`lib/admin/permissions.ts` is the single definition:

| Permission | Grants |
| --- | --- |
| `analytics` | Dashboards and analytics |
| `live` | Live monitoring |
| `users` | User directory and user activity (including email addresses) |
| `sessions` | Sessions, including ending one |
| `activity` | Global activity logs |
| `prompts` | Prompt logs (details, not prompt text) |
| `prompt_content` | Read prompt text — **personal data** |
| `network` | IP addresses and IP history — **personal data** |
| `security` | Security logs |
| `audit` | Admin audit log |
| `system` | System health and data retention (changing retention and running a cleanup stay Super Admin only) |

- **Super Admins** hold every permission. **Students** hold none.
- **Teacher-Admins** hold only what a Super Admin grants, stored as `permission:<name>` entries in the user's `scopes`, next to
  their `department:…` and `subject:…` review assignments.
- **Granting:** Review desk › **People** (`/admin?tab=people`) → set the role to *Teacher-Admin* → tick boxes under
  **Admin panel permissions** → **Save user**. The review assignments text box keeps working as before; the ticked
  permissions are merged into the scopes on save, and changing the role away from Teacher-Admin removes them. Saving signs
  the person out, so the change applies immediately. The same thing through the API:
  `PATCH /api/admin/users` with `{"id":"<uuid>","role":"teacher","scopes":["department:Computer Science","permission:live"],"suspended":false}`
  (Super Admin only, at most 45 scopes, recorded in the audit log as `user.updated`).
- Server code checks with `requirePermission(user, name)` (403 otherwise); pages hide what `hasPermission` refuses.
- `prompt_content` is useful only together with `prompts`; `network` only adds IP addresses to sections the person can already open.

## API

Every endpoint below requires a signed-in account that is not a student (401 when signed out, 403 for a student) plus the
listed permission (403 otherwise). Requests other than GET must carry an `Origin` header equal to `APP_ORIGIN` (403
otherwise). Unknown paths return 404, invalid filter values 400. Lists return `Paged<T>`
(`{items,page,pageSize,total,totalCapped,nextCursor}`, totals capped at 10,000); response shapes are in `lib/admin/types.ts`.

| Endpoint | Permission | Notes |
| --- | --- | --- |
| `GET /api/admin/overview` | `analytics` | Stat cards (change is a percentage against the previous period) and charts. `date` defaults to `7d`. |
| `GET /api/admin/analytics?view=users\|activity\|visitors\|devices\|projects\|ai` | `analytics` | `view=ai` needs `prompts` instead of `analytics`, because it counts prompt data (`lib/admin/analytics.ts`). |
| `GET /api/admin/live` | `live` | `LiveSnapshot`: online counts and the sessions seen within the presence window. |
| `GET /api/admin/users` | `users` | User directory with activity totals. |
| `GET /api/admin/users/:id` | `users` | One user; 400 for a malformed id, 404 for an unknown one. |
| `GET /api/admin/sessions` | `sessions` | `SessionRow` list (online, offline, ended). |
| `POST /api/admin/sessions/:id/revoke` | `sessions` | Ends the tracked session (`end_reason='revoked'`) and deletes the sign-in cookies behind it, so that browser is signed out on its next request. Audited as `session.revoked`; 409 if it has already ended. |
| `GET /api/admin/logs`, `GET /api/admin/logs/export` | `activity` | Global activity. A single user's timeline (`?user=<id>`) is also open to `users`. |
| `GET /api/admin/prompts`, `GET /api/admin/prompts/export` | `prompts` | Prompt log rows never include prompt text. |
| `GET /api/admin/prompts/:id` | `prompts` + `prompt_content` | Returns the decrypted prompt; every view is audited as `prompt.viewed`. |
| `GET /api/admin/security`, `GET /api/admin/security/export` | `security` | `?source=events` (default): security events; `?source=errors`: server errors behind 5xx responses. |
| `GET /api/admin/audit`, `GET /api/admin/audit/export` | `audit` | Admin actions, plus the distinct action names for the filter. |
| `GET /api/admin/system` | `system` | System health (below). Accepts `tz`. |
| `PATCH /api/admin/system/retention` | `system` + Super Admin | Body `{activityDays 7–730, sessionDays 1–365, securityDays 30–730}` (whole days); audited as `retention.updated`. |
| `POST /api/admin/system/prune` | `system` + Super Admin | Deletes data older than the retention settings now; returns `{events,sessions,visitors,apiUsage,errors}`; audited as `tracking.pruned`. |

Endpoints outside `/api/admin` used by tracking:

| Endpoint | Who | Notes |
| --- | --- | --- |
| `POST /api/activity` | Any visitor | The browser tracker: page views, heartbeats and searches (search text is never stored). Currently answers 204 and stores nothing — see [Tracking is not collecting yet](#tracking-is-not-collecting-yet). |

A project-share endpoint is named by `PROJECT_SHARE` in `EVENT_TYPES` but does not exist yet; it belongs to the same
outstanding tracking workstream.

The older review desk endpoints (`GET /api/admin`, `POST /api/admin/reviews`, `PATCH /api/admin/projects|users|settings`,
`GET /api/admin/ai-requests`, `PATCH /api/admin/ai-access`, `POST /api/admin/backup`, `GET /api/admin/export`) are unchanged.

### System health response

`GET /api/admin/system` (`lib/admin/system.ts`) returns counts, sizes and on/off facts only — never a secret, key,
connection string or other environment value; error messages are scrubbed of known secret values and URL credentials.

- `database`: `ok`, `latencyMs`, `sizeBytes` (null where the host refuses `pg_database_size`), `tables` (name, estimated rows, total bytes).
- `storage`: uploaded file count and bytes. `mail.pendingOutbox`.
- `api`: last 24 hours' requests, client errors (4xx) and server errors (5xx), plus 24 hourly buckets in the viewer's time zone.
- `errors`: the latest 25 server errors (method, path, status, error name and message; never request bodies).
- `sessions`: `active` (unexpired sign-ins) and `online` (tracked sessions seen within the presence window).
- `tracking`: current retention settings and the oldest kept activity event, session, API bucket and error.
- `ai`: whether a Gemini key is configured, the model, whether the assistant is switched on, prompt retention days.
- `runtime` (uptime, Node version, platform, memory) and `config` (`trustedProxyHops`, `presenceTimeoutSeconds`,
  `emailVerificationRequired`, `appOriginHttps`, `mailMode`).

The page shows warnings for `TRUSTED_PROXY_HOPS=0`, a non-https `APP_ORIGIN`, a missing Gemini key and `MAIL_MODE=outbox`.

## URL filter parameters

Page URLs and API calls use the same names, so a filtered view can be bookmarked or shared with another administrator.
Prompt text, passwords, tokens and other secrets never appear in URLs.

**Search & identity**

| Parameter | Meaning |
| --- | --- |
| `q` | Search by person name or project title; an exact id (event, user, session, visitor, project or prompt) matches that id. |
| `user`, `session`, `project` | Exact ids. |
| `owner` | Project owner id or name. |
| `role` | `student`, `teacher` or `superadmin` where people are listed. |
| `visitor` | `authenticated` or `anonymous`. |
| `ip` | Exact IP address. Requires `network` scope (403 otherwise). |

**Event & outcome filters**

| Parameter | Meaning |
| --- | --- |
| `event` | Activity filter (`login`, `logout`, `page_view`, `project_view`, …, `prompt`, `security`, `admin`) or an exact event type. |
| `prompt` | Prompt activity: `all`, `submitted`, `completed`, `failed`, `cancelled`, `rate_limited`. |
| `status` | `success`/`failure` on activity; prompt outcome (`success`, `failed`, `cancelled`, `rate_limited`, `timeout`, `refused`, `pending`) on prompt logs; HTTP status for `source=errors`. |
| `feature`, `model` | Prompt logs: AI feature (`project_draft`) and model name. |
| `device`, `os`, `browser` | `desktop\|mobile\|tablet\|bot\|unknown`; OS and browser families from `lib/admin/types.ts` (`Other` matches the rest). |

**Time range**

| Parameter | Meaning |
| --- | --- |
| `date` | `today`, `yesterday`, `7d`, `30d`, `90d` or `custom` with `from` and `to` (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`, at most one year). On log endpoints a missing `date` means all retained history; dashboards default to `7d`. |
| `tz` | The viewer's IANA time zone for days and chart buckets (UTC when unknown). |

**Sort, paging & output**

| Parameter | Meaning |
| --- | --- |
| `sort`, `dir` | Sort column from each endpoint's allow-list (for example `time`, `event`, `user`) and `asc`/`desc`. |
| `page`, `pageSize`, `cursor` | Numbered pages (page size up to 100) or keyset paging through very large logs. |
| `view` | Analytics view. |
| `format` | `csv` or `json` on `/export` endpoints. |

## Exports

Each log has `/export?format=csv|json` with the same filters as the page and without paging, up to 10,000 rows.
CSV starts with a byte order mark and escapes cells beginning with `= + - @` so spreadsheets do not run them as formulas.
Exports apply the viewer's redaction (the IP column only with `network`; prompt text never), and every export is recorded
in the admin audit log.

## Data model

All tables live in the application schema, created by `applySchema()` in `lib/db.ts`.

| Table | Holds |
| --- | --- |
| `r.visitors` | One row per browser visitor cookie, stored only as `token_hash`; linked to a user after sign-in. |
| `r.tracked_sessions` | One browsing session, signed in or anonymous: start, last seen, end and reason, IP address, device type, OS and browser with versions, user agent, platform, screen size, pixel ratio, touch, language, time zone, online state, referrer, current page and project. Its `id` is the Session ID administrators see. |
| `r.sessions` | Sign-in cookie sessions (hash only), now with `created_at` and `tracked_session_id`. |
| `r.activity_events` | Every counted action: type, category, success or failure, user, session, visitor, project, prompt, page, IP address, device, OS, browser, user agent and cleaned metadata. |
| `r.ai_requests` | Gemini requests: encrypted prompt, outcome, feature, model, duration, token counts, session, project, IP address and device. |
| `r.api_usage` | API responses per minute: requests, client errors, server errors. |
| `r.error_log` | Server errors behind 5xx responses: method, path, status, error name and message. |
| `r.settings` (`retention`) | `{"activityDays":90,"sessionDays":30,"securityDays":180}`. |
| `r.audit` | Admin actions (reviews, user and settings changes, prompt views, exports, session revocations, retention changes, cleanups). |

## Event types

Defined in `lib/admin/types.ts` (`EVENT_TYPES`).

| Category | Types |
| --- | --- |
| Navigation | `PAGE_VIEW`, `SEARCH` |
| Sign-in | `SIGNUP`, `LOGIN`, `LOGOUT`, `EMAIL_VERIFIED` |
| Account | `PROFILE_UPDATE` |
| Projects | `PROJECT_VIEW`, `PROJECT_CREATE`, `PROJECT_UPDATE`, `PROJECT_DELETE`, `PROJECT_SHARE`, `PROJECT_DOWNLOAD` |
| Community | `PROJECT_LIKE`, `PROJECT_BOOKMARK`, `COMMENT_CREATE`, `COMMENT_DELETE` |
| Files | `FILE_UPLOAD`, `FILE_DOWNLOAD` |
| AI and prompts | `AI_FEATURE_USED`, `PROMPT_SUBMITTED`, `PROMPT_COMPLETED`, `PROMPT_FAILED`, `PROMPT_TIMEOUT`, `PROMPT_REFUSED`, `PROMPT_RATE_LIMITED`, `PROMPT_CANCELLED` |
| Security | `LOGIN_FAILED`, `PASSWORD_RESET`, `RATE_LIMITED`, `ACCESS_DENIED`, `SESSION_REVOKED` |
| Admin actions | `ADMIN_ACTION` (metadata `action`, e.g. `retention.updated`, `tracking.pruned`, `prompt.viewed`) |

## How real-time works

There is no WebSocket or server-sent events. The browser tracker sends a heartbeat to `POST /api/activity` every 45
seconds (`HEARTBEAT_SECONDS`) while its tab is visible. A session counts as **online** while its last heartbeat is newer
than `PRESENCE_TIMEOUT_SECONDS` (default 120, range 60–3600), which spans at least two heartbeats. Live monitoring polls
`/api/admin/live` every 10 seconds and System health polls every 30 seconds; polling pauses while the admin's own tab is
hidden. Other pages load when their filters change.

## How IP addresses and devices are captured

- **IP address**: read on the server by `clientIp()` in `lib/tracking` from `X-Forwarded-For`, trusting the number of
  proxies set in `TRUSTED_PROXY_HOPS` (see DEPLOYMENT.md). Without a reverse proxy the address can be forged.
- **Device**: the server parses the `User-Agent` header (and User-Agent Client Hints where the browser sends them) into device
  type, OS and browser with versions. The tracker adds screen size, pixel ratio, touch support, language, time zone and
  online state from standard browser APIs.
- **No fingerprinting**: no canvas, audio, font or hardware probing, and no third-party scripts. Anonymous visits are
  recognised only by the first-party visitor cookie, stored as a hash. Global Privacy Control and Do Not Track are **not**
  honoured today: nothing in `lib/tracking` reads either header, so add that with the collection code below.

## Privacy and retention

- Never stored or returned: passwords, auth tokens, cookie values, token hashes, API keys, query strings and search text.
  Stored strings are cleaned of control characters, and paths lose their query and fragment.
- IP addresses are returned only to viewers with `network`; others receive `ipAddress: null`, and filtering by `ip` is refused.
  Prompt text is encrypted with `DATA_ENCRYPTION_KEY` and shown only with `prompt_content`, each view audited. Email
  addresses appear only where the viewer has `users`.
- No tracking, device or IP field is added to public or member APIs (`/api/projects`, `/api/workspace`, `/api/auth/me`, `/api/settings`).
- Retention: activity logs 90 days, session data 30 days, security logs 180 days by default; prompt logs 180 days
  (`AI_RETENTION_DAYS` in `lib/ai-usage.ts`). Super Admins change the first three in System health › Data retention;
  cleanup runs automatically every few minutes and on demand with **Run cleanup now**. The admin audit log is not pruned
  by these settings.

## Commands

```bash
npm run db:setup                              # apply the schema (and invite the first Super Admin)
npm run build                                 # production build
npm start                                     # run the build (plain Node)
docker compose up -d --build                  # build and run with Docker Compose
npx playwright test tests/admin-security.spec.ts    # access control, redaction and leak checks
npx playwright test tests/admin-live-users.spec.ts  # live monitoring, the user directory and sessions
npx playwright test tests/admin-insights.spec.ts    # the dashboard, analytics and the four log pages
```

The schema is also applied automatically when the app first uses the database, so upgrades need no separate migration.
