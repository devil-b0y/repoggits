import {test,expect,type Page} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {db,migrate} from '../lib/db';
import {hashToken} from '../lib/auth';
import {storedEmail} from '../lib/encryption';
import type {ActivityRow,PromptRow,SessionRow} from '../lib/admin/types';

// Live monitoring, the user directory and sessions. Other specs create sessions "now" in the same schema, so every
// assertion looks up the rows seeded here by id; presence is measured against now(), so these rows are recent.

test.beforeAll(async()=>{await migrate();});

type Role='student'|'teacher'|'superadmin';
async function account(role:Role,scopes:string[]=[],name=`Live ${role} ${randomUUID().slice(0,8)}`){
 const id=randomUUID(),token=randomBytes(32).toString('hex'),email=`live-${id.slice(0,8)}@example.test`,sealed=storedEmail(email);
 await db.query("INSERT INTO r.users(id,email,email_hash,name,role,verified,scopes,profile) VALUES($1,$2,$3,$4,$5,true,$6,'{}')",[id,sealed.email,sealed.emailHash,name,role,JSON.stringify(scopes)]);
 await db.query("INSERT INTO r.sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hashToken(token),id]);
 return {id,name,email,token,headers:{origin:process.env.APP_ORIGIN!,cookie:`repoggits_session=${token}`}};
}
type Seed={userId?:string;visitorId?:string;startedMinutesAgo:number;lastSeenSecondsAgo:number;ended?:boolean;ip:string;device:string;os:string;browser:string;path?:string};
async function trackedSession(seed:Seed){
 const id=randomUUID();
 await db.query(`INSERT INTO r.tracked_sessions(id,kind,user_id,visitor_id,started_at,last_seen_at,ended_at,end_reason,ip_address,device_type,os,os_version,browser,browser_version,user_agent,platform,screen_width,screen_height,pixel_ratio,touch,language,timezone,current_path)
  VALUES($1,$2,$3,$4,now()-$5::int*interval '1 minute',now()-$6::int*interval '1 second',CASE WHEN $7::boolean THEN now()-$6::int*interval '1 second' END,CASE WHEN $7::boolean THEN 'logout' ELSE '' END,
   $8,$9,$10,'14',$11,'126.0','Mozilla/5.0 (Linux; Android 14) Chrome/126.0 Safari/537.36','Linux armv8l',412,915,2.625,true,'en-IN','Asia/Kolkata',$12)`,
  [id,seed.userId?'authenticated':'anonymous',seed.userId??null,seed.visitorId??null,seed.startedMinutesAgo,seed.lastSeenSecondsAgo,!!seed.ended,seed.ip,seed.device,seed.os,seed.browser,seed.path??'/explore']);
 return id;
}
const octet=()=>1+Math.floor(Math.random()*253);
async function world(){
 const superadmin=await account('superadmin');
 const teacher=await account('teacher',['permission:live','permission:users','permission:sessions','permission:activity']);
 const student=await account('student');
 const person=await account('student',[],`Livia Mercer ${randomUUID().slice(0,8)}`);
 const visitorId=randomUUID();
 await db.query('INSERT INTO r.visitors(id,token_hash) VALUES($1,$2)',[visitorId,hashToken(randomUUID())]);
 const currentIp=`203.0.113.${octet()}`,oldIp=`198.51.100.${octet()}`;
 // Three days ago for 30 minutes (signed out), a tab idle since ten minutes ago, and a tab open right now.
 const ended=await trackedSession({userId:person.id,startedMinutesAgo:3*24*60,lastSeenSecondsAgo:3*24*3600-1800,ended:true,ip:oldIp,device:'desktop',os:'Windows',browser:'Firefox'});
 const offline=await trackedSession({userId:person.id,startedMinutesAgo:90,lastSeenSecondsAgo:600,ip:currentIp,device:'desktop',os:'Haiku',browser:'Chrome'});
 const online=await trackedSession({userId:person.id,startedMinutesAgo:12,lastSeenSecondsAgo:5,ip:currentIp,device:'tablet',os:'Android',browser:'Chrome',path:'/projects'});
 const anonymous=await trackedSession({visitorId,startedMinutesAgo:3,lastSeenSecondsAgo:8,ip:`192.0.2.${octet()}`,device:'mobile',os:'iOS',browser:'Safari'});
 await db.query("INSERT INTO r.activity_events(id,event_type,category,user_id,session_id,page,ip_address,device_type,created_at) VALUES($1,'PAGE_VIEW','navigation',$2,$3,'/projects',$4,'tablet',now()-interval '1 minute')",[randomUUID(),person.id,online,currentIp]);
 return {superadmin,teacher,student,person,visitorId,currentIp,oldIp,ended,offline,online,anonymous};
}
type Json=Record<string,any>;
const byId=(sessions:Json[],id:string)=>sessions.find(session=>session.id===id);

test('live monitoring lists open sessions online first and shows IP addresses only with the network permission',async({request})=>{
 const w=await world();
 const live=async(query:string,headers=w.superadmin.headers)=>{const response=await request.get(`/api/admin/live${query}`,{headers});expect(response.status()).toBe(200);return response.json();};
 const admin=await live('');
 expect(byId(admin.sessions,w.online)).toMatchObject({status:'online',kind:'authenticated',user:{id:w.person.id,name:w.person.name,role:'student'},deviceType:'tablet',os:'Android',browser:'Chrome',ipAddress:w.currentIp,currentPath:'/projects'});
 expect(byId(admin.sessions,w.anonymous)).toMatchObject({status:'online',kind:'anonymous',user:null,visitorId:w.visitorId,deviceType:'mobile'});
 expect(byId(admin.sessions,w.offline)).toMatchObject({status:'offline'});
 expect(byId(admin.sessions,w.ended)).toBeUndefined();
 const order=admin.sessions.map((session:Json)=>session.id);
 expect(order.indexOf(w.online)).toBeLessThan(order.indexOf(w.offline));
 expect(admin.counts.authenticated).toBeGreaterThanOrEqual(1);
 expect(admin.counts.anonymous).toBeGreaterThanOrEqual(1);
 expect(admin.counts.activeSessions).toBeGreaterThanOrEqual(2);
 expect(admin.counts.online).toBe(admin.counts.authenticated+admin.counts.anonymous);
 expect(admin.onlineWindowSeconds).toBeGreaterThanOrEqual(60);

 const teacher=await live('',w.teacher.headers);
 expect(byId(teacher.sessions,w.online)).toMatchObject({status:'online',ipAddress:null});
 expect(teacher.sessions.every((session:Json)=>session.ipAddress===null)).toBe(true);

 const anonymous=await live('?visitor=anonymous');
 expect(byId(anonymous.sessions,w.anonymous)).toBeTruthy();
 expect(byId(anonymous.sessions,w.online)).toBeUndefined();
 expect(anonymous.sessions.every((session:Json)=>session.kind==='anonymous')).toBe(true);
 const tablets=await live('?device=tablet');
 expect(byId(tablets.sessions,w.online)).toBeTruthy();
 expect(tablets.sessions.every((session:Json)=>session.deviceType==='tablet')).toBe(true);
 const named=await live(`?q=${encodeURIComponent(w.person.name)}`);
 expect(named.sessions.map((session:Json)=>session.id)).toEqual([w.online,w.offline]);
 expect((await request.get('/api/admin/live?device=phone',{headers:w.superadmin.headers})).status()).toBe(400);
});

test('the user directory finds people by name, exact user ID or exact email and reports presence',async({request})=>{
 const w=await world();
 const users=async(query:string)=>{const response=await request.get(`/api/admin/users?${query}`,{headers:w.superadmin.headers});expect(response.status()).toBe(200);return response.json();};
 const byName=await users(`q=${encodeURIComponent(w.person.name)}`);
 expect(byName.items).toHaveLength(1);
 expect(byName.items[0]).toMatchObject({id:w.person.id,name:w.person.name,email:w.person.email,role:'student',verified:true,suspended:false,status:'online',sessions:3,events7d:1});
 expect(byName.items[0].lastActiveAt).toBeTruthy();
 expect((await users(`q=${w.person.id}`)).items.map((user:Json)=>user.id)).toEqual([w.person.id]);
 expect((await users(`q=${encodeURIComponent(w.person.email.toUpperCase())}`)).items.map((user:Json)=>user.id)).toContain(w.person.id);
 // Emails are encrypted, so part of an address finds nothing.
 expect((await users(`q=${encodeURIComponent(w.person.email.slice(0,-3))}`)).items.map((user:Json)=>user.id)).not.toContain(w.person.id);
 expect((await users(`q=${encodeURIComponent(w.person.name)}&status=offline`)).items).toHaveLength(0);
 expect((await users(`q=${encodeURIComponent(w.person.name)}&role=teacher`)).items).toHaveLength(0);
 expect((await users(`q=${encodeURIComponent(w.person.name)}&verified=true&suspended=false&status=online&sort=lastActive&dir=asc`)).items).toHaveLength(1);
 expect((await request.get('/api/admin/users?verified=maybe',{headers:w.superadmin.headers})).status()).toBe(400);
});

test('user detail returns device, current session and sessions, with IP history only for the network permission',async({request})=>{
 const w=await world();
 const response=await request.get(`/api/admin/users/${w.person.id}`,{headers:w.superadmin.headers});
 expect(response.status()).toBe(200);
 const detail=await response.json();
 expect(detail.user).toMatchObject({id:w.person.id,name:w.person.name,email:w.person.email,role:'student',verified:true,suspended:false,aiBlocked:false});
 expect(detail.presence.status).toBe('online');
 expect(detail.device).toMatchObject({deviceType:'tablet',os:'Android',osVersion:'14',browser:'Chrome',browserVersion:'126.0',screenWidth:412,screenHeight:915,pixelRatio:2.625,touch:true,language:'en-IN',timezone:'Asia/Kolkata'});
 expect(detail.currentSession).toMatchObject({id:w.online,status:'online',ipAddress:w.currentIp});
 expect(detail.sessions.map((session:Json)=>session.id)).toEqual([w.online,w.offline,w.ended]);
 expect(detail.sessions[2]).toMatchObject({status:'ended',endReason:'logout'});
 expect(Math.round(detail.sessions[2].durationMs/60000)).toBe(30);
 expect(detail.network.currentIp).toBe(w.currentIp);
 expect(detail.network.ipHistory.find((entry:Json)=>entry.ip===w.currentIp)).toMatchObject({sessions:2,events:1});
 expect(detail.network.ipHistory.find((entry:Json)=>entry.ip===w.oldIp)).toMatchObject({sessions:1,events:0});
 expect(detail.counts).toEqual({events7d:1,prompts30d:0,projects:0});
 expect(detail.retention.sessionDays).toBeGreaterThan(0);

 const teacher=await (await request.get(`/api/admin/users/${w.person.id}`,{headers:w.teacher.headers})).json();
 expect(teacher.network).toBeNull();
 expect(teacher.currentSession.ipAddress).toBeNull();
 expect(teacher.sessions.every((session:Json)=>session.ipAddress===null)).toBe(true);
 expect((await request.get(`/api/admin/users/${randomUUID()}`,{headers:w.superadmin.headers})).status()).toBe(404);
 expect((await request.get('/api/admin/users/not-an-id',{headers:w.superadmin.headers})).status()).toBe(400);
 expect((await request.get(`/api/admin/users/${w.person.id}/sessions`,{headers:w.superadmin.headers})).status()).toBe(404);
});

test('the sessions list filters by status, visitor, device, OS family, date, session and IP',async({request})=>{
 const w=await world();
 const ids=async(query:string,headers=w.superadmin.headers)=>{const response=await request.get(`/api/admin/sessions?${query}`,{headers});expect(response.status()).toBe(200);return (await response.json()).items.map((session:Json)=>session.id);};
 const user=`user=${w.person.id}`;
 expect((await ids(user)).sort()).toEqual([w.online,w.offline,w.ended].sort());
 expect(await ids(`${user}&status=ended`)).toEqual([w.ended]);
 expect(await ids(`${user}&status=online`)).toEqual([w.online]);
 expect(await ids(`${user}&status=offline`)).toEqual([w.offline]);
 expect(await ids(`${user}&os=Other`)).toEqual([w.offline]);
 expect(await ids(`${user}&browser=Firefox`)).toEqual([w.ended]);
 expect(await ids(`${user}&device=tablet`)).toEqual([w.online]);
 expect(await ids(`q=${encodeURIComponent(w.person.name)}&sort=duration&dir=asc`)).toEqual([w.online,w.ended,w.offline]);
 expect(await ids(`session=${w.anonymous}&visitor=anonymous`)).toEqual([w.anonymous]);
 expect(await ids(`session=${w.anonymous}&visitor=authenticated`)).toEqual([]);
 const local=(offsetMs:number)=>new Date(Date.now()-3*86400000+offsetMs).toISOString().slice(0,16);
 expect(await ids(`${user}&date=custom&from=${local(-3600000)}&to=${local(3600000)}&tz=UTC`)).toEqual([w.ended]);
 const firstPage=await (await request.get(`/api/admin/sessions?${user}&pageSize=2`,{headers:w.superadmin.headers})).json();
 expect(firstPage).toMatchObject({page:1,pageSize:2,total:3});
 expect(firstPage.items).toHaveLength(2);

 const byIp=await ids(`ip=${w.currentIp}`);
 expect(byIp).toEqual(expect.arrayContaining([w.online,w.offline]));
 expect(byIp).not.toContain(w.ended);
 expect((await request.get(`/api/admin/sessions?ip=${w.currentIp}`,{headers:w.teacher.headers})).status()).toBe(403);
 const teacherRows=await (await request.get(`/api/admin/sessions?${user}`,{headers:w.teacher.headers})).json();
 expect(teacherRows.items.every((session:Json)=>session.ipAddress===null)).toBe(true);
 expect((await request.get('/api/admin/sessions?session=abc',{headers:w.superadmin.headers})).status()).toBe(400);
});

test('ending a session signs that browser out, is audited, and cannot be repeated',async({request})=>{
 const w=await world();
 const target=await account('student');
 const tracked=await trackedSession({userId:target.id,startedMinutesAgo:5,lastSeenSecondsAgo:3,ip:'192.0.2.200',device:'desktop',os:'Windows',browser:'Edge'});
 await db.query('UPDATE r.sessions SET tracked_session_id=$1 WHERE hash=$2',[tracked,hashToken(target.token)]);
 const signedIn=async()=>(await (await request.get('/api/auth/me',{headers:{cookie:target.headers.cookie}})).json()).user;
 expect((await signedIn())?.id).toBe(target.id);

 const revoke=(id:string,headers:Record<string,string>)=>request.post(`/api/admin/sessions/${id}/revoke`,{headers});
 expect((await revoke(tracked,w.student.headers)).status()).toBe(403);
 const ended=await revoke(tracked,w.teacher.headers);
 expect(ended.status()).toBe(200);
 expect(await ended.json()).toMatchObject({ok:true,id:tracked,userId:target.id,signedOut:1});
 expect(await signedIn()).toBeNull();
 const [row]=await db.query('SELECT ended_at,end_reason FROM r.tracked_sessions WHERE id=$1',[tracked]);
 expect(row.ended_at).toBeTruthy();
 expect(row.end_reason).toBe('revoked');
 expect(await db.query('SELECT 1 FROM r.sessions WHERE tracked_session_id=$1',[tracked])).toHaveLength(0);
 const [audited]=await db.query("SELECT actor_id,details FROM r.audit WHERE action='session.revoked' AND target_id=$1",[tracked]);
 expect(audited).toMatchObject({actor_id:w.teacher.id,details:{userId:target.id}});
 expect((await revoke(tracked,w.superadmin.headers)).status()).toBe(409);
 expect((await revoke(randomUUID(),w.superadmin.headers)).status()).toBe(404);
 // An anonymous session has no sign-in to remove, but can still be ended.
 const anonymous=await revoke(w.anonymous,w.superadmin.headers);
 expect(anonymous.status()).toBe(200);
 expect(await anonymous.json()).toMatchObject({userId:null,signedOut:0});
});

test('students get 403, signed-out requests 401, and Teacher-Admins need the matching permission',async({request})=>{
 const w=await world();
 const plainTeacher=await account('teacher');
 const endpoints:[method:'get'|'post',url:string][]=[
  ['get','/api/admin/live'],['get','/api/admin/users'],['get',`/api/admin/users/${w.person.id}`],['get','/api/admin/sessions'],['post',`/api/admin/sessions/${w.online}/revoke`],
 ];
 for(const [method,url] of endpoints){
  expect((await request[method](url,{headers:w.student.headers})).status(),`${method} ${url} as a student`).toBe(403);
  expect((await request[method](url,{headers:plainTeacher.headers})).status(),`${method} ${url} without a permission`).toBe(403);
  expect((await request[method](url,{headers:{origin:process.env.APP_ORIGIN!}})).status(),`${method} ${url} signed out`).toBe(401);
 }
 expect((await request.get('/api/admin/live',{headers:w.teacher.headers})).status()).toBe(200);
 const [row]=await db.query('SELECT ended_at FROM r.tracked_sessions WHERE id=$1',[w.online]);
 expect(row.ended_at).toBeNull();
});

// ----- Pages, with the API mocked -----
const ago=(seconds:number)=>new Date(Date.now()-seconds*1000).toISOString();
const viewer=(role:Role,scopes:string[]=[])=>({user:{id:randomUUID(),name:'Site Admin',email:'admin@example.test',role,verified:true,suspended:false,scopes,profile:{name:'Site Admin'}},uploadsAvailable:true,emailVerificationRequired:false});
const pageOf=<T,>(items:T[],pageSize=25)=>({items,page:1,pageSize,total:items.length,totalCapped:false,nextCursor:null});
const fits=(page:Page)=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
function sessionFixture(patch:Partial<SessionRow>={}):SessionRow {
 return {id:randomUUID(),kind:'authenticated',user:{id:randomUUID(),name:'Riya Sharma',role:'student'},visitorId:null,status:'online',startedAt:ago(720),lastSeenAt:ago(5),endedAt:null,endReason:'',durationMs:715000,
  ipAddress:null,deviceType:'mobile',os:'Android',osVersion:'14',browser:'Chrome',browserVersion:'126.0',userAgent:'Mozilla/5.0 (Linux; Android 14)',platform:'Linux armv8l',screenWidth:412,screenHeight:915,pixelRatio:2.625,
  touch:true,language:'en-IN',timezone:'Asia/Kolkata',networkOnline:true,referrer:'',currentPath:'/projects/ai-chatbot',currentProject:{id:randomUUID(),title:'AI Chatbot'},...patch};
}
function activity(eventType:string,label:string,patch:Partial<ActivityRow>={}):ActivityRow {
 return {id:randomUUID(),eventType,label,category:'navigation',status:'success',createdAt:ago(120),user:null,visitorId:null,sessionId:null,project:null,promptId:null,page:'',ipAddress:null,deviceType:'mobile',os:'Android',browser:'Chrome',userAgent:'',metadata:{},...patch};
}

test('live monitoring renders sessions like the mock-up and refreshes on the next poll',async({page})=>{
 test.setTimeout(60000);
 let polls=0;
 const riya=sessionFixture();
 await page.route('**/api/auth/me',route=>route.fulfill({json:viewer('superadmin')}));
 await page.route(/\/api\/admin\/live(\?|$)/,route=>{
  polls++;
  const visitor=sessionFixture({kind:'anonymous',user:null,visitorId:randomUUID(),deviceType:'desktop',os:'Windows',osVersion:'11',browser:'Firefox',browserVersion:'130.0',currentPath:'/explore',currentProject:null,lastSeenAt:ago(2)});
  const sessions=polls>1?[{...riya,lastSeenAt:ago(3)},visitor]:[riya];
  return route.fulfill({json:{generatedAt:new Date().toISOString(),onlineWindowSeconds:120,counts:{online:sessions.length,authenticated:1,anonymous:sessions.length-1,activeSessions:sessions.length},sessions}});
 });
 await page.setViewportSize({width:1280,height:900});
 await page.goto('/admin/live');
 const row=page.locator('.admin-table tbody tr').filter({hasText:'Riya Sharma'});
 for(const text of ['Online','Mobile','Android 14','Chrome 126.0','/projects/ai-chatbot','AI Chatbot','Hidden',riya.id.slice(0,8)])await expect(row).toContainText(text);
 await expect(row).toContainText(/\d+ sec ago|just now/);
 await expect(page.locator('.admin-stat-label',{hasText:'Online now'})).toBeVisible();
 await expect(page.locator('.admin-live-bar')).toContainText(/Updated \d+ sec ago/);
 await expect(page.locator('.admin-note')).toContainText('no WebSocket');
 await expect(page.locator('.admin-table tbody tr').filter({hasText:'Anonymous visitor'})).toContainText('Firefox 130.0',{timeout:20000});
 expect(polls).toBeGreaterThanOrEqual(2);
 await expect(page.locator('.admin-stat',{hasText:'Anonymous visitors'})).toContainText('1');
 await page.setViewportSize({width:390,height:844});
 expect(await fits(page)).toBe(true);
});

test('the users page links each account, keeps sorting and search in the address bar, and fits a phone',async({page})=>{
 const id=randomUUID();let lastRequest='';
 await page.route('**/api/auth/me',route=>route.fulfill({json:viewer('superadmin')}));
 await page.route(/\/api\/admin\/users(\?|$)/,route=>{lastRequest=route.request().url();return route.fulfill({json:pageOf([{id,name:'Riya Sharma',email:'riya@example.test',role:'student',verified:true,suspended:false,createdAt:ago(86400*40),lastActiveAt:ago(30),status:'online',sessions:4,events7d:37}])});});
 await page.setViewportSize({width:1280,height:900});
 await page.goto('/admin/users');
 await expect(page.getByRole('link',{name:'Riya Sharma'})).toHaveAttribute('href',`/admin/users/${id}`);
 await expect(page.locator('.admin-table')).toContainText('riya@example.test');
 await expect(page.getByRole('link',{name:'Edit roles in Admin panel'})).toHaveAttribute('href','/admin/people');
 await page.getByRole('button',{name:'Name',exact:true}).click();
 await expect(page).toHaveURL(/sort=name/);
 await expect.poll(()=>lastRequest).toContain('sort=name');
 await page.getByLabel('Search',{exact:true}).fill(id);
 await expect(page).toHaveURL(new RegExp(`q=${id}`));
 await page.setViewportSize({width:390,height:844});
 expect(await fits(page)).toBe(true);
});

test('user detail renders its sections and hides network information from a viewer without that permission',async({page})=>{
 const userId=randomUUID(),person={id:userId,name:'Riya Sharma',role:'student'};
 const current=sessionFixture({user:person,ipAddress:'203.0.113.7'});
 const past=sessionFixture({user:person,status:'ended',endedAt:ago(86400),endReason:'logout',lastSeenAt:ago(86400),ipAddress:'198.51.100.4',currentProject:null});
 const full={
  user:{id:userId,name:'Riya Sharma',email:'riya@example.test',role:'student',verified:true,suspended:false,aiBlocked:false,createdAt:ago(86400*40),department:'Computer Science',batch:'2026'},
  presence:{status:'online',lastSeenAt:current.lastSeenAt},
  device:{deviceType:'mobile',os:'Android',osVersion:'14',browser:'Chrome',browserVersion:'126.0',platform:'Linux armv8l',userAgent:'Mozilla/5.0 (Linux; Android 14)',screenWidth:412,screenHeight:915,pixelRatio:2.625,touch:true,language:'en-IN',timezone:'Asia/Kolkata'},
  currentSession:current,sessions:[current,past],
  network:{currentIp:'203.0.113.7',ipHistory:[{ip:'203.0.113.7',firstSeen:ago(86400*3),lastSeen:current.lastSeenAt,sessions:2,events:14},{ip:'198.51.100.4',firstSeen:ago(86400*9),lastSeen:ago(86400),sessions:1,events:3}]},
  counts:{events7d:17,prompts30d:2,projects:2},retention:{activityDays:90,sessionDays:30,securityDays:180},
 };
 let detail:Json=full,logsRequest='';
 const prompt:PromptRow={id:randomUUID(),createdAt:ago(300),user:person,feature:'project_draft',project:{id:randomUUID(),title:'Portfolio Builder'},outcome:'success',reason:'',durationMs:2400,model:'gemini-2.5-flash',promptChars:120,promptTokens:40,responseTokens:200,totalTokens:240,sessionId:null,deviceType:'mobile',os:'Android',browser:'Chrome',ipAddress:null};
 const failed:PromptRow={...prompt,id:randomUUID(),outcome:'failed',reason:'Gemini is unavailable right now.',durationMs:null};
 await page.route('**/api/auth/me',route=>route.fulfill({json:viewer('superadmin')}));
 await page.route(`**/api/admin/users/${userId}`,route=>route.fulfill({json:detail}));
 await page.route(/\/api\/admin\/logs(\?|$)/,route=>{logsRequest=route.request().url();return route.fulfill({json:pageOf([
  activity('PROJECT_VIEW','Project view',{category:'project',project:{id:randomUUID(),title:'AI Chatbot'}}),
  activity('PROJECT_SHARE','Project share',{category:'project',project:{id:randomUUID(),title:'Portfolio Website'}}),
  activity('PAGE_VIEW','Page view',{page:'/dashboard'}),
  activity('LOGIN','Login',{category:'auth'}),
 ],30)});});
 await page.route(/\/api\/admin\/prompts(\?|$)/,route=>route.fulfill({json:pageOf([prompt,failed],20)}));
 await page.setViewportSize({width:390,height:844});
 await page.goto(`/admin/users/${userId}`);
 await expect(page.getByRole('heading',{level:1,name:'Riya Sharma'})).toBeVisible();
 for(const name of ['Device information','Current session','Network information','Activity timeline','Prompt activity','Sessions'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
 await expect(page.locator('.admin-section',{hasText:'Device information'})).toContainText('412 × 915 @ 2.63x');
 await expect(page.locator('.admin-section',{hasText:'Current session'})).toContainText('/projects/ai-chatbot');
 await expect(page.getByRole('button',{name:/^End session/}).first()).toBeVisible();
 await expect(page.locator('.admin-section',{hasText:'Network information'})).toContainText('198.51.100.4');
 const timeline=page.locator('.admin-section').filter({has:page.getByRole('heading',{name:'Activity timeline'})});
 for(const text of ['PROJECT_VIEW — Viewed "AI Chatbot"','PROJECT_SHARE — Shared "Portfolio Website"','PAGE_VIEW — Visited /dashboard','LOGIN — Successful login · Device: Android · Browser: Chrome'])await expect(timeline).toContainText(text);
 expect(logsRequest).toContain(`user=${userId}`);
 expect(logsRequest).toContain('pageSize=30');
 await timeline.getByRole('button',{name:/More filters/}).click();
 await timeline.getByRole('combobox',{name:'Activity type'}).click();
 await timeline.getByRole('option',{name:'Project view'}).click();
 await expect(page).toHaveURL(/t_event=project_view/);
 await expect.poll(()=>logsRequest).toContain('event=project_view');
 const prompts=page.locator('.admin-section').filter({has:page.getByRole('heading',{name:'Prompt activity'})});
 for(const text of ['Project draft assistant','Project: Portfolio Builder · Status: Success · Response: 2.4 s','Reason: Gemini is unavailable right now.'])await expect(prompts).toContainText(text);
 await expect(prompts.getByRole('link',{name:'Open in Prompt logs'})).toHaveAttribute('href',`/admin/logs/prompts?user=${userId}`);
 expect(await fits(page)).toBe(true);

 detail={...full,network:null,currentSession:{...current,ipAddress:null},sessions:full.sessions.map(session=>({...session,ipAddress:null}))};
 await page.unroute('**/api/auth/me');
 await page.route('**/api/auth/me',route=>route.fulfill({json:viewer('teacher',['permission:users','permission:activity'])}));
 await page.reload();
 await expect(page.getByRole('heading',{level:1,name:'Riya Sharma'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Device information'})).toBeVisible();
 await expect(page.locator('.admin-note',{hasText:'requires the network permission'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Network information'})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Prompt activity'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/^End session/})).toHaveCount(0);
 await expect(page.locator('body')).not.toContainText('203.0.113.7');
 expect(await fits(page)).toBe(true);
});

test('session filters stay in the address bar and the sessions list fits a phone',async({page})=>{
 const requests:string[]=[];
 await page.route('**/api/auth/me',route=>route.fulfill({json:viewer('superadmin')}));
 await page.route(/\/api\/admin\/sessions(\?|$)/,route=>{requests.push(route.request().url());return route.fulfill({json:pageOf([sessionFixture({ipAddress:'203.0.113.7'}),sessionFixture({kind:'anonymous',user:null,visitorId:randomUUID(),status:'ended',endedAt:ago(60),endReason:'revoked',ipAddress:'192.0.2.9'})])});});
 await page.setViewportSize({width:390,height:844});
 await page.goto('/admin/sessions');
 await expect(page.locator('.admin-table tbody tr')).toHaveCount(2);
 await expect(page.locator('.admin-table')).toContainText('Ended by an admin');
 await expect(page.locator('.admin-table')).toContainText('Anonymous visitor');
 await page.getByRole('button',{name:/More filters/}).click();
 await expect(page.getByLabel('IP address')).toBeVisible();
 await page.getByRole('combobox',{name:'Status',exact:true}).click();
 await page.getByRole('option',{name:'Ended'}).click();
 await expect(page).toHaveURL(/status=ended/);
 await expect.poll(()=>requests.some(url=>url.includes('status=ended'))).toBe(true);
 await page.getByRole('combobox',{name:'Browser',exact:true}).click();
 await page.getByRole('option',{name:'Firefox'}).click();
 await expect(page).toHaveURL(/browser=Firefox/);
 await page.getByRole('button',{name:'Anonymous visitors'}).click();
 await expect(page).toHaveURL(/visitor=anonymous/);
 await page.getByLabel('Search',{exact:true}).fill('Riya');
 await expect(page).toHaveURL(/q=Riya/);
 await expect.poll(()=>requests.at(-1)??'').toContain('q=Riya');
 expect(await fits(page)).toBe(true);
});
