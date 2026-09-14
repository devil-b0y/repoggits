import {test,expect} from '@playwright/test';

test('project journey changes its dimensional scene and opens submission',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');const section=page.locator('#how-it-works');await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole('heading',{level:2})).toContainText('Move it forward.');
  const group=page.getByRole('group',{name:'Explore the project journey'});
  await group.getByRole('button',{name:/Share the process/}).click();await expect(section.locator('.chapter-theatre')).toHaveAttribute('data-step','1');
  await expect(group.getByRole('button',{name:/Share the process/})).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:'test-results/next-chapter-desktop.png',animations:'disabled'});
  await group.getByRole('button',{name:/Keep it growing/}).click();await expect(section.locator('.chapter-theatre')).toHaveAttribute('data-step','2');
  await section.getByRole('link',{name:'Add your chapter'}).click();await expect(page).toHaveURL(/\/submit/);
});

test('project journey fits mobile and switches without motion when reduced',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');const section=page.locator('#how-it-works');await section.scrollIntoViewIfNeeded();
  await expect(section).toHaveAttribute('data-motion','paused');await section.getByRole('button',{name:/Keep it growing/}).click();
  expect(await section.locator('.chapter-versions').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await section.screenshot({path:'test-results/next-chapter-mobile.png'});
});
