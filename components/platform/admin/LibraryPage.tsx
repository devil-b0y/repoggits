'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, RotateCcw, Trash2, X } from 'lucide-react';
import type { Project } from '@/lib/schema';
import { Notice, ShowMore, useData, usePaged, send } from '../shared';
import { AdminPage } from './AdminFrame';
import { Badge } from './kit';
import { formatDateTime } from './format';
import DeleteProjectDialog, { type DeletableProject } from './DeleteProjectDialog';
import './admin-people.css';

// Admin › Project library: every project version, its department/subject breakdown, the feature/archive controls,
// and (new) a themed Delete/Restore flow. Deleting reuses r.projects.archived — this app's existing soft delete,
// already excluded from every public listing — with a confirmation dialog, an optional reason, and a restore path.

export const STATUS_LABELS:Record<string,string>={draft:'Draft',pending:'Pending review',approved:'Approved',rejected:'Rejected',changes_requested:'Changes requested'};
type AdminData={projects:Project[]};
type LibraryTab='active'|'archived';

function Library(){
 const {data,error,loading,reload}=useData<AdminData>('admin');
 const [busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
 const [tab,setTab]=useState<LibraryTab>('active');
 const [deleting,setDeleting]=useState<DeletableProject|null>(null);
 const [toast,setToast]=useState('');
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timer);},[toast]);
 // Derived once per load rather than on every keystroke.
 const uniqueProjects=useMemo(()=>Array.from(new Map([...(data?.projects||[])].reverse().map(p=>[p.id,p])).values()),[data]);
 const activeProjects=useMemo(()=>uniqueProjects.filter(p=>!p.archived),[uniqueProjects]);
 const archivedProjects=useMemo(()=>uniqueProjects.filter(p=>p.archived),[uniqueProjects]);
 const {subjects,departments}=useMemo(()=>{
  const tally=(label:(p:Project)=>string)=>{const totals:Record<string,number>={};for(const p of activeProjects){const key=label(p);totals[key]=(totals[key]||0)+1;}return totals;};
  return {subjects:tally(p=>p.version.data.subject||'Unspecified'),departments:tally(p=>p.version.data.department)};
 },[activeProjects]);
 const shown=tab==='active'?activeProjects:archivedProjects;
 const library=usePaged(shown,50);

 async function restore(id:string) {
  setBusy(true);setActionError('');
  try{await send('admin/projects/restore',{id},'POST');setToast('Project restored successfully.');await reload();}
  catch(e){setActionError((e as Error).message);}
  finally{setBusy(false);}
 }

 return <>
  {(error||actionError)&&<Notice error>{error||actionError}</Notice>}
  <div className="admin-tabs" role="tablist" aria-label="Project library views">
   <button type="button" role="tab" aria-selected={tab==='active'} className={`admin-chip ${tab==='active'?'active':''}`} onClick={()=>setTab('active')}>Active projects ({activeProjects.length})</button>
   <button type="button" role="tab" aria-selected={tab==='archived'} className={`admin-chip ${tab==='archived'?'active':''}`} onClick={()=>setTab('archived')}>Archived / Deleted ({archivedProjects.length})</button>
  </div>
  {tab==='active'&&<div className="analytics-grid">
   <section className="panel"><h2>Projects by department</h2>{Object.entries(departments).map(([department,count])=><div className="chart-row" key={department}><span>{department}</span><meter min={0} max={Math.max(...Object.values(departments),1)} value={count} aria-label={`${department}: ${count} projects`}/><strong>{count}</strong></div>)}<h3>Projects by subject</h3>{Object.entries(subjects).map(([subject,count])=><div className="chart-row" key={subject}><span>{subject}</span><meter min={0} max={Math.max(...Object.values(subjects),1)} value={count} aria-label={`${subject}: ${count} projects`}/><strong>{count}</strong></div>)}</section>
   <section className="panel"><h2>Most downloaded</h2>{[...activeProjects].sort((a,b)=>b.downloads-a.downloads).slice(0,5).map(p=><p className="rank-row" key={p.id}><Link href={`/projects/${p.id}`}>{p.version.data.title}</Link><strong>{p.downloads}</strong></p>)}<h3>Most viewed</h3>{[...activeProjects].sort((a,b)=>b.views-a.views).slice(0,3).map(p=><p className="rank-row" key={p.id}><Link href={`/projects/${p.id}`}>{p.version.data.title}</Link><strong>{p.views}</strong></p>)}</section>
  </div>}
  <div className="table-scroll panel">
   <table>
    <thead><tr><th>Project</th><th>Department</th><th>Status</th>{tab==='active'&&<><th>Featured</th></>}<th>Action</th></tr></thead>
    <tbody>{library.visible.map(p=><tr key={p.id}>
      <td><Link href={`/projects/${p.id}?version=${p.version.id}`}>{p.version.data.title}</Link></td>
      <td>{p.version.data.department}</td>
      <td><Badge tone={p.version.status==='approved'?'good':p.version.status==='rejected'?'bad':'neutral'}>{STATUS_LABELS[p.version.status]??p.version.status}</Badge></td>
      {tab==='active'&&<td><button className="text-button" disabled={busy} onClick={async()=>{setBusy(true);try{await send('admin/projects',{id:p.id,featured:!p.featured},'PATCH');await reload();}catch(e){setActionError((e as Error).message);}finally{setBusy(false);}}}>{p.featured?'Remove staff pick':'Feature project'}</button></td>}
      <td>{tab==='active'
        ?<button type="button" className="text-button admin-delete-user-trigger" disabled={busy} onClick={()=>setDeleting({id:p.id,title:p.version.data.title,team:p.version.data.teamName,status:p.version.status,createdAt:p.version.createdAt})}><Trash2 size={14} aria-hidden="true"/> Delete</button>
        :<button type="button" className="text-button" disabled={busy} onClick={()=>restore(p.id)}><RotateCcw size={14} aria-hidden="true"/> Restore</button>}
      </td>
    </tr>)}</tbody>
   </table>
  </div>
  {library.visible.length===0&&<p className="admin-note">{tab==='active'?'No active projects match this view.':'No archived or deleted projects.'}</p>}
  <ShowMore remaining={library.remaining} onClick={library.showMore} noun="projects"/>
  {deleting&&<DeleteProjectDialog target={deleting} onClose={()=>setDeleting(null)} onDeleted={()=>{setDeleting(null);setToast('Project deleted successfully.');reload();}}/>}
  {toast&&<div role="status" className="toast"><Check size={19} aria-hidden="true"/>{toast}<button type="button" aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={16} aria-hidden="true"/></button></div>}
 </>;
}

export default function LibraryPage(){
 return <AdminPage section="library" title="Project library" description="Every project version, its department/subject breakdown, and the feature/archive controls for moderating the library." actions={<Link className="button outline" href="/admin/projects">Project analytics</Link>}>
  <Library/>
 </AdminPage>;
}
