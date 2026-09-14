import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { db, migrate } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { emailIndex, isSealedBytes, isSealedText, openBytes, openProfile, openText, sealBytes, sealText } from '../lib/encryption';
import { encryptExistingData } from '../scripts/encryption-backfill';

const headers = { origin:process.env.APP_ORIGIN! };
const image = () => sharp({ create:{ width:8, height:8, channels:3, background:'#3059b5' } }).png().toBuffer();

test.beforeAll(async () => { await migrate(); });

test('sealed values round-trip, change on every write, and reject tampering', () => {
  const first = sealText('ada@example.test', 'users.email'), second = sealText('ada@example.test', 'users.email');
  expect(first).not.toBe(second);
  expect(first).not.toContain('ada');
  expect(openText(first, 'users.email')).toBe('ada@example.test');
  expect(() => openText(first, 'outbox.recipient')).toThrow();
  const bytes = Buffer.from(first.slice('enc:v1:'.length), 'base64');
  bytes[bytes.length-1] ^= 1;
  expect(() => openText(`enc:v1:${bytes.toString('base64')}`, 'users.email')).toThrow();
  expect(openText('plain@example.test', 'users.email')).toBe('plain@example.test');

  const file = Buffer.from('source bytes'), sealed = sealBytes(file, 'files.content');
  expect(isSealedBytes(sealed)).toBe(true);
  expect(sealed.includes(file)).toBe(false);
  expect(openBytes(sealed, 'files.content').equals(file)).toBe(true);
  expect(openBytes(file, 'files.content').equals(file)).toBe(true);

  expect(emailIndex(' Ada@Example.test')).toBe(emailIndex('ada@example.test'));
  expect(emailIndex('ada@example.test')).toMatch(/^[a-f0-9]{64}$/);
});

test('nothing can be encrypted or read without a key', () => {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', "const m = await import('./lib/encryption.ts'); m.sealText('x', 'test');"], { cwd:process.cwd(), env:{ ...process.env, DATA_ENCRYPTION_KEY:'' }, encoding:'utf8' });
  expect(run.status).not.toBe(0);
  expect(run.stderr).toContain('DATA_ENCRYPTION_KEY is not configured');
});

test('accounts, profiles, mail, uploads, and rate limits are stored encrypted but work normally', async ({ playwright }) => {
  const email = `cipher-${randomUUID()}@example.test`, password = 'a long passphrase for encryption checks';
  const client = await playwright.request.newContext({ baseURL:headers.origin, extraHTTPHeaders:headers });
  expect((await client.post('/api/auth/register', { data:{ name:'Cipher Maker', email, password } })).status()).toBe(202);
  const [account] = await db.query('SELECT id,email,profile FROM r.users WHERE email_hash=$1', [emailIndex(email)]);
  expect(isSealedText(account.email)).toBe(true);
  expect(JSON.stringify(account)).not.toContain(email);
  expect((await client.post('/api/auth/login', { data:{ email, password } })).status()).toBe(200);
  expect((await (await client.get('/api/auth/me')).json()).user.email).toBe(email);

  const details = { name:'Cipher Maker', rollNumber:'22CS042', department:'Computer Science', batch:'2022–2026', bio:'Quiet robot plans', github:'https://github.com/cipher-maker', linkedin:'', avatarId:'' };
  expect((await client.patch('/api/auth/profile', { data:details })).status()).toBe(200);
  const [{ profile }] = await db.query('SELECT profile FROM r.users WHERE id=$1', [account.id]);
  expect(JSON.stringify(profile)).not.toMatch(/22CS042|Quiet robot plans|cipher-maker|Computer Science/);
  expect(profile.name).toBe('Cipher Maker');
  expect(openProfile(profile)).toMatchObject({ rollNumber:'22CS042', bio:'Quiet robot plans' });
  expect((await (await client.get('/api/auth/me')).json()).user.profile).toMatchObject({ department:'Computer Science', github:'https://github.com/cipher-maker' });

  expect((await client.post('/api/auth/forgot', { data:{ email } })).status()).toBe(200);
  const [mail] = await db.query('SELECT recipient,subject,body FROM r.outbox WHERE recipient_hash=$1', [emailIndex(email)]);
  expect([mail.recipient, mail.subject, mail.body].every(isSealedText)).toBe(true);
  expect(openText(mail.body, 'outbox.body')).toMatch(/token=[a-f0-9]{64}/);
  expect(await db.query('SELECT key FROM r.rate_limits WHERE key LIKE $1', [`%${email}%`])).toHaveLength(0);

  const uploaded = await (await client.post('/api/upload', { headers:{ 'Content-Type':'application/octet-stream', 'X-Filename':'private-portrait.png' }, data:await image() })).json();
  const [file] = await db.query('SELECT filename,content FROM r.files WHERE id=$1', [uploaded.id]);
  expect(isSealedBytes(file.content)).toBe(true);
  expect(file.filename).not.toContain('private-portrait');
  const served = await client.get(`/api/files/${uploaded.id}`);
  expect(served.status()).toBe(200);
  expect(served.headers()['content-disposition']).toContain('private-portrait.webp');
  const body = await served.body();
  expect(body.equals(openBytes(file.content, 'files.content'))).toBe(true);
  expect((await sharp(body).metadata()).format).toBe('webp');
  await client.dispose();
});

test('db:encrypt converts rows stored before encryption, and they keep working', async ({ playwright }) => {
  const id = randomUUID(), fileId = randomUUID(), email = `legacy-${id}@example.test`, password = 'a long passphrase for legacy rows';
  const picture = await sharp(await image()).webp().toBuffer();
  await db.query("INSERT INTO r.users(id,email,password_hash,name,verified,profile) VALUES($1,$2,$3,'Legacy Maker',true,$4)", [id, email, await hashPassword(password), JSON.stringify({ name:'Legacy Maker', bio:'Written before encryption' })]);
  await db.query("INSERT INTO r.files(id,owner_id,filename,mime,size,content,scan_status) VALUES($1,$2,'legacy.webp','image/webp',$3,$4,'validated_internal')", [fileId, id, picture.length, picture]);
  await db.query("INSERT INTO r.outbox(id,recipient,subject,body) VALUES($1,$2,'Legacy subject','Legacy body')", [randomUUID(), email]);
  await db.query("INSERT INTO r.rate_limits(key,count,expires_at) VALUES($1,1,now()+interval '1 hour')", [`login:${email}`]);
  const client = await playwright.request.newContext({ baseURL:headers.origin, extraHTTPHeaders:headers });
  expect((await client.post('/api/auth/login', { data:{ email, password } })).status()).toBe(200);

  const converted = await encryptExistingData();
  for (const count of [converted.users, converted.outbox, converted.files, converted.rateLimits]) expect(count).toBeGreaterThanOrEqual(1);
  const [user] = await db.query('SELECT email,email_hash,profile FROM r.users WHERE id=$1', [id]);
  expect(isSealedText(user.email)).toBe(true);
  expect(user.email_hash).toBe(emailIndex(email));
  expect(JSON.stringify(user.profile)).not.toContain('Written before encryption');
  expect(openProfile(user.profile)).toMatchObject({ name:'Legacy Maker', bio:'Written before encryption' });
  const [file] = await db.query('SELECT filename,content FROM r.files WHERE id=$1', [fileId]);
  expect(isSealedBytes(file.content)).toBe(true);
  expect(openText(file.filename, 'files.filename')).toBe('legacy.webp');
  const [mail] = await db.query('SELECT subject,body FROM r.outbox WHERE recipient_hash=$1', [emailIndex(email)]);
  expect(openText(mail.subject, 'outbox.subject')).toBe('Legacy subject');
  expect(openText(mail.body, 'outbox.body')).toBe('Legacy body');
  expect(await db.query("SELECT key FROM r.rate_limits WHERE key LIKE '%@%'")).toHaveLength(0);

  expect((await client.post('/api/auth/login', { data:{ email, password } })).status()).toBe(200);
  expect((await (await client.get(`/api/files/${fileId}`)).body()).equals(picture)).toBe(true);
  expect(await encryptExistingData()).toMatchObject({ users:0, outbox:0, files:0 });
  await client.dispose();
});
