import { test, expect, type APIRequestContext } from '@playwright/test';

// Run with `npm run test:otp`. Messages are actually sent over SMTP and received by testmail.app,
// so this proves what the outbox-based tests in platform.spec.ts cannot: that the email arrives,
// and that the code and link inside it really work.
const namespace = process.env.TESTMAIL_NAMESPACE;
const apikey = process.env.TESTMAIL_APIKEY;
test.skip(!namespace || !apikey || !(process.env.AZURE_COMMUNICATION_CONNECTION_STRING || process.env.SMTP_HOST), 'Set TESTMAIL_NAMESPACE, TESTMAIL_APIKEY and Azure or SMTP_* settings in .env.local to run real delivery tests.');

const headers = { origin: process.env.APP_ORIGIN! };
const inbox = (tag: string) => `${namespace}.${tag}@inbox.testmail.app`;

type Delivered = { subject: string; text: string };
// testmail.app's live query holds the request open until a matching message arrives.
async function waitForEmail(tag: string, since: number, subject: RegExp): Promise<Delivered> {
  const url = new URL('https://api.testmail.app/api/json');
  for (const [key, value] of Object.entries({ apikey: apikey!, namespace: namespace!, tag, livequery: 'true', timestamp_from: String(since) })) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  expect(response.ok, `testmail.app responded ${response.status}`).toBe(true);
  const body = await response.json() as { result: string; message?: string; emails: Delivered[] };
  expect(body.result, body.message).toBe('success');
  const match = body.emails.find(email => subject.test(email.subject));
  expect(match, `No "${subject}" message reached ${inbox(tag)}.`).toBeTruthy();
  return match!;
}
const codeIn = (email: Delivered) => email.text.match(/instead: (\d{6})/)?.[1];
const tokenIn = (email: Delivered) => email.text.match(/token=([a-f0-9]{64})/)?.[1];

async function register(request: APIRequestContext, tag: string, password: string) {
  const since = Date.now();
  const registered = await request.post('/api/auth/register', { headers, data: { name: 'Delivery Check', email: inbox(tag), password } });
  expect(registered.status()).toBe(202);
  return waitForEmail(tag, since, /Verify your Repoggits account/);
}

test('the delivered verification email carries a working code, and it consumes the link too', async ({ request }) => {
  const tag = `verify${Date.now()}`, password = 'a long enough passphrase for delivery checks';
  const email = await register(request, tag, password);
  const code = codeIn(email), token = tokenIn(email);
  expect(code, 'The email has no 6-digit code.').toMatch(/^\d{6}$/);
  expect(token, 'The email has no verification link.').toMatch(/^[a-f0-9]{64}$/);
  expect((await request.post('/api/auth/verify', { headers, data: { email: inbox(tag), code } })).status()).toBe(200);
  expect((await request.post('/api/auth/verify', { headers, data: { token } })).status()).toBe(400);
  expect((await request.post('/api/auth/login', { headers, data: { email: inbox(tag), password } })).status()).toBe(200);
  expect((await (await request.get('/api/auth/me')).json()).user.verified).toBe(true);
});

test('the delivered verification link works on its own', async ({ request }) => {
  const tag = `link${Date.now()}`;
  const token = tokenIn(await register(request, tag, 'a long enough passphrase for link checks'));
  expect((await request.post('/api/auth/verify', { headers, data: { token } })).status()).toBe(200);
});

const oneMinuteAfter = (start: number) => new Promise(resolve => setTimeout(resolve, Math.max(0, start + 61_000 - Date.now())));

test('"Send a new code" right after sign-up delivers a fresh code, at most once a minute', async ({ request }) => {
  test.setTimeout(180_000);
  const tag = `resend${Date.now()}`, password = 'a long enough passphrase for resend checks', start = Date.now();
  const first = await register(request, tag, password);
  // The page counts down a minute after sign-up before the button can be pressed.
  await oneMinuteAfter(start);
  const since = Date.now();
  expect((await request.post('/api/auth/resend', { headers, data: { email: inbox(tag) } })).status()).toBe(200);
  const second = await waitForEmail(tag, since, /Verify your Repoggits account/);
  const tooSoon = await request.post('/api/auth/resend', { headers, data: { email: inbox(tag) } });
  expect(tooSoon.status()).toBe(429);
  expect((await tooSoon.json()).error).toContain('wait a minute');
  expect((await request.post('/api/auth/verify', { headers, data: { token: tokenIn(first) } })).status()).toBe(400);
  expect((await request.post('/api/auth/verify', { headers, data: { email: inbox(tag), code: codeIn(second) } })).status()).toBe(200);
});

test('registering again before verifying delivers a fresh code and keeps the original password', async ({ request }) => {
  test.setTimeout(180_000);
  const tag = `again${Date.now()}`, password = 'a long enough passphrase for repeat sign-ups', start = Date.now();
  const first = await register(request, tag, password);
  const repeat = () => request.post('/api/auth/register', { headers, data: { name: 'Someone Else', email: inbox(tag), password: 'a different passphrase that must be ignored' } });
  // "Create account" never fails on a repeat click; inside the one-minute window it just doesn't send another code.
  expect((await repeat()).status()).toBe(202);
  await oneMinuteAfter(start);
  const since = Date.now();
  expect((await repeat()).status()).toBe(202);
  const second = await waitForEmail(tag, since, /Verify your Repoggits account/);
  // The fresh message replaces the earlier one, so the first link no longer works.
  expect((await request.post('/api/auth/verify', { headers, data: { token: tokenIn(first) } })).status()).toBe(400);
  expect((await request.post('/api/auth/verify', { headers, data: { email: inbox(tag), code: codeIn(second) } })).status()).toBe(200);
  expect((await request.post('/api/auth/login', { headers, data: { email: inbox(tag), password: 'a different passphrase that must be ignored' } })).status()).toBe(401);
  expect((await request.post('/api/auth/login', { headers, data: { email: inbox(tag), password } })).status()).toBe(200);
});

test('the delivered password-reset code sets a new password', async ({ request }) => {
  const tag = `reset${Date.now()}`, first = 'a long enough passphrase before reset', second = 'a brand new passphrase after reset';
  await register(request, tag, first);
  const since = Date.now();
  expect((await request.post('/api/auth/forgot', { headers, data: { email: inbox(tag) } })).status()).toBe(200);
  const code = codeIn(await waitForEmail(tag, since, /Reset your Repoggits password/));
  expect(code).toMatch(/^\d{6}$/);
  expect((await request.post('/api/auth/reset', { headers, data: { email: inbox(tag), code, password: second } })).status()).toBe(200);
  expect((await request.post('/api/auth/login', { headers, data: { email: inbox(tag), password: first } })).status()).toBe(401);
  expect((await request.post('/api/auth/login', { headers, data: { email: inbox(tag), password: second } })).status()).toBe(200);
});
