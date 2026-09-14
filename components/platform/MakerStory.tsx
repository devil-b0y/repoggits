'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {motion,useMotionValue,useScroll,useSpring,useTransform,type MotionValue} from 'framer-motion';
import {ArrowDown,ArrowUpRight,Code2,Pause,Play,Radio,Users} from 'lucide-react';
import CodingScene from './CodingScene';
import CircuitScene from './CircuitScene';
import TeamScene from './TeamScene';
import dynamic from 'next/dynamic';
import Deferred from './Deferred';
import {Magnetic,Words,group,rise,useStill} from './MotionKit';
const MakerObjects=dynamic(()=>import('./MakerObjects'),{ssr:false});

const scenes=[
  {image:'coding-v2',label:'The idea',title:'Good ideas.',accent:'Start with you.',description:'One curious mind. A few lines of code. Something worth sharing.',alt:'Illustration of a college student coding on a laptop'},
  {image:'circuit',label:'The build',title:'Small board.',accent:'Big possibility.',description:'Show the wiring, the code, the experiments—and the moment it finally works.',alt:'Illustrated close-up of an ESP32 board, jumper wires and a soil sensor'},
  {image:'team',label:'The people',title:'Made by you.',accent:'Better together.',description:'Give your project a home. Give the next maker a place to start.',alt:'Illustration of three engineering students testing a connected plant prototype'},
];
const chips=[
  {icon:Code2,label:'project.ts',note:'Idea compiled',className:'chip-code',depth:28},
  {icon:Radio,label:'ESP32',note:'First signal',className:'chip-signal',depth:46},
  {icon:Users,label:'3 makers',note:'One shared idea',className:'chip-team',depth:18},
];
export function StoryImage({name,alt,eager=false}:{name:string;alt:string;eager?:boolean}){return <picture><source media="(max-width:680px)" srcSet={`/images/maker-story/${name}-mobile.webp`}/><img src={`/images/maker-story/${name}.webp`} alt={alt} width={1536} height={1024} loading={eager?'eager':'lazy'} fetchPriority={eager?'high':'auto'} draggable={false}/></picture>;}

/** A floating note that sits in front of the artwork and drifts by its own depth. */
function HeroChip({chip,pointerX,pointerY,progress}:{chip:typeof chips[number];pointerX:MotionValue<number>;pointerY:MotionValue<number>;progress:MotionValue<number>}){
  const still=useStill();
  const x=useTransform(pointerX,[0,1],[chip.depth,-chip.depth]);
  const y=useTransform([pointerY,progress],([p,s]:number[])=>(p-.5)*-chip.depth-s*chip.depth*2.5);
  const Icon=chip.icon;
  return <motion.div className={`hero-chip ${chip.className}`} variants={rise} style={still?undefined:{x,y}}><Icon size={15}/><span><b>{chip.label}</b><small>{chip.note}</small></span></motion.div>;
}

export default function MakerStory({paused,setPaused}:{paused:boolean;setPaused:(v:boolean)=>void}){
  const root=useRef<HTMLElement>(null),[active,setActive]=useState(0),[reduced,setReduced]=useState(false);
  const manual=useRef<number|null>(null);
  const still=useStill();
  const {scrollYProgress}=useScroll({target:root,offset:['start start','end end']});
  const pointerX=useSpring(useMotionValue(.5),{stiffness:80,damping:18}),pointerY=useSpring(useMotionValue(.5),{stiffness:80,damping:18});
  const rotateY=useTransform([scrollYProgress,pointerX],([s,p]:number[])=>-11+s*15+(p-.5)*9);
  const rotateX=useTransform([scrollYProgress,pointerY],([s,p]:number[])=>5-s*9+(.5-p)*7);
  const scale=useTransform(scrollYProgress,[0,.5,1],[.965,1,.985]);
  useEffect(()=>{if(still){pointerX.jump(.5);pointerY.jump(.5);}},[still,pointerX,pointerY]);
  useEffect(()=>{
    const el=root.current;if(!el)return;
    const preference=matchMedia('(prefers-reduced-motion: reduce)');let frame=0;
    const update=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const reduced=preference.matches;setReduced(reduced);const bounds=el.getBoundingClientRect();const progress=Math.max(0,Math.min(1,-bounds.top/Math.max(1,bounds.height-innerHeight)));const p=paused||reduced?(manual.current??0):progress*2;const index=Math.min(2,Math.round(p));setActive(index);el.dataset.progress=progress.toFixed(3);el.dataset.motion=reduced?'reduced':paused?'paused':'running';
      el.querySelectorAll<HTMLElement>('.maker-frame').forEach((layer,i)=>{const distance=Math.abs(p-i);layer.style.opacity=String(Math.max(0,1-distance));layer.style.transform=`scale(${paused||reduced?1:1.035+Math.min(distance,1)*.1}) translate3d(${paused||reduced?0:(p-i)*-2}%,0,0)`;});
      el.style.setProperty('--story-progress',String(progress));
    });};
    update();window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);preference.addEventListener('change',update);
    const observer=new ResizeObserver(update);observer.observe(el);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',update);window.removeEventListener('resize',update);preference.removeEventListener('change',update);observer.disconnect();};
  },[paused]);
  function select(index:number){manual.current=index;if(root.current){root.current.dataset.manualScene=String(index);root.current.dispatchEvent(new CustomEvent('maker-scene-select',{detail:index}));}if(paused||reduced){setActive(index);root.current?.querySelectorAll<HTMLElement>('.maker-frame').forEach((el,i)=>{el.style.opacity=i===index?'1':'0';el.style.transform='none';});}else{const el=root.current!;window.scrollTo({top:scrollY+el.getBoundingClientRect().top+(el.offsetHeight-innerHeight)*index/2,behavior:'instant'});}}
  const scene=scenes[active];
  return <section ref={root} id="edition-top" className={`maker-story ${paused?'is-paused':''}`} aria-label="A student project, from idea to shared knowledge">
    <div className="maker-stage"
      onPointerMove={event=>{if(still||event.pointerType!=='mouse')return;const b=event.currentTarget.getBoundingClientRect();pointerX.set((event.clientX-b.left)/b.width);pointerY.set((event.clientY-b.top)/b.height);}}
      onPointerLeave={()=>{pointerX.set(.5);pointerY.set(.5);}}>
      <motion.div className="maker-frames" style={still?undefined:{rotateX,rotateY,scale,transformPerspective:1600}}>{scenes.map((item,i)=><div key={item.image} className="maker-frame" style={{opacity:i===0?1:0}}>{i===0?<CodingScene paused={paused||active!==0}/>:i===1?<CircuitScene paused={paused||active!==1}/>:<TeamScene paused={paused||active!==2}/>}</div>)}</motion.div>
      <div className="maker-shade"/>
      <motion.div className="hero-chips" key={still?'still':'live'} aria-hidden="true" initial="hidden" animate="show" variants={{hidden:{},show:{transition:{delayChildren:.55,staggerChildren:.12}}}}>{chips.map(chip=><HeroChip key={chip.label} chip={chip} pointerX={pointerX} pointerY={pointerY} progress={scrollYProgress}/>)}</motion.div>
      <Deferred when="idle"><MakerObjects paused={paused}/></Deferred>
      <div className="maker-topline"><span>REPOGGITS / THE STUDENT PROJECT COLLECTIVE</span><span>BUILD. DOCUMENT. PASS IT ON.</span></div>
      {/* Remounting on pause lets an in-flight entrance land on its final pose instead of freezing midway. */}
      <motion.div className="maker-copy" key={`${active}-${still?'still':'live'}`} initial="hidden" animate="show" variants={group}>
        <motion.span className="maker-kicker" variants={rise}>0{active+1} / {scene.label}</motion.span>
        <motion.h1 variants={group}><Words text={scene.title}/><br/><em><Words text={scene.accent}/></em></motion.h1>
        <motion.p variants={rise}>{scene.description}</motion.p>
        <motion.div className="maker-actions" variants={rise}><Magnetic><Link className="button orange" href="/projects">Explore projects <ArrowUpRight size={18}/></Link></Magnetic><Link href="/submit">Share your project <ArrowUpRight size={17}/></Link></motion.div>
      </motion.div>
      <div className="maker-example"><span className="live-dot"/> {active===0?'CODE / CREATE / SHARE':'ESP32 / SMART IRRIGATION'} <small>ILLUSTRATIVE BUILD STORY</small></div>
      <div className="maker-bottom"><a href="#project-story" className="maker-scroll"><ArrowDown size={18}/><span>SCROLL TO SEE<br/>WHAT AN IDEA BECOMES</span></a><div className="maker-filmstrip" role="group" aria-label="Build story scenes">{scenes.map((item,i)=><button key={item.image} aria-label={`Show ${item.label.toLowerCase()}`} aria-pressed={active===i} onClick={()=>select(i)}>{active===i&&<motion.i layoutId="maker-film-active" className="film-pill" aria-hidden="true" transition={{type:'spring',stiffness:380,damping:32}}/>}<img src={`/images/maker-story/${item.image}-mobile.webp`} alt=""/><span><b>0{i+1}</b>{item.label}</span></button>)}</div><button className="maker-pause" aria-pressed={paused} onClick={()=>{manual.current=active;setPaused(!paused);}}>{paused?<Play size={16}/>:<Pause size={16}/>}<span>{paused?'Resume cinematic motion':'Pause cinematic motion'}</span></button></div>
      <div className="maker-progress"/><span className="maker-art-credit">AI-created project illustrations</span>
    </div>
  </section>;
}

export function PhotoChapter({image,number,title,description,paused}:{image:string;number:string;title:string;description:string;paused:boolean}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{const el=ref.current;if(!el)return;const media=matchMedia('(prefers-reduced-motion: reduce)');let frame=0;function update(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;if(!el)return;const bounds=el.getBoundingClientRect();const progress=Math.max(-1,Math.min(1,(bounds.top-innerHeight/2)/innerHeight));el.style.setProperty('--photo-shift',paused||media.matches?'0px':`${progress*65}px`);});}update();window.addEventListener('scroll',update,{passive:true});media.addEventListener('change',update);return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',update);media.removeEventListener('change',update);};},[paused]);
  return <div ref={ref} className="photo-chapter"><div className="photo-chapter-image"><StoryImage name={image} alt="Illustrative student electronics project story"/></div><div className="photo-chapter-shade"/><div className="photo-chapter-copy"><span>{number} / THE MAKER’S NOTEBOOK</span><h2>{title}</h2><p>{description}</p></div><span className="photo-chapter-caption">ESP32 · SENSORS · CODE · CURIOSITY</span></div>;
}
