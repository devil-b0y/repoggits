'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Plus, RefreshCw } from 'lucide-react';
import { Notice, send } from '../shared';
import { HEALTH, PROVIDERS, ROLES, SSL_MODES, type Comparison, type DatabaseOverview, type DatabaseRecord, type Health, type IntegrityCheck, type Provider, type Role, type SslMode, type SwitchReport, type SwitchStep, type SyncReport, type TableDiff, type TableResult } from '@/lib/database/types';
import { AdminPage } from './AdminFrame';
import { Badge, DataTable, DetailList, FactGrid, Section, useAdminData, type Column } from './kit';
import { formatDateTime, formatDuration, formatNumber, timeAgo } from './format';
import './admin-database.css';

// Admin › Database manager (Super Admins only): which database the site is running on, which others are configured,
// and the actions that move it between them. Everything comes from /api/admin/database, which is also the only place
// a password is ever sent — it is written, never read back, so no field on this page can display one.

type Tone='neutral'|'good'|'warn'|'bad'|'info';
const healthTone=(health:Health):Tone=>health==='healthy'?'good':health==='degraded'?'warn':health==='unreachable'?'bad':'neutral';
const roleTone=(role:Role):Tone=>role==='active'?'good':role==='standby'?'info':role==='disabled'?'bad':'neutral';
/** A registry entry can exist before anyone has filled it in — a target named in the environment, say. */
const configured=(record:DatabaseRecord)=>!!record.host&&!!record.secretRef;
const target=(record:DatabaseRecord)=>configured(record)?`${PROVIDERS[record.provider]} · ${record.host}:${record.port}/${record.database}`:`${PROVIDERS[record.provider]} · not configured yet`;

const STEPS:Record<SwitchStep,string>={test:'Connection test',compare:'Compare schemas',schema:'Apply schema',sync:'Copy the data',freeze:'Pause writes',
  'final-sync':'Copy the last changes',verify:'Verify the copy',activate:'Point the site at it',unfreeze:'Resume writes',rollback:'Roll back'};
const DIFF_COLUMNS:Column<TableDiff>[]=[
  {key:'table',label:'Table',render:row=><code>{row.table}</code>},
  {key:'sourceRows',label:'Rows here',render:row=>formatNumber(row.sourceRows)},
  {key:'targetRows',label:'Rows there',render:row=>formatNumber(row.targetRows)},
  {key:'onlyInSource',label:'Columns only here',render:row=>row.onlyInSource.join(', ')||'—'},
  {key:'onlyInTarget',label:'Columns only there',render:row=>row.onlyInTarget.join(', ')||'—'},
  {key:'types',label:'Type mismatches',render:row=>row.typeMismatches.map(item=>`${item.column}: ${item.source} → ${item.target}`).join('; ')||'—'},
];
const SYNC_COLUMNS:Column<TableResult>[]=[
  {key:'table',label:'Table',render:row=><code>{row.table}</code>},
  {key:'copied',label:'Rows copied',render:row=>formatNumber(row.copied)},
  {key:'sourceRows',label:'Rows here',render:row=>formatNumber(row.sourceRows)},
  {key:'targetRows',label:'Rows there',render:row=>formatNumber(row.targetRows)},
  {key:'checksum',label:'Checksum',render:row=>row.checksumMatch==null?<span className="muted">Not checked</span>:<Badge tone={row.checksumMatch?'good':'bad'}>{row.checksumMatch?'Match':'Different'}</Badge>},
  {key:'error',label:'Error',render:row=>row.error?<span className="admin-database-error">{row.error}</span>:'—'},
];

/** The inline result of the last action, shown under the cards rather than in a dialog that hides the cards. */
type Outcome={id:string;name:string;title:string;message?:ReactNode;tone?:Tone;comparison?:Comparison;sync?:SyncReport;integrity?:IntegrityCheck;transfer?:SwitchReport};
type Confirmation={id:string;action:'switch'|'remove'|'disable'};

function Content() {
  const {data,error,loading,reload}=useAdminData<DatabaseOverview>('admin/database',{pollMs:30000});
  const [busy,setBusy]=useState('');
  const [failure,setFailure]=useState(''),[notice,setNotice]=useState('');
  const [outcome,setOutcome]=useState<Outcome|null>(null);
  const [confirming,setConfirming]=useState<Confirmation|null>(null);
  const [editing,setEditing]=useState<DatabaseRecord|null>(null);
  const [adding,setAdding]=useState(false);

  async function act<T>(id:string,action:string,payload:Record<string,unknown>,describe:(response:T)=>Outcome,method='POST') {
    setBusy(`${id}:${action}`);setFailure('');setNotice('');
    try {
      const response=await send<T>(action?`admin/database/${id}/${action}`:`admin/database/${id}`,payload,method);
      setOutcome(describe(response));setConfirming(null);reload();
    } catch(problem){setFailure((problem as Error).message);}
    finally{setBusy('');}
  }
  const test=(record:DatabaseRecord)=>act<{ok:boolean;latencyMs:number;serverVersion:string;error?:string}>(record.id,'test',{},response=>
    ({id:record.id,name:record.name,title:'Connection test',tone:response.ok?'good':'bad',message:response.ok?`Answered in ${formatNumber(Math.round(response.latencyMs))} ms · ${response.serverVersion}`:`Could not connect: ${response.error||'no answer'}`}));
  const schema=(record:DatabaseRecord)=>act<{tables:number;serverVersion:string}>(record.id,'schema',{},response=>
    ({id:record.id,name:record.name,title:'Schema',tone:'good',message:`Schema created or upgraded · ${formatNumber(response.tables)} tables present on ${response.serverVersion}.`}));
  const sync=(record:DatabaseRecord,mode:string)=>act<{report:SyncReport}>(record.id,'sync',{mode},response=>
    ({id:record.id,name:record.name,title:mode==='full'?'Full copy':'Incremental copy',tone:response.report.phase==='done'?'good':'bad',sync:response.report}));
  const compare=(record:DatabaseRecord)=>act<{comparison:Comparison}>(record.id,'compare',{},response=>({id:record.id,name:record.name,title:'Comparison',comparison:response.comparison}));
  const verify=(record:DatabaseRecord)=>act<{integrity:IntegrityCheck}>(record.id,'verify',{},response=>({id:record.id,name:record.name,title:'Integrity check',tone:response.integrity.passed?'good':'bad',integrity:response.integrity}));
  const switchOver=(record:DatabaseRecord)=>act<{report:SwitchReport}>(record.id,'switch',{},response=>({id:record.id,name:record.name,title:'Switch',tone:response.report.succeeded?'good':'bad',transfer:response.report}));
  const disable=(record:DatabaseRecord)=>act<unknown>(record.id,'disable',{},()=>({id:record.id,name:record.name,title:'Disabled',tone:'warn',message:`${record.name} will not be used. Its configuration and its data are left exactly as they are.`}));
  const remove=(record:DatabaseRecord)=>act<unknown>(record.id,'',{},()=>({id:record.id,name:record.name,title:'Removed',tone:'warn',message:`${record.name} is no longer configured. Nothing was dropped on that server — only this site's note of how to reach it.`}),'DELETE');

  if(!data)return error?<Notice error>{error}</Notice>:<p className="muted" role="status">Reading the database registry…</p>;
  const active=data.databases.find(record=>record.id===data.activeId)??null;
  const run=(record:DatabaseRecord,action:Confirmation['action'])=>action==='switch'?switchOver(record):action==='remove'?remove(record):disable(record);
  return <>
    <div className="admin-toolbar">
      <span aria-live="polite">{data.databases.length===1?'1 database':`${formatNumber(data.databases.length)} databases`} configured · read from {data.registrySource} · refreshes every 30 seconds</span>
      <span className="admin-database-toolbar-actions">
        <button type="button" className="button outline" disabled={loading} onClick={reload}><RefreshCw size={14} aria-hidden="true"/> Refresh</button>
        <button type="button" className="button blue" onClick={()=>{setAdding(true);setEditing(null);}}><Plus size={14} aria-hidden="true"/> Add database</button>
      </span>
    </div>
    {error&&<Notice error>{error}</Notice>}
    {failure&&<Notice error>{failure}</Notice>}
    {notice&&<Notice>{notice}</Notice>}
    {data.writesFrozen&&<Notice error>Writes are paused while a switch finishes. Nobody can save anything until it resumes.</Notice>}
    {active&&<div className="panel admin-database-banner" aria-label="Active database">
      <div>
        <span className="admin-database-eyebrow">Active database</span>
        <strong className="admin-database-name">{active.name}</strong>
        <span className="admin-database-target">{target(active)}</span>
      </div>
      <div className="admin-database-banner-facts">
        <Badge tone={healthTone(active.health)}>{HEALTH[active.health]}</Badge>
        <span>Last sync {active.lastSyncAt?timeAgo(active.lastSyncAt):'never'}</span>
        <span>Schema {active.schemaVersion==null?'not applied':`v${active.schemaVersion}`}</span>
      </div>
    </div>}

    {(adding||editing)&&<DatabaseForm record={editing} onCancel={()=>{setAdding(false);setEditing(null);}} onSaved={message=>{setAdding(false);setEditing(null);setOutcome(null);setFailure('');setNotice(message);reload();}}/>}

    <Section title="Configured databases" description="Every database this site knows how to reach. The active one serves the site; a standby holds the copy the last switch came from, so a switch can be undone.">
      <p className="admin-note">Switching migrates the data: every row is copied to the target, writes pause for the final pass, the counts and checksums are verified, and only then does the site start using it. The database you came from is never emptied, so a switch can be rolled back to it.</p>
      <ul className="admin-database-cards">
        {data.databases.map(record=><li key={record.id}>
          <DatabaseCard record={record} isActive={record.id===data.activeId} busy={busy}
            onTest={()=>test(record)} onSchema={()=>schema(record)} onSync={mode=>sync(record,mode)} onCompare={()=>compare(record)} onVerify={()=>verify(record)}
            onConfigure={()=>{setEditing(record);setAdding(false);}} onAsk={action=>{setFailure('');setConfirming({id:record.id,action});}}
            confirmation={confirming?.id===record.id?confirming.action:null} onCancel={()=>setConfirming(null)} onConfirm={action=>run(record,action)}/>
        </li>)}
      </ul>
      {data.databases.length===0&&<p className="muted">No databases are configured yet.</p>}
    </Section>

    {outcome&&<OutcomeSection outcome={outcome} onClose={()=>setOutcome(null)}/>}
  </>;
}

function DatabaseCard({record,isActive,busy,onTest,onSchema,onSync,onCompare,onVerify,onConfigure,onAsk,confirmation,onCancel,onConfirm}:{
  record:DatabaseRecord;isActive:boolean;busy:string;onTest:()=>void;onSchema:()=>void;onSync:(mode:string)=>void;onCompare:()=>void;onVerify:()=>void;
  onConfigure:()=>void;onAsk:(action:Confirmation['action'])=>void;confirmation:Confirmation['action']|null;onCancel:()=>void;onConfirm:(action:Confirmation['action'])=>void;
}) {
  const [mode,setMode]=useState('incremental');
  const working=busy.startsWith(`${record.id}:`),ready=configured(record),usable=ready&&record.role!=='disabled'&&!isActive;
  return <div className="panel admin-database-card">
    <div className="admin-database-card-head">
      <div><strong className="admin-database-name">{record.name}</strong><span className="admin-database-target">{target(record)}</span></div>
      <div className="admin-database-tags"><Badge tone={roleTone(record.role)}>{ROLES[record.role]}</Badge><Badge tone={healthTone(record.health)}>{HEALTH[record.health]}</Badge></div>
    </div>
    <DetailList items={[
      ['Schema',record.schema||'—'],
      ['Schema version',record.schemaVersion==null?'Not applied':`v${record.schemaVersion}`],
      ['Last sync',record.lastSyncAt?`${formatDateTime(record.lastSyncAt)}${record.lastSyncRows==null?'':` · ${formatNumber(record.lastSyncRows)} rows`}`:'Never'],
      ['Last checked',record.lastTestedAt?`${formatDateTime(record.lastTestedAt)}${record.latencyMs==null?'':` · ${formatNumber(record.latencyMs)} ms`}`:'Never'],
      ['Server',record.serverVersion||'Unknown'],
      // The name of the place the password is kept, which is all this page is ever given.
      ['Password stored as',<code key="secret">{record.secretRef||'Not set'}</code>],
    ]}/>
    {record.lastTestError&&<p className="admin-database-error"><AlertTriangle size={14} aria-hidden="true"/> {record.lastTestError}</p>}
    <div className="admin-database-actions">
      {!ready?<button type="button" className="button blue" onClick={onConfigure}>Configure</button>:<>
        <button type="button" className="button outline" disabled={working} onClick={onTest}>Test</button>
        {usable&&<>
          <label className="admin-database-mode">Copy<select aria-label={`Copy mode for ${record.name}`} value={mode} onChange={event=>setMode(event.target.value)}><option value="incremental">Changes only</option><option value="full">Everything</option></select></label>
          <button type="button" className="button outline" disabled={working} onClick={()=>onSync(mode)}>Sync</button>
          <button type="button" className="button outline" disabled={working} onClick={onCompare}>Compare</button>
          <button type="button" className="button outline" disabled={working} onClick={onVerify}>Verify</button>
          <button type="button" className="button outline" disabled={working} onClick={onSchema}>Schema</button>
          <button type="button" className="button blue" disabled={working} onClick={()=>onAsk('switch')}>Switch</button>
          <button type="button" className="button outline" disabled={working} onClick={()=>onAsk('disable')}>Disable</button>
        </>}
        <button type="button" className="button outline" onClick={onConfigure}>Edit</button>
        {!isActive&&!record.bootstrap&&<button type="button" className="button outline" disabled={working} onClick={()=>onAsk('remove')}>Remove</button>}
      </>}
    </div>
    {confirmation&&<ConfirmPanel record={record} action={confirmation} busy={working} onCancel={onCancel} onConfirm={()=>onConfirm(confirmation)}/>}
  </div>;
}

const CONFIRMATIONS={
  switch:{title:'Switch the site to this database?',detail:'This migrates the data: every row is copied across, writes pause for the final pass, the counts and checksums are verified, and only then does the site start using it. The database you are on now is left intact and becomes the standby, so this can be rolled back.',verb:'Switch over'},
  disable:{title:'Disable this database?',detail:'The site will stop using it and no action will run against it. The configuration and everything stored there are left exactly as they are.',verb:'Disable it'},
  remove:{title:'Remove this configuration?',detail:'This forgets how to reach the server. No table is dropped and no row is deleted — the data stays where it is, and the connection can be added again later.',verb:'Remove it'},
} as const;
/** Risky actions ask for the database's name to be typed: a mis-click cannot move a site between servers. */
function ConfirmPanel({record,action,busy,onCancel,onConfirm}:{record:DatabaseRecord;action:Confirmation['action'];busy:boolean;onCancel:()=>void;onConfirm:()=>void}) {
  const [typed,setTyped]=useState('');
  const copy=CONFIRMATIONS[action],fieldId=`confirm-${action}-${record.id}`,matches=typed.trim()===record.name;
  return <div className={`admin-database-confirm ${action}`} role="group" aria-label={copy.title}>
    <p className="admin-database-confirm-title"><AlertTriangle size={15} aria-hidden="true"/> {copy.title}</p>
    <p>{copy.detail}</p>
    <label htmlFor={fieldId}>Type <code>{record.name}</code> to confirm</label>
    <input id={fieldId} type="text" value={typed} autoComplete="off" spellCheck={false} onChange={event=>setTyped(event.target.value)}/>
    <div className="admin-database-confirm-actions">
      <button type="button" className="button blue" disabled={!matches||busy} onClick={onConfirm}>{busy?'Working…':copy.verb}</button>
      <button type="button" className="button outline" onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

function OutcomeSection({outcome,onClose}:{outcome:Outcome;onClose:()=>void}) {
  const {name,comparison,sync,integrity,transfer}=outcome;
  return <Section id="admin-database-result" title={`${outcome.title} · ${name}`} actions={<button type="button" className="text-button" onClick={onClose}>Clear result</button>}
    description={outcome.tone==='good'?'Finished.':outcome.tone==='bad'?'This did not finish.':undefined}>
    {outcome.message&&<p className={outcome.tone==='bad'?'admin-database-error':'admin-database-ok'}>{outcome.tone==='bad'?<AlertTriangle size={15} aria-hidden="true"/>:<CheckCircle2 size={15} aria-hidden="true"/>} {outcome.message}</p>}
    {comparison&&<>
      <FactGrid label="Comparison totals" facts={[
        {key:'compatible',label:'Compatible',value:comparison.compatible?'Yes':'No',hint:comparison.compatible?'The target can take the data as it is.':'Apply the schema to the target first.'},
        {key:'rows',label:'Rows here',value:formatNumber(comparison.rowTotals.source),hint:`${formatNumber(comparison.rowTotals.target)} there`},
        {key:'schema',label:'Schema version',value:comparison.schemaVersion.source==null?'—':`v${comparison.schemaVersion.source}`,hint:`${comparison.schemaVersion.target==null?'not applied':`v${comparison.schemaVersion.target}`} there`},
        {key:'missing',label:'Tables missing there',value:formatNumber(comparison.missingTables.length),hint:comparison.missingTables.join(', ')||'None'},
        {key:'extra',label:'Extra tables there',value:formatNumber(comparison.extraTables.length),hint:comparison.extraTables.join(', ')||'None'},
      ]}/>
      <DataTable caption="Table by table comparison" columns={DIFF_COLUMNS} rows={comparison.tables} rowKey={row=>row.table} empty="The two databases have no tables in common."/>
    </>}
    {sync&&<>
      <FactGrid label="Copy totals" facts={[
        {key:'phase',label:'Result',value:sync.phase==='done'?'Finished':sync.phase==='failed'?'Failed':sync.phase,hint:sync.errors[0]??''},
        {key:'copied',label:'Rows copied',value:formatNumber(sync.totalCopied),hint:sync.mode==='full'?'Full copy':'Changes only'},
        {key:'verified',label:'Verified',value:sync.verified?'Yes':'No',hint:sync.verified?'Checksums matched.':'A switch will not use an unverified copy.'},
        {key:'duration',label:'Took',value:formatDuration(sync.durationMs),hint:formatDateTime(sync.finishedAt)},
      ]}/>
      {sync.errors.length>0&&<ul className="admin-database-problems">{sync.errors.map(problem=><li key={problem}><AlertTriangle size={14} aria-hidden="true"/> {problem}</li>)}</ul>}
      <DataTable caption="Rows copied per table" columns={SYNC_COLUMNS} rows={sync.tables} rowKey={row=>row.table} empty="No table was copied."/>
    </>}
    {integrity&&<>
      <DetailList items={([['users','Users'],['projects','Projects'],['events','Activity events'],['audit','Audit rows']] as const).map(([key,label])=>
        [label,`${formatNumber(integrity[key].source)} here · ${formatNumber(integrity[key].target)} there`] as [ReactNode,ReactNode])}/>
      <div className="admin-database-tags admin-database-verify">
        <Badge tone={integrity.foreignKeysOk?'good':'bad'}>Foreign keys {integrity.foreignKeysOk?'OK':'broken'}</Badge>
        <Badge tone={integrity.checksumsOk?'good':'bad'}>Checksums {integrity.checksumsOk?'match':'differ'}</Badge>
        <Badge tone={integrity.passed?'good':'bad'}>{integrity.passed?'Passed':'Did not pass'}</Badge>
      </div>
    </>}
    {transfer&&<>
      <ol className="admin-database-steps">{transfer.steps.map((step,index)=><li key={`${step.step}-${index}`}>
        <Badge tone={step.ok?'good':'bad'}>{step.ok?'Done':'Failed'}</Badge>
        <strong>{STEPS[step.step]}</strong><span>{step.detail}</span><span className="muted">{formatDuration(step.ms)}</span>
      </li>)}</ol>
      {transfer.error&&<p className="admin-database-error"><AlertTriangle size={15} aria-hidden="true"/> {transfer.error}</p>}
      <p className="admin-note">{transfer.succeeded?'The site is now reading and writing the new database. The previous one is kept as the standby, so switching back is a switch in the other direction.'
        :transfer.rolledBack?'The switch was rolled back: the site is still on the database it was on, and nothing was lost.'
        :'The switch stopped and could not be rolled back automatically. Check the steps above before trying again.'}</p>
    </>}
  </Section>;
}

const PORTS:Record<Provider,string>={postgres:'5432',mysql:'3306'};
type FormValues={name:string;provider:Provider;host:string;port:string;database:string;username:string;password:string;schema:string;ssl:SslMode};
const initialValues=(record:DatabaseRecord|null):FormValues=>({name:record?.name??'',provider:record?.provider??'postgres',host:record?.host??'',
  port:String(record?.port||PORTS[record?.provider??'postgres']),database:record?.database??'',username:record?.username??'',password:'',schema:record?.schema||'public',ssl:record?.ssl??'require'});

/** Add or edit one connection. The password is write-only: it is sent, never returned, and the box is emptied on save. */
function DatabaseForm({record,onCancel,onSaved}:{record:DatabaseRecord|null;onCancel:()=>void;onSaved:(message:string)=>void}) {
  const [values,setValues]=useState<FormValues>(()=>initialValues(record));
  const [saving,setSaving]=useState(false),[problem,setProblem]=useState('');
  const set=(patch:Partial<FormValues>)=>setValues(current=>({...current,...patch}));
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setSaving(true);setProblem('');
    try {
      const payload:Record<string,unknown>={...values,port:Number(values.port)};
      if(!values.password)delete payload.password;
      await send(record?`admin/database/${record.id}`:'admin/database',payload,record?'PATCH':'POST');
      setValues(current=>({...current,password:''}));
      onSaved(record?`${values.name} updated.`:`${values.name} added.`);
    } catch(failure){setProblem((failure as Error).message);}
    finally{setSaving(false);}
  }
  return <Section title={record?`Edit ${record.name}`:'Add database'} description={record?'Leave the password empty to keep the one already stored.':'The password is sealed as soon as it is saved and is never shown again.'}>
    {problem&&<Notice error>{problem}</Notice>}
    <form className="admin-database-form" onSubmit={submit}>
      <label>Name<input name="name" required maxLength={80} value={values.name} onChange={event=>set({name:event.target.value})}/></label>
      <label>Provider<select name="provider" value={values.provider} onChange={event=>{const provider=event.target.value as Provider;set({provider,port:values.port===PORTS[values.provider]?PORTS[provider]:values.port});}}>
        {(Object.keys(PROVIDERS) as Provider[]).map(provider=><option key={provider} value={provider}>{PROVIDERS[provider]}</option>)}</select></label>
      <label>Host<input name="host" required value={values.host} placeholder="db.example.com" spellCheck={false} onChange={event=>set({host:event.target.value})}/></label>
      <label>Port<input name="port" required type="number" inputMode="numeric" min={1} max={65535} value={values.port} onChange={event=>set({port:event.target.value})}/></label>
      <label>Database<input name="database" required value={values.database} spellCheck={false} onChange={event=>set({database:event.target.value})}/></label>
      <label>Username<input name="username" required value={values.username} spellCheck={false} autoComplete="off" onChange={event=>set({username:event.target.value})}/></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" value={values.password} required={!record} onChange={event=>set({password:event.target.value})}/><small>Stored sealed. No page and no API response ever shows it again.</small></label>
      <label>Schema<input name="schema" required value={values.schema} spellCheck={false} onChange={event=>set({schema:event.target.value})}/><small>MySQL has no separate schema: use the database name.</small></label>
      <label>SSL mode<select name="ssl" value={values.ssl} onChange={event=>set({ssl:event.target.value as SslMode})}>{SSL_MODES.map(option=><option key={option} value={option}>{option}</option>)}</select></label>
      <div className="admin-database-form-actions">
        <button className="button blue" disabled={saving}>{saving?'Saving…':record?'Save changes':'Add database'}</button>
        <button type="button" className="button outline" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  </Section>;
}

export default function DatabasePage() {
  return <AdminPage section="database" title="Database manager" description="Every database this site can run on: add one, copy the data across, check that it matches, and switch over.">
    <Content/>
  </AdminPage>;
}
