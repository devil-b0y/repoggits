import {expect,test} from '@playwright/test';

for(const width of [320,390,834,1440]){
  test(`clean homepage keeps copy and artwork separate at ${width}px`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width,height:1000});await page.goto('/');
    await page.getByRole('button',{name:'Pause cinematic motion',exact:true}).click();
    for(const label of ['Show the idea','Show the build','Show the people']){
      await page.getByRole('button',{name:label,exact:true}).click();
      const copy=(await page.locator('.maker-copy').boundingBox())!;
      const art=(await page.locator('.maker-frames').boundingBox())!;
      if(width<=680)expect(copy.y+copy.height).toBeLessThan(art.y);
      else expect(copy.x+copy.width).toBeLessThan(art.x);
      expect(await page.locator('.maker-copy h1').evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    const explore=page.locator('.maker-actions').getByRole('link',{name:'Explore projects'});
    await explore.click();await expect(page).toHaveURL(/\/projects$/);
    expect(errors).toEqual([]);
  });
}

test('clean homepage preserves mobile navigation and dark mode',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const menu=page.getByRole('button',{name:'Toggle navigation'});await menu.click();
  const navigation=page.locator('.nav-links.open');await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('link',{name:'Explore projects'})).toBeVisible();
  const theme=navigation.locator('.nav-mobile-theme');await theme.click();
  await expect(page.locator('.platform')).toHaveClass(/dark/);
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
