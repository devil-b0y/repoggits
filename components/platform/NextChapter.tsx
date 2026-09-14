'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight,ArrowRight,Code2,Check,GitBranch,Layers,Play} from 'lucide-react';
import {motion} from 'framer-motion';
import {Magnetic,Words,group,inView,rise,useTilt} from './MotionKit';
import './next-chapter.css';

const steps=[
  {title:'Build something.',label:'The spark',text:'Software, hardware, or a little of both. Every thoughtful idea has a place.'},
  {title:'Share the process.',label:'The story',text:'Add your team, costs, technologies, and source. Your educators review each submission.'},
  {title:'Keep it growing.',label:'The next version',text:'Publish new versions with a changelog. Earlier approved versions stay available.'},
];
const clamp=(value:number)=>Math.max(0,Math.min(1,value));
function paintJourney(el:HTMLElement,progress:number,manual=false){
  el.dataset.progress=progress.toFixed(3);
  el.style.setProperty('--chapter-progress',String(progress));
  el.style.setProperty('--chapter-build',String(manual?1:clamp(progress*3)));
  el.style.setProperty('--chapter-share',String(manual?1:clamp(progress*3-1)));
  el.style.setProperty('--chapter-grow',String(manual?1:clamp(progress*3-2)));
}
export default function NextChapter({paused}:{paused:boolean}){
  const root=useRef<HTMLElement>(null),theatre=useRef<HTMLDivElement>(null),manualSelection=useRef<{scroll:number}|null>(null),[active,setActive]=useState(0);
  const tilt=useTilt(6);
  useEffect(()=>{const el=root.current;if(!el)return;const preference=matchMedia('(prefers-reduced-motion: reduce)');let frame=0;
    const update=()=>{if(frame)return;frame=requestAnimationFrame(()=>{
      frame=0;const still=paused||preference.matches;el.dataset.motion=still?'paused':'running';
      if(still||document.hidden||!theatre.current)return;
      // Measure the illustration rather than the taller mobile section so every
      // chapter plays while its cards are still in view, without scroll pinning.
      const b=theatre.current.getBoundingClientRect();
      const progress=clamp((innerHeight*.85-b.top)/(innerHeight*.7+b.height*.3));
      const selection=manualSelection.current;
      if(selection&&Math.abs(scrollY-selection.scroll)<Math.max(100,innerHeight*.16))return;
      manualSelection.current=null;
      paintJourney(el,progress);el.style.setProperty('--chapter-turn',`${(progress-.5)*18}deg`);
      const next=Math.min(2,Math.floor(progress*3));setActive(current=>current===next?current:next);
    });};
    update();window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);document.addEventListener('visibilitychange',update);preference.addEventListener('change',update);
    const observer=new ResizeObserver(update);if(theatre.current)observer.observe(theatre.current);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',update);window.removeEventListener('resize',update);document.removeEventListener('visibilitychange',update);preference.removeEventListener('change',update);};
  },[paused]);
  const selectStep=(step:number)=>{manualSelection.current={scroll:scrollY};setActive(step);if(root.current)paintJourney(root.current,(step+1)/3,true);};
  return <section ref={root} id="how-it-works" className={`next-chapter ${paused?'chapter-paused':''}`} data-active={active} aria-labelledby="next-chapter-title">
    <div className="chapter-grid" aria-hidden="true"/><div className="chapter-top"><span>V / YOUR NEXT CHAPTER</span><span>A SMALL START. AN OPEN END.</span></div>
    <div className="chapter-main"><motion.div className="chapter-copy" variants={group} {...inView}><motion.h2 id="next-chapter-title" variants={group}><Words text="Make it."/><br/><Words text="Share it."/><br/><em><Words text="Move it forward."/></em></motion.h2><motion.p variants={rise}>Great work starts with you.<br/>It goes further, together.</motion.p><motion.div variants={rise}><Magnetic><Link href="/submit" className="button orange">Add your chapter <ArrowUpRight size={18}/></Link></Magnetic></motion.div><span className="chapter-handnote">Every good idea starts somewhere.</span></motion.div>
    <motion.div ref={theatre} className="chapter-theatre" data-step={active} role="img" aria-label={`Project journey illustration: ${steps[active].title}`} style={tilt.still?undefined:tilt.style} {...tilt.handlers}>
      <div className="chapter-halo"/><div className="chapter-halo halo-two"/><span className="chapter-axis axis-top">IDEA / PROCESS / POSSIBILITY</span>
      <div className="chapter-objects">
        <div className="chapter-object chapter-code"><div className="chapter-window"><span/><span/><span/><small>your-next-idea.ts</small></div><Code2 size={33}/><div className="chapter-code-lines"><i/><i/><i/><i/><i/></div><div className="chapter-code-footer"><span>01</span><b>It starts with a spark.</b></div></div>
        <div className="chapter-object chapter-folder"><div className="chapter-folder-tab">THE PROJECT FILE</div><div className="chapter-file-preview"><Play size={26} fill="currentColor"/><span>THE MOMENT<br/>IT WORKS.</span><i className="chapter-video-progress"/></div><div className="chapter-file-details"><span><Layers size={14}/> Demo, team &amp; source</span><span><Check size={14}/> Ready for review</span></div><span className="chapter-folder-stamp">MADE<br/>BY YOU ↗</span></div>
        <div className="chapter-object chapter-versions"><GitBranch size={32}/><div className="chapter-version-row"><span>v1.0</span><i/><small>The first working idea</small></div><div className="chapter-version-row"><span>v1.1</span><i/><small>A little more possibility</small></div><div className="chapter-version-row"><span>v2.0</span><i/><small>Someone’s next chapter</small></div><b>Good ideas keep going.</b></div>
        <span className="chapter-attachment attachment-readme">README.md<Code2 size={13}/></span><span className="chapter-attachment attachment-team">THE PEOPLE<Layers size={13}/></span>
      </div><div className="chapter-reel" aria-hidden="true"><i/>{steps.map((step,i)=><span key={step.label} data-reached={active>=i}/>)}</div><span className="chapter-scene-caption">0{active+1} / {steps[active].label}</span><span className="chapter-scene-star" aria-hidden="true">✳</span>
    </motion.div></div>
    <motion.div className="chapter-track" role="group" aria-label="Explore the project journey" variants={group} {...inView}>{steps.map((step,i)=><motion.button variants={rise} key={step.title} type="button" aria-pressed={active===i} onClick={()=>selectStep(i)}><span className="chapter-step-number">0{i+1}</span><span className="chapter-step-copy"><strong>{step.title}</strong><span>{step.text}</span></span><ArrowRight size={18}/></motion.button>)}</motion.div>
    <div className="chapter-foot"><span>YOUR WORK DOESN’T END AT SUBMISSION.</span><span>IT BECOMES A STARTING POINT.</span></div>
  </section>;
}
