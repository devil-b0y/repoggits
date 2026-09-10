'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Bookmark, Download, Star, Heart, GitFork, CalendarDays, Clock3, Code2 } from 'lucide-react';
import { Shell, Notice, Card, PageTitle, Loading, useData, useSession, send, api } from './shared';
import { projectCost, type Project } from '@/lib/schema';
import { projectDuration } from '@/lib/project-display';
import ProjectMedia from './ProjectMedia';
import Discussion, { type Comment } from './Discussion';

type DetailData={project:Project;editable:boolean;saved:boolean;starred:boolean;liked:boolean;original:{id:string;version_id:string;number:number;title:string;team_name:string}|null;modifications:{id:string;title:string;team_name:string}[];versions:{id:string;number:number;status:string;changelog:string;createdAt:string}[];comments:Comment[];reviews:{action:string;reason:string;name:string;created_at:string}[];related:Project[]};
const displayDate=(date:string)=>new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});

function Content({id}:{id:string}){
 const [version,setVersion]=useState(''),[actionError,setActionError]=useState(''),[busy,setBusy]=useState(false);
 const {user}=useSession();
 useEffect(()=>{setVersion(new URLSearchParams(window.location.search).get('version')||'');void send(`projects/${id}/view`,{}).catch(()=>{});},[id]);
 const {data,error,loading,reload,setData}=useData<DetailData>(`projects/${id}${version?`?version=${version}`:''}`);
 async function action(task:()=>Promise<void>){setBusy(true);setActionError('');try{await task();}catch(e){setActionError((e as Error).message);}finally{setBusy(false);}}
 if(loading&&!data)return <Loading/>;
 if(error||!data)return <div className="page-wrap"><Notice error>{error||'Project not found.'}</Notice><Link href="/projects">Back to projects</Link></div>;
 const p=data.project,d=p.version.data,duration=projectDuration(d.startDate,d.endDate),published=p.version.status==='approved';
 const hardware=d.hardwareCosts.reduce((sum,row)=>sum+Math.round(row.unitCost*100)*row.quantity,0)/100;
 const software=d.softwareCosts.reduce((sum,row)=>sum+Math.round(row.amount*100),0)/100;
 const react=(kind:'star'|'like')=>action(async()=>{const result=await send<{active:boolean;stars:number;likes:number}>(`projects/${id}/reactions`,{kind,active:kind==='star'?!data.starred:!data.liked});setData(current=>current?{...current,[kind==='star'?'starred':'liked']:result.active,project:{...current.project,stars:result.stars,likes:result.likes}}:current);});
 return <div className="page-wrap detail-page">
  <Link className="text-button" href="/projects"><ArrowLeft size={16}/> Back to the collective</Link>
  <PageTitle eyebrow={`${d.type.toUpperCase()} / ${d.department.toUpperCase()}`} title={d.title} description={d.summary}/>
  <div className="detail-meta"><span>By {d.teamName}</span><span>{d.year}</span><span>Version {p.version.number}</span><span>{p.views} views</span><span>{p.downloads} downloads</span><span className={`status-tag ${p.version.status}`}>{p.version.status.replaceAll('_',' ')}</span></div>
  {p.example&&<Notice>Sample project with a fictional team, AI-generated portraits, and illustrative costs. The live demo, screenshots, video, and source ZIP are working examples.</Notice>}
  {actionError&&<Notice error>{actionError}</Notice>}
  <div className="project-reactions" aria-label="Project appreciation">
    <button className="button outline" aria-label="Star project" aria-pressed={data.starred} disabled={busy||!published} onClick={()=>void react('star')}><Star size={18} fill={data.starred?'currentColor':'none'}/><span>{p.stars} {p.stars===1?'star':'stars'}</span></button>
    <button className="button outline" aria-label="Like project" aria-pressed={data.liked} disabled={busy||!published} onClick={()=>void react('like')}><Heart size={18} fill={data.liked?'currentColor':'none'}/><span>{p.likes} {p.likes===1?'like':'likes'}</span></button>
    <a className="text-button" href="#discussion">Join the discussion</a><span className="muted">Stars move great projects to the top.</span>
  </div>
  {p.parentProjectId&&<div className="lineage-banner"><GitFork size={19}/><div><strong>A new take on an existing idea</strong>{data.original?<p>Built on <Link className="inline-link" href={`/projects/${data.original.id}?version=${data.original.version_id}`}>{data.original.title}, version {data.original.number}</Link> by {data.original.team_name}.</p>:<p>The original project is currently unavailable.</p>}</div></div>}
  <div className="detail-layout"><div>
    <ProjectMedia key={p.version.id} project={p}/>
    <div className="build-facts">
      <div><CalendarDays size={19}/><span>Completed</span><strong>{d.endDate?displayDate(d.endDate):'In progress'}</strong></div>
      <div><Clock3 size={19}/><span>Development time</span><strong>{duration||'Not specified'}</strong></div>
      <div><Code2 size={19}/><span>Languages</span><strong>{d.stack.languages||'Not specified'}</strong></div>
    </div>
    <section className="detail-section"><h2>About the project</h2><p className="preserve-lines">{d.description||'The project story is still being written.'}</p>{d.features.length>0&&<><h3>Feature highlights</h3><ul className="feature-list">{d.features.map((feature,i)=><li key={i}>{feature}</li>)}</ul></>}</section>
    <section className="detail-section"><h2>Meet the team</h2><p>The people behind {d.teamName}.</p><div className="team-grid">{d.team.map((member,i)=><article className="team-profile" key={i}>{member.photoId?<img src={`/api/files/${member.photoId}`} alt={`${member.name}, team member`} loading="lazy"/>:<span className="team-avatar-placeholder" aria-hidden="true">{member.name.slice(0,1)}</span>}<div><h3>{member.name}</h3><p>{member.contribution}</p><dl><div><dt>College</dt><dd>{member.college||'Not listed'}</dd></div><div><dt>Branch</dt><dd>{member.branch||'Not listed'}</dd></div><div><dt>Semester</dt><dd>{member.semester||'Not listed'}</dd></div></dl></div></article>)}</div></section>
    <section className="detail-section"><h2>Services used</h2><p>Hosting, APIs, databases, and other services that make it work.</p>{d.services.length?<div className="service-grid">{d.services.map((service,i)=><article className="service-card" key={i}><h3>{service.name}</h3><p>{service.purpose||'Supporting service'}</p>{service.url&&<a href={service.url} className="inline-link" target="_blank" rel="noopener noreferrer">Visit service <ArrowUpRight size={14}/></a>}</article>)}</div>:<p>No external services listed.</p>}</section>
    <section className="detail-section"><h2>The build, by the numbers</h2>
      <div className="cost-summary"><div><span>Hardware cost</span><strong>{d.currency} {hardware.toFixed(2)}</strong></div><div><span>Software & services cost</span><strong>{d.currency} {software.toFixed(2)}</strong></div></div>
      {d.hardwareCosts.length+d.softwareCosts.length>0?<div className="table-scroll"><table><thead><tr><th>Item</th><th>Category</th><th>Quantity</th><th>Unit cost</th><th>Total ({d.currency})</th></tr></thead><tbody>{d.hardwareCosts.map((row,i)=><tr key={`h${i}`}><td>{row.name}</td><td>Hardware</td><td>{row.quantity}</td><td>{row.unitCost.toFixed(2)}</td><td>{(row.quantity*row.unitCost).toFixed(2)}</td></tr>)}{d.softwareCosts.map((row,i)=><tr key={`s${i}`}><td>{row.name}</td><td>Software / service</td><td>1</td><td>{row.amount.toFixed(2)}</td><td>{row.amount.toFixed(2)}</td></tr>)}</tbody></table></div>:<p>{d.openSource?'Built with free / open-source software.':'No costs listed.'}</p>}
      <div className="cost-total">Total project cost <strong>{d.currency} {projectCost(d).toFixed(2)}</strong></div>
    </section>
    <section className="detail-section"><h2>Modified builds</h2><p>See how other teams have extended this project. Every published modification credits its original.</p>{data.modifications.length?<div className="modification-list">{data.modifications.map(m=><Link key={m.id} href={`/projects/${m.id}`}><GitFork size={20}/><span><strong>{m.title}</strong><small>By {m.team_name}</small></span><ArrowUpRight size={18}/></Link>)}</div>:<p>No approved modifications yet.</p>}{published&&<button className="button outline" disabled={busy} onClick={()=>void action(async()=>{const result=await send<{id:string;versionId:string}>(`projects/${id}/modify`,{versionId:p.version.id});window.location.assign(`/submit?project=${result.id}&version=${result.versionId}`);})}><GitFork size={17}/> Create a modified version</button>}</section>
    <Discussion projectId={id} comments={data.comments} onComment={comment=>setData(current=>current?{...current,comments:[...current.comments,comment]}:current)} published={published}/>
  </div><aside className="project-sidebar">
    <div className="panel"><h2>Build on this idea</h2><div className="sidebar-actions">
      {d.liveUrl&&<a href={d.liveUrl} target="_blank" rel="noopener noreferrer" className="button blue">Live demo <ArrowUpRight size={16}/></a>}
      {d.github&&<a href={d.github} target="_blank" rel="noopener noreferrer" className="button outline">GitHub repository <ArrowUpRight size={16}/></a>}
      {d.sourceId?<button className="button blue" disabled={busy} onClick={()=>void action(async()=>{const result=await api<{url:string}>(`files/${d.sourceId}/sign`);window.location.assign(result.url);})}>Download source <Download size={16}/></button>:<p className="muted">Source archive not attached.</p>}
      {published&&<button className="button outline" disabled={busy} onClick={()=>void action(async()=>{await send(`projects/${id}/bookmark`,{saved:!data.saved});await reload();})}><Bookmark size={16} fill={data.saved?'currentColor':'none'}/>{data.saved?'Remove from saved':'Save project'}</button>}
      {data.editable&&['draft','changes_requested'].includes(p.version.status)&&<Link className="button blue" href={`/submit?project=${id}&version=${p.version.id}`}>Edit draft</Link>}
      {!user&&<Link className="inline-link" href="/auth">Sign in to download, star, or contribute</Link>}
    </div><h3>The toolkit</h3><div className="tags">{d.tags.map(tag=><span key={tag}>{tag}</span>)}</div><dl>{Object.entries(d.stack).filter(([,v])=>v).map(([k,v])=><div key={k}><dt className="capitalize">{k}</dt><dd>{v}</dd></div>)}</dl><h3>Build timeline</h3><dl><div><dt>Subject</dt><dd>{d.subject}</dd></div>{d.startDate&&<div><dt>Started</dt><dd>{displayDate(d.startDate)}</dd></div>}{d.endDate&&<div><dt>Completed</dt><dd>{displayDate(d.endDate)}</dd></div>}{duration&&<div><dt>Time taken</dt><dd>{duration}</dd></div>}{d.purchaseDate&&<div><dt>Parts purchased</dt><dd>{displayDate(d.purchaseDate)}</dd></div>}</dl></div>
    <section className="panel history"><h2>Version notebook</h2>{data.versions.map(v=><details key={v.id} open={v.id===p.version.id}><summary>Version {v.number} <span className="status-tag">{v.status.replaceAll('_',' ')}</span></summary><p>{v.changelog||'Changelog in progress.'}</p><small>{new Date(v.createdAt).toLocaleDateString()}</small><button className="text-button" onClick={()=>{setVersion(v.id);window.history.replaceState({},'',`/projects/${id}?version=${v.id}`);}}>View this version <ArrowUpRight size={14}/></button></details>)}</section>
    {data.reviews.length>0&&<section className="panel"><h2>Review notes</h2>{data.reviews.map((r,i)=><div className="review-note" key={i}><strong>{r.name}  -  {r.action.replaceAll('_',' ')}</strong><p>{r.reason||'Approved without additional notes.'}</p></div>)}</section>}
  </aside></div>
  {data.related.length>0&&<section className="saved-section"><h2>Keep the curiosity going.</h2><div className="project-grid">{data.related.map(r=><Card project={r} key={r.id}/>)}</div></section>}
 </div>;
}
export default function Detail({id}:{id:string}){return <Shell><Content id={id}/></Shell>;}
