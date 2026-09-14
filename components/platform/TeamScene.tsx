'use client';
import {useEffect,useRef} from 'react';
import './team-scene.css';

/** The masked second pose moves only the hands, preserving the faces and camera. */
export default function TeamScene({paused}:{paused:boolean}){
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const el=root.current;if(!el)return;
    const media=matchMedia('(prefers-reduced-motion: reduce)');let visible=false,frame=0;
    function refresh(){
      if(!el)return;const stopped=paused||media.matches||!visible||document.hidden;
      el.dataset.motion=stopped?'paused':'running';
      if(stopped){cancelAnimationFrame(frame);frame=0;return;}
      if(frame)return;frame=requestAnimationFrame(()=>{
        frame=0;const parent=el.closest('.maker-story,.overview-collective')??el;
        const b=parent.getBoundingClientRect();
        const progress=Math.max(0,Math.min(1,(innerHeight-b.top)/(innerHeight+b.height)));
        el.style.setProperty('--team-travel',`${(progress-.5)*26}px`);
        el.dataset.progress=progress.toFixed(3);
      });
    }
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;refresh();});observer.observe(el);
    media.addEventListener('change',refresh);document.addEventListener('visibilitychange',refresh);window.addEventListener('scroll',refresh,{passive:true});refresh();
    return()=>{observer.disconnect();cancelAnimationFrame(frame);media.removeEventListener('change',refresh);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('scroll',refresh);};
  },[paused]);
  return <div ref={root} className="team-scene" data-motion="paused" role="img" aria-label="Animated illustration of engineering students testing their ESP32 plant project together">
    <div className="team-depth"><picture><source media="(max-width:680px)" srcSet="/images/maker-story/team-mobile.webp"/><img src="/images/maker-story/team.webp" alt="" loading="lazy" width={1536} height={1024} draggable={false}/></picture><picture className="team-activity-pose"><source media="(max-width:680px)" srcSet="/images/maker-story/team-next-mobile.webp"/><img src="/images/maker-story/team-next.webp" alt="" loading="lazy" width={1536} height={1024} draggable={false}/></picture></div>
  </div>;
}
