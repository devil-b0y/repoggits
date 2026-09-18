'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Trash2, Undo2, X } from 'lucide-react';
import { Notice, send, useSession } from '../shared';
import type { Paged } from '@/lib/admin/types';
import type { UserSummary } from '@/lib/admin/users';
import { AdminPage } from './AdminFrame';
import { AdvancedFilters, Badge, DataTable, Pager, PresenceBadge, adminQuery, optionsFrom, useAdminData, useNow, useUrlFilters, type Column, type FilterField, type FilterValues } from './kit';
import { formatDateTime, formatNumber, timeAgo } from './format';
import DeleteUserDialog, { type DeletableUser } from './DeleteUserDialog';
import './admin-people.css';

// Admin › Users: the account directory with presence and recent activity. Roles are edited in Admin panel › Roles & permissions.

export const ROLE_LABELS:Record<string,string>={student:'Student',teacher:'Teacher-Admin',superadmin:'Super Admin'};
const DEFAULTS:FilterValues={q:'',role:'',status:'',verified:'',suspended:'',deleted:'',sort:'created',dir:'desc',page:'1'};
const FIELDS:FilterField[]=[
  {type:'search',name:'q',label:'Search',placeholder:'Name, user ID or exact email'},
  {type:'select',name:'role',label:'Role',options:optionsFrom(ROLE_LABELS)},
  {type:'select',name:'status',label:'Status',options:[{value:'online',label:'Online'},{value:'offline',label:'Offline'}]},
  {type:'select',name:'verified',label:'Email verified',options:[{value:'true',label:'Verified'},{value:'false',label:'Not verified'}]},
  {type:'select',name:'suspended',label:'Suspended',options:[{value:'true',label:'Suspended'},{value:'false',label:'Not suspended'}]},
  {type:'select',name:'deleted',label:'Account status',options:[{value:'false',label:'Active accounts'},{value:'true',label:'Deleted accounts'}]},
];

export default function UsersPage() {
  return <AdminPage section="users" title="Users" description="Every account with its presence, sessions and recent activity. Emails are encrypted, so search by name, user ID or the exact email address." actions={<Link className="button outline" href="/admin/people">Edit roles in Admin panel</Link>}><UserDirectory/></AdminPage>;
}

function UserDirectory() {
  const {user:viewer}=useSession();
  const {values,update,reset,ready}=useUrlFilters<FilterValues>(DEFAULTS);
  const {data,error,loading,reload}=useAdminData<Paged<UserSummary>>(ready?`admin/users?${adminQuery(values)}`:null);
  const now=useNow(15000);
  const [deleting,setDeleting]=useState<DeletableUser|null>(null);
  const [restoring,setRestoring]=useState<string|null>(null);
  const [rowError,setRowError]=useState('');
  const [toast,setToast]=useState('');
  const viewingDeleted=values.deleted==='true';
  const canDelete=viewer?.role==='superadmin';
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timer);},[toast]);

  async function restore(id:string) {
    setRestoring(id);setRowError('');
    try{await send('admin/users/restore',{id},'POST');setToast('User restored successfully.');reload();}
    catch(e){setRowError((e as Error).message);}
    finally{setRestoring(null);}
  }

  const columns:Column<UserSummary>[]=[
    {key:'name',label:'Name',sortKey:'name',render:row=><span className="admin-name-cell"><Link className="inline-link" href={`/admin/users/${row.id}`}>{row.name}</Link>{row.deleted&&<Badge tone="bad">Deleted</Badge>}{!row.deleted&&row.suspended&&<Badge tone="bad">Suspended</Badge>}{!row.verified&&<Badge tone="warn">Unverified</Badge>}</span>},
    {key:'email',label:'Email',render:row=>row.email||<span className="muted">Unreadable</span>},
    {key:'role',label:'Role',render:row=>ROLE_LABELS[row.role]??row.role},
    {key:'status',label:'Status',render:row=><PresenceBadge status={row.status}/>},
    {key:'lastActive',label:'Last active',sortKey:'lastActive',render:row=>row.lastActiveAt?<time dateTime={row.lastActiveAt} title={formatDateTime(row.lastActiveAt)}>{timeAgo(row.lastActiveAt,now)}</time>:<span className="muted">Never</span>},
    {key:'sessions',label:'Sessions',render:row=>formatNumber(row.sessions)},
    {key:'events',label:'Events (7 days)',render:row=>formatNumber(row.events7d)},
    {key:'joined',label:'Joined',sortKey:'created',render:row=><time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>},
    ...(canDelete?[{key:'action',label:'Action',render:(row:UserSummary)=>row.deleted
      ?<button type="button" className="text-button" disabled={restoring===row.id} onClick={()=>restore(row.id)} aria-label={`Restore ${row.name}`}><Undo2 size={14} aria-hidden="true"/> {restoring===row.id?'Restoring…':'Restore'}</button>
      :(row.id!==viewer?.id&&<button type="button" className="text-button admin-delete-user-trigger" onClick={()=>setDeleting({id:row.id,name:row.name,email:row.email,role:row.role,createdAt:row.createdAt})} aria-label={`Delete ${row.name}`}><Trash2 size={14} aria-hidden="true"/> Delete</button>)
    } as Column<UserSummary>]:[]),
  ];
  return <>
    <AdvancedFilters fields={FIELDS} values={values} onChange={update} onReset={reset}/>
    {(error||rowError)&&<Notice error>{error||rowError}</Notice>}
    <div className="admin-toolbar"><span>{data?`${formatNumber(data.total)}${data.totalCapped?'+':''} ${viewingDeleted?'deleted accounts':'accounts'}`:loading?'Loading accounts…':''}</span></div>
    <DataTable caption="Users" columns={columns} rows={data?.items??[]} rowKey={row=>row.id} sort={values.sort} dir={values.dir} onSort={(sort,dir)=>update({sort,dir})} busy={loading} empty={viewingDeleted?'No deleted accounts.':'No accounts match these filters.'}/>
    {data&&<Pager page={data.page} pageSize={data.pageSize} total={data.total} totalCapped={data.totalCapped} count={data.items.length} onPage={page=>update({page:String(page)})}/>}
    {deleting&&<DeleteUserDialog target={deleting} onClose={()=>setDeleting(null)} onDeleted={()=>{setDeleting(null);setToast('User deleted successfully.');reload();}}/>}
    {toast&&<div role="status" className="toast"><Check size={19} aria-hidden="true"/>{toast}<button type="button" aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={16} aria-hidden="true"/></button></div>}
  </>;
}
