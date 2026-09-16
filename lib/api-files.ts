import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import sharp from 'sharp';
import { db } from './db';
import { emailVerificationRequired } from './policy';
import { currentUser, requireUser, canReview, rateLimit, newToken } from './auth';
import { canEdit, fileReference, fileReferenceParams } from './projects';
import { requireCondition } from './errors';
import { readBody, json } from './http';
import { MAX_UPLOAD, safeFilename, validateImage, validateZip } from './file-validation';
import { openBytes, openText, sealBytes, sealText } from './encryption';
import { IMAGE_WIDTHS } from './images';

// Photos are stored up to 2400px wide, far more than a card or thumbnail shows. Scaled copies are made on first
// request and kept per process up to this many bytes, the least recently used dropped first.
const SCALED_CACHE_BYTES=32*1024*1024;
const scaled=new Map<string,Buffer>();let scaledBytes=0;
async function scaledImage(id:string,width:number,original:()=>Promise<Buffer>) {
  const key=`${id}:${width}`,hit=scaled.get(key);
  if(hit){scaled.delete(key);scaled.set(key,hit);return hit;}
  const image=await sharp(await original(),{limitInputPixels:25_000_000}).resize({width,withoutEnlargement:true}).webp({quality:80}).toBuffer();
  const previous=scaled.get(key);if(previous)scaledBytes-=previous.length;
  scaled.delete(key);scaled.set(key,image);scaledBytes+=image.length;
  for(const [oldest,bytes] of scaled){if(scaledBytes<=SCALED_CACHE_BYTES)break;scaled.delete(oldest);scaledBytes-=bytes.length;}
  return image;
}

async function downloadSecret() {
  if(process.env.DOWNLOAD_SECRET)return process.env.DOWNLOAD_SECRET;
  await db.query("INSERT INTO r.settings(key,value) VALUES('downloadSecret',$1) ON CONFLICT DO NOTHING",[JSON.stringify(newToken())]);
  const [row]=await db.query("SELECT value FROM r.settings WHERE key='downloadSecret'");return row.value as string;
}
export async function upload(request:NextRequest) {
  const user=await requireUser(request);await rateLimit(`upload:${user.id}`,15,3600);
  const name=safeFilename(request.headers.get('x-filename')||'');
  const extension=name.split('.').pop()?.toLowerCase();
  requireCondition(['zip','png','jpg','jpeg','webp'].includes(extension||''),400,'Only ZIP, PNG, JPEG, and WebP files are accepted.');
  const original=await readBody(request,MAX_UPLOAD);requireCondition(original.length>0,400,'The file is empty.');
  let content=original,mime='application/zip',filename=name;
  if(extension==='zip')await validateZip(original);
  else {content=await validateImage(original);mime='image/webp';filename=name.replace(/\.[^.]+$/,'.webp');}
  const id=randomUUID();
  await db.query("INSERT INTO r.files(id,owner_id,filename,mime,size,content,scan_status) VALUES($1,$2,$3,$4,$5,$6,'validated_internal')",[id,user.id,sealText(filename,'files.filename'),mime,content.length,sealBytes(content,'files.content')]);
  return json({id,filename,mime,size:content.length,url:`/api/files/${id}`},201);
}
async function accessibleFile(request:NextRequest,id:string) {
  // A project page requests many photos at once, so these independent lookups share one round trip's wait.
  const [user,[file],versions]=await Promise.all([
    currentUser(request),
    db.query('SELECT id,owner_id,filename,mime,size FROM r.files WHERE id=$1',[id]),
    db.query(`SELECT v.*,p.archived FROM r.versions v JOIN r.projects p ON p.id=v.project_id WHERE ${fileReference(1)}`,fileReferenceParams(id)),
  ]);
  requireCondition(file,404,'File not found.');
  const published=versions.some(v=>v.status==='approved'&&!v.archived);
  // A profile photo can be seen by anyone while its account is active.
  const avatar=!published&&file.mime==='image/webp'&&(await db.query("SELECT 1 FROM r.users WHERE profile->>'avatarId'=$1 AND NOT suspended LIMIT 1",[id])).length>0;
  let canAccess=published||avatar||user?.id===file.owner_id;
  if(!canAccess&&user){for(const v of versions){if(canReview(user,v.data)||await canEdit(db,user,v.project_id)){canAccess=true;break;}}}
  requireCondition(canAccess,404,'File not found.');
  return {file,user,versions,shared:published||avatar};
}
export async function fileRoute(request:NextRequest,id:string,sign=false) {
  const {file,user,versions,shared}=await accessibleFile(request,id);
  if(sign) {
    requireCondition(user,401,'Sign in to download source code.');
    requireCondition(!emailVerificationRequired()||user.verified,403,'Verify your email address first.');
    requireCondition(file.mime==='application/zip',400,'This file is not a source archive.');
    await rateLimit(`download:${user.id}`,60,3600);
    const expires=String(Date.now()+5*60*1000),payload=`${id}:${user.id}:${expires}`;
    const signature=createHmac('sha256',await downloadSecret()).update(payload).digest('hex');
    return json({url:`/api/files/${id}?expires=${expires}&signature=${signature}`});
  }
  if(file.mime==='application/zip') {
    requireCondition(user,401,'Sign in to download source code.');
    requireCondition(!emailVerificationRequired()||user.verified,403,'Verify your email address first.');
    const expires=request.nextUrl.searchParams.get('expires')||'',signature=request.nextUrl.searchParams.get('signature')||'';
    const expected=createHmac('sha256',await downloadSecret()).update(`${id}:${user.id}:${expires}`).digest();
    requireCondition(/^\d+$/.test(expires)&&Number(expires)>Date.now()&&Number(expires)<=Date.now()+5*60*1000&&/^[a-f0-9]{64}$/.test(signature)&&timingSafeEqual(Buffer.from(signature,'hex'),expected),403,'Download link is invalid or expired.');
    const publicVersion=versions.find(v=>v.status==='approved'&&!v.archived);
    if(publicVersion)await db.query('UPDATE r.projects SET downloads=downloads+1 WHERE id=$1',[publicVersion.project_id]);
  }
  const width=request.nextUrl.searchParams.get('w');
  if(width!==null)requireCondition(file.mime.startsWith('image/')&&IMAGE_WIDTHS.some(allowed=>String(allowed)===width),400,'Unsupported image width.');
  const original=async()=>{const [bytes]=await db.query('SELECT content FROM r.files WHERE id=$1',[id]);return openBytes(bytes.content,'files.content');};
  const content=width?await scaledImage(id,Number(width),original):await original();
  // Photos anyone may see are reused by the browser for an hour; drafts, reviews and source archives are never stored.
  const cache=shared&&file.mime.startsWith('image/')?'private, max-age=3600':'private, no-store';
  return new Response(new Uint8Array(content),{headers:{'Content-Type':width?'image/webp':file.mime,'Content-Length':String(content.length),'Content-Disposition':`${file.mime==='application/zip'?'attachment':'inline'}; filename="${openText(file.filename,'files.filename')}"`,'Cache-Control':cache,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
