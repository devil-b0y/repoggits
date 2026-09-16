import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { get as httpGet } from 'node:http';
import sharp from 'sharp';
import { db, migrate, schemaName, transaction } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { fileReference, fileReferenceParams } from '../lib/projects';
import { emptyProject, type Project } from '../lib/schema';

const password='a long test passphrase for speed checks';
const origin=process.env.APP_ORIGIN!;
let student:APIRequestContext,admin:APIRequestContext,adminId='';

// Submits a project as the student and approves it as the Super Admin. One approval is made enough here, so the
// check does not depend on the moderation setting another spec may have left behind.
async function publish(title:string,coverId='') {
  const data={...emptyProject,title,coverId,subject:'Final Year Project',summary:'A project used to check that shared data stays fresh.',description:'This description is long enough to pass every check a submitted project has to meet.',teamName:'Speed makers',tags:['Caching'],team:[{name:'Speed student',email:'speed-team@example.test',contribution:'Lead'}]};
  const created=await student.post('/api/projects',{data:{data,submit:true,changelog:'First version for the speed checks'}});expect(created.status()).toBe(201);
  const {id,versionId}=await created.json();
  await db.query('UPDATE r.versions SET required_approvals=1 WHERE id=$1',[versionId]);
  expect((await admin.post('/api/admin/reviews',{data:{ids:[versionId],action:'approve',reason:''}})).status()).toBe(200);
  return id as string;
}

test.describe.configure({mode:'serial'});
test.beforeAll(async({playwright})=>{
  await migrate();
  const hashed=await hashPassword(password);
  async function account(role:'student'|'superadmin') {
    const id=randomUUID(),email=`speed-${role}-${randomUUID()}@example.test`;
    await db.query('INSERT INTO r.users(id,email,password_hash,name,role,verified,profile) VALUES($1,$2,$3,$4,$5,true,$6)',[id,email,hashed,`Speed ${role}`,role,JSON.stringify({name:`Speed ${role}`})]);
    const client=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{origin}});
    expect((await client.post('/api/auth/login',{data:{email,password}})).status()).toBe(200);
    return {id,client};
  }
  ({client:student}=await account('student'));({id:adminId,client:admin}=await account('superadmin'));
});
test.afterAll(async()=>{
  await Promise.all([student,admin].filter(Boolean).map(client=>client.dispose()));
  // Specs later in the run share this schema, and platform.spec checks that its only Super Admin cannot be demoted.
  if(adminId)await db.query("UPDATE r.users SET role='student' WHERE id=$1",[adminId]);
});

test('the cached project list picks up reviews, reactions and archiving straight away',async()=>{
  const title=`Fresh list ${randomUUID().slice(0,8)}`;
  const listed=async()=>((await (await student.get('/api/projects')).json()).projects as Project[]).find(p=>p.version.data.title===title);
  // Read the list first, so the server is holding a copy from before the project existed.
  expect(await listed()).toBeUndefined();
  const id=await publish(title);
  expect((await listed())?.id).toBe(id);
  expect((await student.post(`/api/projects/${id}/reactions`,{data:{kind:'star',active:true}})).status()).toBe(200);
  expect((await listed())?.stars).toBe(1);
  expect((await admin.patch('/api/admin/projects',{data:{id,archived:true}})).status()).toBe(200);
  expect(await listed()).toBeUndefined();
});

test('the project list revalidates with a 304 and API responses leave the app compressed',async()=>{
  const first=await student.get('/api/projects');expect(first.status()).toBe(200);
  const etag=first.headers()['etag'];expect(etag).toMatch(/^W\/".+"$/);
  expect(first.headers()['cache-control']).toBe('private, no-cache');
  expect(first.headers()['vary']).toContain('Cookie');
  const repeat=await student.get('/api/projects',{headers:{'if-none-match':etag}});
  expect(repeat.status()).toBe(304);expect((await repeat.body()).length).toBe(0);
  // Playwright decompresses bodies and drops Content-Encoding, so the raw response is read with Node instead.
  // The admin overview is well above the size at which responses are compressed.
  const cookie=(await admin.storageState()).cookies.map(c=>`${c.name}=${c.value}`).join('; ');
  const raw=await new Promise<{status?:number;encoding?:string}>((resolve,reject)=>{httpGet(new URL('/api/admin',origin),{headers:{cookie,'accept-encoding':'gzip'}},response=>{response.resume();resolve({status:response.statusCode,encoding:response.headers['content-encoding']});}).on('error',reject);});
  expect(raw).toEqual({status:200,encoding:'gzip'});
});

test('photos are scaled to the width asked for, and only public ones are cached by the browser',async({request})=>{
  // Random pixels are slow to encode, and this uploads, scales and publishes one, so allow for a busy machine.
  test.setTimeout(120_000);
  // Random pixels, so the scaled copy is smaller because of its size rather than an easily compressed flat colour.
  const png=await sharp(randomBytes(900*600*3),{raw:{width:900,height:600,channels:3}}).png().toBuffer();
  const uploaded=await student.post('/api/upload',{headers:{'Content-Type':'application/octet-stream','X-Filename':'wide.png'},data:png});
  expect(uploaded.status()).toBe(201);
  const {id}=await uploaded.json();
  const full=await student.get(`/api/files/${id}`),small=await student.get(`/api/files/${id}?w=480`);
  expect(small.status()).toBe(200);expect(small.headers()['content-type']).toBe('image/webp');
  expect((await sharp(await small.body()).metadata()).width).toBe(480);
  expect((await small.body()).length).toBeLessThan((await full.body()).length/2);
  // Still a draft photo: its owner sees it but the browser must not keep it, and nobody else sees it at all.
  expect(small.headers()['cache-control']).toBe('private, no-store');
  expect((await request.get(`/api/files/${id}?w=480`)).status()).toBe(404);
  expect((await student.get(`/api/files/${id}?w=500`)).status()).toBe(400);
  await publish(`Scaled cover ${randomUUID().slice(0,8)}`,id);
  const published=await request.get(`/api/files/${id}?w=1600`);
  expect(published.status()).toBe(200);expect(published.headers()['cache-control']).toBe('private, max-age=3600');
  // A photo is never enlarged beyond its stored size.
  expect((await sharp(await published.body()).metadata()).width).toBe(900);
});

test('per-user lookups and photo permission checks are backed by indexes',async()=>{
  const indexes=(await db.query('SELECT indexname FROM pg_indexes WHERE schemaname=$1',[schemaName()])).map(row=>row.indexname);
  expect(indexes).toEqual(expect.arrayContaining(['sessions_user_idx','tokens_user_purpose_idx','projects_owner_idx','notifications_user_idx','audit_created_idx','audit_target_idx','outbox_pending_idx','versions_data_idx','users_avatar_idx']));
  // Test tables are too small for the planner to prefer an index, so sequential scans are ruled out to show one applies.
  const plan=await transaction(async client=>{await client.query('SET LOCAL enable_seqscan=off');return client.query(`EXPLAIN SELECT id FROM r.versions WHERE ${fileReference(1)}`,fileReferenceParams(randomUUID()));});
  expect(plan.map(row=>row['QUERY PLAN']).join('\n')).toContain('versions_data_idx');
});

test('the project notebook shows placeholders while it loads, then pages a long list',async({page})=>{
  await page.context().addCookies((await student.storageState()).cookies);
  const projects:Project[]=Array.from({length:30},(_,i)=>({id:randomUUID(),ownerId:randomUUID(),featured:false,archived:false,example:false,views:0,downloads:0,stars:30-i,likes:0,parentProjectId:null,parentVersionId:null,
    version:{id:randomUUID(),projectId:'',number:1,status:'approved',data:{...emptyProject,title:`Paged project ${i+1}`,summary:'A stand-in project for the paging check.',teamName:'Paging team',tags:['Paging']},changelog:'',createdAt:new Date().toISOString(),requiredApprovals:1,approvals:1}}));
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=()=>resolve();});
  await page.route('**/api/projects',async route=>{await held;await route.fulfill({json:{projects}});});
  await page.goto('/projects');
  await expect(page.locator('.project-skeleton .skeleton-card').first()).toBeVisible();
  release();
  await expect(page.locator('.project-card')).toHaveCount(24);
  await expect(page.locator('.project-skeleton')).toHaveCount(0);
  await expect(page.locator('.result-count')).toHaveText('Showing 24 of 30 published projects');
  await page.getByRole('button',{name:'Show more projects',exact:true}).click();
  await expect(page.locator('.project-card')).toHaveCount(30);
  await expect(page.locator('.result-count')).toHaveText('30 published projects');
  // A new search starts again from the first page.
  await page.getByLabel('Search projects').fill('Paged project 7');
  await expect(page.locator('.project-card')).toHaveCount(1);
});

test('draft recovery keeps what was typed even when the page closes before the save pause',async({page})=>{
  await page.context().addCookies((await student.storageState()).cookies);
  await page.goto('/submit');
  await page.getByLabel('Project title',{exact:true}).fill('Written just before closing');
  await page.reload();
  await expect(page.getByLabel('Project title',{exact:true})).toHaveValue('Written just before closing');
  await expect(page.getByText('Progress saved automatically in this browser.',{exact:false})).toBeVisible();
});
