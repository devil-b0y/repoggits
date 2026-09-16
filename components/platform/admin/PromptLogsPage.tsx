'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Notice, useSession } from '../shared';
import { hasPermission } from '@/lib/admin/permissions';
import { AI_FEATURES, PROMPT_OUTCOMES, type Paged, type PromptOutcome, type PromptRow } from '@/lib/admin/types';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, Badge, DataTable, DetailList, ExportButtons, IpAddress, Pager, PersonLink, ProjectLink, QuickFilter, Section, adminQuery, deviceLabel, optionsFrom, useAdminData, useUrlFilters, type Column, type FilterField, type FilterValues } from './kit';
import { formatDateTime, formatDuration, formatNumber } from './format';
import { SessionLink } from './SessionsPage';
import { commonFields, toggler } from './LogsPage';
import './admin-people.css';
import './admin-insights.css';

// Admin › Prompt logs: every request to the Gemini assistant with its outcome, timing and device. The list never
// carries prompt text; reading one needs prompt_content, happens one prompt at a time, and is audited as prompt.viewed.

const TONES:Record<PromptOutcome,'good'|'bad'|'warn'|'neutral'|'info'>={success:'good',failed:'bad',timeout:'bad',refused:'bad',rate_limited:'warn',cancelled:'neutral',pending:'info'};
const DEFAULTS:FilterValues={q:'',date:'',from:'',to:'',feature:'',status:'',model:'',project:'',device:'',os:'',browser:'',ip:'',session:'',user:'',sort:'time',dir:'desc',page:'1'};

export default function PromptLogsPage() {
  return <AdminPage section="prompts" title="Prompt logs" description="Every AI request with who made it, what it was for, how it ended and how long it took." actions={<Link className="button outline" href="/admin/ai">AI usage charts</Link>}><PromptLog/></AdminPage>;
}

function PromptLog() {
  const {user}=useSession(),network=hasPermission(user,'network'),canRead=hasPermission(user,'prompt_content');
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(DEFAULTS);
  const [open,setOpen]=useState<PromptRow|null>(null);
  const query=adminQuery({...values,ip:network?values.ip??'':''});
  const {data,error,loading}=useAdminData<Paged<PromptRow>>(ready?`admin/prompts?${query}`:null);
  const toggle=toggler(values,update);
  const fields:FilterField[]=[
    ...commonFields({network,search:'Name, project title or an exact ID'}),
    {type:'select',name:'feature',label:'Feature',options:optionsFrom(AI_FEATURES)},
    {type:'select',name:'status',label:'Outcome',options:optionsFrom(PROMPT_OUTCOMES)},
    {type:'text',name:'model',label:'Model',placeholder:'e.g. gemini-2.5-flash'},
    {type:'text',name:'project',label:'Project',placeholder:'Title or project ID'},
  ];
  const columns:Column<PromptRow>[]=[
    {key:'time',label:'Time',sortKey:'time',render:row=><time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>},
    {key:'user',label:'User',sortKey:'user',render:row=><PersonLink person={row.user}/>},
    {key:'feature',label:'Feature',render:row=>(AI_FEATURES as Record<string,string>)[row.feature]??row.feature},
    {key:'project',label:'Project',render:row=><ProjectLink project={row.project}/>},
    {key:'status',label:'Outcome',render:row=><><Badge tone={TONES[row.outcome]}>{PROMPT_OUTCOMES[row.outcome]}</Badge>{row.reason&&<small>{row.reason}</small>}</>},
    {key:'duration',label:'Response time',sortKey:'duration',render:row=>formatDuration(row.durationMs)},
    {key:'model',label:'Model',render:row=>row.model||<span className="muted">—</span>},
    {key:'tokens',label:'Tokens',render:row=><>{formatNumber(row.totalTokens)}<small>{formatNumber(row.promptChars)} characters in</small></>},
    {key:'device',label:'Device',render:row=><>{deviceLabel(row.deviceType)}<small>{[row.os,row.browser].filter(Boolean).join(' · ')||'Unknown'}</small></>},
    {key:'ip',label:'IP',render:row=><IpAddress value={row.ipAddress}/>},
    {key:'session',label:'Session',render:row=>row.sessionId?<SessionLink id={row.sessionId}/>:<span className="muted">—</span>},
    ...(canRead?[{key:'action',label:'Prompt',render:(row:PromptRow)=><button type="button" className="button outline admin-read-prompt" onClick={()=>setOpen(row)}>Read prompt</button>}]:[]),
  ];
  return <>
    <AdvancedFilters fields={fields} values={values} onChange={update} onReset={reset} quickFilters={<>
      <QuickFilter pressed={values.status==='success'} onClick={()=>toggle({status:'success'})}>Successful</QuickFilter>
      <QuickFilter pressed={values.status==='failed'} onClick={()=>toggle({status:'failed'})}>Failed</QuickFilter>
      <QuickFilter pressed={values.status==='rate_limited'} onClick={()=>toggle({status:'rate_limited'})}>Rate limited</QuickFilter>
      <QuickFilter pressed={values.date==='today'} onClick={()=>toggle({date:'today'})}>Today</QuickFilter>
    </>}/>
    {error&&<Notice error>{error}</Notice>}
    {open&&<PromptText row={open} onClose={()=>setOpen(null)}/>}
    <div className="admin-toolbar">
      <span>{data?`${formatNumber(data.total)}${data.totalCapped?'+':''} prompts`:loading?'Loading prompts…':''}</span>
      <ExportButtons endpoint="admin/prompts" query={query}/>
    </div>
    <DataTable caption="Prompt logs" columns={columns} rows={data?.items??[]} rowKey={row=>row.id} sort={values.sort} dir={values.dir} onSort={(sort,dir)=>update({sort,dir})} busy={loading}/>
    {data&&<Pager page={data.page} pageSize={data.pageSize} total={data.total} totalCapped={data.totalCapped} count={data.items.length} onPage={page=>update({page:String(page)})}/>}
    <p className="admin-note">Prompt text is encrypted and cannot be searched, so the search box matches the person and the project instead. {canRead?'Reading a prompt is recorded in the admin audit log under your name.':'Reading prompt text requires the prompt_content permission.'} Prompt logs follow their own retention period, shown in System health.</p>
  </>;
}

/** One prompt's text, fetched only when an administrator asks for it. The server audits every such reading. */
function PromptText({row,onClose}:{row:PromptRow;onClose:()=>void}) {
  // Never cached: the audit record is written where the text is read, so a second reading must reach the server too.
  const {data,error,loading}=useAdminData<{prompt:PromptRow&{content:string;readable:boolean}}>(`admin/prompts/${encodeURIComponent(row.id)}`,{cache:false});
  const prompt=data?.prompt;
  return <Section id="prompt-text" title="Prompt text" description="Read from the encrypted store for this one request. This reading has been recorded in the admin audit log." actions={<button type="button" className="button outline" onClick={onClose}>Close</button>}>
    <DetailList items={[
      ['Person',<PersonLink key="user" person={row.user}/>],
      ['When',formatDateTime(row.createdAt)],
      ['Feature',(AI_FEATURES as Record<string,string>)[row.feature]??row.feature],
      ['Outcome',<Badge key="outcome" tone={TONES[row.outcome]}>{PROMPT_OUTCOMES[row.outcome]}</Badge>],
      ['Model',row.model||'—'],
      ['Prompt ID',<code key="id">{row.id}</code>],
    ]}/>
    {error&&<Notice error>{error}</Notice>}
    {loading&&!prompt&&<p className="admin-note" role="status">Decrypting this prompt…</p>}
    {prompt&&(prompt.readable
      ?<pre className="admin-prompt-text">{prompt.content}</pre>
      :<Notice error>This prompt cannot be read: it was sealed with a different DATA_ENCRYPTION_KEY, so only its details remain.</Notice>)}
  </Section>;
}
