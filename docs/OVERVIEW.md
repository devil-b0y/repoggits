# Repoggits — Project Overview

A platform for hosting, reviewing, and showcasing student academic projects (software, hardware, and hybrid builds). Students submit project stories, educators review and approve them, and approved projects become publicly discoverable with source downloads, discussion, and remixing.

## Tech Stack

### Language
- **TypeScript** (primary language, throughout `app/`, `components/`, `lib/`, `scripts/`, `tests/`)
- Strict mode via `tsc --noEmit` (`npm run typecheck`)

### Framework
- **Next.js 16** (App Router, `app/` directory) with the Webpack build (`next build --webpack`)
- **React 19** / **react-dom 19**
- Single catch-all API route: `app/api/[...path]/route.ts` handles all backend endpoints (custom router, not per-folder REST routes)

### Database
- **PostgreSQL** — no ORM/Prisma; raw SQL via the `pg` driver (`pg` + `@types/pg`)
- Designed for **Neon** (managed serverless Postgres) in production, but works with any Postgres instance (local, Docker, self-hosted)
- Schema-per-install isolation: tables live under a configurable schema (`REPOGGITS_DB_SCHEMA`, default `repoggits`), enforced in [lib/db.ts](../lib/db.ts)
- Migrations are **idempotent SQL run at startup** (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) inside an advisory-locked transaction — no separate migration framework/tool
- Connection pooling via `pg.Pool`, SSL mode auto-detected (disabled for localhost, required for remote hosts, overridable via `DATABASE_SSL`)
- Core tables: `users`, `sessions`, `tokens` (email verify/reset/invite + OTP), `projects`, `versions` (draft/pending/approved/rejected/changes_requested), `reviews`, `audit`, `notifications`, `bookmarks`, `comments` (threaded), `reactions` (star/like), `files` (binary content stored as `bytea` directly in Postgres — no S3/object storage), `rate_limits`, `outbox` (email), `settings`
- File uploads (images, ZIP source archives) are stored **as bytes inside Postgres**, not an external blob store
- **Encryption:** email addresses, private profile fields, queued emails, and uploaded files are encrypted in the app with AES-256-GCM before they are stored ([lib/encryption.ts](../lib/encryption.ts), key `DATA_ENCRYPTION_KEY`); logins find accounts through a keyed email hash, and `npm run db:encrypt` converts older rows
- **Moving providers:** `npm run db:transfer` copies every table and uploaded file to another PostgreSQL 12+ server (Amazon RDS, Google Cloud SQL, Azure, self-hosted) inside one transaction, and commits only after each table's row count and SHA-256 checksum match the source ([scripts/database-transfer.ts](../scripts/database-transfer.ts))

### Other notable dependencies
- **Three.js** (`three`, `@types/three`) — used for 3D/visual scene components (`CircuitScene`, `TeamScene`, `CodingScene`, etc. in `components/platform/`)
- **sharp** — image decoding/re-encoding (uploads are normalized to WebP)
- **yauzl / yazl** — ZIP inspection/creation (source archive validation and backup ZIP generation) without extracting/executing contents
- **zod** — schema validation
- **nodemailer** + **@azure/communication-email** — email delivery (SMTP or Azure), with an "outbox" mode that stores mail in the DB without sending
- **lucide-react** — icon set
- **Playwright** (`@playwright/test`) — end-to-end and dev/style regression testing

## Project Structure

```
app/                    Next.js pages (App Router) and the single catch-all API route
  page.tsx              Homepage
  auth/                 Login/register/verify/reset
  submit/                Project submission form
  workspace/             Author's draft/version workspace
  account/               User account settings
  projects/[id]/         Public project detail page
  admin/, admin/settings/ Educator/Super Admin review & settings dashboards
  demo/                  Sample/demo page
  api/[...path]/         All backend API endpoints (custom internal router)
components/
  platform/              Project display, editor, workspace, admin, and 3D/visual scene components
  Workbench.tsx          Top-level 3D workbench component
lib/                     Core server logic:
  db.ts                  Postgres pool, schema/migration, query helpers
  auth.ts, api-auth.ts   Sessions, tokens, password hashing, request auth
  schema.ts              Zod validation schemas
  policy.ts              Authorization/moderation policy
  projects.ts, project-display.ts, project-community.ts  Project domain logic
  api-files.ts, file-validation.ts  Upload handling & validation (images, ZIPs)
  mail.ts                Email sending (SMTP/Azure/outbox)
  draft-recovery.ts       Browser-side draft persistence support
  site-backup.ts          Admin source-code backup ZIP generator
  errors.ts, http.ts      Shared error types & HTTP helpers
scripts/                 CLI tools run via `tsx` (not part of the Next.js server):
  setup.ts               Runs migrations, bootstraps first Super Admin
  seed-sample.ts          Seeds the "CampusFlow" example project
  outbox.ts, send-outbox.ts  Inspect/send queued emails
  transfer-database.ts, database-transfer.ts  Copy the database to another PostgreSQL server (`npm run db:transfer`)
examples/campusflow/     Runnable sample student project (source + assets)
public/                  Fonts (bundled, self-hosted), images, sample demo files
tests/                   Playwright E2E, dev-mode, and OTP test suites
deploy/                  VPS installer script, systemd unit, nginx/Caddy configs, backup timer
docs/                    Deployment & operations guides, screenshots
Dockerfile, docker-compose.yml  Containerized deployment (single app service; DB is external, e.g. Neon)
```

## Architecture Notes

- **No ORM** — all database access is raw parameterized SQL through a thin wrapper (`db.query`, `transaction`) in [lib/db.ts](../lib/db.ts).
- **No external object storage** — uploaded files (images, ZIP source archives) are stored directly as `bytea` in Postgres.
- **No queue/job system** — email uses a simple `outbox` table drained by a script (`npm run mail:send`) or sent inline via SMTP/Azure.
- **Single Node process** deployment target — the README explicitly designs for "one Node process and one PostgreSQL database," sized for a 1 vCPU / 2 GB VPS.
- **Sessions & auth** are custom (hashed session/token rows in Postgres), not a third-party auth provider. Roles: `student`, `teacher`, `superadmin`.
- **Review workflow**: project versions move through `draft → pending → approved/rejected/changes_requested`, tracked with an approval-count threshold (1 or 2 reviewers) and a full audit log.
- **Testing**: Playwright drives both browser E2E flows and API regression tests; tests spin up isolated `repoggits_test_*` Postgres schemas per run and clean them up afterward.

## Deployment
- Docker Compose (`docker-compose.yml`) runs just the app container (port 3000) plus an optional Caddy reverse proxy profile for automatic TLS; the database is expected to be external (e.g., Neon) per `DATABASE_URL`.
- A non-Docker path installs Node 24, PostgreSQL, and nginx directly on Debian/Ubuntu via `deploy/install-vps.sh`.
- See [docs/DEPLOYMENT.md](DEPLOYMENT.md) and [docs/OPERATIONS.md](OPERATIONS.md) for full configuration/runbook details.

---
*Generated from repository inspection (package.json, lib/db.ts, scripts/setup.ts, README.md, docker-compose.yml) on 2026-09-13.*
