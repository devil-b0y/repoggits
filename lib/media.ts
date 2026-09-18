import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { Db } from './db';
import { openText } from './encryption';
import { fileReference, fileReferenceParams } from './projects';

// Shared between the Media Manager admin API (lib/admin/media.ts) and the upload path (lib/api-files.ts):
// content fingerprinting for duplicate detection, and where a file is actually used, computed live against
// r.versions/r.users rather than a second reverse-index table that could drift from the real references.

export const hashContent=(content:Buffer)=>createHash('sha256').update(content).digest('hex');

export type MediaUsageEntry={projectId:string;versionId:string;versionNumber:number;title:string;role:'cover'|'gallery'|'source'|'team photo';status:string};
export type MediaUsage={entries:MediaUsageEntry[];avatarOf:string[]};

/** Every place `id` is referenced: which project versions (as cover/gallery/source/team photo) and which user avatars. */
export async function mediaUsage(client:Db,id:string):Promise<MediaUsage> {
  const [versions,avatars]=await Promise.all([
    client.query<{project_id:string;id:string;number:number;status:string;data:{title:string;coverId?:string;galleryIds?:string[];sourceId?:string;team?:{photoId?:string}[]}}>(
      `SELECT v.project_id,v.id,v.number,v.status,v.data FROM r.versions v JOIN r.projects p ON p.id=v.project_id WHERE ${fileReference(1)}`,fileReferenceParams(id)),
    client.query<{id:string;name:string}>("SELECT id,name FROM r.users WHERE profile->>'avatarId'=$1",[id]),
  ]);
  const entries:MediaUsageEntry[]=[];
  for(const v of versions) {
    const title=v.data.title||'Untitled project';
    if(v.data.coverId===id)entries.push({projectId:v.project_id,versionId:v.id,versionNumber:v.number,title,role:'cover',status:v.status});
    if(v.data.galleryIds?.includes(id))entries.push({projectId:v.project_id,versionId:v.id,versionNumber:v.number,title,role:'gallery',status:v.status});
    if(v.data.sourceId===id)entries.push({projectId:v.project_id,versionId:v.id,versionNumber:v.number,title,role:'source',status:v.status});
    if(v.data.team?.some(member=>member.photoId===id))entries.push({projectId:v.project_id,versionId:v.id,versionNumber:v.number,title,role:'team photo',status:v.status});
  }
  return {entries,avatarOf:avatars.map(row=>row.name)};
}

export const readableFilename=(value:string)=>{try{return openText(value,'files.filename');}catch{return '';}};

export const MEDIA_TYPES=['image','video','document','archive'] as const;
export type MediaType=typeof MEDIA_TYPES[number];
export function mediaType(mime:string):MediaType {
  if(mime.startsWith('image/'))return 'image';
  if(mime.startsWith('video/'))return 'video';
  if(mime==='application/zip')return 'archive';
  return 'document';
}

// Photos are stored up to 2400px wide, far more than a card or thumbnail shows. Scaled copies are made on first
// request and kept per process up to this many bytes, the least recently used dropped first. Shared by the public
// file route (lib/api-files.ts) and the Media Manager admin route (lib/admin/media.ts) — same file, same scale,
// same bytes either way — so an admin browsing the grid warms the same cache a project page would read from.
const SCALED_CACHE_BYTES=32*1024*1024;
const scaled=new Map<string,Buffer>();let scaledBytes=0;
export async function scaledImage(id:string,width:number,original:()=>Promise<Buffer>) {
  const key=`${id}:${width}`,hit=scaled.get(key);
  if(hit){scaled.delete(key);scaled.set(key,hit);return hit;}
  const image=await sharp(await original(),{limitInputPixels:25_000_000}).resize({width,withoutEnlargement:true}).webp({quality:80}).toBuffer();
  const previous=scaled.get(key);if(previous)scaledBytes-=previous.length;
  scaled.delete(key);scaled.set(key,image);scaledBytes+=image.length;
  for(const [oldest,bytes] of scaled){if(scaledBytes<=SCALED_CACHE_BYTES)break;scaled.delete(oldest);scaledBytes-=bytes.length;}
  return image;
}
