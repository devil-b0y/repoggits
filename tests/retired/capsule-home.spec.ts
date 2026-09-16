// Historical coverage for the retired capsule homepage. See workshop-home.spec.ts.
import {expect,test,type Page} from '@playwright/test';

const chapterTitles=['Everything a project is, in one place.','Source you can actually read.','The wiring, not just the result.','Credit for everyone who made it.','Proof that it runs.'];
const fitsWidth=(page:Page)=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
/** Scrolls so the pinned journey sits at a fraction of its travel (0 = just pinned, 1 = about to release). */
async function scrollJourney(page:Page,progress:number){
  await page.evaluate(value=>{const el=document.querySelector<HTMLElement>('.capsule-journey')!;scrollTo({top:scrollY+el.getBoundingClientRect().top+(el.offsetHeight-innerHeight)*value,behavior:'instant'});},progress);
}
const openness=(page:Page)=>page.locator('.capsule-model').evaluate(el=>Number((el as HTMLElement).dataset.open));

test('scrolling opens the capsule one chapter at a time and packs it away at the end',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toHaveText('Good ideas deserve to be built on.');
  const model=page.locator('.capsule-model'),chapters=page.getByRole('group',{name:'Capsule chapters'});
  await expect(model).toHaveAttribute('data-ready','true',{timeout:15_000});
  await expect(model.locator('canvas')).toBeVisible();
  await expect(model).toHaveAttribute('data-motion','running');
  expect(await page.locator('.capsule-stage').evaluate(el=>getComputedStyle(el).position)).toBe('sticky');
  await expect(chapters.getByRole('button',{name:/The capsule/})).toHaveAttribute('aria-pressed','true');
  expect(await openness(page)).toBeLessThan(.05);

  for(let chapter=1;chapter<chapterTitles.length;chapter++){
    await scrollJourney(page,(chapter+.5)/chapterTitles.length);
    await expect(page.getByRole('heading',{level:2,name:chapterTitles[chapter]})).toBeVisible();
    await expect(chapters.getByRole('button').nth(chapter)).toHaveAttribute('aria-pressed','true');
    await expect(model).toHaveAttribute('data-chapter',String(chapter));
    await expect.poll(()=>openness(page)).toBeGreaterThan(.9);
    await expect(page.locator('.capsule-stage')).toBeInViewport();
  }
  await scrollJourney(page,1);
  await expect.poll(()=>openness(page)).toBeLessThan(.05);
  expect(errors).toEqual([]);
});

test('chapter buttons jump through the journey, and pausing holds the capsule while the buttons still work',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  const model=page.locator('.capsule-model'),chapters=page.getByRole('group',{name:'Capsule chapters'});
  await expect(model).toHaveAttribute('data-ready','true',{timeout:15_000});
  await chapters.getByRole('button',{name:/The people/}).click();
  await expect(page.getByRole('heading',{level:2,name:'Credit for everyone who made it.'})).toBeVisible();
  await expect(model).toHaveAttribute('data-chapter','3');
  expect(Number(await page.locator('.capsule-journey').getAttribute('data-progress'))).toBeCloseTo(.7,1);

  await page.getByRole('button',{name:'Pause capsule motion'}).click();
  await expect(page.getByRole('button',{name:'Resume capsule motion'})).toHaveAttribute('aria-pressed','true');
  await expect(model).toHaveAttribute('data-motion','paused');
  await expect(model).toHaveAttribute('data-progress','0.700');
  await page.mouse.move(700,500);await page.mouse.wheel(0,700);
  await expect.poll(()=>page.locator('.capsule-journey').evaluate(el=>Number((el as HTMLElement).dataset.progress))).toBeGreaterThan(.75);
  await expect(model).toHaveAttribute('data-progress','0.700');
  await expect(chapters.getByRole('button',{name:/The people/})).toHaveAttribute('aria-pressed','true');

  await chapters.getByRole('button',{name:/The code/}).click();
  await expect(page.getByRole('heading',{level:2,name:'Source you can actually read.'})).toBeVisible();
  await expect(model).toHaveAttribute('data-progress','0.300');
  await expect(model).toHaveAttribute('data-chapter','1');
  await page.getByRole('button',{name:'Resume capsule motion'}).click();
  await expect(model).toHaveAttribute('data-motion','running');
});

test('a reduced-motion phone gets an unpinned capsule with every chapter one tap away',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  const model=page.locator('.capsule-model'),chapters=page.getByRole('group',{name:'Capsule chapters'});
  expect(await page.locator('.capsule-stage').evaluate(el=>getComputedStyle(el).position)).toBe('relative');
  await expect(model).toHaveAttribute('data-ready','true',{timeout:15_000});
  await expect(model).toHaveAttribute('data-motion','reduced');
  await expect(page.locator('.capsule-intro .motion-word').first()).toHaveCSS('opacity','1');
  for(let chapter=1;chapter<chapterTitles.length;chapter++){
    const button=chapters.getByRole('button').nth(chapter);
    const box=(await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('heading',{level:2,name:chapterTitles[chapter]})).toBeVisible();
    await expect(model).toHaveAttribute('data-chapter',String(chapter));
  }
  await expect(page.locator('.capsule-strip-track')).toHaveAttribute('data-marquee','still');
  expect(await fitsWidth(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('below the capsule the layer cards tilt, the timeline draws with scroll and each call to action goes somewhere real',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await page.locator('#capsule-contents').scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading',{level:2,name:'Inside every capsule.'})).toBeVisible();
  const cards=page.locator('.capsule-card');await expect(cards).toHaveCount(4);
  const card=cards.first();
  await expect.poll(()=>card.evaluate(el=>getComputedStyle(el.parentElement!).opacity)).toBe('1');
  const resting=await card.evaluate(el=>getComputedStyle(el).transform);
  const box=(await card.boundingBox())!;
  await page.mouse.move(box.x+box.width*.9,box.y+box.height*.15,{steps:4});
  await expect.poll(()=>card.evaluate(el=>getComputedStyle(el).transform)).not.toBe(resting);

  const timeline=page.locator('.capsule-timeline');
  const progress=async()=>Number(await timeline.getAttribute('data-progress')??0);
  const placeTimeline=(fraction:number)=>page.evaluate(value=>{const el=document.querySelector<HTMLElement>('.capsule-timeline')!;scrollTo({top:scrollY+el.getBoundingClientRect().top-innerHeight*value,behavior:'instant'});},fraction);
  await placeTimeline(1);await page.waitForTimeout(400);
  const before=await progress();
  await placeTimeline(.2);
  await expect.poll(progress).toBeGreaterThan(before+.2);
  await expect(page.locator('.capsule-step')).toHaveCount(4);

  await expect(page.getByRole('link',{name:'Open the review desk'})).toHaveAttribute('href','/admin');
  await expect(page.locator('.hero-actions').getByRole('link',{name:'Explore projects',exact:true})).toHaveAttribute('target','_blank');
  const finale=page.locator('.capsule-finale');await finale.scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading',{level:2,name:'Pack your first capsule.'})).toBeVisible();
  await finale.getByRole('link',{name:'Share your project'}).click();
  await expect(page).toHaveURL(/\/submit$/);
});

test('dark mode repaints the capsule page from the theme tokens',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await page.getByRole('button',{name:'Use dark theme'}).click();
  await expect(page.locator('.platform')).toHaveClass(/dark/);
  await expect(page.locator('.capsule-home')).toHaveCSS('background-color','rgb(23, 35, 51)');
  await expect(page.getByRole('heading',{level:1})).toHaveCSS('color','rgb(227, 234, 245)');
  expect(await fitsWidth(page)).toBe(true);
});
