'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Download, ArrowUpRight, Check, X, MessageSquare } from 'lucide-react';
import type { Project } from '@/lib/schema';
import { Shell, Gate, PageTitle, Notice, Loading, useData, useSession, send } from './shared';
import { firstAdminHref } from './admin/nav';
import './admin/admin-system.css';
import ReviewCard from './ReviewCard';
type AdminData={queue:Project[];projects:Project[]};
function Content(){
 const {user}=useSession();const {data,error,loading,reload}=useData<AdminData>('admin');
 const [selected,setSelected]=useState<string[]>([]),[reason,setReason]=useState(''),[notice,setNotice]=useState(''),[actionError,setActionError]=useState(''),[busy,setBusy]=useState(false);
 const panelHref=firstAdminHref(user);
 async function review(action:'approve'|'reject'|'changes_requested',ids=selected){setBusy(true);setActionError('');setNotice('');try{await send('admin/reviews',{ids,action,reason});setSelected([]);setReason('');setNotice('Review saved. The project team has been notified.');await reload();}catch(e){setActionError((e as Error).message);}finally{setBusy(false);}}
 if(loading&&!data)return <Loading/>;
 const statuses=['pending','approved','rejected','changes_requested'];
 return <div className="page-wrap admin-page"><PageTitle eyebrow="THE EDUCATOR’S WORKBENCH" title="Good work deserves a closer look." description={user?.role==='superadmin'?'Manage the collective, from first submission to final approval.':`Review assignments: ${user?.scopes.join(', ')||'No department or subject assigned yet.'}`} action={<div className="review-desk-actions">{panelHref&&<Link className="text-button" href={panelHref}>Admin panel</Link>}{user?.role==='superadmin'&&<Link className="text-button" href="/admin/settings">Settings</Link>}<a className="button outline" href="/api/admin/export">Export CSV <Download size={16}/></a></div>}/><div className="stat-grid">{statuses.map(status=><div className="panel stat" key={status}><span>{status.replaceAll('_',' ')}</span><strong>{data?.projects.filter(p=>p.version.status===status).length||0}</strong><small>project versions</small></div>)}</div>{(error||actionError)&&<Notice error>{error||actionError}</Notice>}{notice&&<Notice>{notice}</Notice>}
 <div className="review-toolbar panel"><label className="checkbox-label"><input type="checkbox" checked={!!data?.queue.length&&data.queue.every(p=>selected.includes(p.version.id))} onChange={e=>setSelected(e.target.checked?data!.queue.slice(0,20).map(p=>p.version.id):[])}/> Select up to 20 pending versions</label><label>Review notes<textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} maxLength={2000} placeholder="Explain your decision. At least 10 characters for rejection or requested changes."/></label><div className="row-actions"><button className="button blue" disabled={busy||!selected.length} onClick={()=>void review('approve')}><Check size={16}/> Approve selected</button><button className="button outline" disabled={busy||!selected.length} onClick={()=>void review('changes_requested')}><MessageSquare size={16}/> Request changes</button><button className="button outline" disabled={busy||!selected.length} onClick={()=>void review('reject')}><X size={16}/> Reject selected</button></div></div>{!data?.queue.length&&<div className="empty-state panel"><Check size={32}/><h3>You’re all caught up.</h3><p>New submissions in your assigned departments will appear here.</p></div>}{data?.queue.map(p=><ReviewCard key={p.version.id} project={p} selected={selected.includes(p.version.id)} busy={busy} onSelect={checked=>setSelected(s=>checked?[...s,p.version.id]:s.filter(id=>id!==p.version.id))} onApprove={()=>void review('approve',[p.version.id])} duplicate={data.projects.some(other=>other.id!==p.id&&(other.version.data.title.toLowerCase()===p.version.data.title.toLowerCase()||!!p.version.data.github&&other.version.data.github===p.version.data.github))}/>)}
 </div>;
}
export default function Admin(){return <Shell><Gate admin><Content/></Gate></Shell>;}
