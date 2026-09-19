'use client';
import {useState,type ReactNode} from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {motion,useReducedMotion} from 'framer-motion';
const StudioStepObject=dynamic(()=>import('./StudioStepObject'),{ssr:false});
import {ArrowLeft,ArrowUpRight,Check,Code2,Image as ImageIcon,Layers,Sparkles,Users,NotebookPen,ShieldCheck} from 'lucide-react';
import type {ProjectData} from '@/lib/schema';
import {buildStackKeys} from '@/lib/submission-guide';
import './submission-studio.css';
import './submission-polish.css';

export const studioSections=['The big idea','People & process','Under the hood','Show your work','What it took','This chapter'];
const chapterTools=[[['figma','Figma'],['notion','Notion']],[['github','GitHub'],['notion','Notion']],[['react','React'],['github','GitHub']],[['obs','OBS Studio'],['youtube','YouTube']],[['excel','Excel'],['sheets','Google Sheets']],[['notion','Notion'],['github','GitHub']]];
const chapterCopy=[
 {title:'Your idea.',accent:'Its next chapter.',description:'You made something worth sharing. Give it a home with the demo, the people, and the story behind the build.',cta:'Let\u2019s tell your story',note:'Start anywhere. Save a draft. Make it yours.'},
 {title:'Great work.',accent:'Real people.',description:'Introduce the makers behind the project. Credit every contribution, add team photos, and tell us when your build took shape.',cta:'Meet your team',note:'Every contribution deserves its place.'},
 {title:'Inside the build.',accent:'Every connection.',description:'Show the technologies that make it work. Choose your languages, stack, services, and the tools behind your decisions.',cta:'Build your stack',note:'Software, hardware, or a little of both.'},
 {title:'Show the spark.',accent:'Let it work.',description:'Bring your project to life with a cover, a working demo, and the details only a photograph can show. Add source files for the next maker.',cta:'Show your work',note:'A real demonstration makes the difference.'},
 {title:'What it took.',accent:'Down to the detail.',description:'Break down the parts, tools, and services that brought your idea to life. Help the next team plan their own build.',cta:'Plan the breakdown',note:'Small details make a project easier to recreate.'},
 {title:'One last look.',accent:'Ready to share.',description:'Review your project and write this version\u2019s changelog. Save your progress or send it to your educators for review.',cta:'Review your chapter',note:'Your work. Your credit. Your next chapter.'}
];
export default function SubmissionStudio({data,editing,children}:{data:ProjectData;editing:boolean;children:ReactNode}){
  const [step,setStep]=useState(1);
  const copy=chapterCopy[step-1],reduced=useReducedMotion();
  const checklist=[['A memorable title',data.title.trim().length>=3],['The idea in a few words',data.summary.trim().length>=20],['The people behind it',data.team.some(m=>m.name.trim()&&m.contribution.trim())],['Tools & technologies',data.tags.some(t=>t.trim())||buildStackKeys.some(key=>data.stack[key].trim())],['A cover worth clicking',!!data.coverId],['Source for the next maker',!!data.sourceId]] as const;
  const complete=checklist.filter(([,done])=>done).length;
  return <div className="submission-studio">
    <header className="studio-hero">
      <div className="studio-hero-copy">
        <Link href="/workspace"><ArrowLeft size={14}/> Your workspace</Link>
        <span className="studio-eyebrow"><NotebookPen size={14}/> THE PROJECT STUDIO <span>{editing?'NEXT VERSION':'NEW PROJECT'} / {step}/6</span></span>
        <motion.h1 key={`heading-${step}`} initial={reduced?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:.4}}>{copy.title}<br/><em>{copy.accent}</em></motion.h1>
        <p>{copy.description}</p>
        <a className="studio-start" href={`#studio-section-${step}`}>{copy.cta} <ArrowUpRight size={18}/></a>
        <div className="studio-hero-note"><NotebookPen size={15}/><span>{copy.note}</span></div>
      </div>
      <div className="studio-hero-art studio-chapter-art"><StudioStepObject step={step}/><div className="studio-tool-examples" aria-label="Example tools for this step"><span>EXAMPLE TOOLS</span><div>{chapterTools[step-1].map(([asset,name])=><motion.span key={asset} className="studio-tool-badge" initial={reduced?false:{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.25}}><span><img src={`/images/studio-tools/${asset}.svg`} alt="" width={24} height={24}/></span>{name}</motion.span>)}</div></div></div>
      <div className="studio-benefits"><span><NotebookPen size={17}/> Room for unfinished ideas</span><span><Users size={17}/> Credit for every teammate</span><span><ShieldCheck size={17}/> Reviewed before publication</span></div>
    </header>
    <div className="studio-layout"><aside className="studio-sidebar"><div className="studio-sidebar-inner"><nav aria-label="Project form sections"><div className="studio-sidebar-label">YOUR PROJECT NOTEBOOK <span>STEP {step} OF 6</span></div>{studioSections.map((title,i)=><a key={title} href={`#studio-section-${i+1}`} aria-current={step===i+1?'step':undefined} onClick={e=>{e.preventDefault();setStep(i+1);}}><span>{String(i+1).padStart(2,'0')}</span><strong>{title}</strong><ArrowUpRight size={13}/></a>)}</nav><div className="studio-preview"><div className="studio-preview-heading"><span>COMING TO LIFE</span><span>LIVE PREVIEW</span></div><div className={`studio-preview-cover ${data.coverId?'has-cover':''}`}>{data.coverId?<img src={`/api/files/${data.coverId}`} alt="Your project cover preview"/>:<><ImageIcon size={30}/><span>Your cover goes here</span></>}<b>{data.type}</b></div><h2>{data.title.trim()||'Your next great idea'}</h2><p>{data.summary.trim()||'A little context turns a project into a story. Your short description will appear here.'}</p><div className="studio-preview-tags">{data.tags.filter(t=>t.trim()).slice(0,3).map((tag,i)=><span key={`${tag}-${i}`}>{tag}</span>)}</div><small>{data.teamName||'Your team'} · {data.department}</small></div><div className="studio-checklist"><div><strong>Make your story shine</strong><span>{complete}/6</span></div><progress aria-label="Showcase suggestions added" value={complete} max={6}/><p>Optional pointers for a richer project page.</p><ul>{checklist.map(([label,done])=><li key={label} className={done?'is-done':''}>{done?<Check size={13}/>:<span className="studio-check-empty"/>}{label}</li>)}</ul></div></div></aside><div className="studio-form-main"><div className="studio-form-content" data-step={step} onClick={e=>{const a=(e.target as HTMLElement).closest('a[href^="#studio-section-"]');if(!a)return;e.preventDefault();const n=Number(a.getAttribute('href')!.replace('#studio-section-',''));if(n>=1&&n<=6)setStep(n);}}>{children}</div><div className="studio-step-nav">{step>1?<button type="button" className="button outline" onClick={()=>setStep(s=>s-1)}><ArrowLeft size={15}/> Back</button>:<span/>}<span className="studio-step-indicator">Step {step} of 6</span>{step<6&&<button type="button" className="button blue" onClick={()=>setStep(s=>s+1)}>{studioSections[step]} <ArrowUpRight size={15}/></button>}</div></div></div>
  </div>;
}
