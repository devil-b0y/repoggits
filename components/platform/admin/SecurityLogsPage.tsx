'use client';
import { Notice, useSession } from '../shared';
import { hasPermission } from '@/lib/admin/permissions';
import type { ServerErrorRow } from '@/lib/admin/security';
import type { ActivityRow, Paged } from '@/lib/admin/types';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, Badge, DataTable, ExportButtons, IpAddress, Pager, PersonLink, QuickFilter, adminQuery, deviceLabel, useAdminData, useNow, useUrlFilters, type Column, type FilterField, type FilterValues } from './kit';
import { formatDateTime, formatNumber, timeAgo } from './format';
import { CurrentPath, SessionLink } from './SessionsPage';
import { Details, SECURITY_EVENT_OPTIONS, StatusBadge, commonFields, toggler } from './LogsPage';
import './admin-people.css';
import './admin-insights.css';

// Admin › Security logs. Two sources on one page: the activity log limited to security events (failed sign-ins, rate
// limits, refused requests, ended sessions), and the server errors behind 5xx responses.

const DEFAULTS:FilterValues={source:'events',q:'',date:'',from:'',to:'',event:'',status:'',device:'',os:'',browser:'',ip:'',session:'',user:'',sort:'time',dir:'desc',page:'1'};
// Switching source clears the filters that mean different things on each side, so a stale value never causes a 400.
const SOURCE_RESET:FilterValues={q:'',event:'',status:'',sort:'time',dir:'desc',page:'1'};

export default function SecurityLogsPage() {
  return <AdminPage section="security" title="Security logs" description="Failed sign-ins, rate limits, refused requests and sessions ended by an admin, plus the server errors behind 5xx responses."><SecurityLog/></AdminPage>;
}

function SecurityLog() {
  const {user}=useSession(),network=hasPermission(user,'network');
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(DEFAULTS);
  const errors=values.source==='errors';
  const query=adminQuery({...values,ip:network&&!errors?values.ip??'':''});
  const {data,error,loading}=useAdminData<Paged<ActivityRow|ServerErrorRow>>(ready?`admin/security?${query}`:null);
  const now=useNow(15000);
  const toggle=toggler(values,update);
  const eventFields:FilterField[]=[
    ...commonFields({network,search:'Name, project title or an exact ID'}),
    {type:'select',name:'event',label:'Security event',options:SECURITY_EVENT_OPTIONS},
    {type:'select',name:'status',label:'Outcome',options:[{value:'success',label:'Success'},{value:'failure',label:'Failure'}]},
  ];
  const errorFields:FilterField[]=[
    {type:'search',name:'q',label:'Search',placeholder:'Path or error name'},
    {type:'dateRange',allowAllTime:true},
    {type:'text',name:'status',label:'HTTP status',placeholder:'e.g. 500'},
  ];
  const eventColumns:Column<ActivityRow>[]=[
    {key:'time',label:'Time',sortKey:'time',render:row=><time dateTime={row.createdAt} title={formatDateTime(row.createdAt)}>{formatDateTime(row.createdAt)}<small>{timeAgo(row.createdAt,now)}</small></time>},
    {key:'event',label:'Event',sortKey:'event',render:row=><strong>{row.label}</strong>},
    {key:'user',label:'User',sortKey:'user',render:row=><PersonLink person={row.user}/>},
    {key:'page',label:'Page',render:row=><CurrentPath path={row.page}/>},
    {key:'device',label:'Device',render:row=><>{deviceLabel(row.deviceType)}<small>{[row.os,row.browser].filter(Boolean).join(' · ')||'Unknown'}</small></>},
    {key:'ip',label:'IP',render:row=><IpAddress value={row.ipAddress}/>},
    {key:'session',label:'Session',render:row=>row.sessionId?<SessionLink id={row.sessionId}/>:<span className="muted">—</span>},
    {key:'status',label:'Outcome',render:row=><StatusBadge status={row.status}/>},
    {key:'details',label:'Details',render:row=><Details data={row.metadata}/>},
  ];
  const errorColumns:Column<ServerErrorRow>[]=[
    {key:'time',label:'Time',sortKey:'time',render:row=><time dateTime={row.createdAt} title={formatDateTime(row.createdAt)}>{formatDateTime(row.createdAt)}<small>{timeAgo(row.createdAt,now)}</small></time>},
    {key:'method',label:'Method',render:row=><code>{row.method}</code>},
    {key:'path',label:'Path',render:row=><code>{row.path}</code>},
    {key:'status',label:'Status',sortKey:'status',render:row=><Badge tone="bad">{row.status}</Badge>},
    {key:'error',label:'Error',render:row=><><strong>{row.name||'Error'}</strong>{row.message&&<small>{row.message}</small>}</>},
  ];
  return <>
    <div className="admin-quick-filters admin-view-tabs" role="group" aria-label="Security log source">
      <QuickFilter pressed={!errors} onClick={()=>update({source:'events',...SOURCE_RESET})}>Security events</QuickFilter>
      <QuickFilter pressed={errors} onClick={()=>update({source:'errors',...SOURCE_RESET})}>Server errors</QuickFilter>
    </div>
    <AdvancedFilters fields={errors?errorFields:eventFields} values={values} onChange={update} onReset={reset} quickFilters={errors?undefined:<>
      <QuickFilter pressed={values.event==='LOGIN_FAILED'} onClick={()=>toggle({event:'LOGIN_FAILED'})}>Failed logins</QuickFilter>
      <QuickFilter pressed={values.event==='RATE_LIMITED'} onClick={()=>toggle({event:'RATE_LIMITED'})}>Rate limited</QuickFilter>
      <QuickFilter pressed={values.event==='ACCESS_DENIED'} onClick={()=>toggle({event:'ACCESS_DENIED'})}>Access denied</QuickFilter>
      <QuickFilter pressed={values.event==='SESSION_REVOKED'} onClick={()=>toggle({event:'SESSION_REVOKED'})}>Ended by an admin</QuickFilter>
    </>}/>
    {error&&<Notice error>{error}</Notice>}
    <div className="admin-toolbar">
      <span>{data?`${formatNumber(data.total)}${data.totalCapped?'+':''} ${errors?'server errors':'security events'}`:loading?'Loading the security log…':''}</span>
      <ExportButtons endpoint="admin/security" query={query}/>
    </div>
    {errors
      ?<DataTable caption="Server errors" columns={errorColumns} rows={(data?.items??[]) as ServerErrorRow[]} rowKey={row=>row.id} sort={values.sort} dir={values.dir} onSort={(sort,dir)=>update({sort,dir})} busy={loading} empty="No server errors match these filters."/>
      :<DataTable caption="Security events" columns={eventColumns} rows={(data?.items??[]) as ActivityRow[]} rowKey={row=>row.id} sort={values.sort} dir={values.dir} onSort={(sort,dir)=>update({sort,dir})} busy={loading} empty="No security events match these filters."/>}
    {data&&<Pager page={data.page} pageSize={data.pageSize} total={data.total} totalCapped={data.totalCapped} count={data.items.length} onPage={page=>update({page:String(page)})}/>}
    <p className="admin-note">{errors
      ?'Server errors record the method, path, status, error name and message only. Request bodies, query strings and headers are never stored, and known secret values are removed from the message.'
      :'Security events are kept for their own retention period, longer than ordinary activity and set in System health.'}</p>
  </>;
}
