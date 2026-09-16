'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Notice, send, useSession } from '../shared';
import { hasPermission } from '@/lib/admin/permissions';
import { BROWSER_FAMILIES, DEVICE_TYPES, OS_FAMILIES, SESSION_STATUSES, VISITOR_KINDS, type Paged, type SessionRow } from '@/lib/admin/types';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, Badge, DataTable, IpAddress, Pager, PersonLink, PresenceBadge, QuickFilter, adminQuery, deviceLabel, optionsFrom, optionsOf, useAdminData, useNow, useUrlFilters, type Column, type FilterField, type FilterValues } from './kit';
import { formatDateTime, formatDuration, formatNumber, timeAgo } from './format';
import './admin-people.css';

// Admin › Sessions, plus the session cells and the End session action that Live monitoring and user detail reuse.

export const END_REASONS:Record<string,string>={logout:'Signed out',expired:'Expired',revoked:'Ended by an admin',password_reset:'Password reset',inactive:'Inactive',signed_in:'Signed in'};
export const versioned=(name:string,version:string)=>name?version?`${name} ${version}`:name:'Unknown';

export function SessionUser({session}:{session:SessionRow}) {
  return session.user?<PersonLink person={session.user}/>:<Badge>Anonymous visitor</Badge>;
}
export function SessionLink({id}:{id:string}) {
  return <Link className="inline-link" href={`/admin/sessions?session=${id}`} title={id}><code>{id.slice(0,8)}</code></Link>;
}
/** A page path from the tracker; only a path inside this site becomes a link. */
export function CurrentPath({path}:{path:string}) {
  if(!path)return <span className="muted">—</span>;
  return path.startsWith('/')&&!path.startsWith('//')&&!path.startsWith('/api/')?<Link className="inline-link" href={path}>{path}</Link>:<code>{path}</code>;
}

/** Ends a session after confirmation. Shown only to viewers with the sessions permission, and only for sessions still open. */
export function EndSessionButton({session,onEnded}:{session:SessionRow;onEnded:()=>void}) {
  const {user}=useSession();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  if(!hasPermission(user,'sessions')||session.status==='ended')return null;
  const end=async()=>{
    const consequence=session.user?`${session.user.name} will be signed out of that browser.`:'This anonymous session will be marked as ended.';
    if(!window.confirm(`End session ${session.id.slice(0,8)}? ${consequence}`))return;
    setBusy(true);setError('');
    try{await send(`admin/sessions/${session.id}/revoke`,{});onEnded();}
    catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  };
  return <span className="admin-end-session">
    <button type="button" className="button outline" disabled={busy} onClick={end} aria-label={`End session ${session.id.slice(0,8)}`}>{busy?'Ending…':'End session'}</button>
    {error&&<span className="admin-inline-error" role="alert">{error}</span>}
  </span>;
}

export type SessionColumnKey='session'|'user'|'status'|'device'|'os'|'browser'|'ip'|'started'|'lastSeen'|'duration'|'page'|'endReason'|'action';
export function sessionColumns(keys:readonly SessionColumnKey[],{now,onEnded,linkSession=true}:{now:number;onEnded:()=>void;linkSession?:boolean}):Column<SessionRow>[] {
  const all:Record<SessionColumnKey,Column<SessionRow>>={
    session:{key:'session',label:'Session',render:row=>linkSession?<SessionLink id={row.id}/>:<code title={row.id}>{row.id.slice(0,8)}</code>},
    user:{key:'user',label:'User',render:row=><SessionUser session={row}/>},
    status:{key:'status',label:'Status',render:row=><PresenceBadge status={row.status}/>},
    device:{key:'device',label:'Device',render:row=>deviceLabel(row.deviceType)},
    os:{key:'os',label:'OS',render:row=>versioned(row.os,row.osVersion)},
    browser:{key:'browser',label:'Browser',render:row=>versioned(row.browser,row.browserVersion)},
    ip:{key:'ip',label:'IP',render:row=><IpAddress value={row.ipAddress}/>},
    started:{key:'started',label:'Started',sortKey:'started',render:row=><time dateTime={row.startedAt}>{formatDateTime(row.startedAt)}</time>},
    lastSeen:{key:'lastSeen',label:'Last active',sortKey:'lastSeen',render:row=><time dateTime={row.lastSeenAt} title={formatDateTime(row.lastSeenAt)}>{timeAgo(row.lastSeenAt,now)}</time>},
    duration:{key:'duration',label:'Duration',sortKey:'duration',render:row=>formatDuration(row.durationMs)},
    page:{key:'page',label:'Current page',render:row=><CurrentPath path={row.currentPath}/>},
    endReason:{key:'endReason',label:'End reason',render:row=>row.endReason?END_REASONS[row.endReason]??row.endReason:<span className="muted">—</span>},
    action:{key:'action',label:'Action',render:row=><EndSessionButton session={row} onEnded={onEnded}/>},
  };
  return keys.map(key=>all[key]);
}

export default function SessionsPage() {
  return <AdminPage section="sessions" title="Sessions" description="Every tracked browsing session, signed in or anonymous, kept for the session retention window. Ending a session signs that browser out."><SessionsList/></AdminPage>;
}

const DEFAULTS:FilterValues={q:'',status:'',visitor:'',device:'',os:'',browser:'',ip:'',session:'',date:'',from:'',to:'',sort:'started',dir:'desc',page:'1'};
const COLUMNS:SessionColumnKey[]=['session','user','status','device','os','browser','ip','started','lastSeen','duration','page','endReason','action'];

function SessionsList() {
  const {user}=useSession(),network=hasPermission(user,'network');
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(DEFAULTS);
  // An IP filter from a shared link is dropped for a viewer who may not filter by IP, instead of failing the whole list.
  const query=adminQuery({...values,ip:network?values.ip??'':''});
  const {data,error,loading,reload}=useAdminData<Paged<SessionRow>>(ready?`admin/sessions?${query}`:null);
  const now=useNow(5000);
  const ipField:FilterField[]=network?[{type:'text',name:'ip',label:'IP address',placeholder:'Full address'}]:[];
  const fields:FilterField[]=[
    {type:'search',name:'q',label:'Search',placeholder:'User name or ID'},
    {type:'dateRange',allowAllTime:true},
    {type:'select',name:'status',label:'Status',options:optionsFrom(SESSION_STATUSES)},
    {type:'select',name:'visitor',label:'Visitor',options:optionsFrom(VISITOR_KINDS)},
    {type:'select',name:'device',label:'Device',options:optionsFrom(DEVICE_TYPES)},
    {type:'select',name:'os',label:'OS',options:optionsOf(OS_FAMILIES)},
    {type:'select',name:'browser',label:'Browser',options:optionsOf(BROWSER_FAMILIES)},
    ...ipField,
    {type:'text',name:'session',label:'Session ID',placeholder:'Full session ID'},
  ];
  const toggle=(patch:FilterValues)=>update(Object.entries(patch).every(([key,value])=>values[key]===value)?Object.fromEntries(Object.keys(patch).map(key=>[key,''])):patch);
  return <>
    <AdvancedFilters fields={fields} values={values} onChange={update} onReset={reset} quickFilters={<>
      <QuickFilter pressed={values.status==='online'} onClick={()=>toggle({status:'online'})}>Online now</QuickFilter>
      <QuickFilter pressed={values.status==='ended'} onClick={()=>toggle({status:'ended'})}>Ended</QuickFilter>
      <QuickFilter pressed={values.visitor==='anonymous'} onClick={()=>toggle({visitor:'anonymous'})}>Anonymous visitors</QuickFilter>
    </>}/>
    {error&&<Notice error>{error}</Notice>}
    <div className="admin-toolbar">
      <span>{data?`${formatNumber(data.total)}${data.totalCapped?'+':''} sessions`:loading?'Loading sessions…':''}</span>
      {!network&&<span>IP addresses are hidden: they require the network permission.</span>}
    </div>
    <DataTable caption="Sessions" columns={sessionColumns(COLUMNS,{now,onEnded:reload,linkSession:false})} rows={data?.items??[]} rowKey={row=>row.id} sort={values.sort} dir={values.dir} onSort={(sort,dir)=>update({sort,dir})} busy={loading}/>
    {data&&<Pager page={data.page} pageSize={data.pageSize} total={data.total} totalCapped={data.totalCapped} count={data.items.length} onPage={page=>update({page:String(page)})}/>}
  </>;
}
