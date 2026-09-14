import {expect,test,type Page} from '@playwright/test';

async function scrollIllustrationTo(page:Page,viewportFraction:number){
  await page.locator('.chapter-theatre').evaluate((element,fraction)=>{
    const top=scrollY+element.getBoundingClientRect().top-innerHeight*fraction;
    scrollTo({top,behavior:'instant'});
  },viewportFraction);
}

test('native scrolling assembles all three project journey stages',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  const journey=page.locator('#how-it-works');
  const theatre=journey.locator('.chapter-theatre');
  await expect(journey).toHaveAttribute('data-motion','running');

  await scrollIllustrationTo(page,.76);
  await expect(theatre).toHaveAttribute('data-step','0');
  const firstProgress=Number(await journey.getAttribute('data-progress'));
  const firstScroll=await page.evaluate(()=>scrollY);
  const folderStart=await journey.locator('.chapter-folder').evaluate(element=>getComputedStyle(element).transform);

  await scrollIllustrationTo(page,.43);
  await expect(theatre).toHaveAttribute('data-step','1');
  await expect(journey.getByRole('button',{name:/Share the process/})).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>journey.locator('.chapter-folder').evaluate(element=>getComputedStyle(element).transform)).not.toBe(folderStart);
  const secondProgress=Number(await journey.getAttribute('data-progress'));
  expect(secondProgress).toBeGreaterThan(firstProgress);

  await scrollIllustrationTo(page,.04);
  await expect(theatre).toHaveAttribute('data-step','2');
  await expect(journey.getByRole('button',{name:/Keep it growing/})).toHaveAttribute('aria-pressed','true');
  expect(Number(await journey.getAttribute('data-progress'))).toBeGreaterThan(secondProgress);
  expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(firstScroll);
  await expect(journey.locator('.chapter-reel span[data-reached="true"]')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('pausing freezes the journey while its stage buttons remain usable',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  await page.getByRole('button',{name:'Pause cinematic motion',exact:true}).click();
  const journey=page.locator('#how-it-works');
  const theatre=journey.locator('.chapter-theatre');
  await expect(journey).toHaveAttribute('data-motion','paused');
  await journey.getByRole('button',{name:/Share the process/}).click();
  await expect(theatre).toHaveAttribute('data-step','1');

  const snapshot=()=>journey.evaluate(element=>({
    progress:element.getAttribute('data-progress'),
    active:element.getAttribute('data-active'),
    transforms:Array.from(element.querySelectorAll('.chapter-object,.chapter-objects,.chapter-reel>i')).map(item=>getComputedStyle(item).transform),
  }));
  const frozen=await snapshot();
  await scrollIllustrationTo(page,.76);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(await snapshot()).toEqual(frozen);
  await scrollIllustrationTo(page,.04);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(await snapshot()).toEqual(frozen);

  await journey.getByRole('button',{name:/Keep it growing/}).click();
  await expect(theatre).toHaveAttribute('data-step','2');
  const firstButton=journey.getByRole('button',{name:/Build something/});
  await firstButton.focus();
  await page.keyboard.press('Enter');
  await expect(theatre).toHaveAttribute('data-step','0');
});

test('the 320px reduced-motion journey supports keyboard selection without overflow',async({page})=>{
  await page.setViewportSize({width:320,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  const journey=page.locator('#how-it-works');
  await expect(journey).toHaveAttribute('data-motion','paused');
  for(const [index,label] of [/Build something/,/Share the process/,/Keep it growing/].entries()){
    const button=journey.getByRole('button',{name:label});
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(journey.locator('.chapter-theatre')).toHaveAttribute('data-step',String(index));
    await expect(button).toHaveAttribute('aria-pressed','true');
    const bounds=await button.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await journey.locator('.chapter-versions').evaluate(element=>getComputedStyle(element).transitionDuration)).toBe('0s');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
