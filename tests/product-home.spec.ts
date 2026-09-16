import {test,expect} from '@playwright/test';
test('product entry links preserve the existing application and login',async({page})=>{
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:null}}));await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toHaveText('Build somethingworth remembering.');
 await expect(page.getByRole('link',{name:'Enter Project Vault',exact:true})).toHaveAttribute('href','/workspace');
 await expect(page.getByRole('link',{name:'Create your vault',exact:true})).toHaveAttribute('href','/submit');
 await page.getByRole('link',{name:'Log in',exact:true}).last().click();await expect(page).toHaveURL(/\/auth$/);await expect(page.getByLabel('Email address',{exact:true})).toBeVisible();
});
test('homepage has no fictional projects and capabilities respond to selection',async({page})=>{
 await page.goto('/');await expect(page.locator('.ph-project,.ph-dialog,.ph-discovery-grid')).toHaveCount(0);await expect(page.locator('body')).not.toContainText('Smart Attendance');await expect(page.locator('body')).not.toContainText('FICTIONAL');
 await page.getByRole('group',{name:'Explore vault capabilities'}).getByRole('button',{name:/Version history/}).click();await expect(page.locator('.pf-feature-copy')).toContainText('earlier approved versions remain available');
 await page.getByRole('group',{name:'Explore engineering disciplines'}).getByRole('button',{name:/Hardware/}).click();await expect(page.locator('.pf-discipline-detail')).toContainText('Ideas you can hold.');
 await page.getByRole('group',{name:'Explore engineering disciplines'}).getByRole('button',{name:/Hybrid/}).click();await expect(page.locator('.pf-discipline-detail')).toContainText('Better, connected.');
});
test('workflow stages switch content and text motion stops when paused',async({page})=>{
 await page.goto('/');await page.getByRole('group',{name:'Project workflow stages'}).getByRole('button',{name:/DOCUMENT/}).click();await expect(page.locator('.ph-stage-preview')).toContainText('Keep the why, too.');
 await page.getByRole('button',{name:'Pause animation'}).click();await expect(page.locator('.ph-home')).toHaveAttribute('data-motion','still');
 expect(await page.locator('.pf-feature-copy').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
});
test('sharing copies the real discovery URL',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');await page.getByRole('button',{name:'Copy vault link'}).click();await expect(page.locator('.ph-share-demo')).toContainText('Vault link copied.');expect(await page.evaluate(()=>navigator.clipboard.readText())).toMatch(/\/projects$/);
});
for(const width of [320,390,768,1440])test(`responsive layout, theme persistence and reduced motion at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await expect(page.locator('.ph-home')).toHaveAttribute('data-motion','still');await expect(page.locator('.ph-home')).toHaveClass(/ph-dark/);
 const theme=page.getByRole('button',{name:'Use light theme'});await expect(theme).toBeEnabled();await theme.click();await expect(page.locator('.ph-home')).toHaveClass(/ph-light/);await page.reload();await expect(page.locator('.ph-home')).toHaveClass(/ph-light/);
 for(const section of ['product','vault','workflow','project-identity','discover']){await page.locator(`#${section}`).scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
 if(width<760){await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'Toggle navigation'}).click();await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Toggle navigation'})).toHaveAttribute('aria-expanded','false');}
});
test('scroll assembly and pause preserve usable content without console errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.getByRole('button',{name:'Use light theme'})).toBeEnabled();
 await page.locator('.ph-hero').evaluate(el=>scrollTo(0,el.clientHeight-innerHeight));await expect(page.locator('.ph-hero .ph-workspace-assembled')).toHaveCSS('opacity','1');
 await page.evaluate(()=>scrollTo(0,0));await expect(page.locator('.ph-hero .ph-workspace-assembled')).toHaveCSS('opacity','0');
 await page.getByRole('button',{name:'Pause animation'}).click();await expect(page.locator('.ph-home')).toHaveAttribute('data-motion','still');await page.getByRole('button',{name:'Resume animation'}).click();await expect(page.locator('.ph-home')).toHaveAttribute('data-motion','running');expect(errors).toEqual([]);
});
