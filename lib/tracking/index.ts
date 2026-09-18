import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, transaction } from '../db';
import { SESSION_COOKIE, currentUser, hashToken, newToken } from '../auth';
import { readBody } from '../http';
import { cleanPath, cleanText } from '../safe-text';
import { clientIp as ipFromRequest } from './ip';
import { deviceFromHeaders } from './device';
import { retentionSettings } from './config';
import { EVENT_TYPES, type EventType } from '../admin/types';

// The write side of tracking: everything lib/admin and components/platform/admin read (r.visitors,
// r.tracked_sessions, r.activity_events, r.api_usage, r.error_log) is produced here. Never throws in a way that
// could break the request it is attached to — every exported function swallows its own errors and logs only the
// error's name, never a stack, body or secret value.

export type TrackEvent={type:EventType;request?:NextRequest|null;userId?:string|null;sessionId?:string|null;visitorId?:string|null;projectId?:string|null;promptId?:string|null;status?:'success'|'failure';page?:string;metadata?:Record<string,string|number|boolean|null>};
export type SessionEndReason='logout'|'expired'|'revoked'|'password_reset'|'inactive'|'signed_in';
export type PruneResult={events:number;sessions:number;visitors:number;apiUsage:number;errors:number};

const logFailure=(label:string,error:unknown)=>console.error(`${label} failed:`,error instanceof Error?error.name:'Unknown error');

/** The client address according to TRUSTED_PROXY_HOPS, or '' when it cannot be determined. Delegates to lib/tracking/ip.ts. */
export const clientIp=ipFromRequest;

/** Records one activity event. Never throws, so tracking cannot break the action it records. Resolves to the event id, or null when nothing was stored. */
export async function recordEvent(event:TrackEvent):Promise<string|null> {
  try {
    const definition=EVENT_TYPES[event.type];
    if(!definition)return null;
    const device=event.request?deviceFromHeaders(event.request.headers):null;
    const id=randomUUID();
    await db.query(
      `INSERT INTO r.activity_events(id,event_type,category,status,user_id,session_id,visitor_id,project_id,prompt_id,page,ip_address,device_type,os,browser,user_agent,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
      [id,event.type,definition.category,event.status??'success',event.userId??null,event.sessionId??null,event.visitorId??null,event.projectId??null,event.promptId??null,
        cleanPath(event.page||'')||'',event.request?ipFromRequest(event.request):'',device?.deviceType??'unknown',device?.os??'',device?.browser??'',device?.userAgent??'',
        JSON.stringify(event.metadata??{})],
    );
    return id;
  } catch(error) {
    logFailure('recordEvent',error);
    return null;
  }
}

/** Starts (or reuses) the tracked session for a sign-in that has created — or already owns — the auth session with hash `sessionHash`. */
export async function startTrackedSession(request:NextRequest,userId:string,sessionHash:string):Promise<string|null> {
  try {
    const [existing]=await db.query<{tracked_session_id:string|null}>('SELECT tracked_session_id FROM r.sessions WHERE hash=$1',[sessionHash]);
    if(existing?.tracked_session_id) {
      const [open]=await db.query<{id:string}>('SELECT id FROM r.tracked_sessions WHERE id=$1 AND ended_at IS NULL',[existing.tracked_session_id]);
      if(open)return open.id;
    }
    const device=deviceFromHeaders(request.headers);
    const id=randomUUID();
    await transaction(async client=>{
      await client.query(
        `INSERT INTO r.tracked_sessions(id,kind,user_id,ip_address,device_type,os,os_version,browser,browser_version,user_agent)
         VALUES($1,'authenticated',$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id,userId,ipFromRequest(request),device.deviceType,device.os,device.osVersion,device.browser,device.browserVersion,device.userAgent],
      );
      await client.query('UPDATE r.sessions SET tracked_session_id=$1 WHERE hash=$2',[id,sessionHash]);
    });
    return id;
  } catch(error) {
    logFailure('startTrackedSession',error);
    return null;
  }
}

/** Ends open tracked sessions: one by id, the one behind an auth session hash, or all of a user's. Never touches r.sessions. */
export async function endTrackedSessions(target:{sessionId?:string;sessionHash?:string;userId?:string},reason:SessionEndReason):Promise<void> {
  try {
    if(target.sessionId) {
      await db.query("UPDATE r.tracked_sessions SET ended_at=now(),end_reason=$2 WHERE id=$1 AND ended_at IS NULL",[target.sessionId,reason]);
    } else if(target.sessionHash) {
      await db.query(
        `UPDATE r.tracked_sessions SET ended_at=now(),end_reason=$2
         WHERE id=(SELECT tracked_session_id FROM r.sessions WHERE hash=$1) AND ended_at IS NULL`,
        [target.sessionHash,reason],
      );
    } else if(target.userId) {
      await db.query("UPDATE r.tracked_sessions SET ended_at=now(),end_reason=$2 WHERE user_id=$1 AND ended_at IS NULL",[target.userId,reason]);
    }
  } catch(error) {
    logFailure('endTrackedSessions',error);
  }
}

/** Counts one API response for System health. Synchronous and cheap; written in the background. */
export function recordApiRequest(_resource:string|undefined,status:number):void {
  const clientError=status>=400&&status<500?1:0,serverError=status>=500?1:0;
  db.query(
    `INSERT INTO r.api_usage(bucket,requests,client_errors,server_errors) VALUES(date_trunc('minute',now()),1,$1,$2)
     ON CONFLICT(bucket) DO UPDATE SET requests=r.api_usage.requests+1,client_errors=r.api_usage.client_errors+EXCLUDED.client_errors,server_errors=r.api_usage.server_errors+EXCLUDED.server_errors`,
    [clientError,serverError],
  ).catch(error=>logFailure('recordApiRequest',error));
}

/** Keeps a 5xx failure for System health: method, path, status and error name, never the request body. */
export function recordServerError(request:NextRequest,error:unknown,status:number):void {
  const name=cleanText(error instanceof Error?error.name:'Error',60)||'Error';
  const message=cleanText(error instanceof Error?error.message:String(error),500);
  const path=cleanText(new URL(request.url).pathname,300);
  db.query(
    'INSERT INTO r.error_log(id,method,path,status,name,message) VALUES($1,$2,$3,$4,$5,$6)',
    [randomUUID(),cleanText(request.method,10),path,status,name,message],
  ).catch(err=>logFailure('recordServerError',err));
}

// ----- POST /api/activity -----
const VISITOR_COOKIE='repoggits_visitor';
const MAX_ACTIVITY_BODY=4096;
const PROJECT_ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const activityBodySchema=z.object({
  kind:z.enum(['pageview','heartbeat']),
  page:z.string().max(300).optional(),
  projectId:z.string().max(64).optional(),
  screen:z.object({width:z.number().finite().min(0).max(20000).optional(),height:z.number().finite().min(0).max(20000).optional()}).optional(),
  pixelRatio:z.number().finite().min(0).max(10).optional(),
  touch:z.boolean().optional(),
  language:z.string().max(40).optional(),
  timezone:z.string().max(64).optional(),
  networkOnline:z.boolean().optional(),
  referrer:z.string().max(500).optional(),
});
const isHex64=(value:string)=>/^[a-f0-9]{64}$/.test(value);

/** POST /api/activity: page views and heartbeats sent by components/platform/ActivityTracker.tsx. Anonymous-friendly,
 * defensively parsed, and always fast — this endpoint is hit by every open tab every 45 seconds. */
export async function activityRoute(request:NextRequest):Promise<Response> {
  try {
    let raw:Buffer;
    try{raw=await readBody(request,MAX_ACTIVITY_BODY);}catch{return new NextResponse(null,{status:204});}
    let json:unknown;
    try{json=JSON.parse(raw.toString('utf8')||'{}');}catch{return new NextResponse(null,{status:204});}
    const parsed=activityBodySchema.safeParse(json);
    if(!parsed.success)return new NextResponse(null,{status:204});
    const input=parsed.data;

    const device=deviceFromHeaders(request.headers,{touchPoints:input.touch?5:0,screenWidth:input.screen?.width??null,screenHeight:input.screen?.height??null});
    const ip=ipFromRequest(request);
    const page=cleanPath(input.page||'')||'';
    const projectId=input.projectId&&PROJECT_ID_RE.test(input.projectId)?input.projectId.toLowerCase():null;
    const language=cleanText(input.language,40),timezone=cleanText(input.timezone,64);
    const referrer=input.referrer?cleanText(input.referrer,300):'';
    const networkOnline=typeof input.networkOnline==='boolean'?input.networkOnline:null;
    const touch=typeof input.touch==='boolean'?input.touch:null;
    const width=input.screen?.width??null,height=input.screen?.height??null;
    const pixelRatio=typeof input.pixelRatio==='number'?input.pixelRatio:null;

    const token=request.cookies.get(SESSION_COOKIE)?.value;
    const user=token&&token.length<=128?await currentUser(request):null;

    let sessionId:string|null=null;
    let visitorId:string|null=null;
    let setVisitorCookie:string|null=null;

    if(user) {
      sessionId=await startTrackedSession(request,user.id,hashToken(token!));
    } else {
      const cookieToken=request.cookies.get(VISITOR_COOKIE)?.value||'';
      if(isHex64(cookieToken)) {
        const [row]=await db.query<{id:string}>('SELECT id FROM r.visitors WHERE token_hash=$1',[hashToken(cookieToken)]);
        visitorId=row?.id??null;
      }
      if(visitorId) {
        await db.query('UPDATE r.visitors SET last_seen_at=now() WHERE id=$1',[visitorId]);
      } else {
        const newVisitorToken=newToken();
        visitorId=randomUUID();
        await db.query('INSERT INTO r.visitors(id,token_hash) VALUES($1,$2) ON CONFLICT(token_hash) DO NOTHING',[visitorId,hashToken(newVisitorToken)]);
        setVisitorCookie=newVisitorToken;
      }
      const [openSession]=await db.query<{id:string}>('SELECT id FROM r.tracked_sessions WHERE visitor_id=$1 AND ended_at IS NULL ORDER BY last_seen_at DESC LIMIT 1',[visitorId]);
      if(openSession) {
        sessionId=openSession.id;
      } else {
        sessionId=randomUUID();
        await db.query(
          `INSERT INTO r.tracked_sessions(id,kind,visitor_id,ip_address,device_type,os,os_version,browser,browser_version,user_agent,referrer)
           VALUES($1,'anonymous',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [sessionId,visitorId,ip,device.deviceType,device.os,device.osVersion,device.browser,device.browserVersion,device.userAgent,referrer],
        );
      }
    }

    if(sessionId) {
      await db.query(
        `UPDATE r.tracked_sessions SET last_seen_at=now(),ip_address=$2,device_type=$3,os=$4,os_version=$5,browser=$6,browser_version=$7,user_agent=$8,
           screen_width=$9,screen_height=$10,pixel_ratio=$11,touch=$12,language=$13,timezone=$14,network_online=$15,current_path=$16,
           current_project_id=(SELECT id FROM r.projects WHERE id=$17::uuid),
           referrer=CASE WHEN $18<>'' THEN $18 ELSE referrer END
         WHERE id=$1`,
        [sessionId,ip,device.deviceType,device.os,device.osVersion,device.browser,device.browserVersion,device.userAgent,
          width,height,pixelRatio,touch,language,timezone,networkOnline,page,projectId,referrer],
      );
      if(input.kind==='pageview')await recordEvent({type:'PAGE_VIEW',request,userId:user?.id??null,sessionId,visitorId,page,projectId,metadata:{}});
    }

    const response=new NextResponse(null,{status:204});
    if(setVisitorCookie)response.cookies.set(VISITOR_COOKIE,setVisitorCookie,{httpOnly:true,sameSite:'lax',secure:process.env.APP_ORIGIN?.startsWith('https:')||false,path:'/',maxAge:400*86400});
    return response;
  } catch(error) {
    logFailure('activityRoute',error);
    return new NextResponse(null,{status:204});
  }
}

/** Deletes tracked data older than the retention settings and unlinked anonymous visitors. Called from Admin › System health. */
export async function pruneTrackingData():Promise<PruneResult> {
  try {
    const retention=await retentionSettings();
    const [events,sessions,visitors,apiUsage,errors]=await Promise.all([
      db.query("DELETE FROM r.activity_events WHERE created_at<now()-$1*interval '1 day' RETURNING id",[retention.activityDays]),
      db.query("DELETE FROM r.tracked_sessions WHERE COALESCE(ended_at,last_seen_at)<now()-$1*interval '1 day' RETURNING id",[retention.sessionDays]),
      db.query("DELETE FROM r.visitors WHERE user_id IS NULL AND last_seen_at<now()-$1*interval '1 day' RETURNING id",[retention.sessionDays]),
      db.query("DELETE FROM r.api_usage WHERE bucket<now()-$1*interval '1 day' RETURNING bucket",[retention.securityDays]),
      db.query("DELETE FROM r.error_log WHERE created_at<now()-$1*interval '1 day' RETURNING id",[retention.securityDays]),
    ]);
    return {events:events.length,sessions:sessions.length,visitors:visitors.length,apiUsage:apiUsage.length,errors:errors.length};
  } catch(error) {
    logFailure('pruneTrackingData',error);
    return {events:0,sessions:0,visitors:0,apiUsage:0,errors:0};
  }
}
