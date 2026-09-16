import { db, schemaName, transaction } from '../db';
import { audit, rateLimit } from '../auth';
import { HttpError, requireCondition } from '../errors';
import { bodyJson, json } from '../http';
import { geminiKeys, geminiModel } from '../gemini';
import { AI_RETENTION_DAYS, aiSettings } from '../ai-usage';
import { deliveryMode } from '../mail';
import { emailVerificationRequired } from '../policy';
import { pruneTrackingData, recordEvent } from '../tracking';
import { presenceTimeoutSeconds, retentionSchema, retentionSettings, trustedProxyHops, type RetentionSettings } from '../tracking/config';
import { requirePermission } from './permissions';
import { validTimeZone } from './query';
import type { AdminContext } from './router';

// System health for Admin › System health: GET /api/admin/system (permission `system`), and for Super Admins only
// PATCH /api/admin/system/retention and POST /api/admin/system/prune. The response carries counts, sizes and
// on/off facts about the configuration, never a secret, key, connection string or other environment value.

export type SystemError={id:string;method:string;path:string;status:number;name:string;message:string;createdAt:string};
export type SystemHealth={
  generatedAt:string;
  database:{ok:boolean;latencyMs:number;sizeBytes:number|null;tables:{name:string;rows:number;totalBytes:number}[]};
  storage:{files:number;bytes:number};
  api:{last24h:{requests:number;clientErrors:number;serverErrors:number};timeZone:string;labels:string[];requests:number[];errors:number[];clientErrors:number[];serverErrors:number[]};
  errors:SystemError[];
  sessions:{active:number;online:number};
  tracking:{retention:RetentionSettings;oldest:{activity:string|null;sessions:string|null;apiUsage:string|null;errors:string|null}};
  mail:{pendingOutbox:number};
  ai:{configured:boolean;model:string;enabled:boolean;promptRetentionDays:number};
  runtime:{uptimeSeconds:number;nodeVersion:string;platform:string;memory:{rss:number;heapUsed:number}};
  config:{trustedProxyHops:number;presenceTimeoutSeconds:number;emailVerificationRequired:boolean;appOriginHttps:boolean;mailMode:string};
};

const iso=(value:Date|string|null)=>value?new Date(value).toISOString():null;
// Error messages come from exceptions, which can quote a connection string. Known secret values and URL credentials are masked.
const SECRET_SETTINGS=['DATABASE_URL','TARGET_DATABASE_URL','DATA_ENCRYPTION_KEY','GEMINI_API_KEY','SMTP_PASSWORD','AZURE_COMMUNICATION_CONNECTION_STRING','DOWNLOAD_SECRET'];
function scrub(text:string) {
  const secrets=[...SECRET_SETTINGS.map(name=>process.env[name]?.trim()),...(process.env.GEMINI_API_KEYS||'').split(/[\s,]+/)].filter((value):value is string=>!!value&&value.length>=8);
  let clean=text;for(const secret of secrets)clean=clean.replaceAll(secret,'[redacted]');
  return clean.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi,'$1[redacted]@');
}
async function databaseSize() {
  // Managed hosts may refuse pg_database_size to the application role; the page then shows the table sizes alone.
  try {const [row]=await db.query<{size:string}>('SELECT pg_database_size(current_database())::text AS size');return Number(row.size);} catch {return null;}
}

async function health(search:URLSearchParams):Promise<SystemHealth> {
  const requestedZone=search.get('tz')||'UTC';
  const timeZone=await validTimeZone(requestedZone)?requestedZone:'UTC';
  const started=performance.now();await db.query('SELECT 1');const latencyMs=Math.round((performance.now()-started)*10)/10;
  const [[stats],series,tables]=await Promise.all([
    db.query(`SELECT (SELECT count(*)::int FROM r.files) AS files,(SELECT COALESCE(sum(size),0)::text FROM r.files) AS bytes,
      (SELECT count(*)::int FROM r.sessions WHERE expires_at>now()) AS active,
      (SELECT count(*)::int FROM r.tracked_sessions WHERE ended_at IS NULL AND last_seen_at>now()-$1::int*interval '1 second') AS online,
      (SELECT min(created_at) FROM r.activity_events) AS oldest_activity,(SELECT min(started_at) FROM r.tracked_sessions) AS oldest_session,
      (SELECT min(bucket) FROM r.api_usage) AS oldest_usage,(SELECT min(created_at) FROM r.error_log) AS oldest_error,
      (SELECT count(*)::int FROM r.outbox WHERE status='pending') AS pending_outbox,
      (SELECT COALESCE(sum(requests),0)::int FROM r.api_usage WHERE bucket>=now()-interval '24 hours') AS requests,
      (SELECT COALESCE(sum(client_errors),0)::int FROM r.api_usage WHERE bucket>=now()-interval '24 hours') AS client_errors,
      (SELECT COALESCE(sum(server_errors),0)::int FROM r.api_usage WHERE bucket>=now()-interval '24 hours') AS server_errors`,[presenceTimeoutSeconds()]),
    // 24 local hours ending with the current one, zero-filled, labelled like bucketLabels() in lib/admin/query.ts.
    db.query<{label:string;requests:number;client_errors:number;server_errors:number}>(`WITH hours AS (SELECT generate_series(date_trunc('hour',now() AT TIME ZONE $1::text)-interval '23 hours',date_trunc('hour',now() AT TIME ZONE $1::text),interval '1 hour') AS local_hour)
      SELECT to_char(h.local_hour,'YYYY-MM-DD"T"HH24:MI') AS label,COALESCE(sum(u.requests),0)::int AS requests,COALESCE(sum(u.client_errors),0)::int AS client_errors,COALESCE(sum(u.server_errors),0)::int AS server_errors
      FROM hours h LEFT JOIN r.api_usage u ON u.bucket>=now()-interval '25 hours' AND date_trunc('hour',u.bucket AT TIME ZONE $1::text)=h.local_hour
      GROUP BY h.local_hour ORDER BY h.local_hour`,[timeZone]),
    db.query<{name:string;rows:string;total_bytes:string}>(`SELECT c.relname AS name,GREATEST(c.reltuples,0)::bigint::text AS rows,pg_total_relation_size(c.oid)::text AS total_bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p') ORDER BY pg_total_relation_size(c.oid) DESC`,[schemaName()]),
  ]);
  const [errors,sizeBytes,retention,ai]=await Promise.all([
    db.query<{id:string;method:string;path:string;status:number;name:string;message:string;created_at:Date}>('SELECT id,method,path,status,name,message,created_at FROM r.error_log ORDER BY created_at DESC LIMIT 25'),
    databaseSize(),retentionSettings(),aiSettings(),
  ]);
  const memory=process.memoryUsage();
  return {
    generatedAt:new Date().toISOString(),
    database:{ok:true,latencyMs,sizeBytes,tables:tables.map(row=>({name:row.name,rows:Number(row.rows),totalBytes:Number(row.total_bytes)}))},
    storage:{files:stats.files,bytes:Number(stats.bytes)},
    api:{
      last24h:{requests:stats.requests,clientErrors:stats.client_errors,serverErrors:stats.server_errors},timeZone,
      labels:series.map(row=>row.label),requests:series.map(row=>row.requests),errors:series.map(row=>row.client_errors+row.server_errors),
      clientErrors:series.map(row=>row.client_errors),serverErrors:series.map(row=>row.server_errors),
    },
    errors:errors.map(row=>({id:row.id,method:row.method,path:scrub(row.path),status:row.status,name:scrub(row.name),message:scrub(row.message),createdAt:row.created_at.toISOString()})),
    sessions:{active:stats.active,online:stats.online},
    tracking:{retention,oldest:{activity:iso(stats.oldest_activity),sessions:iso(stats.oldest_session),apiUsage:iso(stats.oldest_usage),errors:iso(stats.oldest_error)}},
    mail:{pendingOutbox:stats.pending_outbox},
    ai:{configured:geminiKeys().length>0,model:geminiModel(),enabled:ai.enabled,promptRetentionDays:AI_RETENTION_DAYS},
    runtime:{uptimeSeconds:Math.round(process.uptime()),nodeVersion:process.version,platform:process.platform,memory:{rss:memory.rss,heapUsed:memory.heapUsed}},
    config:{trustedProxyHops:trustedProxyHops(),presenceTimeoutSeconds:presenceTimeoutSeconds(),emailVerificationRequired:emailVerificationRequired(),appOriginHttps:(process.env.APP_ORIGIN||'').startsWith('https://'),mailMode:deliveryMode()??'outbox'},
  };
}

export async function systemRoute({request,user,method,path,search}:AdminContext):Promise<Response> {
  requirePermission(user,'system');
  const [,action,extra]=path;
  if(!action&&method==='GET')return json(await health(search));
  if(action==='retention'&&!extra&&method==='PATCH') {
    requireCondition(user.role==='superadmin',403,'Only Super Admins can change data retention.');
    const values=retentionSchema.parse(await bodyJson(request));
    await transaction(async client=>{
      await client.query("INSERT INTO r.settings(key,value) VALUES('retention',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[JSON.stringify(values)]);
      await audit(client,user.id,'retention.updated','retention',values);
    });
    await recordEvent({type:'ADMIN_ACTION',request,userId:user.id,metadata:{action:'retention.updated',...values}});
    return json({retention:values});
  }
  if(action==='prune'&&!extra&&method==='POST') {
    requireCondition(user.role==='superadmin',403,'Only Super Admins can run a data cleanup.');
    await rateLimit(`tracking-prune:${user.id}`,20,3600);
    const counts=await pruneTrackingData();
    await audit(db,user.id,'tracking.pruned','tracking',counts);
    await recordEvent({type:'ADMIN_ACTION',request,userId:user.id,metadata:{action:'tracking.pruned',...counts}});
    return json(counts);
  }
  throw new HttpError(404,'Endpoint not found.');
}
