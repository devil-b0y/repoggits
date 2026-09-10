#!/usr/bin/env bash
# Provision Repoggits on a fresh Debian or Ubuntu VPS without Docker.
#
#   sudo APP_ORIGIN=https://projects.your-domain.edu bash deploy/install-vps.sh
#
# Installs Node.js 24, PostgreSQL, and nginx; creates a service account and a
# database; writes a private .env.local; builds the application; and enables a
# systemd service listening on 127.0.0.1:3000.
#
# Safe to run again: nothing already configured is replaced, and no existing
# password, database, or environment file is overwritten. TLS is not configured
# here — run certbot afterwards, as printed at the end.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/repoggits}"
SERVICE_USER="${SERVICE_USER:-repoggits}"
DB_NAME="${DB_NAME:-repoggits}"
DB_USER="${DB_USER:-repoggits}"
APP_PORT="${APP_PORT:-3000}"
APP_ORIGIN="${APP_ORIGIN:-}"

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
note() { printf '    %s\n' "$1"; }
fail() { printf '\n\033[31mError: %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail 'Run this script with sudo or as root.'
[ -f "$SOURCE_DIR/package.json" ] || fail "No package.json found in $SOURCE_DIR."
command -v apt-get >/dev/null || fail 'This script targets Debian and Ubuntu. Follow docs/DEPLOYMENT.md manually elsewhere.'

if [ -z "$APP_ORIGIN" ]; then
  fail 'Set APP_ORIGIN to the exact public address, for example APP_ORIGIN=https://projects.your-domain.edu'
fi
case "$APP_ORIGIN" in
  */) fail 'APP_ORIGIN must not end with a slash.' ;;
  http://*|https://*) : ;;
  *) fail 'APP_ORIGIN must start with http:// or https://' ;;
esac

step 'Installing system packages'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg postgresql nginx openssl rsync

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  note 'Adding the NodeSource repository for Node.js 24'
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
    gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
  echo 'deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main' \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
fi
note "Node.js $(node --version)"

step 'Creating the service account'
if id "$SERVICE_USER" >/dev/null 2>&1; then
  note "User $SERVICE_USER already exists."
else
  useradd --system --create-home --home-dir "/var/lib/$SERVICE_USER" --shell /usr/sbin/nologin "$SERVICE_USER"
  note "Created system user $SERVICE_USER."
fi

step 'Preparing the database'
systemctl enable --now postgresql
DB_PASSWORD=''
if su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\"" | grep -q 1; then
  note "Role $DB_USER already exists; its password is left untouched."
else
  DB_PASSWORD="$(openssl rand -hex 24)"
  su - postgres -c "psql -q -c \"CREATE ROLE \\\"$DB_USER\\\" LOGIN PASSWORD '$DB_PASSWORD'\""
  note "Created role $DB_USER."
fi
if su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" | grep -q 1; then
  note "Database $DB_NAME already exists."
else
  su - postgres -c "createdb -O \"$DB_USER\" \"$DB_NAME\""
  note "Created database $DB_NAME owned by $DB_USER."
fi

step "Copying the application to $APP_DIR"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0755 "$APP_DIR"
if [ "$SOURCE_DIR" != "$APP_DIR" ]; then
  # Includes are listed first: rsync applies the first matching rule.
  rsync -a --delete \
    --include '.env.example' \
    --exclude '.git/' --exclude 'node_modules/' --exclude '.next/' --exclude '.next-test-dev/' \
    --exclude 'test-results/' --exclude '.local/' --exclude '.env' --exclude '.env.*' \
    "$SOURCE_DIR/" "$APP_DIR/"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
fi

step 'Writing the private environment file'
ENV_FILE="$APP_DIR/.env.local"
if [ -f "$ENV_FILE" ]; then
  note '.env.local already exists and was left unchanged.'
  note "Confirm APP_ORIGIN=$APP_ORIGIN is set there before serving traffic."
else
  [ -n "$DB_PASSWORD" ] || fail "Role $DB_USER exists but $ENV_FILE does not. Write DATABASE_URL there by hand, then run this script again."
  cat > "$ENV_FILE" <<EOF
# Written by deploy/install-vps.sh. Keep private.
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME
DATABASE_SSL=disable
APP_ORIGIN=$APP_ORIGIN
PORT=$APP_PORT
MAIL_MODE=outbox
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=
DOWNLOAD_SECRET=
EMAIL_VERIFICATION_REQUIRED=false
EOF
  chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  note "Wrote $ENV_FILE with a generated database password."
fi

step 'Installing dependencies and building'
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0700 "$APP_DIR/.local"
su -s /bin/bash "$SERVICE_USER" -c "cd '$APP_DIR' && npm ci --no-audit --no-fund"
su -s /bin/bash "$SERVICE_USER" -c "cd '$APP_DIR' && npm run db:setup"
su -s /bin/bash "$SERVICE_USER" -c "cd '$APP_DIR' && npm run build"

step 'Installing the systemd service'
sed -e "s#/opt/repoggits#$APP_DIR#g" \
    -e "s#^User=.*#User=$SERVICE_USER#" \
    -e "s#^Group=.*#Group=$SERVICE_USER#" \
    -e "s#--port 3000#--port $APP_PORT#" \
    "$SOURCE_DIR/deploy/repoggits.service" > /etc/systemd/system/repoggits.service
systemctl daemon-reload
systemctl enable --now repoggits

step 'Checking that the application responds'
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1; then
    note 'Health check passed.'
    break
  fi
  sleep 2
done
curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1 ||
  note 'Health check did not pass yet. Inspect: journalctl -u repoggits -n 50'

DOMAIN="${APP_ORIGIN#*://}"; DOMAIN="${DOMAIN%%[:/]*}"
cat <<EOF

Repoggits is running on 127.0.0.1:$APP_PORT.

Remaining steps:

  1. Reverse proxy and HTTPS
       sudo cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/repoggits
       sudo sed -i 's/projects.your-domain.edu/$DOMAIN/g' /etc/nginx/sites-available/repoggits
       sudo ln -sf /etc/nginx/sites-available/repoggits /etc/nginx/sites-enabled/repoggits
       sudo apt-get install -y certbot python3-certbot-nginx
       sudo certbot --nginx -d $DOMAIN
       sudo nginx -t && sudo systemctl reload nginx

  2. Firewall
       sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

  3. First administrator
       sudo -u $SERVICE_USER bash -c 'cd $APP_DIR && npm run db:setup -- you@your-domain.edu'
       sudo cat $APP_DIR/.local/admin-invitation.txt

  4. Scheduled database backups
       see $APP_DIR/docs/DEPLOYMENT.md

Service control: systemctl status repoggits | journalctl -u repoggits -f
EOF
