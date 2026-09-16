import { db } from '../db';
import { HttpError, requireCondition } from '../errors';
import { cleanText } from '../safe-text';
import { DATE_PRESETS, type DatePreset, type Paged } from './types';

// What every admin endpoint shares: filters and date ranges read from the query string, parameterized SQL conditions,
// pagination and exports. Values reach SQL only as bound parameters; column names only ever come from allow-lists.

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid=(value:string)=>UUID.test(value);

export const textParam=(search:URLSearchParams,name:string,max=120)=>cleanText(search.get(name),max);
export function uuidParam(search:URLSearchParams,name:string) {
  const value=search.get(name)?.trim();if(!value)return null;
  requireCondition(isUuid(value),400,`The ${name} filter must be an ID.`);
  return value.toLowerCase();
}
export function choiceParam<T extends string>(search:URLSearchParams,name:string,allowed:readonly T[]|Readonly<Record<T,unknown>>):T|null {
  const value=search.get(name);if(!value)return null;
  const options:readonly string[]=Array.isArray(allowed)?allowed:Object.keys(allowed);
  requireCondition(options.includes(value),400,`Unknown ${name} filter.`);
  return value as T;
}
export function intParam(search:URLSearchParams,name:string,fallback:number,min:number,max:number) {
  const raw=search.get(name);if(raw===null||raw==='')return fallback;
  const value=Number(raw);requireCondition(Number.isInteger(value)&&value>=min&&value<=max,400,`The ${name} value is out of range.`);
  return value;
}
/** A LIKE/ILIKE pattern matching `text` anywhere, with its own wildcard characters escaped. */
export const containsPattern=(text:string)=>`%${text.replace(/[\\%_]/g,match=>`\\${match}`)}%`;

/**
 * Collects WHERE conditions. Each `?` in a condition becomes the next $n placeholder bound to the matching value,
 * so never use it for the jsonb ? operators; use param() for a placeholder inside a longer expression instead.
 */
export class SqlWhere {
  readonly values:unknown[];
  private readonly parts:string[]=[];
  constructor(values:unknown[]=[]) {this.values=[...values];}
  param(value:unknown) {this.values.push(value);return `$${this.values.length}`;}
  add(condition:string,...values:unknown[]) {
    let used=0;
    const sql=condition.replace(/\?/g,()=>{if(used>=values.length)throw new Error('More placeholders than values in a filter condition.');return this.param(values[used++]);});
    if(used!==values.length)throw new Error('More values than placeholders in a filter condition.');
    this.parts.push(`(${sql})`);return this;
  }
  get sql() {return this.parts.length?`WHERE ${this.parts.join(' AND ')}`:'';}
  /** For appending to a WHERE clause the query already has. */
  get andSql() {return this.parts.length?` AND ${this.parts.join(' AND ')}`:'';}
}

// ----- Date ranges: ?date=today|yesterday|7d|30d|90d|custom&from=&to=&tz= -----
export type TimeRange={preset:DatePreset;timeZone:string;from:string;to:string;previousFrom:string;bucket:'hour'|'day'|'week';label:string};
const zones=new Map<string,boolean>();
export async function validTimeZone(zone:string) {
  if(zone==='UTC')return true;
  if(zone.length>64||!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(zone))return false;
  let known=zones.get(zone);
  if(known===undefined){const [row]=await db.query<{ok:boolean}>('SELECT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=$1) AS ok',[zone]);known=row.ok;if(zones.size<500)zones.set(zone,known);}
  return known;
}
const LOCAL_TIME=/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/;
/**
 * Days are counted in the viewer's time zone (tz, an IANA name; UTC when missing or unknown). Presets end now, except
 * yesterday, which ends at midnight. A custom `to` given as a bare date includes that whole day. previousFrom starts
 * the equally long period immediately before `from`, for percentage-change comparisons.
 */
export async function timeRange(search:URLSearchParams,fallback:DatePreset='7d'):Promise<TimeRange> {
  const preset=choiceParam(search,'date',DATE_PRESETS)??fallback;
  const requestedZone=search.get('tz')||'UTC';
  const timeZone=await validTimeZone(requestedZone)?requestedZone:'UTC';
  let from:string|null=null,to:string|null=null;
  if(preset==='custom') {
    from=search.get('from');to=search.get('to');
    requireCondition(from&&to&&LOCAL_TIME.test(from)&&LOCAL_TIME.test(to),400,'Choose a start and an end for the custom range.');
    requireCondition(!Number.isNaN(Date.parse(from))&&!Number.isNaN(Date.parse(to)),400,'Choose real calendar dates for the custom range.');
  }
  const [row]=await db.query<{start:Date;finish:Date;previous:Date}>(`WITH today AS (SELECT date_trunc('day',now() AT TIME ZONE $2::text) AS midnight),
    bounds AS (SELECT CASE $1::text
        WHEN 'today' THEN midnight AT TIME ZONE $2::text
        WHEN 'yesterday' THEN (midnight-interval '1 day') AT TIME ZONE $2::text
        WHEN '7d' THEN (midnight-interval '6 days') AT TIME ZONE $2::text
        WHEN '30d' THEN (midnight-interval '29 days') AT TIME ZONE $2::text
        WHEN '90d' THEN (midnight-interval '89 days') AT TIME ZONE $2::text
        ELSE $3::text::timestamp AT TIME ZONE $2::text END AS start,
      CASE $1::text
        WHEN 'yesterday' THEN midnight AT TIME ZONE $2::text
        WHEN 'custom' THEN (CASE WHEN length($4::text)=10 THEN $4::text::timestamp+interval '1 day' ELSE $4::text::timestamp END) AT TIME ZONE $2::text
        ELSE now() END AS finish
      FROM today)
    SELECT start,finish,start-(finish-start) AS previous FROM bounds`,[preset,timeZone,from,to]);
  const span=row.finish.getTime()-row.start.getTime();
  requireCondition(span>0,400,'The end of the range must come after its start.');
  requireCondition(span<=366*86400000,400,'Choose a range of one year or less.');
  return {
    preset,timeZone,from:row.start.toISOString(),to:row.finish.toISOString(),previousFrom:row.previous.toISOString(),
    bucket:span<=2*86400000?'hour':span<=120*86400000?'day':'week',
    label:preset==='custom'?`${from} to ${to}`:DATE_PRESETS[preset],
  };
}
/** SQL for the local start of the bucket holding `column`, as text such as 2026-09-15T00:00, matching bucketLabels(). `tz` is a placeholder such as $3. */
export const bucketSql=(range:TimeRange,column:string,tz:string)=>`to_char(date_trunc('${range.bucket}',${column} AT TIME ZONE ${tz}::text),'YYYY-MM-DD"T"HH24:MI')`;
/** Every bucket label from the start of the range to now, so a chart shows empty buckets as zero instead of skipping them. */
export async function bucketLabels(range:TimeRange) {
  const rows=await db.query<{label:string}>(`SELECT to_char(g,'YYYY-MM-DD"T"HH24:MI') AS label FROM generate_series(date_trunc('${range.bucket}',$1::timestamptz AT TIME ZONE $3::text),$2::timestamptz AT TIME ZONE $3::text,interval '1 ${range.bucket}') g`,[range.from,range.to,range.timeZone]);
  return rows.map(row=>row.label);
}

// ----- Pagination: ?page=&pageSize= for numbered pages, or ?cursor= for keyset paging through very large logs -----
export type PageRequest={page:number;pageSize:number;offset:number;cursor:{createdAt:string;id:string}|null};
export function pageRequest(search:URLSearchParams,{defaultSize=25,maxSize=100}={}):PageRequest {
  const page=intParam(search,'page',1,1,10000),pageSize=intParam(search,'pageSize',defaultSize,1,maxSize);
  return {page,pageSize,offset:(page-1)*pageSize,cursor:decodeCursor(search.get('cursor'))};
}
export const encodeCursor=(createdAt:string|Date,id:string)=>Buffer.from(JSON.stringify([new Date(createdAt).toISOString(),id])).toString('base64url');
export function decodeCursor(value:string|null) {
  if(!value)return null;
  try {
    const [createdAt,id]=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
    if(typeof createdAt==='string'&&!Number.isNaN(Date.parse(createdAt))&&typeof id==='string'&&isUuid(id))return {createdAt,id};
  } catch {}
  throw new HttpError(400,'This page link is no longer valid. Start again from the first page.');
}
/** Counts matching rows up to COUNT_CAP, so a broad filter over a large log never scans all of it only for a total. `fromWhere` starts with FROM. */
export const COUNT_CAP=10000;
export async function cappedCount(fromWhere:string,values:unknown[]) {
  const [row]=await db.query<{n:number}>(`SELECT count(*)::int AS n FROM (SELECT 1 ${fromWhere} LIMIT ${COUNT_CAP+1}) capped`,values);
  return {total:Math.min(row.n,COUNT_CAP),totalCapped:row.n>COUNT_CAP};
}
export const paged=<T,>(items:T[],request:PageRequest,count:{total:number;totalCapped:boolean},nextCursor:string|null=null):Paged<T>=>({items,page:request.page,pageSize:request.pageSize,total:count.total,totalCapped:count.totalCapped,nextCursor});

/** ?sort=&dir= resolved against an allow-list of sortable columns. */
export function sortParam<K extends string>(search:URLSearchParams,columns:Readonly<Record<K,string>>,fallback:K) {
  const requested=search.get('sort');
  const key=(requested&&Object.hasOwn(columns,requested)?requested:fallback) as K;
  const direction=search.get('dir')==='asc'?'ASC':'DESC';
  return {key,direction,sql:`${columns[key]} ${direction}`};
}

// ----- Exports: ?format=csv|json. The caller applies the same filters and permission redaction as the page. -----
export const EXPORT_LIMIT=10000;
export type ExportColumn<T>={key:string;label:string;value:(row:T)=>unknown};
export function exportResponse<T>(search:URLSearchParams,name:string,columns:ExportColumn<T>[],rows:T[]) {
  const format=search.get('format')||'csv';
  requireCondition(format==='csv'||format==='json',400,'Export as CSV or JSON.');
  const filename=`repoggits-${name}-${new Date().toISOString().slice(0,10)}.${format}`;
  const headers={'Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const plain=(value:unknown)=>value instanceof Date?value.toISOString():value??null;
  if(format==='json')return new Response(JSON.stringify({exportedAt:new Date().toISOString(),count:rows.length,rows:rows.map(row=>Object.fromEntries(columns.map(column=>[column.key,plain(column.value(row))])))},null,2),{headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
  // Spreadsheet apps run a cell starting with = + - @ as a formula, so such a cell gets a leading apostrophe.
  const cell=(value:unknown)=>{const item=plain(value);const text=item===null?'':typeof item==='object'?JSON.stringify(item):String(item);return `"${text.replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')}"`;};
  const lines=[columns.map(column=>cell(column.label)),...rows.map(row=>columns.map(column=>cell(column.value(row))))];
  return new Response(`${String.fromCharCode(0xfeff)}${lines.map(line=>line.join(',')).join('\r\n')}`,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8'}});
}
