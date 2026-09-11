import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db, migrate } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { seedSample, SAMPLE_PROJECT_ID } from '../scripts/sample-data';

const password = 'a long test passphrase for layout checks';
const pages = ['/', '/projects', `/projects/${SAMPLE_PROJECT_ID}`, '/demo', '/auth', '/workspace', '/submit', '/account', '/admin', '/admin/settings'];
let email = '';

test.beforeAll(async () => {
  await migrate();
  await seedSample();
  email = `responsive-${randomUUID()}@example.test`;
  await db.query("INSERT INTO r.users(id,email,password_hash,name,role,verified,profile) VALUES($1,$2,$3,'Layout Checker','superadmin',true,'{\"name\":\"Layout Checker\"}')", [randomUUID(), email, await hashPassword(password)]);
});

for (const width of [360, 768]) {
  test(`every page fits a ${width}px-wide screen without sideways scrolling`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 800 });
    expect((await page.request.post('/api/auth/login', { headers: { origin: process.env.APP_ORIGIN! }, data: { email, password } })).status()).toBe(200);
    const problems: string[] = [];
    for (const path of pages) {
      await page.goto(path);
      await expect(page.locator('.loading-state')).toHaveCount(0, { timeout: 15_000 });
      await page.waitForTimeout(300);
      // Elements that stick out past the right edge, ignoring ones inside a deliberate horizontal scroller.
      const overflow = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth;
        const clipped = (el: Element) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const x = getComputedStyle(n).overflowX; if (x === 'auto' || x === 'scroll' || x === 'hidden' || x === 'clip') return true; } return false; };
        const offenders = [...document.body.querySelectorAll('*')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > limit + 1 && !clipped(el); })
          .slice(0, 6).map(el => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : ''} (right edge ${Math.round(el.getBoundingClientRect().right)}px)`);
        return { page: document.documentElement.scrollWidth, limit, offenders };
      });
      await page.screenshot({ path: `test-results/responsive/${width}${path.replace(/[^a-z0-9]+/gi, '_').slice(0, 30) || '_home'}.png`, fullPage: true });
      if (overflow.page > overflow.limit + 1 || overflow.offenders.length) problems.push(`${path}: page is ${overflow.page}px wide on a ${overflow.limit}px screen; ${overflow.offenders.join(', ') || 'no single element found'}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
    // Admin sections wrap instead of hiding off the edge, so Settings is reachable without sideways swiping.
    await page.goto('/admin');
    for (const tab of await page.getByRole('tab').all()) expect((await tab.boundingBox())!.x + (await tab.boundingBox())!.width, await tab.innerText()).toBeLessThanOrEqual(width);
  });
}
