import type { QueryResultRow } from 'pg';
import { cleanText } from '../safe-text';
import { presenceTimeoutSeconds } from '../tracking/config';
import { deviceTypeOf, TITLE_JOIN } from './activity-query';
import type { SessionRow, SessionStatus } from './types';

// The tracked-session row shared by live monitoring, the user directory and the sessions list: one SELECT, one mapping,
// one definition of online. The presence window is a validated integer from the environment, never request input.

/** SQL true while a tracked session (alias s) is open and seen within the presence window. */
export const onlineSql=(alias='s')=>`(${alias}.ended_at IS NULL AND ${alias}.last_seen_at>=now()-${presenceTimeoutSeconds()}*interval '1 second')`;
export const sessionStatusSql=(alias='s')=>`CASE WHEN ${alias}.ended_at IS NOT NULL THEN 'ended' WHEN ${onlineSql(alias)} THEN 'online' ELSE 'offline' END`;
export const durationSql=(alias='s')=>`(COALESCE(${alias}.ended_at,${alias}.last_seen_at)-${alias}.started_at)`;
export const sessionSelect=()=>`s.id,s.kind,s.user_id,s.visitor_id,s.started_at,s.last_seen_at,s.ended_at,s.end_reason,s.ip_address,s.device_type,s.os,s.os_version,s.browser,s.browser_version,s.user_agent,s.platform,s.screen_width,s.screen_height,s.pixel_ratio,s.touch,s.language,s.timezone,s.network_online,s.referrer,s.current_path,s.current_project_id,u.name AS user_name,u.role AS user_role,pv.title AS project_title,${sessionStatusSql()} AS status,(EXTRACT(EPOCH FROM ${durationSql()})*1000)::bigint AS duration_ms`;
export const SESSION_FROM=`FROM r.tracked_sessions s LEFT JOIN r.users u ON u.id=s.user_id ${TITLE_JOIN('s.current_project_id')}`;

const iso=(value:Date|string)=>new Date(value).toISOString();
const numberOrNull=(value:unknown)=>value===null||value===undefined?null:Number.isFinite(Number(value))?Number(value):null;
const STATUSES:readonly SessionStatus[]=['online','offline','ended'];

export function sessionRow(row:QueryResultRow,showIp:boolean):SessionRow {
  return {
    id:row.id,kind:row.kind==='anonymous'?'anonymous':'authenticated',
    user:row.user_id&&row.user_name!=null?{id:row.user_id,name:cleanText(row.user_name,120),role:String(row.user_role)}:null,
    visitorId:row.visitor_id??null,status:STATUSES.includes(row.status)?row.status:'offline',
    startedAt:iso(row.started_at),lastSeenAt:iso(row.last_seen_at),endedAt:row.ended_at?iso(row.ended_at):null,endReason:cleanText(row.end_reason,20),
    durationMs:Math.max(0,Number(row.duration_ms)||0),ipAddress:showIp?cleanText(row.ip_address,64):null,deviceType:deviceTypeOf(row.device_type),
    os:cleanText(row.os,40),osVersion:cleanText(row.os_version,40),browser:cleanText(row.browser,40),browserVersion:cleanText(row.browser_version,40),
    userAgent:cleanText(row.user_agent,500),platform:cleanText(row.platform,60),screenWidth:numberOrNull(row.screen_width),screenHeight:numberOrNull(row.screen_height),
    pixelRatio:numberOrNull(row.pixel_ratio),touch:typeof row.touch==='boolean'?row.touch:null,language:cleanText(row.language,40),timezone:cleanText(row.timezone,64),
    networkOnline:typeof row.network_online==='boolean'?row.network_online:null,referrer:cleanText(row.referrer,300),currentPath:cleanText(row.current_path,300),
    currentProject:row.current_project_id?{id:row.current_project_id,title:cleanText(row.project_title,160)||'Untitled project'}:null,
  };
}
