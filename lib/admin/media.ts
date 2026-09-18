import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, transaction, type Db } from '../db';
import { audit } from '../auth';
import { HttpError, requireCondition } from '../errors';
import { bodyJson, json } from '../http';
import { cleanText } from '../safe-text';
import { openBytes, openText } from '../encryption';
import { mediaType, mediaUsage, readableFilename, scaledImage, type MediaType } from '../media';
import { IMAGE_WIDTHS } from '../images';
import { requirePermission } from './permissions';
import { cappedCount, choiceParam, containsPattern, intParam, isUuid, pageRequest, paged, sortParam, SqlWhere, textParam, uuidParam } from './query';
import { exportResponse, type ExportColumn } from './query';
import type { AdminContext } from './router';

// GET/PATCH /api/admin/media[/:id] and /api/admin/media/folders|tags|stats|bulk for Admin › Media Manager.
// Everything reads and writes r.files (extended with display_name/tags/folder/deleted_at/… in lib/db.ts) plus the
// new r.media_folders/r.media_tags/r.media_tag_links tables. Usage is computed live via lib/media.ts's mediaUsage(),
// not a reverse-index table, so it can never drift from what r.versions actually references.

export type MediaSummary={id:string;filename:string;displayName:string;mime:string;type:MediaType;size:number;width:number|null;height:number|null;pageCount:number|null;
  folder:{id:string;name:string}|null;tags:string[];uploadedBy:{id:string;name:string}|null;createdAt:string;usageCount:number;visibility:string};
export type MediaDetail=MediaSummary&{altText:string;caption:string;description:string;url:string;usage:{entries:{projectId:string;versionId:string;title:string;role:string;status:string}[];avatarOf:string[]};deletedAt:string|null};

const MEDIA_SORTS={created:'f.created_at',modified:'f.created_at',name:'lower(coalesce(f.display_name,f.filename))',size:'f.size'} as const;

function mediaRow(row:Record<string,unknown>):MediaSummary {
  const mime=String(row.mime);
  return {
    id:String(row.id),filename:readableFilename(String(row.filename)),displayName:cleanText(row.display_name,200)||readableFilename(String(row.filename)),
    mime,type:mediaType(mime),size:Number(row.size),width:row.width==null?null:Number(row.width),height:row.height==null?null:Number(row.height),
    pageCount:row.page_count==null?null:Number(row.page_count),
    folder:row.folder_id?{id:String(row.folder_id),name:cleanText(row.folder_name,120)}:null,
    tags:Array.isArray(row.tags)?(row.tags as string[]).filter(Boolean):[],
    uploadedBy:row.owner_id?{id:String(row.owner_id),name:cleanText(row.owner_name,120)}:null,
    createdAt:new Date(row.created_at as string).toISOString(),usageCount:Number(row.usage_count)||0,visibility:String(row.visibility),
  };
}

async function listMedia(search:URLSearchParams,trashed:boolean) {
  const where=new SqlWhere();
  where.add(trashed?'f.deleted_at IS NOT NULL':'f.deleted_at IS NULL');
  const q=textParam(search,'q',160);
  if(q)where.add(`(f.display_name ILIKE ? OR EXISTS(SELECT 1 FROM r.media_tag_links tl JOIN r.media_tags t ON t.id=tl.tag_id WHERE tl.file_id=f.id AND t.name ILIKE ?) OR f.description ILIKE ? OR f.caption ILIKE ?)`,containsPattern(q),containsPattern(q),containsPattern(q),containsPattern(q));
  const type=choiceParam(search,'type',['image','video','document','archive'] as const);
  if(type==='archive')where.add("f.mime='application/zip'");
  else if(type)where.add(`f.mime LIKE ?`,`${type}/%`);
  const folder=uuidParam(search,'folder');if(folder)where.add('f.folder_id=?',folder);
  const tag=uuidParam(search,'tag');if(tag)where.add('EXISTS(SELECT 1 FROM r.media_tag_links tl WHERE tl.file_id=f.id AND tl.tag_id=?)',tag);
  const uploadedBy=uuidParam(search,'uploadedBy');if(uploadedBy)where.add('f.owner_id=?',uploadedBy);
  const minSize=intParam(search,'minSize',0,0,10*1024*1024*1024);if(minSize)where.add('f.size>=?',minSize);
  const maxSize=intParam(search,'maxSize',0,0,10*1024*1024*1024);if(maxSize)where.add('f.size<=?',maxSize);
  const used=choiceParam(search,'used',['used','unused'] as const);
  if(used){
    const usedSql=`(EXISTS(SELECT 1 FROM r.versions v JOIN r.projects p ON p.id=v.project_id WHERE data @> jsonb_build_object('sourceId',f.id::text) OR data @> jsonb_build_object('coverId',f.id::text) OR data @> jsonb_build_object('galleryIds',jsonb_build_array(f.id::text)) OR data @> jsonb_build_object('team',jsonb_build_array(jsonb_build_object('photoId',f.id::text)))) OR EXISTS(SELECT 1 FROM r.users u WHERE u.profile->>'avatarId'=f.id::text))`;
    where.add(used==='used'?usedSql:`NOT ${usedSql}`);
  }
  const sort=sortParam(search,MEDIA_SORTS,'created'),request=pageRequest(search);
  const values=[...where.values,request.pageSize,request.offset];
  const [count,rows]=await Promise.all([
    cappedCount(`FROM r.files f ${where.sql}`,where.values),
    db.query(`SELECT f.id,f.filename,f.display_name,f.mime,f.size,f.width,f.height,f.page_count,f.folder_id,f.owner_id,f.created_at,f.visibility,
        mf.name AS folder_name,u.name AS owner_name,
        (SELECT array_agg(t.name ORDER BY t.name) FROM r.media_tag_links tl JOIN r.media_tags t ON t.id=tl.tag_id WHERE tl.file_id=f.id) AS tags,
        (SELECT count(*)::int FROM r.versions v WHERE (v.data @> jsonb_build_object('sourceId',f.id::text) OR v.data @> jsonb_build_object('coverId',f.id::text) OR v.data @> jsonb_build_object('galleryIds',jsonb_build_array(f.id::text)) OR v.data @> jsonb_build_object('team',jsonb_build_array(jsonb_build_object('photoId',f.id::text))))) AS usage_count
      FROM r.files f LEFT JOIN r.media_folders mf ON mf.id=f.folder_id LEFT JOIN r.users u ON u.id=f.owner_id
      ${where.sql} ORDER BY ${sort.sql},f.id LIMIT $${values.length-1} OFFSET $${values.length}`,values),
  ]);
  return paged(rows.map(mediaRow),request,count);
}

async function mediaDetail(id:string):Promise<MediaDetail> {
  requireCondition(isUuid(id),400,'The media ID is not valid.');
  // Every column except the file's actual bytes — content can be tens or hundreds of megabytes, and the detail
  // panel never needs it (previews load separately through the content sub-route, which streams just that file).
  const [row]=await db.query(`SELECT f.id,f.owner_id,f.filename,f.display_name,f.mime,f.size,f.width,f.height,f.page_count,f.folder_id,f.created_at,f.visibility,
      f.alt_text,f.caption,f.description,f.deleted_at,mf.name AS folder_name,u.name AS owner_name,
      (SELECT array_agg(t.name ORDER BY t.name) FROM r.media_tag_links tl JOIN r.media_tags t ON t.id=tl.tag_id WHERE tl.file_id=f.id) AS tags
    FROM r.files f LEFT JOIN r.media_folders mf ON mf.id=f.folder_id LEFT JOIN r.users u ON u.id=f.owner_id WHERE f.id=$1`,[id]);
  requireCondition(row,404,'Media not found.');
  const usage=await mediaUsage(db,id);
  return {
    ...mediaRow({...row,usage_count:usage.entries.length}),
    altText:cleanText(row.alt_text,500),caption:cleanText(row.caption,500),description:cleanText(row.description,4000),
    url:`/api/admin/media/${id}/content`,deletedAt:row.deleted_at?new Date(row.deleted_at as string).toISOString():null,
    usage:{entries:usage.entries.map(entry=>({projectId:entry.projectId,versionId:entry.versionId,title:entry.title,role:entry.role,status:entry.status})),avatarOf:usage.avatarOf},
  };
}

const metadataSchema=z.object({
  displayName:z.string().trim().max(200).optional(),altText:z.string().trim().max(500).optional(),caption:z.string().trim().max(500).optional(),
  description:z.string().trim().max(4000).optional(),tags:z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  folderId:z.uuid().nullable().optional(),visibility:z.enum(['inherit','public','restricted']).optional(),
});
async function setTags(client:Db,fileId:string,tags:string[]) {
  const names=[...new Set(tags.map(tag=>tag.trim()).filter(Boolean))];
  const ids:string[]=[];
  for(const name of names){
    const [row]=await client.query<{id:string}>('INSERT INTO r.media_tags(id,name) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[randomUUID(),name]);
    ids.push(row.id);
  }
  await client.query('DELETE FROM r.media_tag_links WHERE file_id=$1 AND NOT (tag_id=ANY($2::uuid[]))',[fileId,ids]);
  for(const tagId of ids)await client.query('INSERT INTO r.media_tag_links(file_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[fileId,tagId]);
}
async function updateMetadata(context:AdminContext,id:string) {
  requireCondition(isUuid(id),400,'The media ID is not valid.');
  const input=metadataSchema.parse(await bodyJson(context.request));
  const [existing]=await db.query('SELECT id FROM r.files WHERE id=$1 AND deleted_at IS NULL',[id]);
  requireCondition(existing,404,'Media not found.');
  if(input.folderId){const [folder]=await db.query('SELECT id FROM r.media_folders WHERE id=$1',[input.folderId]);requireCondition(folder,400,'Choose an existing folder.');}
  await transaction(async client=>{
    const sets:string[]=[],values:unknown[]=[];
    const set=(column:string,value:unknown)=>{values.push(value);sets.push(`${column}=$${values.length}`);};
    if(input.displayName!==undefined)set('display_name',input.displayName);
    if(input.altText!==undefined)set('alt_text',input.altText);
    if(input.caption!==undefined)set('caption',input.caption);
    if(input.description!==undefined)set('description',input.description);
    if(input.folderId!==undefined)set('folder_id',input.folderId);
    if(input.visibility!==undefined)set('visibility',input.visibility);
    if(sets.length){values.push(id);await client.query(`UPDATE r.files SET ${sets.join(',')} WHERE id=$${values.length}`,values);}
    if(input.tags!==undefined)await setTags(client,id,input.tags);
    await audit(client,context.user.id,'media.updated',id,{fields:Object.keys(input)});
  });
  return json(await mediaDetail(id));
}

const actionSchema=z.object({action:z.enum(['trash','restore','purge','replace']),force:z.boolean().optional(),newFileId:z.uuid().optional()});
async function performAction(context:AdminContext,id:string) {
  requireCondition(isUuid(id),400,'The media ID is not valid.');
  const input=actionSchema.parse(await bodyJson(context.request));
  const [file]=await db.query('SELECT id,mime,deleted_at FROM r.files WHERE id=$1',[id]);
  requireCondition(file,404,'Media not found.');
  if(input.action==='trash') {
    requireCondition(!file.deleted_at,400,'This file is already in the trash.');
    if(!input.force){
      const usage=await mediaUsage(db,id);
      requireCondition(!usage.entries.length&&!usage.avatarOf.length,409,`This media is currently used in ${usage.entries.length+usage.avatarOf.length} location(s). Confirm to delete anyway.`);
    }
    await transaction(async client=>{
      await client.query('UPDATE r.files SET deleted_at=now(),deleted_by=$1 WHERE id=$2',[context.user.id,id]);
      await audit(client,context.user.id,'media.trashed',id,{forced:!!input.force});
    });
  } else if(input.action==='restore') {
    requireCondition(file.deleted_at,400,'This file is not in the trash.');
    await transaction(async client=>{
      await client.query('UPDATE r.files SET deleted_at=NULL,deleted_by=NULL WHERE id=$1',[id]);
      await audit(client,context.user.id,'media.restored',id,{});
    });
  } else if(input.action==='purge') {
    requireCondition(file.deleted_at,400,'Move this file to the trash before deleting it permanently.');
    await transaction(async client=>{
      await client.query('DELETE FROM r.files WHERE id=$1',[id]);
      await audit(client,context.user.id,'media.purged',id,{});
    });
    return json({ok:true,purged:true});
  } else {
    requireCondition(input.newFileId&&isUuid(input.newFileId),400,'Choose an uploaded replacement file.');
    const [replacement]=await db.query('SELECT id,owner_id,filename,mime,size,content,content_hash,width,height,page_count FROM r.files WHERE id=$1',[input.newFileId]);
    requireCondition(replacement,404,'Replacement file not found.');
    requireCondition(replacement.owner_id===context.user.id,403,'Upload the replacement yourself before using it here.');
    requireCondition(mediaType(replacement.mime)===mediaType(file.mime),400,'The replacement must be the same kind of file (image, video, document, or archive).');
    await transaction(async client=>{
      await client.query('UPDATE r.files SET filename=$1,mime=$2,size=$3,content=$4,content_hash=$5,width=$6,height=$7,page_count=$8 WHERE id=$9',
        [replacement.filename,replacement.mime,replacement.size,replacement.content,replacement.content_hash,replacement.width,replacement.height,replacement.page_count,id]);
      await client.query('DELETE FROM r.files WHERE id=$1',[input.newFileId]);
      await audit(client,context.user.id,'media.replaced',id,{replacedWith:input.newFileId});
    });
  }
  return json(await mediaDetail(id));
}

const bulkSchema=z.object({
  ids:z.array(z.uuid()).min(1).max(50),
  action:z.enum(['trash','restore','purge','addTags','removeTags','move']),
  tags:z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  folderId:z.uuid().nullable().optional(),
  force:z.boolean().optional(),
});
async function bulkAction(context:AdminContext) {
  const input=bulkSchema.parse(await bodyJson(context.request));
  if(input.action==='move')requireCondition(input.folderId!==undefined,400,'Choose a destination folder.');
  if((input.action==='addTags'||input.action==='removeTags'))requireCondition(!!input.tags?.length,400,'Choose at least one tag.');
  let affected=0;
  await transaction(async client=>{
    for(const id of input.ids) {
      const [file]=await client.query('SELECT id,deleted_at FROM r.files WHERE id=$1',[id]);
      if(!file)continue;
      if(input.action==='trash'){
        if(file.deleted_at)continue;
        if(!input.force){const usage=await mediaUsage(client,id);if(usage.entries.length||usage.avatarOf.length)continue;}
        await client.query('UPDATE r.files SET deleted_at=now(),deleted_by=$1 WHERE id=$2',[context.user.id,id]);
      } else if(input.action==='restore'){if(!file.deleted_at)continue;await client.query('UPDATE r.files SET deleted_at=NULL,deleted_by=NULL WHERE id=$1',[id]);}
      else if(input.action==='purge'){if(!file.deleted_at)continue;await client.query('DELETE FROM r.files WHERE id=$1',[id]);}
      else if(input.action==='move')await client.query('UPDATE r.files SET folder_id=$1 WHERE id=$2',[input.folderId,id]);
      else if(input.action==='addTags'){
        const existing=(await client.query<{name:string}>('SELECT t.name FROM r.media_tag_links tl JOIN r.media_tags t ON t.id=tl.tag_id WHERE tl.file_id=$1',[id])).map(row=>row.name);
        await setTags(client,id,[...new Set([...existing,...(input.tags??[])])]);
      } else if(input.action==='removeTags'){
        const existing=(await client.query<{name:string}>('SELECT t.name FROM r.media_tag_links tl JOIN r.media_tags t ON t.id=tl.tag_id WHERE tl.file_id=$1',[id])).map(row=>row.name);
        await setTags(client,id,existing.filter(name=>!input.tags?.includes(name)));
      }
      affected++;
    }
    await audit(client,context.user.id,'media.bulk',input.action,{ids:input.ids,affected,folderId:input.folderId,tags:input.tags});
  });
  return json({ok:true,affected});
}

// ----- Folders -----
const folderNameSchema=z.string().trim().min(1).max(120);
async function foldersRoute(context:AdminContext) {
  if(context.method==='GET') {
    const rows=await db.query<{id:string;name:string;created_at:string;file_count:number}>(
      `SELECT mf.id,mf.name,mf.created_at,(SELECT count(*)::int FROM r.files f WHERE f.folder_id=mf.id AND f.deleted_at IS NULL) AS file_count FROM r.media_folders mf ORDER BY mf.name`);
    return json({folders:rows.map(row=>({id:row.id,name:row.name,createdAt:new Date(row.created_at).toISOString(),fileCount:Number(row.file_count)}))});
  }
  if(context.method==='POST') {
    const {name}=z.object({name:folderNameSchema}).parse(await bodyJson(context.request));
    const [row]=await db.query<{id:string}>('INSERT INTO r.media_folders(id,name,created_by) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING RETURNING id',[randomUUID(),name,context.user.id]);
    requireCondition(row,409,'A folder with this name already exists.');
    await audit(db,context.user.id,'media.folder.created',row.id,{name});
    return json({id:row.id,name},201);
  }
  if(context.method==='PATCH') {
    const {id,name,delete:remove}=z.object({id:z.uuid(),name:folderNameSchema.optional(),delete:z.boolean().optional()}).parse(await bodyJson(context.request));
    if(remove) {
      const [{count}]=await db.query<{count:number}>('SELECT count(*)::int FROM r.files WHERE folder_id=$1 AND deleted_at IS NULL',[id]);
      requireCondition(count===0,409,'Move or delete the files in this folder first.');
      await db.query('DELETE FROM r.media_folders WHERE id=$1',[id]);
      await audit(db,context.user.id,'media.folder.deleted',id,{});
      return json({ok:true});
    }
    requireCondition(name,400,'Enter a folder name.');
    await db.query('UPDATE r.media_folders SET name=$1 WHERE id=$2',[name,id]);
    await audit(db,context.user.id,'media.folder.renamed',id,{name});
    return json({ok:true});
  }
  throw new HttpError(404,'Endpoint not found.');
}

async function tagsRoute() {
  const rows=await db.query<{id:string;name:string;file_count:number}>(
    `SELECT t.id,t.name,(SELECT count(*)::int FROM r.media_tag_links tl JOIN r.files f ON f.id=tl.file_id WHERE tl.tag_id=t.id AND f.deleted_at IS NULL) AS file_count FROM r.media_tags t ORDER BY t.name`);
  return json({tags:rows.map(row=>({id:row.id,name:row.name,fileCount:Number(row.file_count)}))});
}

// ----- Stats -----
async function statsRoute() {
  const [totals,byType,largest,recent,trash]=await Promise.all([
    db.query<{count:number;bytes:number}>("SELECT count(*)::int AS count,coalesce(sum(size),0)::bigint AS bytes FROM r.files WHERE deleted_at IS NULL"),
    db.query<{mime:string;count:number;bytes:number}>("SELECT mime,count(*)::int AS count,coalesce(sum(size),0)::bigint AS bytes FROM r.files WHERE deleted_at IS NULL GROUP BY mime"),
    db.query('SELECT id,filename,display_name,mime,size FROM r.files WHERE deleted_at IS NULL ORDER BY size DESC LIMIT 10'),
    db.query('SELECT id,filename,display_name,mime,size,created_at FROM r.files WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10'),
    db.query<{count:number;bytes:number}>("SELECT count(*)::int AS count,coalesce(sum(size),0)::bigint AS bytes FROM r.files WHERE deleted_at IS NOT NULL"),
  ]);
  const byCategory:Record<MediaType,{count:number;bytes:number}>={image:{count:0,bytes:0},video:{count:0,bytes:0},document:{count:0,bytes:0},archive:{count:0,bytes:0}};
  for(const row of byType){const category=mediaType(row.mime);byCategory[category].count+=Number(row.count);byCategory[category].bytes+=Number(row.bytes);}
  const unused=await db.query<{count:number;bytes:number}>(`SELECT count(*)::int AS count,coalesce(sum(size),0)::bigint AS bytes FROM r.files f WHERE f.deleted_at IS NULL AND NOT (
      EXISTS(SELECT 1 FROM r.versions v WHERE v.data @> jsonb_build_object('sourceId',f.id::text) OR v.data @> jsonb_build_object('coverId',f.id::text) OR v.data @> jsonb_build_object('galleryIds',jsonb_build_array(f.id::text)) OR v.data @> jsonb_build_object('team',jsonb_build_array(jsonb_build_object('photoId',f.id::text))))
      OR EXISTS(SELECT 1 FROM r.users u WHERE u.profile->>'avatarId'=f.id::text)
    ) LIMIT 10001`);
  const fileLabel=(row:Record<string,unknown>)=>({id:row.id,filename:cleanText(row.display_name,200)||readableFilename(String(row.filename)),mime:row.mime,size:Number(row.size)});
  return json({
    total:{count:totals[0].count,bytes:Number(totals[0].bytes)},byType:byCategory,
    largest:largest.map(fileLabel),recentlyUploaded:recent.map(row=>({...fileLabel(row),createdAt:new Date(row.created_at as string).toISOString()})),
    unused:{count:unused[0].count,bytes:Number(unused[0].bytes)},trash:{count:trash[0].count,bytes:Number(trash[0].bytes)},
  });
}

const mediaColumns:ExportColumn<MediaSummary>[]=[
  {key:'id',label:'ID',value:row=>row.id},{key:'name',label:'Name',value:row=>row.displayName},{key:'type',label:'Type',value:row=>row.type},
  {key:'mime',label:'MIME type',value:row=>row.mime},{key:'size',label:'Size (bytes)',value:row=>row.size},{key:'folder',label:'Folder',value:row=>row.folder?.name??''},
  {key:'tags',label:'Tags',value:row=>row.tags.join(', ')},{key:'uploadedBy',label:'Uploaded by',value:row=>row.uploadedBy?.name??''},
  {key:'createdAt',label:'Uploaded',value:row=>row.createdAt},{key:'usageCount',label:'Usage count',value:row=>row.usageCount},
];

// Any admin holding the media permission may preview any file's bytes regardless of project/visibility status —
// unlike the public lib/api-files.ts accessibleFile() gate, which only exposes published/owned/reviewable files.
// This keeps Media Manager usable for freshly uploaded or currently-unattached media that the public route would 404 on.
async function contentRoute(request:Request,id:string) {
  requireCondition(isUuid(id),400,'The media ID is not valid.');
  const [file]=await db.query<{mime:string;filename:string;content:Buffer}>('SELECT mime,filename,content FROM r.files WHERE id=$1',[id]);
  requireCondition(file,404,'Media not found.');
  const url=new URL(request.url),width=url.searchParams.get('w');
  if(width!==null)requireCondition(file.mime.startsWith('image/')&&IMAGE_WIDTHS.some(allowed=>String(allowed)===width),400,'Unsupported image width.');
  const original=async()=>openBytes(file.content,'files.content');
  const content=width?await scaledImage(id,Number(width),original):await original();
  // Thumbnails are requested once per grid tile per page load (up to a full page of files at once), so the browser
  // is allowed to cache them for an hour, the same as the public file route's shared images — without this, every
  // re-render re-fetches and re-encodes every visible thumbnail, which is enough concurrent load to starve the
  // database connection pool (DATABASE_POOL_MAX defaults to 5).
  const headers:Record<string,string>={'Content-Type':width?'image/webp':file.mime,'Content-Disposition':`inline; filename="${openText(file.filename,'files.filename')}"`,'Cache-Control':width?'private, max-age=3600':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"};
  const isVideo=file.mime.startsWith('video/'),range=isVideo?request.headers.get('range'):null;
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

export async function mediaRoute(context:AdminContext):Promise<Response> {
  const {user,search,method,path,request}=context;
  requirePermission(user,'media');
  const sub=path.slice(1);
  if(sub[0]==='folders')return foldersRoute(context);
  if(sub[0]==='tags'&&method==='GET')return tagsRoute();
  if(sub[0]==='stats'&&method==='GET')return statsRoute();
  if(sub[0]==='bulk'&&method==='POST')return bulkAction(context);
  if(sub[0]==='export'&&method==='GET'){
    const result=await listMedia(search,false);
    await audit(db,user.id,'media.exported',context.request.url,{count:result.items.length});
    return exportResponse(search,'media',mediaColumns,result.items);
  }
  if(sub.length===0&&method==='GET')return json(await listMedia(search,choiceParam(search,'deleted',['true'] as const)==='true'));
  if(sub.length===2&&sub[1]==='content'&&method==='GET')return contentRoute(request,sub[0]);
  if(sub.length===1&&method==='GET')return json(await mediaDetail(sub[0]));
  if(sub.length===1&&method==='PATCH')return updateMetadata(context,sub[0]);
  if(sub.length===2&&sub[1]==='action'&&method==='POST')return performAction(context,sub[0]);
  throw new HttpError(404,'Endpoint not found.');
}
