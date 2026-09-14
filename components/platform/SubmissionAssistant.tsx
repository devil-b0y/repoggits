'use client';
import {useState} from 'react';
import {motion,useReducedMotion} from 'framer-motion';
import Link from 'next/link';
import {ArrowUpRight,Check,Download,FileText,Layers,Sparkles,ClipboardCheck,Image as ImageIcon} from 'lucide-react';
import {projectCost,type ProjectData} from '@/lib/schema';
import {applyStarter,starterKits,submissionIssues} from '@/lib/submission-guide';
import {projectDuration} from '@/lib/project-display';
import './submission-assistant.css';

export function SubmissionTools({data,changelog,onChange}:{data:ProjectData;changelog:string;onChange:(data:ProjectData)=>void}){
 const [message,setMessage]=useState('');
 const reduced=useReducedMotion();
 function download(){
  const blob=new Blob([JSON.stringify({format:'repoggits-draft',version:1,exportedAt:new Date().toISOString(),data,changelog},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='repoggits-project-draft.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('Draft downloaded. Uploaded files are referenced by ID; their contents are not included.');
 }
 return <motion.section initial={false} whileInView={{opacity:1,y:0}} className="submission-tools" aria-label="Submission helpers">
  <div className="assistant-heading"><span className="assistant-symbol"><Sparkles size={22}/></span><div><span className="assistant-kicker">A LITTLE HEAD START</span><h2>Less form. More of your idea.</h2><p>Pick a starting point, then make it your own. Existing answers stay yours.</p></div></div>
  <details className="starter-details"><summary><Layers size={18}/><span>Choose a build starter kit<small>Suggested languages, tools and technology tags</small></span><span>+</span></summary><div className="starter-grid">{starterKits.map((kit,i)=><button type="button" key={kit.name} onClick={()=>{onChange(applyStarter(data,i));setMessage(`${kit.name} suggestions added to empty stack fields. Review them under Under the hood.`);}}><strong>{kit.name}</strong><span>{kit.description}</span><small>Use starter <ArrowUpRight size={14}/></small></button>)}</div></details>
  <div className="assistant-utilities"><button type="button" onClick={download}><Download size={16}/> Download draft JSON</button><Link href="/projects/e3213918-fb91-4c55-bef3-faf5ca96cec4" target="_blank">See a complete example <ArrowUpRight size={16}/></Link><a href="#submission-review"><ClipboardCheck size={16}/> Check readiness</a></div>
  {message&&<motion.p key={message} initial={reduced?false:{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.2}} className="assistant-message" role="status">{message}</motion.p>}
 </motion.section>;
}

export function StoryHelper({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const scaffold='The problem\nDescribe who needed help and what was difficult.\n\nOur solution\nExplain how the project works, step by step.\n\nWhat we learned\nShare a challenge, how you solved it, and what you would improve next.';
 return <div className="story-helper"><FileText size={17}/><p><strong>A good story answers three questions.</strong><span>What was the problem? How did you solve it? What did you learn?</span></p><button type="button" disabled={!!value.trim()} onClick={()=>onChange(scaffold)}>Use writing outline</button></div>;
}

export function SubmissionReview({data,changelog}:{data:ProjectData;changelog:string}){
 const issues=submissionIssues(data,changelog);
 const reduced=useReducedMotion();
 const optional=[['Cover image',!!data.coverId],['Gallery',data.galleryIds.length>0],['Working demo',!!data.videoUrl||!!data.liveUrl],['Source ZIP',!!data.sourceId],['Feature highlights',data.features.some(f=>f.trim())],['Team photos',data.team.length>0&&data.team.every(m=>m.photoId)]] as const;
 return <div className="submission-review" id="submission-review" tabIndex={-1}>
  <div className="assistant-heading"><span className="assistant-symbol"><ClipboardCheck size={23}/></span><div><span className="assistant-kicker">THE FINAL LOOK</span><h3>Ready for its next chapter?</h3><p>Check your project as a reader would see it.</p></div></div>
  <div className="review-project"><div className="review-cover">{data.coverId?<img src={`/api/files/${data.coverId}`} alt="Submission cover"/>:<ImageIcon size={35}/>}</div><div><span className="assistant-kicker">{data.type} · {data.year}</span><h3>{data.title||'Your project title'}</h3><p>{data.summary||'Your short description will appear here.'}</p><small>{data.teamName||'Your team'} · {data.department}</small></div></div>
  <dl className="review-facts"><div><dt>Team</dt><dd>{data.team.length} {data.team.length===1?'maker':'makers'}</dd></div><div><dt>Build time</dt><dd>{projectDuration(data.startDate,data.endDate)||'Dates not added'}</dd></div><div><dt>Total cost</dt><dd>{data.currency} {projectCost(data).toLocaleString(undefined,{maximumFractionDigits:2})}</dd></div></dl>
  {data.stack.languages&&<p className="review-languages"><strong>Languages</strong> {data.stack.languages}</p>}
  {data.features.some(f=>f.trim())&&<ul className="review-features">{data.features.filter(f=>f.trim()).slice(0,6).map((f,i)=><li key={i}><Check size={15}/>{f}</li>)}</ul>}
  <motion.div key={issues.length===0?'ready':'in-progress'} initial={reduced?false:{opacity:0,y:5}} animate={{opacity:1,y:0}} transition={{duration:.2}} className={`readiness ${issues.length?'needs-work':'ready'}`}><strong>{issues.length?`${issues.length} things to finish before review`:'All required details are ready'}</strong><p>{issues.length?'You can save a draft while you work through these.':'Submitting sends this version to your educators for approval.'}</p>{issues.length>0&&<ul>{issues.map((issue,i)=><li key={i}><a href={`#studio-section-${issue.section}`}>{issue.message}<ArrowUpRight size={14}/></a></li>)}</ul>}</motion.div>
  <details className="review-extras"><summary>Make it shine · optional additions ({optional.filter(([,done])=>done).length}/{optional.length})</summary><div>{optional.map(([label,done])=><span key={label} className={done?'complete':''}>{done?<Check size={14}/>:<span aria-hidden="true">○</span>}{label}</span>)}</div></details>
 </div>;
}
