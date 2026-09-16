'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {motion} from 'framer-motion';
import {Layers,ArrowUpRight,ArrowDown,Pause,Play,Menu,Moon,Sun} from 'lucide-react';
import {Magnetic,useStill} from '../MotionKit';
import {chapters,clamp} from './story';
import './vault-story.css';
const Scene=dynamic(()=>import('./VaultCanvas'),{ssr:false});
export default function VaultExperience({paused,setPaused}:{paused:boolean;setPaused:(v:boolean)=>void}){
 const world=useRef<HTMLDivElement>(null),progress=useRef(0),hovered=useRef(false),still=useStill(),morning=useRef<HTMLDivElement>(null),atmosphere=useRef<HTMLDivElement>(null);
 const [dark,setDark]=useState(false),[themeReady,setThemeReady]=useState(false);
 useEffect(()=>{try{setDark(localStorage.getItem('repoggits-theme')==='dark');}catch{}setThemeReady(true);const sync=(event:StorageEvent)=>{if(event.key==='repoggits-theme')setDark(event.newValue==='dark');};addEventListener('storage',sync);return()=>removeEventListener('storage',sync);},[]);
 const toggleTheme=()=>{const next=!dark;setDark(next);try{localStorage.setItem('repoggits-theme',next?'dark':'light');}catch{}};
 const [chapter,setChapter]=useState(0),[compact,setCompact]=useState(false),[menu,setMenu]=useState(false),[typed,setTyped]=useState(''),[supported,setSupported]=useState(false);
 useEffect(()=>{const media=matchMedia('(max-width: 800px)');const sync=()=>setCompact(media.matches);sync();media.addEventListener('change',sync);try{setSupported(!!document.createElement('canvas').getContext('webgl2'));}catch{}return()=>media.removeEventListener('change',sync);},[]);
 useEffect(()=>{let frame=0;const update=()=>{frame=0;let p=0;world.current?.querySelectorAll<HTMLElement>('.pv-chapter').forEach((el,i)=>{const r=el.getBoundingClientRect();if(r.top<=innerHeight*.45)p=i+clamp((innerHeight*.45-r.top)/r.height);});progress.current=p;setChapter(Math.min(13,Math.floor(p)));if(morning.current)morning.current.style.backgroundPosition=`${Math.min(2,Math.floor(clamp(p-11)*3))*50}% center`;if(atmosphere.current)atmosphere.current.style.transform=still?'none':`scale(${1.02+(p%1)*.05}) translateY(${-(p%1)*12}px)`;};const scroll=()=>{if(!frame)frame=requestAnimationFrame(update);};update();addEventListener('scroll',scroll,{passive:true});addEventListener('resize',scroll);return()=>{cancelAnimationFrame(frame);removeEventListener('scroll',scroll);removeEventListener('resize',scroll);};},[still]);
 useEffect(()=>{if(still){setTyped('something worth building.');return;}const lines=['an idea…','a project…','something worth building.'];let line=0,char=0,timer:ReturnType<typeof setTimeout>;const type=()=>{setTyped(lines[line].slice(0,++char));if(char<lines[line].length)timer=setTimeout(type,75);else if(line<2)timer=setTimeout(()=>{line++;char=0;type();},900);};type();return()=>clearTimeout(timer);},[still]);
 const photo=[1,7,11].includes(chapter);
 return <div className={`pv-home ${dark?'pv-dark':''}`} data-chapter={chapter} data-motion={still?'still':'running'}>
  <a className="pv-skip" href="#enter">Skip story and enter</a>
  <header onKeyDown={e=>{if(e.key==='Escape'){setMenu(false);e.currentTarget.querySelector<HTMLButtonElement>('.pv-menu')?.focus();}}} className={`pv-nav ${chapter>0?'compressed':''}`}><Link href="/" className="pv-logo" aria-label="Repoggits home"><Layers size={24}/><span>repoggits<sup>®</sup></span></Link><nav aria-label="Main navigation" className={menu?'open':''} id="vault-navigation" onClick={()=>setMenu(false)}><a href="#story">Story</a><a href="#how-it-works">How it works</a><a href="#about">About</a><Link className="pv-mobile-login" href="/auth">Login</Link></nav><div><button className="pv-theme" disabled={!themeReady} onClick={toggleTheme} aria-label={dark?'Use light theme':'Use dark theme'} title={dark?'Use light theme':'Use dark theme'}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><Link href="/auth" className="pv-login">Login</Link><Link href="/projects" className="pv-nav-enter">Enter vault <ArrowUpRight size={15}/></Link><button className="pv-menu" aria-label="Toggle navigation" aria-expanded={menu} aria-controls="vault-navigation" onClick={()=>setMenu(!menu)}><Menu/></button></div></header>
  <main ref={world} className="pv-world">
   <div className="pv-environment" aria-hidden="true">
    <div ref={atmosphere} className={`pv-atmosphere ${photo?'visible':''}`} style={{backgroundImage:`url('/images/maker-story/${chapter===7?'student.webp':'coding-next-v2.webp'}')`}}/>
    {chapter===11&&<div ref={morning} className="pv-morning" role="presentation"/>}
    <div className="pv-grain"/>
    <div className="pv-orbit" style={{opacity:chapter>=4&&!photo?1:0}}/>
    <div className="pv-render" style={{opacity:photo||chapter===3||chapter===0?0:1}}>{supported&&chapter>0?<Scene dark={dark} progress={progress} hovered={hovered} still={still} compact={compact}/>:<div className="pv-fallback"><Layers size={150} strokeWidth={.6}/><span>PROJECT VAULT</span></div>}</div>
    {chapter===2&&<div className="pv-fragments">{['CODE','FILES','IDEAS','NOTES','REPOSITORIES','DEADLINES','ASSIGNMENTS','BUGS','LEARNING','BUILDING'].map((word,i)=><motion.span key={word} initial={{opacity:0}} animate={{opacity:.55,rotate:still?0:(i%2?8:-8),y:still?0:[0,-15,0]}} transition={{y:{repeat:still?0:Infinity,duration:4+i*.3},opacity:{delay:i*.08}}} style={{left:`${8+(i*23)%80}%`,top:`${15+(i*17)%70}%`}}>{word}</motion.span>)}</div>}
   </div>
   {chapters.map((s,i)=><section id={s.id} key={s.id} className={`pv-chapter pv-scene-${i} ${[1,7,11].includes(i)?'photographic':''}`} aria-labelledby={`title-${s.id}`}>
    <motion.div className="pv-copy" initial={false} animate={{opacity:chapter===i?1:.2,y:still?0:chapter>i?-25:chapter<i?35:0}} transition={{duration:still?0:.7,ease:[.22,1,.36,1]}}>
     <p className="pv-eyebrow"><span>{String(i+1).padStart(2,'0')} / 14</span>{s.label}</p>
     {i===0?<><p className="pv-opening-label">A place for the things you haven’t built. Yet.</p><h1 id={`title-${s.id}`} aria-label="Something worth building."><span aria-hidden="true">{typed}<i className={still?'':'pv-cursor'}>_</i></span></h1><p className="pv-intro">An engineering story.<br/>Yours, in the making.</p><a className="pv-scroll" href="#student">Scroll to begin <ArrowDown size={16}/></a></>:<><h2 id={`title-${s.id}`}>{s.title.split('\n').map((line,j)=><span key={line}>{j===1&&[4,10,12,13].includes(i)?<em>{line}</em>:line}</span>)}</h2>{s.body&&<p className="pv-body">{s.body}</p>}</>}
     {i===5&&<div className="pv-process"><span>01 / Document</span><span>02 / Review</span><span>03 / Share</span></div>}
     {i===8&&<div className="pv-process"><span>Account access</span><span>Version history</span><span>Reviewed submissions</span></div>}
     {i===12&&<p className="pv-wordmark">PROJECT VAULT</p>}
     {i===13&&<div className="pv-cta" onPointerEnter={()=>{hovered.current=true;}} onPointerLeave={()=>{hovered.current=false;}} onFocus={()=>{hovered.current=true;}} onBlur={()=>{hovered.current=false;}}><Magnetic><Link className="pv-button" href="/workspace">Enter Project Vault <ArrowUpRight size={20}/></Link></Magnetic><Link className="pv-explore" href="/projects">Explore <ArrowUpRight size={17}/></Link></div>}
    </motion.div>{i===3&&<span className="pv-point" aria-hidden="true"/>}{i===4&&<span className="pv-object-caption">PV—001 / A PLACE FOR POSSIBILITY</span>}
   </section>)}
  </main>
  <aside className="pv-controls" aria-label="Story controls"><span>{String(chapter+1).padStart(2,'0')} / 14</span><div className="pv-progress"><span style={{transform:`scaleX(${(chapter+1)/14})`}}/></div><button onClick={()=>setPaused(!paused)} aria-label={paused?'Resume animation':'Pause animation'}>{paused?<Play size={14}/>:<Pause size={14}/>}</button></aside>
  <footer className="pv-footer"><div><Layers size={22}/><strong>repoggits</strong><span>Project Vault. A home for what you build.</span></div><nav aria-label="Footer navigation"><a href="#story">Story</a><Link href="/projects">Explore</Link><a href="#about">About</a><a href="/api/feed">RSS</a></nav><p>Built with curiosity. Shared with everyone.</p></footer>
 </div>;
}

