import {test,expect} from '@playwright/test';

test('cinematic opening follows scroll and chapter navigation follows the reader',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  const world=page.locator('.edition-world');
  await expect(world.locator('canvas')).toBeAttached();
  await expect(page.getByRole('heading',{level:1})).toContainText('Good ideas.');
  await expect(page.getByRole('navigation',{name:'Page chapters'})).not.toBeVisible();
  await page.screenshot({path:'test-results/edition-opening.png'});
  await page.evaluate(()=>window.scrollTo({top:600,behavior:'instant'}));
  await expect.poll(async()=>Number(await world.getAttribute('data-progress'))).toBeGreaterThan(.2);
  const chapters=page.getByRole('navigation',{name:'Page chapters'});
  await expect(chapters).toBeVisible();
  await chapters.getByRole('link',{name:'Disciplines',exact:false}).click();
  await expect(chapters.getByRole('link',{name:'Disciplines',exact:false})).toHaveAttribute('aria-current','location');
  await expect(page.locator('.maker-types article')).toHaveCount(3);
  await page.getByRole('button',{name:'Pause overview motion'}).click();
  await expect(page.getByRole('button',{name:'Resume cinematic motion'})).toHaveAttribute('aria-pressed','true');
  await page.locator('#edition-top').scrollIntoViewIfNeeded();
  await expect(world).toHaveAttribute('data-motion','paused');
  await expect.poll(()=>world.getAttribute('data-progress')).toBe('0.000');
  expect(errors).toEqual([]);
});

test('mobile edition keeps navigation accessible with reduced motion and dark mode',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>localStorage.setItem('repoggits-theme','dark'));
  await page.goto('/');await expect(page.locator('.edition-world')).toHaveAttribute('data-motion','reduced');
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/edition-mobile.png',fullPage:true});
  await page.getByRole('navigation',{name:'Explore the homepage'}).getByRole('link',{name:'The collective',exact:false}).click();
  const chapters=page.getByRole('navigation',{name:'Page chapters'});
  await expect(chapters.getByRole('link',{name:'The collective',exact:false})).toHaveAttribute('aria-current','location');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.edition-stage').evaluate(el=>getComputedStyle(el).position)).toBe('relative');
});
