import { db } from '../db';
import { HttpError } from '../errors';
import { json } from '../http';
import { AI_RETENTION_DAYS } from '../ai-usage';
import { presenceTimeoutSeconds } from '../tracking/config';
import { activityHistoryStart, compare, countIf, coveredFrom, spread, todaySql, visitKey, yesterdaySql } from './metrics';
import { requirePermission } from './permissions';
import { bucketLabels, bucketSql, timeRange, type TimeRange } from './query';
import type { StatCard } from './types';
import type { AdminContext } from './router';

// GET /api/admin/overview (permission `analytics`): the headline cards of Admin › Overview for ?date&from&to&tz (default
// the last 7 days), each compared with the equally long period before it, plus the platform activity chart.

export type OverviewResponse={range:TimeRange;generatedAt:string;onlineWindowSeconds:number;cards:StatCard[];labels:string[];activity:{pageViews:number[];projectViews:number[];logins:number[]}};

type Totals={
  users:number;users_current:number;users_previous:number;users_today:number;users_yesterday:number;users_week:number;users_prior_week:number;
  projects:number;projects_current:number;projects_previous:number;projects_today:number;projects_yesterday:number;project_views:number;
  storage:number;storage_current:number;storage_previous:number;prompts:number;prompts_current:number;prompts_previous:number;prompts_today:number;prompts_yesterday:number;
  api_current:number;api_previous:number;api_since:Date|null;errors_current:number;errors_previous:number;auth_sessions:number;online:number;shares_all:number;yesterday_start:Date;
};
type ActivityTotals={active_current:number;active_previous:number;visitors_today:number;visitors_yesterday:number;page_views_today:number;page_views_yesterday:number;
  project_views_current:number;project_views_previous:number;shares_current:number;shares_previous:number;shares_today:number;shares_yesterday:number;failed_logins_current:number;failed_logins_previous:number};
type ActivityBucket={label:string;active:number;visitors:number;page_views:number;project_views:number;shares:number;logins:number;failed_logins:number};

async function overview(search:URLSearchParams):Promise<OverviewResponse> {
  const range=await timeRange(search,'7d');
  const today=todaySql('$4'),yesterday=yesterdaySql('$4');
  const current='created_at>=$1 AND created_at<$2',previous='created_at>=$3 AND created_at<$1',onToday=`created_at>=${today}`,onYesterday=`created_at>=${yesterday} AND created_at<${today}`;
  const periods=[range.from,range.to,range.previousFrom,range.timeZone],window=[range.from,range.to,range.timeZone];
  const bucketOf=(column:string)=>bucketSql(range,column,'$3');
  const part=(metric:string,table:string,column:string,value:string)=>`SELECT '${metric}' AS metric,${bucketOf(column)} AS label,${value}::float8 AS n FROM ${table} WHERE ${column}>=$1 AND ${column}<$2 GROUP BY 2`;
  const [labels,history,[totals],[activity],buckets,others]=await Promise.all([
    bucketLabels(range),activityHistoryStart(),
    db.query<Totals>(`SELECT u.*,p.*,f.*,a.*,x.*,e.*,s.*,o.*,(SELECT min(bucket) FROM r.api_usage) AS api_since,
        (SELECT count(*)::int FROM r.activity_events WHERE event_type='PROJECT_SHARE') AS shares_all,${yesterday} AS yesterday_start FROM
      (SELECT count(*)::int AS users,${countIf(current)} AS users_current,${countIf(previous)} AS users_previous,${countIf(onToday)} AS users_today,${countIf(onYesterday)} AS users_yesterday,
        ${countIf("created_at>=now()-interval '7 days'")} AS users_week,${countIf("created_at>=now()-interval '14 days' AND created_at<now()-interval '7 days'")} AS users_prior_week FROM r.users) u,
      (SELECT count(*)::int AS projects,${countIf(current)} AS projects_current,${countIf(previous)} AS projects_previous,${countIf(onToday)} AS projects_today,${countIf(onYesterday)} AS projects_yesterday,
        COALESCE(sum(views),0)::float8 AS project_views FROM r.projects) p,
      (SELECT COALESCE(sum(size),0)::float8 AS storage,COALESCE(sum(size) FILTER (WHERE ${current}),0)::float8 AS storage_current,COALESCE(sum(size) FILTER (WHERE ${previous}),0)::float8 AS storage_previous FROM r.files) f,
      (SELECT count(*)::int AS prompts,${countIf(current)} AS prompts_current,${countIf(previous)} AS prompts_previous,${countIf(onToday)} AS prompts_today,${countIf(onYesterday)} AS prompts_yesterday FROM r.ai_requests) a,
      (SELECT COALESCE(sum(requests) FILTER (WHERE bucket>=$1),0)::float8 AS api_current,COALESCE(sum(requests) FILTER (WHERE bucket<$1),0)::float8 AS api_previous FROM r.api_usage WHERE bucket>=$3 AND bucket<$2) x,
      (SELECT ${countIf('created_at>=$1')} AS errors_current,${countIf('created_at<$1')} AS errors_previous FROM r.error_log WHERE created_at>=$3 AND created_at<$2) e,
      (SELECT count(*)::int AS auth_sessions FROM r.sessions WHERE expires_at>now()) s,
      (SELECT count(*)::int AS online FROM r.tracked_sessions WHERE ended_at IS NULL AND last_seen_at>now()-$5::int*interval '1 second') o`,[...periods,presenceTimeoutSeconds()]),
    db.query<ActivityTotals>(`SELECT (count(DISTINCT user_id) FILTER (WHERE ${current}))::int AS active_current,(count(DISTINCT user_id) FILTER (WHERE ${previous}))::int AS active_previous,
        (count(DISTINCT ${visitKey('e')}) FILTER (WHERE ${onToday}))::int AS visitors_today,(count(DISTINCT ${visitKey('e')}) FILTER (WHERE ${onYesterday}))::int AS visitors_yesterday,
        ${countIf(`event_type='PAGE_VIEW' AND ${onToday}`)} AS page_views_today,${countIf(`event_type='PAGE_VIEW' AND ${onYesterday}`)} AS page_views_yesterday,
        ${countIf(`event_type='PROJECT_VIEW' AND ${current}`)} AS project_views_current,${countIf(`event_type='PROJECT_VIEW' AND ${previous}`)} AS project_views_previous,
        ${countIf(`event_type='PROJECT_SHARE' AND ${current}`)} AS shares_current,${countIf(`event_type='PROJECT_SHARE' AND ${previous}`)} AS shares_previous,
        ${countIf(`event_type='PROJECT_SHARE' AND ${onToday}`)} AS shares_today,${countIf(`event_type='PROJECT_SHARE' AND ${onYesterday}`)} AS shares_yesterday,
        ${countIf(`event_type='LOGIN_FAILED' AND ${current}`)} AS failed_logins_current,${countIf(`event_type='LOGIN_FAILED' AND ${previous}`)} AS failed_logins_previous
      FROM r.activity_events e WHERE created_at>=LEAST($3::timestamptz,${yesterday}) AND created_at<GREATEST($2::timestamptz,now())`,periods),
    db.query<ActivityBucket>(`SELECT ${bucketOf('created_at')} AS label,count(DISTINCT user_id)::int AS active,count(DISTINCT ${visitKey('e')})::int AS visitors,
        ${countIf("event_type='PAGE_VIEW'")} AS page_views,${countIf("event_type='PROJECT_VIEW'")} AS project_views,${countIf("event_type='PROJECT_SHARE'")} AS shares,
        ${countIf("event_type='LOGIN'")} AS logins,${countIf("event_type='LOGIN_FAILED'")} AS failed_logins
      FROM r.activity_events e WHERE created_at>=$1 AND created_at<$2 GROUP BY 1`,window),
    db.query<{metric:string;label:string;n:number}>([
      part('users','r.users','created_at','count(*)'),part('projects','r.projects','created_at','count(*)'),part('sessions','r.sessions','created_at','count(*)'),
      part('storage','r.files','created_at','sum(size)'),part('prompts','r.ai_requests','created_at','count(*)'),part('api','r.api_usage','bucket','sum(requests)'),
      part('errors','r.error_log','created_at','count(*)'),
    ].join(' UNION ALL '),window),
  ]);
  const series=(pick:(row:ActivityBucket)=>number)=>spread(labels,buckets,pick);
  const trend=(metric:string)=>spread(labels,others.filter(row=>row.metric===metric),row=>row.n);
  // Comparisons over tracked activity need events kept back to the start of the previous period (or of yesterday).
  const periodCovered=coveredFrom(range.previousFrom,history),daysCovered=coveredFrom(totals.yesterday_start,history);
  const promptsCovered=Date.parse(range.previousFrom)>=Date.now()-AI_RETENTION_DAYS*86400000;
  const apiCovered=coveredFrom(range.previousFrom,totals.api_since);
  const card=(key:string,label:string,value:number,comparison:ReturnType<typeof compare>,trendValues:number[],href:string,format:StatCard['format']='number'):StatCard=>({key,label,value,format,...comparison,trend:trendValues,href});
  const pageViews=series(row=>row.page_views),projectViews=series(row=>row.project_views),logins=series(row=>row.logins),users=trend('users'),projects=trend('projects');
  const cards:StatCard[]=[
    {key:'online',label:'Online now',value:totals.online,format:'number',current:totals.online,previous:null,change:null,hint:'Live',trend:[],href:'/admin/live'},
    card('users','Total users',totals.users,compare(totals.users_current,totals.users_previous),users,'/admin/users'),
    card('active_users','Active users',activity.active_current,compare(activity.active_current,activity.active_previous,periodCovered),series(row=>row.active),'/admin/analytics?view=users'),
    card('new_users_today','New users today',totals.users_today,compare(totals.users_today,totals.users_yesterday),users,'/admin/analytics?view=users'),
    card('new_users_week','New users this week',totals.users_week,compare(totals.users_week,totals.users_prior_week),users,'/admin/analytics?view=users'),
    {key:'active_sessions',label:'Active sessions',value:totals.auth_sessions,format:'number',current:totals.auth_sessions,previous:null,change:null,hint:'Signed-in sessions not yet expired',trend:trend('sessions'),href:'/admin/sessions'},
    card('visitors_today',"Today's visitors",activity.visitors_today,compare(activity.visitors_today,activity.visitors_yesterday,daysCovered),series(row=>row.visitors),'/admin/analytics?view=visitors'),
    card('page_views_today',"Today's page views",activity.page_views_today,compare(activity.page_views_today,activity.page_views_yesterday,daysCovered),pageViews,'/admin/logs?event=page_view&date=today'),
    card('projects','Total projects',totals.projects,compare(totals.projects_current,totals.projects_previous),projects,'/admin?tab=library'),
    card('projects_today','Projects created today',totals.projects_today,compare(totals.projects_today,totals.projects_yesterday),projects,'/admin/projects'),
    card('project_views','Total project views',totals.project_views,compare(activity.project_views_current,activity.project_views_previous,periodCovered),projectViews,'/admin/projects'),
    card('project_shares','Total project shares',totals.shares_all,compare(activity.shares_current,activity.shares_previous,periodCovered),series(row=>row.shares),'/admin/projects'),
    card('shares_today',"Today's shares",activity.shares_today,compare(activity.shares_today,activity.shares_yesterday,daysCovered),series(row=>row.shares),'/admin/logs?event=project_share&date=today'),
    card('prompts','Total prompts used',totals.prompts,compare(totals.prompts_current,totals.prompts_previous,promptsCovered),trend('prompts'),'/admin/ai'),
    card('prompts_today',"Today's AI usage",totals.prompts_today,compare(totals.prompts_today,totals.prompts_yesterday),trend('prompts'),'/admin/logs/prompts?date=today'),
    card('failed_logins','Failed login attempts',activity.failed_logins_current,compare(activity.failed_logins_current,activity.failed_logins_previous,periodCovered),series(row=>row.failed_logins),'/admin/logs/security?event=LOGIN_FAILED'),
    card('storage','Storage used',totals.storage,compare(totals.storage_current,totals.storage_previous),trend('storage'),'/admin/system','bytes'),
    card('api_requests','API requests',totals.api_current,compare(totals.api_current,totals.api_previous,apiCovered),trend('api'),'/admin/system'),
    card('system_errors','System errors',totals.errors_current,compare(totals.errors_current,totals.errors_previous,apiCovered),trend('errors'),'/admin/system'),
  ];
  return {range,generatedAt:new Date().toISOString(),onlineWindowSeconds:presenceTimeoutSeconds(),cards,labels,activity:{pageViews,projectViews,logins}};
}

export async function overviewRoute({user,method,path,search}:AdminContext):Promise<Response> {
  requirePermission(user,'analytics');
  if(method!=='GET'||path.length>1)throw new HttpError(404,'Endpoint not found.');
  return json(await overview(search));
}
