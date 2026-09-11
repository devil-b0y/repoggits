'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowDown,ArrowUpRight,Pause,Play} from 'lucide-react';
import CodingScene from './CodingScene';
import dynamic from 'next/dynamic';
const PhotoDissolve=dynamic(()=>import('./PhotoDissolve'),{ssr:false});

const scenes=[
  {image:'coding-v2',label:'The idea',title:'Good ideas.',accent:'Start with you.',description:'One curious mind. A few lines of code. Something worth sharing.',alt:'Illustration of a college student coding on a laptop'},
  {image:'circuit',label:'The build',title:'Small board.',accent:'Big possibility.',description:'Show the wiring, the code, the experiments—and the moment it finally works.',alt:'Illustrated close-up of an ESP32 board, jumper wires and a soil sensor'},
  {image:'team',label:'The people',title:'Made by you.',accent:'Better together.',description:'Give your project a home. Give the next maker a place to start.',alt:'Illustration of three engineering students testing a connected plant prototype'},
];
export function StoryImage({name,alt,eager=false}:{name:string;alt:string;eager?:boolean}){return <picture><source media="(max-width:680px)" srcSet={`/images/maker-story/${name}-mobile.webp`}/><img src={`/images/maker-story/${name}.webp`} alt={alt} width={1536} height={1024} loading={eager?'eager':'lazy'} fetchPriority={eager?'high':'auto'} draggable={false}/></picture>;}

export default function MakerStory({paused,setPaused}:{paused:boolean;setPaused:(v:boolean)=>void}){
  const root=useRef<HTMLElement>(null),[active,setActive]=useState(0),[reduced,setReduced]=useState(false);
  const manual=useRef<number|null>(null);
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
  function select(index:number){manual.current=index;if(paused||reduced){setActive(index);root.current?.querySelectorAll<HTMLElement>('.maker-frame').forEach((el,i)=>{el.style.opacity=i===index?'1':'0';el.style.transform='none';});}else{const el=root.current!;window.scrollTo({top:scrollY+el.getBoundingClientRect().top+(el.offsetHeight-innerHeight)*index/2,behavior:'instant'});}}
  return <section ref={root} id="edition-top" className={`maker-story ${paused?'is-paused':''}`} aria-label="A student project, from idea to shared knowledge">
    <div className="maker-stage">
      <div className="maker-frames">{scenes.map((scene,i)=><div key={scene.image} className="maker-frame" style={{opacity:i===0?1:0}}>{i===0?<CodingScene paused={paused||active!==0}/>:<StoryImage name={scene.image} alt={scene.alt}/>}</div>)}</div>
      <PhotoDissolve paused={paused}/><div className="maker-shade"/>
      <div className="maker-topline"><span>REPOGGITS / THE STUDENT PROJECT COLLECTIVE</span><span>BUILD. DOCUMENT. PASS IT ON.</span></div>
      <div className="maker-copy" key={active}><span className="maker-kicker">0{active+1} / {scenes[active].label}</span><h1>{scenes[active].title}<br/><em>{scenes[active].accent}</em></h1><p>{scenes[active].description}</p><div className="maker-actions"><Link className="button orange" href="/projects">Explore projects <ArrowUpRight size={18}/></Link><Link href="/submit">Share your project <ArrowUpRight size={17}/></Link></div></div>
      <div className="maker-example"><span className="live-dot"/> {active===0?'CODE / CREATE / SHARE':'ESP32 / SMART IRRIGATION'} <small>ILLUSTRATIVE BUILD STORY</small></div>
      <div className="maker-bottom"><a href="#project-story" className="maker-scroll"><ArrowDown size={18}/><span>SCROLL TO SEE<br/>WHAT AN IDEA BECOMES</span></a><div className="maker-filmstrip" role="group" aria-label="Build story scenes">{scenes.map((scene,i)=><button key={scene.image} aria-label={`Show ${scene.label.toLowerCase()}`} aria-pressed={active===i} onClick={()=>select(i)}><img src={`/images/maker-story/${scene.image}-mobile.webp`} alt=""/><span><b>0{i+1}</b>{scene.label}</span></button>)}</div><button className="maker-pause" aria-pressed={paused} onClick={()=>{manual.current=active;setPaused(!paused);}}>{paused?<Play size={16}/>:<Pause size={16}/>}<span>{paused?'Resume cinematic motion':'Pause cinematic motion'}</span></button></div>
      <div className="maker-progress"/><span className="maker-art-credit">AI-created project illustrations</span>
    </div>
  </section>;
}

export function PhotoChapter({image,number,title,description,paused}:{image:string;number:string;title:string;description:string;paused:boolean}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{const el=ref.current;if(!el)return;const media=matchMedia('(prefers-reduced-motion: reduce)');let frame=0;function update(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;if(!el)return;const bounds=el.getBoundingClientRect();const progress=Math.max(-1,Math.min(1,(bounds.top-innerHeight/2)/innerHeight));el.style.setProperty('--photo-shift',paused||media.matches?'0px':`${progress*65}px`);});}update();window.addEventListener('scroll',update,{passive:true});media.addEventListener('change',update);return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',update);media.removeEventListener('change',update);};},[paused]);
  return <div ref={ref} className="photo-chapter"><div className="photo-chapter-image"><StoryImage name={image} alt="Illustrative student electronics project story"/></div><div className="photo-chapter-shade"/><div className="photo-chapter-copy"><span>{number} / THE MAKER’S NOTEBOOK</span><h2>{title}</h2><p>{description}</p></div><span className="photo-chapter-caption">ESP32 · SENSORS · CODE · CURIOSITY</span></div>;
}
