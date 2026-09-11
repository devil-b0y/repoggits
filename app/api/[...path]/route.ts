import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { db, transaction } from '@/lib/db';
import { requireUser, canReview, audit, rateLimit } from '@/lib/auth';
import { authRoute } from '@/lib/api-auth';
import { upload, fileRoute } from '@/lib/api-files';
import { bodyJson, originCheck, json, failure } from '@/lib/http';
import { requireCondition, HttpError } from '@/lib/errors';
import { createProject, updateVersion, newVersion, reviewVersions, publicProjects, projectSelect, projectView, versionView, canEdit } from '@/lib/projects';
import { roles, type ProjectData, type User } from '@/lib/schema';
import { queueMail } from '@/lib/mail';
import { reactToProject, modifyProject, projectLineage } from '@/lib/project-community';
import { websiteBackup } from '@/lib/site-backup';
let backupRunning=false;

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
const uuid=(value:string)=>z.uuid().parse(value);
async function adminData(user:User,exportAll=false) {
  requireCondition(user.role!=='student',403,'Administrator access required.');
  const rows=(await db.query(`${projectSelect} ORDER BY v.updated_at DESC${exportAll?'':' LIMIT 1000'}`)).filter(row=>canReview(user,row.data));
  const projects=rows.map(projectView);
  const queue=projects.filter(p=>p.version.status==='pending'&&!p.archived);
  const targets=rows.flatMap(r=>[r.id,r.project_id]);
  const audits=user.role==='superadmin'?await db.query('SELECT a.*,u.name AS actor FROM r.audit a LEFT JOIN r.users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100'):await db.query('SELECT a.*,u.name AS actor FROM r.audit a LEFT JOIN r.users u ON u.id=a.actor_id WHERE target_id=ANY($1::text[]) ORDER BY a.created_at DESC LIMIT 100',[targets]);
  const users=user.role==='superadmin'?await db.query('SELECT id,email,name,role,scopes,verified,suspended FROM r.users ORDER BY created_at DESC LIMIT 500'):[];
  return {queue,projects,audit:audits,users};
}
async function handler(request:NextRequest,context:Context) {
 try {
  const {path}=await context.params;const [resource,id,sub]=path;const method=request.method;
  if(resource==='health'&&method==='GET'){
    // Reverse proxies, service managers, and container health checks poll this. It reports
    // reachability only: no version, environment, or error text is disclosed.
    try{await db.query('SELECT 1');}catch{return json({status:'unavailable',database:false},503);}
    return json({status:'ok',database:true});
  }
  if(!['GET','HEAD'].includes(method))originCheck(request);
  if(resource==='admin'&&id==='backup'){
    const user=await requireUser(request);
    requireCondition(user.role==='superadmin',403,'Super Admin access required.');
    requireCondition(method==='POST',405,'Method not allowed.');
    await rateLimit(`backup:${user.id}`,3,3600);
    requireCondition(!backupRunning,409,'A website backup is already being prepared.');
    backupRunning=true;
    try{
      const {buffer,fileCount}=await websiteBackup();
      await audit(db,user.id,'website.backup',user.id,{fileCount,bytes:buffer.length,scope:'website source; excludes database and private environment'});
      return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="repoggits-website-${new Date().toISOString().slice(0,10)}.zip"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }finally{backupRunning=false;}
  }
  if(resource==='auth'){
    const allowed:Record<string,string>={me:'GET',register:'POST',login:'POST',logout:'POST',forgot:'POST',reset:'POST',verify:'POST',invite:'POST',resend:'POST',profile:'PATCH'};
    requireCondition(allowed[id]===method,405,'Method not allowed.');return await authRoute(request,id);
  }
  if(resource==='settings'&&method==='GET'){
    const rows=await db.query("SELECT key,value FROM r.settings WHERE key IN ('categories','moderation')");return json(Object.fromEntries(rows.map(r=>[r.key,r.value])));
  }
  if(resource==='upload'&&method==='POST')return await upload(request);
  if(resource==='files'&&method==='GET')return await fileRoute(request,uuid(id),sub==='sign');
  if(resource==='projects'&&!id&&method==='GET'){
    // Browsing the collective requires an account; email verification is not required to look around.
    await requireUser(request,false);
    const projects=await publicProjects();const q=(request.nextUrl.searchParams.get('q')||'').toLowerCase();
    return json({projects:projects.filter(p=>!q||`${p.version.data.title} ${p.version.data.teamName} ${p.version.data.tags.join(' ')}`.toLowerCase().includes(q))});
  }
  if(resource==='projects'&&!id&&method==='POST'){
    const user=await requireUser(request);await rateLimit(`project:${user.id}`,30,3600);
    const input=z.object({data:z.unknown(),submit:z.boolean().default(false),changelog:z.string().trim().max(5000).default('Initial version')}).parse(await bodyJson(request));
    return json(await createProject(user,input.data,input.submit,input.changelog),201);
  }
  if(resource==='projects'&&id&&method==='GET'){
    uuid(id);
    // Viewing a project requires an account; email verification is not required to look around.
    const [user,rows]=await Promise.all([requireUser(request,false),db.query(`${projectSelect} WHERE p.id=$1 ORDER BY v.number DESC`,[id])]);
    requireCondition(rows.length,404,'Project not found.');
    const editable=!rows[0].example&&(rows[0].owner_id===user.id||await canEdit(db,user,id));
    const visible=rows.filter(row=>editable||canReview(user,row.data)||row.status==='approved'&&!row.archived);
    requireCondition(visible.length,404,'Project not found.');
    const versionId=request.nextUrl.searchParams.get('version');
    const active=(versionId?visible.find(v=>v.id===versionId):visible.find(v=>v.status==='approved')||visible[0]);
    requireCondition(active,404,'Version not found.');
    const result=projectView(active);
    const [comments,reviews,bookmarks,publicList,reactions,lineage]=await Promise.all([
      db.query('WITH roots AS (SELECT id FROM r.comments WHERE project_id=$1 AND parent_id IS NULL ORDER BY created_at DESC LIMIT 100) SELECT c.id,c.body,c.parent_id,c.created_at,u.name FROM r.comments c JOIN r.users u ON u.id=c.user_id WHERE c.project_id=$1 AND (c.id IN (SELECT id FROM roots) OR c.parent_id IN (SELECT id FROM roots)) ORDER BY c.created_at ASC LIMIT 5000',[id]),
      editable||canReview(user,active.data)?db.query('SELECT rv.action,rv.reason,rv.created_at,u.name FROM r.reviews rv JOIN r.users u ON u.id=rv.admin_id WHERE version_id=$1 ORDER BY rv.created_at',[active.id]):Promise.resolve([]),
      db.query('SELECT user_id FROM r.bookmarks WHERE user_id=$1 AND project_id=$2',[user.id,id]),
      publicProjects(),
      db.query('SELECT kind FROM r.reactions WHERE project_id=$1 AND user_id=$2',[id,user.id]),
      projectLineage(result.parentProjectId,result.parentVersionId,id),
    ]);
    const saved=bookmarks.length>0;
    // Team email addresses are for collaborator authorization, never public display.
    if(!editable&&!canReview(user,active.data))result.version.data={...result.version.data,team:result.version.data.team.map(member=>({...member,email:''}))};
    const related=publicList.filter(p=>p.id!==id&&(p.version.data.department===active.data.department||p.version.data.tags.some(tag=>active.data.tags.includes(tag)))).slice(0,3);
    return json({project:result,...lineage,starred:reactions.some(r=>r.kind==='star'),liked:reactions.some(r=>r.kind==='like'),versions:visible.map(row=>({id:row.id,number:row.number,status:row.status,changelog:row.changelog,createdAt:row.created_at})),comments,reviews,editable,saved,related});
  }
  if(resource==='projects'&&id&&sub==='reactions'&&method==='POST'){
    const user=await requireUser(request);await rateLimit(`reaction:${user.id}`,120,3600);
    const input=z.object({kind:z.enum(['star','like']),active:z.boolean()}).parse(await bodyJson(request));
    return json(await reactToProject(user,uuid(id),input.kind,input.active));
  }
  if(resource==='projects'&&id&&sub==='modify'&&method==='POST'){
    const user=await requireUser(request);await rateLimit(`project:${user.id}`,30,3600);
    const input=z.object({versionId:z.uuid().optional()}).parse(await bodyJson(request));
    return json(await modifyProject(user,uuid(id),input.versionId),201);
  }
  if(resource==='projects'&&id&&sub==='versions'&&method==='POST')return json(await newVersion(await requireUser(request),uuid(id)),201);
  if(resource==='projects'&&id&&sub==='view'&&method==='POST'){
    const [exists]=await db.query("SELECT p.id FROM r.projects p JOIN r.versions v ON v.project_id=p.id WHERE p.id=$1 AND NOT p.archived AND v.status='approved' LIMIT 1",[uuid(id)]);
    if(exists)await db.query('UPDATE r.projects SET views=views+1 WHERE id=$1',[id]);return json({ok:true});
  }
  if(resource==='projects'&&id&&sub==='bookmark'&&method==='POST'){
    const user=await requireUser(request,false);uuid(id);
    const [project]=await db.query("SELECT p.id FROM r.projects p JOIN r.versions v ON v.project_id=p.id WHERE p.id=$1 AND NOT p.archived AND v.status='approved' LIMIT 1",[id]);requireCondition(project,404,'Project not found.');
    const {saved}=z.object({saved:z.boolean()}).parse(await bodyJson(request));
    if(saved)await db.query('INSERT INTO r.bookmarks(user_id,project_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[user.id,id]);else await db.query('DELETE FROM r.bookmarks WHERE user_id=$1 AND project_id=$2',[user.id,id]);return json({saved});
  }
  if(resource==='projects'&&id&&sub==='comments'&&method==='POST'){
    const user=await requireUser(request);await rateLimit(`comment:${user.id}`,20,3600);
    const {body,parentId}=z.object({body:z.string().trim().min(2).max(2000),parentId:z.uuid().optional()}).parse(await bodyJson(request));
    const [project]=await db.query("SELECT p.id FROM r.projects p JOIN r.versions v ON v.project_id=p.id WHERE p.id=$1 AND NOT p.archived AND v.status='approved' LIMIT 1",[uuid(id)]);requireCondition(project,404,'Project not found.');
    let rootId:string|null=null;
    if(parentId){const [parent]=await db.query('SELECT id,parent_id FROM r.comments WHERE id=$1 AND project_id=$2',[parentId,id]);requireCondition(parent,404,'Discussion thread not found.');rootId=parent.parent_id||parent.id;}
    const commentId=randomUUID();const [comment]=await db.query('INSERT INTO r.comments(id,project_id,user_id,body,parent_id) VALUES($1,$2,$3,$4,$5) RETURNING id,body,parent_id,created_at',[commentId,id,user.id,body,rootId]);return json({id:commentId,parentId:rootId,comment:{...comment,name:user.name}},201);
  }
  if(resource==='versions'&&id&&method==='PATCH'){
    const user=await requireUser(request);const input=z.object({data:z.unknown(),submit:z.boolean().default(false),changelog:z.string().trim().max(5000)}).parse(await bodyJson(request));
    return json(await updateVersion(user,uuid(id),input.data,input.submit,input.changelog));
  }
  if(resource==='workspace'&&method==='GET'){
    const user=await requireUser(request,false);
    const own=await db.query(`${projectSelect} WHERE (p.owner_id=$1 OR $3 AND NOT p.example AND EXISTS(SELECT 1 FROM r.versions av WHERE av.project_id=p.id AND av.status='approved' AND av.data->'team' @> $2::jsonb)) AND v.number=(SELECT max(v2.number) FROM r.versions v2 WHERE v2.project_id=p.id) ORDER BY v.updated_at DESC`,[user.id,JSON.stringify([{email:user.email}]),user.verified]);
    const bookmarks=await db.query('SELECT project_id FROM r.bookmarks WHERE user_id=$1',[user.id]);const ids=new Set(bookmarks.map(b=>b.project_id));
    const notifications=await db.query('SELECT id,message,project_id,read,created_at FROM r.notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[user.id]);
    return json({user,projects:own.map(projectView),saved:(await publicProjects()).filter(p=>ids.has(p.id)),notifications});
  }
  if(resource==='notifications'&&method==='POST'){const user=await requireUser(request,false);await db.query('UPDATE r.notifications SET read=true WHERE user_id=$1',[user.id]);return json({ok:true});}
  if(resource==='admin'){
    const user=await requireUser(request);requireCondition(user.role!=='student',403,'Administrator access required.');
    if(!id&&method==='GET')return json(await adminData(user));
    if(id==='reviews'&&method==='POST'){
      const input=z.object({ids:z.array(z.uuid()).min(1).max(20),action:z.enum(['approve','reject','changes_requested']),reason:z.string().trim().max(2000).default('')}).parse(await bodyJson(request));
      const messages=await reviewVersions(user,input.ids,input.action,input.reason);
      await Promise.all(messages.map(m=>queueMail(m.email,'Your project review has an update',m.message)));return json({ok:true});
    }
    if(id==='projects'&&method==='PATCH'){
      const input=z.object({id:z.uuid(),featured:z.boolean().optional(),archived:z.boolean().optional()}).parse(await bodyJson(request));
      await transaction(async client=>{const [v]=await client.query('SELECT * FROM r.versions WHERE project_id=$1 ORDER BY number DESC LIMIT 1',[input.id]);requireCondition(v&&canReview(user,v.data),404,'Project not found.');await client.query('UPDATE r.projects SET featured=COALESCE($1,featured),archived=COALESCE($2,archived) WHERE id=$3',[input.featured??null,input.archived??null,input.id]);await audit(client,user.id,'project.managed',input.id,input);});return json({ok:true});
    }
    if(id==='users'&&method==='PATCH'){
      requireCondition(user.role==='superadmin',403,'Super Admin access required.');
      const input=z.object({id:z.uuid(),role:z.enum(roles),scopes:z.array(z.string().regex(/^(department|subject):.{1,100}$/)).max(30),suspended:z.boolean()}).parse(await bodyJson(request));
      await transaction(async client=>{
        await client.query("SELECT pg_advisory_xact_lock(hashtext('repoggits-admin-roles'))");
        const [target]=await client.query('SELECT id,role,suspended FROM r.users WHERE id=$1 FOR UPDATE',[input.id]);requireCondition(target,404,'User not found.');
        if(target.role==='superadmin'&&(input.role!=='superadmin'||input.suspended)){const [count]=await client.query("SELECT count(*)::int AS n FROM r.users WHERE role='superadmin' AND NOT suspended AND id<>$1",[input.id]);requireCondition(count.n>0,409,'Keep at least one active Super Admin.');}
        await client.query('UPDATE r.users SET role=$1,scopes=$2,suspended=$3 WHERE id=$4',[input.role,JSON.stringify(input.scopes),input.suspended,input.id]);
        await client.query('DELETE FROM r.sessions WHERE user_id=$1',[input.id]);await audit(client,user.id,'user.updated',input.id,input);
      });return json({ok:true});
    }
    if(id==='settings'&&method==='PATCH'){
      requireCondition(user.role==='superadmin',403,'Super Admin access required.');
      // An empty list means any email domain may register; otherwise only exact domain matches may.
      const domain=z.string().trim().max(100).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i,'Enter a valid domain, e.g. college.edu').transform(value=>value.toLowerCase());
      const input=z.object({requiredApprovals:z.union([z.literal(1),z.literal(2)]),departments:z.array(z.string().trim().min(2).max(100)).min(1).max(50),subjects:z.array(z.string().trim().min(2).max(100)).max(100),tags:z.array(z.string().trim().min(1).max(40)).max(100),allowedEmailDomains:z.array(domain).max(50).default([])}).parse(await bodyJson(request));
      await transaction(async client=>{await client.query("UPDATE r.settings SET value=$1 WHERE key='moderation'",[JSON.stringify({requiredApprovals:input.requiredApprovals,allowedEmailDomains:[...new Set(input.allowedEmailDomains)]})]);await client.query("UPDATE r.settings SET value=$1 WHERE key='categories'",[JSON.stringify({departments:input.departments,subjects:input.subjects,tags:input.tags})]);await audit(client,user.id,'settings.updated','settings',input);});return json({ok:true});
    }
    if(id==='export'&&method==='GET'){
      const data=await adminData(user,true);
      const cell=(value:unknown)=>`"${String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`;
      const csv=[['Project','Version','Title','Department','Status','Team','Views','Downloads'].map(cell).join(','),...data.projects.map(p=>[p.id,p.version.number,p.version.data.title,p.version.data.department,p.version.status,p.version.data.teamName,p.views,p.downloads].map(cell).join(','))].join('\r\n');
      return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="repoggits-report.csv"','Cache-Control':'no-store'}});
    }
  }
  if(resource==='feed'&&method==='GET'){
    const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const origin=process.env.APP_ORIGIN||new URL(request.url).origin;
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Repoggits projects</title><link>${escape(origin)}</link><description>New student projects</description>${(await publicProjects()).slice(0,30).map(p=>`<item><title>${escape(p.version.data.title)}</title><link>${escape(origin)}/projects/${p.id}</link><guid>${p.version.id}</guid><description>${escape(p.version.data.summary)}</description><pubDate>${new Date(p.version.createdAt).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`,{headers:{'Content-Type':'application/rss+xml; charset=utf-8'}});
  }
  throw new HttpError(404,'Endpoint not found.');
 } catch(error) {return failure(error);}
}
export const GET=handler;
export const POST=handler;
export const PATCH=handler;
