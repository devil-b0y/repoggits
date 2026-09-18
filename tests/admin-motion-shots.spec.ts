import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import type {ActivityRow,StatCard} from '../lib/admin/types';

// TEMPORARY: before/after screenshots and the reduced-motion visibility check for the admin motion layer.
// Deleted once the motion work is verified.
const TAG=process.env.SHOT_TAG||'before';
const dir=`test-results/admin-motion`;
const viewer=(role:string,scopes:string[]=[])=>({user:{id:randomUUID(),name:'Site Admin',email:'admin@example.test',role,verified:true,suspended:false,scopes,profile:{name:'Site Admin'}},uploadsAvailable:true,emailVerificationRequired:false});
const ago=(seconds:number)=>new Date(Date.now()-seconds*1000).toISOString();
const LABELS=['2026-09-10T00:00','2026-09-11T00:00','2026-09-12T00:00','2026-09-13T00:00'];
const range={preset:'7d',timeZone:'UTC',from:ago(86400*7),to:ago(0),previousFrom:ago(86400*14),bucket:'day' as const,label:'Last 7 days'};
const base={range,generatedAt:new Date().toISOString(),labels:LABELS};
const card=(key:string,label:string,value:number,change:number|null,href:string,format:StatCard['format']='number'):StatCard=>
  ({key,label,value,format,current:value,previous:change===null?null:value,change,trend:[1,4,2,6,3,8,5],href});
const pageOf=<T,>(items:T[],extra:Record<string,unknown>={})=>({items,page:1,pageSize:25,total:items.length,totalCapped:false,nextCursor:null,...extra});
const event=(eventType:string,label:string,patch:Partial<ActivityRow>={}):ActivityRow=>({
  id:randomUUID(),eventType,label,category:'navigation',status:'success',createdAt:ago(180),user:null,visitorId:null,sessionId:null,project:null,promptId:null,
  page:'',ipAddress:null,deviceType:'desktop',os:'Windows',browser:'Chrome',userAgent:'',metadata:{},...patch});

async function mockAdmin(page:Page,routes:Record<string,unknown|((url:URL)=>unknown)>) {
  await page.route('**/api/auth/me',route=>route.fulfill({json:viewer('superadmin')}));
  for(const [endpoint,body] of Object.entries(routes))
    await page.route(new RegExp(`/api/admin/${endpoint}(\\?|$|/)`),route=>{
      const url=new URL(route.request().url());
      return route.fulfill({json:typeof body==='function'?(body as (url:URL)=>unknown)(url):body});
    });
}
const overview={...base,onlineWindowSeconds:120,activity:{pageViews:[4,9,2,7],projectViews:[1,3,0,2],logins:[2,2,1,3]},cards:[
  card('online','Online now',3,null,'/admin/live'),
  card('users','Total users',148,12.5,'/admin/users'),
  card('failed_logins','Failed login attempts',6,40,'/admin/logs/security?event=LOGIN_FAILED'),
  card('storage','Storage used',52428800,-3.2,'/admin/system','bytes'),
]};
const logRows=Array.from({length:14},(_,index)=>event(index%3===0?'LOGIN_FAILED':'PAGE_VIEW',index%3===0?'Failed login':'Page view',{
  page:'/explore',user:{id:randomUUID(),name:`Person ${index+1}`,role:'student'},ipAddress:'203.0.113.7',sessionId:randomUUID(),
  ...(index%3===0?{category:'security' as const,status:'failure' as const,metadata:{reason:'wrong password',attempts:3}}:{}),
}));

test('screenshots: overview dashboard and the activity log, desktop and phone',async({page})=>{
  await mockAdmin(page,{overview,logs:()=>pageOf(logRows)});
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/admin/overview');
  await expect(page.getByRole('heading',{level:1,name:'Overview'})).toBeVisible();
  await expect(page.locator('.admin-chart svg').first()).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({path:`${dir}/${TAG}-overview-desktop.png`,fullPage:true});

  await page.goto('/admin/logs');
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(14);
  await page.waitForTimeout(1200);
  await page.screenshot({path:`${dir}/${TAG}-logs-desktop.png`,fullPage:true});

  await page.setViewportSize({width:390,height:844});
  await page.goto('/admin/overview');
  await expect(page.getByRole('heading',{level:1,name:'Overview'})).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({path:`${dir}/${TAG}-overview-mobile.png`,fullPage:true});
  // The phone menu open, which is the collapsible nav panel.
  await page.getByRole('button',{name:/Admin menu/}).click();
  await expect(page.locator('#admin-navigation').getByRole('link',{name:'Overview',exact:true})).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({path:`${dir}/${TAG}-overview-mobile-menu.png`});

  await page.goto('/admin/logs');
  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({path:`${dir}/${TAG}-logs-mobile.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('reduced motion leaves every admin surface fully visible',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await mockAdmin(page,{overview,logs:()=>pageOf(logRows)});
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/admin/overview');
  await expect(page.getByRole('heading',{level:1,name:'Overview'})).toBeVisible();
  const opacities=async(selector:string)=>page.$$eval(selector,nodes=>nodes.map(node=>({
    opacity:Number.parseFloat(getComputedStyle(node).opacity),
    transform:getComputedStyle(node).transform,
    height:(node as HTMLElement).getBoundingClientRect().height,
  })));
  for(const selector of ['.admin-section','.admin-stat-grid>div','.admin-stat','.admin-heading','.admin-nav a','.admin-nav>div']) {
    const states=await opacities(selector);
    expect(states.length,selector).toBeGreaterThan(0);
    for(const state of states) {
      expect(state.opacity,`${selector} opacity`).toBe(1);
      expect(state.transform===''||state.transform==='none',`${selector} transform ${state.transform}`).toBe(true);
    }
  }
  await page.goto('/admin/logs');
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(14);
  for(const state of await opacities('.admin-table tbody tr')) {
    expect(state.opacity,'row opacity').toBe(1);
    expect(state.height,'row height').toBeGreaterThan(0);
  }
  // The advanced-filter panel still opens and closes, with no animation left running.
  await page.getByRole('button',{name:/More filters/}).click();
  await expect(page.getByLabel('Device')).toBeVisible();
  const panel=await page.$$eval('.admin-filters-grid',nodes=>nodes.map(node=>({opacity:Number.parseFloat(getComputedStyle(node).opacity),height:node.getBoundingClientRect().height})));
  expect(panel[0].opacity).toBe(1);
  expect(panel[0].height).toBeGreaterThan(20);
  await page.screenshot({path:`${dir}/${TAG}-reduced-motion-logs.png`,fullPage:true});
});
