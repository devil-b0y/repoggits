import {expect,test,type Locator} from '@playwright/test';

const inlineTransform=(locator:Locator)=>locator.evaluate(el=>(el as HTMLElement).style.transform);
const degrees=(transform:string,axis:'X'|'Y')=>Math.abs(Number(new RegExp(`rotate${axis}\\((-?[\\d.]+)deg\\)`).exec(transform)?.[1]??0));
const scaleOf=(transform:string)=>Number(/scale\(([\d.]+)\)/.exec(transform)?.[1]??1);

test('the hero artwork turns in 3D with scroll and lies flat once motion is paused',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  const frames=page.locator('.maker-frames');
  await expect.poll(async()=>degrees(await inlineTransform(frames),'Y')).toBeGreaterThan(5);
  const opening=await inlineTransform(frames);
  await expect(page.locator('.hero-chip')).toHaveCount(3);
  await page.screenshot({path:'test-results/home-3d-hero.png'});
  await page.evaluate(()=>scrollBy({top:600,behavior:'instant'}));
  await expect.poll(()=>inlineTransform(frames)).not.toBe(opening);

  await page.getByRole('button',{name:'Pause cinematic motion',exact:true}).click();
  await expect.poll(()=>frames.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  await expect(page.locator('.maker-filmstrip button[aria-pressed="true"] .film-pill')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('the discipline strip runs as a marquee and rests centred when motion stops',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  const track=page.locator('.motion-strip-track');await track.scrollIntoViewIfNeeded();
  await expect(track).toHaveAttribute('data-marquee','running');
  const offset=()=>track.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41);
  const first=await offset();
  await expect.poll(offset).not.toBe(first);
  await page.getByRole('button',{name:'Pause overview motion'}).click();
  await expect(track).toHaveAttribute('data-marquee','still');
  await expect.poll(()=>track.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  await expect(track.locator('>div').nth(1)).toBeHidden();
});

test('discipline cards tilt toward the pointer and the chapter dock marks the current chapter',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  const card=page.locator('.maker-types article').nth(1);await card.scrollIntoViewIfNeeded();
  await expect.poll(()=>card.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
  const box=(await card.boundingBox())!;
  await page.mouse.move(box.x+box.width*.92,box.y+box.height*.1,{steps:4});
  await expect.poll(async()=>degrees(await inlineTransform(card),'Y')).toBeGreaterThan(2);
  const dock=page.getByRole('navigation',{name:'Page chapters'});
  await expect(dock).toHaveClass(/is-visible/);
  await expect(dock.locator('a[aria-current="location"] .dock-pill')).toHaveCount(1);

  await page.mouse.move(0,0);
  await page.getByRole('button',{name:'Pause overview motion'}).click();
  await card.scrollIntoViewIfNeeded();
  const paused=(await card.boundingBox())!;
  await page.mouse.move(paused.x+paused.width*.92,paused.y+paused.height*.1,{steps:4});
  await expect.poll(async()=>degrees(await inlineTransform(card),'Y')).toBe(0);
});

test('the finale headline rises out of the page and its link still opens the notebook',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  const finale=page.locator('.home-finale'),heading=finale.locator('h2');
  await finale.evaluate(el=>scrollTo({top:scrollY+el.getBoundingClientRect().top-innerHeight*.9,behavior:'instant'}));
  await expect.poll(async()=>scaleOf(await inlineTransform(heading))).toBeLessThan(.93);
  await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  await expect.poll(async()=>scaleOf(await inlineTransform(heading))).toBeGreaterThan(.99);
  await expect(finale.locator('.finale-token')).toHaveCount(3);
  await expect.poll(()=>heading.evaluate(el=>[...el.querySelectorAll('.motion-word')].every(word=>getComputedStyle(word).opacity==='1'))).toBe(true);
  await finale.screenshot({path:'test-results/home-3d-finale.png'});
  await finale.getByRole('link',{name:'Open the project notebook'}).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test('reduced motion lands every reveal at once with nothing left running',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await expect(page.locator('.motion-strip-track')).toHaveAttribute('data-marquee','still');
  expect(await page.locator('.maker-frames').evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  for(const selector of ['.showcase-heading','.overview-intro','.circuit-chapter','.overview-story-copy','.maker-types','.collective-copy','.overview-roles','.chapter-copy','.home-finale']){
    const section=page.locator(selector).first();await section.scrollIntoViewIfNeeded();
    // Framer writes reveal state as inline opacity; decorative layers such as the hover glare rest at 0 on purpose.
    await expect.poll(()=>section.evaluate(el=>[el,...el.querySelectorAll<HTMLElement>('*')].filter(node=>node.style.opacity!=='').every(node=>getComputedStyle(node).opacity==='1')),{message:`${selector} must be fully revealed`}).toBe(true);
    expect(await section.evaluate(el=>el.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length),selector).toBe(0);
  }
  expect(await page.locator('.circuit-chapter').evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  expect(await page.locator('.home-finale h2').evaluate(el=>getComputedStyle(el).transform)).toBe('none');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
