import { randomUUID } from 'node:crypto';
import { db, transaction } from './db';
import { audit } from './auth';
import { requireCondition } from './errors';
import { projectSchema, teamMemberSchema, type User } from './schema';

export async function reactToProject(user:User,id:string,kind:'star'|'like',active:boolean) {
  return transaction(async client=>{
    const [project]=await client.query("SELECT id FROM r.projects WHERE id=$1 AND NOT archived FOR UPDATE",[id]);
    const [published]=await client.query("SELECT id FROM r.versions WHERE project_id=$1 AND status='approved' LIMIT 1",[id]);
    requireCondition(project&&published,404,'Project not found.');
    if(active)await client.query('INSERT INTO r.reactions(user_id,project_id,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[user.id,id,kind]);
    else await client.query('DELETE FROM r.reactions WHERE user_id=$1 AND project_id=$2 AND kind=$3',[user.id,id,kind]);
    const [counts]=await client.query("SELECT count(*) FILTER(WHERE kind='star')::int AS stars,count(*) FILTER(WHERE kind='like')::int AS likes FROM r.reactions rx JOIN r.users u ON u.id=rx.user_id WHERE project_id=$1 AND NOT u.suspended",[id]);
    return {kind,active,stars:counts.stars as number,likes:counts.likes as number};
  });
}

// A modification is independently owned and moderated. Its original version stays pinned.
export async function modifyProject(user:User,parentId:string,parentVersionId?:string) {
  return transaction(async client=>{
    const [parent]=await client.query('SELECT id FROM r.projects WHERE id=$1 AND NOT archived FOR SHARE',[parentId]);
    requireCondition(parent,404,'Original project not found.');
    const [version]=await client.query("SELECT * FROM r.versions WHERE project_id=$1 AND status='approved' AND ($2::uuid IS NULL OR id=$2) ORDER BY number DESC LIMIT 1",[parentId,parentVersionId||null]);
    requireCondition(version,404,'An approved original version is required.');
    const original=projectSchema.parse(version.data);
    const data=projectSchema.parse({...original,title:`${original.title.slice(0,100)} — modified`,teamName:`${user.name.slice(0,85)}'s team`,team:[teamMemberSchema.parse({name:user.name,email:user.email,contribution:'Modification author',branch:user.profile.department})],coverId:'',galleryIds:[],sourceId:'',videoUrl:'',github:'',liveUrl:'',startDate:'',endDate:'',purchaseDate:'',hardwareCosts:[],softwareCosts:[],services:[]});
    const id=randomUUID(),versionId=randomUUID();
    await client.query('INSERT INTO r.projects(id,owner_id,parent_project_id,parent_version_id) VALUES($1,$2,$3,$4)',[id,user.id,parentId,version.id]);
    await client.query("INSERT INTO r.versions(id,project_id,number,status,data,changelog) VALUES($1,$2,1,'draft',$3,'')",[versionId,id,JSON.stringify(data)]);
    await audit(client,user.id,'project.modified',id,{parentId,parentVersionId:version.id});
    return {id,versionId};
  });
}

export async function projectLineage(parentId:string|null,parentVersionId:string|null,id:string) {
  const [original]=parentId?await db.query("SELECT p.id,v.id AS version_id,v.number,v.data->>'title' AS title,v.data->>'teamName' AS team_name FROM r.projects p JOIN r.versions v ON v.project_id=p.id WHERE p.id=$1 AND v.id=$2 AND v.status='approved' AND NOT p.archived",[parentId,parentVersionId]):[];
  const modifications=await db.query("SELECT p.id,v.data->>'title' AS title,v.data->>'teamName' AS team_name FROM r.projects p JOIN r.versions v ON v.project_id=p.id WHERE p.parent_project_id=$1 AND NOT p.archived AND v.status='approved' AND v.number=(SELECT max(v2.number) FROM r.versions v2 WHERE v2.project_id=p.id AND v2.status='approved') ORDER BY v.created_at DESC LIMIT 50",[id]);
  return {original:original||null,modifications};
}
