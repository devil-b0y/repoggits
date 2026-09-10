import {test,expect} from '@playwright/test';

test('homepage explains the platform with dimensional visuals and controllable motion',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toContainText('Good ideas');
  await expect(page.locator('.project-card')).toHaveCount(0);
  await expect(page.locator('.paper-stack .story-sheet')).toHaveCount(3);
  await expect(page.locator('.maker-types article')).toHaveCount(3);
  const toggle=page.getByRole('button',{name:'Pause overview motion'});
  await toggle.scrollIntoViewIfNeeded();await toggle.click();
  await expect(page.getByRole('button',{name:'Resume overview motion'})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.home-overview')).toHaveClass(/motion-paused/);
  await page.locator('.overview-collective').scrollIntoViewIfNeeded();
  await expect(page.getByRole('link',{name:'Find your inspiration'})).toHaveAttribute('href','/projects');
  await page.screenshot({path:'test-results/overview-desktop.png',fullPage:true});
  await page.getByRole('link',{name:'Open the project notebook'}).click();
  await expect(page).toHaveURL(/\/projects$/);
  expect(errors).toEqual([]);
});

test('homepage overview fits mobile and respects reduced motion',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');await expect(page.locator('.paper-stack')).toBeAttached();
  await page.locator('.overview-collective').scrollIntoViewIfNeeded();
  expect(await page.locator('.orbit-core').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('.overview-roles')).toBeVisible();
  await page.screenshot({path:'test-results/overview-mobile.png',fullPage:true});
});

test('project sculpture responds to scrolling and remains still when motion is paused',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  const scene=page.locator('.project-sculpture');
  await expect(scene.locator('canvas')).toBeAttached();
  await page.locator('#project-story').evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY-400,behavior:'instant'}));
  await expect.poll(async()=>Number(await scene.getAttribute('data-progress'))).toBeGreaterThan(0);
  await page.waitForTimeout(700);
  const before=Number(await scene.getAttribute('data-progress'));
  await page.evaluate(()=>window.scrollBy({top:600,behavior:'instant'}));
  await expect.poll(async()=>Number(await scene.getAttribute('data-progress'))).toBeGreaterThan(before+.08);
  await page.locator('.overview-story').screenshot({path:'test-results/project-sculpture.png'});
  await page.getByRole('button',{name:'Pause overview motion'}).click();
  await page.locator('.project-sculpture').scrollIntoViewIfNeeded();
  await expect.poll(()=>scene.getAttribute('data-progress')).toBe('0.500');
  await page.evaluate(()=>window.scrollBy(0,100));
  await expect(scene).toHaveAttribute('data-progress','0.500');
});
