'use client';
import {createContext,useContext,useEffect,useRef,useState,type CSSProperties,type ReactNode,type PointerEvent as ReactPointerEvent} from 'react';
import {MotionConfig,MotionGlobalConfig,motion,useAnimationFrame,useInView,useMotionTemplate,useMotionValue,useScroll,useSpring,useTransform,useVelocity,type Variants} from 'framer-motion';

/** Paused or reduced motion: every Framer animation inside resolves instantly, with no running animations left behind. */
const StillContext=createContext(false);
export const useStill=()=>useContext(StillContext);

export function MotionStage({paused,children}:{paused:boolean;children:ReactNode}){
  // Read after hydration so the server and first client render agree.
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    // MotionConfig is only read when an element mounts; the global switch also covers reveals already on the page.
    const sync=()=>{MotionGlobalConfig.skipAnimations=paused||media.matches;setReduced(media.matches);};
    sync();media.addEventListener('change',sync);
    return()=>{media.removeEventListener('change',sync);MotionGlobalConfig.skipAnimations=false;};
  },[paused]);
  const still=paused||reduced;
  return <StillContext.Provider value={still}><MotionConfig skipAnimations={still} reducedMotion="never">{children}</MotionConfig></StillContext.Provider>;
}

export const ease=[.16,1,.3,1] as const;
export const inView={initial:'hidden',whileInView:'show',viewport:{once:true,amount:.2}} as const;
export const group:Variants={hidden:{},show:{transition:{staggerChildren:.07,delayChildren:.04}}};
export const rise:Variants={
  hidden:{opacity:0,y:42,rotateX:-16},
  show:{opacity:1,y:0,rotateX:0,transition:{type:'spring',stiffness:85,damping:17,mass:.9}},
};
export const fromSide=(direction:1|-1):Variants=>({
  hidden:{opacity:0,x:60*direction,rotateY:-22*direction},
  show:{opacity:1,x:0,rotateY:0,transition:{type:'spring',stiffness:80,damping:18}},
});
const word:Variants={
  hidden:{opacity:0,y:'.45em',rotateX:-50},
  show:{opacity:1,y:0,rotateX:0,transition:{type:'spring',stiffness:120,damping:15,mass:.7}},
};
export const depth:import('framer-motion').MotionStyle={transformPerspective:1100};

/** Splits copy into words that flip up in 3D; spaces stay as text so the heading reads naturally. */
export function Words({text}:{text:string}){
  const parts=text.split(' ');
  return <>{parts.map((part,i)=><span key={`${part}-${i}`}><motion.span className="motion-word" variants={word} style={{transformPerspective:500}}>{part}</motion.span>{i<parts.length-1?' ':''}</span>)}</>;
}

/** Pointer-driven 3D tilt with a soft glare; mouse only, and flat whenever motion is still. */
export function useTilt(max=7){
  const still=useStill();
  const spring={stiffness:170,damping:18,mass:.5};
  const rotateX=useSpring(0,spring),rotateY=useSpring(0,spring);
  const glareX=useMotionValue(50),glareY=useMotionValue(30);
  const glare=useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, var(--tilt-glare, rgba(255,255,255,.28)), transparent 58%)`;
  useEffect(()=>{if(still){rotateX.jump(0);rotateY.jump(0);}},[still,rotateX,rotateY]);
  function onPointerMove(event:ReactPointerEvent<HTMLElement>){
    if(still||event.pointerType!=='mouse')return;
    const bounds=event.currentTarget.getBoundingClientRect();
    const px=(event.clientX-bounds.left)/bounds.width,py=(event.clientY-bounds.top)/bounds.height;
    rotateY.set((px-.5)*max*2);rotateX.set((.5-py)*max*2);glareX.set(px*100);glareY.set(py*100);
  }
  function onPointerLeave(){rotateX.set(0);rotateY.set(0);}
  return {style:{rotateX,rotateY,transformPerspective:1200},handlers:{onPointerMove,onPointerLeave},glare,still};
}

/** Scroll progress of a section through the viewport, springed for a weighted feel. */
export function useSectionScroll(offset:NonNullable<Parameters<typeof useScroll>[0]>['offset']=['start end','end start']){
  const ref=useRef<HTMLElement>(null);
  const {scrollYProgress}=useScroll({target:ref,offset});
  const progress=useSpring(scrollYProgress,{stiffness:120,damping:26,mass:.4});
  return {ref,progress};
}

/** Gentle pull toward the pointer for one focal call to action per view. */
export function Magnetic({children,strength=.22,className=''}:{children:ReactNode;strength?:number;className?:string}){
  const still=useStill();
  const x=useSpring(0,{stiffness:220,damping:16,mass:.4}),y=useSpring(0,{stiffness:220,damping:16,mass:.4});
  useEffect(()=>{if(still){x.jump(0);y.jump(0);}},[still,x,y]);
  return <motion.span className={`magnetic ${className}`} style={{x,y}}
    onPointerMove={event=>{if(still||event.pointerType!=='mouse')return;const b=event.currentTarget.getBoundingClientRect();x.set((event.clientX-b.left-b.width/2)*strength);y.set((event.clientY-b.top-b.height/2)*strength);}}
    onPointerLeave={()=>{x.set(0);y.set(0);}}>{children}</motion.span>;
}

/** An endless strip that speeds up and leans with scroll velocity; it rests centred when motion is still. */
export function VelocityMarquee({className,children,speed=36}:{className:string;children:ReactNode;speed?:number}){
  const still=useStill(),track=useRef<HTMLDivElement>(null),visible=useInView(track,{margin:'100px'});
  const x=useMotionValue(0),direction=useRef(-1);
  const {scrollY}=useScroll();
  const velocity=useSpring(useVelocity(scrollY),{damping:50,stiffness:400});
  const boost=useTransform(velocity,[-2400,0,2400],[-5,0,5],{clamp:false});
  const skewX=useTransform(velocity,[-2400,0,2400],[7,0,-7]);
  useEffect(()=>{if(still)x.set(0);},[still,x]);
  useAnimationFrame((_,delta)=>{
    const el=track.current;if(still||!visible||!el)return;
    const width=el.scrollWidth/3;if(!width)return;
    const push=boost.get();if(push>.05)direction.current=-1;else if(push<-.05)direction.current=1;
    const next=x.get()+direction.current*speed*(delta/1000)*(1+Math.abs(push));
    x.set(((next%width)-width)%width);
  });
  return <motion.div ref={track} className={className} data-marquee={still?'still':'running'} style={still?undefined:{x,skewX}}>{children}</motion.div>;
}
