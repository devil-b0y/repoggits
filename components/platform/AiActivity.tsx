'use client';
import {useMemo,useState} from 'react';
import {PauseCircle,PlayCircle,Search} from 'lucide-react';
import type {AiRequestView} from '@/lib/ai-usage';
import {Notice,send,useData} from './shared';
import './ai-activity.css';

const outcomes={pending:'In progress',completed:'Draft returned',blocked:'Refused',failed:'Failed'} as const;
const tagClass={pending:'pending',completed:'approved',blocked:'rejected',failed:'changes_requested'} as const;

export default function AiActivity(){
 const {data,error,loading,reload}=useData<{retentionDays:number;requests:AiRequestView[]}>('admin/ai-requests');
 const [query,setQuery]=useState(''),[outcome,setOutcome]=useState('all'),[busy,setBusy]=useState(''),[actionError,setActionError]=useState(''),[notice,setNotice]=useState('');
 const requests=useMemo(()=>{const q=query.trim().toLowerCase();return (data?.requests||[]).filter(r=>(outcome==='all'||r.status===outcome)&&(!q||`${r.name} ${r.email} ${r.prompt}`.toLowerCase().includes(q)));},[data,query,outcome]);
 const busiest=useMemo(()=>{
  const since=Date.now()-86400000,people=new Map<string,{userId:string;name:string;email:string;aiBlocked:boolean;total:number;refused:number}>();
  for(const r of data?.requests||[]){if(Date.parse(r.createdAt)<since)continue;const person=people.get(r.userId)??{userId:r.userId,name:r.name,email:r.email,aiBlocked:r.aiBlocked,total:0,refused:0};person.total++;if(r.status==='blocked')person.refused++;people.set(r.userId,person);}
  return [...people.values()].sort((a,b)=>b.total-a.total).slice(0,8);
 },[data]);
 async function setAccess(userId:string,name:string,blocked:boolean){
  setBusy(userId);setActionError('');setNotice('');
  try{await send('admin/ai-access',{id:userId,blocked},'PATCH');setNotice(blocked?`${name} can no longer use the Gemini assistant.`:`${name} can use the Gemini assistant again.`);await reload();}
  catch(e){setActionError((e as Error).message);}finally{setBusy('');}
 }
 const accessButton=(userId:string,name:string,blocked:boolean)=><button type="button" className="text-button" disabled={busy===userId} aria-label={`${blocked?'Restore':'Pause'} AI access for ${name}`} onClick={()=>void setAccess(userId,name,!blocked)}>{blocked?<PlayCircle size={16}/>:<PauseCircle size={16}/>}{blocked?'Restore AI access':'Pause AI access'}</button>;
 if(loading&&!data)return <p className="muted" role="status">Loading AI activity…</p>;
 return <section className="ai-activity" aria-labelledby="ai-activity-title">
  <div className="panel"><h2 id="ai-activity-title">Gemini assistant activity</h2><p className="ai-intro">Every prompt sent to the project assistant, newest first, with the account that sent it. Prompts are stored encrypted and deleted after {data?.retentionDays??180} days. Only Super Admins can see this page.</p></div>
  {(error||actionError)&&<Notice error>{error||actionError}</Notice>}{notice&&<Notice>{notice}</Notice>}
  {busiest.length>0&&<div className="panel"><h3>Most active in the last 24 hours</h3><ul className="ai-people">{busiest.map(person=><li key={person.userId}><div><strong>{person.name}</strong><small>{person.email}</small></div><span>{person.total} {person.total===1?'request':'requests'}{person.refused?` · ${person.refused} refused`:''}</span>{accessButton(person.userId,person.name,person.aiBlocked)}</li>)}</ul></div>}
  <div className="panel ai-filters"><label>Search prompts, names or emails<span><Search size={16} aria-hidden="true"/><input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></span></label><label>Outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="all">All outcomes</option>{Object.entries(outcomes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><span className="muted">{requests.length} of {data?.requests.length||0} shown</span></div>
  {!requests.length&&<div className="empty-state panel"><h3>No matching requests.</h3><p>Prompts appear here as soon as someone uses the assistant.</p></div>}
  {requests.map(r=><article className="panel ai-request" key={r.id}>
   <header><div><strong>{r.name}</strong><small>{r.email} · {r.role}{r.aiBlocked?' · AI access paused':''}</small></div><span className={`status-tag ${tagClass[r.status]}`}>{outcomes[r.status]}</span><time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString()}</time></header>
   <details><summary>Prompt · {r.promptChars.toLocaleString()} characters</summary><p className="ai-prompt">{r.prompt||'This prompt could not be decrypted with the current key.'}</p></details>
   <p className="ai-outcome">{r.status==='completed'?`Returned: ${r.fields.join(', ')||'no fields'}`:r.reason||'Waiting for Gemini'}{r.durationMs!==null?` · ${(r.durationMs/1000).toFixed(1)}s`:''}</p>
   {accessButton(r.userId,r.name,r.aiBlocked)}
  </article>)}
 </section>;
}
