import { randomUUID } from 'node:crypto';
import { db, transaction, type Db } from './db';
import { audit, canReview } from './auth';
import { openText } from './encryption';
import { requireCondition } from './errors';
import { projectSchema, type ProjectData, type User, type Version, type Project } from './schema';

export function versionView(row:Record<string,unknown>):Version {
  return {id:String(row.id),projectId:String(row.project_id),number:Number(row.number),status:row.status as Version['status'],data:projectSchema.parse(row.data),changelog:String(row.changelog),createdAt:new Date(row.created_at as string).toISOString(),updatedAt:new Date((row.updated_at||row.created_at) as string).toISOString(),requiredApprovals:Number(row.required_approvals),approvals:Number(row.approvals||0),feedback:row.feedback?String(row.feedback):undefined};
}
// The sample's demo and video are files this deployment serves under /samples/, so they follow whatever address
// the site is hosted at now rather than the one it had when the sample was first seeded.
function servedHere(url:string) {
  const origin=process.env.APP_ORIGIN?.replace(/\/+$/,'');
  return origin&&/^https?:\/\/[^/]+\/samples\//i.test(url)?url.replace(/^https?:\/\/[^/]+/i,origin):url;
}
export function projectView(row:Record<string,unknown>):Project {
  const version=versionView(row);
  if(row.example)version.data={...version.data,liveUrl:servedHere(version.data.liveUrl),videoUrl:servedHere(version.data.videoUrl)};
  return {id:String(row.project_id),ownerId:String(row.owner_id),featured:!!row.featured,archived:!!row.archived,example:!!row.example,views:Number(row.views),downloads:Number(row.downloads),stars:Number(row.stars||0),likes:Number(row.likes||0),parentProjectId:row.parent_project_id?String(row.parent_project_id):null,parentVersionId:row.parent_version_id?String(row.parent_version_id):null,modificationId:null,version};
}
export const projectSelect=`SELECT v.*,p.owner_id,p.featured,p.archived,p.example,p.views,p.downloads,p.parent_project_id,p.parent_version_id,
  (SELECT count(*) FROM r.reactions rx JOIN r.users ru ON ru.id=rx.user_id AND NOT ru.suspended WHERE rx.project_id=p.id AND rx.kind='star') AS stars,
  (SELECT count(*) FROM r.reactions rx JOIN r.users ru ON ru.id=rx.user_id AND NOT ru.suspended WHERE rx.project_id=p.id AND rx.kind='like') AS likes,
  (SELECT count(*) FROM r.reviews rv WHERE rv.version_id=v.id AND rv.action='approve') AS approvals,
  (SELECT reason FROM r.reviews rv WHERE rv.version_id=v.id AND rv.action IN ('reject','changes_requested') ORDER BY created_at DESC LIMIT 1) AS feedback
  FROM r.versions v JOIN r.projects p ON p.id=v.project_id`;
// The review desk lists up to a thousand versions at once, and the cost of that is the bytes crossing the
// network, not the query: a full row carries the write-up, the team, the stack and every media id, none of
// which the desk shows — a reviewer opens the project itself for those. So only the fields it renders are
// sent, and only the approval count is counted (it shows no reaction totals and no earlier reviewer's reason).
// The missing keys are restored by projectSchema's own defaults, and projectView reads its columns defensively.
export const reviewSelect=`SELECT v.id,v.project_id,v.number,v.status,v.changelog,v.created_at,v.updated_at,v.required_approvals,
  jsonb_strip_nulls(jsonb_build_object('title',v.data->'title','summary',v.data->'summary','department',v.data->'department',
    'subject',v.data->'subject','teamName',v.data->'teamName','type',v.data->'type','github',v.data->'github')) AS data,
  p.owner_id,p.featured,p.archived,p.example,p.views,p.downloads,p.parent_project_id,p.parent_version_id,
  (SELECT count(*) FROM r.reviews rv WHERE rv.version_id=v.id AND rv.action='approve') AS approvals
  FROM r.versions v JOIN r.projects p ON p.id=v.project_id`;
// Every place a version can point at an uploaded file, written as containment tests so the versions_data_idx GIN
// index answers them. `first` numbers the first of four placeholders, which fileReferenceParams fills in order.
export const fileReference=(first:number)=>`(data @> $${first}::jsonb OR data @> $${first+1}::jsonb OR data @> $${first+2}::jsonb OR data @> $${first+3}::jsonb)`;
export const fileReferenceParams=(id:string)=>[{sourceId:id},{coverId:id},{galleryIds:[id]},{team:[{photoId:id}]}].map(value=>JSON.stringify(value));

export async function canEdit(client:Db,user:User,projectId:string) {
  const [project]=await client.query('SELECT owner_id,example FROM r.projects WHERE id=$1',[projectId]);
  if(!project||project.example)return false;
  if(project.owner_id===user.id)return true;
  const [latest]=await client.query('SELECT data FROM r.versions WHERE project_id=$1 ORDER BY number DESC LIMIT 1',[projectId]);
  // A Super Admin, or a Teacher-Admin scoped to this project's own department/subject, edits like they review —
  // same rule as canReview, so anyone who can approve a submission can also fix it directly.
  if(latest?.data&&canReview(user,latest.data as ProjectData))return true;
  // Team membership is claimed by email address, so it only counts once the account has proven it owns that address.
  if(!user.verified)return false;
  const [approved]=await client.query("SELECT data FROM r.versions WHERE project_id=$1 AND status='approved' ORDER BY number DESC LIMIT 1",[projectId]);
  return !!(approved?.data as ProjectData|undefined)?.team.some(member=>member.email===user.email);
}
export async function validateFiles(client:Db,user:User,data:ProjectData,projectId?:string) {
  const imageIds=[data.coverId,...data.galleryIds,...data.team.map(member=>member.photoId)].filter(Boolean);
  const ids=[...new Set([...imageIds,data.sourceId].filter(Boolean))];
  if(!ids.length)return;
  // One query for all attached files rather than one per file.
  const files=new Map((await client.query('SELECT id,owner_id,mime,scan_status FROM r.files WHERE id=ANY($1::uuid[])',[ids])).map(file=>[String(file.id),file]));
  for(const id of ids) {
    const file=files.get(id.toLowerCase());
    requireCondition(file&&['clean','validated_internal'].includes(file.scan_status),400,'One of the selected files is unavailable.');
    // Someone else's file may stay attached only when an earlier version of this project already used it.
    const reused=file.owner_id!==user.id&&!!projectId&&(await client.query(`SELECT 1 FROM r.versions WHERE project_id=$1 AND ${fileReference(2)} LIMIT 1`,[projectId,...fileReferenceParams(id)])).length>0;
    requireCondition(file.owner_id===user.id||reused,403,'You cannot attach another user’s file.');
    if(id===data.sourceId)requireCondition(file.mime==='application/zip',400,'Use a ZIP for source code.');
    if(imageIds.includes(id))requireCondition(file.mime==='image/webp',400,'Use an image for project and team photos.');
  }
}
function requireSubmission(data:ProjectData,changelog:string) {
  requireCondition(data.summary.length>=20&&data.description.length>=50&&data.subject.length>0&&data.tags.length>0&&data.team.length>0,400,'Before submitting, add a subject, summary (20+ characters), description (50+ characters), team, and technologies.');
  requireCondition(changelog.trim().length>=10,400,'Add a changelog of at least 10 characters.');
}
export async function createProject(user:User,input:unknown,submit:boolean,changelog:string) {
  const data=projectSchema.parse(input);if(submit)requireSubmission(data,changelog);
  return transaction(async client=>{
    const id=randomUUID(),versionId=randomUUID();await validateFiles(client,user,data);
    const [setting]=await client.query("SELECT value FROM r.settings WHERE key='moderation'");
    await client.query('INSERT INTO r.projects(id,owner_id) VALUES($1,$2)',[id,user.id]);
    await client.query('INSERT INTO r.versions(id,project_id,number,status,data,changelog,required_approvals) VALUES($1,$2,1,$3,$4,$5,$6)',[versionId,id,submit?'pending':'draft',JSON.stringify(data),changelog,setting.value.requiredApprovals]);
    await audit(client,user.id,submit?'project.submitted':'project.drafted',versionId);
    return {id,versionId};
  });
}
export async function updateVersion(user:User,versionId:string,input:unknown,submit:boolean,changelog:string) {
  const data=projectSchema.parse(input);if(submit)requireSubmission(data,changelog);
  return transaction(async client=>{
    const [version]=await client.query('SELECT * FROM r.versions WHERE id=$1 FOR UPDATE',[versionId]);
    requireCondition(version&&await canEdit(client,user,version.project_id),404,'Project version not found.');
    // Pending is editable too: saving resets it to a fresh review (submit=true) or pulls it back to a draft
    // (submit=false), either way clearing the votes cast so far below. Only a resolved version (approved/rejected)
    // is locked — that one needs "Start new version" instead.
    requireCondition(['draft','changes_requested','pending'].includes(version.status),409,'This version is locked. Create a new version after review.');
    await validateFiles(client,user,data,version.project_id);
    const [setting]=await client.query("SELECT value FROM r.settings WHERE key='moderation'");
    await client.query('UPDATE r.versions SET data=$1,status=$2,changelog=$3,required_approvals=$4,updated_at=now() WHERE id=$5',[JSON.stringify(data),submit?'pending':'draft',changelog,setting.value.requiredApprovals,versionId]);
    await client.query('DELETE FROM r.reviews WHERE version_id=$1',[versionId]);
    await audit(client,user.id,submit?'version.submitted':'version.saved',versionId);
    return {id:version.project_id,versionId};
  });
}
// Pulls a pending submission out of the review queue by mistake or change of mind — back to draft, data and
// changelog untouched, no reviewer notification (nothing was decided). Distinct from deleting the project: the
// student keeps everything and can resubmit whenever they are ready.
export async function withdrawVersion(user:User,versionId:string) {
  return transaction(async client=>{
    const [version]=await client.query('SELECT * FROM r.versions WHERE id=$1 FOR UPDATE',[versionId]);
    requireCondition(version&&await canEdit(client,user,version.project_id),404,'Project version not found.');
    requireCondition(version.status==='pending',409,'Only a submission awaiting review can be withdrawn.');
    await client.query("UPDATE r.versions SET status='draft',updated_at=now() WHERE id=$1",[versionId]);
    await client.query('DELETE FROM r.reviews WHERE version_id=$1',[versionId]);
    await audit(client,user.id,'version.withdrawn',versionId);
    return {id:version.project_id,versionId};
  });
}
export async function newVersion(user:User,projectId:string) {
  return transaction(async client=>{
    const [project]=await client.query('SELECT * FROM r.projects WHERE id=$1 FOR UPDATE',[projectId]);
    requireCondition(project&&await canEdit(client,user,projectId),404,'Project not found.');
    requireCondition(!project.archived,409,'Archived projects cannot receive updates.');
    const [last]=await client.query('SELECT * FROM r.versions WHERE project_id=$1 ORDER BY number DESC LIMIT 1',[projectId]);
    requireCondition(last&&['approved','rejected'].includes(last.status),409,'Finish the current draft or review before starting a new version.');
    const versionId=randomUUID();
    await client.query("INSERT INTO r.versions(id,project_id,number,status,data,changelog) VALUES($1,$2,$3,'draft',$4,'')",[versionId,projectId,last.number+1,last.data]);
    await audit(client,user.id,'version.created',versionId);
    return {id:projectId,versionId};
  });
}
export async function reviewVersions(user:User,ids:string[],action:'approve'|'reject'|'changes_requested',reason:string) {
  requireCondition(user.role!=='student',403,'Administrator access required.');
  requireCondition(ids.length>0&&ids.length<=20,400,'Select between 1 and 20 versions.');
  if(action!=='approve')requireCondition(reason.trim().length>=10,400,'Give a reason of at least 10 characters.');
  const messages=await transaction(async client=>{
    const queued:{email:string;message:string}[]=[];
    for(const id of [...new Set(ids)].sort()) {
      // The owner's address comes with the version, so notifying them needs no query of its own.
      const [v]=await client.query('SELECT v.*,p.owner_id,p.archived,u.email AS owner_email FROM r.versions v JOIN r.projects p ON p.id=v.project_id JOIN r.users u ON u.id=p.owner_id WHERE v.id=$1 FOR UPDATE OF v,p',[id]);
      requireCondition(v&&canReview(user,v.data),404,'One or more versions are outside your review assignment.');
      requireCondition(v.status==='pending'&&!v.archived,409,'One or more versions are no longer pending review.');
      requireCondition(v.owner_id!==user.id&&!(v.data as ProjectData).team.some(member=>member.email===user.email),403,'You cannot review your own team’s work.');
      const existing=await client.query('SELECT id FROM r.reviews WHERE version_id=$1 AND admin_id=$2',[id,user.id]);
      requireCondition(!existing.length,409,'You have already reviewed this version.');
      await client.query('INSERT INTO r.reviews(id,version_id,admin_id,action,reason) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,user.id,action,reason]);
      const [count]=await client.query("SELECT count(*)::int AS n FROM r.reviews WHERE version_id=$1 AND action='approve'",[id]);
      const status=action==='approve'?(count.n>=v.required_approvals?'approved':'pending'):action==='reject'?'rejected':'changes_requested';
      await client.query('UPDATE r.versions SET status=$1,updated_at=now() WHERE id=$2',[status,id]);
      await audit(client,user.id,`review.${action}`,id,{reason,status});
      const message=`${v.data.title} · version ${v.number}: ${status.replaceAll('_',' ')}${status==='pending'?` (${count.n}/${v.required_approvals} approvals)`:''}.${reason?' '+reason:''}`;
      await client.query('INSERT INTO r.notifications(id,user_id,message,project_id) VALUES($1,$2,$3,$4)',[randomUUID(),v.owner_id,message,v.project_id]);
      queued.push({email:openText(v.owner_email,'users.email'),message});
    }
    return queued;
  });
  invalidatePublicProjects();
  return messages;
}

// Discovery, project pages, saved projects and the RSS feed all start from this list, the most expensive query here.
// Each process keeps it briefly and concurrent requests share one load, so callers must copy before changing anything.
// Changes made through this process (reviews, reactions, staff picks, suspensions) clear it at once. Changes from
// anywhere else, such as another instance or npm run db:sample, and view and download counts appear within the TTL.
const PUBLIC_LIST_TTL_MS=15_000;
let publicList:{expires:number;projects:Promise<Project[]>}|undefined;
export function invalidatePublicProjects() {publicList=undefined;}
export function publicProjects():Promise<Project[]> {
  if(publicList&&publicList.expires>Date.now())return publicList.projects;
  const entry={expires:Date.now()+PUBLIC_LIST_TTL_MS,projects:loadPublicProjects()};
  publicList=entry;
  // A failed load is dropped so the next request tries again.
  entry.projects.catch(()=>{if(publicList===entry)publicList=undefined;});
  return entry.projects;
}
async function loadPublicProjects() {
  const projects=(await db.query(`${projectSelect} WHERE v.status='approved' AND NOT p.archived AND v.number=(SELECT max(v2.number) FROM r.versions v2 WHERE v2.project_id=p.id AND v2.status='approved') ORDER BY stars DESC,likes DESC,v.created_at DESC,p.id LIMIT 500`)).map(row=>{
    const project=projectView(row);
    project.version.data={...project.version.data,team:project.version.data.team.map(member=>({...member,email:'',rollNumber:''}))};
    return project;
  });
  // Each original's published modification, paired from the list itself rather than a subquery per row. A
  // modification only counts once it is public here, so the link an original offers always resolves. Where a
  // project has several, this takes the first in the list's own order (stars, then likes, then newest) and the
  // project page still lists them all.
  const byParent=new Map<string,string>();
  for(const project of projects)if(project.parentProjectId&&!byParent.has(project.parentProjectId))byParent.set(project.parentProjectId,project.id);
  for(const project of projects)project.modificationId=byParent.get(project.id)??null;
  return projects;
}
