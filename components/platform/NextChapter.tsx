'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight,ArrowRight,Code2,Check,GitBranch,Layers,Play} from 'lucide-react';
import './next-chapter.css';

const steps=[
  {title:'Build something.',label:'The spark',text:'Software, hardware, or a little of both. Every thoughtful idea has a place.'},
  {title:'Share the process.',label:'The story',text:'Add your team, costs, technologies, and source. Your educators review each submission.'},
  {title:'Keep it growing.',label:'The next version',text:'Publish new versions with a changelog. Earlier approved versions stay available.'},
];
export default function NextChapter({paused}:{paused:boolean}){
  const root=useRef<HTMLElement>(null),[active,setActive]=useState(0);
  useEffect(()=>{const el=root.current;if(!el)return;const preference=matchMedia('(prefers-reduced-motion: reduce)');let frame=0;
    const update=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const b=el.getBoundingClientRect();const p=paused||preference.matches?0:Math.max(-1,Math.min(1,(innerHeight*.5-b.top-b.height*.5)/innerHeight));el.style.setProperty('--chapter-turn',`${p*9}deg`);el.dataset.motion=paused||preference.matches?'paused':'running';});};
    update();window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);preference.addEventListener('change',update);return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',update);window.removeEventListener('resize',update);preference.removeEventListener('change',update);};
  },[paused]);
  return <section ref={root} id="how-it-works" className={`next-chapter ${paused?'chapter-paused':''}`} aria-labelledby="next-chapter-title">
    <div className="chapter-grid" aria-hidden="true"/><div className="chapter-top"><span>V / YOUR NEXT CHAPTER</span><span>A SMALL START. AN OPEN END.</span></div>
    <div className="chapter-main"><div className="chapter-copy"><h2 id="next-chapter-title">Make it.<br/>Share it.<br/><em>Move it forward.</em></h2><p>Great work starts with you.<br/>It goes further, together.</p><Link href="/submit" className="button orange">Add your chapter <ArrowUpRight size={18}/></Link><span className="chapter-handnote">Every good idea starts somewhere.</span></div>
    <div className="chapter-theatre" data-step={active} role="img" aria-label={`Project journey illustration: ${steps[active].title}`}>
      <div className="chapter-halo"/><div className="chapter-halo halo-two"/><span className="chapter-axis axis-top">IDEA / PROCESS / POSSIBILITY</span>
      <div className="chapter-objects">
        <div className="chapter-object chapter-code"><div className="chapter-window"><span/><span/><span/><small>your-next-idea.ts</small></div><Code2 size={33}/><div className="chapter-code-lines"><i/><i/><i/><i/><i/></div><div className="chapter-code-footer"><span>01</span><b>It starts with a spark.</b></div></div>
        <div className="chapter-object chapter-folder"><div className="chapter-folder-tab">THE PROJECT FILE</div><div className="chapter-file-preview"><Play size={26} fill="currentColor"/><span>THE MOMENT<br/>IT WORKS.</span></div><div className="chapter-file-details"><span><Layers size={14}/> Demo, team &amp; source</span><span><Check size={14}/> Ready for review</span></div><span className="chapter-folder-stamp">MADE<br/>BY YOU ↗</span></div>
        <div className="chapter-object chapter-versions"><GitBranch size={32}/><div className="chapter-version-row"><span>v1.0</span><i/><small>The first working idea</small></div><div className="chapter-version-row"><span>v1.1</span><i/><small>A little more possibility</small></div><div className="chapter-version-row"><span>v2.0</span><i/><small>Someone’s next chapter</small></div><b>Good ideas keep going.</b></div>
      </div><span className="chapter-scene-caption">0{active+1} / {steps[active].label}</span><span className="chapter-scene-star" aria-hidden="true">✳</span>
    </div></div>
    <div className="chapter-track" role="group" aria-label="Explore the project journey">{steps.map((step,i)=><button key={step.title} type="button" aria-pressed={active===i} onClick={()=>setActive(i)}><span className="chapter-step-number">0{i+1}</span><span className="chapter-step-copy"><strong>{step.title}</strong><span>{step.text}</span></span><ArrowRight size={18}/></button>)}</div>
    <div className="chapter-foot"><span>YOUR WORK DOESN’T END AT SUBMISSION.</span><span>IT BECOMES A STARTING POINT.</span></div>
  </section>;
}
