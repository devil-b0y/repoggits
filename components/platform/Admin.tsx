'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Download, ArrowUpRight, Check, X, MessageSquare } from 'lucide-react';
import type { Project } from '@/lib/schema';
import { Shell, Gate, PageTitle, Notice, Loading, useData, useSession, send } from './shared';
import { firstAdminHref } from './admin/nav';
import './admin/admin-system.css';
<<<<<<< HEAD
import ReviewCard from './ReviewCard';
type AdminData={queue:Project[];projects:Project[]};
function Content(){
 const {user}=useSession();const {data,error,loading,reload}=useData<AdminData>('admin');
 const [selected,setSelected]=useState<string[]>([]),[reason,setReason]=useState(''),[notice,setNotice]=useState(''),[actionError,setActionError]=useState(''),[busy,setBusy]=useState(false);
=======
// Backups and AI activity are Super Admin tabs, so their code is fetched only when one is opened.
const Backup=dynamic(()=>import('./Backup'));
const AiActivity=dynamic(()=>import('./AiActivity'));
// Admin panel pages link straight to a tab, e.g. /admin?tab=people.
const TAB_SLUGS:Record<string,string>={queue:'Review queue',library:'Project library',activity:'Activity',people:'People',ai:'AI activity',backups:'Backups'};
type ManagedUser={id:string;name:string;email:string;role:Role;scopes:string[];suspended:boolean;verified:boolean};
type AdminData={queue:Project[];projects:Project[];users:ManagedUser[];audit:{id:string;actor:string;action:string;target_id:string;details:Record<string,unknown>;created_at:string}[]};
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
// The data fetch is started by the outer Admin component (mounted before Gate resolves), so it runs
// alongside the session check instead of waiting for it to finish first.
function Content({data,error,loading,reload}:{data:AdminData|null;error:string;loading:boolean;reload:()=>Promise<void>}){
 const {user}=useSession();
 const [tab,setTab]=useState('Review queue'),[selected,setSelected]=useState<string[]>([]),[reason,setReason]=useState(''),[notice,setNotice]=useState(''),[actionError,setActionError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const label=TAB_SLUGS[new URLSearchParams(window.location.search).get('tab')||''];if(label)setTab(label);},[]);
>>>>>>> 9ca03cf (refactor: optimize admin data fetching and improve performance in route handling)
 const panelHref=firstAdminHref(user);
 async function review(action:'approve'|'reject'|'changes_requested',ids=selected){setBusy(true);setActionError('');setNotice('');try{await send('admin/reviews',{ids,action,reason});setSelected([]);setReason('');setNotice('Review saved. The project team has been notified.');await reload();}catch(e){setActionError((e as Error).message);}finally{setBusy(false);}}
 if(loading&&!data)return <Loading/>;
 const statuses=['pending','approved','rejected','changes_requested'];
 return <div className="page-wrap admin-page"><PageTitle eyebrow="THE EDUCATOR’S WORKBENCH" title="Good work deserves a closer look." description={user?.role==='superadmin'?'Manage the collective, from first submission to final approval.':`Review assignments: ${user?.scopes.join(', ')||'No department or subject assigned yet.'}`} action={<div className="review-desk-actions">{panelHref&&<Link className="text-button" href={panelHref}>Admin panel</Link>}{user?.role==='superadmin'&&<Link className="text-button" href="/admin/settings">Settings</Link>}<a className="button outline" href="/api/admin/export">Export CSV <Download size={16}/></a></div>}/><div className="stat-grid">{statuses.map(status=><div className="panel stat" key={status}><span>{status.replaceAll('_',' ')}</span><strong>{data?.projects.filter(p=>p.version.status===status).length||0}</strong><small>project versions</small></div>)}</div>{(error||actionError)&&<Notice error>{error||actionError}</Notice>}{notice&&<Notice>{notice}</Notice>}
 <div className="review-toolbar panel"><label className="checkbox-label"><input type="checkbox" checked={!!data?.queue.length&&data.queue.every(p=>selected.includes(p.version.id))} onChange={e=>setSelected(e.target.checked?data!.queue.slice(0,20).map(p=>p.version.id):[])}/> Select up to 20 pending versions</label><label>Review notes<textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} maxLength={2000} placeholder="Explain your decision. At least 10 characters for rejection or requested changes."/></label><div className="row-actions"><button className="button blue" disabled={busy||!selected.length} onClick={()=>void review('approve')}><Check size={16}/> Approve selected</button><button className="button outline" disabled={busy||!selected.length} onClick={()=>void review('changes_requested')}><MessageSquare size={16}/> Request changes</button><button className="button outline" disabled={busy||!selected.length} onClick={()=>void review('reject')}><X size={16}/> Reject selected</button></div></div>{!data?.queue.length&&<div className="empty-state panel"><Check size={32}/><h3>You’re all caught up.</h3><p>New submissions in your assigned departments will appear here.</p></div>}{data?.queue.map(p=><ReviewCard key={p.version.id} project={p} selected={selected.includes(p.version.id)} busy={busy} onSelect={checked=>setSelected(s=>checked?[...s,p.version.id]:s.filter(id=>id!==p.version.id))} onApprove={()=>void review('approve',[p.version.id])} duplicate={data.projects.some(other=>other.id!==p.id&&(other.version.data.title.toLowerCase()===p.version.data.title.toLowerCase()||!!p.version.data.github&&other.version.data.github===p.version.data.github))}/>)}
 </div>;
}
export default function Admin(){
 const {data,error,loading,reload}=useData<AdminData>('admin');
 return <Shell><Gate admin><Content data={data} error={error} loading={loading} reload={reload}/></Gate></Shell>;
}
