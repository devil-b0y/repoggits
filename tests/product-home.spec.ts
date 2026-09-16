import {test,expect} from '@playwright/test';
test('discipline objects load, switch, and preserve paused motion',async({page})=>{
 await page.goto('/');await page.locator('#discover').scrollIntoViewIfNeeded();await expect(page.locator('.pf-real-object[data-object-ready=true][data-kind="0"]')).toBeVisible();
 await expect(page.locator('#discover h2')).toHaveAttribute('data-text-motion','framer');
 for(const [name,id] of [['Hardware','1'],['Hybrid','2'],['Software','0']]){await page.getByRole('group',{name:'Explore engineering disciplines'}).getByRole('button',{name:new RegExp(name)}).click();await expect(page.locator(`.pf-real-object[data-object-ready=true][data-kind="${id}"] canvas`)).toBeVisible();}
 await page.getByRole('button',{name:'Pause animation'}).click();await expect(page.locator('.ph-home')).toHaveAttribute('data-motion','still');await expect(page.locator('.pf-real-object canvas')).toBeVisible();
});
test('engineering objects have a usable non-WebGL fallback',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){if(kind.includes('webgl'))return null;return original.apply(this,[kind,...args] as Parameters<typeof original>);} as typeof original;});
 await page.goto('/');await page.locator('#discover').scrollIntoViewIfNeeded();await expect(page.locator('.pf-object-fallback')).toBeVisible();await expect(page.getByRole('link',{name:'Discover student projects'})).toBeVisible();
});
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

test('text director targets only text and preserves headline masks and gradient',async({page})=>{
 await page.goto('/');
 await expect(page.locator('#ph-title pv-mask')).toHaveCount(3);
 await expect(page.locator('#ph-title pv-text').last()).toHaveCSS('opacity','1');
 await expect(page.locator('#ph-title span pv-text')).toHaveCSS('background-clip','text');
 expect(await page.locator('#ph-title span pv-text').evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
 const uncovered=await page.locator('.ph-home').evaluate(root=>{
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const result:string[]=[];let node:Node|null;
  while((node=walker.nextNode()))if(node.textContent?.trim()&&!node.parentElement?.closest('pv-text,svg,[aria-hidden=true]'))result.push(node.textContent);
  return result;
 });
 expect(uncovered).toEqual([]);
 expect(await page.locator('.ph-home [data-text-motion=framer]').evaluateAll(els=>els.every(el=>!el.getAttribute('style')?.includes('filter: blur')))).toBeTruthy();
});

test('text hover leaves navigation control and icon geometry unchanged',async({page})=>{
 await page.goto('/');const link=page.locator('.ph-nav-cta');await expect(link.locator('pv-text')).toHaveCSS('opacity','1');
 const before=await link.boundingBox(),icon=await link.locator('svg').boundingBox();
 await link.hover();await expect(link.locator('pv-text')).toHaveCSS('left','2px');
 expect(await link.boundingBox()).toEqual(before);expect(await link.locator('svg').boundingBox()).toEqual(icon);
 await page.mouse.move(0,0);await expect(link.locator('pv-text')).toHaveCSS('left','0px');
});

test('pausing and reduced motion immediately resolve text and dynamic updates',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByRole('button',{name:'Pause animation'}).click();
 const check=()=>page.locator('pv-text').evaluateAll(els=>els.every(el=>{const s=getComputedStyle(el);return s.opacity==='1'&&s.filter==='none'&&s.top==='0px'&&s.transform==='none';}));
 expect(await check()).toBeTruthy();
 await page.getByRole('group',{name:'Explore vault capabilities'}).getByRole('button',{name:/Your team/}).click();
 await expect(page.locator('.pf-feature-copy h3')).toHaveText('Your team');expect(await check()).toBeTruthy();
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await expect(page.locator('.ph-home')).toHaveAttribute('data-motion','still');expect(await check()).toBeTruthy();expect(errors).toEqual([]);
});
