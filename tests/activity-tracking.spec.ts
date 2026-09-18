import {test,expect} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {db,migrate} from '../lib/db';
import {hashToken} from '../lib/auth';
import {storedEmail} from '../lib/encryption';

// lib/tracking/index.ts (recordEvent, activityRoute, startTrackedSession) and the consent-gated browser tracker
// (components/platform/ActivityTracker.tsx). The core regression this guards: a browser that is already signed in
// with an r.sessions row that predates this feature (no tracked_session_id yet) must start showing as online in
// Admin > Live monitoring the moment it sends its first activity beacon, without needing to sign out and back in.

test.beforeAll(async()=>{await migrate();});

const DESKTOP_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const IPHONE_UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function account(role:'student'|'teacher'|'superadmin'){
 const id=randomUUID(),token=randomBytes(32).toString('hex'),email=`activity-${id.slice(0,8)}@example.test`,sealed=storedEmail(email);
 await db.query("INSERT INTO r.users(id,email,email_hash,name,role,verified,scopes,profile) VALUES($1,$2,$3,$4,$5,true,'[]','{}')",[id,sealed.email,sealed.emailHash,`Activity ${role} ${id.slice(0,8)}`,role]);
 await db.query("INSERT INTO r.sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hashToken(token),id]);
 return {id,token,headers:{origin:process.env.APP_ORIGIN!,cookie:`repoggits_session=${token}`}};
}
type Json=Record<string,any>;

test('a pre-existing signed-in session with no tracked_session_id yet is linked by its first beacon and shows online',async({request})=>{
 const superadmin=await account('superadmin');
 const person=await account('student');
 // Sanity: this is the bug — a session row from before the tracker existed has no link yet.
 const [before]=await db.query('SELECT tracked_session_id FROM r.sessions WHERE hash=$1',[hashToken(person.token)]);
 expect(before.tracked_session_id).toBeNull();

 const res=await request.post('/api/activity',{
  headers:{...person.headers,'user-agent':DESKTOP_UA},
  data:{kind:'pageview',page:'/projects',screen:{width:1280,height:800},pixelRatio:2,touch:false,language:'en-US',timezone:'UTC',networkOnline:true,referrer:'https://example.com/'},
 });
 expect(res.status()).toBe(204);

 const [after]=await db.query('SELECT tracked_session_id FROM r.sessions WHERE hash=$1',[hashToken(person.token)]);
 expect(after.tracked_session_id).toBeTruthy();

 const live:Json=await (await request.get('/api/admin/live',{headers:superadmin.headers})).json();
 const session=live.sessions.find((s:Json)=>s.id===after.tracked_session_id);
 expect(session).toMatchObject({status:'online',kind:'authenticated',user:{id:person.id},deviceType:'desktop',os:'Windows',browser:'Chrome',currentPath:'/projects'});

 // A second beacon (a heartbeat) reuses the same tracked session and does not insert a second PAGE_VIEW.
 await request.post('/api/activity',{headers:{...person.headers,'user-agent':DESKTOP_UA},data:{kind:'heartbeat',page:'/projects',screen:{width:1280,height:800},pixelRatio:2,touch:false,language:'en-US',timezone:'UTC',networkOnline:true}});
 const [again]=await db.query('SELECT tracked_session_id FROM r.sessions WHERE hash=$1',[hashToken(person.token)]);
 expect(again.tracked_session_id).toBe(after.tracked_session_id);
 const pageViews=await db.query("SELECT id FROM r.activity_events WHERE session_id=$1 AND event_type='PAGE_VIEW'",[after.tracked_session_id]);
 expect(pageViews).toHaveLength(1);
});

test('an anonymous beacon sets a first-party visitor cookie holding only a hash, and shows up as an anonymous visitor',async({request})=>{
 const superadmin=await account('superadmin');
 const res=await request.post('/api/activity',{
  headers:{origin:process.env.APP_ORIGIN!,'user-agent':IPHONE_UA},
  data:{kind:'pageview',page:'/explore',screen:{width:390,height:844},pixelRatio:3,touch:true,language:'en-GB',timezone:'Europe/London',networkOnline:true,referrer:'https://google.com/'},
 });
 expect(res.status()).toBe(204);
 const setCookie=res.headers()['set-cookie']||'';
 expect(setCookie).toContain('repoggits_visitor=');
 expect(setCookie).toMatch(/HttpOnly/i);
 const rawToken=/repoggits_visitor=([a-f0-9]{64})/.exec(setCookie)?.[1];
 expect(rawToken).toBeTruthy();
 // Only the hash is ever stored — the raw cookie value itself must not appear as a row.
 expect(await db.query('SELECT 1 FROM r.visitors WHERE token_hash=$1',[rawToken])).toHaveLength(0);
 const [visitor]=await db.query('SELECT id FROM r.visitors WHERE token_hash=$1',[hashToken(rawToken!)]);
 expect(visitor).toBeTruthy();

 const live:Json=await (await request.get('/api/admin/live',{headers:superadmin.headers})).json();
 const session=live.sessions.find((s:Json)=>s.visitorId===visitor.id);
 expect(session).toMatchObject({status:'online',kind:'anonymous',user:null,deviceType:'mobile',os:'iOS',browser:'Safari'});
});

test('a malformed or nonsense activity payload is dropped silently and never errors',async({request})=>{
 const bad=await request.post('/api/activity',{headers:{origin:process.env.APP_ORIGIN!},data:{kind:'not-a-real-kind',projectId:'<script>evil</script>'}});
 expect(bad.status()).toBe(204);
 const notJson=await request.post('/api/activity',{headers:{origin:process.env.APP_ORIGIN!,'content-type':'application/json'},data:'not json at all'});
 expect(notJson.status()).toBe(204);
});

test('the browser tracker sends nothing before a cookie choice, then starts immediately once analytics is accepted — no reload needed',async({page})=>{
 const activityRequests:string[]=[];
 page.on('request',req=>{if(req.url().includes('/api/activity'))activityRequests.push(req.url());});
 await page.goto('/');
 await expect(page.locator('.cookie-banner')).toBeVisible();
 await page.waitForTimeout(1500);
 expect(activityRequests).toHaveLength(0);
 await page.getByRole('button',{name:'Accept all'}).click();
 await expect.poll(()=>activityRequests.length,{timeout:10000}).toBeGreaterThan(0);
});

test('declining analytics cookies means no beacon and no visitor cookie for that browser',async({page})=>{
 const activityRequests:string[]=[];
 page.on('request',req=>{if(req.url().includes('/api/activity'))activityRequests.push(req.url());});
 await page.goto('/');
 await page.getByRole('button',{name:'Reject non-essential'}).click();
 await page.waitForTimeout(1500);
 await page.reload();
 await page.waitForTimeout(1500);
 expect(activityRequests).toHaveLength(0);
 expect((await page.context().cookies()).some(c=>c.name==='repoggits_visitor')).toBe(false);
});

// A signed-in visitor is account/security information for the admins already running this platform, not
// third-party analytics, so their presence tracks regardless of the analytics cookie choice — only anonymous
// visitors are gated on it (the two tests above).
test('a signed-in visitor sends beacons and shows online even without accepting analytics cookies',async({page,request})=>{
 const person=await account('student');
 const superadmin=await account('superadmin');
 await page.context().addCookies([{name:'repoggits_session',value:person.token,url:process.env.APP_ORIGIN}]);
 const activityRequests:string[]=[];
 page.on('request',req=>{if(req.url().includes('/api/activity'))activityRequests.push(req.url());});

 const firstBeacon=page.waitForResponse(res=>res.url().includes('/api/activity')&&res.request().method()==='POST');
 await page.goto('/');
 // Deliberately left unanswered: analytics consent is null, not accepted, yet a beacon still goes out.
 await expect(page.locator('.cookie-banner')).toBeVisible();
 await firstBeacon;
 expect(activityRequests.length).toBeGreaterThan(0);
 // The response above only confirms the request completed, not that its DB write (inside a transaction) has
 // settled by the time this next query runs, so poll rather than reading once.
 await expect.poll(async()=>{
  const [row]=await db.query('SELECT tracked_session_id FROM r.sessions WHERE hash=$1',[hashToken(person.token)]);
  return row.tracked_session_id;
 },{timeout:5000}).toBeTruthy();
 const [linked]=await db.query('SELECT tracked_session_id FROM r.sessions WHERE hash=$1',[hashToken(person.token)]);
 const live:Json=await (await request.get('/api/admin/live',{headers:superadmin.headers})).json();
 expect(live.sessions.find((s:Json)=>s.id===linked.tracked_session_id)).toMatchObject({status:'online',kind:'authenticated',user:{id:person.id}});

 // Explicitly declining must not stop it either — only an anonymous visitor's tracking is consent-gated.
 activityRequests.length=0;
 await page.getByRole('button',{name:'Reject non-essential'}).click();
 await page.reload();
 await expect.poll(()=>activityRequests.length,{timeout:10000}).toBeGreaterThan(0);
});
