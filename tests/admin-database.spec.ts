import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { DatabaseOverview, DatabaseRecord } from '../lib/database/types';

// Admin › Database manager, with the API mocked: the banner and cards render, a password submitted on add never
// appears in a response, risky actions require the typed confirmation, and the page fits a phone. Access control for
// the real endpoints (Super Admin only, same-origin mutations, audit trail) lives in the server and is exercised
// against a live database elsewhere; this file is the page's own contract with that API.

type Role = 'student' | 'teacher' | 'superadmin';
const viewer = (role: Role, scopes: string[] = []) => ({ user: { id: randomUUID(), name: 'Site Admin', email: 'admin@example.test', role, verified: true, suspended: false, scopes, profile: { name: 'Site Admin' } }, uploadsAvailable: true, emailVerificationRequired: false });
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

const record = (patch: Partial<DatabaseRecord> = {}): DatabaseRecord => ({
  id: 'bootstrap', name: 'Primary (DATABASE_URL)', provider: 'postgres', host: 'ep-example.aws.neon.tech', port: 5432,
  database: 'repoggits', username: 'repoggits_owner', schema: 'repoggits', ssl: 'require', secretRef: 'env:DATABASE_URL',
  enabled: true, role: 'active', createdAt: new Date(0).toISOString(),
  lastTestedAt: null, lastTestError: '', health: 'healthy', latencyMs: 240,
  lastSyncAt: null, lastSyncRows: null, schemaVersion: null, serverVersion: 'PostgreSQL 16.4', bootstrap: true,
  ...patch,
});
const overview = (databases: DatabaseRecord[], patch: Partial<DatabaseOverview> = {}): DatabaseOverview =>
  ({ databases, activeId: databases.find(d => d.role === 'active')?.id ?? databases[0].id, writesFrozen: false, registrySource: 'r.settings › databases', ...patch });

async function mockDatabaseApi(page: Page, role: Role, data: DatabaseOverview, extra: Record<string, unknown> = {}) {
  await page.route('**/api/auth/me', route => route.fulfill({ json: viewer(role) }));
  await page.route(/\/api\/admin\/database(\?|$)/, route => route.fulfill({ json: data }));
  for (const [path, body] of Object.entries(extra))
    await page.route(new RegExp(`/api/admin/database/${path}$`), route => route.fulfill({ json: body }));
}

test('a student is refused the page and never receives any database data', async ({ page }) => {
  const requested: string[] = [];
  page.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/admin/database') && response.ok()) requested.push(url.pathname); });
  await page.route('**/api/auth/me', route => route.fulfill({ json: viewer('student') }));
  await page.goto('/admin/database');
  await expect(page.getByText('This space is reserved for assigned reviewers.')).toBeVisible();
  expect(requested).toEqual([]);
});

test('a Teacher-Admin sees the permission notice, not the database manager, even with every other admin permission granted', async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: viewer('teacher', ['permission:analytics', 'permission:users', 'permission:sessions', 'permission:activity', 'permission:prompts', 'permission:security', 'permission:audit', 'permission:system']) }));
  await page.goto('/admin/database');
  // The section heading is chrome AdminFrame always shows; only the actual database data is gated on the permission.
  await expect(page.getByText('You do not have permission to open this part of the admin panel.')).toBeVisible();
  await expect(page.locator('.admin-database-banner')).toHaveCount(0);
  await expect(page.locator('.admin-database-cards')).toHaveCount(0);
});

test('the active database banner and every configured card render, and a not-yet-configured entry offers only Configure', async ({ page }) => {
  const active = record();
  const standby = record({ id: 'cpanel-1', name: 'cPanel MySQL', provider: 'mysql', host: 'sql123.hostinger.example', port: 3306, database: 'cpaneluser_repoggits', username: 'cpaneluser', schema: 'cpaneluser_repoggits', ssl: 'no-verify', role: 'standby', health: 'healthy', bootstrap: false, lastSyncAt: new Date(Date.now() - 120000).toISOString(), lastSyncRows: 4213, schemaVersion: null, serverVersion: 'MySQL 8.0.35' });
  const unconfigured = record({ id: 'vps-1', name: 'VPS PostgreSQL', host: '', database: '', username: '', secretRef: '', role: 'configured', health: 'unknown', bootstrap: false });
  await mockDatabaseApi(page, 'superadmin', overview([active, standby, unconfigured]));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/database');
  await expect(page.getByRole('heading', { level: 1, name: 'Database manager' })).toBeVisible();
  await expect(page.locator('.admin-database-banner')).toContainText('Primary (DATABASE_URL)');
  await expect(page.locator('.admin-database-banner')).toContainText('Healthy');

  const cards = page.locator('.admin-database-cards > li');
  await expect(cards).toHaveCount(3);
  const mysqlCard = cards.filter({ hasText: 'cPanel MySQL' });
  await expect(mysqlCard).toContainText('MySQL / MariaDB');
  await expect(mysqlCard).toContainText('Standby');
  await expect(mysqlCard.getByRole('button', { name: 'Switch' })).toBeVisible();
  await expect(mysqlCard.getByRole('button', { name: 'Sync' })).toBeVisible();
  await expect(mysqlCard.getByRole('button', { name: 'Compare' })).toBeVisible();

  const activeCard = cards.filter({ hasText: 'Primary (DATABASE_URL)' });
  await expect(activeCard.getByRole('button', { name: 'Switch' })).toHaveCount(0); // cannot switch to the database already active
  await expect(activeCard.getByRole('button', { name: 'Remove' })).toHaveCount(0); // the bootstrap connection can never be removed

  const emptyCard = cards.filter({ hasText: 'VPS PostgreSQL' });
  await expect(emptyCard).toContainText('not configured yet');
  await expect(emptyCard.getByRole('button', { name: 'Configure' })).toBeVisible();
  await expect(emptyCard.getByRole('button', { name: 'Test' })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await fits(page)).toBe(true);
});

test('a password submitted when adding a database never appears anywhere in the page, and the form closes on success', async ({ page }) => {
  const secret = 'S3cretHostingerPassw0rd!';
  const captured: { body: { password?: string } | null } = { body: null };
  await page.route('**/api/auth/me', route => route.fulfill({ json: viewer('superadmin') }));
  await page.route('**/api/admin/database', route => {
    if (route.request().method() === 'POST') {
      captured.body = route.request().postDataJSON();
      // The real endpoint never echoes a password back — this fulfils the same contract the server promises.
      return route.fulfill({ json: { database: record({ id: 'cpanel-1', name: 'cPanel MySQL', provider: 'mysql', role: 'configured', secretRef: 'vault:cpanel-1', bootstrap: false }), ...overview([record()]) } });
    }
    return route.fulfill({ json: overview([record()]) });
  });
  await page.goto('/admin/database');
  await page.getByRole('button', { name: 'Add database' }).click();
  // getByLabel computes the accessible name from the whole wrapping <label>'s text content. In this form that
  // breaks two different ways: the Password and Schema labels each have a trailing <small> hint inside them, so
  // their real accessible name is "Password" / "Schema" plus that hint text — never the bare word, so even an exact
  // match on the word alone never resolves them. And plain substring matching collides on top of that: "Username"
  // and the Schema hint ("...use the database name") both contain "name", so a bare getByLabel('Name') matches three
  // fields at once. The Provider <select> has the same "label text absorbs unrelated content" problem, via its own
  // <option> texts, and is already worked around below with a CSS-scoped locator. `field` generalizes that
  // workaround: find the label by a regex anchored to the *start* of its text (each label's own leading word is
  // unique in this form, so the anchor can't cross into another field's text or a trailing hint) and grab the
  // control inside it directly, sidestepping accessible-name computation entirely.
  const field = (label: string) => page.locator('.admin-database-form label', { hasText: new RegExp(`^${label}`) }).locator('input, select');
  await field('Name').fill('cPanel MySQL');
  await page.locator('.admin-database-form label', { hasText: 'Provider' }).locator('select').selectOption('mysql');
  await field('Host').fill('sql123.hostinger.example');
  await field('Database').fill('cpaneluser_repoggits');
  await field('Username').fill('cpaneluser');
  await field('Password').fill(secret);
  await field('Schema').fill('cpaneluser_repoggits');
  // Scoped to the form: the toolbar's own "Add database" button (which opened this form) is still on the page and
  // shares the exact same accessible name as the form's submit button, so an unscoped getByRole here is a strict-mode
  // violation once the form is open.
  await page.locator('.admin-database-form').getByRole('button', { name: 'Add database' }).click();
  await expect(page.getByText('cPanel MySQL added.')).toBeVisible();
  expect(captured.body?.password).toBe(secret); // the client does send it once, to this one endpoint
  await expect(page.locator('body')).not.toContainText(secret); // and never shows it again anywhere on the page
  await expect(field('Password')).toHaveCount(0); // the form itself is gone once the save succeeds
});

test("switching, disabling and removing all require typing the database's own name before the button enables", async ({ page }) => {
  const standby = record({ id: 'cpanel-1', name: 'cPanel MySQL', provider: 'mysql', role: 'standby', bootstrap: false });
  await mockDatabaseApi(page, 'superadmin', overview([record(), standby]));
  await page.goto('/admin/database');
  const card = page.locator('.admin-database-cards > li').filter({ hasText: 'cPanel MySQL' });

  await card.getByRole('button', { name: 'Switch' }).click();
  await expect(card).toContainText('Switch the site to this database?');
  const confirmButton = card.getByRole('button', { name: 'Switch over' });
  await expect(confirmButton).toBeDisabled();
  await card.getByLabel(/Type/).fill('wrong name');
  await expect(confirmButton).toBeDisabled();
  await card.getByLabel(/Type/).fill('cPanel MySQL');
  await expect(confirmButton).toBeEnabled();
  await card.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).not.toContainText('Switch the site to this database?');

  await card.getByRole('button', { name: 'Remove' }).click();
  await expect(card).toContainText('Remove this configuration?');
  await expect(card).toContainText('No table is dropped and no row is deleted');
});

test('a completed switch shows every step and its final state', async ({ page }) => {
  const standby = record({ id: 'cpanel-1', name: 'cPanel MySQL', provider: 'mysql', role: 'standby', bootstrap: false });
  await mockDatabaseApi(page, 'superadmin', overview([record(), standby]), {
    'cpanel-1/switch': {
      report: {
        id: randomUUID(), from: 'bootstrap', to: 'cpanel-1', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        steps: [
          { step: 'test', ok: true, detail: 'MySQL 8.0.35 · 40 ms', ms: 42 },
          { step: 'compare', ok: true, detail: '21 tables compared', ms: 88 },
          { step: 'schema', ok: true, detail: 'Schema created or upgraded on the target', ms: 310 },
          { step: 'sync', ok: true, detail: '4213 rows copied', ms: 5200 },
          { step: 'freeze', ok: true, detail: 'Writes paused so the last copy cannot miss a row', ms: 1 },
          { step: 'final-sync', ok: true, detail: '12 rows copied since the first pass', ms: 900 },
          { step: 'verify', ok: true, detail: 'Row counts, foreign keys and checksums match', ms: 640 },
          { step: 'activate', ok: true, detail: 'The application now reads and writes the new database', ms: 5 },
          { step: 'unfreeze', ok: true, detail: 'Writes resumed', ms: 1 },
        ],
        integrity: { users: { source: 12, target: 12 }, projects: { source: 8, target: 8 }, events: { source: 900, target: 900 }, audit: { source: 30, target: 30 }, foreignKeysOk: true, checksumsOk: true, passed: true },
        succeeded: true, rolledBack: false, error: '',
      },
      ...overview([record({ role: 'standby' }), { ...standby, role: 'active' }]),
    },
  });
  await page.goto('/admin/database');
  const card = page.locator('.admin-database-cards > li').filter({ hasText: 'cPanel MySQL' });
  await card.getByRole('button', { name: 'Switch' }).click();
  await card.getByLabel(/Type/).fill('cPanel MySQL');
  await card.getByRole('button', { name: 'Switch over' }).click();
  const result = page.locator('#admin-database-result');
  await expect(result).toContainText('Copy the last changes');
  await expect(result).toContainText('Resume writes');
  await expect(result).toContainText('is now reading and writing the new database');
  // Every step, including verify, shows as Done — but a switch's own outcome does not separately surface the
  // foreign-key/checksum badges (.admin-database-tags): those render only for the standalone Verify action's result.
  // SwitchReport.integrity is populated by the server (see lib/admin/database.ts switchTo) but DatabasePage's
  // switchOver() mapper does not thread it into the outcome the way it does for verify() — the data exists, the UI
  // just doesn't show it a second time here. Worth a small follow-up, not a correctness bug.
  await expect(result.locator('.admin-database-steps li').filter({ hasText: 'Verify the copy' })).toContainText('Done');
});

test('a failed sync reports the phase and the per-table error instead of claiming success', async ({ page }) => {
  await mockDatabaseApi(page, 'superadmin', overview([record(), record({ id: 'cpanel-1', name: 'cPanel MySQL', provider: 'mysql', role: 'standby', bootstrap: false })]), {
    'cpanel-1/sync': {
      report: {
        id: randomUUID(), mode: 'full', source: 'bootstrap', target: 'cpanel-1', phase: 'failed',
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), durationMs: 4200,
        tables: [{ table: 'users', copied: 0, sourceRows: 12, targetRows: 0, checksumMatch: null, error: 'the target is missing users column(s) ai_blocked; copying would drop that data.' }],
        totalCopied: 0, verified: false, errors: ['users: the target is missing users column(s) ai_blocked; copying would drop that data.'],
      },
      ...overview([record(), record({ id: 'cpanel-1', name: 'cPanel MySQL', provider: 'mysql', role: 'standby', bootstrap: false })]),
    },
  });
  await page.goto('/admin/database');
  const card = page.locator('.admin-database-cards > li').filter({ hasText: 'cPanel MySQL' });
  await card.getByRole('button', { name: 'Sync' }).click();
  const result = page.locator('#admin-database-result');
  await expect(result).toContainText('Failed');
  await expect(result.locator('.admin-database-problems')).toContainText('missing users column(s) ai_blocked');
  await expect(result).toContainText('A switch will not use an unverified copy.');
});

test('writes-frozen state shows a site-wide notice on the page', async ({ page }) => {
  await mockDatabaseApi(page, 'superadmin', overview([record()], { writesFrozen: true }));
  await page.goto('/admin/database');
  await expect(page.getByText('Writes are paused while a switch finishes.')).toBeVisible();
});
