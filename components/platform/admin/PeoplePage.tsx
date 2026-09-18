'use client';
import { useState } from 'react';
import type { Role } from '@/lib/schema';
import { Notice, ShowMore, useData, usePaged, send } from '../shared';
import { AdminPage } from './AdminFrame';
import { ADMIN_PERMISSIONS, PERMISSION_NAMES, type AdminPermission } from '@/lib/admin/permissions';

// Admin › Roles & permissions: change a person's role, review assignments and (for Teacher-Admins) which admin
// panel sections they can open. Moved out of the review desk so that page is only ever about reviewing.

type ManagedUser={id:string;name:string;email:string;role:Role;scopes:string[];suspended:boolean;verified:boolean};
// Admin panel permissions are stored as permission:<name> scopes beside the review assignments; the text box shows only the
// department:/subject: entries and the ticked permissions are merged back in on save.
const PERSONAL_DATA:readonly AdminPermission[]=['prompt_content','network'];
const isPermissionScope=(scope:string)=>scope.startsWith('permission:');

function UserRow({user,onSaved}:{user:ManagedUser;onSaved:()=>Promise<void>}){
 const [role,setRole]=useState(user.role),[scopes,setScopes]=useState(user.scopes.filter(s=>!isPermissionScope(s)).join(', ')),[permissions,setPermissions]=useState(()=>PERMISSION_NAMES.filter(p=>user.scopes.includes(`permission:${p}`))),[suspended,setSuspended]=useState(user.suspended),[busy,setBusy]=useState(false),[error,setError]=useState('');
 // Grants only mean something for a Teacher-Admin, so a role change drops them instead of keeping them to reappear later.
 const savedScopes=()=>[...scopes.split(',').map(s=>s.trim()).filter(s=>s&&!isPermissionScope(s)),...(role==='teacher'?PERMISSION_NAMES.filter(p=>permissions.includes(p)).map(p=>`permission:${p}`):[])];
 return <div className="user-row panel"><div><strong>{user.name}</strong><p>{user.email}</p><small>{user.verified?'Email verified':'Email not verified'}</small></div><label>Role for {user.name}<select value={role} onChange={e=>setRole(e.target.value as Role)}><option value="student">Student</option><option value="teacher">Teacher-Admin</option><option value="superadmin">Super Admin</option></select></label><label>Review assignments<input value={scopes} onChange={e=>setScopes(e.target.value)} placeholder="department:Computer Science, subject:Research"/><small>Comma-separated department:… or subject:… entries.</small></label>{role==='teacher'&&<fieldset className="admin-permissions"><legend>Admin panel permissions</legend><div>{PERMISSION_NAMES.map(p=><label className="checkbox-label" key={p}><input type="checkbox" checked={permissions.includes(p)} onChange={e=>{const checked=e.target.checked;setPermissions(list=>checked?[...list,p]:list.filter(item=>item!==p));}}/> {ADMIN_PERMISSIONS[p]}{PERSONAL_DATA.includes(p)&&<span className="status-tag">personal data</span>}</label>)}</div><small>Saving signs {user.name} out, so changed permissions apply straight away.</small></fieldset>}{role==='superadmin'&&<p className="admin-permissions muted">Super Admins have every permission.</p>}<label className="checkbox-label"><input type="checkbox" checked={suspended} onChange={e=>setSuspended(e.target.checked)}/> Suspended</label><button className="button outline" disabled={busy} onClick={async()=>{setError('');setBusy(true);try{await send('admin/users',{id:user.id,role,scopes:savedScopes(),suspended},'PATCH');await onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Saving…':'Save user'}</button>{error&&<Notice error>{error}</Notice>}</div>;
}

function Roles(){
 const {data,error,loading,reload}=useData<{users:ManagedUser[]}>('admin');
 const people=usePaged(data?.users||[],25);
 if(loading&&!data)return <p className="muted" role="status">Loading people…</p>;
 return <>{error&&<Notice error>{error}</Notice>}{people.visible.map(u=><UserRow user={u} key={u.id} onSaved={reload}/>)}<ShowMore remaining={people.remaining} onClick={people.showMore} noun="people"/></>;
}

export default function PeoplePage(){
 return <AdminPage section="people" title="Roles & permissions" description="Change a person's role, their review assignments, and — for Teacher-Admins — which admin panel sections they can open.">
  <Roles/>
 </AdminPage>;
}
