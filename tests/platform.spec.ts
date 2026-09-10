import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db, pool, migrate } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { emptyProject, projectSchema, type ProjectData } from '../lib/schema';
import { zipFixture } from './helpers/zip';
import sharp from 'sharp';
import { seedSample, SAMPLE_PROJECT_ID } from '../scripts/sample-data';
import { validateZip } from '../lib/file-validation';
import { readArchive } from './helpers/read-archive';
import { readFileSync } from 'node:fs';

const password='a long test passphrase for makers';
const origin=process.env.APP_ORIGIN!;
const headers={origin};
let student:APIRequestContext,outsider:APIRequestContext,teacher:APIRequestContext,teacherTwo:APIRequestContext,otherTeacher:APIRequestContext,admin:APIRequestContext;
let showcaseId='',showcaseVersionId='',modifiedId='',modifiedVersionId='';
let showcaseData:ProjectData;
let projectId='',versionId='',teacherId='',outsiderId='',studentId='',sourceId='',foreignSourceId='';
const data={...emptyProject,title:'Accessible campus navigator',summary:'A navigation tool that helps everyone find accessible routes.',description:'This project maps accessible campus paths and combines sensor readings with clear directions for students and visitors.',subject:'Final Year Project',teamName:'Campus makers',tags:['TypeScript','Sensors'],team:[{name:'Student Maker',email:'student@example.test',contribution:'Project lead'}]};
test.describe.configure({mode:'serial'});
test.beforeAll(async({playwright})=>{
  await migrate();
  const hashed=await hashPassword(password);
  async function account(email:string,role='student',scopes:string[]=[]) {
    const id=randomUUID();await db.query('INSERT INTO r.users(id,email,password_hash,name,role,verified,scopes,profile) VALUES($1,$2,$3,$4,$5,false,$6,$7)',[id,email,hashed,email.split('@')[0],role,JSON.stringify(scopes),JSON.stringify({name:email.split('@')[0]})]);
    const client=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:headers});
    const login=await client.post('/api/auth/login',{data:{email,password}});expect(login.status()).toBe(200);return {id,client};
  }
  ({id:studentId,client:student}=await account('student@example.test'));
  ({id:outsiderId,client:outsider}=await account('outsider@example.test'));
  ({id:teacherId,client:teacher}=await account('teacher@example.test','teacher',['department:Computer Science']));
  ({client:teacherTwo}=await account('second@example.test','teacher',['subject:Final Year Project']));
  ({client:otherTeacher}=await account('unassigned@example.test','teacher',['department:Electrical Engineering']));
  ({client:admin}=await account('admin@example.test','superadmin'));
  // Pre-scanned storage fixtures isolate download authorization from scanner tests.
  sourceId=randomUUID();foreignSourceId=randomUUID();
  const archive=zipFixture('README.md',Buffer.from('A source code fixture for download authorization.'));
  for(const [id,owner] of [[sourceId,studentId],[foreignSourceId,outsiderId]])await db.query("INSERT INTO r.files(id,owner_id,filename,mime,size,content,scan_status) VALUES($1,$2,'source.zip','application/zip',$3,$4,'clean')",[id,owner,archive.length,archive]);
  data.sourceId=sourceId;
});
test.afterAll(async()=>{await Promise.all([student,outsider,teacher,teacherTwo,otherTeacher,admin].filter(Boolean).map(client=>client.dispose()));await pool().end();});

test('website backup is restricted to Super Admin and downloads from the panel',async({page,request})=>{
  expect((await request.post('/api/admin/backup',{headers})).status()).toBe(401);
  expect((await student.post('/api/admin/backup')).status()).toBe(403);
  expect((await teacher.post('/api/admin/backup')).status()).toBe(403);
  expect((await admin.post('/api/admin/backup',{headers:{origin:'https://other.example'}})).status()).toBe(403);
  await page.context().addCookies((await admin.storageState()).cookies);
  await page.goto('/admin');
  await page.getByRole('tab',{name:'Backups',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download website backup',exact:true}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/^repoggits-website-.*\.zip$/);
  const contents=await readArchive(readFileSync((await download.path())!));
  expect(contents.has('repoggits/package-lock.json')).toBe(true);
  expect(contents.has('repoggits/app/page.tsx')).toBe(true);
  expect(contents.has('repoggits/.env.example')).toBe(true);
  expect([...contents.keys()].some(name=>/\/(node_modules|\.git|\.next|\.local|test-results)\//.test(name)||name.endsWith('.env.local'))).toBe(false);
  expect((await db.query("SELECT id FROM r.audit WHERE action='website.backup'"))).toHaveLength(1);
});

test('sample contains real media and a protected complete source archive',async({request})=>{
  expect((await seedSample()).created).toBe(true);
  expect((await seedSample()).created).toBe(false);
  const response=await student.get(`/api/projects/${SAMPLE_PROJECT_ID}`);
  expect(response.status()).toBe(200);
  const detail=await response.json(),d=detail.project.version.data;
  expect(detail.project.example).toBe(true);expect(detail.editable).toBe(false);
  expect(d.team.map((m:{college:string})=>m.college)).toEqual(['GGITS','GGCT']);
  expect(d.galleryIds).toHaveLength(4);expect(d.github).toBe('');
  for(const id of [d.coverId,...d.galleryIds,...d.team.map((m:{photoId:string})=>m.photoId)]){
    const photo=await request.get(`/api/files/${id}`);expect(photo.status()).toBe(200);
    expect((await sharp(await photo.body()).metadata()).width).toBeGreaterThan(100);
  }
  expect((await request.get(`/api/files/${d.sourceId}/sign`)).status()).toBe(401);
  const signed=await student.get(`/api/files/${d.sourceId}/sign`);expect(signed.status()).toBe(200);
  const archive=await student.get((await signed.json()).url);expect(archive.status()).toBe(200);
  await validateZip(await archive.body());
  expect((await archive.body()).equals(readFileSync('examples/campusflow/campusflow-source.zip'))).toBe(true);
  expect((await db.query('SELECT scan_status FROM r.files WHERE id=$1',[d.sourceId]))[0].scan_status).toBe('trusted_sample');
});

test('sample video plays and live demo persists a new task',async({page})=>{
  await seedSample();
  await page.context().addCookies((await student.storageState()).cookies);
  await page.goto(`/projects/${SAMPLE_PROJECT_ID}?play=1`);
  await expect(page.getByRole('heading',{level:1})).toContainText('CampusFlow');
  await expect(page.getByText('Sample project with a fictional team',{exact:false})).toBeVisible();
  await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Show project photo 2',exact:true}).click();
  await expect.poll(()=>page.locator('.media-photo').evaluate((v:HTMLImageElement)=>v.naturalWidth)).toBeGreaterThan(100);
  await expect(page.locator('.team-profile')).toHaveCount(2);
  await page.locator('.team-grid').scrollIntoViewIfNeeded();
  for(const photo of await page.locator('.team-profile img').all())await expect.poll(()=>photo.evaluate((v:HTMLImageElement)=>v.naturalWidth)).toBeGreaterThan(100);
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:'test-results/sample-project-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/sample-project-mobile.png',fullPage:true});
  await page.goto('/samples/campusflow/index.html');
  await page.locator('#new-task').click();
  await page.getByLabel('Task title').fill('Sample regression task');
  await page.getByRole('button',{name:'Add to our notebook',exact:false}).click();
  await expect(page.getByText('Sample regression task',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText('Sample regression task',{exact:true})).toBeVisible();
});

test('registration works without verification and single-use password reset revokes sessions',async({playwright})=>{
  const client=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:headers});
  expect((await client.post('/api/auth/register',{data:{name:'New Maker',email:'new@example.test',password}})).status()).toBe(202);
  expect(await db.query('SELECT id FROM r.outbox WHERE recipient=$1',['new@example.test'])).toHaveLength(0);
  expect((await client.post('/api/auth/login',{data:{email:'new@example.test',password}})).status()).toBe(200);
  expect(await (await client.get('/api/auth/me')).json()).toMatchObject({user:{verified:false},emailVerificationRequired:false});
  expect((await client.post('/api/projects',{data:{data:{...data,sourceId:''},submit:false}})).status()).toBe(201);
  expect((await client.post('/api/auth/resend',{data:{}})).status()).toBe(200);
  expect(await db.query('SELECT id FROM r.outbox WHERE recipient=$1',['new@example.test'])).toHaveLength(0);
  expect((await client.post('/api/auth/forgot',{data:{email:'new@example.test'}})).status()).toBe(200);
  const [resetMail]=await db.query('SELECT body FROM r.outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1',['new@example.test']);
  const resetToken=resetMail.body.match(/token=([a-f0-9]+)/)[1];
  expect((await client.post('/api/auth/reset',{data:{token:resetToken,password:'a different long password for testing'}})).status()).toBe(200);
  expect((await client.post('/api/auth/reset',{data:{token:resetToken,password:'another long password for testing'}})).status()).toBe(400);
  expect((await (await client.get('/api/auth/me')).json()).user).toBeNull();
  expect((await client.post('/api/auth/login',{data:{email:'new@example.test',password}})).status()).toBe(401);
  await client.dispose();
});

test('authorization and origin checks reject forged requests',async({request})=>{
  expect((await request.post('/api/projects',{headers,data:{data}})).status()).toBe(401);
  expect((await student.post('/api/projects',{headers:{origin:'https://evil.example'},data:{data}})).status()).toBe(403);
  expect((await student.get('/api/admin')).status()).toBe(403);
  expect((await student.patch('/api/admin/users',{data:{id:studentId,role:'superadmin',scopes:[],suspended:false}})).status()).toBe(403);
});

test('drafts are private, validated and immutable once submitted',async({request})=>{
  expect((await student.post('/api/projects',{data:{data:{...data,sourceId:foreignSourceId},submit:false}})).status()).toBe(403);
  const created=await student.post('/api/projects',{data:{data,submit:false,changelog:'Initial accessible campus prototype'}});expect(created.status()).toBe(201);
  ({id:projectId,versionId}=await created.json());
  expect((await request.get(`/api/projects/${projectId}`)).status()).toBe(401);
  expect((await outsider.get(`/api/projects/${projectId}`)).status()).toBe(404);
  expect((await outsider.patch(`/api/versions/${versionId}`,{data:{data,submit:true,changelog:'Attempted unauthorized update'}})).status()).toBe(404);
  expect((await student.patch(`/api/versions/${versionId}`,{data:{data:{...data,summary:'Too short'},submit:true,changelog:'Initial prototype'}})).status()).toBe(400);
  expect((await student.patch(`/api/versions/${versionId}`,{data:{data,submit:true,changelog:'Initial accessible campus prototype'}})).status()).toBe(200);
  expect((await student.patch(`/api/versions/${versionId}`,{data:{data,submit:false,changelog:'Bypass moderation'}})).status()).toBe(409);
  // Pending (not yet approved) submissions must never leak into public discovery. The sample
  // project seeded earlier in this file is legitimately public, so assert absence, not emptiness.
  const {projects:publicList}=await (await outsider.get('/api/projects')).json();
  expect((publicList as {id:string}[]).some(p=>p.id===projectId)).toBe(false);
});

test('changelog whitespace is trimmed on save so browser draft recovery does not see a false mismatch',async()=>{
  const created=await student.post('/api/projects',{data:{data,submit:false,changelog:'  Padded changelog text  '}});
  expect(created.status()).toBe(201);
  const {id,versionId:vId}=await created.json();
  const stored=await (await student.get(`/api/projects/${id}`)).json();
  // The client (Submit.tsx) recomputes its recovery baseline with changelog.trim() right after
  // saving — if the server kept the padding, the next load would see a different value and
  // wrongly report "This draft changed in your account", discarding a valid local recovery copy.
  expect(stored.project.version.changelog).toBe('Padded changelog text');
  const updated=await student.patch(`/api/versions/${vId}`,{data:{data,submit:false,changelog:'\tTabbed and newline\n'}});
  expect(updated.status()).toBe(200);
  const restored=await (await student.get(`/api/projects/${id}`)).json();
  expect(restored.project.version.changelog).toBe('Tabbed and newline');
});

test('only assigned educators can review and rejection requires a reason',async()=>{
  const review={ids:[versionId],action:'approve',reason:''};
  expect((await student.post('/api/admin/reviews',{data:review})).status()).toBe(403);
  expect((await otherTeacher.post('/api/admin/reviews',{data:review})).status()).toBe(404);
  expect((await teacher.post('/api/admin/reviews',{data:{...review,action:'reject'}})).status()).toBe(400);
  expect((await teacher.post('/api/admin/reviews',{data:{...review,action:'changes_requested',reason:'Please explain the routing algorithm in more detail.'}})).status()).toBe(200);
  const workspace=await (await student.get('/api/workspace')).json();expect(workspace.notifications[0].message).toContain('changes requested');
  expect((await student.patch(`/api/versions/${versionId}`,{data:{data,submit:true,changelog:'Explained the routing algorithm in detail'}})).status()).toBe(200);
  expect((await teacher.post('/api/admin/reviews',{data:review})).status()).toBe(200);
});

test('published versions hide team emails, bookmarks and comments persist',async({request})=>{
  // Viewing projects requires an account; a signed-out visitor is turned away before any data is returned.
  expect((await request.get(`/api/projects/${projectId}`)).status()).toBe(401);
  expect((await request.get('/api/projects')).status()).toBe(401);
  const publicDetail=await (await outsider.get(`/api/projects/${projectId}`)).json();
  expect(publicDetail.project.version.data.team[0].email).toBe('');
  const publicList=await (await outsider.get('/api/projects')).json();expect(publicList.projects[0].version.data.team[0].email).toBe('');
  expect((await outsider.post(`/api/projects/${projectId}/bookmark`,{data:{saved:true}})).status()).toBe(200);
  expect((await (await outsider.get('/api/workspace')).json()).saved).toHaveLength(1);
  expect((await outsider.post(`/api/projects/${projectId}/comments`,{data:{body:'Does this support step-free indoor routes?'}})).status()).toBe(201);
  expect((await (await outsider.get(`/api/projects/${projectId}`)).json()).comments[0].body).toContain('step-free');
});

test('source downloads require a signed-in session and a valid user-bound expiring signature',async({request})=>{
  expect((await request.get(`/api/files/${sourceId}`)).status()).toBe(401);
  expect((await student.get(`/api/files/${sourceId}`)).status()).toBe(403);
  const signed=await student.get(`/api/files/${sourceId}/sign`);expect(signed.status()).toBe(200);
  const {url}=await signed.json();
  const download=await student.get(url);expect(download.status()).toBe(200);expect(download.headers()['content-disposition']).toContain('attachment');
  expect((await outsider.get(url)).status()).toBe(403);
  expect((await student.get(url.replace(/expires=\d+/, 'expires=1'))).status()).toBe(403);
});

test('built-in validator accepts images and ZIPs and rejects unsafe files',async()=>{
  const image=await sharp({create:{width:2,height:2,channels:3,background:'#3059b5'}}).png().toBuffer();
  const before=await db.query('SELECT id FROM r.files WHERE owner_id=$1',[studentId]);
  const result=await student.post('/api/upload',{headers:{'Content-Type':'application/octet-stream','X-Filename':'cover.png'},data:image});
  expect(result.status()).toBe(201);
  const uploaded=await result.json();
  expect((await db.query('SELECT scan_status FROM r.files WHERE id=$1',[uploaded.id]))[0].scan_status).toBe('validated_internal');
  const archive=await student.post('/api/upload',{headers:{'Content-Type':'application/octet-stream','X-Filename':'source.zip'},data:zipFixture('main.ts',Buffer.from('export const value = 1;'))});
  expect(archive.status()).toBe(201);
  const draft=await student.post('/api/projects',{data:{data:{...data,coverId:uploaded.id,sourceId:(await archive.json()).id},submit:false}});
  expect(draft.status()).toBe(201);
  const rejected=await student.post('/api/upload',{headers:{'Content-Type':'application/octet-stream','X-Filename':'bad.zip'},data:zipFixture('fake.txt',Buffer.from('MZ executable'))});
  expect(rejected.status()).toBe(400);
  expect(await db.query('SELECT id FROM r.files WHERE owner_id=$1',[studentId])).toHaveLength(before.length+2);
});

test('gallery thumbnail is not shown as active when there is no cover photo',async({page})=>{
  const galleryImage=await sharp({create:{width:4,height:4,channels:3,background:'#f27e51'}}).png().toBuffer();
  const uploaded=await(await student.post('/api/upload',{headers:{'Content-Type':'application/octet-stream','X-Filename':'gallery.png'},data:galleryImage})).json();
  const created=await student.post('/api/projects',{data:{data:{...data,coverId:'',galleryIds:[uploaded.id]},submit:true,changelog:'A project with a gallery photo but no cover image'}});
  expect(created.status()).toBe(201);
  const {id,versionId:noCoverVersionId}=await created.json();
  expect((await teacher.post('/api/admin/reviews',{data:{ids:[noCoverVersionId],action:'approve',reason:''}})).status()).toBe(200);
  await page.context().addCookies((await student.storageState()).cookies);
  await page.goto(`/projects/${id}`);
  // With no cover image, the media stage shows the generated placeholder art (not the gallery
  // photo), so the "Photo 1" thumbnail must not report itself as the active selection.
  await expect(page.locator('.media-stage .project-art')).toBeVisible();
  await expect(page.getByRole('button',{name:'Show project photo 1',exact:true})).toHaveAttribute('aria-pressed','false');
});

test('built-in upload picker attaches a cover and source archive',async({page})=>{
  await page.context().addCookies((await student.storageState()).cookies);
  await page.goto('/submit');
  const cover=page.getByLabel('Cover image',{exact:true});
  await expect(cover).toBeEnabled();
  const image=await sharp({create:{width:8,height:8,channels:3,background:'#3059b5'}}).png().toBuffer();
  await cover.setInputFiles({name:'cover.png',mimeType:'image/png',buffer:image});
  await expect(page.getByAltText('Uploaded preview',{exact:true})).toBeVisible();
  await page.getByLabel('Source code ZIP',{exact:true}).setInputFiles({name:'source.zip',mimeType:'application/zip',buffer:zipFixture('README.md',Buffer.from('Working source example'))});
  await expect(page.getByText('Source archive attached',{exact:true})).toBeVisible();
  await page.getByLabel('Project title',{exact:true}).fill('Refresh-safe project');
  await page.getByRole('textbox',{name:'Full story',exact:true}).fill('My unfinished project description');
  await page.getByLabel('Demo video URL',{exact:false}).fill('https://unfinished');
  await page.getByRole('combobox',{name:'College',exact:true}).selectOption('GGCT');
  await page.reload();
  await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('Refresh-safe project');
  await expect(page.getByRole('textbox',{name:'Full story',exact:true})).toHaveValue('My unfinished project description');
  await expect(page.getByRole('combobox',{name:'College',exact:true})).toHaveValue('GGCT');
  await expect(page.getByAltText('Uploaded preview',{exact:true})).toBeVisible();
  await expect(page.getByText('Source archive attached',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.locator('.notice[role="status"]')).toContainText('Draft saved to your account');
  await page.getByLabel('Project title',{exact:true}).fill('Later unsaved edit');
  await page.reload();
  await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('Later unsaved edit');
  await page.goto('/submit');
  await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('');
});

test('draft recovery isolates accounts and reports unavailable storage',async({page})=>{
  await page.context().addCookies((await student.storageState()).cookies);
  await page.goto('/submit');
  await page.getByLabel('Project title',{exact:true}).fill('Private unfinished idea');
  await page.context().clearCookies();
  await page.context().addCookies((await outsider.storageState()).cookies);
  await page.reload();
  await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('');
  await page.context().clearCookies();
  await page.context().addCookies((await student.storageState()).cookies);
  await page.reload();
  await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('Private unfinished idea');
  await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Storage full','QuotaExceededError');};});
  await page.reload();
  await page.getByLabel('Project title',{exact:true}).fill('Still editable');
  await expect(page.locator('.draft-recovery-status')).toContainText('Browser storage is unavailable or full');
  await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('Still editable');
});

test('new versions need two distinct approvals while old versions remain published',async()=>{
  expect((await admin.patch('/api/admin/settings',{data:{requiredApprovals:2,departments:['Computer Science','Electrical Engineering'],subjects:['Final Year Project'],tags:['TypeScript']}})).status()).toBe(200);
  const next=await (await student.post(`/api/projects/${projectId}/versions`,{data:{}})).json();
  const newData={...data,title:'Accessible campus navigator v2'};
  expect((await student.patch(`/api/versions/${next.versionId}`,{data:{data:newData,submit:true,changelog:'Added indoor step-free routing support'}})).status()).toBe(200);
  expect((await (await outsider.get(`/api/projects/${projectId}`)).json()).project.version.id).toBe(versionId);
  const review={ids:[next.versionId],action:'approve',reason:''};
  expect((await teacher.post('/api/admin/reviews',{data:review})).status()).toBe(200);
  expect((await teacher.post('/api/admin/reviews',{data:review})).status()).toBe(409);
  expect((await (await outsider.get(`/api/projects/${projectId}`)).json()).project.version.id).toBe(versionId);
  expect((await teacherTwo.post('/api/admin/reviews',{data:review})).status()).toBe(200);
  const published=await (await outsider.get(`/api/projects/${projectId}`)).json();expect(published.project.version.id).toBe(next.versionId);expect(published.versions).toHaveLength(2);
  expect((await (await outsider.get(`/api/projects/${projectId}?version=${versionId}`)).json()).project.version.data.title).toBe(data.title);
});

test('project stories preserve team portraits, colleges, services and private media permissions',async({request})=>{
  const ids=[randomUUID(),randomUUID(),randomUUID()];
  const picture=await sharp({create:{width:240,height:180,channels:3,background:'#3059b5'}}).webp().toBuffer();
  for(const id of ids)await db.query("INSERT INTO r.files(id,owner_id,filename,mime,size,content,scan_status) VALUES($1,$2,'photo.webp','image/webp',$3,$4,'clean')",[id,studentId,picture.length,picture]);
  showcaseData=projectSchema.parse({...data,title:'Solar lab monitor',type:'Hybrid',features:['Live power monitoring','Alerts when a sensor stops responding'],videoUrl:'https://www.youtube.com/watch?v=aqz-KE-bpKQ',coverId:ids[0],galleryIds:[ids[1]],team:[{name:'Student Maker',email:'student@example.test',contribution:'Hardware and backend',branch:'Computer Science',semester:'6',college:'GGITS',photoId:ids[2]}],startDate:'2026-08-01',endDate:'2026-08-15',stack:{...data.stack,languages:'TypeScript, C++'},services:[{name:'Neon',purpose:'Stores sensor measurements',url:'https://neon.tech'}],hardwareCosts:[{name:'Solar sensor',quantity:2,unitCost:250}],softwareCosts:[{name:'Cloud hosting',amount:100}],openSource:false});
  expect((await outsider.post('/api/projects',{data:{data:showcaseData}})).status()).toBe(403);
  expect((await student.post('/api/projects',{data:{data:{...showcaseData,team:[{...showcaseData.team[0],photoId:sourceId}]}}})).status()).toBe(400);
  const created=await student.post('/api/projects',{data:{data:showcaseData,submit:true,changelog:'Initial solar monitoring prototype'}});expect(created.status()).toBe(201);
  ({id:showcaseId,versionId:showcaseVersionId}=await created.json());
  expect((await request.get('/api/files/'+ids[2])).status()).toBe(404);
  for(const reviewer of [teacher,teacherTwo])expect((await reviewer.post('/api/admin/reviews',{data:{ids:[showcaseVersionId],action:'approve',reason:''}})).status()).toBe(200);
  const result=await (await outsider.get('/api/projects/'+showcaseId)).json();
  expect(result.project.version.data.team[0]).toMatchObject({email:'',college:'GGITS',semester:'6',branch:'Computer Science',photoId:ids[2]});
  expect(result.project.version.data.services[0].name).toBe('Neon');
  expect(result.project.version.data.github).toBe('');
  expect((await request.get('/api/files/'+ids[2])).status()).toBe(200);
});

test('stars and likes are independent, idempotent, persistent and rank projects before staff picks',async({request})=>{
  const route='/api/projects/'+showcaseId+'/reactions';
  expect((await request.post(route,{headers,data:{kind:'star',active:true}})).status()).toBe(401);
  const duplicates=await Promise.all(Array.from({length:4},()=>outsider.post(route,{data:{kind:'star',active:true}})));
  expect(duplicates.every(r=>r.status()===200)).toBe(true);
  expect((await outsider.post(route,{data:{kind:'like',active:true}})).status()).toBe(200);
  expect((await student.post(route,{data:{kind:'star',active:true}})).status()).toBe(200);
  let detail=await (await outsider.get('/api/projects/'+showcaseId)).json();expect(detail).toMatchObject({starred:true,liked:true,project:{stars:2,likes:1}});
  expect((await outsider.post(route,{data:{kind:'star',active:false}})).status()).toBe(200);
  detail=await (await outsider.get('/api/projects/'+showcaseId)).json();expect(detail).toMatchObject({starred:false,liked:true,project:{stars:1,likes:1}});
  expect((await admin.patch('/api/admin/projects',{data:{id:projectId,featured:true}})).status()).toBe(200);
  const listing=await (await outsider.get('/api/projects')).json();expect(listing.projects[0].id).toBe(showcaseId);
});

test('discussion replies stay attached to their original project thread',async()=>{
  const root=await student.post('/api/projects/'+showcaseId+'/comments',{data:{body:'Can we add battery health monitoring?'}});expect(root.status()).toBe(201);
  const {id:rootId}=await root.json();
  const reply=await outsider.post('/api/projects/'+showcaseId+'/comments',{data:{body:'Yes, the voltage sensor can support that.',parentId:rootId}});expect(reply.status()).toBe(201);
  const {id:replyId}=await reply.json();
  expect((await student.post('/api/projects/'+showcaseId+'/comments',{data:{body:'Let us discuss the calibration.',parentId:replyId}})).status()).toBe(201);
  expect((await student.post('/api/projects/'+projectId+'/comments',{data:{body:'Wrong project thread',parentId:rootId}})).status()).toBe(404);
  const result=await (await student.get('/api/projects/'+showcaseId)).json();
  expect(result.comments.filter((c:{parent_id:string})=>c.parent_id===rootId)).toHaveLength(2);
});

test('modified builds credit a pinned original and require separate ownership and approval',async()=>{
  const created=await outsider.post('/api/projects/'+showcaseId+'/modify',{data:{versionId:showcaseVersionId}});expect(created.status()).toBe(201);
  ({id:modifiedId,versionId:modifiedVersionId}=await created.json());
  const privateDetail=await (await outsider.get('/api/projects/'+modifiedId)).json();
  expect(privateDetail).toMatchObject({original:{id:showcaseId,version_id:showcaseVersionId},project:{ownerId:outsiderId,parentProjectId:showcaseId,parentVersionId:showcaseVersionId,version:{status:'draft',data:{sourceId:'',coverId:'',galleryIds:[],github:''}}}});
  expect(privateDetail.project.version.data.team[0].email).toBe('outsider@example.test');
  expect((await student.get('/api/projects/'+modifiedId)).status()).toBe(404);
  expect((await student.post('/api/projects/'+modifiedId+'/reactions',{data:{kind:'star',active:true}})).status()).toBe(404);
  expect((await student.post('/api/projects/'+modifiedId+'/modify',{data:{}})).status()).toBe(404);
  const revised={...privateDetail.project.version.data,title:'Battery health extension'};
  expect((await outsider.patch('/api/versions/'+modifiedVersionId,{data:{data:{...revised,sourceId:sourceId},submit:false,changelog:'Added battery health'}})).status()).toBe(403);
  expect((await outsider.patch('/api/versions/'+modifiedVersionId,{data:{data:revised,submit:true,changelog:''}})).status()).toBe(400);
  expect((await outsider.patch('/api/versions/'+modifiedVersionId,{data:{data:revised,submit:true,changelog:'Added battery health monitoring'}})).status()).toBe(200);
  expect((await teacher.post('/api/admin/reviews',{data:{ids:[modifiedVersionId],action:'approve',reason:''}})).status()).toBe(200);
  expect((await (await student.get('/api/projects/'+showcaseId)).json()).modifications).toHaveLength(0);
  expect((await teacherTwo.post('/api/admin/reviews',{data:{ids:[modifiedVersionId],action:'approve',reason:''}})).status()).toBe(200);
  const original=await (await student.get('/api/projects/'+showcaseId)).json();expect(original.modifications[0].id).toBe(modifiedId);
  expect(original.project.version.id).toBe(showcaseVersionId);
});

test('project thumbnail opens video and galleries, team details and discussion work on mobile',async({page})=>{
  await page.context().addCookies((await outsider.storageState()).cookies);
  await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'<html><body>Embedded player test stand-in</body></html>'}));
  await page.goto('/projects');await expect(page.getByLabel('Sort by')).toHaveValue('Most starred');
  await expect(page.locator('.project-card').first()).toContainText('Solar lab monitor');
  await page.getByRole('link',{name:'View Solar lab monitor',exact:true}).click();
  const video=page.getByTitle('Solar lab monitor working demo');await expect(video).toBeVisible();await expect(video).toHaveAttribute('src',/autoplay=1&mute=1/);
  await page.getByRole('button',{name:'Show project photo 2',exact:true}).click();await expect(video).toHaveCount(0);
  await expect(page.locator('.media-photo')).toHaveAttribute('src','/api/files/'+showcaseData.galleryIds[0]);
  await expect(page.locator('.team-profile')).toContainText('GGITS');await expect(page.locator('.team-profile')).toContainText('Computer Science');await expect(page.getByAltText('Student Maker, team member')).toBeVisible();
  await expect(page.locator('.build-facts')).toContainText('14 days');await expect(page.locator('.build-facts')).toContainText('TypeScript, C++');
  await expect(page.locator('.feature-list li')).toHaveCount(2);await expect(page.locator('.service-card')).toContainText('Neon');
  await expect(page.locator('.cost-summary')).toContainText('500.00');await expect(page.locator('.cost-summary')).toContainText('100.00');
  await expect(page.getByRole('button',{name:'Download source',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'GitHub repository',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Star project',exact:true}).click();await expect(page.getByRole('button',{name:'Star project',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload();await expect(page.getByRole('button',{name:'Star project',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.locator('.discussion-thread .comment').first().getByRole('button',{name:'Reply to student',exact:true}).click();
  await page.getByLabel('Your reply',{exact:true}).fill('I will test the modified battery build.');
  const posted=page.waitForResponse(r=>r.url().endsWith('/comments')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Post reply',exact:true}).click();expect((await posted).status()).toBe(201);
  await expect(page.locator('.thread-reply').last()).toContainText('I will test the modified battery build.');
  await page.reload();await expect(page.locator('.thread-reply').last()).toContainText('I will test the modified battery build.',{timeout:15000});
  await page.screenshot({path:'test-results/project-story-desktop.png',fullPage:true});
  await page.setViewportSize({width:375,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/project-story-mobile.png',fullPage:true});
});

test('direct demo video really plays muted and stops when a photo is selected',async({page})=>{
  await page.context().addCookies((await student.storageState()).cookies);
  await page.goto('/auth');
  const bytes=readFileSync('tests/helpers/demo.webm');
  await page.route('https://demo.example.test/working.webm',route=>route.fulfill({contentType:'video/webm',body:Buffer.from(bytes)}));
  await page.route('**/api/projects/'+showcaseId,async route=>{const response=await route.fetch();const json=await response.json();json.project.version.data.videoUrl='https://demo.example.test/working.webm';await route.fulfill({response,json});});
  await page.goto('/projects/'+showcaseId+'?play=1');
  const video=page.locator('video');await expect(video).toBeVisible({timeout:15000});
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(0);
  expect(await video.evaluate((v:HTMLVideoElement)=>v.muted&&v.controls&&v.playsInline)).toBe(true);
  await page.getByRole('button',{name:'Show project photo 1',exact:true}).click();await expect(video).toHaveCount(0);
});

test('staff cannot approve their own team and suspension revokes existing sessions',async()=>{
  const currentAdmin=(await (await admin.get('/api/auth/me')).json()).user;
  expect((await admin.patch('/api/admin/users',{data:{id:currentAdmin.id,role:'student',scopes:[],suspended:false}})).status()).toBe(409);
  const created=await teacher.post('/api/projects',{data:{data:{...data,sourceId:'',team:[{name:'Teacher',email:'teacher@example.test',contribution:'Project lead'}]},submit:true,changelog:'A project authored by the assigned teacher'}});
  expect(created.status()).toBe(201);
  const owned=await created.json();
  expect((await teacher.post('/api/admin/reviews',{data:{ids:[owned.versionId],action:'approve',reason:''}})).status()).toBe(403);
  expect((await admin.patch('/api/admin/users',{data:{id:outsiderId,role:'student',scopes:[],suspended:true}})).status()).toBe(200);
  expect((await (await outsider.get('/api/auth/me')).json()).user).toBeNull();
});

test('the front page is an overview only, and Explore projects opens the notebook in a new tab',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toContainText('Good ideas');
  // No project data, filters, or grid on the front page — the live notebook lives at /projects.
  await expect(page.locator('.project-card')).toHaveCount(0);
  await expect(page.locator('.projects-section')).toHaveCount(0);
  await expect(page.locator('.gallery-toolbar')).toHaveCount(0);
  const heroExplore=page.locator('.hero-actions').getByRole('link',{name:'Explore projects',exact:true});
  await expect(heroExplore).toHaveAttribute('href','/projects');
  await expect(heroExplore).toHaveAttribute('target','_blank');
  const navExplore=page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Explore projects',exact:true});
  await expect(navExplore).toHaveAttribute('href','/projects');
  await expect(navExplore).toHaveAttribute('target','_blank');
  // /projects requires an account: a signed-out visitor sees the sign-in gate, not the notebook.
  await page.goto('/projects');
  await expect(page.getByRole('heading',{name:'Make yourself at home.'})).toBeVisible();
  await expect(page.getByLabel('Sort by')).toHaveCount(0);
  // Once signed in, /projects renders the full browsing experience.
  await page.context().addCookies((await student.storageState()).cookies);
  await page.goto('/projects');
  await expect(page.getByLabel('Sort by')).toBeVisible();
  await expect(page.getByRole('button',{name:'All projects'})).toBeVisible();
});

async function ensurePublishedProject(){
  if(projectId)return;
  const created=await student.post('/api/projects',{data:{data,submit:true,changelog:'Initial accessible campus prototype'}});expect(created.status()).toBe(201);
  ({id:projectId,versionId}=await created.json());
  expect((await teacher.post('/api/admin/reviews',{data:{ids:[versionId],action:'approve',reason:''}})).status()).toBe(200);
}

test('student UI can save and reopen a real Neon-backed draft',async({page})=>{
  await ensurePublishedProject();
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toContainText('Good ideas');
  await expect(page.locator('body')).not.toContainText(/codex|openai/i);
  await page.screenshot({path:'test-results/platform-home.png',fullPage:true});
  await page.goto('/auth');
  await page.getByLabel('Email address').fill('student@example.test');
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/workspace/);
  await page.getByRole('link',{name:'New project',exact:true}).click();
  await page.getByLabel('Project title',{exact:true}).fill('UI-created persistent draft');
  await page.getByRole('combobox',{name:'College',exact:true}).selectOption('GGCT');
  await page.getByRole('combobox',{name:'Semester',exact:true}).selectOption('5');
  await page.getByLabel('Branch',{exact:true}).fill('Electronics');
  await expect(page.getByLabel('Member 1 photo',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Add service',exact:true}).click();
  await page.getByLabel('Service name',{exact:true}).fill('Neon');
  await page.getByLabel('What did you use it for?',{exact:true}).fill('Store project records');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.locator('.notice[role="status"]')).toContainText('Draft saved to your account');
  await page.getByRole('link',{name:'Back to workspace',exact:true}).click();
  await expect(page.locator('.workspace-project').filter({hasText:'UI-created persistent draft'})).toBeVisible();
  await page.reload();
  const draft=page.locator('.workspace-project').filter({hasText:'UI-created persistent draft'});
  await draft.getByRole('link',{name:'Continue editing'}).click();
  await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('UI-created persistent draft');
  await expect(page.getByRole('combobox',{name:'College',exact:true})).toHaveValue('GGCT');
  await expect(page.getByRole('combobox',{name:'Semester',exact:true})).toHaveValue('5');
  await expect(page.getByLabel('Branch',{exact:true})).toHaveValue('Electronics');
  await expect(page.getByLabel('Service name',{exact:true})).toHaveValue('Neon');
  await page.screenshot({path:'test-results/submission-desktop.png',fullPage:true});
  await page.setViewportSize({width:375,height:812});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/submission-mobile.png',fullPage:true});
});

test('admin page renders scoped queue and exports audit-ready CSV',async({page})=>{
  await ensurePublishedProject();
  await page.goto('/auth');await page.getByLabel('Email address').fill('admin@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/workspace/);
  await page.getByRole('link',{name:'Review desk',exact:true}).click();await expect(page.getByRole('tab',{name:/Review queue/})).toBeVisible();
  await page.getByRole('tab',{name:'Activity',exact:true}).click();await expect(page.locator('.audit-row').first()).toBeVisible();
  const report=await admin.get('/api/admin/export');expect(report.status()).toBe(200);expect(await report.text()).toContain('Accessible campus navigator');
  await page.getByRole('tab',{name:/Review queue/}).click();
  await page.screenshot({path:'test-results/admin-desktop.png',fullPage:true});
  await page.setViewportSize({width:375,height:812});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/admin-mobile.png',fullPage:true});
});

test('admin library uses the newest version and CSV includes history beyond the dashboard cap',async({page})=>{
  const id=randomUUID();
  await db.query('INSERT INTO r.projects(id,owner_id) VALUES($1,$2)',[id,studentId]);
  await db.query(`INSERT INTO r.versions(id,project_id,number,status,data,changelog,updated_at)
    SELECT gen_random_uuid(),$1,n,'approved',jsonb_set($2::jsonb,'{title}',to_jsonb('Export fixture v'||n)),
    'Approved historical version',now()+n*interval '1 second' FROM generate_series(1,1001) AS n`,[id,JSON.stringify({...data,sourceId:''})]);
  const report=await admin.get('/api/admin/export');expect(report.status()).toBe(200);
  const csv=await report.text();expect(csv.split('\r\n').filter(row=>row.includes('Export fixture v'))).toHaveLength(1001);
  await page.goto('/auth');await page.getByLabel('Email address').fill('admin@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/workspace/);
  await page.getByRole('link',{name:'Review desk',exact:true}).click();
  await page.getByRole('tab',{name:'Project library',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Projects by subject',exact:true})).toBeVisible();
  await expect(page.locator('table').getByRole('link',{name:'Export fixture v1001',exact:true})).toBeVisible();
  await expect(page.locator('table').getByRole('link',{name:'Export fixture v2',exact:true})).toHaveCount(0);
});
