import {test,expect,type Locator,type Page} from '@playwright/test';

// ButtonMotion drives two registered custom properties; the browser turns those into `scale` and
// `translate`, so reading computed style proves the whole chain rather than just an attribute.
const rest=(locator:Locator)=>locator.evaluate(el=>{
 const style=getComputedStyle(el);
 return {
  scale:style.scale==='none'?1:Number.parseFloat(style.scale),
  lift:style.translate==='none'?0:Number.parseFloat(style.translate.split(' ')[1]??'0'),
  press:Number.parseFloat((el as HTMLElement).style.getPropertyValue('--btn-press'))||0,
  stamped:el.hasAttribute('data-btn-motion'),
  tag:el.tagName,
 };
});
type State=Awaited<ReturnType<typeof rest>>;
const settle=(locator:Locator,check:(state:State)=>boolean)=>expect.poll(async()=>check(await rest(locator)),{timeout:5000}).toBe(true);
async function hoverOver(page:Page,locator:Locator){
 const box=await locator.boundingBox();
 if(!box)throw new Error('control is not visible');
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
}

test.beforeEach(async({page})=>{await page.route('**/api/auth/me',route=>route.fulfill({json:{user:null}}));});

test('shared button classes hover, press and settle through framer-motion',async({page})=>{
 await page.goto('/auth');
 await expect(page.locator('html')).toHaveAttribute('data-button-motion','on');
 // Located by class, because activating it renames the control from "Use dark theme" to "Use light theme".
 const toggle=page.locator('.nav-actions .icon-button');
 await expect(toggle).toHaveAttribute('aria-label','Use dark theme');
 expect((await rest(toggle)).stamped).toBe(false); // untouched controls stay exactly as the theme left them
 await hoverOver(page,toggle);
 await settle(toggle,s=>s.lift<=-.5);
 await page.mouse.down();
 await settle(toggle,s=>s.scale<.999&&s.press>0);
 await page.mouse.up();
 await expect(page.locator('.platform')).toHaveClass(/dark/); // the delegated listeners never swallow the click
 await page.mouse.move(0,0);
 await settle(toggle,s=>s.scale>.9999&&s.lift>-.01);
 // Links wearing a button class are animated too, and stay links.
 const share=page.getByRole('link',{name:'Share your project'});
 await hoverOver(page,share);
 await settle(share,s=>s.lift<=-.5&&s.tag==='A');
 await expect(share).toHaveAttribute('href','/submit');
 // The form's own .button gets the same press. Releasing off the control keeps the form unsubmitted.
 // This also guards a regression: pressing a control after another one has been clicked used to be
 // cancelled instantly, because focusing it blurs the previously focused control.
 const submit=page.getByRole('button',{name:'Sign in'});
 await hoverOver(page,submit);
 await page.mouse.down();
 await settle(submit,s=>s.scale<.999);
 await page.mouse.move(0,0);
 await page.mouse.up();
 await settle(submit,s=>s.scale>.9999);
 await expect(page).toHaveURL(/\/auth$/);
});

test('keyboard activation presses the focused control and focus outlines survive',async({page})=>{
 await page.goto('/auth');
 await page.keyboard.press('Tab');
 const skip=page.locator('.skip-link');
 await expect(skip).toBeFocused();
 expect(await skip.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');
 const toggle=page.locator('.nav-actions .icon-button');
 await toggle.focus();
 await page.keyboard.down('Enter');
 await settle(toggle,s=>s.scale<.999);
 await page.keyboard.up('Enter');
 await settle(toggle,s=>s.scale>.9999);
 await expect(page.locator('.platform')).toHaveClass(/dark/);
});

test('reduced motion leaves every control completely still',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/auth');
 await expect(page.locator('html')).toHaveAttribute('data-button-motion','off');
 const toggle=page.locator('.nav-actions .icon-button');
 await hoverOver(page,toggle);
 await page.mouse.down();
 await page.waitForTimeout(400);
 const held=await rest(toggle);
 expect(held.stamped).toBe(false);
 expect(held.scale).toBe(1);
 expect(held.lift).toBe(0);
 await page.mouse.up();
 await expect(page.locator('.platform')).toHaveClass(/dark/); // still fully operable, just not animated
});

test('the primitive is mounted for the public homepage as well',async({page})=>{
 await page.goto('/');
 // The attribute only appears once the effect runs, so this alone proves the root-layout mount
 // reached the homepage tree. The homepage markup is being reworked, so the control below is
 // matched structurally rather than by a class name that may be renamed out from under the test.
 await expect(page.locator('html')).toHaveAttribute('data-button-motion','on');
 const control=page.locator('button:not([disabled]):visible').first();
 await expect(control).toBeEnabled();
 await hoverOver(page,control);
 await page.mouse.down();
 await settle(control,s=>s.scale<.999||s.lift<=-.5);
 await page.mouse.move(0,0);
 await page.mouse.up();
 await settle(control,s=>s.scale>.9999);
});
