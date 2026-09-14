'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowDown,Check,Power,Radio,Unplug} from 'lucide-react';
import {motion,useScroll,useTransform} from 'framer-motion';
import {Words,group,inView,rise,useStill} from './MotionKit';
import './circuit-scene.css';

const steps=[
  {label:'Connect',title:'One connection at a time.',detail:'The board, the sensor, and a little curiosity.',icon:Unplug},
  {label:'Upload',title:'Give the idea its instructions.',detail:'A few lines of code. A whole new possibility.',icon:Power},
  {label:'It works',title:'That first “it works” moment.',detail:'The reading arrives. The prototype comes alive.',icon:Check},
];

/** Matching photographic poses share a fixed camera; only the hand changes. */
export default function CircuitScene({paused,pose=0}:{paused:boolean;pose?:number}){
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const el=root.current;if(!el)return;
    const media=matchMedia('(prefers-reduced-motion: reduce)');let visible=false;
    const refresh=()=>{el.dataset.motion=paused||media.matches||!visible||document.hidden?'paused':'running';};
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;refresh();});
    observer.observe(el);media.addEventListener('change',refresh);document.addEventListener('visibilitychange',refresh);refresh();
    return()=>{observer.disconnect();media.removeEventListener('change',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[paused]);
  return <div ref={root} className="circuit-scene" data-motion="paused" data-pose={pose} role="img" aria-label="Animated project illustration: a student connects an ESP32 prototype, presses its button, and tests the sensor">
    <picture><source media="(max-width:680px)" srcSet="/images/maker-story/circuit-mobile.webp"/><img src="/images/maker-story/circuit.webp" alt="" width={1536} height={1024} loading="lazy" draggable={false}/></picture>
    <picture className="circuit-hand"><source media="(max-width:680px)" srcSet="/images/maker-story/circuit-next-mobile.webp"/><img src="/images/maker-story/circuit-next.webp" alt="" width={1536} height={1024} loading="lazy" draggable={false}/></picture>
    <span className="circuit-led" aria-hidden="true"/>
  </div>;
}

export function CircuitChapter({paused}:{paused:boolean}){
  const root=useRef<HTMLElement>(null),manual=useRef<number|null>(null),[active,setActive]=useState(0);
  const [reduced,setReduced]=useState(false);
  const still=useStill();
  // Only the photograph moves in depth: controls above it must stay put, or a scroll to reach them clears the chosen stage.
  const {scrollYProgress}=useScroll({target:root,offset:['start end','start 15%']});
  const scale=useTransform(scrollYProgress,[0,1],[1.24,1.02]),rotateX=useTransform(scrollYProgress,[0,1],[12,0]);
  useEffect(()=>{
    const el=root.current;if(!el)return;
    const media=matchMedia('(prefers-reduced-motion: reduce)');let frame=0,visible=false;
    const update=()=>{if(frame)return;frame=requestAnimationFrame(()=>{
      frame=0;setReduced(media.matches);el.dataset.motion=media.matches?'reduced':paused?'paused':'running';
      if(!visible)return;
      const b=el.getBoundingClientRect(),p=Math.max(0,Math.min(1,(innerHeight*.7-b.top)/(b.height+innerHeight*.1)));
      const progress=paused||media.matches?(manual.current??.5):manual.current??p;
      setActive(Math.min(2,Math.floor(progress*3)));el.dataset.progress=progress.toFixed(3);
      el.style.setProperty('--circuit-progress',String(progress));
      el.style.setProperty('--circuit-press',String(Math.max(0,Math.min(1,(progress-.18)*3))));
      el.style.setProperty('--circuit-parallax',paused||media.matches?'0px':`${(p-.5)*70}px`);
    });};
    const scroll=()=>{if(!paused&&!media.matches)manual.current=null;update();};
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;update();},{rootMargin:'150px'});observer.observe(el);
    window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('resize',update);media.addEventListener('change',update);update();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',scroll);window.removeEventListener('resize',update);media.removeEventListener('change',update);};
  },[paused]);
  const select=(index:number)=>{manual.current=(index+.5)/3;setActive(index);const el=root.current;if(el){el.dataset.progress=manual.current.toFixed(3);el.style.setProperty('--circuit-progress',String(manual.current));el.style.setProperty('--circuit-press',index===0?'0':'1');}};
  return <section ref={root} className="photo-chapter circuit-chapter" data-step={active} aria-labelledby="circuit-title">
    <div className="circuit-photograph"><motion.div className="circuit-depth" style={still?undefined:{scale,rotateX,transformPerspective:1200}}><CircuitScene paused={paused||reduced} pose={active}/></motion.div></div>
    <div className="circuit-shade"/>
    <div className="circuit-grid" aria-hidden="true"><span/><span/><span/><span/></div>
    <motion.div className="photo-chapter-copy" variants={group} {...inView}><motion.span variants={rise}>II / THE MAKER’S NOTEBOOK</motion.span><motion.h2 id="circuit-title" variants={group}><Words text="Inside"/><br/><em><Words text="the idea."/></em></motion.h2><motion.p variants={rise}>Every connection has a story.<br/>Follow this one, down to the last jumper wire.</motion.p></motion.div>
    <div className="circuit-readout" aria-hidden="true"><span><Radio size={13}/> THE FIRST SIGNAL</span><strong>{active===0?'— —':active===1?'···':'68'}<small>%</small></strong><div className="circuit-wave">{Array.from({length:24},(_,i)=><i key={i} style={{height:`${16+Math.sin(i*.65)*12+i%3*7}px`}}/>)}</div><small>{active===0?'WAITING FOR CONNECTION':active===1?'UPLOADING THE IDEA':'SOIL MOISTURE / EXAMPLE READING'}</small></div>
    <div className="circuit-bottom"><div className="circuit-caption"><span><ArrowDown size={13}/> A LITTLE SCROLL. A LITTLE PROGRESS.</span><h3>{steps[active].title}</h3><p>{steps[active].detail}</p></div><div className="circuit-steps" role="group" aria-label="Prototype activity">{steps.map((step,i)=><button key={step.label} type="button" onClick={()=>select(i)} aria-pressed={active===i}><step.icon size={17}/><span><small>0{i+1}</small>{step.label}</span></button>)}</div></div>
    <span className="circuit-illustration-note">AN ILLUSTRATIVE STUDENT BUILD</span>
  </section>;
}
