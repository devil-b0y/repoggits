'use client';

import {useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {motion} from 'framer-motion';
import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import {ArrowDown,ArrowUpRight,Check,Pause,Play} from 'lucide-react';
import {useStill,Magnetic} from './MotionKit';
import './engineer-story.css';

const Scene=dynamic(()=>import('./WorkshopScene'),{ssr:false,loading:()=> <div className="engineer-loading" aria-hidden="true">An idea is taking shape.</div>});
const chapters=[
 {short:'Imagine',word:'WHAT IF',time:'DAY 01 / A QUESTION IN CLASS',title:'Every engineer',accent:'starts here.',copy:'A blank notebook. A problem worth solving. And a small question that refuses to leave: what if I could build it?',note:'The idea: a plant that tells you what it needs.'},
 {short:'Code',word:'BUILD',time:'11:48 PM / JUST ONE MORE LINE',title:'Turn curiosity',accent:'into code.',copy:'The hostel gets quiet. Your editor doesn’t. One function, one sensor reading, one tiny breakthrough at a time.',note:'Read the sensor. Find the pattern. Make it useful.'},
 {short:'Connect',word:'CONNECT',time:'DAY 12 / BACK AT THE LAB',title:'Off the screen.',accent:'Into the world.',copy:'An ESP32. A few jumper wires. Suddenly, the thing in your notebook is a thing you can hold.',note:'Soil → sensor → ESP32 → something that matters.'},
 {short:'Iterate',word:'AGAIN',time:'ATTEMPT 07 / THE BEAUTIFUL MESS',title:'It doesn’t work.',accent:'Until it does.',copy:'A loose wire. An unexpected reading. A teammate who spots what you missed. Test it, question it, make it better.',note:'Progress isn’t a straight line. That’s engineering.'},
 {short:'Share',word:'GO FURTHER',time:'DEMO DAY / THIS IS ONLY THE START',title:'You made it.',accent:'Pass it on.',copy:'The working demo is only part of the story. Share the code, the costs, the team, and everything you learned along the way.',note:'Your last semester’s project. Someone’s next big idea.'},
];

export default function EngineerStory({paused,setPaused}:{paused:boolean;setPaused:(value:boolean)=>void}){
 const root=useRef<HTMLElement>(null),stage=useRef<HTMLDivElement>(null),progress=useRef(0),trigger=useRef<ScrollTrigger|null>(null),pausedRef=useRef(paused);
 const [chapter,setChapter]=useState(0),[immersive,setImmersive]=useState(false);const still=useStill();
 useEffect(()=>{pausedRef.current=paused;},[paused]);
 useEffect(()=>{
  gsap.registerPlugin(ScrollTrigger);const el=root.current!,screen=stage.current!,media=gsap.matchMedia();let disposed=false;
  media.add('(min-width: 901px) and (min-height: 650px) and (prefers-reduced-motion: no-preference)',()=>{
   setImmersive(true);el.dataset.immersive='true';
   const panels=gsap.utils.toArray<HTMLElement>('.engineer-panel',el),ghosts=gsap.utils.toArray<HTMLElement>('.engineer-ghost',el);
   const initialFocus=document.activeElement instanceof HTMLElement&&screen.contains(document.activeElement)?document.activeElement:null;
   let previous=-1;let refreshFocus:HTMLElement|null=null;
   const preserveFocus=()=>{const focused=document.activeElement;refreshFocus=focused instanceof HTMLElement&&screen.contains(focused)?focused:null;};
   const restoreFocus=()=>{refreshFocus?.focus({preventScroll:true});refreshFocus=null;};
   ScrollTrigger.addEventListener('refreshInit',preserveFocus);ScrollTrigger.addEventListener('refresh',restoreFocus);
   const setChapterAt=(value:number)=>{
    const p=Math.min(value,0.99999),index=Math.floor(p*5);progress.current=value;
    el.style.setProperty('--story-progress',String(value));el.dataset.chapter=String(index);
    if(previous!==index){previous=index;setChapter(index);panels.forEach((panel,i)=>{panel.inert=i!==index;panel.setAttribute('aria-hidden',String(i!==index));});}
   };
   const timeline=gsap.timeline({scrollTrigger:{trigger:el,pin:screen,start:'top top',end:()=>`+=${innerHeight*4.5}`,scrub:.65,anticipatePin:1,invalidateOnRefresh:true,
    onUpdate:self=>{if(pausedRef.current){timeline.progress(self.progress);setChapterAt(self.progress);}}},onUpdate:()=>setChapterAt(timeline.progress())});
   gsap.set(panels.slice(1),{autoAlpha:0,y:55});gsap.set(ghosts.slice(1),{autoAlpha:0,xPercent:15});
   const clock={value:0};timeline.to(clock,{value:1,duration:5,ease:'none'},0);
   panels.forEach((panel,i)=>{
    if(i>0)timeline.to(panel,{autoAlpha:1,y:0,duration:.25,ease:'power2.out'},i).to(ghosts[i],{autoAlpha:1,xPercent:0,duration:.4,ease:'power2.out'},i);
    if(i>0)timeline.fromTo(panel.querySelector('.engineer-art'),{y:85,rotationY:-18,scale:.85},{y:0,rotationY:0,scale:1,duration:.48,ease:'power2.out'},i+.03);
    if(i<4)timeline.to(panel,{autoAlpha:0,y:-40,duration:.2,ease:'power1.in'},i+.83).to(ghosts[i],{autoAlpha:0,xPercent:-10,duration:.25},i+.83);
   });
   const wave=el.querySelector<SVGPathElement>('.engineer-wave')!;
   timeline.fromTo(wave,{strokeDasharray:wave.getTotalLength(),strokeDashoffset:wave.getTotalLength()},{strokeDashoffset:0,duration:.6,ease:'none'},3.06);
   trigger.current=timeline.scrollTrigger!;setChapterAt(0);
   initialFocus?.focus({preventScroll:true});
   document.fonts.ready.then(()=>{if(!disposed)ScrollTrigger.refresh();});
   return()=>{ScrollTrigger.removeEventListener('refreshInit',preserveFocus);ScrollTrigger.removeEventListener('refresh',restoreFocus);trigger.current=null;progress.current=0;setImmersive(false);el.dataset.immersive='false';panels.forEach(panel=>{panel.inert=false;panel.removeAttribute('aria-hidden');});};
  });
  return()=>{disposed=true;media.revert();};
 },[]);
 useEffect(()=>{
  if(immersive)return;
  const observer=new IntersectionObserver(entries=>{
   const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
   if(visible)setChapter(Number(visible.target.id.replace('engineer-','')));
  },{threshold:[.3,.6]});
  root.current?.querySelectorAll('.engineer-panel').forEach(panel=>observer.observe(panel));
  return()=>observer.disconnect();
 },[immersive]);
 function goTo(index:number){
  const active=trigger.current;
  if(active){const value=(index+.3)/5;window.scrollTo({top:active.start+(active.end-active.start)*value,behavior:still?'instant':'smooth'});}
  else document.getElementById(`engineer-${index}`)?.scrollIntoView({behavior:still?'instant':'smooth',block:'start'});
 }
 return <section className="engineer-story" ref={root} aria-label="An engineer’s journey" data-immersive={immersive}>
  <div className="engineer-stage" ref={stage}>
   <div className="engineer-topline"><Link href="/projects">REPOGGITS / THE STUDENT PROJECT COLLECTIVE <ArrowUpRight size={13}/></Link><span>GGITS + GGCT</span></div>
   <div className="engineer-grid" aria-hidden="true"/><div className="engineer-orbit" aria-hidden="true"/>
   <div className="engineer-ghosts" aria-hidden="true">{chapters.map(item=><span className="engineer-ghost" key={item.word}>{item.word}</span>)}</div>
   <div className="engineer-object"><Scene paused={paused} mode={0} storyProgress={progress}/><span className="engineer-object-caption">THE MAKER’S DESK <i/> REALTIME 3D</span></div>
   <div className="engineer-panels">{chapters.map((item,i)=><article id={`engineer-${i}`} key={item.short} className={`engineer-panel engineer-panel-${i}`}>
    <div className="engineer-copy"><span className="engineer-eyebrow"><i/> {item.time}</span>{i===0?<h1>{item.title}<br/><em>{item.accent}</em></h1>:<h2>{item.title}<br/><em>{item.accent}</em></h2>}<p>{item.copy}</p>
     {i===0?<div className="engineer-start"><button type="button" onClick={()=>goTo(1)}>Scroll to become <ArrowDown size={16}/></button><a href="#possibilities">Skip the story <ArrowUpRight size={14}/></a></div>:i===4?<Magnetic><Link className="engineer-submit" href="/submit">Share your project <ArrowUpRight size={18}/></Link></Magnetic>:null}
    </div>
    <div className="engineer-art" aria-hidden="true">
     {i===0?<div className="engineer-notebook"><small>FIELD NOTES / 001</small><strong>What if plants<br/>could talk?</strong><svg viewBox="0 0 230 90"><path d="M28 65h45v-27H28zM50 37V14m0 14c-18 0-20-16-20-16s20-3 20 16m0-4c0-18 22-19 22-19s0 19-22 19M80 54h32m-7-6 8 6-8 6M130 35h52v38h-52zM140 44h32m-32 8h22m-22 8h28"/></svg><span>soil + sensor + a little curiosity</span></div>:null}
     {i===1?<div className="engineer-terminal"><div><span/><span/><span/><small>plant-monitor.cpp</small></div><code><b>void</b> loop() {'{'}<br/>&nbsp; moisture = <b>readSensor</b>();<br/>&nbsp; <b>if</b> (moisture &lt; 30) {'{'}<br/>&nbsp;&nbsp; <em>notify</em>("A little water?");<br/>&nbsp; {'}'}<br/>{'}'}</code><footer>● DEVICE CONNECTED <span>23:48</span></footer></div>:null}
     {i===2?<div className="engineer-photo"><img src="/images/maker-story/circuit.webp" alt="" width={1536} height={1024} loading="lazy"/><span>From a sketch to the first signal. ↗</span></div>:null}
     {i===3?<div className="engineer-test"><span>SERIAL MONITOR / LIVE</span><svg viewBox="0 0 260 90"><path className="engineer-wave" d="M0 65h20l8-20 10 35 15-60 18 50 16-37 14 29 17-9 18 5h23l9-5 12 5h80"/></svg><div><span><Check size={14}/> Sensor calibrated</span><span><Check size={14}/> Connection stable</span><span><Check size={14}/> Demo ready</span></div><small>Failed attempts are still steps forward.</small></div>:null}
     {i===4?<div className="engineer-published"><div><img src="/images/workshop/campusflow.webp" alt="" width={1000} height={660} loading="lazy"/><span><Check size={13}/> READY FOR THE NEXT MAKER</span></div><strong>Built by students.<br/>Shared with everyone.</strong><small>Demo. Source. Team. The whole story.</small></div>:null}
    </div><span className="engineer-handnote">{item.note}</span>
   </article>)}</div>
   <div className="engineer-bottom"><div className="engineer-chapters" role="group" aria-label="Engineering story chapters">{chapters.map((item,i)=><button key={item.short} type="button" aria-pressed={chapter===i} onClick={()=>goTo(i)}><span>0{i+1}</span>{item.short}{chapter===i&&<motion.i layoutId="engineer-active" transition={{duration:still?0:.25}}/>}</button>)}</div><button className="engineer-pause" onClick={()=>setPaused(!paused)} aria-label={paused?'Resume homepage animation':'Pause homepage animation'}>{paused?<Play size={15}/>:<Pause size={15}/>}</button><span className="engineer-page">0{chapter+1} <i>/</i> 05</span></div>
   <div className="engineer-progress" aria-hidden="true"/>
  </div>
 </section>;
}
