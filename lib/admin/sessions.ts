import { db, transaction } from '../db';
import { audit } from '../auth';
import { HttpError, requireCondition } from '../errors';
import { json } from '../http';
import { recordEvent } from '../tracking';
import { hasPermission, requirePermission } from './permissions';
import { cappedCount, choiceParam, containsPattern, isUuid, pageRequest, paged, sortParam, SqlWhere, textParam, uuidParam } from './query';
import { dateFilter, deviceFilters, ipFilter } from './activity-query';
import { durationSql, onlineSql, sessionRow, sessionSelect, SESSION_FROM } from './session-rows';
import { SESSION_STATUSES, VISITOR_KINDS } from './types';
import type { AdminContext } from './router';

// GET /api/admin/sessions (Paged<SessionRow>) and POST /api/admin/sessions/:id/revoke for Admin › Sessions.
// Ending a session deletes the auth cookie sessions behind it, so that browser is signed out on its next request.

const SESSION_SORTS={started:'s.started_at',lastSeen:'s.last_seen_at',duration:durationSql()} as const;

async function listSessions(context:AdminContext) {
  const {search}=context,where=new SqlWhere();
  const status=choiceParam(search,'status',SESSION_STATUSES);
  if(status==='ended')where.add('s.ended_at IS NOT NULL');
  else if(status==='online')where.add(onlineSql());
  else if(status==='offline')where.add(`s.ended_at IS NULL AND NOT ${onlineSql()}`);
  const visitor=choiceParam(search,'visitor',VISITOR_KINDS);if(visitor)where.add('s.kind=?',visitor);
  const user=uuidParam(search,'user');if(user)where.add('s.user_id=?',user);
  const session=uuidParam(search,'session');if(session)where.add('s.id=?',session);
  const q=textParam(search,'q',120);
  if(q&&isUuid(q)){const id=where.param(q.toLowerCase());where.add(`(s.id=${id}::uuid OR s.user_id=${id}::uuid OR s.visitor_id=${id}::uuid)`);}
  else if(q)where.add('s.user_id IN (SELECT id FROM r.users WHERE name ILIKE ?)',containsPattern(q));
  deviceFilters(search,where,'s');
  ipFilter(context,where,'s');
  await dateFilter(search,where,'s.started_at');
  const sort=sortParam(search,SESSION_SORTS,'started'),request=pageRequest(search);
  const values=[...where.values,request.pageSize,request.offset],showIp=hasPermission(context.user,'network');
  const [count,rows]=await Promise.all([
    cappedCount(`FROM r.tracked_sessions s ${where.sql}`,where.values),
    db.query(`SELECT ${sessionSelect()} ${SESSION_FROM} ${where.sql} ORDER BY ${sort.sql} NULLS LAST,s.id DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values),
  ]);
  return paged(rows.map(row=>sessionRow(row,showIp)),request,count);
}

async function revokeSession(context:AdminContext,id:string) {
  requireCondition(isUuid(id),404,'Session not found.');
  const sessionId=id.toLowerCase(),admin=context.user;
  const target=await transaction(async client=>{
    const [row]=await client.query<{user_id:string|null;ended_at:Date|null}>('SELECT user_id,ended_at FROM r.tracked_sessions WHERE id=$1 FOR UPDATE',[sessionId]);
    requireCondition(row,404,'Session not found.');
    requireCondition(!row.ended_at,409,'This session has already ended.');
    const signedOut=await client.query('DELETE FROM r.sessions WHERE tracked_session_id=$1 RETURNING user_id',[sessionId]);
    await client.query("UPDATE r.tracked_sessions SET ended_at=now(),end_reason='revoked' WHERE id=$1",[sessionId]);
    await audit(client,admin.id,'session.revoked',sessionId,{userId:row.user_id});
    return {userId:row.user_id,signedOut:signedOut.length};
  });
  await recordEvent({type:'SESSION_REVOKED',request:context.request,userId:target.userId,metadata:{sessionId,by:admin.id}});
  return json({ok:true,id:sessionId,userId:target.userId,signedOut:target.signedOut});
}

export async function sessionsRoute(context:AdminContext):Promise<Response> {
  const {user,method,path}=context;
  requirePermission(user,'sessions');
  const sub=path.slice(1);
  if(method==='GET'&&sub.length===0)return json(await listSessions(context));
  if(method==='POST'&&sub.length===2&&sub[1]==='revoke')return revokeSession(context,sub[0]);
  throw new HttpError(404,'Endpoint not found.');
}
