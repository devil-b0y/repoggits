import {test,expect,type Page,type Locator} from '@playwright/test';

const kinds=['software','hardware','hybrid'] as const;
const model=(page:Page,kind:typeof kinds[number])=>page.locator(`.type-object .discipline-model[data-kind="${kind}"]`);

async function nextFrames(page:Page,count=8){
  await page.evaluate(frames=>new Promise<void>(resolve=>{
    const tick=()=>--frames>0?requestAnimationFrame(tick):resolve();
    requestAnimationFrame(tick);
  }),count);
}

async function expectRendered(scene:Locator){
  await expect(scene).toHaveAttribute('data-ready','true',{timeout:15000});
  const canvas=scene.locator('canvas');
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate(el=>(el as HTMLCanvasElement).width>0&&(el as HTMLCanvasElement).height>0)).toBe(true);
  const bounds=await canvas.boundingBox();
  expect(bounds?.width).toBeGreaterThan(100);
  expect(bounds?.height).toBeGreaterThan(100);
  return canvas;
}

test('discipline models render in 3D and the overview control pauses and resumes them',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/');
  await page.locator('#project-types').scrollIntoViewIfNeeded();
  await expect(page.locator('.discipline-model')).toHaveCount(3);
  for(const kind of kinds){
    const scene=model(page,kind);
    await expectRendered(scene);
    await expect(scene).toHaveAttribute('data-motion','running');
  }

  const canvas=model(page,'software').locator('canvas');
  const movingFrame=await canvas.screenshot({animations:'disabled'});
  await canvas.hover({position:{x:20,y:20}});
  await expect.poll(async()=>movingFrame.equals(await canvas.screenshot({animations:'disabled'})),{timeout:5000}).toBe(false);

  await page.getByRole('button',{name:'Pause overview motion'}).click();
  await page.locator('#project-types').scrollIntoViewIfNeeded();
  for(const kind of kinds)await expect(model(page,kind)).toHaveAttribute('data-motion','paused');
  await nextFrames(page);
  const frozenFrame=await canvas.screenshot({animations:'disabled'});
  await canvas.hover({position:{x:20,y:20}});
  await nextFrames(page);
  expect(frozenFrame.equals(await canvas.screenshot({animations:'disabled'}))).toBe(true);
  await page.locator('#project-types').screenshot({path:'test-results/discipline-models-desktop.png',animations:'disabled'});

  await page.getByRole('button',{name:'Resume overview motion'}).click();
  await page.locator('#project-types').scrollIntoViewIfNeeded();
  for(const kind of kinds)await expect(model(page,kind)).toHaveAttribute('data-motion','running');
  const resumedFrame=await canvas.screenshot({animations:'disabled'});
  const resumedBounds=await canvas.boundingBox();
  await canvas.hover({position:{x:resumedBounds!.width-20,y:resumedBounds!.height-20}});
  await expect.poll(async()=>resumedFrame.equals(await canvas.screenshot({animations:'disabled'})),{timeout:5000}).toBe(false);
  expect(errors).toEqual([]);
});

test('reduced motion keeps the rendered discipline models still',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await page.locator('#project-types').scrollIntoViewIfNeeded();
  for(const kind of kinds){
    await expectRendered(model(page,kind));
    await expect(model(page,kind)).toHaveAttribute('data-motion','reduced');
  }
  const canvas=model(page,'hybrid').locator('canvas');
  await nextFrames(page);
  const firstFrame=await canvas.screenshot({animations:'disabled'});
  await canvas.hover({position:{x:20,y:20}});
  await nextFrames(page);
  expect(firstFrame.equals(await canvas.screenshot({animations:'disabled'}))).toBe(true);
});

test('mobile discipline models render as their cards enter view without horizontal overflow',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  for(const kind of kinds){
    const scene=model(page,kind);
    await scene.scrollIntoViewIfNeeded();
    const canvas=await expectRendered(scene);
    const bounds=await canvas.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(391);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await model(page,'hybrid').screenshot({path:'test-results/discipline-model-mobile.png',animations:'disabled'});
  expect(errors).toEqual([]);
});
