'use client';
import Link from 'next/link';
import {motion,useReducedMotion} from 'framer-motion';
import {ArrowUpRight,Check,Clock3,GraduationCap,BookOpen,Users,ShieldCheck,GitBranch} from 'lucide-react';
import type {Project} from '@/lib/schema';
import {Notice} from './shared';
import './review-card.css';

export default function ReviewCard({project,selected,busy,duplicate,onSelect,onApprove}:{project:Project;selected:boolean;busy:boolean;duplicate:boolean;onSelect:(selected:boolean)=>void;onApprove:()=>void}){
 const reduced=useReducedMotion(),p=project.version,d=p.data;
 const reveal={hidden:{opacity:0,y:12},visible:{opacity:1,y:0}};
 return <motion.article className={`review-card panel rq-card${selected?' is-selected':''}`} aria-label={`Review ${d.title}`} initial={reduced?false:'hidden'} whileInView="visible" viewport={{once:true,amount:.12}} variants={{hidden:{opacity:0,y:18},visible:{opacity:1,y:0,transition:{duration:.45,ease:[.22,1,.36,1],staggerChildren:reduced?0:.07}}}}>
  <div className="rq-top"><label className="rq-selection"><input type="checkbox" aria-label={`Select ${d.title}`} checked={selected} disabled={busy} onChange={e=>onSelect(e.target.checked)}/><span>Select for review</span></label><span className="rq-pending"><Clock3 size={14} aria-hidden="true"/>Pending review<span>v{p.number}</span></span></div>
  <motion.div className="rq-intro" variants={reveal} transition={{duration:reduced?0:.45,ease:[.22,1,.36,1]}}><span className="rq-eyebrow">{d.type} / PROJECT SUBMISSION</span><h2>{d.title}</h2><p>{d.summary}</p></motion.div>
  <motion.div className="rq-facts" variants={reveal} transition={{duration:reduced?0:.4}}>{[{label:'Department',value:d.department,Icon:GraduationCap},{label:'Subject',value:d.subject||'Not specified',Icon:BookOpen},{label:'Created by',value:d.teamName,Icon:Users}].map(({label,value,Icon})=><div className="rq-fact" key={label}><span className="rq-fact-icon"><Icon size={20} strokeWidth={1.5} aria-hidden="true"/></span><div><span>{label}</span><strong>{value}</strong></div></div>)}<div className="rq-approval"><ShieldCheck size={23} strokeWidth={1.5} aria-hidden="true"/><div><strong>{p.approvals}<span> / {p.requiredApprovals}</span></strong><span>approvals received</span></div></div></motion.div>
  <motion.div className="review-changelog rq-changelog" variants={reveal} transition={{duration:reduced?0:.4}}><span className="rq-change-icon"><GitBranch size={21} aria-hidden="true"/></span><div><strong>What changed in this version</strong><p>{p.changelog||'No changelog provided.'}</p></div></motion.div>
  {duplicate&&<Notice>A matching project title or repository exists. Check for duplicates before approving.</Notice>}
  <div className="rq-actions"><Link className="text-button rq-inspect" href={`/projects/${project.id}?version=${p.id}`}>Inspect full submission <ArrowUpRight size={18}/></Link><motion.button className="button blue rq-approve" disabled={busy} onClick={onApprove} whileHover={reduced?undefined:{y:-2}} whileTap={reduced?undefined:{y:0}} transition={{duration:.2}}><Check size={18}/>{busy?'Saving review...':'Approve version'}</motion.button></div>
 </motion.article>;
}
