import type { QueryResultRow } from 'pg';
import { db } from '../db';
import { audit } from '../auth';
import { HttpError, requireCondition } from '../errors';
import { json } from '../http';
import { openText } from '../encryption';
import { cleanText } from '../safe-text';
import { recordEvent } from '../tracking';
import { requirePermission } from './permissions';
import { choiceParam, containsPattern, isUuid, SqlWhere, textParam, uuidParam, type ExportColumn } from './query';
import { AI_FEATURES, DEVICE_TYPES, PROMPT_OUTCOMES, type PromptOutcome, type PromptRow } from './types';
import { dateFilter, deviceFilters, deviceTypeOf, exportLog, ipFilter, orderFor, pagedResponse, projectFilter, showIpTo, titleMatch, TITLE_JOIN, type LogQuery } from './activity-query';
import type { AdminContext } from './router';

// GET /api/admin/prompts (Paged<PromptRow>), /api/admin/prompts/export and /api/admin/prompts/:id.
// Lists and exports never read the encrypted prompt column; only the single-prompt view decrypts it, for viewers with
// prompt_content, and every such view is audited. Prompt text cannot be searched because it is stored encrypted.

const PROMPT_SELECT='a.id,a.created_at,a.user_id,u.name AS user_name,u.role AS user_role,a.feature,a.project_id,pv.title AS project_title,a.outcome,a.reason,a.duration_ms,a.model,a.prompt_chars,a.prompt_tokens,a.response_tokens,a.total_tokens,a.session_id,a.device_type,a.os,a.browser,a.ip_address';
const PROMPT_FROM=`FROM r.ai_requests a JOIN r.users u ON u.id=a.user_id ${TITLE_JOIN('a.project_id')}`;
const PROMPT_SORTS={time:'a.created_at',duration:'a.duration_ms',user:'u.name'} as const;

async function promptQuery(context:AdminContext):Promise<LogQuery> {
  const {search}=context,where=new SqlWhere();
  if(search.get('ip'))requirePermission(context.user,'network');
  const q=textParam(search,'q',120);
  if(q&&isUuid(q)){
    const id=where.param(q.toLowerCase());
    where.add(`(a.id=${id}::uuid OR a.user_id=${id}::uuid OR a.session_id=${id}::uuid OR a.project_id=${id}::uuid)`);
  } else if(q){
    const pattern=where.param(containsPattern(q));
    where.add(`(a.user_id IN (SELECT id FROM r.users WHERE name ILIKE ${pattern}) OR a.project_id IN (${titleMatch(pattern)}))`);
  }
  const user=uuidParam(search,'user');if(user)where.add('a.user_id=?',user);
  const feature=choiceParam(search,'feature',AI_FEATURES);if(feature)where.add('a.feature=?',feature);
  projectFilter(search,where,'a.project_id');
  const model=search.get('model');
  if(model){requireCondition(model.length<=80,400,'The model filter is too long.');where.add('a.model=?',model);}
  const status=choiceParam(search,'status',PROMPT_OUTCOMES);if(status)where.add('a.outcome=?',status);
  deviceFilters(search,where,'a');
  ipFilter(context,where,'a');
  const session=uuidParam(search,'session');if(session)where.add('a.session_id=?',session);
  await dateFilter(search,where,'a.created_at');
  const {order,timeDesc}=orderFor(search,PROMPT_SORTS,'a','time');
  return {select:PROMPT_SELECT,from:PROMPT_FROM,countFrom:'FROM r.ai_requests a',where,order,timeDesc,alias:'a',table:'r.ai_requests'};
}

const count=(value:unknown)=>typeof value==='number'?value:null;
function promptRow(row:QueryResultRow,showIp:boolean):PromptRow {
  return {
    id:row.id,createdAt:new Date(row.created_at).toISOString(),user:{id:row.user_id,name:cleanText(row.user_name,120),role:String(row.user_role)},
    feature:cleanText(row.feature,40),project:row.project_id?{id:row.project_id,title:cleanText(row.project_title,160)||'Untitled project'}:null,
    outcome:(Object.hasOwn(PROMPT_OUTCOMES,row.outcome)?row.outcome:'pending') as PromptOutcome,reason:cleanText(row.reason,300),
    durationMs:count(row.duration_ms),model:cleanText(row.model,80),promptChars:Number(row.prompt_chars)||0,
    promptTokens:count(row.prompt_tokens),responseTokens:count(row.response_tokens),totalTokens:count(row.total_tokens),
    sessionId:row.session_id??null,deviceType:deviceTypeOf(row.device_type),os:cleanText(row.os,40),browser:cleanText(row.browser,40),
    ipAddress:showIp?cleanText(row.ip_address,64):null,
  };
}
function promptColumns(showIp:boolean):ExportColumn<PromptRow>[] {
  return [
    {key:'time',label:'Time',value:row=>row.createdAt},
    {key:'promptId',label:'Prompt ID',value:row=>row.id},
    {key:'user',label:'User',value:row=>row.user.name},
    {key:'userId',label:'User ID',value:row=>row.user.id},
    {key:'feature',label:'Feature',value:row=>(AI_FEATURES as Record<string,string>)[row.feature]??row.feature},
    {key:'project',label:'Project',value:row=>row.project?.title??''},
    {key:'projectId',label:'Project ID',value:row=>row.project?.id??''},
    {key:'status',label:'Status',value:row=>PROMPT_OUTCOMES[row.outcome]},
    {key:'reason',label:'Reason',value:row=>row.reason},
    {key:'durationMs',label:'Response time (ms)',value:row=>row.durationMs},
    {key:'model',label:'Model',value:row=>row.model},
    {key:'promptChars',label:'Prompt characters',value:row=>row.promptChars},
    {key:'promptTokens',label:'Prompt tokens',value:row=>row.promptTokens},
    {key:'responseTokens',label:'Response tokens',value:row=>row.responseTokens},
    {key:'totalTokens',label:'Total tokens',value:row=>row.totalTokens},
    {key:'sessionId',label:'Session ID',value:row=>row.sessionId??''},
    {key:'device',label:'Device',value:row=>DEVICE_TYPES[row.deviceType]},
    {key:'os',label:'OS',value:row=>row.os},
    {key:'browser',label:'Browser',value:row=>row.browser},
    ...(showIp?[{key:'ip',label:'IP',value:(row:PromptRow)=>row.ipAddress??''}]:[]),
  ];
}

export async function promptsRoute(context:AdminContext):Promise<Response> {
  const {user,search,method,path,request}=context;
  requirePermission(user,'prompts');
  const sub=path.slice(1),showIp=showIpTo(context);
  if(method!=='GET'||sub.length>1)throw new HttpError(404,'Endpoint not found.');
  if(sub.length===1&&sub[0]!=='export'){
    requireCondition(isUuid(sub[0]),404,'Endpoint not found.');
    requirePermission(user,'prompt_content');
    const [row]=await db.query(`SELECT ${PROMPT_SELECT},a.prompt ${PROMPT_FROM} WHERE a.id=$1`,[sub[0].toLowerCase()]);
    requireCondition(row,404,'Prompt not found.');
    // A value sealed with another key (for example after a restore) is reported as unreadable instead of failing the request.
    let content='',readable=true;
    try{content=openText(String(row.prompt),'ai_requests.prompt');}catch{readable=false;}
    await audit(db,user.id,'prompt.viewed',row.id,{userId:row.user_id,readable});
    await recordEvent({type:'ADMIN_ACTION',request,userId:user.id,promptId:row.id,metadata:{action:'prompt.viewed'}});
    return json({prompt:{...promptRow(row,showIp),content,readable}});
  }
  const query=await promptQuery(context);
  if(sub[0]==='export')return exportLog(context,'prompts',query,row=>promptRow(row,showIp),promptColumns(showIp));
  return json(await pagedResponse(search,query,row=>promptRow(row,showIp)));
}
