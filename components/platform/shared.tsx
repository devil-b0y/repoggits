'use client';
import { createContext, useContext, useEffect, useState, useCallback, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Layers, Menu, X, LogOut, Moon, Sun, Play, Star, Heart } from 'lucide-react';
import type { User, Project } from '@/lib/schema';
import './platform.css';

export async function api<T=Record<string,unknown>>(path:string,options:RequestInit={}):Promise<T> {
  const response=await fetch(`/api/${path}`,{...options,headers:{...(options.body&&typeof options.body==='string'?{'Content-Type':'application/json'}:{}),...options.headers}});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Request failed.');
  return data;
}
export const send=<T=Record<string,unknown>>(path:string,body:unknown,method='POST')=>api<T>(path,{method,body:JSON.stringify(body)});
export function useData<T>(path:string) {
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const reload=useCallback(async()=>{setError('');setLoading(true);try{setData(await api<T>(path));}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[path]);
  useEffect(()=>{void reload();},[reload]);
  return {data,error,loading,reload,setData};
}
type Session={user:User|null;loading:boolean;uploadsAvailable:boolean;emailVerificationRequired:boolean;refresh:()=>Promise<void>};
const SessionContext=createContext<Session>({user:null,loading:true,uploadsAvailable:false,emailVerificationRequired:true,refresh:async()=>{}});
export const useSession=()=>useContext(SessionContext);
export function Shell({children}:{children:ReactNode}) {
  const session=useData<{user:User|null;uploadsAvailable:boolean;emailVerificationRequired:boolean}>('auth/me');
  const [menu,setMenu]=useState(false),[dark,setDark]=useState(false);
  useEffect(()=>{try{setDark(localStorage.getItem('repoggits-theme')==='dark');}catch{}},[]);
  function toggle(){const next=!dark;setDark(next);try{localStorage.setItem('repoggits-theme',next?'dark':'light');}catch{}}
  return <SessionContext.Provider value={{user:session.data?.user||null,loading:session.loading&&!session.data,uploadsAvailable:!!session.data?.uploadsAvailable,emailVerificationRequired:session.data?.emailVerificationRequired??true,refresh:session.reload}}><div className={`platform ${dark?'dark':''}`}><a className="skip-link" href="#content">Skip to content</a><div className="site-coordinate">A PLACE FOR IDEAS TO GO FURTHER ↗</div><header className="nav"><Link className="brand" href="/" aria-label="Repoggits home"><Layers size={24}/>repoggits<sup>®</sup></Link><nav className={menu?'nav-links open':'nav-links'} aria-label="Main navigation"><Link href="/projects" target="_blank" rel="noopener noreferrer" onClick={()=>setMenu(false)}>Explore projects</Link><Link href="/workspace">My workspace</Link>{session.data?.user?.role&&session.data.user.role!=='student'&&<Link href="/admin">Review desk</Link>}<Link href={session.data?.user?'/account':'/auth'}>{session.data?.user?'My profile':'Sign in'}</Link></nav><div className="nav-actions"><button aria-label={dark?'Use light theme':'Use dark theme'} className="icon-button" onClick={toggle}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><Link href="/submit" className="button orange nav-submit">Share your project <ArrowUpRight size={16}/></Link><button className="menu-toggle" aria-label="Toggle navigation" aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></div></header>{session.error&&<div className="page-wrap"><Notice error>{session.error} <button onClick={()=>void session.reload()}>Retry connection</button></Notice></div>}<main id="content">{children}</main><footer><div><Link href="/" className="brand"><Layers size={22}/> repoggits</Link><span>A little shared knowledge goes a long way.</span></div><div><span>BUILT WITH CURIOSITY. SHARED WITH EVERYONE.</span><a href="/api/feed">Project RSS feed <ArrowUpRight size={15}/></a></div></footer></div></SessionContext.Provider>;
}
export function Notice({children,error=false}:{children:ReactNode;error?:boolean}) {return <div className={error?'notice error':'notice'} role={error?'alert':'status'}>{children}</div>;}
export function Loading(){return <div className="page-wrap loading-state" role="status">Opening the notebook…</div>;}
export function Gate({children,admin=false}:{children:ReactNode;admin?:boolean}) {
  const {user,loading,emailVerificationRequired}=useSession();
  if(loading)return <Loading/>;
  if(!user)return <div className="page-wrap gate"><div className="eyebrow">YOUR NEXT CHAPTER</div><h1>Make yourself at home.</h1><p>Sign in to save inspiration and share your work.</p><Link className="button blue" href="/auth">Sign in <ArrowUpRight size={17}/></Link></div>;
  if(admin&&user.role==='student')return <div className="page-wrap"><Notice error>This space is reserved for assigned reviewers.</Notice></div>;
  if(emailVerificationRequired&&!user.verified)return <VerificationGate/>;
  return <>{children}</>;
}
function VerificationGate(){
  const {user,refresh}=useSession();
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[requested,setRequested]=useState(false);
  return <div className="page-wrap gate"><h1>Check your inbox.</h1><p>Verify your email before submitting or reviewing projects.</p><button className="button blue" disabled={busy} onClick={async()=>{setBusy(true);try{const r=await send<{message:string}>('auth/resend',{});setMessage(r.message);setRequested(true);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}>Send verification again</button>{requested&&user&&<CodeFollowUp purpose="verify" email={user.email} onDone={async m=>{setMessage(m);await refresh();}}/>}{message&&<Notice>{message}</Notice>}</div>;
}
// The link and the 6-digit code emailed alongside it are two independent ways to finish the same
// pending verify/reset — this is the code-entry half, used here and from the /auth page itself.
export function CodeFollowUp({purpose,email,needsPassword=false,label='Use a code instead',onDone}:{purpose:'verify'|'reset';email:string;needsPassword?:boolean;label?:string;onDone:(message:string)=>void}) {
  const [code,setCode]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');try{const r=await send<{message?:string}>(`auth/${purpose}`,{email,code,...(needsPassword?{password}:{})});onDone(r.message||'Done.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <form onSubmit={submit} className="code-follow-up"><label>6-digit code<input required pattern="\d{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>{needsPassword&&<label>Choose a password<input type="password" required minLength={15} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/><small>Use at least 15 characters. A memorable passphrase works well.</small></label>}<button className="button outline full-width" disabled={busy}>{busy?'Please wait…':label}</button>{error&&<Notice error>{error}</Notice>}</form>;
}
export function Card({project}:{project:Project}) {
  const d=project.version.data;
  return <article className="project-card"><Link className="project-preview" href={`/projects/${project.id}${d.videoUrl?'?play=1':''}`} aria-label={`View ${d.title}`}><ProjectCover project={project}/><span className="project-badge">{project.example?'SAMPLE PROJECT':project.featured?'STAFF PICK':d.type.toUpperCase()}</span>{d.videoUrl&&<span className="card-video-label"><Play size={14} fill="currentColor"/> Watch demo</span>}<span className="preview-arrow"><ArrowUpRight size={20}/></span></Link><div className="project-meta"><span>{d.department}</span><span>{d.year}</span></div><h3><Link href={`/projects/${project.id}`}>{d.title}</Link></h3><p className="card-summary">{d.summary}</p><div className="tags">{d.tags.slice(0,4).map(tag=><span key={tag}>{tag}</span>)}</div><div className="card-community"><span><Star size={15}/> {project.stars} stars</span><span><Heart size={15}/> {project.likes} likes</span>{project.parentProjectId&&<span>Modified build</span>}</div><div className="card-bottom"><span>{d.teamName}</span><span>{project.views} views · {project.downloads} downloads</span></div></article>;
}
export function ProjectCover({project}:{project:Project}) {
  const d=project.version.data;
  return d.coverId?<img className="project-cover" src={`/api/files/${d.coverId}`} alt={`${d.title} cover`} loading="lazy"/>:<div className={`project-art cover-${d.type.toLowerCase()}`} aria-hidden="true"><div className="art-grid"/><div className="cover-monogram">{d.type==='Hardware'?'< >':d.type==='Hybrid'?'{ + }':'{ / }'}</div><span className="art-marker">{d.type.toUpperCase()} / {d.teamName.toUpperCase()}</span></div>;
}
export function PageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description?:string;action?:ReactNode}) {return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>;}
export function Logout(){const {refresh}=useSession();return <button className="text-button" onClick={async()=>{await send('auth/logout',{});await refresh();window.location.href='/';}}><LogOut size={16}/> Sign out</button>;}
