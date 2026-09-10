import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('global stylesheet has no leading byte-order marker', () => {
  const source = readFileSync('app/globals.css', 'utf8');
  expect(source.charCodeAt(0)).not.toBe(0xfeff);
});

test('Turbopack serves the styled page and local fonts without a build error', async ({ page }) => {
  const errors: string[] = [];
  const failedAssets: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && /\.(css|ttf)(\?|$)/.test(response.url())) {
      failedAssets.push(`${response.status()} ${response.url()}`);
    }
  });

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Good ideas');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 245, 233)');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('color', 'rgb(48, 89, 181)');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => {
    const fonts = Array.from(document.fonts);
    return ['DM Sans', 'Space Grotesk', 'Caveat'].every(family =>
      fonts.some(font => font.family.replace(/["']/g, '') === family && font.status === 'loaded'),
    );
  })).toBe(true);

  await expect(page.locator('.scene canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Software', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Software', exact: true })).toHaveAttribute('aria-pressed','true');
  expect(errors).toEqual([]);
  expect(failedAssets).toEqual([]);
});
