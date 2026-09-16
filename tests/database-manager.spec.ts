import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { db, freezeWrites, migrate, unfreezeWrites, writesFrozen } from '../lib/db';

// The database registry and the write freeze, both exercised directly (no browser, no admin API) so a failure here
// points straight at lib/database/registry.ts or lib/db.ts's freeze rather than through a page and a mocked route.
//
// The registry writes to a real file, so this redirects it to a scratch path scoped to this test run — never the
// project's own .data/databases.json, which is real configuration and must not gain a stray "test-mysql-…" entry
// every time the suite runs. Set before calling any registry function; registryFile()/secretsFile() both read the
// environment on every call, so this is safe however Node happens to have resolved the module graph.
const scratch = `.data/test-registry-${process.pid}-${randomUUID().slice(0, 8)}`;
process.env.DATABASE_REGISTRY_FILE = `${scratch}/databases.json`;
process.env.DATABASE_SECRETS_FILE = `${scratch}/secrets.json`;

import { BOOTSTRAP_ID, activeId, addDatabase, getDatabase, listDatabases, removeDatabase, setRole, updateDatabase } from '../lib/database/registry';

test.beforeAll(async () => { await migrate(); });
test.afterAll(() => { try { rmSync(scratch, { recursive: true, force: true }); } catch { /* best-effort cleanup of the scratch registry */ } });

test('the bootstrap connection always exists, is active by default, and cannot be removed or disabled', async () => {
  const list = await listDatabases();
  const bootstrap = list.find(record => record.id === BOOTSTRAP_ID);
  expect(bootstrap).toBeTruthy();
  expect(bootstrap?.bootstrap).toBe(true);
  expect(bootstrap?.role).toBe('active');
  expect(bootstrap?.secretRef).toBe('env:DATABASE_URL');

  await expect(removeDatabase(BOOTSTRAP_ID)).rejects.toThrow('cannot be removed');
  await expect(updateDatabase(BOOTSTRAP_ID, { enabled: false })).rejects.toThrow('cannot be disabled');
  await expect(setRole(BOOTSTRAP_ID, 'disabled')).rejects.toThrow('cannot be disabled');
});

test('a stored password is sealed behind a vault: reference and is never present in any registry read', async () => {
  const secret = 'S3cretHostingerPassw0rd!';
  const record = await addDatabase({ name: 'cPanel MySQL', provider: 'mysql', host: 'sql.example.com', port: 3306, database: 'cpaneluser_repoggits', username: 'cpaneluser', schema: 'cpaneluser_repoggits', ssl: 'no-verify', password: secret });
  expect(record.secretRef).toBe(`vault:${record.id}`);
  expect(JSON.stringify(record)).not.toContain(secret);

  // Round-tripping through every read path never reintroduces the plain password, and 'password' is not a field
  // DatabaseRecord even has — this is belt-and-braces against a future field ever leaking it back in.
  for (const value of [await getDatabase(record.id), (await listDatabases()).find(entry => entry.id === record.id)]) {
    expect(JSON.stringify(value)).not.toContain(secret);
    expect(value).not.toHaveProperty('password');
  }

  // Editing without a password keeps the existing secret; supplying a new one reseals it under the same id.
  const untouched = await updateDatabase(record.id, { name: 'cPanel MySQL (renamed)' });
  expect(untouched.secretRef).toBe(`vault:${record.id}`);
  const resealed = await updateDatabase(record.id, { password: 'a different password' });
  expect(resealed.secretRef).toBe(`vault:${record.id}`);
  expect(JSON.stringify(resealed)).not.toContain('a different password');

  await removeDatabase(record.id);
});

test('exactly one database is ever active, and switching demotes the previous one to standby', async () => {
  const record = await addDatabase({ name: 'VPS PostgreSQL', provider: 'postgres', host: 'vps.example.com', port: 5432, database: 'repoggits', username: 'repoggits', schema: 'repoggits', ssl: 'require', password: 'x' });
  await setRole(record.id, 'active');
  const afterFirstSwitch = await listDatabases();
  expect(afterFirstSwitch.filter(entry => entry.role === 'active')).toHaveLength(1);
  expect(afterFirstSwitch.find(entry => entry.id === record.id)?.role).toBe('active');
  expect(afterFirstSwitch.find(entry => entry.id === BOOTSTRAP_ID)?.role).toBe('standby');

  await expect(removeDatabase(record.id)).rejects.toThrow(); // the active database cannot be removed out from under itself

  await setRole(BOOTSTRAP_ID, 'active');
  const afterSecondSwitch = await listDatabases();
  expect(afterSecondSwitch.filter(entry => entry.role === 'active')).toHaveLength(1);
  expect(afterSecondSwitch.find(entry => entry.id === BOOTSTRAP_ID)?.role).toBe('active');
  expect(afterSecondSwitch.find(entry => entry.id === record.id)?.role).toBe('standby');

  await removeDatabase(record.id);
});

test('a disabled database can never become active, and a database that was active when disabled falls back to the bootstrap', async () => {
  const record = await addDatabase({ name: 'Disabled target', provider: 'postgres', host: 'x', port: 5432, database: 'x', username: 'x', schema: 'x', ssl: 'require', password: 'x' });
  await updateDatabase(record.id, { enabled: false });
  await expect(setRole(record.id, 'active')).rejects.toThrow('Enable this connection');

  await updateDatabase(record.id, { enabled: true });
  await setRole(record.id, 'active');
  expect(await activeId()).toBe(record.id);
  await updateDatabase(record.id, { enabled: false });
  const list = await listDatabases();
  expect(list.find(entry => entry.id === record.id)?.role).toBe('disabled');
  expect(list.find(entry => entry.id === BOOTSTRAP_ID)?.role).toBe('active'); // nothing is left with no active database
  expect(await activeId()).toBe(BOOTSTRAP_ID);

  await removeDatabase(record.id);
});

test('writes queue during a freeze and land once it lifts; reads are never held back', async () => {
  const key = `freeze-test-${randomUUID()}`;
  expect(writesFrozen()).toBe(false);

  freezeWrites();
  expect(writesFrozen()).toBe(true);

  // A read must never wait on the freeze — only a write does.
  const readDuringFreeze = await Promise.race([
    db.query('SELECT 1 AS ok'),
    new Promise(resolve => setTimeout(() => resolve('timed-out'), 500)),
  ]);
  expect(readDuringFreeze).not.toBe('timed-out');

  // The write is issued while frozen and must not resolve until the freeze lifts.
  let written = false;
  const pendingWrite = db.query("INSERT INTO r.rate_limits(key,count,expires_at) VALUES($1,1,now()+interval '1 minute')", [key]).then(() => { written = true; });
  await new Promise(resolve => setTimeout(resolve, 300));
  expect(written).toBe(false);

  unfreezeWrites();
  await pendingWrite;
  expect(written).toBe(true);
  expect(writesFrozen()).toBe(false);

  const [row] = await db.query<{ count: number }>('SELECT count FROM r.rate_limits WHERE key=$1', [key]);
  expect(row?.count).toBe(1);
  await db.query('DELETE FROM r.rate_limits WHERE key=$1', [key]);
});

test('a write held past the freeze watchdog fails clearly rather than hanging forever', async () => {
  test.setTimeout(45000);
  const key = `freeze-timeout-${randomUUID()}`;
  freezeWrites();
  try {
    // FREEZE_WAIT_MS in lib/db.ts is 10s; this proves the promise actually settles instead of hanging indefinitely,
    // without asserting the exact wording of the message (that belongs to lib/db.ts's own concerns, not this test's).
    await expect(db.query("INSERT INTO r.rate_limits(key,count,expires_at) VALUES($1,1,now())", [key])).rejects.toThrow(/read-only|try again/i);
  } finally {
    unfreezeWrites();
  }
  // The row must genuinely not have been written — the rejection is not merely a slow success reported late.
  expect(await db.query('SELECT 1 FROM r.rate_limits WHERE key=$1', [key])).toHaveLength(0);
});
