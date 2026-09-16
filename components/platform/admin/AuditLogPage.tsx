'use client';
import { Notice } from '../shared';
import type { AuditRow, Paged } from '@/lib/admin/types';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, DataTable, ExportButtons, Pager, PersonLink, QuickFilter, adminQuery, optionsOf, useAdminData, useNow, useUrlFilters, type Column, type FilterField, type FilterValues } from './kit';
import { formatDateTime, formatNumber, timeAgo } from './format';
import { Details, toggler } from './LogsPage';
import './admin-people.css';
import './admin-insights.css';

// Admin › Admin audit log: what administrators did — reviews, user and settings changes, prompt readings, exports,
// ended sessions, retention changes and cleanups. Unlike the other logs it is never pruned by the retention settings.

type AuditResponse=Paged<AuditRow>&{actions:string[]};
const DEFAULTS:FilterValues={q:'',date:'',from:'',to:'',action:'',actor:'',sort:'time',dir:'desc',page:'1'};
/** Action names are stored as dotted words; this is display only, so an unrecorded name still reads sensibly. */
const actionLabel=(action:string)=>action.replaceAll('.',' › ').replaceAll('_',' ');

export default function AuditLogPage() {
  return <AdminPage section="audit" title="Admin audit log" description="Every administrative action, with who did it, what it touched and the details they changed."><AuditLog/></AdminPage>;
}

function AuditLog() {
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(DEFAULTS);
  const query=adminQuery(values);
  const {data,error,loading}=useAdminData<AuditResponse>(ready?`admin/audit?${query}`:null);
  const now=useNow(15000);
  const toggle=toggler(values,update);
  // The Action list comes from the log itself, so it offers exactly the actions this installation has recorded.
  const actions=data?.actions??[];
  const fields:FilterField[]=[
    {type:'search',name:'q',label:'Search',placeholder:'Admin name, action or an exact target ID'},
    {type:'dateRange',allowAllTime:true},
    {type:'select',name:'action',label:'Action',options:optionsOf(actions)},
    {type:'text',name:'actor',label:'Administrator ID',placeholder:'Full user ID'},
  ];
  const columns:Column<AuditRow>[]=[
    {key:'time',label:'Time',sortKey:'time',render:row=><time dateTime={row.createdAt} title={formatDateTime(row.createdAt)}>{formatDateTime(row.createdAt)}<small>{timeAgo(row.createdAt,now)}</small></time>},
    {key:'actor',label:'Administrator',render:row=><PersonLink person={row.actor} fallback="System"/>},
    {key:'action',label:'Action',sortKey:'action',render:row=><><strong>{actionLabel(row.action)}</strong><small><code>{row.action}</code></small></>},
    {key:'target',label:'Target',render:row=>row.targetId?<code>{row.targetId}</code>:<span className="muted">—</span>},
    {key:'details',label:'Details',render:row=><Details data={row.details}/>},
  ];
  return <>
    <AdvancedFilters fields={fields} values={values} onChange={update} onReset={reset} quickFilters={<>
      <QuickFilter pressed={values.action==='prompt.viewed'} onClick={()=>toggle({action:'prompt.viewed'})}>Prompt readings</QuickFilter>
      <QuickFilter pressed={values.action==='logs.exported'} onClick={()=>toggle({action:'logs.exported'})}>Exports</QuickFilter>
      <QuickFilter pressed={values.action==='session.revoked'} onClick={()=>toggle({action:'session.revoked'})}>Ended sessions</QuickFilter>
      <QuickFilter pressed={values.action==='user.updated'} onClick={()=>toggle({action:'user.updated'})}>User changes</QuickFilter>
    </>}/>
    {error&&<Notice error>{error}</Notice>}
    <div className="admin-toolbar">
      <span>{data?`${formatNumber(data.total)}${data.totalCapped?'+':''} recorded actions`:loading?'Loading the audit log…':''}</span>
      <ExportButtons endpoint="admin/audit" query={query}/>
    </div>
    <DataTable caption="Admin audit log" columns={columns} rows={data?.items??[]} rowKey={row=>row.id} sort={values.sort} dir={values.dir} onSort={(sort,dir)=>update({sort,dir})} busy={loading} empty="No admin actions match these filters."/>
    {data&&<Pager page={data.page} pageSize={data.pageSize} total={data.total} totalCapped={data.totalCapped} count={data.items.length} onPage={page=>update({page:String(page)})}/>}
    <p className="admin-note">The audit log is kept for as long as the installation exists: the data retention settings in System health never prune it. Details are stored as they were recorded, minus anything named like a password, token, secret or key. Exporting this log is itself an audited action.</p>
  </>;
}
