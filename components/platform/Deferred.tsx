'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';

/**
 * Holds back a decorative child until it is worth paying for. Every child passed here is a
 * `next/dynamic` WebGL scene, so mounting late also delays its chunk download and its WebGL
 * context, and neither competes with hydration any more.
 *
 * `when="near"` waits until the surrounding section approaches the viewport; `when="idle"` suits
 * a scene that is on screen from the start and only needs to let the first paint finish. The
 * placeholder is a hidden span, so the parent's layout is the same either way.
 */
export default function Deferred({when='near',margin='500px',children}:{when?:'near'|'idle';margin?:string;children:ReactNode}){
  const anchor=useRef<HTMLSpanElement>(null);
  const [show,setShow]=useState(false);
  useEffect(()=>{
    if(show)return;
    if(when==='idle'){
      // requestIdleCallback is still missing on Safari, where a short timeout keeps the ordering.
      const idle=globalThis.requestIdleCallback?.(()=>setShow(true),{timeout:2000});
      const timer=idle===undefined?setTimeout(()=>setShow(true),300):undefined;
      return()=>{if(idle!==undefined)globalThis.cancelIdleCallback?.(idle);if(timer!==undefined)clearTimeout(timer);};
    }
    const parent=anchor.current?.parentElement;
    if(!parent)return;
    const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting)setShow(true);},{rootMargin:margin});
    observer.observe(parent);
    return()=>observer.disconnect();
  },[when,margin,show]);
  return show?<>{children}</>:<span ref={anchor} hidden/>;
}
