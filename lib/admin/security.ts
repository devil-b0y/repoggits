import type { QueryResultRow } from 'pg';
import { HttpError } from '../errors';
import { json } from '../http';
import { cleanText } from '../safe-text';
import { requirePermission } from './permissions';
import { choiceParam, containsPattern, intParam, SqlWhere, textParam, type ExportColumn } from './query';
import { activityColumns, activityQuery, activityRow, dateFilter, exportLog, orderFor, pagedResponse, showIpTo, type LogQuery } from './activity-query';
import type { AdminContext } from './router';

// GET /api/admin/security and /api/admin/security/export. ?source=events (default) is the activity log limited to
// security events; ?source=errors is the server error log behind 5xx responses.

export type ServerErrorRow={id:string;createdAt:string;method:string;path:string;status:number;name:string;message:string};
const ERROR_SORTS={time:'x.created_at',status:'x.status'} as const;

async function errorQuery(search:URLSearchParams):Promise<LogQuery> {
  const where=new SqlWhere();
  const q=textParam(search,'q',120);
  if(q){const pattern=where.param(containsPattern(q));where.add(`(x.path ILIKE ${pattern} OR x.name ILIKE ${pattern})`);}
  if(search.get('status'))where.add('x.status=?',intParam(search,'status',0,100,599));
  await dateFilter(search,where,'x.created_at');
  const {order,timeDesc}=orderFor(search,ERROR_SORTS,'x','time');
  return {select:'x.id,x.created_at,x.method,x.path,x.status,x.name,x.message',from:'FROM r.error_log x',countFrom:'FROM r.error_log x',where,order,timeDesc,alias:'x',table:'r.error_log'};
}
const errorRow=(row:QueryResultRow):ServerErrorRow=>({id:row.id,createdAt:new Date(row.created_at).toISOString(),method:cleanText(row.method,10),path:cleanText(row.path,300),status:Number(row.status),name:cleanText(row.name,80),message:cleanText(row.message,500)});
const errorColumns:ExportColumn<ServerErrorRow>[]=[
  {key:'time',label:'Time',value:row=>row.createdAt},
  {key:'errorId',label:'Error ID',value:row=>row.id},
  {key:'method',label:'Method',value:row=>row.method},
  {key:'path',label:'Path',value:row=>row.path},
  {key:'status',label:'Status',value:row=>row.status},
  {key:'name',label:'Error',value:row=>row.name},
  {key:'message',label:'Message',value:row=>row.message},
];

export async function securityRoute(context:AdminContext):Promise<Response> {
  const {user,search,method,path}=context;
  requirePermission(user,'security');
  const sub=path.slice(1);
  if(method!=='GET'||sub.length>1||sub.length===1&&sub[0]!=='export')throw new HttpError(404,'Endpoint not found.');
  const exporting=sub[0]==='export';
  if((choiceParam(search,'source',['events','errors'] as const)??'events')==='errors'){
    const query=await errorQuery(search);
    return exporting?exportLog(context,'server-errors',query,errorRow,errorColumns):json(await pagedResponse(search,query,errorRow));
  }
  const showIp=showIpTo(context),query=await activityQuery(context,'security');
  return exporting?exportLog(context,'security',query,row=>activityRow(row,showIp),activityColumns(showIp)):json(await pagedResponse(search,query,row=>activityRow(row,showIp)));
}
