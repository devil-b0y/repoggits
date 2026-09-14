'use client';
import Link from 'next/link';
import {motion,useMotionValueEvent,useScroll,useSpring,useTransform,type MotionValue} from 'framer-motion';
import {ArrowUpRight,BadgeCheck,Check,Code2,Cpu,GitFork,GraduationCap,MonitorPlay,PackageOpen,Send,Users,Wrench} from 'lucide-react';
import {Magnetic,VelocityMarquee,Words,fromSide,group,inView,rise,useSectionScroll,useStill,useTilt} from './MotionKit';

/** A thin bar across the top of the window that fills as the page is read. */
export function CapsuleProgress(){
  const {scrollYProgress}=useScroll();
  const scaleX=useSpring(scrollYProgress,{stiffness:140,damping:30,mass:.3});
  return <motion.div className="capsule-page-progress" style={{scaleX}} aria-hidden="true"/>;
}

const contents=['Source code','Wiring diagrams','Build photos','Team credits','Mentor notes','Demo videos','Version history'];
export function CapsuleStrip(){
  return <div className="capsule-strip"><VelocityMarquee className="capsule-strip-track">{[0,1,2].map(copy=><div key={copy} aria-hidden={copy>0?true:undefined}>{contents.map(item=><span key={item}>{item}<i aria-hidden="true"/></span>)}</div>)}</VelocityMarquee></div>;
}

const layers=[
  {icon:Code2,name:'Code',file:'/src',title:'Readable source',text:'Every file, versioned, with a README that says how to run it.',tone:'navy'},
  {icon:Cpu,name:'Build',file:'/hardware',title:'The real build',text:'Parts, wiring and photos from the bench, not just the finished shot.',tone:'blue'},
  {icon:Users,name:'People',file:'/team',title:'Honest credit',text:'Each maker and mentor, and what each of them contributed.',tone:'cream'},
  {icon:MonitorPlay,name:'Demo',file:'/demo',title:'Proof it runs',text:'Screenshots, a video or a live link anyone can open.',tone:'orange'},
];
function LayerCard({layer,index}:{layer:(typeof layers)[number];index:number}){
  const tilt=useTilt(8),Icon=layer.icon;
  return <motion.div className="capsule-card-shell" variants={rise}>
    <motion.article className={`capsule-card tone-${layer.tone}`} style={tilt.still?undefined:tilt.style} {...tilt.handlers}>
      {!tilt.still&&<motion.span className="capsule-glare" style={{background:tilt.glare}} aria-hidden="true"/>}
      <div className="capsule-card-top"><span className="capsule-card-icon"><Icon size={20}/></span><code>{layer.file}</code></div>
      <span className="capsule-card-index">0{index+1} / {layer.name}</span>
      <h3>{layer.title}</h3>
      <p>{layer.text}</p>
      <div className="capsule-card-slab" aria-hidden="true"><i/><i/><i/></div>
    </motion.article>
  </motion.div>;
}
export function CapsuleContents(){
  return <section id="capsule-contents" className="capsule-section capsule-contents">
    <motion.div className="capsule-heading" variants={group} {...inView}>
      <motion.span className="eyebrow" variants={rise}>WHAT A CAPSULE HOLDS</motion.span>
      <motion.h2 variants={group}><Words text="Inside every"/> <em><Words text="capsule."/></em></motion.h2>
      <motion.p variants={rise}>The same four layers you just watched open. Pack them once and anyone can pick your project up where you left off.</motion.p>
    </motion.div>
    <motion.div className="capsule-cards" variants={group} {...inView}>{layers.map((layer,i)=><LayerCard key={layer.name} layer={layer} index={i}/>)}</motion.div>
  </section>;
}

const steps=[
  {icon:PackageOpen,title:'Pack it',text:'Describe what you built in a few sentences. The Gemini assistant drafts the details; you add the photos and check every field.'},
  {icon:BadgeCheck,title:'Get it reviewed',text:'A reviewer reads the whole capsule, then approves it or sends it back with a reason.'},
  {icon:Send,title:'Share it',text:'It joins the project notebook, where students and teachers can browse it and download the source.'},
  {icon:GitFork,title:'Build on it',text:'Someone opens your capsule, learns from it, and publishes the next version.'},
];
function Step({step,index,progress}:{step:(typeof steps)[number];index:number;progress:MotionValue<number>}){
  const still=useStill(),start=index/steps.length;
  const lit=useTransform(progress,[start,start+.15],[0,1]);
  const Icon=step.icon;
  return <motion.li className="capsule-step" variants={rise}>
    <span className="capsule-step-node"><motion.i className="capsule-step-glow" style={{opacity:still?1:lit}} aria-hidden="true"/><Icon size={20}/></span>
    <small>STEP 0{index+1}</small>
    <h3>{step.title}</h3>
    <p>{step.text}</p>
  </motion.li>;
}
export function CapsuleTimeline(){
  const still=useStill();
  const {ref,progress}=useSectionScroll(['start 80%','end 70%']);
  useMotionValueEvent(progress,'change',value=>{if(ref.current)ref.current.dataset.progress=value.toFixed(3);});
  return <section ref={ref} className="capsule-section capsule-timeline">
    <motion.div className="capsule-heading" variants={group} {...inView}>
      <motion.span className="eyebrow" variants={rise}>HOW A CAPSULE TRAVELS</motion.span>
      <motion.h2 variants={group}><Words text="From idea to"/> <em><Words text="the next version."/></em></motion.h2>
      <motion.p variants={rise}>Pack it once, and it keeps working for you and for everyone who builds after you.</motion.p>
    </motion.div>
    <div className="capsule-timeline-body">
      <div className="capsule-track" aria-hidden="true"><motion.i style={{scaleX:still?1:progress}}/></div>
      <div className="capsule-track-y" aria-hidden="true"><motion.i style={{scaleY:still?1:progress}}/></div>
      <motion.ol className="capsule-steps" variants={group} {...inView}>{steps.map((step,i)=><Step key={step.title} step={step} index={i} progress={progress}/>)}</motion.ol>
    </div>
  </section>;
}

const audiences=[
  {icon:Wrench,eyebrow:'FOR MAKERS',title:'Give your work a place to last.',points:['Keep the code, photos and credits together','Let Gemini draft the write-up from a short prompt','Publish a new version when the project grows'],href:'/submit',action:'Share your project',tone:'ink'},
  {icon:GraduationCap,eyebrow:'FOR MENTORS',title:'Review with the whole project in view.',points:['See the build, the code and the team in one place','Approve it, or send it back with a reason','Point new students to strong past projects'],href:'/admin',action:'Open the review desk',tone:'paper'},
];
function Audience({audience,index}:{audience:(typeof audiences)[number];index:number}){
  const tilt=useTilt(5),Icon=audience.icon;
  return <motion.div className="capsule-audience-shell" variants={fromSide(index===0?-1:1)}>
    <motion.article className={`capsule-audience tone-${audience.tone}`} style={tilt.still?undefined:tilt.style} {...tilt.handlers}>
      {!tilt.still&&<motion.span className="capsule-glare" style={{background:tilt.glare}} aria-hidden="true"/>}
      <span className="capsule-audience-orbit" aria-hidden="true"/>
      <span className="capsule-audience-icon"><Icon size={22}/></span>
      <span className="eyebrow">{audience.eyebrow}</span>
      <h3>{audience.title}</h3>
      <ul>{audience.points.map(point=><li key={point}><Check size={16} aria-hidden="true"/>{point}</li>)}</ul>
      <Link className="capsule-audience-link" href={audience.href}>{audience.action} <ArrowUpRight size={16}/></Link>
    </motion.article>
  </motion.div>;
}
export function CapsulePeople(){
  return <section className="capsule-section capsule-people">
    <motion.div className="capsule-heading" variants={group} {...inView}>
      <motion.span className="eyebrow" variants={rise}>MAKERS AND MENTORS</motion.span>
      <motion.h2 variants={group}><Words text="Built by students,"/> <em><Words text="guided by teachers."/></em></motion.h2>
      <motion.p variants={rise}>One place for the people who make projects and the people who help them get better.</motion.p>
    </motion.div>
    <motion.div className="capsule-audiences" variants={group} {...inView}>{audiences.map((audience,i)=><Audience key={audience.eyebrow} audience={audience} index={i}/>)}</motion.div>
  </section>;
}

const slabs=['base','code','build','people','demo','lid'];
/** One layer of the closing capsule; the layers spread apart as the section scrolls into place. */
function Slab({name,index,progress}:{name:string;index:number;progress:MotionValue<number>}){
  const still=useStill();
  const z=useTransform(progress,[.1,.9],[index*12,index*30+(name==='lid'?36:0)]);
  return <motion.span className={`capsule-slab slab-${name}`} style={still?undefined:{z}}/>;
}
export function CapsuleFinale(){
  const still=useStill();
  // Ends when the section's bottom meets the viewport's, a point the short footer always lets you reach.
  const {ref,progress}=useSectionScroll(['start end','end end']);
  const rotateX=useTransform(progress,[0,1],[64,54]),rotateZ=useTransform(progress,[0,1],[-58,-36]),y=useTransform(progress,[0,1],[60,0]);
  return <section ref={ref} className="capsule-section capsule-finale">
    <motion.div className="capsule-finale-copy" variants={group} {...inView}>
      <motion.span className="eyebrow" variants={rise}>YOUR TURN</motion.span>
      <motion.h2 variants={group}><Words text="Pack your first"/> <em><Words text="capsule."/></em></motion.h2>
      <motion.p variants={rise}>Start with a few sentences about what you built. Add photos, credit your team, and send it for review.</motion.p>
      <motion.div className="capsule-finale-actions" variants={rise}>
        <Magnetic><Link className="button orange" href="/submit">Share your project <ArrowUpRight size={17}/></Link></Magnetic>
        <Link className="capsule-link" href="/projects" target="_blank" rel="noopener noreferrer">Explore projects <ArrowUpRight size={16}/></Link>
      </motion.div>
    </motion.div>
    <div className="capsule-cube-scene" aria-hidden="true">
      <span className="capsule-cube-shadow"/>
      <motion.div className="capsule-cube" style={still?undefined:{rotateX,rotateZ,y}}>{slabs.map((name,i)=><Slab key={name} name={name} index={i} progress={progress}/>)}</motion.div>
    </div>
  </section>;
}
