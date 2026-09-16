'use client';
import type { ReactNode } from 'react';
import { Notice, useSession } from '../shared';
import { hasPermission } from '@/lib/admin/permissions';
import { ACTIVITY_FILTERS, BROWSER_FAMILIES, DEVICE_TYPES, EVENT_CATEGORIES, EVENT_TYPES, OS_FAMILIES, PROMPT_ACTIVITY_FILTERS, VISITOR_KINDS, type ActivityRow, type Paged } from '@/lib/admin/types';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, Badge, DataTable, ExportButtons, IpAddress, Pager, PersonLink, ProjectLink, QuickFilter, adminQuery, deviceLabel, optionsFrom, optionsOf, useAdminData, useNow, useUrlFilters, type Column, type FilterField, type FilterValues } from './kit';
import { formatDateTime, formatNumber, timeAgo } from './format';
import { CurrentPath, SessionLink } from './SessionsPage';
import './admin-people.css';
import './admin-insights.css';

// Admin › Global activity: every counted action, with the filters the four logs share, and CSV/JSON export.

/** Stored metadata or audit details as a plain key/value list. Secret-looking keys are already removed on the server. */
export function Details({data,label='Details'}:{data:Record<string,unknown>;label?:string}) {
  const entries=Object.entries(data);
  if(!entries.length)return <span className="muted">—</span>;
  return <details className="admin-meta"><summary>{label} ({formatNumber(entries.length)})</summary>
    <dl>{entries.map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value===null||value===undefined?'—':typeof value==='object'?JSON.stringify(value):String(value)}</dd></div>)}</dl>
  </details>;
}
export const StatusBadge=({status}:{status:'success'|'failure'})=><Badge tone={status==='failure'?'bad':'good'}>{status==='failure'?'Failed':'Success'}</Badge>;
export const SECURITY_EVENT_OPTIONS=Object.entries(EVENT_TYPES).filter(([,entry])=>entry.category==='security').map(([value,entry])=>({value,label:entry.label}));

/** The free-text, date, device, network and identifier filters every log page offers. */
export function commonFields({network,search}:{network:boolean;search:string}):FilterField[] {
  return [
    {type:'search',name:'q',label:'Search',placeholder:search},
    {type:'dateRange',allowAllTime:true},
    {type:'select',name:'device',label:'Device',options:optionsFrom(DEVICE_TYPES)},
    {type:'select',name:'os',label:'OS',options:optionsOf(OS_FAMILIES)},
    {type:'select',name:'browser',label:'Browser',options:optionsOf(BROWSER_FAMILIES)},
    ...(network?[{type:'text',name:'ip',label:'IP address',placeholder:'Full address'} as FilterField]:[]),
    {type:'text',name:'session',label:'Session ID',placeholder:'Full session ID'},
    {type:'text',name:'user',label:'User ID',placeholder:'Full user ID'},
  ];
}
/** Turns a set of filter values off again when they are already the current ones, for the one-click presets. */
export const toggler=(values:FilterValues,update:(patch:FilterValues)=>void)=>(patch:FilterValues)=>
  update(Object.entries(patch).every(([key,value])=>values[key]===value)?Object.fromEntries(Object.keys(patch).map(key=>[key,''])):patch);

const DEFAULTS:FilterValues={q:'',date:'',from:'',to:'',event:'',prompt:'',status:'',visitor:'',device:'',os:'',browser:'',ip:'',session:'',user:'',project:'',owner:'',sort:'time',dir:'desc',page:'1'};

export default function LogsPage() {
  return <AdminPage section="logs" title="Global activity" description="Every action Repoggits counts, newest first: page views, projects, community, files, prompts, sign-ins and admin actions."><ActivityLog/></AdminPage>;
}

function ActivityLog() {
  const {user}=useSession(),network=hasPermission(user,'network');
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(DEFAULTS);
  // An IP filter arriving in a shared link is dropped for a viewer who may not use it, instead of failing the whole list.
  const query=adminQuery({...values,ip:network?values.ip??'':''});
  const {data,error,loading}=useAdminData<Paged<ActivityRow>>(ready?`admin/logs?${query}`:null);
  const now=useNow(15000);
  const toggle=toggler(values,update);
  const fields:FilterField[]=[
    ...commonFields({network,search:'Name, project title or an exact ID'}),
    {type:'select',name:'event',label:'Activity',options:optionsFrom(ACTIVITY_FILTERS)},
    {type:'select',name:'prompt',label:'Prompt activity',options:optionsFrom(PROMPT_ACTIVITY_FILTERS)},
    {type:'select',name:'status',label:'Outcome',options:[{value:'success',label:'Success'},{value:'failure',label:'Failure'}]},
    {type:'select',name:'visitor',label:'Visitor',options:optionsFrom(VISITOR_KINDS)},
    {type:'text',name:'project',label:'Project',placeholder:'Title or project ID'},
    {type:'text',name:'owner',label:'Project owner',placeholder:'Name or user ID'},
  ];
  const columns:Column<ActivityRow>[]=[
    {key:'time',label:'Time',sortKey:'time',render:row=><time dateTime={row.createdAt} title={formatDateTime(row.createdAt)}>{formatDateTime(row.createdAt)}<small>{timeAgo(row.createdAt,now)}</small></time>},
    {key:'event',label:'Event',sortKey:'event',render:row=><><strong>{row.label}</strong><small>{EVENT_CATEGORIES[row.category]}</small></>},
    {key:'user',label:'User',sortKey:'user',render:row=><PersonLink person={row.user}/>},
    {key:'page',label:'Page',render:row=><CurrentPath path={row.page}/>},
    {key:'project',label:'Project',render:row=><ProjectLink project={row.project}/>},
    {key:'device',label:'Device',render:row=><>{deviceLabel(row.deviceType)}<small>{[row.os,row.browser].filter(Boolean).join(' · ')||'Unknown'}</small></>},
    {key:'ip',label:'IP',render:row=><IpAddress value={row.ipAddress}/>},
    {key:'session',label:'Session',render:row=>row.sessionId?<SessionLink id={row.sessionId}/>:<span className="muted">—</span>},
    {key:'status',label:'Outcome',render:row=><StatusBadge status={row.status}/>},
    {key:'details',label:'Details',render:row=><Details data={row.metadata}/>},
  ];
  return <>
    <AdvancedFilters fields={fields} values={values} onChange={update} onReset={reset} quickFilters={<>
      <QuickFilter pressed={values.status==='failure'} onClick={()=>toggle({status:'failure'})}>Failures only</QuickFilter>
      <QuickFilter pressed={values.event==='page_view'} onClick={()=>toggle({event:'page_view'})}>Page views</QuickFilter>
      <QuickFilter pressed={values.event==='prompt'} onClick={()=>toggle({event:'prompt'})}>AI and prompts</QuickFilter>
      <QuickFilter pressed={values.event==='security'} onClick={()=>toggle({event:'security'})}>Security events</QuickFilter>
      <QuickFilter pressed={values.event==='admin'} onClick={()=>toggle({event:'admin'})}>Admin actions</QuickFilter>
      <QuickFilter pressed={values.visitor==='anonymous'} onClick={()=>toggle({visitor:'anonymous'})}>Anonymous visitors</QuickFilter>
    </>}/>
    {error&&<Notice error>{error}</Notice>}
    <div className="admin-toolbar">
      <span>{data?`${formatNumber(data.total)}${data.totalCapped?'+':''} events${values.date?'':' across everything still kept'}`:loading?'Loading activity…':''}</span>
      <ExportButtons endpoint="admin/logs" query={query}/>
    </div>
    <DataTable caption="Global activity" columns={columns} rows={data?.items??[]} rowKey={row=>row.id} sort={values.sort} dir={values.dir} onSort={(sort,dir)=>update({sort,dir})} busy={loading}/>
    {data&&<Pager page={data.page} pageSize={data.pageSize} total={data.total} totalCapped={data.totalCapped} count={data.items.length} onPage={page=>update({page:String(page)})}/>}
    <LogNote>{network?'':'IP addresses are hidden: they require the network permission. '}Activity is kept for the retention window set in System health, and every export is recorded in the admin audit log.</LogNote>
  </>;
}

export function LogNote({children}:{children:ReactNode}) {
  return <p className="admin-note">{children}</p>;
}
