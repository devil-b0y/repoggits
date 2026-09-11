'use client';
import {useEffect,useRef} from 'react';

export default function CodingScene({paused}:{paused:boolean}){
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const el=root.current;if(!el)return;const media=matchMedia('(prefers-reduced-motion: reduce)');let visible=true,frame=0;
    function refresh(){if(!el)return;el.dataset.motion=paused||media.matches?'paused':visible&&!document.hidden?'running':'paused';if(paused||media.matches){el.style.setProperty('--code-x','0px');el.style.setProperty('--code-y','0px');}}
    function pointer(event:PointerEvent){if(!el||paused||media.matches||frame)return;frame=requestAnimationFrame(()=>{frame=0;const bounds=el!.getBoundingClientRect();el!.style.setProperty('--code-x',`${((event.clientX-bounds.left)/bounds.width-.5)*12}px`);el!.style.setProperty('--code-y',`${((event.clientY-bounds.top)/bounds.height-.5)*8}px`);});}
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;refresh();});observer.observe(el);refresh();
    window.addEventListener('pointermove',pointer,{passive:true});document.addEventListener('visibilitychange',refresh);media.addEventListener('change',refresh);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('pointermove',pointer);document.removeEventListener('visibilitychange',refresh);media.removeEventListener('change',refresh);};
  },[paused]);
  return <div ref={root} className="coding-scene" data-motion="paused" role="img" aria-label="Animated illustration of a college student typing code on a laptop in a college study room">
    <div className="coding-depth"><picture><source media="(max-width:680px)" srcSet="/images/maker-story/coding-v2-mobile.webp"/><img src="/images/maker-story/coding-v2.webp" alt="" width={1536} height={1024} fetchPriority="high"/></picture><picture className="coding-pose"><source media="(max-width:680px)" srcSet="/images/maker-story/coding-next-v2-mobile.webp"/><img src="/images/maker-story/coding-next-v2.webp" alt="" width={1536} height={1024}/></picture></div>
    <div className="coding-glow" aria-hidden="true"/>
    <div className="coding-terminal" aria-hidden="true"><div><i/><span>project.ts</span><span>01</span></div><code><span className="code-line">const idea = createProject();</span><span className="code-line">idea.build(&apos;something useful&apos;);</span><span className="code-line">await idea.share();<b>▍</b></span></code><small><i/> READY FOR YOUR NEXT IDEA</small></div>
  </div>;
}
