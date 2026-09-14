import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { db, migrate, pool, schemaName } from '../lib/db';
import { storedEmail } from '../lib/encryption';
import { transferDatabase, type TransferOptions } from '../scripts/database-transfer';

// The "new provider" is a second schema in the test database: the command treats it exactly like another server.
const source = schemaName(), target = `${source}_copy`, url = process.env.DATABASE_URL!;
const options = (mode:TransferOptions['mode'], extra:Partial<TransferOptions> = {}):TransferOptions => ({ sourceUrl:url, sourceSchema:source, targetUrl:url, targetSchema:target, mode, ...extra });
const inCopy = async (statement:string, values:unknown[] = []) => (await pool().query(statement.replace(/\bcopy\./g, `"${target}".`), values)).rows;
const ids = { owner:randomUUID(), original:randomUUID(), originalVersion:randomUUID(), fork:randomUUID(), forkVersion:randomUUID(), comment:randomUUID(), reply:randomUUID(), file:randomUUID(), setting:`transfer-test-${randomUUID()}` };
const email = `transfer-${ids.owner}@example.test`, upload = randomBytes(256 * 1024);

// Every copy makes dozens of round trips to a test database that may be far away, so allow more than the default minute.
test.describe.configure({ mode:'serial', timeout:180_000 });

test.beforeAll(async () => {
  await migrate();
  await pool().query(`DROP SCHEMA IF EXISTS "${target}" CASCADE`);
  const stored = storedEmail(email);
  await db.query("INSERT INTO r.users(id,email,email_hash,name,scopes,profile,created_at) VALUES($1,$2,$3,'Transfer Maker','[\"Computer Science\",\"Electronics\"]',$4,'2026-01-02 03:04:05.123456+00')", [ids.owner, stored.email, stored.emailHash, JSON.stringify({ name:'Transfer Maker' })]);
  await db.query('INSERT INTO r.projects(id,owner_id) VALUES($1,$2)', [ids.original, ids.owner]);
  await db.query("INSERT INTO r.versions(id,project_id,number,status,data,changelog) VALUES($1,$2,1,'draft',$3,'First build')", [ids.originalVersion, ids.original, JSON.stringify({ title:'Original build', tags:['IoT', 'Robotics'] })]);
  await db.query('INSERT INTO r.projects(id,owner_id,parent_project_id,parent_version_id) VALUES($1,$2,$3,$4)', [ids.fork, ids.owner, ids.original, ids.originalVersion]);
  await db.query("INSERT INTO r.versions(id,project_id,number,status,data,changelog) VALUES($1,$2,1,'draft',$3,'Modified build')", [ids.forkVersion, ids.fork, JSON.stringify({ title:'Modified build' })]);
  await db.query("INSERT INTO r.comments(id,project_id,user_id,body) VALUES($1,$2,$3,'How does it charge?')", [ids.comment, ids.original, ids.owner]);
  await db.query("INSERT INTO r.comments(id,project_id,user_id,body,parent_id) VALUES($1,$2,$3,'With a solar panel.',$4)", [ids.reply, ids.original, ids.owner, ids.comment]);
  await db.query("INSERT INTO r.files(id,owner_id,filename,mime,size,content,scan_status) VALUES($1,$2,'build.bin','application/octet-stream',$3,$4,'validated_internal')", [ids.file, ids.owner, upload.length, upload]);
  await db.query('INSERT INTO r.settings(key,value) VALUES($1,$2)', [ids.setting, JSON.stringify([1, 'two', { three:3 }])]);
});

test.afterAll(async () => {
  await pool().query(`DROP SCHEMA IF EXISTS "${target}" CASCADE`);
  await db.query('DELETE FROM r.settings WHERE key LIKE $1', [`${ids.setting}%`]);
  await db.query('DELETE FROM r.projects WHERE id=$1', [ids.fork]);
  await db.query('DELETE FROM r.projects WHERE id=$1', [ids.original]);
  await db.query('DELETE FROM r.files WHERE owner_id=$1', [ids.owner]);
  await db.query('DELETE FROM r.users WHERE id=$1', [ids.owner]);
});

test('a check reaches both databases and writes nothing, and a database is never copied onto itself', async () => {
  const report = await transferDatabase(options('check'));
  expect(report.target.existingRows).toBe(0);
  expect(report.source.rows.users).toBeGreaterThanOrEqual(1);
  expect(report.copied).toEqual({});
  expect((await pool().query('SELECT to_regnamespace($1) AS schema', [target])).rows[0].schema).toBeNull();
  await expect(transferDatabase(options('copy', { targetSchema:source }))).rejects.toThrow('same database and schema');
  await expect(transferDatabase(options('check', { replace:true }))).rejects.toThrow('cannot be combined');
});

test('copies every table exactly, including files, forks, threaded replies, and settings', async () => {
  const report = await transferDatabase(options('copy'));
  expect(report.copied).toEqual(report.source.rows);
  expect(report.changedDuringCopy).toEqual([]);

  const [original] = await db.query('SELECT email,email_hash,profile,created_at::text AS created FROM r.users WHERE id=$1', [ids.owner]);
  const [user] = await inCopy('SELECT email,email_hash,profile,scopes,created_at::text AS created FROM copy.users WHERE id=$1', [ids.owner]);
  expect(user).toEqual({ ...original, scopes:['Computer Science', 'Electronics'] });
  expect(user.created).toContain('.123456');
  expect(await inCopy('SELECT parent_project_id,parent_version_id FROM copy.projects WHERE id=$1', [ids.fork])).toEqual([{ parent_project_id:ids.original, parent_version_id:ids.originalVersion }]);
  expect(await inCopy('SELECT parent_id FROM copy.comments WHERE id=$1', [ids.reply])).toEqual([{ parent_id:ids.comment }]);
  expect((await inCopy('SELECT data FROM copy.versions WHERE id=$1', [ids.originalVersion]))[0].data.tags).toEqual(['IoT', 'Robotics']);
  expect((await inCopy('SELECT value FROM copy.settings WHERE key=$1', [ids.setting]))[0].value).toEqual([1, 'two', { three:3 }]);
  const [file] = await inCopy('SELECT content FROM copy.files WHERE id=$1', [ids.file]);
  expect(Buffer.compare(file.content, upload)).toBe(0);

  // The application itself runs against the copy: its schema check is a no-op and the encrypted address still opens.
  const app = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    `const { db, pool } = await import('./lib/db.ts'); const { openText } = await import('./lib/encryption.ts');
     const [row] = await db.query('SELECT email FROM r.users WHERE id=$1', ['${ids.owner}']);
     console.log(openText(row.email, 'users.email')); await pool().end();`,
  ], { env:{ ...process.env, REPOGGITS_DB_SCHEMA:target }, encoding:'utf8' });
  expect(app.status, app.stderr).toBe(0);
  expect(app.stdout.trim()).toBe(email);
});

test('refuses to overwrite a filled target unless asked, then replaces it with the latest data', async () => {
  const settingsBefore = await inCopy('SELECT key FROM copy.settings ORDER BY key');
  await expect(transferDatabase(options('copy'))).rejects.toThrow('--replace');
  expect(await inCopy('SELECT key FROM copy.settings ORDER BY key')).toEqual(settingsBefore);

  await db.query('INSERT INTO r.settings(key,value) VALUES($1,$2)', [`${ids.setting}-later`, JSON.stringify('added later')]);
  const report = await transferDatabase(options('copy', { replace:true }));
  expect(report.copied).toEqual(report.source.rows);
  expect(await inCopy('SELECT value FROM copy.settings WHERE key=$1', [`${ids.setting}-later`])).toEqual([{ value:'added later' }]);
  expect(await inCopy('SELECT count(*)::int AS files FROM copy.files WHERE id=$1', [ids.file])).toEqual([{ files:1 }]);
});

test('npm run db:transfer checks without writing, never prints credentials, and explains its settings', async () => {
  const run = (flags:string[], env:Record<string,string>) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/transfer-database.ts', ...flags], { env:{ ...process.env, ...env }, encoding:'utf8' });
  const check = run(['--check'], { TARGET_DATABASE_URL:url, TARGET_DATABASE_SCHEMA:target });
  expect(check.status, check.stderr).toBe(0);
  expect(check.stdout).toContain('already holds');
  expect(check.stdout).toContain('Nothing was written');
  const password = decodeURIComponent(new URL(url).password);
  if (password) expect(check.stdout + check.stderr).not.toContain(password);

  const missing = run([], { TARGET_DATABASE_URL:'' });
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain('Set TARGET_DATABASE_URL');
  const typo = run(['--force'], { TARGET_DATABASE_URL:url, TARGET_DATABASE_SCHEMA:target });
  expect(typo.status).toBe(1);
  expect(typo.stderr).toContain('Unknown option: --force');
});

test('stops before writing when the source holds a table this version does not create', async () => {
  await pool().query(`CREATE TABLE "${source}".transfer_unknown (id integer PRIMARY KEY)`);
  try {
    await expect(transferDatabase(options('check'))).rejects.toThrow('transfer_unknown');
  } finally {
    await pool().query(`DROP TABLE "${source}".transfer_unknown`);
  }
});
