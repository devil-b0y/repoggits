'use client';
import {type ReactNode} from 'react';
import {motion} from 'framer-motion';
import {Words,group,useStill,useTilt} from './MotionKit';

/** GSAP owns the image inside; Framer owns this separate interactive surface. */
export function DepthCard({children}:{children:ReactNode}){
 const tilt=useTilt(3);
 return <motion.div className="ec-depth-card" data-motion={tilt.still?'still':'interactive'} style={tilt.style} {...tilt.handlers}
  whileHover={{y:tilt.still?0:-6}} whileTap={{scale:tilt.still?1:.985}} transition={{type:'spring',stiffness:190,damping:24}}>{children}</motion.div>;
}

export function MotionTitle({title,accent}:{title:string;accent:string}){
 const still=useStill();
 return <motion.h2 initial={still?false:'hidden'} whileInView="show" viewport={{once:true,amount:.5}} variants={group}><Words text={title}/><br/><em><Words text={accent}/></em></motion.h2>;
}

export function MotionChoice({children,active,onClick,indicator}:{children:ReactNode;active:boolean;onClick:()=>void;indicator:string}){
 const still=useStill();
 return <button className="ec-motion-choice" type="button" aria-pressed={active} onClick={onClick}>
  {active&&<motion.i aria-hidden="true" className="ec-choice-highlight" layoutId={indicator} transition={still?{duration:0}:{type:'spring',stiffness:330,damping:32}}/>}
  {children}
 </button>;
}
