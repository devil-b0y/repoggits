import {test,expect} from '@playwright/test';

test('scroll activates image particles and opens the dimensional project cards',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await expect(page.locator('.photo-dissolve canvas')).toBeAttached();
  await page.evaluate(()=>{const el=document.querySelector('.maker-story')!;scrollTo({top:(el.getBoundingClientRect().height-innerHeight)*.22,behavior:'instant'});});
  await expect.poll(()=>page.locator('.photo-dissolve').getAttribute('data-amount')).not.toBe('0.000');
  await page.screenshot({path:'test-results/creative-dissolve.png'});
  const showcase=page.locator('.build-showcase');await showcase.scrollIntoViewIfNeeded();
  const first=await page.locator('.showcase-code').evaluate(el=>getComputedStyle(el).transform);
  await page.evaluate(()=>scrollBy({top:400,behavior:'instant'}));
  await expect.poll(()=>page.locator('.showcase-code').evaluate(el=>getComputedStyle(el).transform)).not.toBe(first);
  await page.screenshot({path:'test-results/creative-showcase.png'});
  await page.getByRole('button',{name:'Pause overview motion',exact:true}).click();
  await expect(showcase).toHaveAttribute('data-progress','0.500');
  expect(errors).toEqual([]);
});

test('reduced-motion showcase fits mobile and its project link works',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  const showcase=page.locator('.build-showcase');await showcase.scrollIntoViewIfNeeded();await expect(showcase).toHaveAttribute('data-progress','0.500');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/creative-showcase-mobile.png'});
  await page.getByRole('link',{name:'Explore what students are building'}).click();await expect(page).toHaveURL(/\/projects$/);
});
