'use client';
import {useId} from 'react';
import {motion,useReducedMotion,type MotionProps} from 'framer-motion';

// A flat 2D step card, adapted from 21st.dev's "Sketchbook Reveal Card" (id 7217, by dhileepkumargm): a hand-drawn
// SVG border (feTurbulence + feDisplacementMap wobble) that draws itself on, then the object inside draws its own
// outline and fills in, then the text lines sweep across. All of it is stroke-dashoffset / opacity — no perspective,
// no translateZ, no pointer tilt — which is what replaced the 3D tilt card (21st.dev "Floating3DCard", id 9040) that
// used to live here. Recolored into this product's tokens (--card-accent per step, --paper/--white) and gated on
// prefers-reduced-motion: with it on, every element renders straight in its finished state.
//
// framer-motion's `pathLength` normalizes every stroke to length 1, so the reference's manual getTotalLength()
// measuring isn't needed and works the same on rects, circles and lines. The card is keyed by step, so moving to
// another step replays the draw-in.
type Anim=Pick<MotionProps,'initial'|'animate'|'transition'>;
/** Outlined shape: stroke draws on, then its fill fades in. */
type Draw=(order:number)=>Anim;
/** Fill-only shape (no stroke to draw): fades in at its place in the sequence. */
type Fill=(order:number,to?:number)=>Anim;
type ObjectProps={d:Draw;f:Fill};

// Recessed/highlight shapes fill with --paper, never --white: the card itself is --white, so a --white-filled shape
// sitting on it would vanish (in dark mode --white is a dark navy near-identical to the card's own background).
function NotebookObject({d,f}:ObjectProps){
 return <svg width="72" height="72" viewBox="0 0 64 64" fill="none">
  <motion.rect x="14" y="8" width="38" height="48" rx="4" fill="color-mix(in srgb,var(--card-accent) 20%,var(--paper))" stroke="var(--card-accent)" strokeWidth="2" {...d(0)}/>
  <motion.line x1="22" y1="20" x2="44" y2="20" stroke="var(--card-accent)" strokeWidth="2" strokeLinecap="round" opacity=".6" {...d(2)}/>
  <motion.line x1="22" y1="28" x2="44" y2="28" stroke="var(--card-accent)" strokeWidth="2" strokeLinecap="round" opacity=".6" {...d(3)}/>
  <motion.line x1="22" y1="36" x2="36" y2="36" stroke="var(--card-accent)" strokeWidth="2" strokeLinecap="round" opacity=".6" {...d(4)}/>
  <motion.rect x="10" y="6" width="6" height="52" rx="3" fill="var(--card-accent)" {...f(1)}/>
  {[14,22,30,38,46].map((y,i)=><motion.circle key={y} cx="13" cy={y} r="1.8" fill="var(--paper)" {...f(5+i*.3)}/>)}
  <motion.path d="M46 40 L58 28 L62 32 L50 44 L44 46 Z" fill="var(--paper)" stroke="var(--card-accent)" strokeWidth="1.8" strokeLinejoin="round" {...d(6)}/>
  <motion.path d="M58 28 L62 32 L59 35 L55 31 Z" fill="var(--card-accent)" {...f(7)}/>
 </svg>;
}
function RosterObject({d,f}:ObjectProps){
 return <svg width="72" height="72" viewBox="0 0 64 64" fill="none">
  <motion.path d="M24 4 h16 a2 2 0 0 1 2 2 v8 h-20 v-8 a2 2 0 0 1 2 -2 z" fill="var(--card-accent)" {...f(1)}/>
  <motion.rect x="26" y="8" width="12" height="4" rx="1" fill="var(--paper)" {...f(2)}/>
  <motion.rect x="10" y="12" width="44" height="46" rx="6" fill="color-mix(in srgb,var(--card-accent) 20%,var(--paper))" stroke="var(--card-accent)" strokeWidth="2" {...d(0)}/>
  <motion.circle cx="32" cy="30" r="9" fill="var(--paper)" stroke="var(--card-accent)" strokeWidth="2" {...d(2)}/>
  <motion.circle cx="32" cy="27" r="3.2" fill="var(--card-accent)" {...f(3)}/>
  <motion.path d="M25 34 a7 6 0 0 1 14 0" fill="var(--card-accent)" {...f(3.5)}/>
  <motion.line x1="18" y1="47" x2="46" y2="47" stroke="var(--card-accent)" strokeWidth="2" strokeLinecap="round" opacity=".6" {...d(4)}/>
  <motion.line x1="18" y1="53" x2="36" y2="53" stroke="var(--card-accent)" strokeWidth="2" strokeLinecap="round" opacity=".4" {...d(5)}/>
 </svg>;
}
function DevBoardObject({d,f}:ObjectProps){
 const pins=[27,32,37];
 return <svg width="72" height="72" viewBox="0 0 64 64" fill="none">
  <motion.rect x="8" y="10" width="48" height="44" rx="4" fill="color-mix(in srgb,var(--card-accent) 20%,var(--paper))" stroke="var(--card-accent)" strokeWidth="2" {...d(0)}/>
  {pins.map((x,i)=><motion.line key={`t${x}`} x1={x} y1="16" x2={x} y2="22" stroke="var(--card-accent)" strokeWidth="1.6" {...d(2+i*.3)}/>)}
  {pins.map((x,i)=><motion.line key={`b${x}`} x1={x} y1="42" x2={x} y2="48" stroke="var(--card-accent)" strokeWidth="1.6" {...d(2+i*.3)}/>)}
  {pins.map((y,i)=><motion.line key={`l${y}`} x1="16" y1={y} x2="22" y2={y} stroke="var(--card-accent)" strokeWidth="1.6" {...d(2+i*.3)}/>)}
  {pins.map((y,i)=><motion.line key={`r${y}`} x1="42" y1={y} x2="48" y2={y} stroke="var(--card-accent)" strokeWidth="1.6" {...d(2+i*.3)}/>)}
  <motion.rect x="22" y="22" width="20" height="20" rx="2" fill="var(--card-accent)" {...f(4)}/>
  <motion.rect x="26" y="26" width="12" height="12" rx="1" fill="var(--paper)" {...f(5,.8)}/>
  <motion.circle cx="14" cy="17" r="2.4" fill="#dca15b" {...f(6)}/>
  <motion.circle cx="50" cy="17" r="2.4" fill="var(--card-accent)" {...f(6.5)}/>
 </svg>;
}
function CameraObject({d,f}:ObjectProps){
 return <svg width="72" height="72" viewBox="0 0 64 64" fill="none">
  <motion.path d="M24 12 h16 l4 6 h10 a4 4 0 0 1 4 4 v28 a4 4 0 0 1 -4 4 H10 a4 4 0 0 1 -4 -4 V22 a4 4 0 0 1 4 -4 h10 z" fill="color-mix(in srgb,var(--card-accent) 20%,var(--paper))" stroke="var(--card-accent)" strokeWidth="2" strokeLinejoin="round" {...d(0)}/>
  <motion.path d="M24 12 h16 l4 6 H20 Z" fill="var(--card-accent)" {...f(2)}/>
  <motion.circle cx="32" cy="36" r="12" fill="var(--paper)" stroke="var(--card-accent)" strokeWidth="2" {...d(3)}/>
  <motion.circle cx="32" cy="36" r="6" fill="var(--card-accent)" {...f(5)}/>
  <motion.circle cx="50" cy="24" r="2.4" fill="var(--card-accent)" {...f(6)}/>
 </svg>;
}
function CalculatorObject({d,f}:ObjectProps){
 return <svg width="72" height="72" viewBox="0 0 64 64" fill="none">
  <motion.rect x="16" y="6" width="32" height="52" rx="5" fill="color-mix(in srgb,var(--card-accent) 20%,var(--paper))" stroke="var(--card-accent)" strokeWidth="2" {...d(0)}/>
  <motion.rect x="21" y="12" width="22" height="11" rx="2" fill="var(--card-accent)" {...f(2)}/>
  <motion.line x1="26" y1="17" x2="38" y2="17" stroke="var(--paper)" strokeWidth="1.6" strokeLinecap="round" opacity=".85" {...d(3)}/>
  {[0,1,2,3].map(row=>[0,1,2].map(col=><motion.rect key={`${row}-${col}`} x={21+col*8} y={30+row*7} width="5.5" height="4.5" rx="1.2" fill={row===3&&col===2?'var(--card-accent)':'color-mix(in srgb,var(--card-accent) 45%,var(--paper))'} {...f(4+(row*3+col)*.25)}/>))}
 </svg>;
}
function FolderObject({d,f}:ObjectProps){
 return <svg width="72" height="72" viewBox="0 0 64 64" fill="none">
  <motion.path d="M8 16 a4 4 0 0 1 4 -4 h12 l5 6 h21 a4 4 0 0 1 4 4 v28 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 Z" fill="color-mix(in srgb,var(--card-accent) 20%,var(--paper))" stroke="var(--card-accent)" strokeWidth="2" strokeLinejoin="round" {...d(0)}/>
  <motion.path d="M8 16 a4 4 0 0 1 4 -4 h12 l5 6 z" fill="var(--card-accent)" {...f(2)}/>
  <motion.circle cx="46" cy="44" r="12" fill="var(--card-accent)" {...f(4)}/>
  <motion.path d="M40 44 l4 4 l8 -8" stroke="var(--paper)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" {...d(5)}/>
 </svg>;
}

const STEPS:{Object:(props:ObjectProps)=>React.JSX.Element;label:string;name:string;accent:'blue'|'orange'|'green'|'dark'}[]=[
 {Object:NotebookObject,label:'IDEA NOTEBOOK',name:'Project notebook',accent:'blue'},
 {Object:RosterObject,label:'TEAM ROSTER',name:'Team identity badges',accent:'orange'},
 {Object:DevBoardObject,label:'DEV BOARD',name:'Development board',accent:'green'},
 {Object:CameraObject,label:'LIVE DEMO',name:'Demo camera',accent:'dark'},
 {Object:CalculatorObject,label:'COST BREAKDOWN',name:'Project calculator',accent:'dark'},
 {Object:FolderObject,label:'READY FOR REVIEW',name:'Review folder',accent:'blue'},
];
// Widths of the three sketched text lines under the label, as a share of the card's content width.
const LINES=[58,84,68];
const STEP=.1;

export default function StudioStepObject({step}:{step:number}){
 const {Object:StepObject,label,name,accent}=STEPS[step-1];
 const reduced=!!useReducedMotion();
 const filterId=`wobble-${useId().replace(/:/g,'')}`;
 const d:Draw=order=>reduced
  ?{initial:false,animate:{pathLength:1,fillOpacity:1}}
  :{initial:{pathLength:0,fillOpacity:0},animate:{pathLength:1,fillOpacity:1},transition:{pathLength:{duration:.55,delay:.5+order*STEP,ease:'easeInOut'},fillOpacity:{duration:.3,delay:.85+order*STEP}}};
 const f:Fill=(order,to=1)=>reduced
  ?{initial:false,animate:{opacity:to}}
  :{initial:{opacity:0},animate:{opacity:to},transition:{duration:.35,delay:.6+order*STEP}};
 return <div className="studio-step-object" data-object={step} aria-hidden="true">
  <div className="studio-object-stage">
   <motion.div key={step} className={`studio-2d-card accent-${accent}`} whileHover={reduced?undefined:{y:-4}} transition={{duration:.2}}>
    <svg className="studio-2d-card-border" viewBox="0 0 250 290" fill="none">
     <defs><filter id={filterId} x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".02" numOctaves="1" seed={step*7} result="turbulence"/><feDisplacementMap in="SourceGraphic" in2="turbulence" scale="3"/></filter></defs>
     <motion.path d="M24 6 H226 A18 18 0 0 1 244 24 V266 A18 18 0 0 1 226 284 H24 A18 18 0 0 1 6 266 V24 A18 18 0 0 1 24 6 Z" stroke="var(--card-accent)" strokeOpacity=".65" strokeWidth="2" strokeLinecap="round" style={{filter:`url(#${filterId})`}} initial={reduced?false:{pathLength:0}} animate={{pathLength:1}} transition={{duration:1,ease:'easeInOut'}}/>
    </svg>
    <span className="studio-2d-card-icon"><StepObject d={d} f={f}/></span>
    <span className="studio-2d-card-label">{label}</span>
    <span className="studio-2d-card-lines">{LINES.map((width,i)=><motion.i key={i} style={{width:`${width}%`,transformOrigin:'left'}} initial={reduced?false:{scaleX:0}} animate={{scaleX:1}} transition={{duration:.6,ease:'easeOut',delay:1.5+i*.15}}/>)}</span>
    <motion.span className="studio-2d-card-seal" initial={reduced?false:{scale:0}} animate={{scale:1}} transition={{type:'spring',stiffness:300,damping:14,delay:1.9}}/>
   </motion.div>
  </div>
  <span className="studio-object-caption">{name} / 0{step}</span>
 </div>;
}
