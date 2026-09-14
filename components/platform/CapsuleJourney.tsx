'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {AnimatePresence,motion} from 'framer-motion';
import {ArrowDown,ArrowUpRight,Box,CirclePlay,Code2,Cpu,Pause,Play,Users} from 'lucide-react';
import Deferred from './Deferred';
import {Magnetic,Words,group,rise,useStill} from './MotionKit';
const CapsuleModel=dynamic(()=>import('./CapsuleModel'),{ssr:false});

const chapters=[
  {label:'The capsule',tag:'project.capsule',icon:Box,title:'Everything a project is, in one place.',text:'Every project on Repoggits is packed the same way, so the next maker knows exactly where to look.'},
  {label:'The code',tag:'src/',icon:Code2,title:'Source you can actually read.',text:'Versioned files, a clear README and the languages used, ready to download and build on.'},
  {label:'The build',tag:'ESP32 + sensors',icon:Cpu,title:'The wiring, not just the result.',text:'Boards, parts and photos of every experiment, including the ones that failed the first time.'},
  {label:'The people',tag:'makers + mentor',icon:Users,title:'Credit for everyone who made it.',text:'Team members, their roles and their mentors stay attached to the project wherever it travels.'},
  {label:'The demo',tag:'demo video',icon:CirclePlay,title:'Proof that it runs.',text:'Screens, a video or a live link, so anyone can watch it work before they open the code.'},
];
const clamp01=(value:number)=>Math.min(1,Math.max(0,value));
// Same rule as CapsuleModel: a chosen chapter rests mid-way through its fifth of the journey.
const chapterPoint=(index:number)=>index<=0?0:(index+.5)/chapters.length;

/** The pinned hero: the capsule opens one layer per chapter as the page scrolls, or as the chapter buttons choose. */
export default function CapsuleJourney({paused,setPaused}:{paused:boolean;setPaused:(value:boolean)=>void}){
  const root=useRef<HTMLElement>(null),stage=useRef<HTMLDivElement>(null);
  const [scrolled,setScrolled]=useState(0),[picked,setPicked]=useState(0),[pinned,setPinned]=useState(true),[reduced,setReduced]=useState(false);
  const still=useStill();
  // Scroll drives the story only while the stage is pinned and moving; otherwise the chapter buttons do.
  const driven=pinned&&!paused&&!reduced;
  const chapter=driven?scrolled:picked;
  useEffect(()=>{if(driven)setPicked(scrolled);},[driven,scrolled]);
  useEffect(()=>{
    const el=root.current,sticky=stage.current;if(!el||!sticky)return;
    const preference=matchMedia('(prefers-reduced-motion: reduce)');let frame=0;
    const measure=()=>{if(frame)return;frame=requestAnimationFrame(()=>{
      frame=0;setPinned(getComputedStyle(sticky).position==='sticky');setReduced(preference.matches);
      const bounds=el.getBoundingClientRect(),progress=clamp01(-bounds.top/Math.max(1,bounds.height-innerHeight));
      el.dataset.progress=progress.toFixed(3);setScrolled(Math.min(chapters.length-1,Math.floor(progress*chapters.length)));
    });};
    measure();
    window.addEventListener('scroll',measure,{passive:true});window.addEventListener('resize',measure);preference.addEventListener('change',measure);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',measure);window.removeEventListener('resize',measure);preference.removeEventListener('change',measure);};
  },[]);
  function select(index:number){
    setPicked(index);
    const el=root.current;
    if(driven&&el)window.scrollTo({top:scrollY+el.getBoundingClientRect().top+(el.offsetHeight-innerHeight)*chapterPoint(index),behavior:'instant'});
  }
  const active=chapters[chapter],Icon=active.icon;
  return <section ref={root} className="capsule-journey" data-chapter={chapter} data-driven={driven} data-still={still} aria-label="A project capsule, opened one layer at a time">
    <div ref={stage} className="capsule-stage">
      <div className="capsule-grid" aria-hidden="true"/>
      {/* Remounting when motion stops lets an in-flight entrance land on its final pose instead of freezing midway. */}
      <motion.div className="capsule-intro" key={still?'still':'live'} initial="hidden" animate="show" variants={group}>
        <motion.span className="capsule-kicker" variants={rise}><i aria-hidden="true"/>REPOGGITS / THE STUDENT PROJECT COLLECTIVE</motion.span>
        <motion.h1 variants={group}><Words text="Good ideas deserve to be"/> <em><Words text="built on."/></em></motion.h1>
        <motion.p variants={rise}>Every project here travels as a capsule: the code, the build, the people and a demo, packed so the next maker can open it and keep going.</motion.p>
        <motion.div className="hero-actions" variants={rise}>
          <Magnetic><Link className="button orange" href="/projects" target="_blank" rel="noopener noreferrer">Explore projects <ArrowUpRight size={18}/></Link></Magnetic>
          <Link className="capsule-link" href="/submit">Share your project <ArrowUpRight size={16}/></Link>
        </motion.div>
      </motion.div>
      <div className="capsule-chapter">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={chapter} initial={{opacity:0,y:16,rotateX:-14}} animate={{opacity:1,y:0,rotateX:0}} exit={{opacity:0,y:-12,rotateX:12}} transition={{duration:.3,ease:[.16,1,.3,1]}} style={{transformPerspective:900}}>
            <span className="capsule-chapter-number">0{chapter+1} / 0{chapters.length} · {active.label}</span>
            <h2>{active.title}</h2>
            <p>{active.text}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="capsule-controls">
        <div className="capsule-chapters" role="group" aria-label="Capsule chapters">
          {chapters.map((item,i)=><button key={item.label} type="button" aria-label={`0${i+1} ${item.label}`} aria-pressed={chapter===i} onClick={()=>select(i)}>
            {chapter===i&&<motion.i layoutId="capsule-chapter-pill" className="capsule-pill" aria-hidden="true" transition={{type:'spring',stiffness:380,damping:32}}/>}
            <b>0{i+1}</b><span>{item.label}</span>
          </button>)}
        </div>
        <button type="button" className="capsule-pause" aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?<Play size={15}/>:<Pause size={15}/>}<span>{paused?'Resume capsule motion':'Pause capsule motion'}</span></button>
      </div>
      <div className="capsule-visual">
        <div className="capsule-placeholder" aria-hidden="true">{[0,1,2,3,4].map(i=><span key={i}/>)}</div>
        <Deferred when="idle"><CapsuleModel paused={paused} pinned={pinned} chapter={chapter}/></Deferred>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={chapter} className="capsule-tag" aria-hidden="true" initial={{opacity:0,y:14,scale:.92}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-12,scale:.96}} transition={{type:'spring',stiffness:320,damping:26}}><Icon size={15}/>{active.tag}</motion.span>
        </AnimatePresence>
        <a href="#capsule-contents" className="capsule-scroll"><ArrowDown size={16}/><span>{driven?'Scroll to open the capsule':'See what a capsule holds'}</span></a>
        <span className="capsule-note">ILLUSTRATIVE PROJECT CAPSULE</span>
      </div>
    </div>
  </section>;
}
