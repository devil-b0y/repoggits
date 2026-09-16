import {expect,test} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('**/api/auth/me',route=>route.fulfill({json:{user:null}}));
});

test('engineering chapter controls, pause and project previews remain usable',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toContainText('Every engineer');
  const scene=page.locator('.workshop-scene');
  await expect(scene).toHaveAttribute('data-ready','true',{timeout:20000});
  await expect(scene).toHaveAttribute('data-lighting','studio',{timeout:20000});
  await expect(scene).toHaveAttribute('data-retro_multimeter','ready',{timeout:20000});
  await expect(scene).toHaveAttribute('data-binder_notebook','ready',{timeout:20000});
  await expect(scene.locator('canvas')).toBeVisible();
  await page.getByRole('group',{name:'Engineering story chapters'}).getByRole('button',{name:'Connect'}).click();
  await expect(page.locator('.engineer-story')).toHaveAttribute('data-chapter','2');
  await expect(page.getByRole('heading',{name:'Off the screen. Into the world.'})).toBeVisible();
  await page.getByRole('button',{name:'Pause homepage animation'}).click();
  await expect(scene).toHaveAttribute('data-motion','paused');
  const rotation=await scene.getAttribute('data-rotation');
  await scene.hover();await page.waitForTimeout(150);
  await expect(scene).toHaveAttribute('data-rotation',rotation!);
  await page.getByRole('button',{name:'Resume homepage animation'}).click();
  await expect(scene).toHaveAttribute('data-motion','running');
  const previews=page.getByRole('group',{name:'Project preview'});
  for(const name of ['The people','The source','The working demo']){
    await previews.getByRole('button',{name}).click();
    await expect(previews.getByRole('button',{name})).toHaveAttribute('aria-pressed','true');
    await expect.poll(()=>page.locator('.wh-preview-frame img').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.locator('.wh-finale').getByRole('link',{name:'Share your project',exact:true})).toHaveAttribute('href','/submit');
  await expect(page.locator('.engineer-topline a')).toHaveAttribute('href','/projects');
  expect(errors).toEqual([]);
});

for(const width of [320,390,768,1440])test(`homepage fits ${width}px with reduced motion`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  const scene=page.locator('.workshop-scene');await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-motion','reduced',{timeout:20000});
  await expect(page.locator('#engineer-1')).not.toHaveAttribute('aria-hidden');
  for(const section of ['#engineer-0','#engineer-1','#engineer-2','#engineer-3','#engineer-4','#possibilities','#inside-a-project','#how-it-works','.wh-finale']){
    await page.locator(section).scrollIntoViewIfNeeded();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test('scrolling advances and reverses the story, and skip exits the pinned scene',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  const story=page.locator('.engineer-story');
  await expect(story).toHaveAttribute('data-immersive','true');
  await page.locator('.engineer-stage').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0,1600);
  await expect.poll(()=>story.getAttribute('data-chapter')).not.toBe('0');
  const chapters=page.getByRole('group',{name:'Engineering story chapters'});
  for(const [index,name] of [[1,'Code'],[2,'Connect'],[3,'Iterate'],[4,'Share'],[0,'Imagine']] as const){
    await chapters.getByRole('button',{name,exact:false}).click();
    await expect(story).toHaveAttribute('data-chapter',String(index));
    await expect(chapters.getByRole('button',{name})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator(`#engineer-${index}`)).toHaveAttribute('aria-hidden','false');
    await expect(page.locator(`#engineer-${(index+1)%5}`)).toHaveAttribute('inert','');
  }
  await page.getByRole('link',{name:'Skip the story'}).click();
  await expect(page.locator('#possibilities')).toBeInViewport();
  await expect(page.locator('.engineer-stage')).not.toBeInViewport();
});

test('keyboard chapter navigation and dark theme keep the story usable',async({page})=>{
  await page.setViewportSize({width:1280,height:850});await page.goto('/');
  await expect(page.locator('.engineer-story')).toHaveAttribute('data-immersive','true');
  await expect(page.locator('.workshop-scene')).toHaveAttribute('data-ready','true');
  await page.getByRole('button',{name:'Use dark theme'}).click();
  await expect(page.getByRole('button',{name:'Use light theme'})).toBeVisible();
  const chapters=page.getByRole('group',{name:'Engineering story chapters'});
  const code=chapters.getByRole('button',{name:'Code'});await code.focus();await page.keyboard.press('Enter');
  await expect(page.locator('.engineer-story')).toHaveAttribute('data-chapter','1');
  await expect(code).toBeFocused();
  await expect(page.locator('#engineer-1 h2')).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.engineer-story')).toHaveAttribute('data-immersive','false');
  await expect(page.locator('#engineer-4')).not.toHaveAttribute('inert');
  await page.locator('#engineer-4').scrollIntoViewIfNeeded();
  await expect(page.locator('#engineer-4').getByRole('link',{name:'Share your project'})).toHaveAttribute('href','/submit');
});

test('WebGL failure leaves a readable homepage and working preview controls',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,...args:Parameters<typeof original>){
      if(String(args[0]).includes('webgl'))return null;
      return original.apply(this,args);
    } as typeof original;
  });
  await page.goto('/');await page.locator('.workshop-scene').scrollIntoViewIfNeeded();
  await expect(page.locator('.workshop-fallback')).toBeVisible();
  await page.getByRole('group',{name:'Project preview'}).getByRole('button',{name:'The people'}).click();
  await expect(page.getByRole('heading',{name:'Every teammate gets their moment.'})).toBeVisible();
});

test('an unavailable detailed model does not break the story or navigation',async({page})=>{
  await page.route('**/models/workbench/retro_multimeter/**',route=>route.abort());
  await page.setViewportSize({width:1280,height:850});await page.goto('/');
  const scene=page.locator('.workshop-scene');
  await expect(scene).toHaveAttribute('data-ready','true',{timeout:20000});
  await expect(scene).toHaveAttribute('data-retro_multimeter','unavailable');
  await expect(scene.locator('canvas')).toBeVisible();
  await page.getByRole('group',{name:'Engineering story chapters'}).getByRole('button',{name:'Share'}).click();
  await expect(page.locator('#engineer-4').getByRole('link',{name:'Share your project'})).toBeVisible();
});

test('the full homepage loads category photos and offers an honest assistant preview',async({page})=>{
  const aiRequests:string[]=[];page.on('request',request=>{if(request.url().includes('/api/ai/'))aiRequests.push(request.url());});
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  for(const image of await page.locator('.ec-photo img').all()){
    await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  for(const type of ['Software','Hardware','Hybrid']){
    await page.getByRole('link',{name:`Explore ${type.toLowerCase()} projects`,exact:true}).getAttribute('href').then(href=>expect(href).toBe('/projects'));
    const button=page.getByRole('group',{name:'Assistant examples'}).getByRole('button',{name:type});await button.click();
    await expect(button).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('.ec-example-draft li')).toHaveCount(3);
  }
  await expect(page.locator('.ec-example-draft')).toContainText('RoomSense');
  await expect(page.getByText('Prepared examples. No AI request is sent from this preview.')).toBeVisible();
  await expect(page.getByRole('link',{name:'Try the project assistant'})).toHaveAttribute('href','/submit');
  expect(aiRequests).toEqual([]);
});

test('Framer card interaction respects reduced motion and choices retain keyboard focus',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  const card=page.locator('.ec-depth-card').first();await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute('data-motion','interactive');
  const before=await card.evaluate(el=>getComputedStyle(el).transform);
  await card.hover({position:{x:35,y:40}});
  await expect.poll(()=>card.evaluate(el=>getComputedStyle(el).transform)).not.toBe(before);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(card).toHaveAttribute('data-motion','still');
  const examples=page.getByRole('group',{name:'Assistant examples'});
  const hardware=examples.getByRole('button',{name:'Hardware'});await hardware.focus();await page.keyboard.press('Enter');
  await expect(hardware).toBeFocused();await expect(hardware).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.ec-example-draft')).toContainText('PlantPulse');
  await examples.getByRole('button',{name:'Hybrid'}).click();
  await expect(page.locator('.ec-example-draft')).toContainText('RoomSense');
});
