import { db } from '../db';
import { HttpError, requireCondition } from '../errors';
import { json } from '../http';
import { AI_RETENTION_DAYS } from '../ai-usage';
import { cleanText } from '../safe-text';
import { TITLE_JOIN } from './activity-query';
import { bucketsCte, compare, countIf, spread, sum, todaySql, visitKey, yesterdaySql } from './metrics';
import { requirePermission } from './permissions';
import { bucketLabels, bucketSql, timeRange, type TimeRange } from './query';
import { AI_FEATURES, BROWSER_FAMILIES, DEVICE_TYPES, OS_FAMILIES, PROMPT_OUTCOMES, type PersonRef, type ProjectRef, type StatCard } from './types';
import type { AdminContext } from './router';

// GET /api/admin/analytics?view=users|activity|visitors|devices|projects|ai&date&from&to&tz for Admin › Analytics,
// Project analytics and AI usage. view=ai needs `prompts`; every other view needs `analytics`. Everything is aggregated
// in SQL from the tracked tables; no prompt text, IP address or user agent is read.

export type NamedValue={key:string;label:string;value:number};
export type SeriesData={key:string;label:string;values:number[]};
type ViewBase={range:TimeRange;generatedAt:string;labels:string[]};
/** A sign-up week (local start, like a bucket label) and the percentage of it active 0..7 weeks later; null for weeks not reached yet. */
export type RetentionCohort={week:string;size:number;values:(number|null)[]};
export type UsersAnalytics=ViewBase&{view:'users';newUsers:number;registrations:number[];cumulative:number[];dau:number[];wau:number[];mau:number[];newActive:number[];returningActive:number[];cohorts:RetentionCohort[]};
export type ActivityAnalytics=ViewBase&{view:'activity';series:SeriesData[];topPages:{page:string;views:number}[]};
export type VisitorsAnalytics=ViewBase&{view:'visitors';totals:{total:number;unique:number;returning:number;authenticated:number;anonymous:number};authenticated:number[];anonymous:number[]};
export type DevicesAnalytics=ViewBase&{view:'devices';people:number;devices:NamedValue[];os:NamedValue[];browsers:NamedValue[];mostCommon:{device:NamedValue|null;os:NamedValue|null;browser:NamedValue|null};overTime:SeriesData[]};
export type RankedProject={project:ProjectRef;count:number;allTime:number|null};
export type ActiveUser={user:PersonRef;events:number;projects:number;prompts:number;total:number};
export type ProjectsAnalytics=ViewBase&{view:'projects';created:number[];createdInRange:number;totalProjects:number;mostViewed:RankedProject[];mostShared:RankedProject[];mostDownloaded:RankedProject[];activeUsers:ActiveUser[];departments:NamedValue[];subjects:NamedValue[];tags:NamedValue[]};
export type AiAnalytics=ViewBase&{view:'ai';cards:StatCard[];outcomes:NamedValue[];overTime:SeriesData[];averageMs:number[];byFeature:NamedValue[];byUser:{user:PersonRef;count:number}[];byProject:{project:ProjectRef;count:number}[]};
export type AnalyticsResponse=UsersAnalytics|ActivityAnalytics|VisitorsAnalytics|DevicesAnalytics|ProjectsAnalytics|AiAnalytics;

const generatedAt=()=>new Date().toISOString();
const person=(id:string,name:unknown,role:unknown):PersonRef=>({id,name:cleanText(name,120)||'Unknown user',role:String(role)});
const project=(id:string,title:unknown):ProjectRef=>({id,title:cleanText(title,160)||'Untitled project'});
/** The first entry with the highest value, skipping catch-all entries such as Other or Unknown. */
const leader=(items:NamedValue[],skip:string[])=>items.filter(item=>item.value>0&&!skip.includes(item.key)).reduce<NamedValue|null>((best,item)=>!best||item.value>best.value?item:best,null);

async function usersView(range:TimeRange):Promise<UsersAnalytics> {
  const window=[range.from,range.to,range.timeZone];
  // A user counts as new in a bucket when their account was created in it (hourly charts compare local days).
  const unit=range.bucket==='hour'?'day':range.bucket;
  const sameBucket=`date_trunc('${unit}',u.created_at AT TIME ZONE $3::text)=date_trunc('${unit}',e.created_at AT TIME ZONE $3::text)`;
  // DAU, WAU and MAU are distinct signed-in users over the 1, 7 and 30 local days ending with each bucket.
  const trailing=(span:string,name:string)=>`(SELECT count(DISTINCT e.user_id) FROM r.activity_events e WHERE e.user_id IS NOT NULL AND e.created_at>=(b.local_end-interval '${span}') AT TIME ZONE $3::text AND e.created_at<LEAST(b.ends,$2::timestamptz))::int AS ${name}`;
  const [labels,registrations,[before],active,split,cohorts]=await Promise.all([
    bucketLabels(range),
    db.query<{label:string;n:number}>(`SELECT ${bucketSql(range,'created_at','$3')} AS label,count(*)::int AS n FROM r.users WHERE created_at>=$1 AND created_at<$2 GROUP BY 1`,window),
    db.query<{n:number}>('SELECT count(*)::int AS n FROM r.users WHERE created_at<$1',[range.from]),
    db.query<{label:string;dau:number;wau:number;mau:number}>(`WITH ${bucketsCte(range,'$1','$2','$3')}
      SELECT b.label,${trailing('1 day','dau')},${trailing('7 days','wau')},${trailing('30 days','mau')} FROM buckets b WHERE b.starts<$2::timestamptz`,window),
    db.query<{label:string;new_users:number;returning_users:number}>(`SELECT ${bucketSql(range,'e.created_at','$3')} AS label,
        (count(DISTINCT e.user_id) FILTER (WHERE ${sameBucket}))::int AS new_users,(count(DISTINCT e.user_id) FILTER (WHERE NOT (${sameBucket})))::int AS returning_users
      FROM r.activity_events e JOIN r.users u ON u.id=e.user_id WHERE e.created_at>=$1 AND e.created_at<$2 GROUP BY 1`,window),
    // Weekly cohorts by local sign-up week (the latest 26 in the range) and how many of each were active 0..7 weeks later.
    db.query<{week:string;size:number;elapsed:number;weeks:Record<string,number>}>(`WITH cohort AS (SELECT id,date_trunc('week',created_at AT TIME ZONE $3::text) AS week FROM r.users WHERE created_at>=$1 AND created_at<$2),
      sizes AS (SELECT week,count(*)::int AS size FROM cohort GROUP BY week ORDER BY week DESC LIMIT 26),
      weekly AS (SELECT c.week,round(EXTRACT(EPOCH FROM date_trunc('week',e.created_at AT TIME ZONE $3::text)-c.week)/604800)::int AS n,count(DISTINCT c.id)::int AS users
        FROM cohort c JOIN sizes s ON s.week=c.week JOIN r.activity_events e ON e.user_id=c.id AND e.created_at>=c.week AT TIME ZONE $3::text AND e.created_at<(c.week+interval '8 weeks') AT TIME ZONE $3::text GROUP BY 1,2)
      SELECT to_char(s.week,'YYYY-MM-DD"T"HH24:MI') AS week,s.size,round(EXTRACT(EPOCH FROM date_trunc('week',now() AT TIME ZONE $3::text)-s.week)/604800)::int AS elapsed,
        COALESCE(json_object_agg(w.n,w.users) FILTER (WHERE w.n IS NOT NULL),'{}'::json) AS weeks
      FROM sizes s LEFT JOIN weekly w ON w.week=s.week GROUP BY s.week,s.size ORDER BY s.week`,window),
  ]);
  const counts=spread(labels,registrations,row=>row.n);
  let running=before.n;
  return {
    view:'users',range,generatedAt:generatedAt(),labels,newUsers:sum(counts),registrations:counts,cumulative:counts.map(value=>running+=value),
    dau:spread(labels,active,row=>row.dau),wau:spread(labels,active,row=>row.wau),mau:spread(labels,active,row=>row.mau),
    newActive:spread(labels,split,row=>row.new_users),returningActive:spread(labels,split,row=>row.returning_users),
    cohorts:cohorts.map(row=>({week:row.week,size:row.size,values:Array.from({length:8},(_,n)=>n>row.elapsed?null:Math.round((Number(row.weeks[n])||0)/row.size*1000)/10)})),
  };
}

const ACTIVITY_SERIES=[['page_views','Page views','PAGE_VIEW'],['project_views','Project views','PROJECT_VIEW'],['shares','Shares','PROJECT_SHARE'],['downloads','Downloads','PROJECT_DOWNLOAD'],['logins','Logins','LOGIN'],['searches','Searches','SEARCH']] as const;
async function activityView(range:TimeRange):Promise<ActivityAnalytics> {
  const window=[range.from,range.to,range.timeZone];
  const [labels,events,prompts,pages]=await Promise.all([
    bucketLabels(range),
    db.query<Record<string,number>&{label:string}>(`SELECT ${bucketSql(range,'created_at','$3')} AS label,${ACTIVITY_SERIES.map(([key,,type])=>`${countIf(`event_type='${type}'`)} AS ${key}`).join(',')}
      FROM r.activity_events WHERE created_at>=$1 AND created_at<$2 AND event_type IN (${ACTIVITY_SERIES.map(([,,type])=>`'${type}'`).join(',')}) GROUP BY 1`,window),
    db.query<{label:string;n:number}>(`SELECT ${bucketSql(range,'created_at','$3')} AS label,count(*)::int AS n FROM r.ai_requests WHERE created_at>=$1 AND created_at<$2 GROUP BY 1`,window),
    db.query<{page:string;views:number}>(`SELECT page,count(*)::int AS views FROM r.activity_events WHERE event_type='PAGE_VIEW' AND page<>'' AND created_at>=$1 AND created_at<$2 GROUP BY page ORDER BY views DESC,page LIMIT 10`,[range.from,range.to]),
  ]);
  return {
    view:'activity',range,generatedAt:generatedAt(),labels,
    series:[...ACTIVITY_SERIES.map(([key,label])=>({key,label,values:spread(labels,events,row=>row[key])})),{key:'prompts',label:'Prompt usage',values:spread(labels,prompts,row=>row.n)}],
    topPages:pages.map(row=>({page:cleanText(row.page,300),views:row.views})),
  };
}

async function visitorsView(range:TimeRange):Promise<VisitorsAnalytics> {
  // Unique visitors merge a browser's anonymous visits into the account that later signed in on it (r.visitors.user_id).
  const merged="COALESCE('u'||COALESCE(e.user_id,v.user_id)::text,'v'||e.visitor_id::text,'s'||e.session_id::text)";
  const anonymousKey="COALESCE('v'||e.visitor_id::text,'s'||e.session_id::text)";
  const [labels,[totals],buckets]=await Promise.all([
    bucketLabels(range),
    db.query<VisitorsAnalytics['totals']>(`SELECT count(DISTINCT ${visitKey('e')})::int AS total,count(DISTINCT ${merged})::int AS "unique",
        (count(DISTINCT ${merged}) FILTER (WHERE COALESCE(u.created_at,v.first_seen_at)<$1))::int AS returning,count(DISTINCT e.user_id)::int AS authenticated,
        (count(DISTINCT ${anonymousKey}) FILTER (WHERE e.user_id IS NULL))::int AS anonymous
      FROM r.activity_events e LEFT JOIN r.visitors v ON v.id=e.visitor_id LEFT JOIN r.users u ON u.id=COALESCE(e.user_id,v.user_id)
      WHERE e.created_at>=$1 AND e.created_at<$2`,[range.from,range.to]),
    db.query<{label:string;authenticated:number;anonymous:number}>(`SELECT ${bucketSql(range,'e.created_at','$3')} AS label,count(DISTINCT e.user_id)::int AS authenticated,
        (count(DISTINCT ${anonymousKey}) FILTER (WHERE e.user_id IS NULL))::int AS anonymous
      FROM r.activity_events e WHERE e.created_at>=$1 AND e.created_at<$2 GROUP BY 1`,[range.from,range.to,range.timeZone]),
  ]);
  return {view:'visitors',range,generatedAt:generatedAt(),labels,totals,authenticated:spread(labels,buckets,row=>row.authenticated),anonymous:spread(labels,buckets,row=>row.anonymous)};
}

// One person per account (an anonymous browser linked to an account counts as that account), else per visitor cookie, else per session.
const SESSION_PERSON="COALESCE('u'||COALESCE(s.user_id,v.user_id)::text,'v'||s.visitor_id::text,'s'||s.id::text)";
async function devicesView(range:TimeRange):Promise<DevicesAnalytics> {
  const osNames=OS_FAMILIES.filter(name=>name!=='Other'),browserNames=BROWSER_FAMILIES.filter(name=>name!=='Other');
  const [labels,rows,buckets]=await Promise.all([
    bucketLabels(range),
    db.query<{dimension:string;value:string;people:number}>(`WITH active AS (SELECT ${SESSION_PERSON} AS person,s.device_type,
        CASE WHEN s.os=ANY($3::text[]) THEN s.os ELSE 'Other' END AS os,CASE WHEN s.browser=ANY($4::text[]) THEN s.browser ELSE 'Other' END AS browser
        FROM r.tracked_sessions s LEFT JOIN r.visitors v ON v.id=s.visitor_id WHERE s.last_seen_at>=$1 AND s.started_at<$2)
      SELECT 'device' AS dimension,device_type AS value,count(DISTINCT person)::int AS people FROM active GROUP BY device_type
      UNION ALL SELECT 'os',os,count(DISTINCT person)::int FROM active GROUP BY os
      UNION ALL SELECT 'browser',browser,count(DISTINCT person)::int FROM active GROUP BY browser
      UNION ALL SELECT 'all','',count(DISTINCT person)::int FROM active`,[range.from,range.to,osNames,browserNames]),
    db.query<{label:string;desktop:number;mobile:number;tablet:number}>(`WITH ${bucketsCte(range,'$1','$2','$3')},
      active AS (SELECT ${SESSION_PERSON} AS person,s.device_type,s.started_at,s.last_seen_at FROM r.tracked_sessions s LEFT JOIN r.visitors v ON v.id=s.visitor_id
        WHERE s.last_seen_at>=$1 AND s.started_at<$2 AND s.device_type IN ('desktop','mobile','tablet'))
      SELECT b.label,${['desktop','mobile','tablet'].map(type=>`(count(DISTINCT a.person) FILTER (WHERE a.device_type='${type}'))::int AS ${type}`).join(',')}
      FROM buckets b JOIN active a ON a.last_seen_at>=b.starts AND a.started_at<b.ends GROUP BY b.label`,[range.from,range.to,range.timeZone]),
  ]);
  const count=(dimension:string,value:string)=>rows.find(row=>row.dimension===dimension&&row.value===value)?.people??0;
  const devices=Object.entries(DEVICE_TYPES).map(([key,label])=>({key,label,value:count('device',key)}));
  const os=OS_FAMILIES.map(name=>({key:name,label:name,value:count('os',name)})),browsers=BROWSER_FAMILIES.map(name=>({key:name,label:name,value:count('browser',name)}));
  return {
    view:'devices',range,generatedAt:generatedAt(),labels,people:count('all',''),devices,os,browsers,
    mostCommon:{device:leader(devices,['bot','unknown']),os:leader(os,['Other']),browser:leader(browsers,['Other'])},
    overTime:(['desktop','mobile','tablet'] as const).map(key=>({key,label:DEVICE_TYPES[key],values:spread(labels,buckets,row=>row[key])})),
  };
}

async function projectsView(range:TimeRange):Promise<ProjectsAnalytics> {
  const [labels,created,[total],ranked,active,taxonomy]=await Promise.all([
    bucketLabels(range),
    db.query<{label:string;n:number}>(`SELECT ${bucketSql(range,'created_at','$3')} AS label,count(*)::int AS n FROM r.projects WHERE created_at>=$1 AND created_at<$2 GROUP BY 1`,[range.from,range.to,range.timeZone]),
    db.query<{n:number}>('SELECT count(*)::int AS n FROM r.projects'),
    db.query<{event_type:string;project_id:string;n:number;views:number;downloads:number;title:string|null}>(`WITH counts AS (SELECT event_type,project_id,count(*)::int AS n FROM r.activity_events
        WHERE event_type IN ('PROJECT_VIEW','PROJECT_SHARE','PROJECT_DOWNLOAD') AND project_id IS NOT NULL AND created_at>=$1 AND created_at<$2 GROUP BY 1,2),
      ranked AS (SELECT event_type,project_id,n,row_number() OVER (PARTITION BY event_type ORDER BY n DESC,project_id) AS position FROM counts)
      SELECT k.event_type,k.project_id,k.n,p.views,p.downloads,pv.title FROM ranked k JOIN r.projects p ON p.id=k.project_id ${TITLE_JOIN('k.project_id')}
      WHERE k.position<=10 ORDER BY k.event_type,k.position`,[range.from,range.to]),
    db.query<{user_id:string;name:string;role:string;events:number;projects:number;prompts:number;total:number}>(`WITH totals AS (
        SELECT user_id,count(*)::int AS events,0 AS projects,0 AS prompts FROM r.activity_events WHERE user_id IS NOT NULL AND created_at>=$1 AND created_at<$2 GROUP BY user_id
        UNION ALL SELECT owner_id,0,count(*)::int,0 FROM r.projects WHERE created_at>=$1 AND created_at<$2 GROUP BY owner_id
        UNION ALL SELECT user_id,0,0,count(*)::int FROM r.ai_requests WHERE created_at>=$1 AND created_at<$2 GROUP BY user_id)
      SELECT t.user_id,u.name,u.role,sum(t.events)::int AS events,sum(t.projects)::int AS projects,sum(t.prompts)::int AS prompts,(sum(t.events)+sum(t.projects)+sum(t.prompts))::int AS total
      FROM totals t JOIN r.users u ON u.id=t.user_id GROUP BY t.user_id,u.name,u.role ORDER BY total DESC,u.name LIMIT 10`,[range.from,range.to]),
    // Each project's latest version describes it now; archived projects are left out.
    db.query<{kind:string;value:string;n:number}>(`WITH latest AS (SELECT DISTINCT ON (v.project_id) v.data FROM r.versions v JOIN r.projects p ON p.id=v.project_id WHERE NOT p.archived ORDER BY v.project_id,v.number DESC),
      counted AS (SELECT 'department' AS kind,data->>'department' AS value,count(*)::int AS n FROM latest WHERE COALESCE(data->>'department','')<>'' GROUP BY 2
        UNION ALL SELECT 'subject',data->>'subject',count(*)::int FROM latest WHERE COALESCE(data->>'subject','')<>'' GROUP BY 2
        UNION ALL SELECT 'tag',tag,count(*)::int FROM latest,jsonb_array_elements_text(CASE WHEN jsonb_typeof(data->'tags')='array' THEN data->'tags' ELSE '[]'::jsonb END) AS tag WHERE tag<>'' GROUP BY 2)
      SELECT kind,value,n FROM (SELECT kind,value,n,row_number() OVER (PARTITION BY kind ORDER BY n DESC,value) AS position FROM counted) x WHERE position<=10 ORDER BY kind,position`),
  ]);
  const top=(type:string,allTime:'views'|'downloads'|null)=>ranked.filter(row=>row.event_type===type).map(row=>({project:project(row.project_id,row.title),count:row.n,allTime:allTime?Number(row[allTime]):null}));
  const names=(kind:string)=>taxonomy.filter(row=>row.kind===kind).map(row=>{const label=cleanText(row.value,120);return {key:label,label,value:row.n};});
  const counts=spread(labels,created,row=>row.n);
  return {
    view:'projects',range,generatedAt:generatedAt(),labels,created:counts,createdInRange:sum(counts),totalProjects:total.n,
    mostViewed:top('PROJECT_VIEW','views'),mostShared:top('PROJECT_SHARE',null),mostDownloaded:top('PROJECT_DOWNLOAD','downloads'),
    activeUsers:active.map(row=>({user:person(row.user_id,row.name,row.role),events:row.events,projects:row.projects,prompts:row.prompts,total:row.total})),
    departments:names('department'),subjects:names('subject'),tags:names('tag'),
  };
}

// Chart order for prompt outcomes; a color follows its outcome on every AI usage chart. In-progress prompts are counted separately.
const CHART_OUTCOMES=['success','failed','timeout','refused','rate_limited','cancelled'] as const;
type AiTotals={today:number;yesterday:number;week:number;prior_week:number;month:number;prior_month:number;success_current:number;success_previous:number;
  failed_current:number;failed_previous:number;pending:number;avg_current:number|null;avg_previous:number|null};
async function aiView(range:TimeRange,search:URLSearchParams):Promise<AiAnalytics> {
  const today=todaySql('$4'),yesterday=yesterdaySql('$4');
  const current='created_at>=$1 AND created_at<$2',previous='created_at>=$3 AND created_at<$1';
  const [labels,[totals],buckets,ranks]=await Promise.all([
    bucketLabels(range),
    db.query<AiTotals>(`SELECT ${countIf(`created_at>=${today}`)} AS today,${countIf(`created_at>=${yesterday} AND created_at<${today}`)} AS yesterday,
        ${countIf("created_at>=now()-interval '7 days'")} AS week,${countIf("created_at>=now()-interval '14 days' AND created_at<now()-interval '7 days'")} AS prior_week,
        ${countIf("created_at>=now()-interval '30 days'")} AS month,${countIf("created_at>=now()-interval '60 days' AND created_at<now()-interval '30 days'")} AS prior_month,
        ${countIf(`outcome='success' AND ${current}`)} AS success_current,${countIf(`outcome='success' AND ${previous}`)} AS success_previous,
        ${countIf(`outcome IN ('failed','timeout') AND ${current}`)} AS failed_current,${countIf(`outcome IN ('failed','timeout') AND ${previous}`)} AS failed_previous,
        ${countIf(`outcome='pending' AND ${current}`)} AS pending,
        (avg(duration_ms) FILTER (WHERE outcome='success' AND duration_ms IS NOT NULL AND ${current}))::float8 AS avg_current,
        (avg(duration_ms) FILTER (WHERE outcome='success' AND duration_ms IS NOT NULL AND ${previous}))::float8 AS avg_previous
      FROM r.ai_requests WHERE created_at>=LEAST($3::timestamptz,now()-interval '60 days',${yesterday})`,[range.from,range.to,range.previousFrom,range.timeZone]),
    db.query<Record<string,number>&{label:string;avg_ms:number|null}>(`SELECT ${bucketSql(range,'created_at','$3')} AS label,${CHART_OUTCOMES.map(outcome=>`${countIf(`outcome='${outcome}'`)} AS ${outcome}`).join(',')},
        (avg(duration_ms) FILTER (WHERE outcome='success' AND duration_ms IS NOT NULL))::float8 AS avg_ms
      FROM r.ai_requests WHERE created_at>=$1 AND created_at<$2 GROUP BY 1`,[range.from,range.to,range.timeZone]),
    db.query<{kind:string;id:string;name:string|null;role:string;n:number}>(`SELECT 'feature' AS kind,feature AS id,feature AS name,'' AS role,count(*)::int AS n FROM r.ai_requests WHERE created_at>=$1 AND created_at<$2 GROUP BY feature
      UNION ALL (SELECT 'user',a.user_id::text,u.name,u.role,count(*)::int FROM r.ai_requests a JOIN r.users u ON u.id=a.user_id WHERE a.created_at>=$1 AND a.created_at<$2 GROUP BY a.user_id,u.name,u.role ORDER BY 5 DESC,3 LIMIT 10)
      UNION ALL (SELECT 'project',a.project_id::text,pv.title,'',count(*)::int FROM r.ai_requests a ${TITLE_JOIN('a.project_id')} WHERE a.project_id IS NOT NULL AND a.created_at>=$1 AND a.created_at<$2 GROUP BY a.project_id,pv.title ORDER BY 5 DESC,2 LIMIT 10)`,[range.from,range.to]),
  ]);
  const overTime=CHART_OUTCOMES.map(key=>({key,label:PROMPT_OUTCOMES[key],values:spread(labels,buckets,row=>row[key])}));
  const byFeature=ranks.filter(row=>row.kind==='feature').map(row=>({key:row.id,label:(AI_FEATURES as Record<string,string>)[row.id]??cleanText(row.id,60),value:row.n})).sort((a,b)=>b.value-a.value);
  const byUser=ranks.filter(row=>row.kind==='user').map(row=>({user:person(row.id,row.name,row.role),count:row.n}));
  const byProject=ranks.filter(row=>row.kind==='project').map(row=>({project:project(row.id,row.name),count:row.n}));
  const covered=Date.parse(range.previousFrom)>=Date.now()-AI_RETENTION_DAYS*86400000;
  const dates=new URLSearchParams({date:range.preset});
  if(range.preset==='custom'){dates.set('from',search.get('from')??'');dates.set('to',search.get('to')??'');}
  const logs=(extra:Record<string,string>)=>`/admin/logs/prompts?${new URLSearchParams({...extra,...Object.fromEntries(dates)})}`;
  const totalsPerBucket=labels.map((_,index)=>sum(overTime.map(item=>item.values[index])));
  const failedTrend=labels.map((_,index)=>overTime[1].values[index]+overTime[2].values[index]);
  const averageMs=spread(labels,buckets,row=>row.avg_ms===null?0:Math.round(row.avg_ms));
  const card=(key:string,label:string,value:number,comparison:ReturnType<typeof compare>,trend:number[],href:string,format:StatCard['format']='number'):StatCard=>({key,label,value,format,...comparison,trend,href});
  const average=totals.avg_current===null?null:Math.round(totals.avg_current),topUser=byUser[0],topFeature=byFeature[0];
  const cards:StatCard[]=[
    card('prompts_today','Prompts today',totals.today,compare(totals.today,totals.yesterday),totalsPerBucket,'/admin/logs/prompts?date=today'),
    card('prompts_week','Prompts this week',totals.week,compare(totals.week,totals.prior_week),totalsPerBucket,'/admin/logs/prompts?date=7d'),
    card('prompts_month','Prompts this month',totals.month,compare(totals.month,totals.prior_month),totalsPerBucket,'/admin/logs/prompts?date=30d'),
    card('successful_prompts','Successful prompts',totals.success_current,compare(totals.success_current,totals.success_previous,covered),overTime[0].values,logs({status:'success'})),
    card('failed_prompts','Failed prompts',totals.failed_current,compare(totals.failed_current,totals.failed_previous,covered),failedTrend,logs({status:'failed'})),
    average===null
      ?{key:'average_response',label:'Average response time',value:0,format:'duration',current:null,previous:null,change:null,hint:'No completed prompts in this range',trend:averageMs,href:logs({status:'success'})}
      :card('average_response','Average response time',average,totals.avg_previous===null?compare(average,0,covered):compare(average,Math.round(totals.avg_previous),covered),averageMs,logs({status:'success'}),'duration'),
    {key:'top_prompt_user',label:'Most active prompt user',value:topUser?.count??0,format:'number',current:topUser?.count??0,previous:null,change:null,hint:topUser?`${topUser.user.name} · prompts in this range`:'No prompts in this range',trend:[],href:topUser?`/admin/users/${topUser.user.id}`:logs({})},
    {key:'top_feature',label:'Most used AI feature',value:topFeature?.value??0,format:'number',current:topFeature?.value??0,previous:null,change:null,hint:topFeature?topFeature.label:'No prompts in this range',trend:[],href:topFeature?logs({feature:topFeature.key}):logs({})},
  ];
  return {
    view:'ai',range,generatedAt:generatedAt(),labels,cards,
    outcomes:[...overTime.map(item=>({key:item.key,label:item.label,value:sum(item.values)})),{key:'pending',label:PROMPT_OUTCOMES.pending,value:totals.pending}],
    overTime,averageMs,byFeature,byUser,byProject,
  };
}

const VIEWS={users:usersView,activity:activityView,visitors:visitorsView,devices:devicesView,projects:projectsView,ai:aiView} satisfies Record<string,(range:TimeRange,search:URLSearchParams)=>Promise<AnalyticsResponse>>;
export async function analyticsRoute({user,method,path,search}:AdminContext):Promise<Response> {
  const view=search.get('view')||'users';
  requirePermission(user,view==='ai'?'prompts':'analytics');
  if(method!=='GET'||path.length>1)throw new HttpError(404,'Endpoint not found.');
  requireCondition(Object.hasOwn(VIEWS,view),400,'Unknown analytics view.');
  const range=await timeRange(search,'7d');
  return json(await VIEWS[view as keyof typeof VIEWS](range,search));
}
