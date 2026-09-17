'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Plus, Bell, Check, Search, MoreHorizontal, BadgeCheck, Eye, MessageSquare, CircleSlash, Bookmark } from 'lucide-react';
import { Shell, Gate, PageTitle, Notice, Loading, useData, send } from './shared';
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
const MINUTE=60_000,HOUR=60*MINUTE,DAY=24*HOUR;
function editedAgo(iso:string) {
 const gap=Date.now()-Date.parse(iso);
 if(gap<HOUR)return `Edited ${Math.max(1,Math.floor(gap/MINUTE))}m ago`;
 if(gap<DAY)return `Edited ${Math.floor(gap/HOUR)}h ago`;
 if(gap<30*DAY)return `Edited ${Math.floor(gap/DAY)}d ago`;
 return `Edited ${new Date(iso).toLocaleDateString()}`;
}
function timeAgo(iso:string) {
 const gap=Date.now()-Date.parse(iso);
 const [count,unit]=gap<HOUR?[Math.max(1,Math.floor(gap/MINUTE)),'minute']:gap<DAY?[Math.floor(gap/HOUR),'hour']:gap<30*DAY?[Math.floor(gap/DAY),'day']:[0,''];
 return unit?`${count} ${unit}${count===1?'':'s'} ago`:new Date(iso).toLocaleDateString();
}
// Every update is written by the review flow in one format: "<title> · version <n>: <outcome>[ (x/y approvals)].[ reason]".
const UPDATE_PATTERN=/^(.+) · version (\d+): ([a-z ]+?)(?: \((\d+)\/(\d+) approvals\))?\.(?:\s+([\s\S]*))?$/;
const OUTCOMES:Record<string,{label:string;Icon:typeof Bell}>={
 approved:{label:'Project published',Icon:BadgeCheck},
 pending:{label:'Review received',Icon:Eye},
 'changes requested':{label:'Changes requested',Icon:MessageSquare},
 rejected:{label:'Not approved',Icon:CircleSlash},
};
function readUpdate(update:{message:string;project_id:string},projects:Project[]) {
 const parts=UPDATE_PATTERN.exec(update.message);
 const outcome=parts?OUTCOMES[parts[3]]:undefined;
 // The project's own title is preferred, so a renamed project reads correctly in older updates.
 const project=projects.find(p=>p.id===update.project_id)?.version.data.title||parts?.[1]||'';
 const detail=parts?.[6]?.trim()||(parts?.[4]?`${parts[4]} of ${parts[5]} approvals`:'');
 return {label:outcome?.label||'Update',Icon:outcome?.Icon||Bell,project,detail,unparsed:outcome?'':update.message};
}
// Only an approved version is readable by anyone else, so everything earlier is the author's alone.
const visibilityOf=(p:Project)=>p.archived?'Archived':p.version.status==='approved'?'Public':'Private';
function reviewStateOf({version}:Project) {
 if(version.status==='approved')return 'Published';
 if(version.status==='pending')return version.approvals?`${version.approvals} of ${version.requiredApprovals} approvals`:'Awaiting review';
 if(version.status==='changes_requested')return 'Changes requested';
 return version.status==='rejected'?'Not approved':'No reviews yet';
}
// Still in the author's hands: a draft, or a version sent back for changes. Both the editor and rename accept these.
const isEditable=(p:Project)=>['draft','changes_requested'].includes(p.version.status)&&!p.archived;
const canShare=(p:Project)=>p.version.status==='approved'&&!p.archived;
function CardMenu({project,onRename,onShare,shared}:{project:Project;onRename:()=>void;onShare:()=>void;shared:boolean}) {
 const [open,setOpen]=useState(false);
 useEffect(()=>{
  if(!open)return;
  const close=(event:Event)=>{if(!(event.target as HTMLElement).closest('.card-menu'))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
  document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};
 },[open]);
 const rename=isEditable(project),share=canShare(project);
 return <div className="card-menu"><button type="button" className="icon-button" aria-haspopup="menu" aria-expanded={open} aria-label={`More actions for ${project.version.data.title}`} onClick={()=>setOpen(!open)}><MoreHorizontal size={18}/></button>
  {open&&<div className="card-menu-list" role="menu">
   <button type="button" role="menuitem" disabled={!rename} title={rename?undefined:'Only a draft can be renamed.'} onClick={()=>{setOpen(false);onRename();}}>Rename</button>
   <button type="button" role="menuitem" disabled={!share} title={share?undefined:'A link works once the project is published.'} onClick={()=>{setOpen(false);onShare();}}>{shared?'Link copied':'Share'}</button>
  </div>}</div>;
}
// The data fetch is started by the outer Workspace component (mounted before Gate resolves), so it
// runs alongside the session check instead of waiting for it to finish first.
function WorkspaceContent({data,error,loading,reload}:{data:WorkspaceData|null;error:string;loading:boolean;reload:()=>Promise<void>}){
 const [actionError,setActionError]=useState(''),[busy,setBusy]=useState('');
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('All'),[sort,setSort]=useState<typeof SORTS[number]>('Recently updated');
 const [renaming,setRenaming]=useState(''),[renamed,setRenamed]=useState(''),[copied,setCopied]=useState('');
 // What is actually waiting to be picked up, so the action offered here always leads somewhere.
 const resume=useMemo(()=>(data?.projects||[]).filter(isEditable)
  .sort((a,b)=>Date.parse(b.version.updatedAt)-Date.parse(a.version.updatedAt))[0],[data]);
 const visible=useMemo(()=>{
  const term=query.trim().toLowerCase();
  const statuses=FILTERS.find(f=>f.label===filter)?.statuses;
  const matches=(data?.projects||[]).filter(p=>(!statuses||statuses.includes(p.version.status))
   &&(!term||`${p.version.data.title} ${p.version.data.summary}`.toLowerCase().includes(term)));
  const edited=(p:Project)=>Date.parse(p.version.updatedAt);
  return [...matches].sort((a,b)=>sort==='A-Z'?a.version.data.title.localeCompare(b.version.data.title)
   :sort==='Oldest'?edited(a)-edited(b):edited(b)-edited(a));
 },[data,query,filter,sort]);
 if(loading&&!data)return <Loading/>;
 return <div className="page-wrap workspace-page"><PageTitle eyebrow="YOUR CORNER OF THE COLLECTIVE" title="Your ideas, in motion." description="Pick up a draft, follow a review, or start your next chapter." action={<Link href="/submit" className="button blue">New project <Plus size={17}/></Link>}/>{(error||actionError)&&<Notice error>{error||actionError}</Notice>}<div className="workspace-layout"><section>{resume&&<section className="resume-panel panel" aria-label="Continue where you left off"><div><div className="eyebrow">CONTINUE WHERE YOU LEFT OFF</div><h3>{resume.version.data.title}</h3><p className="project-meta-line"><span>Version {resume.version.number}</span><span>Last edited {timeAgo(resume.version.updatedAt)}</span></p></div><Link className="button outline" href={`/submit?project=${resume.id}&version=${resume.version.id}`}>Continue editing <ArrowUpRight size={16}/></Link></section>}<h2>Your projects <span className="count-label">{visible.length}</span></h2>{!!data?.projects.length&&<div className="gallery-toolbar workspace-toolbar"><div className="filter-tabs">{FILTERS.map(f=><button type="button" key={f.label} className={filter===f.label?'active':''} aria-pressed={filter===f.label} onClick={()=>setFilter(f.label)}>{f.label}</button>)}</div><div className="workspace-toolbar-end"><label className="search"><Search size={16}/><input aria-label="Search projects" placeholder="Search projects…" value={query} onChange={e=>setQuery(e.target.value)}/></label><label className="workspace-sort">Sort<select aria-label="Sort projects" value={sort} onChange={e=>setSort(e.target.value as typeof SORTS[number])}>{SORTS.map(s=><option key={s}>{s}</option>)}</select></label></div></div>}{!data?.projects.length&&<div className="empty-state panel"><h3>A blank page is a good beginning.</h3><p>Your drafts and submissions will appear here.</p><Link href="/submit" className="button outline">Start a project <ArrowUpRight size={16}/></Link></div>}{!!data?.projects.length&&!visible.length&&<div className="empty-state panel"><h3>No projects match this search.</h3><p className="muted">Try another word, or choose All to see everything.</p></div>}{visible.map(p=><article className="workspace-project panel" key={p.id}><div className="workspace-project-top"><div><span className={`status-tag ${p.version.status}`}>{p.version.status.replaceAll('_',' ')}</span><span className="version-label">Version {p.version.number}</span></div><CardMenu project={p} shared={copied===p.id} onRename={()=>{setRenaming(p.version.id);setRenamed(p.version.data.title);setActionError('');}} onShare={async()=>{setActionError('');try{await navigator.clipboard.writeText(`${window.location.origin}/projects/${p.id}`);setCopied(p.id);}catch{setActionError('Your browser would not let the link be copied.');}}}/></div>{renaming===p.version.id?<form className="rename-row" onSubmit={async e=>{e.preventDefault();const title=renamed.trim();if(!title||title===p.version.data.title){setRenaming('');return;}setBusy(p.id);setActionError('');try{await send(`versions/${p.version.id}`,{data:{...p.version.data,title},submit:false,changelog:p.version.changelog},'PATCH');setRenaming('');await reload();}catch(err){setActionError((err as Error).message);}finally{setBusy('');}}}><label>Project title<input autoFocus value={renamed} maxLength={120} onChange={e=>setRenamed(e.target.value)}/></label><button className="button outline" disabled={busy===p.id}>{busy===p.id?'Saving…':'Save name'}</button><button type="button" className="text-button" onClick={()=>setRenaming('')}>Cancel</button></form>:<h3>{p.version.data.title}</h3>}<p>{p.version.data.summary||'Your project story is still taking shape.'}</p><p className="project-meta-line">{[editedAgo(p.version.updatedAt),visibilityOf(p),reviewStateOf(p)].map(part=><span key={part}>{part}</span>)}</p>{p.version.feedback&&<Notice>{p.version.feedback}</Notice>}<div className="row-actions"><Link className="text-button" href={`/projects/${p.id}?version=${p.version.id}`}>View version <ArrowUpRight size={16}/></Link>{['draft','changes_requested'].includes(p.version.status)?<Link className="button outline" href={`/submit?project=${p.id}&version=${p.version.id}`}>Continue editing</Link>:['approved','rejected'].includes(p.version.status)&&!p.archived?<button className="button outline" disabled={busy===p.id} onClick={async()=>{setBusy(p.id);setActionError('');try{const next=await send<{id:string;versionId:string}>(`projects/${p.id}/versions`,{});window.location.href=`/submit?project=${next.id}&version=${next.versionId}`;}catch(e){setActionError((e as Error).message);}finally{setBusy('');}}}>Start new version</button>:null}</div></article>)}</section><aside><div className="aside-heading"><h2><Bell size={18}/> Updates</h2>{data?.notifications.some(n=>!n.read)&&<button aria-label="Mark all updates read" className="icon-button" onClick={async()=>{await send('notifications',{});await reload();}}><Check size={18}/></button>}</div>{!data?.notifications.length?<p className="muted panel">Your review updates will arrive here.</p>:data.notifications.map(n=>{const update=readUpdate(n,data.projects);return <Link className={`notification ${n.read?'':'unread'}`} key={n.id} href={`/projects/${n.project_id}`}><p className="update-line"><update.Icon size={15} aria-hidden="true"/><span>{update.unparsed||<>{update.label}{update.project&&<> on <strong>{update.project}</strong></>}</>}</span></p>{update.detail&&<p className="update-detail">{update.detail}</p>}<small>{timeAgo(n.created_at)}</small></Link>;})}</aside></div><section className="saved-section"><h2>Saved inspiration</h2>{data?.saved.length?<div className="saved-grid">{data.saved.map(p=><article className="saved-card panel" key={p.id}><h3><Link href={`/projects/${p.id}`}>{p.version.data.title}</Link></h3><p className="project-meta-line"><span>{p.version.data.teamName}</span></p><p className="saved-summary">{p.version.data.summary}</p><div className="row-actions"><Link className="text-button" href={`/projects/${p.id}`}>View project <ArrowUpRight size={16}/></Link><button type="button" className="text-button" disabled={busy===p.id} onClick={async()=>{setBusy(p.id);setActionError('');try{await send(`projects/${p.id}/bookmark`,{saved:false});await reload();}catch(e){setActionError((e as Error).message);}finally{setBusy('');}}}>{busy===p.id?'Removing…':'Remove from saved'}</button></div></article>)}</div>:<div className="saved-empty panel"><Bookmark size={18} aria-hidden="true"/><p className="muted">Save a published project from its detail page to keep it here.</p><Link className="text-button" href="/projects" target="_blank" rel="noopener noreferrer">Explore projects <ArrowUpRight size={15}/></Link></div>}</section></div>;
}
export default function Workspace(){
 const {data,error,loading,reload}=useData<WorkspaceData>('workspace');
 return <Shell><Gate><WorkspaceContent data={data} error={error} loading={loading} reload={reload}/></Gate></Shell>;
}
