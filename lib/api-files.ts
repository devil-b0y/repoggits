import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import sharp from 'sharp';
import { db } from './db';
import { emailVerificationRequired } from './policy';
import { currentUser, requireUser, canReview, rateLimit, newToken } from './auth';
import { canEdit, fileReference, fileReferenceParams } from './projects';
import { requireCondition } from './errors';
import { readBody, json } from './http';
import { MAX_UPLOAD, MAX_VIDEO_UPLOAD, safeFilename, validateImage, validateOfficeDoc, validatePdf, validateVideo, validateZip } from './file-validation';
import { openBytes, openText, sealBytes, sealText } from './encryption';
import { IMAGE_WIDTHS } from './images';
import { hashContent, scaledImage } from './media';

async function downloadSecret() {
  if(process.env.DOWNLOAD_SECRET)return process.env.DOWNLOAD_SECRET;
  await db.query("INSERT INTO r.settings(key,value) VALUES('downloadSecret',$1) ON CONFLICT DO NOTHING",[JSON.stringify(newToken())]);
  const [row]=await db.query("SELECT value FROM r.settings WHERE key='downloadSecret'");return row.value as string;
}
const DOCUMENT_MIME:Record<string,string>={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
const ACCEPTED_EXTENSIONS=['zip','png','jpg','jpeg','webp','mp4','webm','pdf','doc','docx','ppt','pptx'];
export async function upload(request:NextRequest) {
  const user=await requireUser(request);await rateLimit(`upload:${user.id}`,15,3600);
  const name=safeFilename(request.headers.get('x-filename')||'');
  const extension=(name.split('.').pop()?.toLowerCase())||'';
  requireCondition(ACCEPTED_EXTENSIONS.includes(extension),400,'Only ZIP, PNG, JPEG, WebP, MP4, WebM, PDF, DOC(X), and PPT(X) files are accepted.');
  const isVideo=extension==='mp4'||extension==='webm';
  const isDocument=extension in DOCUMENT_MIME;
  const max=isVideo?MAX_VIDEO_UPLOAD:MAX_UPLOAD;
  const original=await readBody(request,max);requireCondition(original.length>0,400,'The file is empty.');
  let content=original,mime='application/zip',filename=name,width:number|null=null,height:number|null=null,pageCount:number|null=null;
  if(extension==='zip')await validateZip(original);
  else if(isVideo){await validateVideo(original,extension as 'mp4'|'webm');mime=extension==='mp4'?'video/mp4':'video/webm';}
  else if(isDocument){
    if(extension==='pdf'){const result=await validatePdf(original);pageCount=result.pageCount;}
    else await validateOfficeDoc(original,extension as 'doc'|'docx'|'ppt'|'pptx');
    mime=DOCUMENT_MIME[extension];
  }
  else {
    content=await validateImage(original);mime='image/webp';filename=name.replace(/\.[^.]+$/,'.webp');
    const meta=await sharp(content).metadata();width=meta.width??null;height=meta.height??null;
  }
  const hash=hashContent(content);
  if(request.headers.get('x-allow-duplicate')!=='true') {
    const [existing]=await db.query<{id:string;filename:string}>('SELECT id,filename FROM r.files WHERE content_hash=$1 AND owner_id=$2 AND deleted_at IS NULL LIMIT 1',[hash,user.id]);
    if(existing)return json({duplicate:true,existingId:existing.id,existingFilename:openText(existing.filename,'files.filename')},409);
  }
  const id=randomUUID();
  await db.query("INSERT INTO r.files(id,owner_id,filename,display_name,mime,size,content,scan_status,content_hash,width,height,page_count) VALUES($1,$2,$3,$4,$5,$6,$7,'validated_internal',$8,$9,$10,$11)",
    [id,user.id,sealText(filename,'files.filename'),filename,mime,content.length,sealBytes(content,'files.content'),hash,width,height,pageCount]);
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
  const isVideo=file.mime.startsWith('video/');
  const headers:Record<string,string>={'Content-Type':width?'image/webp':file.mime,'Content-Disposition':`${file.mime==='application/zip'?'attachment':'inline'}; filename="${openText(file.filename,'files.filename')}"`,'Cache-Control':cache,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"};
  // A demo video is buffered fully in memory by the time we get here (no blob storage/streaming layer), but the
  // player still needs to scrub and seek without downloading the whole file first, so Range requests are sliced
  // out of that same in-memory buffer rather than fetched again.
  const range=isVideo?request.headers.get('range'):null;
  const match=range?/^bytes=(\d*)-(\d*)$/.exec(range.trim()):null;
  if(match&&(match[1]||match[2])) {
    const start=match[1]?Math.min(Number(match[1]),content.length-1):Math.max(0,content.length-Number(match[2]));
    const end=match[1]&&match[2]?Math.min(Number(match[2]),content.length-1):content.length-1;
    if(start<=end) {
      const slice=content.subarray(start,end+1);
      return new Response(new Uint8Array(slice),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${content.length}`,'Content-Length':String(slice.length),'Accept-Ranges':'bytes'}});
    }
  }
  if(isVideo)headers['Accept-Ranges']='bytes';
  return new Response(new Uint8Array(content),{headers:{...headers,'Content-Length':String(content.length)}});
}
