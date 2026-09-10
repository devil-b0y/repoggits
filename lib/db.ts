import { readFileSync } from 'node:fs';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

const globalDb = globalThis as unknown as { repoPool?:Pool; repoMigration?:Promise<void> };
export function schemaName() {
  const schema = process.env.REPOGGITS_DB_SCHEMA || 'repoggits';
  if (!/^repoggits(?:_[a-z0-9_]+)?$/.test(schema)) throw new Error('Invalid application database schema.');
  return schema;
}
const sslModes = ['disable','no-verify','require','verify-ca','verify-full'];
// A database reached over a network is verified by default; a PostgreSQL server on the same host
// (the usual VPS layout) speaks plain TCP or a local socket and opts out unless told otherwise.
export function databaseSsl(url:URL) {
  const localServer = /^(?:localhost|127(?:\.\d+){1,3}|\[?::1\]?|)$/.test(url.hostname);
  const mode = (process.env.DATABASE_SSL || url.searchParams.get('sslmode') || (localServer?'disable':'require')).toLowerCase();
  if (!sslModes.includes(mode)) throw new Error(`DATABASE_SSL must be one of: ${sslModes.join(', ')}.`);
  if (mode === 'disable') return false as const;
  const caFile = process.env.DATABASE_CA_CERT_FILE;
  const ca = process.env.DATABASE_CA_CERT?.trim() || (caFile ? readFileSync(caFile,'utf8') : '');
  // 'require' keeps certificate verification on, which is stricter than libpq. 'no-verify' encrypts
  // without proving the server's identity; use it only for a private link with a self-signed certificate.
  return { rejectUnauthorized: mode !== 'no-verify', ...(ca?{ca}:{}) };
}
export function pool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  if (!globalDb.repoPool) {
    const url = new URL(process.env.DATABASE_URL);
    const ssl = databaseSsl(url);
    url.searchParams.delete('sslmode');url.searchParams.delete('channel_binding');
    const max = Number(process.env.DATABASE_POOL_MAX) || 5;
    globalDb.repoPool = new Pool({ connectionString:url.toString(), ssl, max, idleTimeoutMillis:10000, connectionTimeoutMillis:15000, statement_timeout:15000 });
    globalDb.repoPool.on('error', () => console.error('Database connection interrupted.'));
  }
  return globalDb.repoPool;
}
const sql = (value:string) => value.replace(/\br\./g, `"${schemaName()}".`);
export type Db = { query: <T extends QueryResultRow = QueryResultRow>(statement:string, values?:unknown[]) => Promise<T[]> };
const clientDb = (client:PoolClient):Db => ({ query:async <T extends QueryResultRow>(statement:string,values:unknown[]=[]) => (await client.query<T>(sql(statement),values)).rows });
export const db:Db = {query:async <T extends QueryResultRow>(statement:string, values:unknown[]=[]) => {await migrate();return (await pool().query<T>(sql(statement),values)).rows;}};
export async function transaction<T>(fn:(client:Db)=>Promise<T>) {
  await migrate();const client=await pool().connect();
  try {await client.query('BEGIN');const result=await fn(clientDb(client));await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function migrate() {
  if (!globalDb.repoMigration) globalDb.repoMigration = (async()=>{
    const client=await pool().connect();
    try{
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[schemaName()]);
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName()}"`);
      await client.query(sql(`
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
        CREATE TABLE IF NOT EXISTS r.settings (key text PRIMARY KEY,value jsonb NOT NULL);
        INSERT INTO r.settings(key,value) VALUES ('moderation','{"requiredApprovals":1,"allowedEmailDomains":[]}'),('categories','{"departments":["Computer Science","Electronics & Communication","Mechanical Engineering","Electrical Engineering"],"subjects":["Final Year Project","Mini Project","Research"],"tags":["Next.js","Python","Arduino","IoT","Robotics"]}') ON CONFLICT DO NOTHING;
      `));
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');globalDb.repoMigration=undefined;throw error;}finally{client.release();}
  })();
  return globalDb.repoMigration;
}
