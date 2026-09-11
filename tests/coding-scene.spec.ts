import {test,expect} from '@playwright/test';

test('coding illustration animates and pause freezes every animated layer',async({page})=>{
  await page.goto('/');
  const scene=page.locator('.coding-scene');await expect(scene).toHaveAttribute('data-motion','running');
  await expect.poll(()=>scene.locator('img').evaluateAll(images=>images.every(i=>(i as HTMLImageElement).complete&&(i as HTMLImageElement).naturalWidth>0))).toBe(true);
  const pose=scene.locator('.coding-pose');const before=await pose.evaluate(el=>getComputedStyle(el).opacity);
  await expect.poll(()=>pose.evaluate(el=>getComputedStyle(el).opacity)).not.toBe(before);
  await page.getByRole('button',{name:'Pause cinematic motion',exact:true}).click();await expect(scene).toHaveAttribute('data-motion','paused');
  const times=await scene.evaluate(el=>el.getAnimations({subtree:true}).map(a=>a.currentTime));await page.waitForTimeout(250);
  expect(await scene.evaluate(el=>el.getAnimations({subtree:true}).map(a=>a.currentTime))).toEqual(times);
  await page.screenshot({path:'test-results/coding-corrected.png'});
});

test('coding scene respects reduced motion on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  const scene=page.locator('.coding-scene');await expect(scene).toHaveAttribute('data-motion','paused');
  expect(await scene.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/coding-corrected-mobile.png'});
});
