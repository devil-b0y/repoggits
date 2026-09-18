'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Project } from '@/lib/schema';
import { Notice, ShowMore, useData, usePaged, send } from '../shared';
import { AdminPage } from './AdminFrame';

type AdminData={projects:Project[]};

function Library(){
 const {data,error,reload}=useData<AdminData>('admin');
 const [busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
 // Derived once per load rather than on every keystroke.
 const uniqueProjects=useMemo(()=>Array.from(new Map([...(data?.projects||[])].reverse().map(p=>[p.id,p])).values()),[data]);
 const {subjects,departments}=useMemo(()=>{
  const tally=(label:(p:Project)=>string)=>{const totals:Record<string,number>={};for(const p of uniqueProjects){const key=label(p);totals[key]=(totals[key]||0)+1;}return totals;};
  return {subjects:tally(p=>p.version.data.subject||'Unspecified'),departments:tally(p=>p.version.data.department)};
 },[uniqueProjects]);
 const library=usePaged(uniqueProjects,50);
 return <>
  {(error||actionError)&&<Notice error>{error||actionError}</Notice>}
  <div className="analytics-grid">
   <section className="panel"><h2>Projects by department</h2>{Object.entries(departments).map(([department,count])=><div className="chart-row" key={department}><span>{department}</span><meter min={0} max={Math.max(...Object.values(departments),1)} value={count} aria-label={`${department}: ${count} projects`}/><strong>{count}</strong></div>)}<h3>Projects by subject</h3>{Object.entries(subjects).map(([subject,count])=><div className="chart-row" key={subject}><span>{subject}</span><meter min={0} max={Math.max(...Object.values(subjects),1)} value={count} aria-label={`${subject}: ${count} projects`}/><strong>{count}</strong></div>)}</section>
   <section className="panel"><h2>Most downloaded</h2>{[...uniqueProjects].sort((a,b)=>b.downloads-a.downloads).slice(0,5).map(p=><p className="rank-row" key={p.id}><Link href={`/projects/${p.id}`}>{p.version.data.title}</Link><strong>{p.downloads}</strong></p>)}<h3>Most viewed</h3>{[...uniqueProjects].sort((a,b)=>b.views-a.views).slice(0,3).map(p=><p className="rank-row" key={p.id}><Link href={`/projects/${p.id}`}>{p.version.data.title}</Link><strong>{p.views}</strong></p>)}</section>
  </div>
  <div className="table-scroll panel"><table><thead><tr><th>Project</th><th>Department</th><th>Featured</th><th>Visibility</th></tr></thead><tbody>{library.visible.map(p=><tr key={p.id}><td><Link href={`/projects/${p.id}?version=${p.version.id}`}>{p.version.data.title}</Link></td><td>{p.version.data.department}</td><td><button className="text-button" disabled={busy} onClick={async()=>{setBusy(true);try{await send('admin/projects',{id:p.id,featured:!p.featured},'PATCH');await reload();}catch(e){setActionError((e as Error).message);}finally{setBusy(false);}}}>{p.featured?'Remove staff pick':'Feature project'}</button></td><td><button className="text-button" disabled={busy} onClick={async()=>{setBusy(true);try{await send('admin/projects',{id:p.id,archived:!p.archived},'PATCH');await reload();}catch(e){setActionError((e as Error).message);}finally{setBusy(false);}}}>{p.archived?'Restore project':'Archive project'}</button></td></tr>)}</tbody></table></div>
  <ShowMore remaining={library.remaining} onClick={library.showMore} noun="projects"/>
 </>;
}

export default function LibraryPage(){
 return <AdminPage section="library" title="Project library" description="Every project version, its department/subject breakdown, and the feature/archive controls for moderating the library." actions={<Link className="button outline" href="/admin/projects">Project analytics</Link>}>
  <Library/>
 </AdminPage>;
}
