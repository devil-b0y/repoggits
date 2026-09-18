import { db } from '../db';
import { HttpError, requireCondition } from '../errors';
import { json } from '../http';
import { EMAIL_MATCH, emailMatchParams, openProfile, openText } from '../encryption';
import { cleanText } from '../safe-text';
import { retentionSettings, type RetentionSettings } from '../tracking/config';
import { hasPermission, requirePermission } from './permissions';
import { choiceParam, cappedCount, containsPattern, isUuid, pageRequest, paged, sortParam, SqlWhere, textParam } from './query';
import { onlineSql, sessionRow, sessionSelect, SESSION_FROM } from './session-rows';
import type { SessionRow } from './types';
import type { AdminContext } from './router';

// GET /api/admin/users (Paged<UserSummary>) and GET /api/admin/users/:id (UserDetail) for Admin › Users.
// Emails are stored encrypted, so search matches a name, an exact user ID or an exact email through its lookup hash.

export type UserSummary={id:string;name:string;email:string;role:string;verified:boolean;suspended:boolean;deleted:boolean;createdAt:string;lastActiveAt:string|null;status:'online'|'offline';sessions:number;events7d:number};
export type DeviceInfo=Pick<SessionRow,'deviceType'|'os'|'osVersion'|'browser'|'browserVersion'|'platform'|'userAgent'|'screenWidth'|'screenHeight'|'pixelRatio'|'touch'|'language'|'timezone'>;
export type IpHistoryEntry={ip:string;firstSeen:string;lastSeen:string;sessions:number;events:number};
export type UserDetail={
  user:{id:string;name:string;email:string;role:string;verified:boolean;suspended:boolean;aiBlocked:boolean;createdAt:string;department:string;batch:string;deleted:boolean;deletedAt:string|null;deletedReason:string};
  presence:{status:'online'|'offline';lastSeenAt:string|null};
  device:DeviceInfo|null;currentSession:SessionRow|null;sessions:SessionRow[];
  network:{currentIp:string|null;ipHistory:IpHistoryEntry[]}|null;
  counts:{events7d:number;prompts30d:number;projects:number};
  retention:RetentionSettings;
};

const ROLES=['student','teacher','superadmin'] as const;
const USER_SORTS={created:'u.created_at',name:'lower(u.name)',lastActive:'la.last_active_at'} as const;
const iso=(value:Date|string)=>new Date(value).toISOString();
function readableEmail(value:unknown) {
  try{return openText(String(value),'users.email');}catch{return '';}
}
function booleanParam(search:URLSearchParams,name:string) {
  const value=choiceParam(search,name,['true','false'] as const);
  return value===null?null:value==='true';
}

async function listUsers(search:URLSearchParams) {
  const where=new SqlWhere();
  const q=textParam(search,'q',160);
  if(q&&isUuid(q))where.add('u.id=?',q.toLowerCase());
  else if(q&&q.includes('@')){
    const [hash,email]=emailMatchParams(q.toLowerCase()),name=where.param(containsPattern(q)),hashParam=where.param(hash),emailParam=where.param(email);
    where.add(`(u.name ILIKE ${name} OR u.id IN (SELECT id FROM r.users WHERE ${EMAIL_MATCH.replace(/\$(\d)/g,(_,n)=>n==='1'?hashParam:emailParam)}))`);
  } else if(q)where.add('u.name ILIKE ?',containsPattern(q));
  const role=choiceParam(search,'role',ROLES);if(role)where.add('u.role=?',role);
  const status=choiceParam(search,'status',['online','offline'] as const);
  if(status)where.add(`${status==='offline'?'NOT ':''}EXISTS(SELECT 1 FROM r.tracked_sessions s WHERE s.user_id=u.id AND ${onlineSql()})`);
  const verified=booleanParam(search,'verified');if(verified!==null)where.add('u.verified=?',verified);
  const suspended=booleanParam(search,'suspended');if(suspended!==null)where.add('u.suspended=?',suspended);
  // Deleted accounts stay out of the directory by default; ?deleted=true is how the Deleted filter opts back in.
  const deleted=booleanParam(search,'deleted');
  where.add(deleted===true?'u.deleted_at IS NOT NULL':'u.deleted_at IS NULL');
  const sort=sortParam(search,USER_SORTS,'created'),request=pageRequest(search);
  const values=[...where.values,request.pageSize,request.offset];
  const [count,rows]=await Promise.all([
    cappedCount(`FROM r.users u ${where.sql}`,where.values),
    db.query(`SELECT u.id,u.name,u.email,u.role,u.verified,u.suspended,u.deleted_at,u.created_at,la.last_active_at,COALESCE(la.online,false) AS online,COALESCE(la.sessions,0) AS sessions,
        (SELECT count(*)::int FROM r.activity_events e WHERE e.user_id=u.id AND e.created_at>=now()-interval '7 days') AS events7d
      FROM r.users u
      LEFT JOIN LATERAL (SELECT max(s.last_seen_at) AS last_active_at,bool_or(${onlineSql()}) AS online,count(*)::int AS sessions FROM r.tracked_sessions s WHERE s.user_id=u.id) la ON true
      ${where.sql} ORDER BY ${sort.sql} NULLS LAST,u.id LIMIT $${values.length-1} OFFSET $${values.length}`,values),
  ]);
  const items:UserSummary[]=rows.map(row=>({
    id:row.id,name:cleanText(row.name,120),email:readableEmail(row.email),role:String(row.role),verified:!!row.verified,suspended:!!row.suspended,deleted:!!row.deleted_at,
    createdAt:iso(row.created_at),lastActiveAt:row.last_active_at?iso(row.last_active_at):null,status:row.online?'online':'offline',
    sessions:Number(row.sessions)||0,events7d:Number(row.events7d)||0,
  }));
  return paged(items,request,count);
}

async function userDetail(context:AdminContext,id:string):Promise<UserDetail> {
  requireCondition(isUuid(id),400,'The user ID is not valid.');
  const userId=id.toLowerCase(),showIp=hasPermission(context.user,'network');
  const [[row],sessionRows,[counts],retention]=await Promise.all([
    db.query('SELECT id,name,email,role,verified,suspended,ai_blocked,created_at,profile,deleted_at,deleted_reason FROM r.users WHERE id=$1',[userId]),
    db.query(`SELECT ${sessionSelect()} ${SESSION_FROM} WHERE s.user_id=$1 ORDER BY s.last_seen_at DESC,s.id LIMIT 20`,[userId]),
    db.query<{events7d:number;prompts30d:number;projects:number}>(`SELECT (SELECT count(*)::int FROM r.activity_events WHERE user_id=$1 AND created_at>=now()-interval '7 days') AS events7d,
      (SELECT count(*)::int FROM r.ai_requests WHERE user_id=$1 AND created_at>=now()-interval '30 days') AS prompts30d,
      (SELECT count(*)::int FROM r.projects WHERE owner_id=$1) AS projects`,[userId]),
    retentionSettings(),
  ]);
  requireCondition(row,404,'User not found.');
  const sessions=sessionRows.map(session=>sessionRow(session,showIp));
  let currentSession=sessions.find(session=>!session.endedAt)??null;
  if(!currentSession){
    const [open]=await db.query(`SELECT ${sessionSelect()} ${SESSION_FROM} WHERE s.user_id=$1 AND s.ended_at IS NULL ORDER BY s.last_seen_at DESC LIMIT 1`,[userId]);
    currentSession=open?sessionRow(open,showIp):null;
  }
  let network:UserDetail['network']=null;
  if(showIp){
    const history=await db.query(`SELECT ip,min(first_seen) AS first_seen,max(last_seen) AS last_seen,sum(sessions)::int AS sessions,sum(events)::int AS events FROM (
        SELECT ip_address AS ip,min(started_at) AS first_seen,max(last_seen_at) AS last_seen,count(*) AS sessions,0 AS events FROM r.tracked_sessions
          WHERE user_id=$1 AND ip_address<>'' AND last_seen_at>=now()-$2*interval '1 day' GROUP BY ip_address
        UNION ALL
        SELECT ip_address,min(created_at),max(created_at),0,count(*) FROM r.activity_events
          WHERE user_id=$1 AND ip_address<>'' AND created_at>=now()-$3*interval '1 day' GROUP BY ip_address
      ) seen GROUP BY ip ORDER BY max(last_seen) DESC LIMIT 50`,[userId,retention.sessionDays,Math.max(retention.activityDays,retention.securityDays)]);
    network={
      currentIp:currentSession?.ipAddress||sessions[0]?.ipAddress||null,
      ipHistory:history.map(entry=>({ip:cleanText(entry.ip,64),firstSeen:iso(entry.first_seen),lastSeen:iso(entry.last_seen),sessions:Number(entry.sessions)||0,events:Number(entry.events)||0})),
    };
  }
  let profile:Record<string,unknown>={};
  try{profile=openProfile(row.profile);}catch{}
  const latest=sessions[0];
  return {
    user:{id:row.id,name:cleanText(row.name,120),email:readableEmail(row.email),role:String(row.role),verified:!!row.verified,suspended:!!row.suspended,aiBlocked:!!row.ai_blocked,
      createdAt:iso(row.created_at),department:cleanText(profile.department,120),batch:cleanText(profile.batch,40),
      deleted:!!row.deleted_at,deletedAt:row.deleted_at?iso(row.deleted_at):null,deletedReason:cleanText(row.deleted_reason,500)},
    presence:{status:sessions.some(session=>session.status==='online')?'online':'offline',lastSeenAt:latest?.lastSeenAt??null},
    device:latest?{deviceType:latest.deviceType,os:latest.os,osVersion:latest.osVersion,browser:latest.browser,browserVersion:latest.browserVersion,platform:latest.platform,userAgent:latest.userAgent,
      screenWidth:latest.screenWidth,screenHeight:latest.screenHeight,pixelRatio:latest.pixelRatio,touch:latest.touch,language:latest.language,timezone:latest.timezone}:null,
    currentSession,sessions,network,
    counts:{events7d:counts.events7d,prompts30d:counts.prompts30d,projects:counts.projects},retention,
  };
}

export async function usersRoute(context:AdminContext):Promise<Response> {
  const {user,search,method,path}=context;
  requirePermission(user,'users');
  const sub=path.slice(1);
  if(method!=='GET'||sub.length>1)throw new HttpError(404,'Endpoint not found.');
  if(sub.length===1)return json(await userDetail(context,sub[0]));
  return json(await listUsers(search));
}
