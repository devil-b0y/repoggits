'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Notice, useSession } from '../shared';
import { hasPermission } from '@/lib/admin/permissions';
import { ACTIVITY_FILTERS, AI_FEATURES, DEVICE_TYPES, PROMPT_OUTCOMES, type ActivityRow, type Paged, type PromptRow } from '@/lib/admin/types';
import type { IpHistoryEntry, UserDetail } from '@/lib/admin/users';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, Badge, DataTable, DetailList, IpAddress, Pager, PresenceBadge, ProjectLink, Section, adminQuery, deviceLabel, optionsFrom, useAdminData, useNow, useUrlFilters, type Column, type FilterField, type FilterValues } from './kit';
import { formatDateTime, formatDuration, formatNumber, formatTime, timeAgo } from './format';
import { CurrentPath, EndSessionButton, sessionColumns, versioned } from './SessionsPage';
import { ROLE_LABELS } from './UsersPage';
import './admin-people.css';

// Admin › Users › one account: device, current session, network, activity timeline, prompts and recent sessions.

export default function UserDetailPage({id}:{id:string}) {
  const [name,setName]=useState('');
  return <AdminPage section="users" title={name||'User details'} description="Device, sessions, network, activity and prompt use for one account." actions={<Link className="button outline" href="/admin/users">All users</Link>}>
    <UserDetailView id={id} onName={setName}/>
  </AdminPage>;
}

const shortDate=(iso:string)=>new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric'});
const PROJECT_VERBS:Record<string,[string,string]>={
  PROJECT_VIEW:['Viewed','Viewed a project'],PROJECT_CREATE:['Created','Created a project'],PROJECT_UPDATE:['Updated','Updated a project'],
  PROJECT_DELETE:['Deleted','Deleted a project'],PROJECT_SHARE:['Shared','Shared a project'],PROJECT_DOWNLOAD:['Downloaded','Downloaded a project'],
  PROJECT_LIKE:['Liked','Liked a project'],PROJECT_BOOKMARK:['Bookmarked','Bookmarked a project'],COMMENT_CREATE:['Commented on','Left a comment'],
  COMMENT_DELETE:['Deleted a comment on','Deleted a comment'],FILE_UPLOAD:['Uploaded a file to','Uploaded a file'],FILE_DOWNLOAD:['Downloaded a file from','Downloaded a file'],
};
const PHRASES:Record<string,string>={
  SIGNUP:'Created an account',LOGOUT:'Signed out',EMAIL_VERIFIED:'Verified their email address',PROFILE_UPDATE:'Updated their profile',SEARCH:'Searched the library',
  LOGIN_FAILED:'Failed login attempt',PASSWORD_RESET:'Reset their password',RATE_LIMITED:'Was rate limited',ACCESS_DENIED:'Was refused access',
  SESSION_REVOKED:'A session was ended by an administrator',AI_FEATURE_USED:'Used an AI feature',PROMPT_SUBMITTED:'Submitted a prompt',
};
/** One plain sentence for a timeline entry, built from the event type, project title, page and device. Unknown types use their label. */
export function activitySentence(row:ActivityRow) {
  const title=row.project?`"${row.project.title}"`:'';
  if(row.eventType==='PAGE_VIEW')return `Visited ${row.page||'a page'}`;
  if(row.eventType==='LOGIN')return `${row.status==='failure'?'Failed':'Successful'} login · Device: ${row.os||deviceLabel(row.deviceType)} · Browser: ${row.browser||'Unknown'}`;
  const verbs=PROJECT_VERBS[row.eventType];
  if(verbs)return title?`${verbs[0]} ${title}`:verbs[1];
  const phrase=PHRASES[row.eventType]??row.label;
  return title?`${phrase} · Project: ${title}`:phrase;
}

/** URL-synced filters under a prefix (t_date, p_status…), so two filtered lists on one page never share a key. */
function usePrefixedFilters(prefix:string,defaults:FilterValues) {
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(Object.fromEntries(Object.entries(defaults).map(([key,value])=>[prefix+key,value])));
  const plain:FilterValues=Object.fromEntries(Object.entries(values).map(([key,value])=>[key.slice(prefix.length),value]));
  const change=(patch:FilterValues)=>update(Object.fromEntries(Object.entries({page:'1',...patch}).map(([key,value])=>[prefix+key,value])));
  return {values:plain,change,reset,ready};
}

function UserDetailView({id,onName}:{id:string;onName:(name:string)=>void}) {
  const {user:viewer}=useSession();
  const {data,error,reload}=useAdminData<UserDetail>(`admin/users/${encodeURIComponent(id)}`);
  const now=useNow(5000);
  useEffect(()=>{if(data)onName(data.user.name);},[data,onName]);
  if(!data)return error?<Notice error>{error}</Notice>:<p className="admin-note" role="status">Loading this account…</p>;
  const {user,presence,device,currentSession,sessions,network,counts}=data;
  const ipColumns:Column<IpHistoryEntry>[]=[
    {key:'ip',label:'IP address',render:row=><IpAddress value={row.ip}/>},
    {key:'first',label:'First seen',render:row=><time dateTime={row.firstSeen}>{formatDateTime(row.firstSeen)}</time>},
    {key:'last',label:'Last seen',render:row=><time dateTime={row.lastSeen}>{formatDateTime(row.lastSeen)}</time>},
    {key:'sessions',label:'Sessions',render:row=>formatNumber(row.sessions)},
    {key:'events',label:'Events',render:row=>formatNumber(row.events)},
  ];
  return <>
    <div className="admin-user-summary">
      <Badge tone="info">{ROLE_LABELS[user.role]??user.role}</Badge>
      <PresenceBadge status={presence.status}/>
      {!user.verified&&<Badge tone="warn">Email not verified</Badge>}
      {user.suspended&&<Badge tone="bad">Suspended</Badge>}
      {user.aiBlocked&&<Badge tone="warn">AI access paused</Badge>}
      <span>Last seen {presence.lastSeenAt?<time dateTime={presence.lastSeenAt} title={formatDateTime(presence.lastSeenAt)}>{timeAgo(presence.lastSeenAt,now)}</time>:'never'}</span>
    </div>
    {error&&<Notice error>{error}</Notice>}
    <Section title="Account">
      <DetailList items={[
        ['Email',user.email||'Unreadable'],['User ID',<code key="id">{user.id}</code>],['Joined',formatDateTime(user.createdAt)],
        ['Department',user.department||'—'],['Batch',user.batch||'—'],['Projects',formatNumber(counts.projects)],
        ['Events (7 days)',formatNumber(counts.events7d)],['Prompts (30 days)',formatNumber(counts.prompts30d)],
      ]}/>
    </Section>
    <div className="admin-grid-2">
      <Section title="Device information" description="From this account's most recent session.">
        {device?<>
          <DetailList items={[
            ['Device type',deviceLabel(device.deviceType)],
            ['Operating system',versioned(device.os,device.osVersion)],
            ['Browser',versioned(device.browser,device.browserVersion)],
            ['Screen resolution',device.screenWidth&&device.screenHeight?`${device.screenWidth} × ${device.screenHeight}${device.pixelRatio?` @ ${Math.round(device.pixelRatio*100)/100}x`:''}`:'Unknown'],
            ['Touch screen',device.touch==null?'Unknown':device.touch?'Yes':'No'],
            ['Language',device.language||'Unknown'],
            ['Time zone',device.timezone||'Unknown'],
            ['Platform',device.platform||'Unknown'],
          ]}/>
          {device.userAgent&&<details className="admin-agent"><summary>User agent</summary><code>{device.userAgent}</code></details>}
        </>:<p className="admin-note">No tracked sessions for this account yet.</p>}
      </Section>
      <Section title="Current session" actions={currentSession?<EndSessionButton session={currentSession} onEnded={reload}/>:undefined}>
        {currentSession?<DetailList items={[
          ['Status',<PresenceBadge key="status" status={currentSession.status}/>],
          ['Session started',formatDateTime(currentSession.startedAt)],
          ['Last activity',<time key="seen" dateTime={currentSession.lastSeenAt} title={formatDateTime(currentSession.lastSeenAt)}>{timeAgo(currentSession.lastSeenAt,now)}</time>],
          ['Duration',formatDuration(currentSession.durationMs)],
          ['Current page',<CurrentPath key="page" path={currentSession.currentPath}/>],
          ['Current project',<ProjectLink key="project" project={currentSession.currentProject}/>],
          ['Session ID',<Link key="id" className="inline-link" href={`/admin/sessions?session=${currentSession.id}`}><code>{currentSession.id}</code></Link>],
        ]}/>:<p className="admin-note">No open session: this account is signed out everywhere or its sessions have ended.</p>}
      </Section>
    </div>
    {hasPermission(viewer,'network')&&network?<Section title="Network information" description="Addresses seen in this account's sessions and activity within the retention window (latest 50).">
      <DetailList items={[['Current IP',<IpAddress key="ip" value={network.currentIp??''}/>]]}/>
      <DataTable caption="IP history" columns={ipColumns} rows={network.ipHistory} rowKey={row=>row.ip} empty="No addresses recorded within the retention window."/>
    </Section>:<p className="admin-note admin-section">Network information (the current IP address and IP history) requires the network permission.</p>}
    {(hasPermission(viewer,'activity')||hasPermission(viewer,'users'))&&<ActivityTimeline userId={user.id}/>}
    {hasPermission(viewer,'prompts')&&<PromptActivity userId={user.id}/>}
    <Section title="Sessions" description={`The latest ${sessions.length} of this account's sessions. Sessions are kept for ${data.retention.sessionDays} days.`} actions={hasPermission(viewer,'sessions')?<Link className="inline-link" href={`/admin/sessions?user=${user.id}`}>All sessions for this user</Link>:undefined}>
      <DataTable caption="Recent sessions" columns={sessionColumns(['session','status','device','browser','ip','started','lastSeen','duration','endReason','action'],{now,onEnded:reload})} rows={sessions} rowKey={row=>row.id} empty="No tracked sessions for this account yet."/>
    </Section>
  </>;
}

function ActivityTimeline({userId}:{userId:string}) {
  const {values,change,reset,ready}=usePrefixedFilters('t_',{date:'',from:'',to:'',event:'',device:'',project:'',page:'1'});
  const {data,error,loading}=useAdminData<Paged<ActivityRow>>(ready?`admin/logs?${adminQuery(values,{user:userId,pageSize:'30'})}`:null);
  const fields:FilterField[]=[
    {type:'dateRange',allowAllTime:true},
    {type:'select',name:'event',label:'Activity type',options:optionsFrom(ACTIVITY_FILTERS)},
    {type:'select',name:'device',label:'Device',options:optionsFrom(DEVICE_TYPES)},
    {type:'text',name:'project',label:'Project',placeholder:'Title or project ID'},
  ];
  const items=data?.items??[];
  return <Section title="Activity timeline" description="What this account did, newest first." actions={<Link className="inline-link" href={`/admin/logs?user=${userId}`}>Open in Global activity</Link>}>
    <AdvancedFilters fields={fields} values={values} onChange={change} onReset={reset}/>
    {error&&<Notice error>{error}</Notice>}
    {items.length>0&&<ol className="admin-timeline" aria-busy={loading}>{items.map(row=><li key={row.id}>
      <time dateTime={row.createdAt} title={formatDateTime(row.createdAt)}>{formatTime(row.createdAt)}<small>{shortDate(row.createdAt)}</small></time>
      <div><strong>{row.eventType}</strong> — {activitySentence(row)}
        <p>{[row.eventType!=='PAGE_VIEW'&&row.page,row.eventType!=='LOGIN'&&deviceLabel(row.deviceType),row.eventType!=='LOGIN'&&row.browser,row.status==='failure'&&'Failed'].filter(Boolean).join(' · ')}</p>
      </div>
    </li>)}</ol>}
    {data&&!items.length&&<p className="admin-note">No activity matches these filters.</p>}
    {!data&&!error&&<p className="admin-note" role="status">Loading activity…</p>}
    {data&&items.length>0&&<Pager page={data.page} pageSize={data.pageSize} total={data.total} totalCapped={data.totalCapped} count={items.length} onPage={page=>change({page:String(page)})}/>}
  </Section>;
}

function PromptActivity({userId}:{userId:string}) {
  const {values,change,reset,ready}=usePrefixedFilters('p_',{date:'',from:'',to:'',project:'',feature:'',status:'',model:'',page:'1'});
  const {data,error,loading}=useAdminData<Paged<PromptRow>>(ready?`admin/prompts?${adminQuery(values,{user:userId,pageSize:'20'})}`:null);
  const fields:FilterField[]=[
    {type:'dateRange',allowAllTime:true},
    {type:'text',name:'project',label:'Project',placeholder:'Title or project ID'},
    {type:'select',name:'feature',label:'Feature',options:optionsFrom(AI_FEATURES)},
    {type:'select',name:'status',label:'Status',options:optionsFrom(PROMPT_OUTCOMES)},
    {type:'text',name:'model',label:'Model',placeholder:'e.g. gemini-2.5-flash'},
  ];
  const items=data?.items??[];
  return <Section title="Prompt activity" description="AI requests from this account. Prompt text is not shown here." actions={<Link className="inline-link" href={`/admin/logs/prompts?user=${userId}`}>Open in Prompt logs</Link>}>
    <AdvancedFilters fields={fields} values={values} onChange={change} onReset={reset}/>
    {error&&<Notice error>{error}</Notice>}
    {items.length>0&&<ol className="admin-timeline" aria-busy={loading}>{items.map(row=><li key={row.id}>
      <time dateTime={row.createdAt} title={formatDateTime(row.createdAt)}>{formatTime(row.createdAt)}<small>{shortDate(row.createdAt)}</small></time>
      <div><strong>{(AI_FEATURES as Record<string,string>)[row.feature]??row.feature}</strong>
        <p>{[row.project&&`Project: ${row.project.title}`,`Status: ${PROMPT_OUTCOMES[row.outcome]}`,row.durationMs!=null&&`Response: ${formatDuration(row.durationMs)}`,row.model&&`Model: ${row.model}`].filter(Boolean).join(' · ')}</p>
        {row.outcome!=='success'&&row.reason&&<p>Reason: {row.reason}</p>}
      </div>
    </li>)}</ol>}
    {data&&!items.length&&<p className="admin-note">No prompts match these filters.</p>}
    {!data&&!error&&<p className="admin-note" role="status">Loading prompts…</p>}
    {data&&items.length>0&&<Pager page={data.page} pageSize={data.pageSize} total={data.total} totalCapped={data.totalCapped} count={items.length} onPage={page=>change({page:String(page)})}/>}
  </Section>;
}
