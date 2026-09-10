import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { db } from './db';
import { emailVerificationRequired } from './policy';
import { currentUser, requireUser, canReview, rateLimit, newToken } from './auth';
import { canEdit } from './projects';
import { requireCondition } from './errors';
import { readBody, json } from './http';
import { MAX_UPLOAD, safeFilename, validateImage, validateZip } from './file-validation';

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
  await db.query("INSERT INTO r.files(id,owner_id,filename,mime,size,content,scan_status) VALUES($1,$2,$3,$4,$5,$6,'validated_internal')",[id,user.id,filename,mime,content.length,content]);
  return json({id,filename,mime,size:content.length,url:`/api/files/${id}`},201);
}
async function accessibleFile(request:NextRequest,id:string) {
  const user=await currentUser(request);
  const [file]=await db.query('SELECT id,owner_id,filename,mime,size FROM r.files WHERE id=$1',[id]);requireCondition(file,404,'File not found.');
  const versions=await db.query(`SELECT v.*,p.archived FROM r.versions v JOIN r.projects p ON p.id=v.project_id WHERE data->>'sourceId'=$1 OR data->>'coverId'=$1 OR data->'galleryIds' ? $1 OR EXISTS(SELECT 1 FROM jsonb_array_elements(data->'team') m WHERE m->>'photoId'=$1)`,[id]);
  const published=versions.some(v=>v.status==='approved'&&!v.archived);
  const avatars=await db.query('SELECT id FROM r.users WHERE profile->>\'avatarId\'=$1 AND NOT suspended',[id]);
  let canAccess=published||file.mime==='image/webp'&&avatars.length>0||user?.id===file.owner_id;
  if(!canAccess&&user){for(const v of versions){if(canReview(user,v.data)||await canEdit(db,user,v.project_id)){canAccess=true;break;}}}
  requireCondition(canAccess,404,'File not found.');
  return {file,user,versions};
}
export async function fileRoute(request:NextRequest,id:string,sign=false) {
  const {file,user,versions}=await accessibleFile(request,id);
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
  const [bytes]=await db.query('SELECT content FROM r.files WHERE id=$1',[id]);
  return new Response(new Uint8Array(bytes.content),{headers:{'Content-Type':file.mime,'Content-Length':String(file.size),'Content-Disposition':`${file.mime==='application/zip'?'attachment':'inline'}; filename="${file.filename}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
