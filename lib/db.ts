import { readFileSync } from 'node:fs';
import { Pool, type ClientBase, type QueryResultRow } from 'pg';
import { assertEncryptionKey } from './encryption';
import { HttpError } from './errors';
import { activeAdapter } from './database/manager';

const globalDb = globalThis as unknown as { repoPool?:Pool; repoMigrations?:Map<string,Promise<void>> };
export function checkedSchema(schema:string) {
  if (!/^repoggits(?:_[a-z0-9_]+)?$/.test(schema)) throw new Error('Invalid application database schema.');
  return schema;
}
export function schemaName() {
  return checkedSchema(process.env.REPOGGITS_DB_SCHEMA || 'repoggits');
}
const sslModes = ['disable','no-verify','require','verify-ca','verify-full'];
// A database reached over a network is verified by default; a PostgreSQL server on the same host
// (the usual VPS layout) speaks plain TCP or a local socket and opts out unless told otherwise.
// The prefix selects the variables: DATABASE_SSL for the application, TARGET_DATABASE_SSL for db:transfer.
export function databaseSsl(url:URL, prefix='DATABASE') {
  const localServer = /^(?:localhost|127(?:\.\d+){1,3}|\[?::1\]?|)$/.test(url.hostname);
  const mode = (process.env[`${prefix}_SSL`] || url.searchParams.get('sslmode') || (localServer?'disable':'require')).toLowerCase();
  if (!sslModes.includes(mode)) throw new Error(`${prefix}_SSL must be one of: ${sslModes.join(', ')}.`);
  if (mode === 'disable') return false as const;
  const caFile = process.env[`${prefix}_CA_CERT_FILE`];
  const ca = process.env[`${prefix}_CA_CERT`]?.trim() || (caFile ? readFileSync(caFile,'utf8') : '');
  // 'require' keeps certificate verification on, which is stricter than libpq. 'no-verify' encrypts
  // without proving the server's identity; use it only for a private link with a self-signed certificate.
  return { rejectUnauthorized: mode !== 'no-verify', ...(ca?{ca}:{}) };
}
export function connectionConfig(connection:string, prefix='DATABASE') {
  const url = new URL(connection);
  const ssl = databaseSsl(url, prefix);
  url.searchParams.delete('sslmode');url.searchParams.delete('channel_binding');
  return { connectionString:url.toString(), ssl };
}
export function pool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  if (!globalDb.repoPool) {
    const max = Number(process.env.DATABASE_POOL_MAX) || 5;
    // Opening a connection costs a TCP handshake, a TLS handshake and an auth round trip — seconds against a database
    // in another region. Idle connections are therefore kept for ten minutes rather than ten seconds, and TCP keepalive
    // stops a NAT or load balancer quietly dropping them in between, so a click never pays to reconnect.
    const idleTimeoutMillis = Number(process.env.DATABASE_POOL_IDLE_MS) || 600000;
    globalDb.repoPool = new Pool({ ...connectionConfig(process.env.DATABASE_URL), max, idleTimeoutMillis, keepAlive:true, keepAliveInitialDelayMillis:30000, connectionTimeoutMillis:15000, statement_timeout:15000 });
    globalDb.repoPool.on('error', () => console.error('Database connection interrupted.'));
  }
  return globalDb.repoPool;
}
// Application SQL is written against `r.`; the adapter serving the request resolves it to that database's own schema.
export const qualify = (value:string, schema:string) => value.replace(/\br\./g, `"${schema}".`);
export type Db = { query: <T extends QueryResultRow = QueryResultRow>(statement:string, values?:unknown[]) => Promise<T[]> };

// ----- Write freeze -----
// Switching database has one moment where the old database must stop accepting writes while the last rows are copied.
// Writes are held rather than refused: a save made during the switch waits and then lands, instead of failing in
// someone's face. Reads continue throughout. The wait is bounded, so a switch that never finishes leaves callers with a
// clear 503 rather than a request that hangs for ever.
const FREEZE_WAIT_MS = 10000, FREEZE_WATCHDOG_MS = 30000;
type Waiter = { resume:()=>void; timer:ReturnType<typeof setTimeout> };
const freeze = { frozen:false, waiting:new Set<Waiter>(), watchdog:undefined as ReturnType<typeof setTimeout>|undefined };
// Detecting one write too many only delays a read; missing one would let it slip past the freeze, so a CTE that hides
// an INSERT in its body counts as a write too.
const WRITE_STATEMENT = /^(?:insert|update|delete|alter|create|drop|truncate|grant|revoke|comment|merge)\b/i;
function isWrite(statement:string) {
  const body = statement.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '');
  return WRITE_STATEMENT.test(body) || (/^with\b/i.test(body) && /\b(?:insert|update|delete)\b/i.test(body));
}
export const writesFrozen = () => freeze.frozen;
export function freezeWrites() {
  if (freeze.frozen) return;
  freeze.frozen = true;
  // A switch that crashes half way must not leave the application read-only until someone restarts it.
  freeze.watchdog = setTimeout(unfreezeWrites, FREEZE_WATCHDOG_MS);
}
export function unfreezeWrites() {
  freeze.frozen = false;
  if (freeze.watchdog) clearTimeout(freeze.watchdog);
  freeze.watchdog = undefined;
  for (const waiter of freeze.waiting) { clearTimeout(waiter.timer); waiter.resume(); }
  freeze.waiting.clear();
}
function held(statement?:string) {
  if (!freeze.frozen || (statement !== undefined && !isWrite(statement))) return;
  return new Promise<void>((resolve,reject) => {
    const waiter:Waiter = { resume:resolve, timer:setTimeout(() => {
      freeze.waiting.delete(waiter);
      reject(new HttpError(503, 'The database is briefly read-only while it is being switched. Please try again in a moment.'));
    }, FREEZE_WAIT_MS) };
    freeze.waiting.add(waiter);
  });
}

export const db:Db = {query:async <T extends QueryResultRow>(statement:string, values:unknown[]=[]) => {await migrate();await held(statement);return (await activeAdapter()).query<T>(statement,values);}};
export async function transaction<T>(fn:(client:Db)=>Promise<T>) {
  // A transaction holds a connection while it runs, so it waits for the freeze to lift before it starts rather than
  // stalling half way through with a connection checked out.
  await migrate();await held();
  return (await activeAdapter()).transaction(tx => fn({query:<R extends QueryResultRow>(statement:string,values:unknown[]=[]) => tx.query<R>(statement,values)}));
}
export async function migrate() {
  // Refuse to touch the database at all rather than store private data unencrypted.
  assertEncryptionKey();
  // Once per database, not once per process: a newly activated database is built before the first query reaches it.
  const adapter = await activeAdapter();
  const applied = globalDb.repoMigrations ??= new Map();
  let running = applied.get(adapter.id);
  if (!running) applied.set(adapter.id, running = adapter.applySchema().catch(error=>{applied.delete(adapter.id);throw error;}));
  return running;
}
// The complete table layout, applied inside the caller's transaction. Every statement is idempotent,
// and npm run db:transfer builds a new database with the same function.
export async function applySchema(client:ClientBase, schema=schemaName()) {
  checkedSchema(schema);
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[schema]);
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await client.query(qualify(`
        CREATE TABLE IF NOT EXISTS r.users (
          id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text,
          name text NOT NULL, role text NOT NULL DEFAULT 'student' CHECK(role IN ('student','teacher','superadmin')),
          verified boolean NOT NULL DEFAULT false, suspended boolean NOT NULL DEFAULT false,
          scopes jsonb NOT NULL DEFAULT '[]', profile jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS r.sessions (hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES r.users(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL);
        CREATE TABLE IF NOT EXISTS r.tokens (hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES r.users(id) ON DELETE CASCADE,purpose text NOT NULL,expires_at timestamptz NOT NULL);
        -- A short OTP code offered alongside the link for 'verify' and 'reset' tokens. Hashed the
        -- same way as the link itself; code_attempts caps brute-force guesses at the 6-digit code.
        ALTER TABLE r.tokens ADD COLUMN IF NOT EXISTS code_hash text;
        ALTER TABLE r.tokens ADD COLUMN IF NOT EXISTS code_attempts integer NOT NULL DEFAULT 0;
        CREATE TABLE IF NOT EXISTS r.projects (
          id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES r.users(id),featured boolean NOT NULL DEFAULT false,
          archived boolean NOT NULL DEFAULT false,example boolean NOT NULL DEFAULT false,views integer NOT NULL DEFAULT 0,
          downloads integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS r.versions (
          id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES r.projects(id) ON DELETE CASCADE,number integer NOT NULL,
          status text NOT NULL CHECK(status IN ('draft','pending','approved','rejected','changes_requested')),
          data jsonb NOT NULL,changelog text NOT NULL,required_approvals integer NOT NULL DEFAULT 1 CHECK(required_approvals IN (1,2)),
          created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(project_id,number)
        );
        CREATE INDEX IF NOT EXISTS versions_status_idx ON r.versions(status,project_id);
        CREATE UNIQUE INDEX IF NOT EXISTS one_active_version_idx ON r.versions(project_id) WHERE status IN ('draft','pending','changes_requested');
        CREATE TABLE IF NOT EXISTS r.reviews (
          id uuid PRIMARY KEY,version_id uuid NOT NULL REFERENCES r.versions(id) ON DELETE CASCADE,admin_id uuid NOT NULL REFERENCES r.users(id),
          action text NOT NULL,reason text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(version_id,admin_id)
        );
        CREATE TABLE IF NOT EXISTS r.audit (id uuid PRIMARY KEY,actor_id uuid REFERENCES r.users(id),action text NOT NULL,target_id text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE IF NOT EXISTS r.notifications (id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES r.users(id) ON DELETE CASCADE,message text NOT NULL,project_id uuid REFERENCES r.projects(id),read boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE IF NOT EXISTS r.bookmarks (user_id uuid REFERENCES r.users(id) ON DELETE CASCADE,project_id uuid REFERENCES r.projects(id) ON DELETE CASCADE,PRIMARY KEY(user_id,project_id));
        CREATE TABLE IF NOT EXISTS r.comments (id uuid PRIMARY KEY,project_id uuid REFERENCES r.projects(id) ON DELETE CASCADE,user_id uuid REFERENCES r.users(id),body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
        ALTER TABLE r.comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES r.comments(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS comments_project_thread_idx ON r.comments(project_id,parent_id,created_at);
        ALTER TABLE r.projects ADD COLUMN IF NOT EXISTS parent_project_id uuid REFERENCES r.projects(id);
        ALTER TABLE r.projects ADD COLUMN IF NOT EXISTS parent_version_id uuid REFERENCES r.versions(id);
        CREATE INDEX IF NOT EXISTS projects_parent_idx ON r.projects(parent_project_id);
        CREATE TABLE IF NOT EXISTS r.reactions (user_id uuid NOT NULL REFERENCES r.users(id) ON DELETE CASCADE,project_id uuid NOT NULL REFERENCES r.projects(id) ON DELETE CASCADE,kind text NOT NULL CHECK(kind IN ('star','like')),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,project_id,kind));
        CREATE INDEX IF NOT EXISTS reactions_project_idx ON r.reactions(project_id,kind);
        CREATE TABLE IF NOT EXISTS r.comment_votes (user_id uuid NOT NULL REFERENCES r.users(id) ON DELETE CASCADE,comment_id uuid NOT NULL REFERENCES r.comments(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,comment_id));
        CREATE INDEX IF NOT EXISTS comment_votes_comment_idx ON r.comment_votes(comment_id);
        CREATE TABLE IF NOT EXISTS r.files (id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES r.users(id),filename text NOT NULL,mime text NOT NULL,size integer NOT NULL,content bytea NOT NULL,scan_status text NOT NULL CHECK(scan_status='clean'),created_at timestamptz NOT NULL DEFAULT now());
        DO $$ BEGIN
          IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='r.files'::regclass AND conname='files_scan_status_check' AND pg_get_constraintdef(oid) LIKE '%validated_internal%') THEN
            ALTER TABLE r.files DROP CONSTRAINT IF EXISTS files_scan_status_check;
            ALTER TABLE r.files ADD CONSTRAINT files_scan_status_check CHECK(scan_status IN ('clean','trusted_sample','validated_internal'));
          END IF;
        END $$;
        CREATE TABLE IF NOT EXISTS r.rate_limits (key text PRIMARY KEY,count integer NOT NULL,expires_at timestamptz NOT NULL);
        CREATE TABLE IF NOT EXISTS r.outbox (id uuid PRIMARY KEY,recipient text NOT NULL,subject text NOT NULL,body text NOT NULL,status text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now());
        -- Encrypted columns hold a fresh ciphertext on every write, so lookups go through these keyed hashes.
        ALTER TABLE r.users ADD COLUMN IF NOT EXISTS email_hash text;
        CREATE UNIQUE INDEX IF NOT EXISTS users_email_hash_idx ON r.users(email_hash);
        ALTER TABLE r.outbox ADD COLUMN IF NOT EXISTS recipient_hash text;
        CREATE INDEX IF NOT EXISTS outbox_recipient_hash_idx ON r.outbox(recipient_hash);
        -- Gemini assistant activity: who asked, when, and what happened. Prompts are sealed with DATA_ENCRYPTION_KEY.
        ALTER TABLE r.users ADD COLUMN IF NOT EXISTS ai_blocked boolean NOT NULL DEFAULT false;
        CREATE TABLE IF NOT EXISTS r.ai_requests (id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES r.users(id),prompt text NOT NULL,prompt_chars integer NOT NULL,status text NOT NULL CHECK(status IN ('pending','completed','blocked','failed')),reason text NOT NULL DEFAULT '',fields jsonb NOT NULL DEFAULT '[]',model text NOT NULL DEFAULT '',duration_ms integer,created_at timestamptz NOT NULL DEFAULT now());
        CREATE INDEX IF NOT EXISTS ai_requests_user_idx ON r.ai_requests(user_id,created_at DESC);
        CREATE INDEX IF NOT EXISTS ai_requests_created_idx ON r.ai_requests(created_at);
        -- Lookups made on sign-in, the workspace, moderation, and the review log.
        CREATE INDEX IF NOT EXISTS sessions_user_idx ON r.sessions(user_id);
        CREATE INDEX IF NOT EXISTS tokens_user_purpose_idx ON r.tokens(user_id,purpose);
        CREATE INDEX IF NOT EXISTS projects_owner_idx ON r.projects(owner_id);
        CREATE INDEX IF NOT EXISTS notifications_user_idx ON r.notifications(user_id,created_at DESC);
        CREATE INDEX IF NOT EXISTS bookmarks_project_idx ON r.bookmarks(project_id);
        CREATE INDEX IF NOT EXISTS audit_created_idx ON r.audit(created_at DESC);
        CREATE INDEX IF NOT EXISTS audit_target_idx ON r.audit(target_id,created_at DESC);
        CREATE INDEX IF NOT EXISTS outbox_pending_idx ON r.outbox(created_at) WHERE status='pending';
        -- Every photo request checks which versions reference the file (see fileReference in lib/projects.ts),
        -- and profile photos are found by their avatarId.
        CREATE INDEX IF NOT EXISTS versions_data_idx ON r.versions USING gin (data jsonb_path_ops);
        CREATE INDEX IF NOT EXISTS users_avatar_idx ON r.users((profile->>'avatarId'));
        CREATE TABLE IF NOT EXISTS r.settings (key text PRIMARY KEY,value jsonb NOT NULL);
        -- ===== Tracking and the admin panel: lib/tracking writes these, lib/admin reads them =====
        -- Nothing here holds a password, auth token, cookie value, query string or search text. Retention windows live in r.settings 'retention'.
        -- A browser's first-party visitor cookie, stored only as a hash, so anonymous visits are counted without fingerprinting.
        CREATE TABLE IF NOT EXISTS r.visitors (id uuid PRIMARY KEY,token_hash text UNIQUE NOT NULL,user_id uuid REFERENCES r.users(id) ON DELETE SET NULL,first_seen_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now());
        CREATE INDEX IF NOT EXISTS visitors_last_seen_idx ON r.visitors(last_seen_at);
        CREATE INDEX IF NOT EXISTS visitors_user_idx ON r.visitors(user_id);
        -- One browsing session, signed in or anonymous. Its id is the Session ID administrators see, never the cookie or its hash.
        CREATE TABLE IF NOT EXISTS r.tracked_sessions (
          id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('authenticated','anonymous')),user_id uuid REFERENCES r.users(id) ON DELETE CASCADE,
          visitor_id uuid REFERENCES r.visitors(id) ON DELETE SET NULL,started_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),
          ended_at timestamptz,end_reason text NOT NULL DEFAULT '' CHECK(end_reason IN ('','logout','expired','revoked','password_reset','inactive','signed_in')),
          ip_address text NOT NULL DEFAULT '',device_type text NOT NULL DEFAULT 'unknown' CHECK(device_type IN ('desktop','mobile','tablet','bot','unknown')),
          os text NOT NULL DEFAULT '',os_version text NOT NULL DEFAULT '',browser text NOT NULL DEFAULT '',browser_version text NOT NULL DEFAULT '',
          user_agent text NOT NULL DEFAULT '',platform text NOT NULL DEFAULT '',screen_width integer,screen_height integer,pixel_ratio real,touch boolean,
          language text NOT NULL DEFAULT '',timezone text NOT NULL DEFAULT '',network_online boolean,referrer text NOT NULL DEFAULT '',
          current_path text NOT NULL DEFAULT '',current_project_id uuid REFERENCES r.projects(id) ON DELETE SET NULL,
          CHECK(kind='anonymous' OR user_id IS NOT NULL)
        );
        CREATE INDEX IF NOT EXISTS tracked_sessions_user_idx ON r.tracked_sessions(user_id,last_seen_at DESC);
        CREATE INDEX IF NOT EXISTS tracked_sessions_last_seen_idx ON r.tracked_sessions(last_seen_at DESC);
        CREATE INDEX IF NOT EXISTS tracked_sessions_started_idx ON r.tracked_sessions(started_at DESC);
        CREATE INDEX IF NOT EXISTS tracked_sessions_visitor_idx ON r.tracked_sessions(visitor_id);
        CREATE INDEX IF NOT EXISTS tracked_sessions_ip_idx ON r.tracked_sessions(ip_address);
        ALTER TABLE r.sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
        ALTER TABLE r.sessions ADD COLUMN IF NOT EXISTS tracked_session_id uuid REFERENCES r.tracked_sessions(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS sessions_tracked_idx ON r.sessions(tracked_session_id);
        -- Every counted action, with the session, network and device it came from at that moment. Types are listed in lib/admin/types.ts.
        CREATE TABLE IF NOT EXISTS r.activity_events (
          id uuid PRIMARY KEY,event_type text NOT NULL CHECK(event_type ~ '^[A-Z][A-Z_]{2,39}$'),
          category text NOT NULL CHECK(category IN ('navigation','auth','project','community','file','ai','account','security','admin')),
          status text NOT NULL DEFAULT 'success' CHECK(status IN ('success','failure')),user_id uuid REFERENCES r.users(id) ON DELETE SET NULL,
          session_id uuid REFERENCES r.tracked_sessions(id) ON DELETE SET NULL,visitor_id uuid REFERENCES r.visitors(id) ON DELETE SET NULL,
          project_id uuid REFERENCES r.projects(id) ON DELETE SET NULL,prompt_id uuid REFERENCES r.ai_requests(id) ON DELETE SET NULL,
          page text NOT NULL DEFAULT '',ip_address text NOT NULL DEFAULT '',device_type text NOT NULL DEFAULT 'unknown',os text NOT NULL DEFAULT '',
          browser text NOT NULL DEFAULT '',user_agent text NOT NULL DEFAULT '',metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS activity_created_idx ON r.activity_events(created_at DESC);
        CREATE INDEX IF NOT EXISTS activity_type_created_idx ON r.activity_events(event_type,created_at DESC);
        CREATE INDEX IF NOT EXISTS activity_category_created_idx ON r.activity_events(category,created_at DESC);
        CREATE INDEX IF NOT EXISTS activity_user_created_idx ON r.activity_events(user_id,created_at DESC);
        CREATE INDEX IF NOT EXISTS activity_session_created_idx ON r.activity_events(session_id,created_at DESC);
        CREATE INDEX IF NOT EXISTS activity_visitor_created_idx ON r.activity_events(visitor_id,created_at DESC);
        CREATE INDEX IF NOT EXISTS activity_project_created_idx ON r.activity_events(project_id,created_at DESC);
        CREATE INDEX IF NOT EXISTS activity_ip_created_idx ON r.activity_events(ip_address,created_at DESC);
        CREATE INDEX IF NOT EXISTS activity_prompt_idx ON r.activity_events(prompt_id);
        -- Prompt log detail: where and how each Gemini request ran. outcome is the status administrators filter by.
        ALTER TABLE r.ai_requests ADD COLUMN IF NOT EXISTS feature text NOT NULL DEFAULT 'project_draft';
        ALTER TABLE r.ai_requests ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'pending' CHECK(outcome IN ('pending','success','failed','cancelled','rate_limited','timeout','refused'));
        ALTER TABLE r.ai_requests ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES r.tracked_sessions(id) ON DELETE SET NULL;
        ALTER TABLE r.ai_requests ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES r.projects(id) ON DELETE SET NULL;
        ALTER TABLE r.ai_requests ADD COLUMN IF NOT EXISTS ip_address text NOT NULL DEFAULT '';
        ALTER TABLE r.ai_requests ADD COLUMN IF NOT EXISTS device_type text NOT NULL DEFAULT 'unknown';
        ALTER TABLE r.ai_requests ADD COLUMN IF NOT EXISTS os text NOT NULL DEFAULT '';
        ALTER TABLE r.ai_requests ADD COLUMN IF NOT EXISTS browser text NOT NULL DEFAULT '';
        ALTER TABLE r.ai_requests ADD COLUMN IF NOT EXISTS prompt_tokens integer;
        ALTER TABLE r.ai_requests ADD COLUMN IF NOT EXISTS response_tokens integer;
        ALTER TABLE r.ai_requests ADD COLUMN IF NOT EXISTS total_tokens integer;
        UPDATE r.ai_requests SET outcome=CASE WHEN status='completed' THEN 'success' WHEN status='failed' THEN 'failed' WHEN reason ~* '(limit|too many)' THEN 'rate_limited' ELSE 'refused' END WHERE outcome='pending' AND status<>'pending';
        CREATE INDEX IF NOT EXISTS ai_requests_outcome_idx ON r.ai_requests(outcome,created_at DESC);
        CREATE INDEX IF NOT EXISTS ai_requests_session_idx ON r.ai_requests(session_id);
        CREATE INDEX IF NOT EXISTS ai_requests_project_idx ON r.ai_requests(project_id,created_at DESC);
        CREATE INDEX IF NOT EXISTS ai_requests_ip_idx ON r.ai_requests(ip_address);
        -- API traffic in one-minute buckets, and the server errors behind 5xx responses, for System health.
        CREATE TABLE IF NOT EXISTS r.api_usage (bucket timestamptz PRIMARY KEY,requests integer NOT NULL DEFAULT 0,client_errors integer NOT NULL DEFAULT 0,server_errors integer NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS r.error_log (id uuid PRIMARY KEY,method text NOT NULL,path text NOT NULL,status integer NOT NULL,name text NOT NULL DEFAULT '',message text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
        CREATE INDEX IF NOT EXISTS error_log_created_idx ON r.error_log(created_at DESC);
        CREATE INDEX IF NOT EXISTS users_created_idx ON r.users(created_at);
        CREATE INDEX IF NOT EXISTS projects_created_idx ON r.projects(created_at);
        INSERT INTO r.settings(key,value) VALUES ('retention','{"activityDays":90,"sessionDays":30,"securityDays":180}') ON CONFLICT DO NOTHING;
        INSERT INTO r.settings(key,value) VALUES ('ai','{"enabled":true,"hourlyLimit":10,"dailyLimit":40,"siteDailyLimit":300}'),('moderation','{"requiredApprovals":1,"allowedEmailDomains":[]}'),('categories','{"departments":["Computer Science","Electronics & Communication","Mechanical Engineering","Electrical Engineering"],"subjects":["Final Year Project","Mini Project","Research"],"tags":["Next.js","Python","Arduino","IoT","Robotics"]}') ON CONFLICT DO NOTHING;
      `, schema));
}
