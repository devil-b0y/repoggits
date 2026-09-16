import { db } from '../db';
import { retentionSettings } from '../tracking/config';
import type { TimeRange } from './query';
import type { StatCard } from './types';

// Shared by the overview and analytics endpoints (lib/admin/overview.ts, lib/admin/analytics.ts): percentage changes,
// zero-filled series and SQL fragments for local days and visitor identities. Placeholders such as $4 are passed in.

/** Local midnight today and yesterday, in the time zone bound at `tz`, as timestamptz. */
export const todaySql=(tz:string)=>`(date_trunc('day',now() AT TIME ZONE ${tz}::text) AT TIME ZONE ${tz}::text)`;
export const yesterdaySql=(tz:string)=>`((date_trunc('day',now() AT TIME ZONE ${tz}::text)-interval '1 day') AT TIME ZONE ${tz}::text)`;
/** count(*) of the rows matching a condition, as int. */
export const countIf=(condition:string)=>`(count(*) FILTER (WHERE ${condition}))::int`;
/** One key per visitor in r.activity_events: the account, else the visitor cookie, else (no cookie) the browsing session. */
export const visitKey=(alias:string)=>`COALESCE('u'||${alias}.user_id::text,'v'||${alias}.visitor_id::text,'s'||${alias}.session_id::text)`;
/**
 * A CTE `buckets(label,local_start,local_end,starts,ends)` with the same rows as bucketLabels(): each bucket's label,
 * its local bounds and those bounds as timestamptz, for metrics that join a bucket to a window rather than grouping.
 */
export const bucketsCte=(range:TimeRange,from:string,to:string,tz:string)=>`buckets AS (SELECT to_char(g,'YYYY-MM-DD"T"HH24:MI') AS label,g AS local_start,g+interval '1 ${range.bucket}' AS local_end,
  g AT TIME ZONE ${tz}::text AS starts,(g+interval '1 ${range.bucket}') AT TIME ZONE ${tz}::text AS ends
  FROM generate_series(date_trunc('${range.bucket}',${from}::timestamptz AT TIME ZONE ${tz}::text),${to}::timestamptz AT TIME ZONE ${tz}::text,interval '1 ${range.bucket}') g)`;

/** Rows keyed by bucket label spread over every label, zero where a bucket has no row. */
export function spread<R extends {label:string}>(labels:string[],rows:R[],pick:(row:R)=>number|null|undefined) {
  const byLabel=new Map(rows.map(row=>[row.label,row]));
  return labels.map(label=>{const row=byLabel.get(label);return row?Number(pick(row))||0:0;});
}
export const sum=(values:number[])=>values.reduce((total,value)=>total+value,0);

export const NO_HISTORY='Not enough history to compare';
type Comparison=Pick<StatCard,'current'|'previous'|'change'|'hint'>;
/** The change from `previous` to `current` as a percentage with one decimal; null when there is nothing to compare against. */
export function percentChange(current:number,previous:number) {
  if(!previous)return current?null:0;
  return Math.round((current-previous)/previous*1000)/10;
}
/** Current and previous values for a StatCard. `comparable` is false when the previous period predates the data kept. */
export function compare(current:number,previous:number,comparable=true):Comparison {
  if(!comparable)return {current,previous:null,change:null,hint:NO_HISTORY};
  const change=percentChange(current,previous);
  return change===null?{current,previous,change,hint:'None in the previous period'}:{current,previous,change};
}
/**
 * Where tracked activity becomes complete: the oldest retained event, and never before the retention cutoff (older events
 * may be pruned at any time). A comparison whose previous period starts earlier would count missing data as a drop.
 */
export async function activityHistoryStart() {
  const [{activityDays},[row]]=await Promise.all([retentionSettings(),db.query<{oldest:Date|null}>('SELECT min(created_at) AS oldest FROM r.activity_events')]);
  return row.oldest?new Date(Math.max(row.oldest.getTime(),Date.now()-activityDays*86400000)):null;
}
export const coveredFrom=(start:Date|string,history:Date|null)=>!!history&&new Date(start).getTime()>=history.getTime();
