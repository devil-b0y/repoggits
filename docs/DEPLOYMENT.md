# Deploying Repoggits on a VPS

Repoggits is a single Node.js process backed by one PostgreSQL database. It runs
comfortably on a small virtual private server. Uploaded images and source
archives are stored as database rows, so there is no object storage, no queue,
and no second service to operate.

Two supported paths:

| | [Docker Compose](#path-a--docker-compose) | [Native install](#path-b--native-install) |
| --- | --- | --- |
| Database | PostgreSQL container | PostgreSQL package on the host |
| Process supervision | `docker compose` restart policy | systemd |
| HTTPS | Bundled Caddy, or your own proxy | nginx + certbot |
| Upgrades | Rebuild the image | `git pull`, rebuild, restart |

Both end up in the same place: the application listening on loopback, a reverse
proxy terminating TLS in front of it, and nightly database dumps.

## Before you begin

- **A server.** 1 vCPU and 2 GB of memory handle a department-sized deployment.
  The build itself is the heaviest step; 2 GB is a realistic floor for it.
- **A DNS record** pointing at the server, if you want a certificate.
- **Ports 80 and 443** reachable. Nothing else needs to be public — in
  particular the application port and PostgreSQL should stay on loopback.
- **`APP_ORIGIN`**, the exact address browsers will use. This is the setting
  people get wrong most often; see [Origins and cookies](#origins-and-cookies).

---

## Path A — Docker Compose

```bash
git clone <your-repository> repoggits && cd repoggits
cp deploy/docker.env.example .env
chmod 600 .env
```

Edit `.env`: set `POSTGRES_PASSWORD` to a long random value
(`openssl rand -base64 32`), set `APP_ORIGIN` to your public address, and set
`APP_DOMAIN` to the bare hostname if you plan to use the bundled proxy.

**With the bundled Caddy proxy** — obtains and renews certificates on its own:

```bash
docker compose --profile tls up -d --build
```

**With your own reverse proxy** — the application is published on
`127.0.0.1:3000` only:

```bash
docker compose up -d --build
```

Create the first Super Admin, then read the private invitation link:

```bash
docker compose exec app npm run db:setup -- you@your-domain.edu
docker compose exec app cat .local/admin-invitation.txt
```

Open that link within 24 hours and choose a password. Nothing else creates an
administrator: there are no default credentials and no public setup endpoint.

The schema is created automatically on first use, so `db:setup` is needed only
for that first account.

### Everyday commands

```bash
docker compose logs -f app          # follow application logs
docker compose ps                   # health status of each service
docker compose restart app          # apply changed .env values
docker compose down                 # stop; named volumes are kept
```

### Upgrading

```bash
git pull
docker compose up -d --build
```

The database container is untouched by a rebuild. Schema changes are applied by
the application when it starts.

### Notes on the compose file

- `db` publishes no ports. Only the application container can reach PostgreSQL,
  over the private compose network, which is why `DATABASE_SSL=disable` is set
  for it.
- `DATABASE_URL` is composed in `docker-compose.yml` from `POSTGRES_*`, so the
  password is written in one place.
- `app-local` keeps `.local/` (administrator invitations, outbox dumps) across
  container replacements.
- The image contains the full source tree on purpose, because **Admin →
  Backups** builds its ZIP from the running deployment.

---

## Path B — Native install

### Scripted

From a checkout on the server:

```bash
sudo APP_ORIGIN=https://projects.your-domain.edu bash deploy/install-vps.sh
```

On Debian or Ubuntu this installs Node.js 24, PostgreSQL and nginx, creates a
`repoggits` service account and database with a generated password, copies the
application to `/opt/repoggits`, writes a private `.env.local`, builds, and
enables a systemd service on `127.0.0.1:3000`. It prints the remaining steps —
certificate, firewall, first administrator — when it finishes.

Running it again changes nothing that already exists: no password is reset and
no environment file is overwritten.

### By hand

```bash
sudo useradd --system --create-home --home-dir /var/lib/repoggits \
     --shell /usr/sbin/nologin repoggits
sudo install -d -o repoggits -g repoggits /opt/repoggits
# copy the source into /opt/repoggits, then:

sudo -u postgres psql -c "CREATE ROLE repoggits LOGIN PASSWORD 'a-long-random-password'"
sudo -u postgres createdb -O repoggits repoggits
```

Write `/opt/repoggits/.env.local`, owned by `repoggits` with mode `600`:

```dotenv
DATABASE_URL=postgresql://repoggits:a-long-random-password@127.0.0.1:5432/repoggits
DATABASE_SSL=disable
APP_ORIGIN=https://projects.your-domain.edu
PORT=3000
MAIL_MODE=outbox
EMAIL_VERIFICATION_REQUIRED=false
```

Build and start:

```bash
cd /opt/repoggits
sudo -u repoggits npm ci
sudo -u repoggits npm run db:setup
sudo -u repoggits npm run build

sudo cp deploy/repoggits.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now repoggits
curl -fsS http://127.0.0.1:3000/api/health
```

The unit binds to `127.0.0.1` and sandboxes the process: writes are limited to
`.next` and `.local`, and `ProtectHome=true` means the installation must live
outside `/home`.

### Reverse proxy and certificate

```bash
DOMAIN=projects.your-domain.edu          # your hostname

sudo cp /opt/repoggits/deploy/nginx.conf /etc/nginx/sites-available/repoggits
sudo sed -i "s/projects.your-domain.edu/$DOMAIN/g" /etc/nginx/sites-available/repoggits
sudo ln -sf /etc/nginx/sites-available/repoggits /etc/nginx/sites-enabled/repoggits
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d "$DOMAIN"
sudo nginx -t && sudo systemctl reload nginx
```

The supplied configuration raises the body limit to 24 MB (the application
itself refuses anything over 20 MB), disables proxy buffering so streamed
responses are not held back, and allows long-running requests for source ZIP
generation.

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Do not open 3000 or 5432.

### First administrator

```bash
sudo -u repoggits bash -c 'cd /opt/repoggits && npm run db:setup -- you@your-domain.edu'
sudo cat /opt/repoggits/.local/admin-invitation.txt
```

### Upgrading

```bash
cd /opt/repoggits
sudo -u repoggits git pull
sudo -u repoggits npm ci
sudo -u repoggits npm run build
sudo systemctl restart repoggits
```

---

## Configuration reference

Settings come from `.env.local` (native) or `.env` and `docker-compose.yml`
(Docker). Values already present in the process environment win over the file,
so define each one in a single place. **Restart after any change** — nothing is
re-read while the server runs.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Required. |
| `DATABASE_SSL` | `disable`, `no-verify`, `require`, `verify-ca`, `verify-full`. Defaults to verification for a remote host and to `disable` for localhost. |
| `DATABASE_CA_CERT_FILE` | Path to a private certificate authority, for a self-hosted server presenting its own certificate. `DATABASE_CA_CERT` takes the same PEM inline. |
| `DATABASE_POOL_MAX` | Connections held by this process. Default 5. |
| `APP_ORIGIN` | Exact public browser origin. Required in production. |
| `PORT` | Port the Node process listens on. Default 3000. |
| `MAIL_MODE` | `outbox` stores messages unsent; `smtp` delivers them. |
| `SMTP_*`, `MAIL_FROM` | Delivery credentials when `MAIL_MODE=smtp`. |
| `DOWNLOAD_SECRET` | Signing key for expiring download links. Generated and stored in the database when blank. |
| `EMAIL_VERIFICATION_REQUIRED` | `true` restores the email verification gate. |

### Origins and cookies

`APP_ORIGIN` must match the browser's address exactly — scheme, hostname, and
port, with no path and no trailing slash. Two things depend on it:

- State-changing requests are rejected when the `Origin` header disagrees. A
  mismatch shows as *"This request did not come from the application."*
- Session cookies are marked `Secure` only when it starts with `https`.

So `https://projects.your-domain.edu` and `http://projects.your-domain.edu` are
different values, and neither matches `https://projects.your-domain.edu/`.
Behind a proxy, use the public address, not `http://127.0.0.1:3000`.

### Database TLS

A database on the same host is reached over loopback and needs no TLS, which is
why `DATABASE_SSL=disable` appears in the examples above. A managed database
reached across a network is verified: `require` here means *encrypted and
verified*, which is stricter than libpq's meaning of the same word. Point
`DATABASE_CA_CERT_FILE` at your own certificate authority if the server presents
a private certificate, and reserve `no-verify` for a private network where you
cannot.

### Email

`outbox` mode stores password resets and review notifications in the database
without sending them, which leaves people unable to reset their own passwords.
For anything beyond a trial, set `MAIL_MODE=smtp` with working credentials.
`npm run mail:send` retries anything already queued; run one delivery worker at
a time.

---

## Backups

Two separate things need backing up, and only one of them is covered by the
in-app export.

**The database** holds accounts, projects, reviews, and every uploaded image and
source archive. Nothing else does.

```bash
sudo install -d -o repoggits -g repoggits -m 0700 /var/backups/repoggits
sudo cp deploy/repoggits-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now repoggits-backup.timer
```

Under Docker, dump from the database container instead:

```bash
docker compose exec -T db pg_dump --format=custom --no-owner \
  --schema=repoggits -U repoggits repoggits > repoggits-$(date -u +%F).dump
```

Restore into an empty database with:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" <file>
```

Copy dumps off the server. A backup that only exists on the machine it protects
is not a backup.

**The website source** is what **Admin → Backups** produces: a ZIP of the source
tree honouring `.gitignore`, excluding dependencies, build output, Git metadata,
private environment files, and private keys. It contains no database records and
no uploaded files. It needs the full source tree present on the server, which is
why both deployment paths keep it.

---

## Operating notes

### Health

`GET /api/health` returns `200` with `{"status":"ok"}` when the database
answers, and `503` otherwise. It reports reachability only — no version and no
error text. The Docker image, the compose Caddy profile, and the nginx
instructions all use it.

### Logs

```bash
journalctl -u repoggits -f      # native
docker compose logs -f app      # Docker
```

### Resource use

Image validation decodes and re-encodes uploads, and ZIP inspection expands up
to 100 MB in memory, so peaks are driven by uploads rather than page traffic.
`DATABASE_POOL_MAX` defaults to 5 connections; raise it only alongside the
server's `max_connections`.

Discovery lists cap at 500 projects and administration at 1,000 versions.
Cursor pagination is needed before growing much beyond that.

### Scaling out

The design assumes one application instance. Running several behind a load
balancer would additionally need a shared Next.js cache handler and a fixed
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` across instances.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| *"This request did not come from the application."* | `APP_ORIGIN` does not match the browser's address. Correct it and restart. |
| Signed out immediately after signing in over HTTP | Session cookies are `Secure` when `APP_ORIGIN` starts with `https`, and a browser will not return them over plain HTTP. Serve HTTPS, or use an `http://` origin while testing. |
| `db:setup` fails with a TLS error | A local PostgreSQL server does not offer TLS. Set `DATABASE_SSL=disable`. |
| `db:setup` fails with `self-signed certificate` | Point `DATABASE_CA_CERT_FILE` at the issuing authority, or use `DATABASE_SSL=no-verify` on a private network. |
| `413` on upload | Raise the proxy's body limit. The supplied nginx and Caddy configurations already allow 24 MB. |
| Uploads fail just under 20 MB | Multipart overhead pushes the request past the proxy limit before the application sees it. |
| Health check reports `503` | The database is unreachable. Check `DATABASE_URL`, that PostgreSQL is running, and firewall rules. |
| *"The website source is not available in this deployment."* | Admin → Backups needs the source tree next to the running server. |
| Password reset emails never arrive | `MAIL_MODE=outbox` stores them without sending. Configure SMTP. |
| Build killed on a small server | `next build` needs roughly 2 GB. Add swap, or build elsewhere and copy `.next`. |
| CampusFlow sample's demo video/live link points at `localhost` | It was seeded (`npm run db:sample`) before `APP_ORIGIN` was set to the real address — e.g. seeded locally first, then the same database pointed at this server. Set `APP_ORIGIN` correctly and run `npm run db:sample` again; it repairs those two links in place without touching stars, comments, or anything else on the sample. |

---

[Operations guide](OPERATIONS.md) · [Environment template](../.env.example) ·
[Docker template](../deploy/docker.env.example)
