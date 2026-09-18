import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db, migrate } from '../lib/db';
import { hashPassword } from '../lib/auth';

// A demo video is buffered fully in memory server-side (no S3/blob storage), but the player still needs to seek
// without downloading the whole file first — this exercises the Range/206 support added to fileRoute() for
// video mime types, and confirms non-video files are unaffected.
const password='a long test passphrase for makers';
const origin=process.env.APP_ORIGIN!;
let student:APIRequestContext;

test.beforeAll(async({playwright})=>{
  await migrate();
  const email='video-range@example.test';
  const id=randomUUID();
  await db.query('INSERT INTO r.users(id,email,password_hash,name,role,verified,scopes,profile) VALUES($1,$2,$3,$4,$5,true,$6,$7)',[id,email,await hashPassword(password),'Video Range Tester','student',JSON.stringify([]),JSON.stringify({name:'Video Range Tester'})]);
  student=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:{origin}});
  const login=await student.post('/api/auth/login',{data:{email,password}});
  expect(login.status()).toBe(200);
});
test.afterAll(async()=>{await student?.dispose();});

function ftypMp4(size:number) {
  // Minimal valid ISO-BMFF opening: a box whose size (4 bytes) is followed by the 'ftyp' type, then padding so
  // the whole buffer reaches the requested size — enough to pass validateVideo's container sniff.
  const buffer=Buffer.alloc(size);
  buffer.writeUInt32BE(size,0);
  buffer.write('ftyp',4,'ascii');
  buffer.write('isom',8,'ascii');
  return buffer;
}

test('a video file answers Range requests with 206 and the exact byte slice',async()=>{
  const content=ftypMp4(5000);
  const uploaded=await(await student.post('/api/upload',{headers:{'Content-Type':'application/octet-stream','X-Filename':'demo.mp4'},data:content})).json();
  expect(uploaded.mime).toBe('video/mp4');

  const full=await student.get(`/api/files/${uploaded.id}`);
  expect(full.status()).toBe(200);
  expect(full.headers()['accept-ranges']).toBe('bytes');
  expect((await full.body()).length).toBe(content.length);

  const partial=await student.get(`/api/files/${uploaded.id}`,{headers:{Range:'bytes=100-199'}});
  expect(partial.status()).toBe(206);
  expect(partial.headers()['content-range']).toBe(`bytes 100-199/${content.length}`);
  expect(partial.headers()['content-length']).toBe('100');
  expect(partial.headers()['accept-ranges']).toBe('bytes');
  expect((await partial.body()).equals(content.subarray(100,200))).toBe(true);

  const suffix=await student.get(`/api/files/${uploaded.id}`,{headers:{Range:'bytes=-50'}});
  expect(suffix.status()).toBe(206);
  expect(suffix.headers()['content-range']).toBe(`bytes ${content.length-50}-${content.length-1}/${content.length}`);
  expect((await suffix.body()).equals(content.subarray(content.length-50))).toBe(true);

  const openEnded=await student.get(`/api/files/${uploaded.id}`,{headers:{Range:'bytes=4900-'}});
  expect(openEnded.status()).toBe(206);
  expect(openEnded.headers()['content-range']).toBe(`bytes 4900-${content.length-1}/${content.length}`);
  expect((await openEnded.body()).equals(content.subarray(4900))).toBe(true);
});

test('Range headers are ignored for non-video files, which keep answering in full',async()=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const uploaded=await(await student.post('/api/upload',{headers:{'Content-Type':'application/octet-stream','X-Filename':'cover.png'},data:png})).json();
  const response=await student.get(`/api/files/${uploaded.id}`,{headers:{Range:'bytes=0-3'}});
  expect(response.status()).toBe(200);
  expect(response.headers()['accept-ranges']).toBeUndefined();
});
