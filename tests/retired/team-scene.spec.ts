import {test,expect} from '@playwright/test';

for(const width of [320,390]){
  test(`the mobile chapter dock leaves hero controls usable at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});await page.goto('/');
    await page.getByRole('button',{name:'Show the people',exact:true}).click();
    const dock=page.getByRole('navigation',{name:'Page chapters'});
    const pause=page.getByRole('button',{name:'Pause cinematic motion',exact:true});
    await expect(dock).toHaveClass(/is-visible/);
    for(const control of [pause,page.getByRole('group',{name:'Build story scenes'})]){
      const box=await control.boundingBox(),dockBox=await dock.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y+box!.height).toBeLessThan(dockBox!.y);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(await control.evaluate(el=>{
        const b=el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));
      })).toBe(true);
    }
    await pause.click();
    await expect(page.locator('.maker-story .team-scene')).toHaveAttribute('data-motion','paused');
    await page.getByRole('button',{name:'Show the build',exact:true}).click();
    await expect(page.getByRole('heading',{level:1})).toContainText('Small board.');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}

test('the team image animates its hands and pauses with the rest of the story',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await page.getByRole('button',{name:'Show the people',exact:true}).click();
  const team=page.locator('.maker-story .team-scene');
  await expect(team).toHaveAttribute('data-motion','running');
  await expect.poll(()=>team.locator('img').evaluateAll(images=>images.length===2&&images.every(el=>(el as HTMLImageElement).complete&&(el as HTMLImageElement).naturalWidth>0))).toBe(true);
  const pose=team.locator('.team-activity-pose'),initial=await pose.evaluate(el=>getComputedStyle(el).opacity);
  await expect.poll(()=>pose.evaluate(el=>getComputedStyle(el).opacity)).not.toBe(initial);
  await page.getByRole('button',{name:'Pause cinematic motion',exact:true}).click();
  await expect(team).toHaveAttribute('data-motion','paused');
  const times=await team.evaluate(el=>el.getAnimations({subtree:true}).map(a=>a.currentTime));
  await page.waitForTimeout(250);
  expect(await team.evaluate(el=>el.getAnimations({subtree:true}).map(a=>a.currentTime))).toEqual(times);
  expect(errors).toEqual([]);
});

for(const reduced of [false,true]){
  test(`manual hero selection keeps the matching 3D object ${reduced?'with reduced motion':'while paused'}`,async({page})=>{
    await page.setViewportSize(reduced?{width:390,height:844}:{width:1440,height:1000});
    if(reduced)await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto('/');
    if(!reduced)await page.getByRole('button',{name:'Pause cinematic motion',exact:true}).click();
    const objects=page.locator('.maker-objects');
    for(const [button,scene] of [['Show the people','project'],['Show the build','circuit'],['Show the idea','code']]){
      await page.getByRole('button',{name:button,exact:true}).click();
      await expect(objects).toHaveAttribute('data-ready','true',{timeout:15000});
      await expect(objects).toHaveAttribute('data-scene',scene);
      await expect(objects).toHaveAttribute('data-motion',reduced?'reduced':'paused');
    }
    const team=page.locator('.maker-story .team-scene');
    await expect(team).toHaveAttribute('data-motion','paused');
    if(reduced)expect(await team.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
