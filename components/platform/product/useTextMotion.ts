'use client';
import {useEffect,type RefObject} from 'react';
/** Animate semantic text blocks without splitting accessible names or changing React's DOM. */
export function useTextMotion(root:RefObject<HTMLDivElement|null>,still:boolean){
 useEffect(()=>{
  const host=root.current;if(!host||still)return;
  const animated=new WeakSet<Element>(),running=new Set<Animation>();
  const blocks='h1,h2,h3,h4,p,a,button,li,code,pre,small,strong';
  const observer=new IntersectionObserver(entries=>{entries.forEach(({target,isIntersecting})=>{if(!isIntersecting)return;observer.unobserve(target);if(target.closest('[aria-hidden="true"]')||target.contains(document.activeElement))return;const heading=/^H[1-4]$/.test(target.tagName);const animation=target.animate([{opacity:.15,translate:`0 ${heading?24:10}px`,filter:heading?'blur(3px)':'blur(0)'},{opacity:1,translate:'0 0',filter:'blur(0)'}],{duration:heading?760:480,easing:'cubic-bezier(.22,1,.36,1)',fill:'none'});running.add(animation);animation.onfinish=()=>running.delete(animation);});},{threshold:.1});
  const scan=()=>{host.querySelectorAll(`${blocks},span`).forEach(el=>{if(animated.has(el)||!el.textContent?.trim()||el.closest('[aria-hidden="true"]'))return;if(el.parentElement?.closest(blocks))return;if(el.tagName==='SPAN'&&el.querySelector(blocks+',span'))return;animated.add(el);observer.observe(el);});};
  scan();const mutations=new MutationObserver(scan);mutations.observe(host,{childList:true,subtree:true});
  const focus=()=>{running.forEach(a=>a.finish());running.clear();};host.addEventListener('focusin',focus);
  return()=>{observer.disconnect();mutations.disconnect();running.forEach(a=>a.cancel());host.removeEventListener('focusin',focus);};
 },[root,still]);
}
