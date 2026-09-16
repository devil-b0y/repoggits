'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Notice } from '../shared';
import { DEVICE_TYPES, HEARTBEAT_SECONDS, VISITOR_KINDS, type LiveSnapshot, type SessionRow } from '@/lib/admin/types';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, DataTable, IpAddress, PresenceBadge, ProjectLink, adminQuery, deviceLabel, optionsFrom, useAdminData, useNow, useUrlFilters, type Column, type FilterField, type FilterValues } from './kit';
import { formatDateTime, formatNumber, timeAgo } from './format';
import { CurrentPath, SessionLink, SessionUser, versioned } from './SessionsPage';
import './admin-people.css';

// Admin › Live monitoring: open sessions refreshed by polling every 10 seconds.
const POLL_MS=10000;
const FIELDS:FilterField[]=[
  {type:'search',name:'q',label:'Search',placeholder:'User name'},
  {type:'select',name:'visitor',label:'Visitor',options:optionsFrom(VISITOR_KINDS)},
  {type:'select',name:'device',label:'Device',options:optionsFrom(DEVICE_TYPES)},
];

export default function LivePage() {
  return <AdminPage section="live" title="Live monitoring" description="Who is on Repoggits right now: each open session, the page and project it is on, and the device behind it."><LiveMonitor/></AdminPage>;
}

function LiveMonitor() {
  const {values,update,reset,ready}=useUrlFilters<FilterValues>({q:'',visitor:'',device:''});
  const {data,error,loading}=useAdminData<LiveSnapshot>(ready?`admin/live?${adminQuery(values)}`:null,{pollMs:POLL_MS});
  const now=useNow(1000);
  const [received,setReceived]=useState<{at:number;skew:number}|null>(null);
  useEffect(()=>{
    if(!data)return;
    const at=Date.now(),skew=at-Date.parse(data.generatedAt);
    setReceived({at,skew:Number.isFinite(skew)?skew:0});
  },[data]);
  // "5 sec ago" is measured on the server's clock, so a browser whose clock is off still reads correctly.
  const serverNow=now-(received?.skew??0);
  const age=received?Math.max(0,Math.round((now-received.at)/1000)):0;
  const counts=data?.counts;
  const tiles=[
    {key:'online',label:'Online now',value:counts?.online,hint:'People with Repoggits open',href:'/admin/sessions?status=online'},
    {key:'authenticated',label:'Authenticated users',value:counts?.authenticated,hint:'Signed-in accounts online',href:'/admin/sessions?status=online&visitor=authenticated'},
    {key:'anonymous',label:'Anonymous visitors',value:counts?.anonymous,hint:'Browsers not signed in',href:'/admin/sessions?status=online&visitor=anonymous'},
    {key:'activeSessions',label:'Active sessions',value:counts?.activeSessions,hint:'Open sessions on every device',href:'/admin/sessions?status=online'},
  ];
  const columns:Column<SessionRow>[]=[
    {key:'user',label:'User',render:row=><SessionUser session={row}/>},
    {key:'status',label:'Status',render:row=><PresenceBadge status={row.status}/>},
    {key:'device',label:'Device',render:row=><>{deviceLabel(row.deviceType)}<small>{versioned(row.os,row.osVersion)}</small></>},
    {key:'browser',label:'Browser',render:row=>versioned(row.browser,row.browserVersion)},
    {key:'page',label:'Current page',render:row=><CurrentPath path={row.currentPath}/>},
    {key:'project',label:'Current project',render:row=><ProjectLink project={row.currentProject}/>},
    {key:'lastSeen',label:'Last active',render:row=><time dateTime={row.lastSeenAt} title={formatDateTime(row.lastSeenAt)}>{timeAgo(row.lastSeenAt,serverNow)}</time>},
    {key:'session',label:'Session',render:row=><SessionLink id={row.id}/>},
    {key:'ip',label:'IP',render:row=><IpAddress value={row.ipAddress}/>},
  ];
  return <>
    <div className="admin-live-bar">
      <span className={error?'admin-live-indicator paused':'admin-live-indicator'}><span className={`admin-dot ${error?'offline':'online'}`} aria-hidden="true"/>{error?'Connection lost, retrying':'Live'}</span>
      <span>{received?`Updated ${age<60?`${age} sec`:`${Math.floor(age/60)} min`} ago`:loading?'Loading…':''}</span>
    </div>
    <div className="admin-stat-grid" role="list" aria-label="Live counts">
      {tiles.map(tile=><div role="listitem" key={tile.key}><Link className="admin-stat panel" href={tile.href}>
        <span className="admin-stat-label">{tile.label}</span>
        <strong className="admin-stat-value">{tile.value==null?'—':formatNumber(tile.value)}</strong>
        <span className="admin-stat-hint">{tile.hint}</span>
      </Link></div>)}
    </div>
    <AdvancedFilters fields={FIELDS} values={values} onChange={update} onReset={reset}/>
    {error&&<Notice error>{error}</Notice>}
    <div className="admin-toolbar"><span>{data?`${formatNumber(data.sessions.length)} open sessions seen in the last 30 minutes, online first`:''}</span></div>
    <DataTable caption="Open sessions" columns={columns} rows={data?.sessions??[]} rowKey={row=>row.id} busy={loading&&!data} empty={data?'Nobody has Repoggits open right now.':'Loading live sessions…'}/>
    <p className="admin-note">A browser counts as online while it has sent a heartbeat within the last {data?.onlineWindowSeconds??120} seconds; the tracker sends one every {HEARTBEAT_SECONDS} seconds while its tab is visible. This page asks the server again every 10 seconds; no WebSocket connection is used.</p>
  </>;
}
