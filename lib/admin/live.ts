import { db } from '../db';
import { HttpError } from '../errors';
import { json } from '../http';
import { presenceTimeoutSeconds } from '../tracking/config';
import { hasPermission, requirePermission } from './permissions';
import { choiceParam, containsPattern, SqlWhere, textParam } from './query';
import { onlineSql, sessionRow, sessionSelect, SESSION_FROM } from './session-rows';
import { DEVICE_TYPES, VISITOR_KINDS, type LiveSnapshot } from './types';
import type { AdminContext } from './router';

// GET /api/admin/live (LiveSnapshot), polled every 10 seconds by Admin › Live monitoring. Both queries stay on the
// last_seen_at index: open sessions seen in the last 30 minutes, online ones first. Counts ignore the page filters.
const LIVE_LIMIT=300;

export async function liveRoute(context:AdminContext):Promise<Response> {
  const {user,search,method,path}=context;
  requirePermission(user,'live');
  if(method!=='GET'||path.length>1)throw new HttpError(404,'Endpoint not found.');
  const where=new SqlWhere();
  const visitor=choiceParam(search,'visitor',VISITOR_KINDS);if(visitor)where.add('s.kind=?',visitor);
  const device=choiceParam(search,'device',DEVICE_TYPES);if(device)where.add('s.device_type=?',device);
  const q=textParam(search,'q',120);if(q)where.add('u.name ILIKE ?',containsPattern(q));
  const [rows,[counts]]=await Promise.all([
    db.query(`SELECT ${sessionSelect()} ${SESSION_FROM} WHERE s.ended_at IS NULL AND s.last_seen_at>=now()-interval '30 minutes'${where.andSql}
      ORDER BY ${onlineSql()} DESC,s.last_seen_at DESC,s.id LIMIT ${LIVE_LIMIT}`,where.values),
    db.query<{authenticated:number;anonymous:number;active:number}>(`SELECT (count(DISTINCT s.user_id) FILTER (WHERE s.kind='authenticated'))::int AS authenticated,
      (count(DISTINCT COALESCE(s.visitor_id,s.id)) FILTER (WHERE s.kind='anonymous'))::int AS anonymous,count(*)::int AS active
      FROM r.tracked_sessions s WHERE ${onlineSql()}`),
  ]);
  const showIp=hasPermission(user,'network');
  const snapshot:LiveSnapshot={
    generatedAt:new Date().toISOString(),onlineWindowSeconds:presenceTimeoutSeconds(),
    counts:{online:counts.authenticated+counts.anonymous,authenticated:counts.authenticated,anonymous:counts.anonymous,activeSessions:counts.active},
    sessions:rows.map(row=>sessionRow(row,showIp)),
  };
  return json(snapshot);
}
