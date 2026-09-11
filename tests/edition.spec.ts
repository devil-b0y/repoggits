import {test,expect} from '@playwright/test';

test('photographic build story advances with scroll and supports manual scene selection',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');
 const story=page.locator('.maker-story');await expect(story).toHaveAttribute('data-motion','running');
 await expect(page.getByRole('heading',{level:1})).toContainText('Good ideas.');
 await expect.poll(()=>page.locator('.maker-frame img').first().evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 await page.screenshot({path:'test-results/maker-opening.png'});
 await page.getByRole('button',{name:'Show the build',exact:true}).click();
 await expect(page.getByRole('heading',{level:1})).toContainText('Small board.');
 await expect(page.getByRole('button',{name:'Show the build',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.screenshot({path:'test-results/maker-circuit.png'});
 await page.getByRole('button',{name:'Pause cinematic motion',exact:true}).click();
 const transforms=await page.locator('.maker-frame').evaluateAll(es=>es.map(e=>({opacity:getComputedStyle(e).opacity,transform:getComputedStyle(e).transform})));
 await page.evaluate(()=>scrollBy({top:100,behavior:'instant'}));await page.waitForTimeout(150);
 expect(await page.locator('.maker-frame').evaluateAll(es=>es.map(e=>({opacity:getComputedStyle(e).opacity,transform:getComputedStyle(e).transform})))).toEqual(transforms);
 await page.getByRole('button',{name:'Show the people',exact:true}).click();
 await expect(page.getByRole('heading',{level:1})).toContainText('Made by you.');
 await page.screenshot({path:'test-results/maker-team.png'});
 const chapters=page.getByRole('navigation',{name:'Page chapters'});await chapters.getByRole('link',{name:'Disciplines',exact:false}).click();
 await expect(chapters.getByRole('link',{name:'Disciplines',exact:false})).toHaveAttribute('aria-current','location');
 expect(errors).toEqual([]);
});

test('mobile story is still under reduced motion and every frame remains selectable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 await expect(page.locator('.maker-story')).toHaveAttribute('data-motion','reduced');
 expect(await page.locator('.maker-stage').evaluate(el=>getComputedStyle(el).position)).toBe('relative');
 await page.screenshot({path:'test-results/maker-mobile.png'});
 await page.getByRole('button',{name:'Show the people',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toContainText('Made by you.');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('link',{name:'Share your project',exact:true}).last().click();await expect(page).toHaveURL(/\/submit/);
});
