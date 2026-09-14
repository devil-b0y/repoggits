'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import Link from 'next/link';
import {ArrowUpRight,Check,Code2,FileArchive,GitBranch,Play,Users} from 'lucide-react';
import {motion,useSpring} from 'framer-motion';
import {StoryImage} from './MakerStory';
import {Words,group,inView,rise,useStill} from './MotionKit';
import './build-showcase-motion.css';

const chapters=[{label:'The source',short:'Code'},{label:'The working build',short:'Build'},{label:'The makers',short:'People'}];
const sourceLines=['const sensor = new SoilSensor(32);','const moisture = sensor.read();','if (moisture < target) {','  irrigation.start();','} // a small idea, working.'];
const clamp=(value:number)=>Math.max(0,Math.min(1,value));

export default function BuildShowcase({paused}:{paused:boolean}){
  const ref=useRef<HTMLElement>(null);
  const manual=useRef<number|null>(null);
  const [active,setActive]=useState(0);
  const [reduced,setReduced]=useState(false);
  const still=useStill();
  // The whole card constellation turns toward the pointer, on top of its scroll choreography.
  const orbitX=useSpring(0,{stiffness:70,damping:18}),orbitY=useSpring(0,{stiffness:70,damping:18});
  useEffect(()=>{if(still){orbitX.jump(0);orbitY.jump(0);}},[still,orbitX,orbitY]);

  useEffect(()=>{
    const el=ref.current;if(!el)return;
    const media=matchMedia('(prefers-reduced-motion: reduce)');let frame=0;
    function update(){
      if(frame)return;
      frame=requestAnimationFrame(()=>{
        frame=0;if(!el)return;
        setReduced(media.matches);
        const bounds=el.getBoundingClientRect();
        const stopped=paused||media.matches;
        const p=stopped?.5:clamp((innerHeight*.25-bounds.top)/Math.max(1,bounds.height-innerHeight*.6));
        const detail=stopped?(manual.current??.5):p;
        const chapter=Math.min(2,Math.floor(detail*3));
        el.style.setProperty('--showcase-progress',String(p));
        el.style.setProperty('--showcase-detail-progress',String(detail));
        el.style.setProperty('--showcase-signal',String(clamp((detail-.2)*2.5)));
        el.style.setProperty('--showcase-team',String(clamp((detail-.55)*3)));
        el.dataset.progress=p.toFixed(3);
        el.dataset.motion=media.matches?'reduced':paused?'paused':'running';
        setActive(chapter);
        el.querySelectorAll<HTMLElement>('.showcase-terminal-line').forEach((line,index)=>{
          const lineProgress=stopped?1:clamp(detail*8-index*.15);
          line.style.setProperty('--line-reveal',String(lineProgress));
        });
      });
    }
    update();
    window.addEventListener('scroll',update,{passive:true});
    window.addEventListener('resize',update);
    media.addEventListener('change',update);
    const observer=new ResizeObserver(update);observer.observe(el);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',update);window.removeEventListener('resize',update);media.removeEventListener('change',update);};
  },[paused]);

  function select(index:number){
    const el=ref.current;if(!el)return;
    const target=[.12,.5,.9][index];manual.current=target;
    if(paused||reduced){
      setActive(index);
      el.style.setProperty('--showcase-detail-progress',String(target));
      el.style.setProperty('--showcase-signal',String(clamp((target-.2)*2.5)));
      el.style.setProperty('--showcase-team',String(clamp((target-.55)*3)));
    }else{
      const bounds=el.getBoundingClientRect();
      window.scrollTo({top:scrollY+bounds.top-innerHeight*.25+target*Math.max(1,bounds.height-innerHeight*.6),behavior:'instant'});
    }
  }

  return <section ref={ref} className={`build-showcase ${paused?'is-paused':''}`} aria-labelledby="showcase-title" data-active-story={active}>
    <div className="build-showcase-stage"
      onPointerMove={event=>{if(still||event.pointerType!=='mouse')return;const b=event.currentTarget.getBoundingClientRect();orbitY.set(((event.clientX-b.left)/b.width-.5)*14);orbitX.set((.5-(event.clientY-b.top)/b.height)*9);}}
      onPointerLeave={()=>{orbitX.set(0);orbitY.set(0);}}>
      <div className="showcase-blueprint" aria-hidden="true"><span>IDEA / 001</span><span>OPEN FOR POSSIBILITIES</span><i/><i/><i/></div>
      <motion.div className="showcase-heading" variants={group} {...inView}>
        <motion.span variants={rise}>FROM YOUR DESK. TO SOMEONE ELSE’S NEXT IDEA.</motion.span>
        <motion.h2 id="showcase-title" variants={group}><Words text="Don’t just submit it."/><br/><em><Words text="Bring it to life."/></em></motion.h2>
        <motion.p variants={rise}>The demo. The people. The source. A project is more than its final screenshot.</motion.p>
        <motion.div className="showcase-story-nav" role="group" aria-label="Explore the project story" variants={rise}>
          {chapters.map((chapter,index)=><button type="button" key={chapter.short} aria-label={`Show ${chapter.label.toLowerCase()} story`} aria-pressed={active===index} onClick={()=>select(index)}>{active===index&&<motion.span layoutId="showcase-nav-active" className="nav-pill" aria-hidden="true" transition={{type:'spring',stiffness:380,damping:32}}/>}<b>0{index+1}</b><span>{chapter.short}</span><i aria-hidden="true"/></button>)}
        </motion.div>
      </motion.div>
      <motion.div className="showcase-space" style={still?undefined:{rotateX:orbitX,rotateY:orbitY}}>
        <div className="showcase-orbit orbit-a"/><div className="showcase-orbit orbit-b"/>
        <div className="showcase-object-tag showcase-tag-code" aria-hidden="true"><Code2 size={15}/> A FEW LINES. A FRESH START.</div>
        <div className="showcase-object-tag showcase-tag-build" aria-hidden="true"><span/> IDEAS BECOME REAL HERE.</div>
        <article className="showcase-card showcase-code">
          <div className="showcase-bar"><Code2 size={15} aria-hidden="true"/><span>01 / THE SOURCE</span><i/></div>
          <div className="showcase-photo"><StoryImage name="coding-v2" alt="Illustrated student coding at a correctly oriented laptop"/>
            <div className="showcase-terminal" aria-hidden="true"><div className="showcase-terminal-file"><span>smart-garden.ino</span><span>C++</span></div><div className="showcase-terminal-body">{sourceLines.map((line,index)=><span key={line} className="showcase-terminal-line"><b>{index+1}</b><code>{line}</code></span>)}</div><div className="showcase-terminal-status"><Check size={10}/> IDEA COMPILED.</div></div>
          </div>
          <div className="showcase-card-copy"><span>Built to be built on.</span><small>Languages · Source ZIP · Version history</small><div className="showcase-source-chips"><span><FileArchive size={12} aria-hidden="true"/> Source files</span><span><GitBranch size={12} aria-hidden="true"/> Your next version</span></div></div>
        </article>
        <article className="showcase-card showcase-demo">
          <div className="showcase-bar"><Play size={15} aria-hidden="true"/><span>02 / THE WORKING BUILD</span><i/></div>
          <div className="showcase-photo"><StoryImage name="circuit" alt="Illustrative ESP32 prototype with wiring and sensors"/>
            <div className="showcase-sensor-overlay" aria-hidden="true"><span className="showcase-connection connection-board"/><span className="showcase-connection connection-sensor"/><span className="showcase-connection connection-plant"/><svg className="showcase-circuit-path" viewBox="0 0 400 220" preserveAspectRatio="none"><path d="M132 147V100H244V63H321"/><circle cx="132" cy="147" r="5"/><circle cx="244" cy="100" r="5"/><circle cx="321" cy="63" r="5"/></svg></div>
            <div className="showcase-sensor-readout" aria-hidden="true"><span><i/> ESP32 / SENSOR CONNECTED</span><svg viewBox="0 0 230 32" preserveAspectRatio="none"><path d="M0 22H16L24 19L34 23H46L54 8L62 28L70 16L78 20H96L105 13L111 18L121 6L128 25L136 20H156L165 11L172 22L180 18H196L203 7L213 26L222 18H230"/></svg><div><span>FIRST SIGNAL</span><b>IT’S ALIVE.</b></div></div>
          </div>
          <div className="showcase-card-copy"><span>Show the moment it works.</span><small>Demo video · Build gallery · Features</small><div className="showcase-demo-timeline" aria-hidden="true"><i/><span>WIRE</span><span>TEST</span><span>WORKING</span></div></div>
        </article>
        <article className="showcase-card showcase-team">
          <div className="showcase-bar"><Users size={15} aria-hidden="true"/><span>03 / THE MAKERS</span><i/></div>
          <div className="showcase-photo"><StoryImage name="team" alt="Illustrated student team testing their project"/>
            <div className="showcase-team-strip" aria-hidden="true"><div className="showcase-team-portraits">{['Code','Hardware','Design'].map((role,index)=><span key={role} style={{'--portrait-index':index} as CSSProperties}><img src="/images/maker-story/team-mobile.webp" alt="" loading="lazy"/><small>{role}</small></span>)}</div><span className="showcase-team-note">Different skills.<br/><b>One shared idea.</b></span></div>
          </div>
          <div className="showcase-card-copy"><span>Put people in the picture.</span><small>Team · Contributions · College</small><div className="showcase-source-chips"><span><Users size={12} aria-hidden="true"/> Every maker credited</span></div></div>
        </article>
      </motion.div>
      <div className="showcase-bottom"><span>{paused||reduced?'CHOOSE A CHAPTER TO EXPLORE':'SCROLL TO OPEN THE STORY'}</span><Link href="/projects">Explore what students are building <ArrowUpRight size={18}/></Link><span>0{active+1} — 03</span></div>
      <div className="showcase-scroll-track" aria-hidden="true"><i/></div>
    </div>
  </section>;
}
