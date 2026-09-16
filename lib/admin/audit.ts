import type { QueryResultRow } from 'pg';
import { db } from '../db';
import { HttpError, requireCondition } from '../errors';
import { json } from '../http';
import { cleanText } from '../safe-text';
import { requirePermission } from './permissions';
import { containsPattern, SqlWhere, textParam, uuidParam, type ExportColumn } from './query';
import type { AuditRow } from './types';
import { dateFilter, exportLog, orderFor, pagedResponse, safeDetails, type LogQuery } from './activity-query';
import type { AdminContext } from './router';

// GET /api/admin/audit (Paged<AuditRow> plus the distinct action names for the Action filter) and /api/admin/audit/export.
// Details keep their key/value shape, minus anything named like a password, token, secret or key.

const AUDIT_SORTS={time:'a.created_at',action:'a.action'} as const;
const ACTION=/^[A-Za-z0-9_.:-]{1,80}$/;

async function auditQuery(search:URLSearchParams):Promise<LogQuery> {
  const where=new SqlWhere();
  const q=textParam(search,'q',200);
  if(q){
    const pattern=where.param(containsPattern(q)),exact=where.param(q);
    where.add(`(a.action ILIKE ${pattern} OR a.target_id=${exact} OR a.actor_id IN (SELECT id FROM r.users WHERE name ILIKE ${pattern}))`);
  }
  const actor=uuidParam(search,'actor');if(actor)where.add('a.actor_id=?',actor);
  const action=search.get('action');
  if(action){requireCondition(ACTION.test(action),400,'Unknown action filter.');where.add('a.action=?',action);}
  await dateFilter(search,where,'a.created_at');
  const {order,timeDesc}=orderFor(search,AUDIT_SORTS,'a','time');
  return {select:'a.id,a.created_at,a.actor_id,u.name AS actor_name,u.role AS actor_role,a.action,a.target_id,a.details',from:'FROM r.audit a LEFT JOIN r.users u ON u.id=a.actor_id',countFrom:'FROM r.audit a',where,order,timeDesc,alias:'a',table:'r.audit'};
}
const auditRow=(row:QueryResultRow):AuditRow=>({
  id:row.id,createdAt:new Date(row.created_at).toISOString(),
  actor:row.actor_id&&row.actor_name!=null?{id:row.actor_id,name:cleanText(row.actor_name,120),role:String(row.actor_role)}:null,
  action:cleanText(row.action,80),targetId:cleanText(row.target_id,200),details:safeDetails(row.details),
});
const auditColumns:ExportColumn<AuditRow>[]=[
  {key:'time',label:'Time',value:row=>row.createdAt},
  {key:'auditId',label:'Audit ID',value:row=>row.id},
  {key:'actor',label:'Actor',value:row=>row.actor?.name??'System'},
  {key:'actorId',label:'Actor ID',value:row=>row.actor?.id??''},
  {key:'action',label:'Action',value:row=>row.action},
  {key:'target',label:'Target',value:row=>row.targetId},
  {key:'details',label:'Details',value:row=>row.details},
];

export async function auditRoute(context:AdminContext):Promise<Response> {
  const {user,search,method,path}=context;
  requirePermission(user,'audit');
  const sub=path.slice(1);
  if(method!=='GET'||sub.length>1||sub.length===1&&sub[0]!=='export')throw new HttpError(404,'Endpoint not found.');
  const query=await auditQuery(search);
  if(sub[0]==='export')return exportLog(context,'audit',query,auditRow,auditColumns);
  const [page,actions]=await Promise.all([pagedResponse(search,query,auditRow),db.query<{action:string}>('SELECT DISTINCT action FROM r.audit ORDER BY action LIMIT 500')]);
  return json({...page,actions:actions.map(row=>row.action)});
}
