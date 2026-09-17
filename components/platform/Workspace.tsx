'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Plus, Bell, Check, Search } from 'lucide-react';
import { Shell, Gate, PageTitle, Notice, Card, Loading, useData, send } from './shared';
import type { Project, User, VersionStatus } from '@/lib/schema';
type WorkspaceData={user:User;projects:Project[];saved:Project[];notifications:{id:string;message:string;project_id:string;read:boolean;created_at:string}[]};
// A version with changes requested is back with its author, which is what the list already treats as a draft.
const FILTERS:{label:string;statuses:readonly VersionStatus[]|null}[]=[
 {label:'All',statuses:null},
 {label:'Draft',statuses:['draft','changes_requested']},
 {label:'In Review',statuses:['pending']},
 {label:'Published',statuses:['approved']},
];
const SORTS=['Recently updated','Oldest','A-Z'] as const;
// The data fetch is started by the outer Workspace component (mounted before Gate resolves), so it
// runs alongside the session check instead of waiting for it to finish first.
function WorkspaceContent({data,error,loading,reload}:{data:WorkspaceData|null;error:string;loading:boolean;reload:()=>Promise<void>}){
 const [actionError,setActionError]=useState(''),[busy,setBusy]=useState('');
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('All'),[sort,setSort]=useState<typeof SORTS[number]>('Recently updated');
 // The workspace read returns versions newest-updated first, so that order is "Recently updated" and its reverse is "Oldest".
 const visible=useMemo(()=>{
  const term=query.trim().toLowerCase();
  const statuses=FILTERS.find(f=>f.label===filter)?.statuses;
  const matches=(data?.projects||[]).filter(p=>(!statuses||statuses.includes(p.version.status))
   &&(!term||`${p.version.data.title} ${p.version.data.summary}`.toLowerCase().includes(term)));
  return sort==='A-Z'?[...matches].sort((a,b)=>a.version.data.title.localeCompare(b.version.data.title))
   :sort==='Oldest'?[...matches].reverse():matches;
 },[data,query,filter,sort]);
 if(loading&&!data)return <Loading/>;
 return <div className="page-wrap workspace-page"><PageTitle eyebrow="YOUR CORNER OF THE COLLECTIVE" title="Your ideas, in motion." description="Pick up a draft, follow a review, or start your next chapter." action={<Link href="/submit" className="button blue">New project <Plus size={17}/></Link>}/>{(error||actionError)&&<Notice error>{error||actionError}</Notice>}<div className="workspace-layout"><section><h2>Your projects <span className="count-label">{visible.length}</span></h2>{!!data?.projects.length&&<div className="gallery-toolbar workspace-toolbar"><div className="filter-tabs">{FILTERS.map(f=><button type="button" key={f.label} className={filter===f.label?'active':''} aria-pressed={filter===f.label} onClick={()=>setFilter(f.label)}>{f.label}</button>)}</div><div className="workspace-toolbar-end"><label className="search"><Search size={16}/><input aria-label="Search projects" placeholder="Search projects…" value={query} onChange={e=>setQuery(e.target.value)}/></label><label className="workspace-sort">Sort<select aria-label="Sort projects" value={sort} onChange={e=>setSort(e.target.value as typeof SORTS[number])}>{SORTS.map(s=><option key={s}>{s}</option>)}</select></label></div></div>}{!data?.projects.length&&<div className="empty-state panel"><h3>A blank page is a good beginning.</h3><p>Your drafts and submissions will appear here.</p><Link href="/submit" className="button outline">Start a project <ArrowUpRight size={16}/></Link></div>}{!!data?.projects.length&&!visible.length&&<div className="empty-state panel"><h3>No projects match this search.</h3><p className="muted">Try another word, or choose All to see everything.</p></div>}{visible.map(p=><article className="workspace-project panel" key={p.id}><div><span className={`status-tag ${p.version.status}`}>{p.version.status.replaceAll('_',' ')}</span><span className="version-label">Version {p.version.number}</span></div><h3>{p.version.data.title}</h3><p>{p.version.data.summary||'Your project story is still taking shape.'}</p>{p.version.status==='pending'&&<p>{p.version.approvals} of {p.version.requiredApprovals} approvals received</p>}{p.version.feedback&&<Notice>{p.version.feedback}</Notice>}<div className="row-actions"><Link className="text-button" href={`/projects/${p.id}?version=${p.version.id}`}>View version <ArrowUpRight size={16}/></Link>{['draft','changes_requested'].includes(p.version.status)?<Link className="button outline" href={`/submit?project=${p.id}&version=${p.version.id}`}>Continue editing</Link>:['approved','rejected'].includes(p.version.status)&&!p.archived?<button className="button outline" disabled={busy===p.id} onClick={async()=>{setBusy(p.id);setActionError('');try{const next=await send<{id:string;versionId:string}>(`projects/${p.id}/versions`,{});window.location.href=`/submit?project=${next.id}&version=${next.versionId}`;}catch(e){setActionError((e as Error).message);}finally{setBusy('');}}}>Start new version</button>:null}</div></article>)}</section><aside><div className="aside-heading"><h2><Bell size={18}/> Updates</h2>{data?.notifications.some(n=>!n.read)&&<button aria-label="Mark all updates read" className="icon-button" onClick={async()=>{await send('notifications',{});await reload();}}><Check size={18}/></button>}</div>{!data?.notifications.length?<p className="muted panel">Your review updates will arrive here.</p>:data.notifications.map(n=><Link className={`notification ${n.read?'':'unread'}`} key={n.id} href={`/projects/${n.project_id}`}><p>{n.message}</p><small>{new Date(n.created_at).toLocaleDateString()}</small></Link>)}</aside></div><section className="saved-section"><h2>Saved inspiration</h2>{data?.saved.length?<div className="project-grid">{data.saved.map(p=><Card key={p.id} project={p}/>)}</div>:<p className="muted">Save a published project from its detail page to keep it here.</p>}</section></div>;
}
export default function Workspace(){
 const {data,error,loading,reload}=useData<WorkspaceData>('workspace');
 return <Shell><Gate><WorkspaceContent data={data} error={error} loading={loading} reload={reload}/></Gate></Shell>;
}
