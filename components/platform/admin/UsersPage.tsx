'use client';
import Link from 'next/link';
import { Notice } from '../shared';
import type { Paged } from '@/lib/admin/types';
import type { UserSummary } from '@/lib/admin/users';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, Badge, DataTable, Pager, PresenceBadge, adminQuery, optionsFrom, useAdminData, useNow, useUrlFilters, type Column, type FilterField, type FilterValues } from './kit';
import { formatDateTime, formatNumber, timeAgo } from './format';
import './admin-people.css';

// Admin › Users: the account directory with presence and recent activity. Roles are edited in Review desk › People.

export const ROLE_LABELS:Record<string,string>={student:'Student',teacher:'Teacher-Admin',superadmin:'Super Admin'};
const DEFAULTS:FilterValues={q:'',role:'',status:'',verified:'',suspended:'',sort:'created',dir:'desc',page:'1'};
const FIELDS:FilterField[]=[
  {type:'search',name:'q',label:'Search',placeholder:'Name, user ID or exact email'},
  {type:'select',name:'role',label:'Role',options:optionsFrom(ROLE_LABELS)},
  {type:'select',name:'status',label:'Status',options:[{value:'online',label:'Online'},{value:'offline',label:'Offline'}]},
  {type:'select',name:'verified',label:'Email verified',options:[{value:'true',label:'Verified'},{value:'false',label:'Not verified'}]},
  {type:'select',name:'suspended',label:'Suspended',options:[{value:'true',label:'Suspended'},{value:'false',label:'Not suspended'}]},
];

export default function UsersPage() {
  return <AdminPage section="users" title="Users" description="Every account with its presence, sessions and recent activity. Emails are encrypted, so search by name, user ID or the exact email address." actions={<Link className="button outline" href="/admin?tab=people">Edit roles in Review desk</Link>}><UserDirectory/></AdminPage>;
}

function UserDirectory() {
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(DEFAULTS);
  const {data,error,loading}=useAdminData<Paged<UserSummary>>(ready?`admin/users?${adminQuery(values)}`:null);
  const now=useNow(15000);
  const columns:Column<UserSummary>[]=[
    {key:'name',label:'Name',sortKey:'name',render:row=><span className="admin-name-cell"><Link className="inline-link" href={`/admin/users/${row.id}`}>{row.name}</Link>{row.suspended&&<Badge tone="bad">Suspended</Badge>}{!row.verified&&<Badge tone="warn">Unverified</Badge>}</span>},
    {key:'email',label:'Email',render:row=>row.email||<span className="muted">Unreadable</span>},
    {key:'role',label:'Role',render:row=>ROLE_LABELS[row.role]??row.role},
    {key:'status',label:'Status',render:row=><PresenceBadge status={row.status}/>},
    {key:'lastActive',label:'Last active',sortKey:'lastActive',render:row=>row.lastActiveAt?<time dateTime={row.lastActiveAt} title={formatDateTime(row.lastActiveAt)}>{timeAgo(row.lastActiveAt,now)}</time>:<span className="muted">Never</span>},
    {key:'sessions',label:'Sessions',render:row=>formatNumber(row.sessions)},
    {key:'events',label:'Events (7 days)',render:row=>formatNumber(row.events7d)},
    {key:'joined',label:'Joined',sortKey:'created',render:row=><time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>},
  ];
  return <>
    <AdvancedFilters fields={FIELDS} values={values} onChange={update} onReset={reset}/>
    {error&&<Notice error>{error}</Notice>}
    <div className="admin-toolbar"><span>{data?`${formatNumber(data.total)}${data.totalCapped?'+':''} accounts`:loading?'Loading accounts…':''}</span></div>
    <DataTable caption="Users" columns={columns} rows={data?.items??[]} rowKey={row=>row.id} sort={values.sort} dir={values.dir} onSort={(sort,dir)=>update({sort,dir})} busy={loading}/>
    {data&&<Pager page={data.page} pageSize={data.pageSize} total={data.total} totalCapped={data.totalCapped} count={data.items.length} onPage={page=>update({page:String(page)})}/>}
  </>;
}
