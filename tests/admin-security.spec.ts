import {test,expect,type APIRequestContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {db,migrate} from '../lib/db';
import {hashToken} from '../lib/auth';
import {sealText} from '../lib/encryption';
import {PERMISSION_NAMES,type AdminPermission} from '../lib/admin/permissions';
import {seedSample,SAMPLE_PROJECT_ID} from '../scripts/sample-data';

// Access control for the admin API: sign-in, role and per-section permission on every endpoint, redaction of IP addresses
// and prompt text, same-origin mutations, hostile filter values, and no tracking fields on public or member APIs.
// Seeded rows belong to a user created here and are read back by that user's id, so rows other specs write never matter.

const origin=process.env.APP_ORIGIN!;
type Account={id:string;token:string;headers:{origin:string;cookie:string}};
type Row={id:string;ipAddress:string|null};
async function account(role:'student'|'teacher'|'superadmin',permissions:AdminPermission[]=[]):Promise<Account>{
 const id=randomUUID(),token=randomUUID();
 await db.query("INSERT INTO r.users(id,email,name,role,verified,scopes,profile) VALUES($1,$2,$3,$4,true,$5,'{}')",[id,`${id}@example.test`,`Security ${role} ${id.slice(0,6)}`,role,JSON.stringify(permissions.map(name=>`permission:${name}`))]);
 await db.query("INSERT INTO r.sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '2 hours')",[hashToken(token),id]);
 return {id,token,headers:{origin,cookie:`repoggits_session=${token}`}};
}
const status=async(request:APIRequestContext,path:string,viewer?:Account)=>(await request.get(path,viewer?{headers:viewer.headers}:undefined)).status();

const NET='203.0.113.';
const promptText='We built a solar tracker for the Helios rooftop garden with two servos.';
const ids={pastSession:randomUUID(),liveSession:randomUUID(),event:randomUUID(),prompt:randomUUID()};
let student:Account,bare:Account,admin:Account,redactor:Account,aiViewer:Account,target:Account;
const holders={} as Record<AdminPermission,Account>;

test.beforeAll(async()=>{
 await migrate();await seedSample();
 student=await account('student');bare=await account('teacher');admin=await account('superadmin');
 redactor=await account('teacher',['activity','live','sessions']);aiViewer=await account('teacher',['analytics','prompts']);target=await account('student');
 for(const name of PERMISSION_NAMES)holders[name]=await account('teacher',[name]);
 // 20 days back stays inside every default retention window, so the automatic cleanup leaves these rows alone.
 await db.query(`INSERT INTO r.tracked_sessions(id,kind,user_id,started_at,last_seen_at,ended_at,end_reason,ip_address,device_type,os,browser,user_agent) VALUES
  ($1,'authenticated',$3,now()-interval '20 days',now()-interval '20 days'+interval '9 minutes',now()-interval '20 days'+interval '9 minutes','logout',$4,'desktop','Windows','Chrome','Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0'),
  ($2,'authenticated',$3,now()-interval '4 minutes',now(),NULL,'',$5,'mobile','Android','Chrome','Mozilla/5.0 (Linux; Android 15) Chrome/140.0')`,[ids.pastSession,ids.liveSession,target.id,`${NET}7`,`${NET}8`]);
 await db.query("INSERT INTO r.activity_events(id,event_type,category,user_id,session_id,page,ip_address,device_type,os,browser,created_at) VALUES($1,'PAGE_VIEW','navigation',$2,$3,'/projects',$4,'desktop','Windows','Chrome',now()-interval '20 days')",[ids.event,target.id,ids.pastSession,`${NET}7`]);
 await db.query("INSERT INTO r.ai_requests(id,user_id,prompt,prompt_chars,status,outcome,model,session_id,ip_address,created_at) VALUES($1,$2,$3,$4,'completed','success','gemini-2.5-flash',$5,$6,now()-interval '20 days')",[ids.prompt,target.id,sealText(promptText,'ai_requests.prompt'),promptText.length,ids.pastSession,`${NET}7`]);
});

test('IP addresses stay hidden without the network permission, and prompt text without prompt_content',async({request})=>{
 await db.query('UPDATE r.tracked_sessions SET last_seen_at=now() WHERE id=$1',[ids.liveSession]);
 const read=async(path:string,viewer:Account)=>{const response=await request.get(path,{headers:viewer.headers});expect(response.status(),path).toBe(200);const text=await response.text();return {text,body:JSON.parse(text)};};
 const logs=await read(`/api/admin/logs?user=${target.id}`,redactor);
 expect((logs.body.items as Row[]).map(row=>row.id)).toContain(ids.event);
 expect((logs.body.items as Row[]).every(row=>row.ipAddress===null)).toBe(true);expect(logs.text).not.toContain(NET);
 const sessions=await read(`/api/admin/sessions?user=${target.id}&date=30d`,redactor);
 expect((sessions.body.items as Row[]).map(row=>row.id)).toEqual(expect.arrayContaining([ids.pastSession,ids.liveSession]));
 expect((sessions.body.items as Row[]).every(row=>row.ipAddress===null)).toBe(true);expect(sessions.text).not.toContain(NET);
 const live=await read('/api/admin/live',redactor);
 expect((live.body.sessions as Row[]).map(row=>row.id)).toContain(ids.liveSession);
 expect((live.body.sessions as Row[]).every(row=>row.ipAddress===null)).toBe(true);expect(live.text).not.toContain(NET);
 // A Super Admin sees the same rows with their addresses.
 expect(((await read(`/api/admin/logs?user=${target.id}`,admin)).body.items as Row[]).find(row=>row.id===ids.event)?.ipAddress).toBe(`${NET}7`);
 expect(((await read(`/api/admin/sessions?user=${target.id}&date=30d`,admin)).body.items as Row[]).find(row=>row.id===ids.pastSession)?.ipAddress).toBe(`${NET}7`);
 expect(((await read('/api/admin/live',admin)).body.sessions as Row[]).find(row=>row.id===ids.liveSession)?.ipAddress).toBe(`${NET}8`);
 // Filtering by an address reveals it, so it needs the network permission as well.
 for(const [path,viewer] of [[`/api/admin/logs?ip=${NET}7`,redactor],[`/api/admin/sessions?ip=${NET}7`,redactor],[`/api/admin/prompts?ip=${NET}7`,holders.prompts]] as const){
  expect((await request.get(path,{headers:viewer.headers})).status(),path).toBe(403);
  expect((await request.get(path,{headers:admin.headers})).status(),path).toBe(200);
 }
 // Prompt lists and exports never carry the text; reading it needs prompt_content on top of prompts.
 const prompts=await read(`/api/admin/prompts?user=${target.id}`,admin);
 expect((prompts.body.items as Row[]).map(row=>row.id)).toContain(ids.prompt);expect(prompts.text).not.toContain('solar tracker');
 const exported=await request.get(`/api/admin/prompts/export?format=json&user=${target.id}`,{headers:admin.headers});
 expect(exported.status()).toBe(200);expect(await exported.text()).not.toContain('solar tracker');
 expect(await status(request,`/api/admin/prompts/${ids.prompt}`,holders.prompts)).toBe(403);
 expect(await status(request,`/api/admin/prompts/${ids.prompt}`,holders.prompt_content)).toBe(403);
 const reader=await account('teacher',['prompts','prompt_content']);
 const detail=await request.get(`/api/admin/prompts/${ids.prompt}`,{headers:reader.headers});
 expect(detail.status()).toBe(200);expect(await detail.text()).toContain(promptText);
});

test('every admin endpoint requires sign-in, a non-student account and its own permission',async({request})=>{
 test.setTimeout(240000);
 const endpoints:[string,AdminPermission][]=[
  ['/api/admin/overview','analytics'],['/api/admin/analytics?view=users','analytics'],['/api/admin/live','live'],
  ['/api/admin/users','users'],[`/api/admin/users/${target.id}`,'users'],['/api/admin/sessions','sessions'],
  ['/api/admin/logs','activity'],['/api/admin/logs/export?format=csv','activity'],
  ['/api/admin/prompts','prompts'],['/api/admin/prompts/export?format=json','prompts'],
  ['/api/admin/security','security'],['/api/admin/audit','audit'],['/api/admin/system','system'],
 ];
 for(const [path,permission] of endpoints){
  expect.soft(await status(request,path),`${path} signed out`).toBe(401);
  expect.soft(await status(request,path,student),`${path} as a student`).toBe(403);
  expect.soft(await status(request,path,bare),`${path} as a teacher without permissions`).toBe(403);
  for(const name of PERMISSION_NAMES)expect.soft(await status(request,path,holders[name]),`${path} with only ${name}`).toBe(name===permission?200:403);
  expect.soft(await status(request,path,admin),`${path} as a Super Admin`).toBe(200);
 }
 // The AI view of analytics is prompt data: analytics alone is not enough.
 expect.soft(await status(request,'/api/admin/analytics?view=ai'),'view=ai signed out').toBe(401);
 expect.soft(await status(request,'/api/admin/analytics?view=ai',student),'view=ai as a student').toBe(403);
 expect.soft(await status(request,'/api/admin/analytics?view=ai',holders.analytics),'view=ai with only analytics').toBe(403);
 expect.soft(await status(request,'/api/admin/analytics?view=ai',aiViewer),'view=ai with analytics and prompts').toBe(200);
 expect.soft(await status(request,'/api/admin/analytics?view=ai',admin),'view=ai as a Super Admin').toBe(200);
});

test('ending a session needs the sessions permission and a request from the application',async({request})=>{
 const victim=await account('student'),sessionId=randomUUID();
 await db.query("INSERT INTO r.tracked_sessions(id,kind,user_id,started_at,last_seen_at,ip_address) VALUES($1,'authenticated',$2,now()-interval '5 minutes',now(),$3)",[sessionId,victim.id,`${NET}9`]);
 await db.query('UPDATE r.sessions SET tracked_session_id=$1 WHERE user_id=$2',[sessionId,victim.id]);
 const path=`/api/admin/sessions/${sessionId}/revoke`;
 const post=async(headers:Record<string,string>)=>(await request.post(path,{headers,data:{}})).status();
 expect(await post({origin})).toBe(401);
 expect(await post(student.headers)).toBe(403);
 expect(await post(bare.headers)).toBe(403);
 expect(await post(holders.live.headers)).toBe(403);
 expect(await post({...holders.sessions.headers,origin:'https://attacker.example'})).toBe(403);
 expect(await post({cookie:holders.sessions.headers.cookie})).toBe(403);
 expect((await db.query('SELECT ended_at FROM r.tracked_sessions WHERE id=$1',[sessionId]))[0].ended_at).toBeNull();
 expect(await post(holders.sessions.headers)).toBe(200);
 const [ended]=await db.query('SELECT ended_at,end_reason FROM r.tracked_sessions WHERE id=$1',[sessionId]);
 expect(ended.ended_at).not.toBeNull();expect(ended.end_reason).toBe('revoked');
 expect((await request.get('/api/workspace',{headers:victim.headers})).status()).toBe(401);
});

test('data retention and cleanup are Super Admin only, and retention values are checked',async({request})=>{
 const valid={activityDays:90,sessionDays:30,securityDays:180};
 const patch=async(data:unknown,headers:Record<string,string>)=>(await request.patch('/api/admin/system/retention',{headers,data})).status();
 const prune=async(viewer:Account)=>(await request.post('/api/admin/system/prune',{headers:viewer.headers})).status();
 for(const viewer of [student,bare,holders.system]){expect(await patch(valid,viewer.headers)).toBe(403);expect(await prune(viewer)).toBe(403);}
 expect(await patch(valid,{...admin.headers,origin:'https://attacker.example'})).toBe(403);
 for(const invalid of [{...valid,activityDays:6},{...valid,activityDays:731},{...valid,sessionDays:0},{...valid,sessionDays:366},{...valid,securityDays:29},{...valid,securityDays:731},{...valid,activityDays:90.5},{...valid,activityDays:'90'},{activityDays:90}])
  expect(await patch(invalid,admin.headers),JSON.stringify(invalid)).toBe(400);
 expect(await status(request,'/api/admin/system/retention',admin)).toBe(404);
 expect((await request.post('/api/admin/system',{headers:admin.headers})).status()).toBe(404);
});

test('unknown ids, malformed ids and unknown sections are refused cleanly',async({request})=>{
 expect(await status(request,`/api/admin/users/${randomUUID()}`,admin)).toBe(404);
 expect(await status(request,'/api/admin/users/not-a-uuid',admin)).toBe(400);
 expect(await status(request,'/api/admin/nope',admin)).toBe(404);
 expect(await status(request,'/api/admin/system/nope',admin)).toBe(404);
 expect(await status(request,'/api/admin/logs/nope',admin)).toBe(404);
 expect(await status(request,`/api/admin/prompts/${randomUUID()}`,admin)).toBe(404);
 expect(await status(request,'/api/admin/prompts/not-a-uuid',admin)).toBe(404);
 // A permission for one section never opens another by path tricks.
 expect(await status(request,'/api/admin/system/../logs',holders.system)).toBe(403);
});

test('hostile filter values are rejected or treated as plain text, never as SQL',async({request})=>{
 test.setTimeout(180000);
 const hostile={q:"' OR 1=1 --",sort:'created_at;DROP TABLE x',dir:'asc;--',date:"7d' --",user:"1' OR '1'='1",session:"x'; SELECT pg_sleep(5) --"};
 const endpoints=['logs','logs/export','prompts','security','security?source=errors','audit','sessions','users','overview','analytics?view=users','live'];
 for(const endpoint of endpoints){
  const [base,preset='']=endpoint.split('?');
  for(const key of [...Object.keys(hostile),'all']){
   const params=new URLSearchParams(preset);
   for(const [name,value] of Object.entries(hostile))if(key==='all'||key===name)params.set(name,value);
   const response=await request.get(`/api/admin/${base}?${params}`,{headers:admin.headers});
   expect.soft(response.status(),`${endpoint} with hostile ${key}`).toBeLessThan(500);
  }
 }
 const [row]=await db.query<{n:number}>('SELECT count(*)::int AS n FROM r.users');expect(row.n).toBeGreaterThan(0);
});

test('public and member APIs carry no tracking, device or network fields',async({request})=>{
 const words=['ip_address','ipaddress','user_agent','useragent','tracked_session','visitor'];
 const keysOf=(value:unknown,found:string[]=[]):string[]=>{
  if(Array.isArray(value))for(const item of value)keysOf(item,found);
  else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){found.push(key.toLowerCase());keysOf(item,found);}
  return found;
 };
 for(const path of ['/api/projects',`/api/projects/${SAMPLE_PROJECT_ID}`,'/api/workspace','/api/auth/me','/api/settings']){
  const response=await request.get(path,{headers:target.headers});expect(response.status(),path).toBe(200);
  const text=await response.text();
  for(const word of ['ip_address','ipAddress','user_agent','userAgent','tracked_session'])expect.soft(text,`${path} mentions ${word}`).not.toContain(word);
  const keys=keysOf(JSON.parse(text));
  for(const word of words)expect.soft(keys.filter(key=>key.includes(word)),`${path} keys containing ${word}`).toEqual([]);
  expect.soft(text,`${path} contains a seeded address`).not.toContain(NET);
 }
});

test('admin pages show students the reviewer gate and request no admin data',async({page,context})=>{
 const succeeded:string[]=[];
 page.on('response',response=>{const url=new URL(response.url());if(url.pathname.startsWith('/api/admin')&&response.ok())succeeded.push(url.pathname);});
 await context.addCookies([{name:'repoggits_session',value:student.token,url:origin}]);
 for(const path of ['/admin/logs','/admin/users','/admin/sessions','/admin/system']){
  await page.goto(path);
  await expect(page.getByText('This space is reserved for assigned reviewers.'),path).toBeVisible();
 }
 // A Teacher-Admin without the section's permission gets a notice instead of the page.
 await context.clearCookies();await context.addCookies([{name:'repoggits_session',value:bare.token,url:origin}]);
 await page.goto('/admin/system');
 await expect(page.getByText('You do not have permission to open this part of the admin panel.')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Data retention'})).toHaveCount(0);
 expect(succeeded).toEqual([]);
});
