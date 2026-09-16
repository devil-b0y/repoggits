import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import type {ActivityRow,AuditRow,PromptRow,StatCard} from '../lib/admin/types';

// The dashboard, analytics and the four log pages, with the admin API mocked: what each page renders, that filters and
// views stay in the address bar, that redaction holds in the browser, and that every page fits a phone.
// No database is used here; access control itself is covered by admin-security.spec.ts.

type Role='student'|'teacher'|'superadmin';
const viewer=(role:Role,scopes:string[]=[])=>({user:{id:randomUUID(),name:'Site Admin',email:'admin@example.test',role,verified:true,suspended:false,scopes,profile:{name:'Site Admin'}},uploadsAvailable:true,emailVerificationRequired:false});
const ago=(seconds:number)=>new Date(Date.now()-seconds*1000).toISOString();
const fits=(page:Page)=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
// Charts size themselves from a ResizeObserver, so settling after a viewport change takes a frame or two.
const expectFits=(page:Page)=>expect.poll(()=>fits(page),{message:'page fits without sideways scrolling'}).toBe(true);
const pageOf=<T,>(items:T[],extra:Record<string,unknown>={})=>({items,page:1,pageSize:25,total:items.length,totalCapped:false,nextCursor:null,...extra});

const LABELS=['2026-09-10T00:00','2026-09-11T00:00','2026-09-12T00:00','2026-09-13T00:00'];
const range={preset:'7d',timeZone:'UTC',from:ago(86400*7),to:ago(0),previousFrom:ago(86400*14),bucket:'day' as const,label:'Last 7 days'};
const base={range,generatedAt:new Date().toISOString(),labels:LABELS};
const card=(key:string,label:string,value:number,change:number|null,href:string,format:StatCard['format']='number'):StatCard=>
  ({key,label,value,format,current:value,previous:change===null?null:value,change,trend:[1,4,2,6],href});

/** Signs the browser in as `role` and answers every admin endpoint from `routes`. */
async function mockAdmin(page:Page,role:Role,scopes:string[],routes:Record<string,unknown|((url:URL)=>unknown)>) {
  await page.route('**/api/auth/me',route=>route.fulfill({json:viewer(role,scopes)}));
  for(const [endpoint,body] of Object.entries(routes)) {
    await page.route(new RegExp(`/api/admin/${endpoint}(\\?|$|/)`),route=>{
      const url=new URL(route.request().url());
      return route.fulfill({json:typeof body==='function'?(body as (url:URL)=>unknown)(url):body});
    });
  }
}

test('the overview dashboard shows its stat tiles, the activity chart and keeps the date range in the address bar',async({page})=>{
  const requests:string[]=[];
  await mockAdmin(page,'superadmin',[],{overview:(url:URL)=>{
    requests.push(url.search);
    return {...base,onlineWindowSeconds:120,activity:{pageViews:[4,9,2,7],projectViews:[1,3,0,2],logins:[2,2,1,3]},cards:[
      card('online','Online now',3,null,'/admin/live'),
      card('users','Total users',148,12.5,'/admin/users'),
      card('failed_logins','Failed login attempts',6,40,'/admin/logs/security?event=LOGIN_FAILED'),
      card('storage','Storage used',52428800,-3.2,'/admin/system','bytes'),
    ]};
  }});
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/admin/overview');
  await expect(page.getByRole('heading',{level:1,name:'Overview'})).toBeVisible();
  const tiles=page.locator('.admin-stat');
  await expect(tiles.filter({hasText:'Total users'})).toContainText('148');
  await expect(tiles.filter({hasText:'Total users'})).toContainText('+12.5% vs previous period');
  await expect(tiles.filter({hasText:'Storage used'})).toContainText('50 MB');
  await expect(tiles.filter({hasText:'Online now'})).toContainText('No earlier period to compare');
  await expect(page.getByRole('link',{name:/Total users/})).toHaveAttribute('href','/admin/users');
  // Going up is the bad direction for failures, so a rise there reads as bad while a rise in users reads as good.
  await expect(page.locator('.admin-stat',{hasText:'Failed login attempts'}).locator('.admin-stat-change')).toHaveClass(/bad/);
  await expect(page.locator('.admin-stat',{hasText:'Total users'}).locator('.admin-stat-change')).toHaveClass(/good/);
  await expect(page.getByRole('heading',{name:'Platform activity'})).toBeVisible();
  await expect(page.locator('.admin-chart svg').first()).toBeVisible();
  await expect(page.locator('.chart-legend')).toContainText('Page views');
  // The default range stays out of the URL; choosing another one goes into it and into the next request.
  expect(requests[0]).toContain('date=7d');
  await page.getByRole('combobox',{name:'Date range'}).selectOption('30d');
  await expect(page).toHaveURL(/date=30d/);
  await expect.poll(()=>requests.at(-1)??'').toContain('date=30d');
  await page.setViewportSize({width:390,height:844});
  await expectFits(page);
});

test('analytics switches between its views, and each view renders its own charts',async({page})=>{
  const requests:string[]=[];
  await mockAdmin(page,'superadmin',[],{analytics:(url:URL)=>{
    requests.push(url.search);
    const view=url.searchParams.get('view')||'users';
    if(view==='devices')return {...base,view,people:64,
      devices:[{key:'desktop',label:'Desktop',value:40},{key:'mobile',label:'Mobile',value:22},{key:'tablet',label:'Tablet',value:2},{key:'bot',label:'Bot',value:0},{key:'unknown',label:'Unknown',value:0}],
      os:[{key:'Windows',label:'Windows',value:30},{key:'Android',label:'Android',value:20},{key:'Other',label:'Other',value:14}],
      browsers:[{key:'Chrome',label:'Chrome',value:48},{key:'Safari',label:'Safari',value:16}],
      mostCommon:{device:{key:'desktop',label:'Desktop',value:40},os:{key:'Windows',label:'Windows',value:30},browser:{key:'Chrome',label:'Chrome',value:48}},
      overTime:[{key:'desktop',label:'Desktop',values:[8,9,7,10]},{key:'mobile',label:'Mobile',values:[3,4,5,4]},{key:'tablet',label:'Tablet',values:[0,1,0,1]}]};
    if(view==='visitors')return {...base,view,totals:{total:120,unique:90,returning:36,authenticated:54,anonymous:36},authenticated:[10,12,9,14],anonymous:[6,5,8,7]};
    if(view==='activity')return {...base,view,
      series:[{key:'page_views',label:'Page views',values:[12,18,9,20]},{key:'project_views',label:'Project views',values:[4,6,3,7]},{key:'prompts',label:'Prompt usage',values:[1,2,0,3]}],
      topPages:[{page:'/explore',views:31},{page:'/projects',views:18}]};
    return {...base,view:'users',newUsers:19,registrations:[4,6,3,6],cumulative:[104,110,113,119],dau:[9,11,8,12],wau:[24,26,25,28],mau:[52,55,54,58],
      newActive:[4,6,3,6],returningActive:[5,5,5,6],
      cohorts:[{week:'2026-09-07T00:00',size:12,values:[100,58.3,41.7,null,null,null,null,null]}]};
  }});
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/admin/analytics');
  await expect(page.getByRole('heading',{level:1,name:'Analytics'})).toBeVisible();
  // Users is the default view: sign-ups, active users and the retention grid.
  await expect(page.locator('.admin-stat',{hasText:'New sign-ups'})).toContainText('19');
  await expect(page.getByRole('heading',{name:'Active users'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Retention by sign-up week'})).toBeVisible();
  await expect(page.locator('.retention-grid tbody tr').first()).toContainText('58.3%');
  await expect(page.locator('.retention-grid .retention-empty').first()).toBeVisible();

  await page.getByRole('button',{name:'Activity'}).click();
  await expect(page).toHaveURL(/view=activity/);
  await expect.poll(()=>requests.at(-1)??'').toContain('view=activity');
  await expect(page.getByRole('heading',{name:'Most viewed pages'})).toBeVisible();
  await expect(page.locator('.bar-list').first()).toContainText('Page views');
  await expect(page.getByRole('link',{name:'Page views'})).toHaveAttribute('href','/admin/logs?event=page_view');

  await page.getByRole('button',{name:'Visitors'}).click();
  await expect(page).toHaveURL(/view=visitors/);
  await expect(page.locator('.admin-stat',{hasText:'Unique visitors'})).toContainText('90');
  await expect(page.locator('.admin-stat',{hasText:'Returning'}).first()).toContainText('40%');

  await page.getByRole('button',{name:'Devices'}).click();
  await expect(page).toHaveURL(/view=devices/);
  await expect(page.locator('.admin-stat',{hasText:'Most common device'})).toContainText('Desktop');
  await expect(page.locator('.share-bar-track')).toHaveCount(3);
  // A share of zero is left out of the legend rather than drawn as an empty sliver.
  await expect(page.locator('.admin-section',{hasText:'Device type'}).locator('.share-legend li')).toHaveCount(3);
  await page.setViewportSize({width:390,height:844});
  await expectFits(page);
});

test('project analytics ranks projects and people, and AI usage never shows prompt text',async({page})=>{
  const projectId=randomUUID(),userId=randomUUID();
  await mockAdmin(page,'superadmin',[],{analytics:(url:URL)=>{
    if(url.searchParams.get('view')==='ai')return {...base,view:'ai',
      cards:[card('prompts_today','Prompts today',14,20,'/admin/logs/prompts?date=today'),card('average_response','Average response time',2400,-8,'/admin/logs/prompts?status=success','duration')],
      outcomes:[{key:'success',label:'Success',value:38},{key:'failed',label:'Failed',value:3},{key:'pending',label:'In progress',value:0}],
      overTime:[{key:'success',label:'Success',values:[8,12,7,11]},{key:'failed',label:'Failed',values:[1,0,1,1]}],
      averageMs:[2100,2400,2250,2600],
      byFeature:[{key:'project_draft',label:'Project draft assistant',value:41}],
      byUser:[{user:{id:userId,name:'Riya Sharma',role:'student'},count:23}],
      byProject:[{project:{id:projectId,title:'Solar Tracker'},count:17}]};
    return {...base,view:'projects',created:[2,3,1,4],createdInRange:10,totalProjects:87,
      mostViewed:[{project:{id:projectId,title:'Solar Tracker'},count:64,allTime:220}],
      mostShared:[{project:{id:projectId,title:'Solar Tracker'},count:9,allTime:null}],
      mostDownloaded:[],
      activeUsers:[{user:{id:userId,name:'Riya Sharma',role:'student'},events:42,projects:2,prompts:7,total:51}],
      departments:[{key:'Computer Science',label:'Computer Science',value:31}],subjects:[],tags:[{key:'iot',label:'iot',value:12}]};
  }});
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/admin/projects');
  await expect(page.getByRole('heading',{level:1,name:'Project analytics'})).toBeVisible();
  await expect(page.locator('.admin-stat',{hasText:'Projects in total'})).toContainText('87');
  await expect(page.locator('.admin-stat',{hasText:'Most viewed project'})).toContainText('Solar Tracker');
  await expect(page.locator('.admin-section',{hasText:'Most viewed'}).locator('.bar-list')).toContainText('220 views all time');
  // Shares report no all-time total, so that line carries no "all time" note.
  await expect(page.locator('.admin-section',{hasText:'Most shared'}).locator('.bar-list')).not.toContainText('all time');
  await expect(page.locator('.admin-section',{hasText:'Most downloaded'})).toContainText('No downloads in this range.');
  await expect(page.locator('.admin-table')).toContainText('Riya Sharma');
  await expect(page.locator('.admin-table tbody tr').first()).toContainText('51');
  await expect(page.locator('.admin-section',{hasText:'Subjects'})).toContainText('No subjects recorded.');

  await page.goto('/admin/ai');
  await expect(page.getByRole('heading',{level:1,name:'AI usage'})).toBeVisible();
  await expect(page.locator('.admin-stat',{hasText:'Average response time'})).toContainText('2.4 s');
  await expect(page.locator('.admin-section',{hasText:'Outcomes'}).locator('.share-legend')).toContainText('Success');
  await expect(page.locator('.admin-section',{hasText:'Busiest people'}).getByRole('link',{name:'Riya Sharma'})).toHaveAttribute('href',`/admin/users/${userId}`);
  await expect(page.locator('.admin-heading-actions').getByRole('link',{name:'Prompt logs'})).toHaveAttribute('href','/admin/logs/prompts');
  await expect(page.locator('body')).toContainText('Prompt text is stored encrypted and never appears on this page');
  await page.setViewportSize({width:390,height:844});
  await expectFits(page);
});

const event=(eventType:string,label:string,patch:Partial<ActivityRow>={}):ActivityRow=>({
  id:randomUUID(),eventType,label,category:'navigation',status:'success',createdAt:ago(180),user:null,visitorId:null,sessionId:null,project:null,promptId:null,
  page:'',ipAddress:null,deviceType:'desktop',os:'Windows',browser:'Chrome',userAgent:'',metadata:{},...patch});

test('the global activity log filters, exports and hides IP addresses without the network permission',async({page})=>{
  const requests:string[]=[];
  const rows=[
    event('PAGE_VIEW','Page view',{page:'/explore',user:{id:randomUUID(),name:'Riya Sharma',role:'student'},ipAddress:'203.0.113.7',sessionId:randomUUID()}),
    event('LOGIN_FAILED','Failed login',{category:'security',status:'failure',ipAddress:'203.0.113.9',metadata:{reason:'wrong password',attempts:3}}),
  ];
  await mockAdmin(page,'superadmin',[],{logs:(url:URL)=>{requests.push(url.search);return pageOf(rows);}});
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/admin/logs');
  await expect(page.getByRole('heading',{level:1,name:'Global activity'})).toBeVisible();
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(2);
  await expect(page.locator('.admin-table')).toContainText('203.0.113.7');
  await expect(page.locator('.admin-table tbody tr').filter({hasText:'Failed login'})).toContainText('Failed');
  // Metadata stays collapsed until asked for, then reads as plain key and value.
  const details=page.locator('.admin-table tbody tr').filter({hasText:'Failed login'}).locator('.admin-meta');
  await expect(details).toContainText('Details (2)');
  await details.locator('summary').click();
  await expect(details).toContainText('wrong password');
  await expect(page.getByRole('link',{name:'CSV'})).toHaveAttribute('href',/\/api\/admin\/logs\/export\?.*format=csv/);
  await expect(page.getByRole('link',{name:'CSV'})).not.toHaveAttribute('href',/page=/);
  await page.getByRole('button',{name:'Security events'}).click();
  await expect(page).toHaveURL(/event=security/);
  await expect.poll(()=>requests.at(-1)??'').toContain('event=security');
  await page.getByRole('button',{name:'Security events'}).click();
  await expect(page).not.toHaveURL(/event=security/);

  // A Teacher-Admin without the network permission never receives an address, and cannot filter by one.
  await page.unroute('**/api/auth/me');
  await page.route('**/api/auth/me',route=>route.fulfill({json:viewer('teacher',['permission:activity'])}));
  await page.unroute(/\/api\/admin\/logs(\?|$|\/)/);
  await page.route(/\/api\/admin\/logs(\?|$|\/)/,route=>{requests.push(new URL(route.request().url()).search);return route.fulfill({json:pageOf(rows.map(row=>({...row,ipAddress:null})))});});
  await page.goto('/admin/logs?ip=203.0.113.7');
  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible();
  await expect(page.locator('.admin-table')).toContainText('Hidden');
  await expect(page.locator('body')).not.toContainText('203.0.113.7');
  await page.getByRole('button',{name:/More filters/}).click();
  await expect(page.getByLabel('IP address')).toHaveCount(0);
  expect(requests.at(-1)).not.toContain('ip=');
  await page.setViewportSize({width:390,height:844});
  await expectFits(page);
});

test('prompt logs show the text only with prompt_content, and one prompt at a time',async({page})=>{
  const promptId=randomUUID();
  const secret='We built a solar tracker with two servos.';
  const row:PromptRow={id:promptId,createdAt:ago(400),user:{id:randomUUID(),name:'Riya Sharma',role:'student'},feature:'project_draft',
    project:{id:randomUUID(),title:'Solar Tracker'},outcome:'success',reason:'',durationMs:2400,model:'gemini-2.5-flash',
    promptChars:41,promptTokens:12,responseTokens:88,totalTokens:100,sessionId:randomUUID(),deviceType:'mobile',os:'Android',browser:'Chrome',ipAddress:null};
  let detailRequests=0;
  await mockAdmin(page,'superadmin',[],{prompts:(url:URL)=>{
    if(/\/prompts\/[0-9a-f-]{36}$/.test(url.pathname)){detailRequests++;return {prompt:{...row,content:secret,readable:true}};}
    return pageOf([row,{...row,id:randomUUID(),outcome:'failed',reason:'Gemini is unavailable right now.',durationMs:null}]);
  }});
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/admin/logs/prompts');
  await expect(page.getByRole('heading',{level:1,name:'Prompt logs'})).toBeVisible();
  await expect(page.locator('.admin-table')).toContainText('Project draft assistant');
  await expect(page.locator('.admin-table')).toContainText('2.4 s');
  await expect(page.locator('.admin-table')).toContainText('Gemini is unavailable right now.');
  // Nothing is decrypted until an administrator asks for one prompt.
  expect(detailRequests).toBe(0);
  await expect(page.locator('body')).not.toContainText(secret);
  await page.getByRole('button',{name:'Read prompt'}).first().click();
  await expect(page.getByRole('heading',{name:'Prompt text'})).toBeVisible();
  await expect(page.locator('.admin-prompt-text')).toContainText(secret);
  await expect(page.locator('.admin-section',{hasText:'Prompt text'})).toContainText('recorded in the admin audit log');
  expect(detailRequests).toBe(1);
  await page.getByRole('button',{name:'Close'}).click();
  await expect(page.getByRole('heading',{name:'Prompt text'})).toHaveCount(0);

  // Without prompt_content there is no way to ask, and the page says so.
  await page.unroute('**/api/auth/me');
  await page.route('**/api/auth/me',route=>route.fulfill({json:viewer('teacher',['permission:prompts'])}));
  await page.reload();
  await expect(page.locator('.admin-table')).toContainText('Project draft assistant');
  await expect(page.getByRole('button',{name:'Read prompt'})).toHaveCount(0);
  await expect(page.locator('.admin-note')).toContainText('requires the prompt_content permission');
  expect(detailRequests).toBe(1);
  await page.setViewportSize({width:390,height:844});
  await expectFits(page);
});

test('security logs swap between security events and server errors',async({page})=>{
  const requests:string[]=[];
  await mockAdmin(page,'superadmin',[],{security:(url:URL)=>{
    requests.push(url.search);
    if(url.searchParams.get('source')==='errors')return pageOf([{id:randomUUID(),createdAt:ago(90),method:'POST',path:'/api/projects',status:500,name:'DatabaseError',message:'connection terminated unexpectedly'}]);
    return pageOf([event('LOGIN_FAILED','Failed login',{category:'security',status:'failure',ipAddress:'203.0.113.9'}),
      event('SESSION_REVOKED','Session ended by an admin',{category:'security',sessionId:randomUUID()})]);
  }});
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/admin/logs/security');
  await expect(page.getByRole('heading',{level:1,name:'Security logs'})).toBeVisible();
  await expect(page.locator('.admin-table')).toContainText('Failed login');
  await expect(page.locator('.admin-table')).toContainText('Session ended by an admin');
  await page.getByRole('button',{name:/More filters/}).click();
  await expect(page.getByLabel('Security event')).toBeVisible();
  await page.getByRole('button',{name:'Failed logins'}).click();
  await expect(page).toHaveURL(/event=LOGIN_FAILED/);
  await expect.poll(()=>requests.at(-1)??'').toContain('event=LOGIN_FAILED');

  await page.getByRole('button',{name:'Server errors'}).click();
  await expect(page).toHaveURL(/source=errors/);
  // Switching source drops the event filter, which means nothing to the error log.
  await expect(page).not.toHaveURL(/event=LOGIN_FAILED/);
  await expect.poll(()=>requests.at(-1)??'').not.toContain('event=');
  await expect(page.locator('.admin-table')).toContainText('DatabaseError');
  await expect(page.locator('.admin-table')).toContainText('/api/projects');
  await expect(page.locator('.admin-table')).toContainText('500');
  await expect(page.locator('.admin-note')).toContainText('Request bodies, query strings and headers are never stored');
  await page.setViewportSize({width:390,height:844});
  await expectFits(page);
});

test('the audit log offers the actions it has recorded and shows each action its details',async({page})=>{
  const requests:string[]=[];
  const actor={id:randomUUID(),name:'Site Admin',role:'superadmin'};
  const rows:AuditRow[]=[
    {id:randomUUID(),createdAt:ago(120),actor,action:'prompt.viewed',targetId:randomUUID(),details:{userId:randomUUID(),readable:true}},
    {id:randomUUID(),createdAt:ago(900),actor:null,action:'tracking.pruned',targetId:'',details:{}},
  ];
  await mockAdmin(page,'superadmin',[],{audit:(url:URL)=>{requests.push(url.search);return pageOf(rows,{actions:['logs.exported','prompt.viewed','retention.updated','tracking.pruned']});}});
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/admin/logs/audit');
  await expect(page.getByRole('heading',{level:1,name:'Admin audit log'})).toBeVisible();
  await expect(page.locator('.admin-table')).toContainText('prompt › viewed');
  // An action with no actor is the system's own, and empty details show a dash rather than an empty expander.
  await expect(page.locator('.admin-table tbody tr').filter({hasText:'tracking › pruned'})).toContainText('System');
  await expect(page.locator('.admin-table tbody tr').filter({hasText:'tracking › pruned'}).locator('.admin-meta')).toHaveCount(0);
  await page.getByRole('button',{name:/More filters/}).click();
  await expect(page.getByLabel('Action')).toContainText('retention.updated');
  await page.getByLabel('Action').selectOption('logs.exported');
  await expect(page).toHaveURL(/action=logs.exported/);
  await expect.poll(()=>requests.at(-1)??'').toContain('action=logs.exported');
  await expect(page.getByRole('link',{name:'JSON'})).toHaveAttribute('href',/\/api\/admin\/audit\/export\?.*format=json/);
  await expect(page.locator('.admin-note')).toContainText('never prune it');
  await page.setViewportSize({width:390,height:844});
  await expectFits(page);
});

test('a section already visited comes back at once and refreshes behind its rows',async({page})=>{
  const secret='We built a solar tracker with two servos.';
  const row:PromptRow={id:randomUUID(),createdAt:ago(400),user:{id:randomUUID(),name:'Riya Sharma',role:'student'},feature:'project_draft',
    project:{id:randomUUID(),title:'Solar Tracker'},outcome:'success',reason:'',durationMs:2400,model:'gemini-2.5-flash',
    promptChars:41,promptTokens:12,responseTokens:88,totalTokens:100,sessionId:randomUUID(),deviceType:'mobile',os:'Android',browser:'Chrome',ipAddress:null};
  let listRequests=0,detailRequests=0,listFails=false;
  await mockAdmin(page,'superadmin',[],{logs:()=>pageOf([event('PAGE_VIEW','Page view',{page:'/explore'})])});
  // Registered last so it answers first. Every list request after the opening one is slow, which is what tells rows
  // that were already on screen apart from rows that were fetched again.
  await page.route(/\/api\/admin\/prompts(\?|$|\/)/,async route=>{
    const url=new URL(route.request().url());
    if(/\/prompts\/[0-9a-f-]{36}$/.test(url.pathname)){detailRequests++;return route.fulfill({json:{prompt:{...row,content:secret,readable:true}}});}
    listRequests++;
    if(listRequests===1)return route.fulfill({json:pageOf([row])});
    await new Promise(resolve=>setTimeout(resolve,3000));
    if(listFails)return route.fulfill({status:500,json:{error:'The prompt log could not be read.'}});
    return route.fulfill({json:pageOf([row,{...row,id:randomUUID(),outcome:'failed',reason:'Gemini is unavailable right now.'}])});
  });
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/admin/logs/prompts');
  await expect(page.locator('.admin-table')).toContainText('Project draft assistant');

  // Prompt text is audited where it is read, so asking twice must ask the server twice.
  await page.getByRole('button',{name:'Read prompt'}).first().click();
  await expect(page.locator('.admin-prompt-text')).toContainText(secret);
  await page.getByRole('button',{name:'Close'}).click();
  await page.getByRole('button',{name:'Read prompt'}).first().click();
  await expect(page.locator('.admin-prompt-text')).toContainText(secret);
  expect(detailRequests).toBe(2);
  await page.getByRole('button',{name:'Close'}).click();

  const nav=page.locator('#admin-navigation');
  await nav.getByRole('link',{name:'Global activity',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Global activity'})).toBeVisible();
  await nav.getByRole('link',{name:'Prompt logs',exact:true}).click();
  // The rows are back long before the refresh in flight can answer, and nothing announces loading over them.
  await expect(page.locator('.admin-table tbody tr').first()).toContainText('Project draft assistant',{timeout:1500});
  await expect(page.locator('.admin-table')).not.toContainText('Gemini is unavailable right now.');
  await expect(page.locator('.admin-toolbar')).not.toContainText('Loading prompts…');
  await expect(page.locator('.admin-table-wrap')).toHaveAttribute('aria-busy','false');
  expect(listRequests).toBe(2);
  // …and the refresh swaps itself in once it lands.
  await expect(page.locator('.admin-table')).toContainText('Gemini is unavailable right now.',{timeout:10000});

  // A refresh that fails reports itself without taking the last good rows off the screen.
  listFails=true;
  await nav.getByRole('link',{name:'Global activity',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Global activity'})).toBeVisible();
  await nav.getByRole('link',{name:'Prompt logs',exact:true}).click();
  await expect(page.locator('.notice.error')).toContainText('The prompt log could not be read.',{timeout:10000});
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(2);
  expect(listRequests).toBe(3);
});

test('every admin panel section is reachable from the navigation',async({page})=>{
  await mockAdmin(page,'superadmin',[],{overview:{...base,onlineWindowSeconds:120,cards:[],activity:{pageViews:[],projectViews:[],logins:[]}}});
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/admin/overview');
  const nav=page.locator('#admin-navigation');
  for(const [label,href] of [['Overview','/admin/overview'],['Live monitoring','/admin/live'],['Analytics','/admin/analytics'],['Users','/admin/users'],
    ['Sessions','/admin/sessions'],['Project analytics','/admin/projects'],['Review desk','/admin'],['Global activity','/admin/logs'],
    ['Prompt logs','/admin/logs/prompts'],['Security logs','/admin/logs/security'],['Admin audit log','/admin/logs/audit'],
    ['AI usage','/admin/ai'],['System health','/admin/system'],['Settings','/admin/settings']] as const)
    await expect(nav.getByRole('link',{name:label,exact:true}),label).toHaveAttribute('href',href);
  await expect(nav.getByRole('link',{name:'Overview',exact:true})).toHaveAttribute('aria-current','page');
});
