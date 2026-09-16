'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Notice, send, useSession } from '../shared';
import { hasPermission } from '@/lib/admin/permissions';
import type { SystemError, SystemHealth } from '@/lib/admin/system';
import type { PruneResult } from '@/lib/tracking';
import type { RetentionSettings } from '@/lib/tracking/config';
import { AdminPage } from './AdminFrame';
import { Badge, DataTable, DetailList, Section, adminQuery, useAdminData, useNow, type Column } from './kit';
import { BarList, TimeSeriesChart } from './charts';
import { formatBytes, formatDateTime, formatDuration, formatNumber, formatPercent, timeAgo } from './format';
import './admin-system.css';

// Admin › System health: whether the database, the API and the server configuration are in order, and how long tracked
// data is kept (editable by Super Admins). Everything comes from GET /api/admin/system, refreshed every 30 seconds.

type Tone='neutral'|'good'|'warn'|'bad'|'info';
const RETENTION_FIELDS:{key:keyof RetentionSettings;label:string;min:number;max:number;hint:string}[]=[
  {key:'activityDays',label:'Activity logs',min:7,max:730,hint:'Page views, searches, project, community, file and prompt events.'},
  {key:'sessionDays',label:'Session data',min:1,max:365,hint:'Ended sessions with their device details, and anonymous visitor records.'},
  {key:'securityDays',label:'Security logs',min:30,max:730,hint:'Failed logins, rate limits, denied admin requests and ended sessions.'},
];
const ERROR_COLUMNS:Column<SystemError>[]=[
  {key:'time',label:'Time',render:row=><time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>},
  {key:'method',label:'Method',render:row=><code>{row.method}</code>},
  {key:'path',label:'Path',render:row=><code>{row.path}</code>},
  {key:'status',label:'Status',render:row=><Badge tone="bad">{row.status}</Badge>},
  {key:'error',label:'Error',render:row=><span>{row.name||'Error'}{row.message&&<span className="muted"> — {row.message}</span>}</span>},
];

/** Settings that weaken tracking, security or delivery, in the words an operator needs to fix them. */
function warningsFor(data:SystemHealth) {
  const warnings:string[]=[];
  if(data.config.trustedProxyHops===0)warnings.push('TRUSTED_PROXY_HOPS=0: Client IP addresses can be spoofed unless a reverse proxy sets X-Forwarded-For — put nginx/Caddy in front and set TRUSTED_PROXY_HOPS=1.');
  if(!data.config.appOriginHttps)warnings.push('APP_ORIGIN is not an https:// address, so session cookies are not marked Secure. Serve the site over HTTPS and set APP_ORIGIN to that address.');
  if(!data.ai.configured)warnings.push('Gemini is not configured, so the project draft assistant is unavailable. Set GEMINI_API_KEY and restart to turn it on.');
  if(data.config.mailMode==='outbox')warnings.push(`MAIL_MODE=outbox: emails are stored but never sent (${formatNumber(data.mail.pendingOutbox)} waiting), so nobody can reset their own password. Configure SMTP or Azure delivery.`);
  return warnings;
}

function StatusCard({label,value,detail,tone,status}:{label:string;value:ReactNode;detail:ReactNode;tone:Tone;status:string}) {
  return <li><div className="panel admin-system-card"><div className="admin-system-card-head"><span className="admin-system-card-label">{label}</span><Badge tone={tone}>{status}</Badge></div><strong className="admin-system-card-value">{value}</strong><span className="admin-system-card-detail">{detail}</span></div></li>;
}

function Content() {
  const {user}=useSession();
  const [query]=useState(()=>adminQuery({}));
  const {data,error,loading,reload}=useAdminData<SystemHealth>(`admin/system?${query}`,{pollMs:30000});
  const now=useNow(15000);
  if(!data)return error?<Notice error>{error}</Notice>:<p className="muted" role="status">Checking the system…</p>;
  const {database,api,sessions,config,runtime}=data,traffic=api.last24h;
  const errorRate=traffic.requests?traffic.serverErrors/traffic.requests*100:null;
  const databaseTone:Tone=!database.ok||database.latencyMs>500?'bad':database.latencyMs>100?'warn':'good';
  const rateTone:Tone=errorRate===null?'neutral':errorRate<1?'good':errorRate<5?'warn':'bad';
  const warnings=warningsFor(data);
  return <>
    <div className="admin-toolbar"><span aria-live="polite">Updated {timeAgo(data.generatedAt,now)} · refreshes every 30 seconds</span><button type="button" className="button outline" disabled={loading} onClick={reload}><RefreshCw size={14} aria-hidden="true"/> Refresh</button></div>
    {error&&<Notice error>{error}</Notice>}
    <ul className="admin-system-cards" aria-label="System status">
      <StatusCard label="Database" value={database.ok?`${formatNumber(database.latencyMs)} ms`:'Unavailable'} tone={databaseTone} status={!database.ok?'Down':databaseTone==='good'?'Healthy':'Slow'} detail={`Query round trip · ${database.sizeBytes===null?'total size not available on this host':`${formatBytes(database.sizeBytes)} in total`}`}/>
      <StatusCard label="API error rate · 24 h" value={formatPercent(errorRate)} tone={rateTone} status={errorRate===null?'No traffic':rateTone==='good'?'Healthy':rateTone==='warn'?'Elevated':'High'} detail={`${formatNumber(traffic.serverErrors)} server errors in ${formatNumber(traffic.requests)} requests · ${formatNumber(traffic.clientErrors)} client errors`}/>
      <StatusCard label="Storage used" value={formatBytes(data.storage.bytes)} tone="info" status="Uploads" detail={`${formatNumber(data.storage.files)} files stored in the database`}/>
      <StatusCard label="Active sessions" value={formatNumber(sessions.active)} tone={sessions.online?'good':'neutral'} status={sessions.online?`${formatNumber(sessions.online)} online`:'Nobody online'} detail={`Unexpired sign-ins · online means seen in the last ${formatNumber(config.presenceTimeoutSeconds)} seconds`}/>
    </ul>
    <Section title="API traffic, last 24 hours" description={`Requests and error responses (4xx and 5xx) per hour, in your time zone (${api.timeZone}).`}>
      <TimeSeriesChart title="API requests and errors per hour, last 24 hours" labels={api.labels} bucket="hour" series={[{key:'requests',label:'Requests',values:api.requests},{key:'errors',label:'Errors (4xx and 5xx)',values:api.errors}]}/>
    </Section>
    <Section title="Recent server errors" description="The latest 25 responses with a 5xx status. Request bodies and query strings are never recorded." actions={hasPermission(user,'security')?<Link className="text-button" href="/admin/logs/security?source=errors">Full error log</Link>:undefined}>
      <div className="admin-system-errors"><DataTable caption="Recent server errors" columns={ERROR_COLUMNS} rows={data.errors} rowKey={row=>row.id} empty="No server errors recorded."/></div>
    </Section>
    <div className="admin-grid-2">
      <Section title="Database tables" description={`${database.sizeBytes===null?'The total database size is not available to this account.':`${formatBytes(database.sizeBytes)} in total.`} Largest tables including their indexes; row counts are estimates.`}>
        <BarList label="Database tables by size" items={database.tables.slice(0,12).map(table=>({key:table.name,label:table.name,value:table.totalBytes,detail:`about ${formatNumber(table.rows)} rows`}))} format={formatBytes} empty="No tables found."/>
      </Section>
      <Section title="Runtime and configuration" description="Read from the running server. Change these in the environment file, then restart.">
        {warnings.length?<ul className="admin-system-warnings" aria-label="Configuration warnings">{warnings.map(warning=><li key={warning}><AlertTriangle size={15} aria-hidden="true"/><span>{warning}</span></li>)}</ul>:<p className="admin-system-ok"><CheckCircle2 size={16} aria-hidden="true"/> No configuration warnings.</p>}
        <DetailList items={[
          ['Node.js',`${runtime.nodeVersion} on ${runtime.platform}`],
          ['Uptime',formatDuration(runtime.uptimeSeconds*1000)],
          ['Memory',`${formatBytes(runtime.memory.rss)} resident · ${formatBytes(runtime.memory.heapUsed)} heap`],
          ['Trusted proxy hops',<code>TRUSTED_PROXY_HOPS={config.trustedProxyHops}</code>],
          ['Online window',`${formatNumber(config.presenceTimeoutSeconds)} seconds`],
          ['App origin',config.appOriginHttps?'HTTPS':'Not HTTPS'],
          ['Email verification',config.emailVerificationRequired?'Required':'Not required'],
          ['Mail delivery',`${config.mailMode} · ${formatNumber(data.mail.pendingOutbox)} waiting in the outbox`],
          ['Gemini assistant',data.ai.configured?`${data.ai.enabled?'On':'Switched off in Settings'} · ${data.ai.model}`:'Not configured'],
        ]}/>
      </Section>
    </div>
    <RetentionSection data={data} canEdit={user?.role==='superadmin'} onChanged={reload}/>
  </>;
}

function RetentionSection({data,canEdit,onChanged}:{data:SystemHealth;canEdit:boolean;onChanged:()=>void}) {
  const saved=data.tracking.retention,oldest=data.tracking.oldest;
  // Edits stay in a draft, so the 30-second refresh never overwrites a number being typed.
  const [draft,setDraft]=useState<Partial<Record<keyof RetentionSettings,string>>>({});
  const [busy,setBusy]=useState<''|'save'|'prune'>(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const value=(key:keyof RetentionSettings)=>draft[key]??String(saved[key]);
  async function run(kind:'save'|'prune',action:()=>Promise<string>){setBusy(kind);setError('');setNotice('');try{setNotice(await action());onChanged();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
  const save=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();void run('save',async()=>{await send('admin/system/retention',Object.fromEntries(RETENTION_FIELDS.map(field=>[field.key,Number(value(field.key))])),'PATCH');setDraft({});return 'Retention saved. Older data is removed at the next cleanup.';});};
  const prune=()=>{if(window.confirm('Delete tracked data older than the saved retention periods now? This cannot be undone.'))void run('prune',async()=>{const removed=await send<PruneResult>('admin/system/prune',{});return `Cleanup finished: removed ${formatNumber(removed.events)} activity events, ${formatNumber(removed.sessions)} sessions, ${formatNumber(removed.visitors)} visitor records, ${formatNumber(removed.apiUsage)} minutes of API traffic and ${formatNumber(removed.errors)} server errors.`;});};
  return <Section id="retention" title="Data retention" description={`How long tracked data is kept before the automatic cleanup removes it. Prompt logs are kept for ${formatNumber(data.ai.promptRetentionDays)} days.`}>
    {notice&&<Notice>{notice}</Notice>}{error&&<Notice error>{error}</Notice>}
    {canEdit?<form className="admin-retention-form" onSubmit={save}>
      <div className="admin-retention-fields">{RETENTION_FIELDS.map(field=><label key={field.key}>{field.label} (days)<input type="number" name={field.key} inputMode="numeric" min={field.min} max={field.max} step={1} required value={value(field.key)} onChange={event=>{const next=event.target.value;setDraft(current=>({...current,[field.key]:next}));}}/><small>{field.min} to {field.max} days. {field.hint}</small></label>)}</div>
      <div className="admin-retention-actions"><button className="button blue" disabled={!!busy}>{busy==='save'?'Saving…':'Save retention'}</button><button type="button" className="button outline" disabled={!!busy} onClick={prune}>{busy==='prune'?'Cleaning up…':'Run cleanup now'}</button></div>
    </form>:<><DetailList items={RETENTION_FIELDS.map(field=>[field.label,`${formatNumber(saved[field.key])} days`] as [string,string])}/><p className="muted admin-retention-note">Only Super Admins can change retention or run a cleanup.</p></>}
    <h3 className="admin-retention-oldest">Oldest records kept</h3>
    <DetailList items={[['Activity events',formatDateTime(oldest.activity)],['Sessions',formatDateTime(oldest.sessions)],['API traffic',formatDateTime(oldest.apiUsage)],['Server errors',formatDateTime(oldest.errors)]]}/>
  </Section>;
}

export default function SystemHealthPage() {
  return <AdminPage section="system" title="System health" description="Database, API traffic, server errors, configuration and data retention."><Content/></AdminPage>;
}
