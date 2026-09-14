'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Deferred from './Deferred';
const ProjectSculpture=dynamic(()=>import('./ProjectSculpture'),{ssr:false});
const DisciplineModel=dynamic(()=>import('./DisciplineModel'),{ssr:false});
import {ArrowUpRight,Check,Code2,GitFork,Pause,Play,Star,Users,Video} from 'lucide-react';
import {motion,useScroll,useTransform,type Variants} from 'framer-motion';
import {Words,fromSide,group,inView,rise,useStill,useTilt} from './MotionKit';
import './overview.css';
import {CircuitChapter} from './CircuitScene';
import TeamScene from './TeamScene';

// Tilt owns rotation on these cards, so their entrance rises and scales without rotating.
const lift:Variants={hidden:{opacity:0,y:70,scale:.94},show:{opacity:1,y:0,scale:1,transition:{type:'spring',stiffness:80,damping:17}}};

function TypeCard({children}:{children:ReactNode}){
  const tilt=useTilt(8);
  return <motion.article variants={lift} style={tilt.still?undefined:tilt.style} {...tilt.handlers}>{children}<motion.span className="card-glare" aria-hidden="true" style={{background:tilt.glare}}/></motion.article>;
}

export default function HomeOverview({paused,setPaused}:{paused:boolean;setPaused:(value:boolean)=>void}){
  const root=useRef<HTMLDivElement>(null),collective=useRef<HTMLElement>(null),story=useRef<HTMLElement>(null);
  const still=useStill();
  const {scrollYProgress:collectiveProgress}=useScroll({target:collective,offset:['start end','end start']});
  const photoY=useTransform(collectiveProgress,[0,1],[-70,70]),photoScale=useTransform(collectiveProgress,[0,.5,1],[1.14,1.05,1.14]);
  const {scrollYProgress:storyProgress}=useScroll({target:story,offset:['start end','start 30%']});
  const storyTurn=useTransform(storyProgress,[0,1],[16,0]);
  const tilt=useTilt(6);
  useEffect(()=>{
    const el=root.current;if(!el)return;
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    let cleanup=()=>{};
    function start(){
      cleanup();if(!el)return;
      if(preference.matches||paused){el.style.setProperty('--scene-turn','0deg');el.querySelectorAll<HTMLElement>('.orbit-scene').forEach(scene=>scene.style.setProperty('--scene-turn','0deg'));return;}
      let frame=0,visible=false;
      const sceneObserver=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);update();});sceneObserver.observe(el);
      function update(){if(frame||!visible)return;frame=requestAnimationFrame(()=>{frame=0;el!.querySelectorAll<HTMLElement>('.orbit-scene').forEach(scene=>{const bounds=scene.getBoundingClientRect();const progress=Math.max(-1,Math.min(1,(bounds.top+bounds.height/2-innerHeight/2)/innerHeight));scene.style.setProperty('--scene-turn',`${progress*12}deg`);});});}
      window.addEventListener('scroll',update,{passive:true});
      cleanup=()=>{sceneObserver.disconnect();window.removeEventListener('scroll',update);cancelAnimationFrame(frame);};
    }
    start();preference.addEventListener('change',start);
    return()=>{cleanup();preference.removeEventListener('change',start);};
  },[paused]);
  return <div ref={root} className={`home-overview ${paused?'motion-paused':''}`}>
    <motion.div className="overview-intro overview-reveal" variants={group} {...inView}><motion.div className="eyebrow" variants={rise}>MORE THAN A FINAL SUBMISSION</motion.div><motion.h2 variants={group}><Words text="The work."/><br/><Words text="The whole story"/><span className="intro-dot">.</span></motion.h2><motion.p variants={rise}>Document the outcome and everything that made it possible. One considered space for the demo, the team, and the source.</motion.p><motion.button variants={rise} className="text-button" aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?<Play size={15}/>:<Pause size={15}/>} {paused?'Resume overview motion':'Pause overview motion'}</motion.button><motion.nav variants={rise} className="overview-chapters" aria-label="Overview chapters"><a href="#project-story">01 / The project</a><a href="#project-types">02 / The disciplines</a><a href="#the-collective">03 / The collective</a></motion.nav></motion.div>
    <CircuitChapter paused={paused}/>
    <section ref={story} id="project-story" className="overview-story" aria-labelledby="story-title">
      <motion.div className="paper-scene" role="img" aria-label="Three-dimensional layers representing a project: working demo, team, and source code" style={still?undefined:{...tilt.style,rotateX:storyTurn}} {...tilt.handlers}>
        <div className="scene-coordinate">FIG. 02 / PROJECT ANATOMY</div><Deferred><ProjectSculpture paused={paused}/></Deferred>
        <div className="paper-stack"><div className="story-sheet sheet-source"><Code2 size={30}/><strong>Made to be built on.</strong><div className="code-lines"><i/><i/><i/><i/></div><span>SOURCE / VERSION 01</span></div><div className="story-sheet sheet-team"><Users size={27}/><strong>People behind the possibility.</strong><div className="mini-people"><i>A</i><i>B</i><i>C</i></div><span>TEAM / ROLES / COLLEGE</span></div><div className="story-sheet sheet-demo"><div><span>YOUR PROJECT, IN ACTION</span><Video size={20}/></div><div className="mini-landscape"><div className="model-cube"/><span className="demo-play"><Play fill="currentColor" size={24}/></span></div><strong>Show the moment it works.</strong></div></div>
        <span className="scene-handnote">SCROLL TO EXPLORE THE LAYERS</span>
      </motion.div>
      <motion.div className="overview-story-copy overview-reveal" variants={group} {...inView}><motion.div className="eyebrow" variants={rise}>01 / SHOW THE WHOLE BUILD</motion.div><motion.h2 id="story-title" variants={group}><Words text="Every layer."/><br/><Words text="One clear story."/></motion.h2><motion.p variants={rise}>Bring your work to life with a cover, a working video, and photos from every angle. Then share the details someone else can actually learn from.</motion.p><motion.ul variants={group}>{[[Video,'See it working','Demo videos and a gallery, right beside the idea.'],[Users,'Meet the makers','Team photos, contributions, branch, semester, and college.'],[Code2,'Understand the build','Features, languages, services, time taken, and real costs.']].map(([Icon,title,description])=>{const Glyph=Icon as typeof Video;return <motion.li variants={fromSide(1)} className="overview-reveal" key={String(title)}><Glyph size={20}/><div><h3>{String(title)}</h3><p>{String(description)}</p></div></motion.li>;})}<motion.li variants={fromSide(1)} className="overview-reveal"><GitFork size={20}/><div><h3>Make the next version possible</h3><p>Download source, follow the changes, and credit the original when you build on it.</p></div></motion.li></motion.ul></motion.div>
    </section>
    <section id="project-types" className="overview-types overview-reveal" aria-labelledby="types-title"><motion.div className="overview-section-heading" variants={group} {...inView}><motion.div variants={group}><motion.div className="eyebrow" variants={rise}>02 / DIFFERENT WAYS TO MAKE A DIFFERENCE</motion.div><motion.h2 id="types-title" variants={group}><Words text="Code it. Wire it."/><br/><Words text="Bring it together."/></motion.h2></motion.div><motion.p variants={rise}>A place for every kind of project,<br/>and every kind of curious mind.</motion.p></motion.div><motion.div className="maker-types" variants={group} {...inView}>
      <TypeCard><div className="type-object object-code" aria-hidden="true"><Deferred><DisciplineModel kind="software" paused={paused}/></Deferred><span>&lt;/&gt;</span><i/><i/></div><span className="eyebrow">01 — SOFTWARE</span><h3>Ideas you can run.</h3><p>Web apps, mobile tools, data experiments, and the code that makes everyday things better.</p><span className="type-note">LANGUAGES · DEMOS · SOURCE</span></TypeCard>
      <TypeCard><div className="type-object object-chip" aria-hidden="true"><Deferred><DisciplineModel kind="hardware" paused={paused}/></Deferred><span>+</span><i/><i/></div><span className="eyebrow">02 — HARDWARE</span><h3>Ideas you can hold.</h3><p>Circuits, machines, sensors, and prototypes. Share the parts, the costs, and the lessons.</p><span className="type-note">PARTS · BUILD PHOTOS · COSTS</span></TypeCard>
      <TypeCard><div className="type-object object-hybrid" aria-hidden="true"><Deferred><DisciplineModel kind="hybrid" paused={paused}/></Deferred><span/><i/><i/></div><span className="eyebrow">03 — HYBRID</span><h3>Better, connected.</h3><p>When physical builds meet thoughtful software. Show how both sides work as one.</p><span className="type-note">CONNECTED SYSTEMS · SHARED IDEAS</span></TypeCard>
    </motion.div></section>
    <section ref={collective} id="the-collective" className="overview-collective overview-reveal"><motion.div className="collective-photograph" style={still?undefined:{y:photoY,scale:photoScale}}><TeamScene paused={paused}/></motion.div><motion.div className="collective-copy" variants={group} {...inView}><motion.div className="eyebrow" variants={rise}>03 / A LITTLE SHARED KNOWLEDGE</motion.div><motion.h2 variants={group}><Words text="Your next idea"/><br/><Words text="could start with"/><br/><em><Words text="someone else’s."/></em></motion.h2><motion.p variants={rise}>Discover projects by subject, technology, or project type. Star the work that inspires you, ask a question, and give a good idea its next chapter.</motion.p><motion.div variants={rise}><Link className="button orange" href="/projects">Find your inspiration <ArrowUpRight size={18}/></Link></motion.div></motion.div><div className="orbit-scene" role="img" aria-label="Dimensional community illustration connecting questions, stars, and new versions"><div className="orbit-ring ring-one"/><div className="orbit-ring ring-two"/><div className="orbit-core"><GitFork size={60}/></div><div className="orbit-note note-star"><Star size={23}/><strong>Worth sharing.</strong><span>Star a thoughtful build</span></div><div className="orbit-note note-version"><Code2 size={23}/><strong>A new chapter.</strong><span>Build on the original</span></div><div className="orbit-note note-question"><Users size={23}/><strong>Better together.</strong><span>Ask. Learn. Contribute.</span></div><span className="orbit-dot"/></div></section>
    <motion.section className="overview-roles overview-reveal" variants={group} {...inView}><motion.div variants={group}><motion.div className="eyebrow" variants={rise}>A SPACE FOR EVERY CONTRIBUTION</motion.div><motion.h2 variants={group}><Words text="Made by students."/><br/><Words text="Strengthened by educators."/></motion.h2></motion.div><motion.div className="role-notes" variants={group}><motion.article variants={fromSide(-1)}><span>FOR THE MAKERS</span><h3>Start small. Keep going.</h3><p>Your form remembers unfinished work in this browser. Save drafts to your account, add your team, and submit when you’re ready.</p><div><Check size={16}/> Draft recovery &amp; version history</div></motion.article><motion.article variants={fromSide(1)}><span>FOR THE MENTORS</span><h3>Give good work direction.</h3><p>Review submissions in your assigned subjects, request changes with useful feedback, and help projects reach publication.</p><div><Check size={16}/> Scoped reviews &amp; recorded decisions</div></motion.article></motion.div></motion.section>
  </div>;
}
