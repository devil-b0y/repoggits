import { readFileSync } from 'node:fs';
import { Pool, type ClientBase, type PoolClient, type QueryResultRow } from 'pg';
import { assertEncryptionKey } from './encryption';

const globalDb = globalThis as unknown as { repoPool?:Pool; repoMigration?:Promise<void> };
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
    globalDb.repoPool = new Pool({ ...connectionConfig(process.env.DATABASE_URL), max, idleTimeoutMillis:10000, connectionTimeoutMillis:15000, statement_timeout:15000 });
    globalDb.repoPool.on('error', () => console.error('Database connection interrupted.'));
  }
  return globalDb.repoPool;
}
const qualify = (value:string, schema:string) => value.replace(/\br\./g, `"${schema}".`);
const sql = (value:string) => qualify(value, schemaName());
export type Db = { query: <T extends QueryResultRow = QueryResultRow>(statement:string, values?:unknown[]) => Promise<T[]> };
const clientDb = (client:PoolClient):Db => ({ query:async <T extends QueryResultRow>(statement:string,values:unknown[]=[]) => (await client.query<T>(sql(statement),values)).rows });
export const db:Db = {query:async <T extends QueryResultRow>(statement:string, values:unknown[]=[]) => {await migrate();return (await pool().query<T>(sql(statement),values)).rows;}};
export async function transaction<T>(fn:(client:Db)=>Promise<T>) {
  await migrate();const client=await pool().connect();
  try {await client.query('BEGIN');const result=await fn(clientDb(client));await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function migrate() {
  // Refuse to touch the database at all rather than store private data unencrypted.
  assertEncryptionKey();
  if (!globalDb.repoMigration) globalDb.repoMigration = (async()=>{
    const client=await pool().connect();
    try{
      await client.query('BEGIN');
      await applySchema(client);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');globalDb.repoMigration=undefined;throw error;}finally{client.release();}
  })();
  return globalDb.repoMigration;
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
        CREATE TABLE IF NOT EXISTS r.settings (key text PRIMARY KEY,value jsonb NOT NULL);
        INSERT INTO r.settings(key,value) VALUES ('ai','{"enabled":true,"hourlyLimit":10,"dailyLimit":40,"siteDailyLimit":300}'),('moderation','{"requiredApprovals":1,"allowedEmailDomains":[]}'),('categories','{"departments":["Computer Science","Electronics & Communication","Mechanical Engineering","Electrical Engineering"],"subjects":["Final Year Project","Mini Project","Research"],"tags":["Next.js","Python","Arduino","IoT","Robotics"]}') ON CONFLICT DO NOTHING;
      `, schema));
}
