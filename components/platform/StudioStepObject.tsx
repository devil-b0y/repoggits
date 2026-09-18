'use client';
import {useEffect,useRef} from 'react';
import {Calculator,Camera,Cpu,FolderCheck,IdCard,NotebookPen,type LucideIcon} from 'lucide-react';

// An exact copy of 21st.dev's "Floating3DCard" (id 9040, by n38693842) mechanism: a wrapping element sets
// perspective, the card itself is transform-style:preserve-3d, and a mousemove handler computes rotateX/rotateY
// straight from cursor position relative to the card's own rect — the same formula shape as the reference,
// applied directly to the DOM node exactly as theirs does, with a CSS transition (not JS easing) smoothing
// between updates the same way their `transition-transform duration-300 ease-out` class does. Content is layered
// at different translateZ depths (icon furthest forward, label behind it, a small seal furthest of all) so pieces
// genuinely float above the card face, matching how their reference floats a heading/image/buttons at different
// heights rather than a flat icon on a plane — which is what this replaced (see git history: a three.js WebGL
// scene, and before that, procedurally modeled geometry). Recolored into this product's own tokens and content
// (icon + label + accent seal) in place of the reference's stock photo and "Visit/Get Started" demo buttons, and
// — unlike the raw reference snippet — gated to mouse pointers and prefers-reduced-motion, matching every other
// motion feature in this codebase (see e.g. useTilt in MotionKit.tsx for the same pointerType/reduced-motion guard).
const STEPS:{Icon:LucideIcon;label:string;name:string;accent:'blue'|'orange'|'green'|'dark'}[]=[
 {Icon:NotebookPen,label:'IDEA NOTEBOOK',name:'Project notebook',accent:'blue'},
 {Icon:IdCard,label:'TEAM ROSTER',name:'Team identity badges',accent:'orange'},
 {Icon:Cpu,label:'DEV BOARD',name:'Development board',accent:'green'},
 {Icon:Camera,label:'LIVE DEMO',name:'Demo camera',accent:'dark'},
 {Icon:Calculator,label:'COST BREAKDOWN',name:'Project calculator',accent:'dark'},
 {Icon:FolderCheck,label:'READY FOR REVIEW',name:'Review folder',accent:'blue'},
];

export default function StudioStepObject({step}:{step:number}){
 const card=useRef<HTMLDivElement>(null);
 const {Icon,label,name,accent}=STEPS[step-1];

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
    <span className="studio-3d-card-icon" style={{transform:'translateZ(70px)'}}><Icon size={60} strokeWidth={1.6}/></span>
    <span className="studio-3d-card-label" style={{transform:'translateZ(45px)'}}>{label}</span>
    <span className="studio-3d-card-seal" style={{transform:'translateZ(90px)'}}/>
   </div>
  </div>
  <span className="studio-object-caption">{name} / 0{step}</span>
 </div>;
}
