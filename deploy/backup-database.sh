#!/usr/bin/env bash
# Dump the Repoggits database, including every uploaded file, and drop old dumps.
#
#   bash deploy/backup-database.sh
#   BACKUP_DIR=/var/backups/repoggits KEEP_DAYS=30 bash deploy/backup-database.sh
#
# Admin > Backups exports the website source only. Accounts, submissions, and the
# images and source archives stored as database rows live here instead, so this
# is the backup that matters for recovery.
#
# DATABASE_URL is read from the environment, or from .env.local beside the
# application. Dumps use the custom format, which pg_restore reads directly.

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [ -z "${DATABASE_URL:-}" ] && [ -f "$APP_DIR/.env.local" ]; then
  DATABASE_URL="$(grep -m1 '^DATABASE_URL=' "$APP_DIR/.env.local" | cut -d= -f2-)"
fi
[ -n "${DATABASE_URL:-}" ] || { echo 'DATABASE_URL is not set and was not found in .env.local.' >&2; exit 1; }
command -v pg_dump >/dev/null || { echo 'pg_dump is not installed. Install the postgresql-client package.' >&2; exit 1; }

install -d -m 0700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/repoggits-$STAMP.dump"

# Only the application schema is dumped, so an unrelated database on the same
# server is never captured. Override REPOGGITS_DB_SCHEMA if it was renamed.
pg_dump --format=custom --no-owner --no-privileges \
  --schema="${REPOGGITS_DB_SCHEMA:-repoggits}" \
  --file="$TARGET.partial" "$DATABASE_URL"

# Renamed only after pg_dump succeeds, so a truncated file is never mistaken for a backup.
mv "$TARGET.partial" "$TARGET"
chmod 600 "$TARGET"
echo "Wrote $TARGET ($(du -h "$TARGET" | cut -f1))"

if [ "$KEEP_DAYS" -gt 0 ]; then
  find "$BACKUP_DIR" -maxdepth 1 -name 'repoggits-*.dump' -mtime "+$KEEP_DAYS" -print -delete
fi

# Restore into an empty database with:
#   pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" <file>
