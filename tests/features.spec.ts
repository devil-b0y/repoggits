import { test, expect, type Page } from '@playwright/test';

const titles = (page: Page) => page.locator('.project-card h3');

async function openSubmission(page: Page) {
  await page.getByRole('button', { name: 'Share your project', exact: true }).click();
}

async function fillSubmission(page: Page, title: string) {
  await page.getByLabel('Project title', { exact: true }).fill(title);
  await page.getByLabel('Team name', { exact: true }).fill('Campus makers');
  await page.getByLabel('The idea', { exact: true }).fill('An accessible guide to campus spaces.');
  await page.getByLabel('Tools & technologies').fill('TypeScript, Sensors');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/demo');
  // Wait for hydration and local persistence before interacting.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('repoggits-saved'))).not.toBeNull();
});

test('Repoggits branding stays consistent across the page, metadata and dialogs', async ({ page }) => {
  await expect(page).toHaveTitle(/^Repoggits/);
  await expect(page.getByRole('link', { name: 'Repoggits home' })).toBeVisible();
  await expect(page.locator('footer .brand')).toContainText('repoggits');
  const assertBranding = async () => {
    await expect(page.locator('body')).not.toContainText(/codex|openai/i);
    expect(await page.title()).not.toMatch(/codex|openai/i);
    expect(await page.locator('meta[name="description"]').getAttribute('content')).not.toMatch(/codex|openai/i);
  };
  await assertBranding();
  await openSubmission(page);
  await assertBranding();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'My workspace' }).click();
  await assertBranding();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'View Your campus, connected.', exact: true }).click();
  await assertBranding();
});

for (const [type, expected] of [
  ['Software', ['Your campus, connected.', 'Less waste. More possibility.']],
  ['Hardware', ['A little greener. A lot smarter.', 'Energy, in a better direction.']],
  ['Hybrid', ['Small steps. Big independence.', 'A sound way to find your way.']],
] as const) {
  test(`${type} filter shows only matching projects`, async ({ page }) => {
    const filter = page.getByRole('button', { name: type, exact: true });
    await filter.click();
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    await expect(titles(page)).toHaveText([...expected]);
    await page.getByRole('button', { name: /^All projects/ }).click();
    await expect(titles(page)).toHaveCount(6);
  });
}

test('search matches titles, teams and technologies regardless of case', async ({ page }) => {
  const search = page.getByRole('textbox', { name: 'Search projects' });
  for (const [query, title] of [
    ['GREENER', 'A little greener. A lot smarter.'],
    ['localhost', 'Your campus, connected.'],
    ['rAsPbErRy', 'A sound way to find your way.'],
  ]) {
    await search.fill(query);
    await expect(titles(page)).toHaveText([title]);
  }
  await search.fill('no-such-project');
  await expect(titles(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No projects found, yet.' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(titles(page)).toHaveCount(6);
});

test('department, type and search filters combine and reset together', async ({ page }) => {
  await page.getByRole('button', { name: 'Additional filters' }).click();
  await page.getByRole('combobox', { name: 'Department', exact: true }).selectOption('Electronics & Communication');
  await expect(titles(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Hybrid', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search projects' }).fill('sensors');
  await expect(titles(page)).toHaveText(['A sound way to find your way.']);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Department', exact: true })).toHaveValue('All departments');
  await expect(page.getByRole('textbox', { name: 'Search projects' })).toHaveValue('');
  await expect(page.getByRole('button', { name: /^All projects/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(titles(page)).toHaveCount(6);
});

test('sorting changes project order and featured restores the original order', async ({ page }) => {
  await page.getByRole('button', { name: 'See all projects' }).click();
  const original = await titles(page).allTextContents();
  await page.getByRole('button', { name: 'Additional filters' }).click();
  await page.getByLabel('Sort by').selectOption('A–Z');
  await expect(titles(page)).toHaveText([
    'A little greener. A lot smarter.', 'A sound way to find your way.',
    'Energy, in a better direction.', 'Less waste. More possibility.',
    'Small steps. Big independence.', 'Your campus, connected.',
  ]);
  await page.getByLabel('Sort by').selectOption('Newest');
  await expect(page.locator('.project-meta > span:last-child')).toHaveText(['2026', '2026', '2026', '2026', '2025', '2025']);
  await page.getByLabel('Sort by').selectOption('Featured');
  await expect(titles(page)).toHaveText(original);
});

test('details show project information and bookmarks can be removed persistently', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'View Your campus, connected.', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Your campus, connected.');
  await expect(dialog).toContainText('The Localhost Collective');
  await expect(dialog).toContainText('PostgreSQL');
  await expect(dialog).toContainText('Initial concept');
  await dialog.getByRole('button', { name: 'Save to workspace' }).click();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: 'My workspace' }).click();
  await dialog.getByRole('button', { name: /Your campus, connected/ }).click();
  await dialog.getByRole('button', { name: 'Remove from saved' }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'My workspace' }).click();
  await expect(dialog).toContainText('Save a project using its bookmark');
  await expect(dialog).not.toContainText('Your campus, connected.');
});

test('required fields prevent an empty submission', async ({ page }) => {
  await openSubmission(page);
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Project title', { exact: true })).toBeFocused();
  expect(await page.locator('form').evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'My workspace' }).click();
  await expect(page.getByRole('dialog')).toContainText('Your next project starts with an idea.');
});

for (const [action, status] of [['Save draft', 'Draft'], ['Submit for review', 'Pending review']] as const) {
  test(`${status} submissions persist privately and can be deleted`, async ({ page }) => {
    const title = `Campus guide ${status}`;
    await openSubmission(page);
    await fillSubmission(page, title);
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('status')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'See all projects' }).click();
    await expect(titles(page)).toHaveCount(6);
    await page.getByRole('textbox', { name: 'Search projects' }).fill(title);
    await expect(titles(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'My workspace' }).click();
    const item = page.getByRole('dialog').locator('.workspace-item').filter({ hasText: title });
    await expect(item).toContainText(status);
    await item.getByRole('button', { name: `Delete ${title}`, exact: true }).click();
    await expect(item).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: 'My workspace' }).click();
    await expect(page.getByRole('dialog')).not.toContainText(title);
  });
}

test('invalid stored JSON does not prevent the gallery from loading', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('repoggits-saved', '{broken');
    localStorage.setItem('repoggits-projects', '{broken');
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.reload();
  await page.getByRole('button', { name: 'See all projects' }).click();
  await expect(titles(page)).toHaveCount(6);
  await page.getByRole('button', { name: 'My workspace' }).click();
  await expect(page.getByRole('dialog')).toContainText('Your next project starts with an idea.');
  expect(errors).toEqual([]);
});
