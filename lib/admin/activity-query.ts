import type { QueryResultRow } from 'pg';
import { db } from '../db';
import { audit } from '../auth';
import { requireCondition } from '../errors';
import { cleanText } from '../safe-text';
import { recordEvent } from '../tracking';
import { hasPermission, requirePermission } from './permissions';
import { cappedCount, choiceParam, containsPattern, encodeCursor, EXPORT_LIMIT, exportResponse, isUuid, pageRequest, paged, sortParam, SqlWhere, textParam, timeRange, uuidParam, type ExportColumn, type PageRequest } from './query';
import { ACTIVITY_FILTERS, BROWSER_FAMILIES, DEVICE_TYPES, EVENT_CATEGORIES, EVENT_TYPES, OS_FAMILIES, PROMPT_ACTIVITY_FILTERS, VISITOR_KINDS, eventLabel, type ActivityFilter, type ActivityRow, type DeviceType, type EventCategory } from './types';
import type { AdminContext } from './router';

// What the four log endpoints (activity, prompts, security, audit) share: filters that read the query string into
// bound SQL conditions, numbered and keyset paging, row mapping into plain one-line text, and audited exports.

// ----- Plain, secret-free values -----
/** Keys dropped from stored details and metadata before they are shown or exported. */
export const SECRET_KEY=/password|passwd|passphrase|token|secret|key|cookie|credential|hash/i;
const iso=(value:Date|string)=>new Date(value).toISOString();
function plainValue(item:unknown,depth:number):unknown {
  if(item===null||typeof item==='number'||typeof item==='boolean')return item;
  if(typeof item==='string')return cleanText(item,500);
  if(Array.isArray(item))return depth<3?item.slice(0,50).map(entry=>plainValue(entry,depth+1)):'…';
  if(item&&typeof item==='object')return depth<3?safeDetails(item,depth+1):'…';
  return null;
}
/** A stored jsonb object as key/value data with secret-looking keys removed and every string kept on one plain line. */
export function safeDetails(value:unknown,depth=0):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const result:Record<string,unknown>={};
  for(const [rawKey,item] of Object.entries(value).slice(0,60)){
    const key=cleanText(rawKey,60);
    if(!key||SECRET_KEY.test(key.replace(/\s/g,'')))continue;
    result[key]=plainValue(item,depth);
  }
  return result;
}
export const deviceTypeOf=(value:unknown):DeviceType=>typeof value==='string'&&Object.hasOwn(DEVICE_TYPES,value)?value as DeviceType:'unknown';

// ----- Filters shared by several logs -----
const named=(families:readonly string[])=>families.filter(family=>family!=='Other');
/** The latest version of each project whose title contains the pattern placeholder (e.g. $3). */
export const titleMatch=(placeholder:string)=>`SELECT v.project_id FROM r.versions v WHERE v.data->>'title' ILIKE ${placeholder} AND NOT EXISTS(SELECT 1 FROM r.versions later WHERE later.project_id=v.project_id AND later.number>v.number)`;
export const TITLE_JOIN=(projectColumn:string)=>`LEFT JOIN LATERAL (SELECT v.data->>'title' AS title FROM r.versions v WHERE v.project_id=${projectColumn} ORDER BY v.number DESC LIMIT 1) pv ON true`;

/** ?device=, ?os= and ?browser=; "Other" matches every value outside the named families, including none. */
export function deviceFilters(search:URLSearchParams,where:SqlWhere,alias:string) {
  const device=choiceParam(search,'device',DEVICE_TYPES);if(device)where.add(`${alias}.device_type=?`,device);
  for(const [name,families] of [['os',OS_FAMILIES],['browser',BROWSER_FAMILIES]] as const){
    const value=choiceParam(search,name,families);if(!value)continue;
    if(value==='Other')where.add(`${alias}.${name}<>ALL(?::text[])`,named(families));else where.add(`${alias}.${name}=?`,value);
  }
}
/** ?ip= is itself network data, so filtering by it needs the network permission. */
export function ipFilter(context:AdminContext,where:SqlWhere,alias:string) {
  const raw=context.search.get('ip');if(!raw)return;
  requirePermission(context.user,'network');
  const ip=raw.trim();requireCondition(/^[0-9A-Fa-f:.]{2,64}$/.test(ip),400,'Enter a full IP address.');
  where.add(`${alias}.ip_address=?`,ip);
}
/** ?project= as a project ID, or as part of the project's current title. */
export function projectFilter(search:URLSearchParams,where:SqlWhere,column:string) {
  const value=textParam(search,'project',120);if(!value)return;
  if(isUuid(value))where.add(`${column}=?`,value.toLowerCase());
  else where.add(`${column} IN (${titleMatch('?')})`,containsPattern(value));
}
/** A missing ?date= means every retained row. */
export async function dateFilter(search:URLSearchParams,where:SqlWhere,column:string) {
  if(!search.get('date'))return;
  const range=await timeRange(search);
  where.add(`${column}>=?::timestamptz AND ${column}<?::timestamptz`,range.from,range.to);
}
export function orderFor<K extends string>(search:URLSearchParams,columns:Readonly<Record<K,string>>,alias:string,fallback:K) {
  const sort=sortParam(search,columns,fallback);
  const time=columns[sort.key]===`${alias}.created_at`;
  return {
    order:time?`${alias}.created_at ${sort.direction},${alias}.id ${sort.direction}`:`${columns[sort.key]} ${sort.direction} NULLS LAST,${alias}.created_at DESC,${alias}.id DESC`,
    timeDesc:time&&sort.direction==='DESC',
  };
}

// ----- Paging and export -----
export type LogQuery={select:string;from:string;countFrom:string;where:SqlWhere;order:string;timeDesc:boolean;alias:string;table:string};
/**
 * One page of rows plus a capped total. With ?cursor= the page continues after the cursor row in newest-first order
 * (keyset paging), whatever the requested sort. nextCursor is offered whenever the order is newest first and more rows follow.
 */
export async function pagedRows(search:URLSearchParams,query:LogQuery):Promise<{rows:QueryResultRow[];request:PageRequest;count:{total:number;totalCapped:boolean};nextCursor:string|null}> {
  const request=pageRequest(search);
  const values=[...query.where.values];
  const bind=(value:unknown)=>{values.push(value);return `$${values.length}`;};
  let where=query.where.sql,order=query.order,offset=request.offset,timeDesc=query.timeDesc;
  if(request.cursor){
    const {alias,table}=query,id=bind(request.cursor.id),at=bind(request.cursor.createdAt);
    // The cursor holds milliseconds while rows hold microseconds, so the exact time comes from the cursor row while it still exists.
    where+=`${where?' AND ':'WHERE '}(${alias}.created_at,${alias}.id)<(COALESCE((SELECT created_at FROM ${table} WHERE id=${id}::uuid),${at}::timestamptz),${id}::uuid)`;
    order=`${alias}.created_at DESC,${alias}.id DESC`;offset=0;timeDesc=true;
  }
  const limit=bind(request.pageSize+1),skip=bind(offset);
  const [count,rows]=await Promise.all([
    cappedCount(`${query.countFrom} ${query.where.sql}`,query.where.values),
    db.query(`SELECT ${query.select} ${query.from} ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${skip}`,values),
  ]);
  const page=rows.slice(0,request.pageSize),last=page[page.length-1];
  return {rows:page,request,count,nextCursor:timeDesc&&rows.length>request.pageSize&&last?encodeCursor(last.created_at,last.id):null};
}
export async function pagedResponse<T>(search:URLSearchParams,query:LogQuery,map:(row:QueryResultRow)=>T) {
  const result=await pagedRows(search,query);
  return paged(result.rows.map(map),result.request,result.count,result.nextCursor);
}

const EXPORT_FILTERS=['user','event','prompt','status','device','os','browser','session','project','owner','model','feature','visitor','date','from','to','sort','dir','source','actor','action'];
/**
 * Every matching row (up to EXPORT_LIMIT) as CSV or JSON. Afterwards the export is written to the audit log with its
 * filters; free-text search and IP filters are recorded only as present, never by value.
 */
export async function exportLog<T>(context:AdminContext,log:string,query:LogQuery,map:(row:QueryResultRow)=>T,columns:ExportColumn<T>[]) {
  const format=context.search.get('format')||'csv';
  requireCondition(format==='csv'||format==='json',400,'Export as CSV or JSON.');
  const rows=(await db.query(`SELECT ${query.select} ${query.from} ${query.where.sql} ORDER BY ${query.order} LIMIT ${EXPORT_LIMIT}`,query.where.values)).map(map);
  const response=exportResponse(context.search,log,columns,rows);
  const filters:Record<string,string|boolean>={};
  for(const name of EXPORT_FILTERS){const value=context.search.get(name);if(value)filters[name]=cleanText(value,120);}
  for(const name of ['q','ip'])if(context.search.get(name))filters[name]=true;
  await audit(db,context.user.id,'logs.exported',log,{filters,format,count:rows.length});
  await recordEvent({type:'ADMIN_ACTION',request:context.request,userId:context.user.id,metadata:{action:'logs.exported',log,format,count:rows.length}});
  return response;
}

// ----- Activity events (global activity and security logs) -----
export type ActivityScope='activity'|'security';
const SECURITY_TYPES=Object.entries(EVENT_TYPES).filter(([,entry])=>entry.category==='security').map(([type])=>type);
const ACTIVITY_SORTS={time:'e.created_at',event:'e.event_type',user:'u.name'} as const;
const ACTIVITY_SELECT='e.id,e.event_type,e.category,e.status,e.user_id,e.session_id,e.visitor_id,e.project_id,e.prompt_id,e.page,e.ip_address,e.device_type,e.os,e.browser,e.user_agent,e.metadata,e.created_at,u.name AS user_name,u.role AS user_role,pv.title AS project_title';

/** The filtered, sorted activity query. The security log is the same query limited to the security category. */
export async function activityQuery(context:AdminContext,scope:ActivityScope):Promise<LogQuery> {
  const {search}=context,where=new SqlWhere();
  if(search.get('ip'))requirePermission(context.user,'network');
  if(scope==='security')where.add('e.category=?','security');
  const q=textParam(search,'q',120);
  if(q&&isUuid(q)){
    const id=where.param(q.toLowerCase());
    where.add(`(e.id=${id}::uuid OR e.user_id=${id}::uuid OR e.session_id=${id}::uuid OR e.visitor_id=${id}::uuid OR e.project_id=${id}::uuid OR e.prompt_id=${id}::uuid)`);
  } else if(q){
    const pattern=where.param(containsPattern(q));
    where.add(`(e.user_id IN (SELECT id FROM r.users WHERE name ILIKE ${pattern}) OR e.project_id IN (${titleMatch(pattern)}))`);
  }
  const user=uuidParam(search,'user');if(user)where.add('e.user_id=?',user);
  const event=search.get('event');
  if(event){
    if(scope==='activity'&&Object.hasOwn(ACTIVITY_FILTERS,event)){
      const group:{types?:readonly string[];category?:string}=ACTIVITY_FILTERS[event as ActivityFilter];
      if(group.category)where.add('e.category=?',group.category);else where.add('e.event_type=ANY(?::text[])',[...group.types??[]]);
    } else {
      requireCondition((scope==='security'?SECURITY_TYPES:Object.keys(EVENT_TYPES)).includes(event),400,'Unknown event filter.');
      where.add('e.event_type=?',event);
    }
  }
  if(scope==='activity'){
    const prompt=choiceParam(search,'prompt',PROMPT_ACTIVITY_FILTERS);if(prompt)where.add('e.event_type=ANY(?::text[])',[...PROMPT_ACTIVITY_FILTERS[prompt].types]);
    const visitor=choiceParam(search,'visitor',VISITOR_KINDS);if(visitor)where.add(visitor==='anonymous'?'e.user_id IS NULL':'e.user_id IS NOT NULL');
  }
  projectFilter(search,where,'e.project_id');
  const owner=textParam(search,'owner',120);
  if(owner&&isUuid(owner))where.add('e.project_id IN (SELECT id FROM r.projects WHERE owner_id=?)',owner.toLowerCase());
  else if(owner)where.add('e.project_id IN (SELECT p.id FROM r.projects p JOIN r.users o ON o.id=p.owner_id WHERE o.name ILIKE ?)',containsPattern(owner));
  deviceFilters(search,where,'e');
  ipFilter(context,where,'e');
  const session=uuidParam(search,'session');if(session)where.add('e.session_id=?',session);
  const status=choiceParam(search,'status',['success','failure'] as const);if(status)where.add('e.status=?',status);
  await dateFilter(search,where,'e.created_at');
  const {order,timeDesc}=orderFor(search,ACTIVITY_SORTS,'e','time');
  return {select:ACTIVITY_SELECT,from:`FROM r.activity_events e LEFT JOIN r.users u ON u.id=e.user_id ${TITLE_JOIN('e.project_id')}`,countFrom:'FROM r.activity_events e',where,order,timeDesc,alias:'e',table:'r.activity_events'};
}

export function activityRow(row:QueryResultRow,showIp:boolean):ActivityRow {
  const type=cleanText(row.event_type,40);
  return {
    id:row.id,eventType:type,label:eventLabel(type),category:(Object.hasOwn(EVENT_CATEGORIES,row.category)?row.category:'navigation') as EventCategory,
    status:row.status==='failure'?'failure':'success',createdAt:iso(row.created_at),
    user:row.user_id&&row.user_name!=null?{id:row.user_id,name:cleanText(row.user_name,120),role:String(row.user_role)}:null,
    visitorId:row.visitor_id??null,sessionId:row.session_id??null,
    project:row.project_id?{id:row.project_id,title:cleanText(row.project_title,160)||'Untitled project'}:null,promptId:row.prompt_id??null,
    page:cleanText(row.page,300),ipAddress:showIp?cleanText(row.ip_address,64):null,deviceType:deviceTypeOf(row.device_type),
    os:cleanText(row.os,40),browser:cleanText(row.browser,40),userAgent:cleanText(row.user_agent,500),metadata:safeDetails(row.metadata),
  };
}
export function activityColumns(showIp:boolean):ExportColumn<ActivityRow>[] {
  return [
    {key:'time',label:'Time',value:row=>row.createdAt},
    {key:'eventId',label:'Event ID',value:row=>row.id},
    {key:'event',label:'Event',value:row=>row.label},
    {key:'category',label:'Category',value:row=>EVENT_CATEGORIES[row.category]},
    {key:'status',label:'Status',value:row=>row.status},
    {key:'user',label:'User',value:row=>row.user?.name??'Anonymous visitor'},
    {key:'userId',label:'User ID',value:row=>row.user?.id??''},
    {key:'visitorId',label:'Visitor ID',value:row=>row.visitorId??''},
    {key:'sessionId',label:'Session ID',value:row=>row.sessionId??''},
    {key:'project',label:'Project',value:row=>row.project?.title??''},
    {key:'projectId',label:'Project ID',value:row=>row.project?.id??''},
    {key:'page',label:'Page',value:row=>row.page},
    {key:'device',label:'Device',value:row=>DEVICE_TYPES[row.deviceType]},
    {key:'os',label:'OS',value:row=>row.os},
    {key:'browser',label:'Browser',value:row=>row.browser},
    ...(showIp?[{key:'ip',label:'IP',value:(row:ActivityRow)=>row.ipAddress??''}]:[]),
    {key:'userAgent',label:'User agent',value:row=>row.userAgent},
    {key:'metadata',label:'Metadata',value:row=>row.metadata},
  ];
}
export const showIpTo=(context:AdminContext)=>hasPermission(context.user,'network');
