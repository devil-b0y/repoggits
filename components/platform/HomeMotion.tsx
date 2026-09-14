'use client';
import {useEffect,useRef} from 'react';
import './home-motion.css';

/** One shared scroll pass drives decorative layers; text and links remain in normal flow. */
export default function HomeMotion({paused}:{paused:boolean}){
  const anchor=useRef<HTMLSpanElement>(null);
  useEffect(()=>{
    const root=anchor.current?.parentElement;if(!root)return;
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    const scenes=Array.from(root.querySelectorAll<HTMLElement>('.discipline-strip,.overview-intro,.overview-story,.overview-types,.overview-collective,.overview-roles,.next-chapter,.home-finale'));
    let frame=0;const visible=new Set<HTMLElement>();
    scenes.forEach(el=>el.classList.add('motion-scene'));
    function update(){if(frame)return;frame=requestAnimationFrame(()=>{
      frame=0;const still=paused||preference.matches||document.hidden;root!.dataset.motion=still?'paused':'running';
      const positions=[...visible].map(el=>({el,p:Math.max(0,Math.min(1,(innerHeight-el.getBoundingClientRect().top)/(innerHeight+el.offsetHeight)))}));
      positions.forEach(({el,p})=>{el.style.setProperty('--section-progress',String(still?.5:p));el.dataset.scroll=still?'0.500':p.toFixed(3);});
      const travel=document.documentElement.scrollHeight-innerHeight;
      root!.style.setProperty('--page-progress',travel>0?(scrollY/travel).toFixed(4):'0');
    });}
    const observer=new IntersectionObserver(entries=>{for(const entry of entries){const el=entry.target as HTMLElement;if(entry.isIntersecting)visible.add(el);else visible.delete(el);}update();},{rootMargin:'100px'});
    scenes.forEach(el=>observer.observe(el));
    window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);preference.addEventListener('change',update);document.addEventListener('visibilitychange',update);update();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',update);window.removeEventListener('resize',update);preference.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);};
  },[paused]);
  return <><span ref={anchor} hidden/><div className="home-progress" aria-hidden="true"><i/></div></>;
}

export function FinalePictures(){return <div className="finale-pictures" aria-hidden="true">{[
  ['coding-v2','01 / A LITTLE CURIOSITY'],['circuit','02 / A WORKING IDEA'],['team','03 / YOUR PEOPLE'],
].map(([image,label],i)=><div className={`finale-picture picture-${i}`} key={image}><img src={`/images/maker-story/${image}-mobile.webp`} alt="" loading="lazy" width={768} height={512}/><span>{label}</span></div>)}<div className="finale-connection"><span/><span/><span/></div></div>;}
