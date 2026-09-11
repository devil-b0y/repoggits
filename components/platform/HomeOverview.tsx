'use client';
import {useEffect,useRef} from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const ProjectSculpture=dynamic(()=>import('./ProjectSculpture'),{ssr:false});
const DisciplineModel=dynamic(()=>import('./DisciplineModel'),{ssr:false});
import {ArrowUpRight,Check,Code2,GitFork,Pause,Play,Star,Users,Video} from 'lucide-react';
import './overview.css';

export default function HomeOverview({paused,setPaused}:{paused:boolean;setPaused:(value:boolean)=>void}){
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const el=root.current;if(!el)return;
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    let cleanup=()=>{};
    function start(){
      cleanup();if(!el)return;
      if(preference.matches||paused){el.style.setProperty('--scene-turn','0deg');el.querySelectorAll<HTMLElement>('.orbit-scene').forEach(scene=>scene.style.setProperty('--scene-turn','0deg'));return;}
      const animations:Animation[]=[];
      const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
        if(entry.isIntersecting){animations.push(entry.target.animate([{opacity:0,transform:'translateY(28px)'},{opacity:1,transform:'translateY(0)'}],{duration:700,easing:'cubic-bezier(.22,1,.36,1)'}));observer.unobserve(entry.target);}
      }),{threshold:.12});
      el.querySelectorAll('.overview-reveal').forEach(item=>observer.observe(item));
      let frame=0,visible=false;
      const sceneObserver=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);update();});sceneObserver.observe(el);
      function update(){if(frame||!visible)return;frame=requestAnimationFrame(()=>{frame=0;el!.querySelectorAll<HTMLElement>('.orbit-scene').forEach(scene=>{const bounds=scene.getBoundingClientRect();const progress=Math.max(-1,Math.min(1,(bounds.top+bounds.height/2-innerHeight/2)/innerHeight));scene.style.setProperty('--scene-turn',`${progress*12}deg`);});});}
      window.addEventListener('scroll',update,{passive:true});
      cleanup=()=>{observer.disconnect();sceneObserver.disconnect();window.removeEventListener('scroll',update);cancelAnimationFrame(frame);animations.forEach(a=>a.cancel());};
    }
    start();preference.addEventListener('change',start);
    return()=>{cleanup();preference.removeEventListener('change',start);};
  },[paused]);
  return <div ref={root} className={`home-overview ${paused?'motion-paused':''}`}>
    <div className="overview-intro overview-reveal"><div className="eyebrow">MORE THAN A FINAL SUBMISSION</div><h2>The work.<br/>The whole story<span>.</span></h2><p>Document the outcome and everything that made it possible. One considered space for the demo, the team, and the source.</p><button className="text-button" aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?<Play size={15}/>:<Pause size={15}/>} {paused?'Resume overview motion':'Pause overview motion'}</button><nav className="overview-chapters" aria-label="Overview chapters"><a href="#project-story">01 / The project</a><a href="#project-types">02 / The disciplines</a><a href="#the-collective">03 / The collective</a></nav></div>
    <section id="project-story" className="overview-story" aria-labelledby="story-title">
      <div className="paper-scene" role="img" aria-label="Three-dimensional layers representing a project: working demo, team, and source code">
        <div className="scene-coordinate">FIG. 02 / PROJECT ANATOMY</div><ProjectSculpture paused={paused}/>
        <div className="paper-stack"><div className="story-sheet sheet-source"><Code2 size={30}/><strong>Made to be built on.</strong><div className="code-lines"><i/><i/><i/><i/></div><span>SOURCE / VERSION 01</span></div><div className="story-sheet sheet-team"><Users size={27}/><strong>People behind the possibility.</strong><div className="mini-people"><i>A</i><i>B</i><i>C</i></div><span>TEAM / ROLES / COLLEGE</span></div><div className="story-sheet sheet-demo"><div><span>YOUR PROJECT, IN ACTION</span><Video size={20}/></div><div className="mini-landscape"><div className="model-cube"/><span className="demo-play"><Play fill="currentColor" size={24}/></span></div><strong>Show the moment it works.</strong></div></div>
        <span className="scene-handnote">SCROLL TO EXPLORE THE LAYERS</span>
      </div>
      <div className="overview-story-copy overview-reveal"><div className="eyebrow">01 / SHOW THE WHOLE BUILD</div><h2 id="story-title">Every layer.<br/>One clear story.</h2><p>Bring your work to life with a cover, a working video, and photos from every angle. Then share the details someone else can actually learn from.</p><ul>{[[Video,'See it working','Demo videos and a gallery, right beside the idea.'],[Users,'Meet the makers','Team photos, contributions, branch, semester, and college.'],[Code2,'Understand the build','Features, languages, services, time taken, and real costs.']].map(([Icon,title,description])=>{const Glyph=Icon as typeof Video;return <li className="overview-reveal" key={String(title)}><Glyph size={20}/><div><h3>{String(title)}</h3><p>{String(description)}</p></div></li>;})}<li className="overview-reveal"><GitFork size={20}/><div><h3>Make the next version possible</h3><p>Download source, follow the changes, and credit the original when you build on it.</p></div></li></ul></div>
    </section>
    <section id="project-types" className="overview-types overview-reveal" aria-labelledby="types-title"><div className="overview-section-heading"><div><div className="eyebrow">02 / DIFFERENT WAYS TO MAKE A DIFFERENCE</div><h2 id="types-title">Code it. Wire it.<br/>Bring it together.</h2></div><p>A place for every kind of project,<br/>and every kind of curious mind.</p></div><div className="maker-types">
      <article><div className="type-object object-code" aria-hidden="true"><DisciplineModel kind="software" paused={paused}/><span>&lt;/&gt;</span><i/><i/></div><span className="eyebrow">01 — SOFTWARE</span><h3>Ideas you can run.</h3><p>Web apps, mobile tools, data experiments, and the code that makes everyday things better.</p><span className="type-note">LANGUAGES · DEMOS · SOURCE</span></article>
      <article><div className="type-object object-chip" aria-hidden="true"><DisciplineModel kind="hardware" paused={paused}/><span>+</span><i/><i/></div><span className="eyebrow">02 — HARDWARE</span><h3>Ideas you can hold.</h3><p>Circuits, machines, sensors, and prototypes. Share the parts, the costs, and the lessons.</p><span className="type-note">PARTS · BUILD PHOTOS · COSTS</span></article>
      <article><div className="type-object object-hybrid" aria-hidden="true"><DisciplineModel kind="hybrid" paused={paused}/><span/><i/><i/></div><span className="eyebrow">03 — HYBRID</span><h3>Better, connected.</h3><p>When physical builds meet thoughtful software. Show how both sides work as one.</p><span className="type-note">CONNECTED SYSTEMS · SHARED IDEAS</span></article>
    </div></section>
    <section id="the-collective" className="overview-collective overview-reveal"><div className="collective-copy"><div className="eyebrow">03 / A LITTLE SHARED KNOWLEDGE</div><h2>Your next idea<br/>could start with<br/><em>someone else’s.</em></h2><p>Discover projects by subject, technology, or project type. Star the work that inspires you, ask a question, and give a good idea its next chapter.</p><Link className="button orange" href="/projects">Find your inspiration <ArrowUpRight size={18}/></Link></div><div className="orbit-scene" role="img" aria-label="Dimensional community illustration connecting questions, stars, and new versions"><div className="orbit-ring ring-one"/><div className="orbit-ring ring-two"/><div className="orbit-core"><GitFork size={60}/></div><div className="orbit-note note-star"><Star size={23}/><strong>Worth sharing.</strong><span>Star a thoughtful build</span></div><div className="orbit-note note-version"><Code2 size={23}/><strong>A new chapter.</strong><span>Build on the original</span></div><div className="orbit-note note-question"><Users size={23}/><strong>Better together.</strong><span>Ask. Learn. Contribute.</span></div><span className="orbit-dot"/></div></section>
    <section className="overview-roles overview-reveal"><div><div className="eyebrow">A SPACE FOR EVERY CONTRIBUTION</div><h2>Made by students.<br/>Strengthened by educators.</h2></div><div className="role-notes"><article><span>FOR THE MAKERS</span><h3>Start small. Keep going.</h3><p>Your form remembers unfinished work in this browser. Save drafts to your account, add your team, and submit when you’re ready.</p><div><Check size={16}/> Draft recovery &amp; version history</div></article><article><span>FOR THE MENTORS</span><h3>Give good work direction.</h3><p>Review submissions in your assigned subjects, request changes with useful feedback, and help projects reach publication.</p><div><Check size={16}/> Scoped reviews &amp; recorded decisions</div></article></div></section>
  </div>;
}
