'use client';
import {useEffect,type RefObject} from 'react';
import {animate} from 'framer-motion';
const ease=[.22,1,.36,1] as const;
/** Only text runs are targets. Control hitboxes, icons, and surfaces stay untouched. */
export function useTextMotion(root:RefObject<HTMLDivElement|null>,still:boolean){
 useEffect(()=>{
  const host=root.current;if(!host||still)return;
  const seen=new WeakSet<Element>(),running=new Set<ReturnType<typeof animate>>();
  const finish=()=>{running.forEach(a=>a.complete());running.clear();};
  const observer=new IntersectionObserver(entries=>{
   for(const {target,isIntersecting} of entries){
    if(!isIntersecting)continue;
    observer.unobserve(target);
    const text=target as HTMLElement;
    if(text.closest('[aria-hidden="true"]')||text.closest('a,button')?.contains(document.activeElement))continue;
    const heading=text.closest('h1,h2,h3,h4'),hero=text.closest('#ph-title'),nav=text.closest('.ph-nav');
    const group=text.closest('h1,h2,h3,h4,p,a,button,pre')||text.parentElement!;
    group.setAttribute('data-text-motion','framer');
    let delay=heading?.04:group.matches('p')?.12:.18;
    if(nav)delay=.03+Array.from(nav.querySelectorAll('pv-text')).indexOf(text)*.035;
    else if(hero){
     const masks=Array.from(hero.querySelectorAll<HTMLElement>('pv-mask'));
     const tops=[...new Set(masks.map(mask=>Math.round(mask.getBoundingClientRect().top)))];
     const line=tops.indexOf(Math.round(text.parentElement!.getBoundingClientRect().top));
     text.dataset.textLine=String(line);
     delay=.22+line*.13;
    }
    else if(text.closest('.ph-status'))delay=.15;
    else if(text.closest('.ph-hero-sub'))delay=1.05;
    else if(text.closest('.ph-hero-copy .ph-actions'))delay=1.18;
    const animation=animate(text,{
     opacity:[0,1],top:[hero?'0px':heading?'10px':'5px','0px'],
     filter:[hero?'blur(3px)':'blur(1.5px)','blur(0px)'],
     ...(hero?{transform:['translateY(95%)','translateY(0%)']}:{})
    },{duration:hero?.95:heading?.72:.5,delay,ease});
    running.add(animation);void animation.then(()=>running.delete(animation));
   }
  },{threshold:.1});
  const scan=()=>host.querySelectorAll<HTMLElement>('pv-text').forEach(text=>{if(seen.has(text)||text.closest('[aria-hidden="true"]'))return;seen.add(text);observer.observe(text);});
  scan();const mutations=new MutationObserver(scan);mutations.observe(host,{childList:true,subtree:true});
  const hover=(event:PointerEvent)=>{
   if(event.pointerType!=='mouse')return;
   const target=event.target instanceof Element?event.target.closest('a,button'):null;
   if(!target||!host.contains(target)||target.contains(event.relatedTarget as Node|null))return;
   target.querySelectorAll<HTMLElement>('pv-text').forEach(text=>{const animation=animate(text,{left:event.type==='pointerover'?'2px':'0px'},{duration:.24,ease});running.add(animation);void animation.then(()=>running.delete(animation));});
  };
  host.addEventListener('focusin',finish);host.addEventListener('pointerover',hover);host.addEventListener('pointerout',hover);
  return()=>{observer.disconnect();mutations.disconnect();finish();host.querySelectorAll<HTMLElement>('pv-text').forEach(text=>text.removeAttribute('style'));host.removeEventListener('focusin',finish);host.removeEventListener('pointerover',hover);host.removeEventListener('pointerout',hover);};
 },[root,still]);
}
