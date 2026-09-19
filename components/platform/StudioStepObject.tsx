'use client';
import {useEffect,useRef} from 'react';

// An exact copy of 21st.dev's "Floating3DCard" (id 9040, by n38693842) mechanism: a wrapping element sets
// perspective, the card itself is transform-style:preserve-3d, and a mousemove handler computes rotateX/rotateY
// straight from cursor position relative to the card's own rect — the same formula shape as the reference,
// applied directly to the DOM node exactly as theirs does, with a CSS transition (not JS easing) smoothing
// between updates the same way their `transition-transform duration-300 ease-out` class does. Content is layered
// at different translateZ depths (object furthest forward, label behind it, a small seal furthest of all) so
// pieces genuinely float above the card face, matching how their reference floats a heading/image/buttons at
// different heights rather than a flat icon on a plane — which is what this replaced (see git history: a three.js
// WebGL scene, and before that, procedurally modeled geometry, and before that a single bare Lucide glyph).
// Recolored into this product's own tokens and content (object + label + accent seal) in place of the reference's
// stock photo and "Visit/Get Started" demo buttons, and — unlike the raw reference snippet — gated to mouse
// pointers and prefers-reduced-motion, matching every other motion feature in this codebase (see e.g. useTilt in
// MotionKit.tsx for the same pointerType/reduced-motion guard).
//
// Each step's object below is a hand-built flat 2D illustration (not a single-glyph icon font): two or three
// layered shapes per object, colored from the same --card-accent variable the card itself sets per accent, so a
// dark-mode or accent change re-tints the object automatically with no separate palette to keep in sync.
// Recessed/highlight shapes fill with --paper, never --white: the card itself is --white, so a --white-filled
// shape sitting on it would vanish (this bit in dark mode, where --white is a dark navy near-identical to the
// card's own background — see git history). --paper reliably differs from --white in both themes. Each object
// also carries at least one *solid* --card-accent shape (not just a tinted fill + stroke outline), so it reads as
// a filled illustration rather than a redrawn outline of the single-glyph Lucide icon it replaced.
function NotebookObject(){
 return <svg width="60" height="60" viewBox="0 0 64 64" fill="none">
  <rect x="14" y="8" width="38" height="48" rx="4" fill="color-mix(in srgb,var(--card-accent) 20%,var(--paper))" stroke="var(--card-accent)" strokeWidth="2"/>
  <line x1="22" y1="20" x2="44" y2="20" stroke="var(--card-accent)" strokeWidth="2" strokeLinecap="round" opacity=".6"/>
  <line x1="22" y1="28" x2="44" y2="28" stroke="var(--card-accent)" strokeWidth="2" strokeLinecap="round" opacity=".6"/>
  <line x1="22" y1="36" x2="36" y2="36" stroke="var(--card-accent)" strokeWidth="2" strokeLinecap="round" opacity=".6"/>
  <rect x="10" y="6" width="6" height="52" rx="3" fill="var(--card-accent)"/>
  {[14,22,30,38,46].map(y=><circle key={y} cx="13" cy={y} r="1.8" fill="var(--paper)"/>)}
  <path d="M46 40 L58 28 L62 32 L50 44 L44 46 Z" fill="var(--paper)" stroke="var(--card-accent)" strokeWidth="1.8" strokeLinejoin="round"/>
  <path d="M58 28 L62 32 L59 35 L55 31 Z" fill="var(--card-accent)"/>
 </svg>;
}
function RosterObject(){
 return <svg width="60" height="60" viewBox="0 0 64 64" fill="none">
  <path d="M24 4 h16 a2 2 0 0 1 2 2 v8 h-20 v-8 a2 2 0 0 1 2 -2 z" fill="var(--card-accent)"/>
  <rect x="26" y="8" width="12" height="4" rx="1" fill="var(--paper)"/>
  <rect x="10" y="12" width="44" height="46" rx="6" fill="color-mix(in srgb,var(--card-accent) 20%,var(--paper))" stroke="var(--card-accent)" strokeWidth="2"/>
  <circle cx="32" cy="30" r="9" fill="var(--paper)" stroke="var(--card-accent)" strokeWidth="2"/>
  <circle cx="32" cy="27" r="3.2" fill="var(--card-accent)"/>
  <path d="M25 34 a7 6 0 0 1 14 0" fill="var(--card-accent)"/>
  <line x1="18" y1="47" x2="46" y2="47" stroke="var(--card-accent)" strokeWidth="2" strokeLinecap="round" opacity=".6"/>
  <line x1="18" y1="53" x2="36" y2="53" stroke="var(--card-accent)" strokeWidth="2" strokeLinecap="round" opacity=".4"/>
 </svg>;
}
function DevBoardObject(){
 return <svg width="60" height="60" viewBox="0 0 64 64" fill="none">
  <rect x="8" y="10" width="48" height="44" rx="4" fill="color-mix(in srgb,var(--card-accent) 20%,var(--paper))" stroke="var(--card-accent)" strokeWidth="2"/>
  <rect x="22" y="22" width="20" height="20" rx="2" fill="var(--card-accent)"/>
  <rect x="26" y="26" width="12" height="12" rx="1" fill="var(--paper)" opacity=".8"/>
  {[27,32,37].map(x=><line key={`t${x}`} x1={x} y1="16" x2={x} y2="22" stroke="var(--card-accent)" strokeWidth="1.6"/>)}
  {[27,32,37].map(x=><line key={`b${x}`} x1={x} y1="42" x2={x} y2="48" stroke="var(--card-accent)" strokeWidth="1.6"/>)}
  {[27,32,37].map(y=><line key={`l${y}`} x1="16" y1={y} x2="22" y2={y} stroke="var(--card-accent)" strokeWidth="1.6"/>)}
  {[27,32,37].map(y=><line key={`r${y}`} x1="42" y1={y} x2="48" y2={y} stroke="var(--card-accent)" strokeWidth="1.6"/>)}
  <circle cx="14" cy="17" r="2.4" fill="#dca15b"/>
  <circle cx="50" cy="17" r="2.4" fill="var(--card-accent)"/>
 </svg>;
}
function CameraObject(){
 return <svg width="60" height="60" viewBox="0 0 64 64" fill="none">
  <path d="M24 12 h16 l4 6 h10 a4 4 0 0 1 4 4 v28 a4 4 0 0 1 -4 4 H10 a4 4 0 0 1 -4 -4 V22 a4 4 0 0 1 4 -4 h10 z" fill="color-mix(in srgb,var(--card-accent) 20%,var(--paper))" stroke="var(--card-accent)" strokeWidth="2" strokeLinejoin="round"/>
  <path d="M24 12 h16 l4 6 H20 Z" fill="var(--card-accent)"/>
  <circle cx="32" cy="36" r="12" fill="var(--paper)" stroke="var(--card-accent)" strokeWidth="2"/>
  <circle cx="32" cy="36" r="6" fill="var(--card-accent)"/>
  <circle cx="50" cy="24" r="2.4" fill="var(--card-accent)"/>
 </svg>;
}
function CalculatorObject(){
 return <svg width="60" height="60" viewBox="0 0 64 64" fill="none">
  <rect x="16" y="6" width="32" height="52" rx="5" fill="color-mix(in srgb,var(--card-accent) 20%,var(--paper))" stroke="var(--card-accent)" strokeWidth="2"/>
  <rect x="21" y="12" width="22" height="11" rx="2" fill="var(--card-accent)"/>
  <line x1="26" y1="17" x2="38" y2="17" stroke="var(--paper)" strokeWidth="1.6" strokeLinecap="round" opacity=".85"/>
  {[0,1,2,3].map(row=>[0,1,2].map(col=><rect key={`${row}-${col}`} x={21+col*8} y={30+row*7} width="5.5" height="4.5" rx="1.2" fill={row===3&&col===2?'var(--card-accent)':'color-mix(in srgb,var(--card-accent) 45%,var(--paper))'}/>))}
 </svg>;
}
function FolderObject(){
 return <svg width="60" height="60" viewBox="0 0 64 64" fill="none">
  <path d="M8 16 a4 4 0 0 1 4 -4 h12 l5 6 h21 a4 4 0 0 1 4 4 v28 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 -4 -4 Z" fill="color-mix(in srgb,var(--card-accent) 20%,var(--paper))" stroke="var(--card-accent)" strokeWidth="2" strokeLinejoin="round"/>
  <path d="M8 16 a4 4 0 0 1 4 -4 h12 l5 6 z" fill="var(--card-accent)"/>
  <circle cx="46" cy="44" r="12" fill="var(--card-accent)"/>
  <path d="M40 44 l4 4 l8 -8" stroke="var(--paper)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
 </svg>;
}

const STEPS:{Object:()=>React.JSX.Element;label:string;name:string;accent:'blue'|'orange'|'green'|'dark'}[]=[
 {Object:NotebookObject,label:'IDEA NOTEBOOK',name:'Project notebook',accent:'blue'},
 {Object:RosterObject,label:'TEAM ROSTER',name:'Team identity badges',accent:'orange'},
 {Object:DevBoardObject,label:'DEV BOARD',name:'Development board',accent:'green'},
 {Object:CameraObject,label:'LIVE DEMO',name:'Demo camera',accent:'dark'},
 {Object:CalculatorObject,label:'COST BREAKDOWN',name:'Project calculator',accent:'dark'},
 {Object:FolderObject,label:'READY FOR REVIEW',name:'Review folder',accent:'blue'},
];

export default function StudioStepObject({step}:{step:number}){
 const card=useRef<HTMLDivElement>(null);
 const {Object:StepObject,label,name,accent}=STEPS[step-1];

 useEffect(()=>{
  const el=card.current;if(!el)return;
  const fine=matchMedia('(pointer: fine)'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function rest(){
   el!.style.transform='perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)';
   el!.style.setProperty('--tilt-glow-strength','0');
  }
  function move(e:PointerEvent){
   if(e.pointerType!=='mouse'||!fine.matches||reduced.matches)return;
   const {left,top,width,height}=el!.getBoundingClientRect();
   if(!width||!height)return;
   const x=e.clientX-left,y=e.clientY-top;
   // Same shape as the reference: distance from center over half-extent, times a 15deg max tilt.
   const rotateX=((y-height/2)/height)*-15,rotateY=((x-width/2)/width)*15;
   el!.style.transform=`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
   el!.style.setProperty('--tilt-glow-x',`${(x/width*100).toFixed(1)}%`);
   el!.style.setProperty('--tilt-glow-y',`${(y/height*100).toFixed(1)}%`);
   el!.style.setProperty('--tilt-glow-strength','1');
  }
  rest();
  el.addEventListener('pointermove',move);el.addEventListener('pointerleave',rest);
  reduced.addEventListener('change',rest);
  return()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',rest);reduced.removeEventListener('change',rest);};
 },[step]);

 return <div className="studio-step-object" data-object={step} aria-hidden="true">
  <div className="studio-object-stage">
   <div ref={card} className={`studio-3d-card accent-${accent}`}>
    <span className="studio-3d-card-icon" style={{transform:'translateZ(70px)'}}><StepObject/></span>
    <span className="studio-3d-card-label" style={{transform:'translateZ(45px)'}}>{label}</span>
    <span className="studio-3d-card-seal" style={{transform:'translateZ(90px)'}}/>
   </div>
  </div>
  <span className="studio-object-caption">{name} / 0{step}</span>
 </div>;
}
