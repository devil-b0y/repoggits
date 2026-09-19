'use client';
import {motion,useReducedMotion} from 'framer-motion';

// Premium 3D renders (see public/images/studio-objects/README.md for sources/license) shown one per
// step, floating on the existing white card. Replaced the earlier flat hand-drawn SVG sketch ("Sketchbook
// Reveal Card"-style, 21st.dev id 7217) with real dimensional imagery for a more premium/technology feel,
// while keeping the card's size, position, accent colors and reveal timing untouched. Still a flat 2D
// card (no perspective/tilt) — only the object rendered inside it now looks three-dimensional.
// The "-v2" suffix isn't a version number for its own sake: an earlier cutout of these images shipped with a
// white matte still visible behind the object, was fixed in place under the original filenames, and browsers
// that had already cached those URLs kept showing the old bitmap through a normal reload. New filenames force
// every cache to fetch the corrected (transparent-background) image.
const STEPS:{src:string;label:string;name:string;accent:'blue'|'orange'|'green'|'dark'}[]=[
 {src:'/images/studio-objects/notebook-v2.webp',label:'IDEA NOTEBOOK',name:'Project notebook',accent:'blue'},
 {src:'/images/studio-objects/chat-bubble-v2.webp',label:'TEAM ROSTER',name:'Team identity badges',accent:'orange'},
 {src:'/images/studio-objects/cube-v2.webp',label:'DEV BOARD',name:'Development board',accent:'green'},
 {src:'/images/studio-objects/camera-v2.webp',label:'LIVE DEMO',name:'Demo camera',accent:'dark'},
 {src:'/images/studio-objects/chart-v2.webp',label:'COST BREAKDOWN',name:'Project calculator',accent:'dark'},
 {src:'/images/studio-objects/folder-v2.webp',label:'READY FOR REVIEW',name:'Review folder',accent:'blue'},
];

export default function StudioStepObject({step}:{step:number}){
 const {src,label,name,accent}=STEPS[step-1];
 const reduced=!!useReducedMotion();
 return <div className="studio-step-object" data-object={step} aria-hidden="true">
  <div className="studio-object-stage">
   <motion.div key={step} className={`studio-object-card accent-${accent}`} initial={reduced?false:{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{duration:.5,ease:'easeOut'}} whileHover={reduced?undefined:{y:-6}}>
    <span className="studio-object-card-glow"/>
    <motion.img className="studio-object-card-image" src={src} alt="" width={220} height={220} initial={reduced?false:{opacity:0,scale:.85,y:12}} animate={{opacity:1,scale:1,y:0}} transition={{duration:.65,delay:.15,ease:[0.16,1,0.3,1]}}/>
    <span className="studio-object-card-shadow"/>
    <span className="studio-object-card-label">{label}</span>
   </motion.div>
  </div>
  <span className="studio-object-caption">{name} / 0{step}</span>
 </div>;
}
