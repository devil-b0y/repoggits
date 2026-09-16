import {test,expect} from '@playwright/test';
for(const width of [320,1440])test(`theme toggle persists across reload and application entry at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.route('**/api/auth/me',r=>r.fulfill({json:{user:null}}));await page.goto('/');
 const toggle=page.getByRole('button',{name:'Use dark theme'});await expect(toggle).toBeEnabled();await toggle.click();await expect(page.locator('.pv-home')).toHaveClass(/pv-dark/);
 await expect(page.getByRole('button',{name:'Use light theme'})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('repoggits-theme'))).toBe('dark');
 await page.reload();await expect(page.locator('.pv-home')).toHaveClass(/pv-dark/);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.goto('/auth');await expect(page.locator('.platform')).toHaveClass(/dark/);
 await page.goto('/');await page.getByRole('button',{name:'Use light theme'}).click();await expect(page.locator('.pv-home')).not.toHaveClass(/pv-dark/);await page.reload();await expect(page.getByRole('button',{name:'Use dark theme'})).toBeEnabled();
});
test('homepage login enters the existing authentication form',async({page})=>{
 await page.route('**/api/auth/me',r=>r.fulfill({json:{user:null}}));
 await page.goto('/');await page.getByRole('link',{name:'Login',exact:true}).first().click();
 await expect(page).toHaveURL(/\/auth$/);await expect(page.getByLabel('Email address',{exact:true})).toBeVisible();await expect(page.getByLabel('Password',{exact:true})).toBeVisible();
});
test('morning storyboard advances and reverses with native scroll',async({page})=>{
 await page.goto('/');await page.locator('#morning').scrollIntoViewIfNeeded();
 const scrollToProgress=async(fraction:number)=>page.locator('#morning').evaluate((el,f)=>{const box=el.getBoundingClientRect();window.scrollTo(0,window.scrollY+box.top+box.height*f-innerHeight*.45);},fraction);
 await scrollToProgress(.8);await expect(page.locator('.pv-morning')).toHaveCSS('background-position','100% 50%');
 await scrollToProgress(.2);await expect(page.locator('.pv-morning')).toHaveCSS('background-position','0% 50%');
});
test('homepage tells the story without project listings and preserves application entry routes',async({page})=>{
 await page.goto('/');await expect(page.locator('.pv-chapter')).toHaveCount(14);
 await expect(page.locator('.pv-home .project-card,.pv-home .project-grid')).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Login',exact:true})).toHaveAttribute('href','/auth');
 await expect(page.getByRole('link',{name:'Enter Project Vault',exact:true})).toHaveAttribute('href','/workspace');
 await page.locator('#vault').scrollIntoViewIfNeeded();await expect(page.locator('.pv-home')).toHaveAttribute('data-chapter','4');
 await expect(page.locator('canvas[data-vault-ready]')).toBeAttached();
 await page.locator('#connection').scrollIntoViewIfNeeded();await expect(page.locator('.pv-home')).toHaveAttribute('data-chapter','9');
 await page.locator('#vault').scrollIntoViewIfNeeded();await expect(page.locator('.pv-home')).toHaveAttribute('data-chapter','4');
 await page.getByRole('button',{name:'Pause animation'}).click();await expect(page.locator('.pv-home')).toHaveAttribute('data-motion','still');
 await page.getByRole('button',{name:'Resume animation'}).click();await expect(page.locator('.pv-home')).toHaveAttribute('data-motion','running');
});
for(const width of [320,390,768,1440])test(`story and entry remain usable at ${width}px with reduced motion`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 await expect(page.locator('.pv-home')).toHaveAttribute('data-motion','still');
 await expect(page.getByRole('heading',{level:1})).toHaveText('something worth building._');
 for(const id of ['vault','how-it-works','about','enter']){await page.locator(`#${id}`).scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
 await expect(page.getByRole('link',{name:'Enter Project Vault',exact:true})).toBeVisible();
 if(width<800){await page.getByRole('button',{name:'Toggle navigation'}).click();await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();await page.getByRole('navigation',{name:'Main navigation'}).getByText('Story',{exact:true}).click();await expect(page.getByRole('button',{name:'Toggle navigation'})).toHaveAttribute('aria-expanded','false');}
});
test('no WebGL still exposes the complete story and keyboard entry',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){if(kind.includes('webgl'))return null;return original.apply(this,[kind,...args] as Parameters<typeof original>);} as typeof original;});
 await page.goto('/');await expect(page.locator('.pv-fallback')).toBeAttached();await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip story and enter'})).toBeFocused();await page.keyboard.press('Enter');await expect(page).toHaveURL(/#enter$/);await expect(page.getByRole('link',{name:'Enter Project Vault',exact:true})).toBeVisible();
});

