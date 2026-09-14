import {test,expect,type Page} from '@playwright/test';

async function scrollStory(page:Page,progress:number){
  await page.locator('.maker-story').evaluate((element,value)=>{
    const bounds=element.getBoundingClientRect();
    window.scrollTo({top:window.scrollY+bounds.top+(bounds.height-window.innerHeight)*value,behavior:'instant'});
  },progress);
}

test('the foreground maker objects assemble with scrolling and freeze when motion is paused',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  const objects=page.locator('.maker-objects');
  await expect(objects).toHaveAttribute('data-ready','true',{timeout:15000});
  await expect(objects.locator('canvas')).toBeVisible();
  await expect(objects).toHaveAttribute('data-motion','running');
  await expect(objects).toHaveAttribute('data-scene','code');

  await scrollStory(page,.5);
  await expect.poll(async()=>Number(await objects.getAttribute('data-progress'))).toBeGreaterThan(.46);
  await expect(objects).toHaveAttribute('data-scene','circuit');

  await page.getByRole('button',{name:'Pause cinematic motion',exact:true}).click();
  await expect(objects).toHaveAttribute('data-motion','paused');
  const frozen=await objects.getAttribute('data-progress');
  await scrollStory(page,.82);
  // The outer story observes the scroll while the decorative model keeps its pose.
  await expect.poll(async()=>Number(await page.locator('.maker-story').getAttribute('data-progress'))).toBeGreaterThan(.8);
  await expect(objects).toHaveAttribute('data-progress',frozen!);
  await expect(objects).toHaveAttribute('data-scene','circuit');

  await page.getByRole('button',{name:'Resume cinematic motion',exact:true}).click();
  await expect(objects).toHaveAttribute('data-motion','running');
  await expect(objects).toHaveAttribute('data-scene','project');
  expect(errors).toEqual([]);
});

for(const reduced of [false,true]){
  test(`prototype activity controls select every build stage ${reduced?'on a reduced-motion phone':'on desktop'}`,async({page})=>{
    await page.setViewportSize(reduced?{width:390,height:844}:{width:1440,height:1000});
    if(reduced)await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto('/');
    const chapter=page.locator('.circuit-chapter'),activity=chapter.getByRole('group',{name:'Prototype activity'});
    await activity.scrollIntoViewIfNeeded();
    await expect(chapter).toHaveAttribute('data-motion',reduced?'reduced':'running');
    await expect.poll(()=>chapter.locator('.circuit-photograph img').evaluateAll(images=>images.length===2&&images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);

    const stages=[
      {name:'Connect',title:'One connection at a time.'},
      {name:'Upload',title:'Give the idea its instructions.'},
      {name:'It works',title:'That first “it works” moment.'},
    ];
    for(const [index,stage] of stages.entries()){
      const button=activity.getByRole('button',{name:new RegExp(stage.name)});
      await button.click();
      await expect(chapter).toHaveAttribute('data-step',String(index));
      await expect(button).toHaveAttribute('aria-pressed','true');
      await expect(activity.locator('button[aria-pressed="true"]')).toHaveCount(1);
      await expect(chapter.getByRole('heading',{level:3})).toHaveText(stage.title);
      await expect(chapter.locator('.circuit-scene')).toHaveAttribute('data-pose',String(index));
    }
    if(reduced){
      await expect(chapter.locator('.circuit-scene')).toHaveAttribute('data-motion','paused');
      expect(await chapter.locator('.circuit-photograph').evaluate(element=>getComputedStyle(element).transform)).toBe('none');
      expect(await chapter.locator('.circuit-scene').evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length)).toBe(0);
    }
  });
}

for(const viewport of [{width:320,height:800},{width:390,height:844},{width:844,height:390}]){
  test(`the animated homepage fits ${viewport.width}×${viewport.height} and respects reduced motion`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize(viewport);await page.goto('/');
    await expect(page.locator('.edition-page')).toHaveAttribute('data-motion','running');
    for(const section of ['.maker-story','.circuit-chapter','.overview-types','.home-finale']){
      await page.locator(section).scrollIntoViewIfNeeded();
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),{message:`${section} must stay inside the ${viewport.width}px viewport`}).toBeLessThanOrEqual(1);
    }
    if(viewport.height<600)await expect(page.locator('.maker-objects')).toBeHidden();

    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('.overview-intro').scrollIntoViewIfNeeded();
    await expect(page.locator('.edition-page')).toHaveAttribute('data-motion','paused');
    await expect(page.locator('.maker-story')).toHaveAttribute('data-motion','reduced');
    await expect(page.locator('.overview-intro')).toHaveAttribute('data-scroll','0.500');
    await expect(page.locator('.overview-intro h2')).toBeVisible();
    expect(await page.locator('.overview-intro h2').evaluate(element=>element.getAnimations().filter(animation=>animation.playState==='running').length)).toBe(0);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test('project story controls expose each card on a reduced-motion phone',async({page})=>{
  await page.setViewportSize({width:320,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  const showcase=page.locator('.build-showcase');
  for(const [index,label] of ['Show the source story','Show the working build story','Show the makers story'].entries()){
    const button=showcase.getByRole('button',{name:label,exact:true});await button.click();
    await expect(button).toHaveAttribute('aria-pressed','true');
    await expect(showcase).toHaveAttribute('data-active-story',String(index));
    await expect(showcase).toHaveAttribute('data-progress','0.500');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await showcase.getByRole('link',{name:'Explore what students are building'}).click();await expect(page).toHaveURL(/\/projects$/);
});

test('desktop chapter navigation leaves the discipline text and discovery link clear',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  const heading=page.locator('.maker-types article').first().getByRole('heading');
  await heading.scrollIntoViewIfNeeded();
  const dock=page.getByRole('navigation',{name:'Page chapters'});await expect(dock).toHaveClass(/is-visible/);
  const dockBox=(await dock.boundingBox())!,headingBox=(await heading.boundingBox())!;
  expect(headingBox.x).toBeGreaterThan(dockBox.x+dockBox.width+12);
  const discover=page.getByRole('link',{name:'Find your inspiration'});await discover.scrollIntoViewIfNeeded();
  const buttonBox=(await discover.boundingBox())!;
  expect(buttonBox.x).toBeGreaterThan(dockBox.x+dockBox.width+12);
  await discover.click();await expect(page).toHaveURL(/\/projects$/);
});

const copyPieces=['.maker-kicker','h1','h1 em','p','.maker-actions'];
async function heroVisible(page:Page){
  for(const piece of copyPieces){
    const node=page.locator(`.maker-copy ${piece}`).first();
    await expect(node).toBeVisible();
    await expect.poll(()=>node.evaluate(el=>Number(getComputedStyle(el).opacity)),{message:`${piece} must settle fully opaque`}).toBe(1);
  }
}

test('the hero copy reveals on arrival and rests fully legible when motion stops',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  const story=page.locator('.maker-story'),copy=page.locator('.maker-copy');
  await expect(story).toHaveAttribute('data-motion','running');
  // Text and actions stay readable, with no looping shine or shimmer.
  expect(await copy.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations===Infinity).length)).toBe(0);
  await expect.poll(()=>copy.evaluate(el=>el.getAnimations({subtree:true}).every(a=>a.playState==='running'||a.playState==='finished'))).toBe(true);
  await heroVisible(page);

  await page.getByRole('button',{name:'Pause cinematic motion',exact:true}).click();
  await expect(story).toHaveAttribute('data-motion','paused');
  expect(await copy.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
  await heroVisible(page);
});

test('the hero copy skips its reveal entirely on a reduced-motion phone',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await expect(page.locator('.maker-story')).toHaveAttribute('data-motion','reduced');
  expect(await page.locator('.maker-copy').evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
  await heroVisible(page);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});

test('the reading progress bar tracks how far the edition has been read',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  const fill=page.locator('.home-progress i');
  const scaleOf=()=>fill.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a);
  await expect.poll(scaleOf).toBeLessThan(.05);
  await page.evaluate(()=>window.scrollTo({top:(document.documentElement.scrollHeight-innerHeight)*.6,behavior:'instant'}));
  await expect.poll(scaleOf).toBeGreaterThan(.5);
  await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  await expect.poll(scaleOf).toBeGreaterThan(.95);
  // The bar reports position rather than animating, so pausing must not blank it out.
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.getByRole('button',{name:'Pause cinematic motion',exact:true}).click();
  await page.evaluate(()=>window.scrollTo({top:(document.documentElement.scrollHeight-innerHeight)*.5,behavior:'instant'}));
  await expect.poll(scaleOf).toBeGreaterThan(.4);
});
