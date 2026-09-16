'use client';
import {useEffect} from 'react';
import {animate,useReducedMotion,type AnimationOptions} from 'framer-motion';
import './button-motion.css';

/** Every control the app styles as a button. `a[class*=button]` sweeps up the link variants
 *  (.button/.text-button/.icon-button/.pv-button/.ec-button/.wh-button/.nav-submit); the rest are
 *  the call-to-action links whose class does not say "button". */
const CONTROLS='button,[role=button],a[class*=button],a.admin-stat,a.pv-nav-enter,a.pv-explore,a.studio-start,a.engineer-submit,a.project-preview';
/** Press has to land before the eye moves on; the release is a spring so it settles instead of snapping. */
export const pressIn:AnimationOptions={duration:.12,ease:[.4,0,.2,1]};
export const pressOut:AnimationOptions={type:'spring',stiffness:520,damping:32,mass:.5};
export const hoverGlide:AnimationOptions={type:'spring',stiffness:340,damping:30,mass:.4};

function control(target:EventTarget|null){
  const el=target instanceof Element?target.closest<HTMLElement>(CONTROLS):null;
  if(!el||el.hasAttribute('disabled')||el.getAttribute('aria-disabled')==='true'||el.hasAttribute('data-motion-skip'))return null;
  return el;
}
// Motion reads a custom property back out of computed style as a string, so both keyframes are
// stated as numbers here and the origin comes from the inline value Motion itself last wrote.
// Reading inline style costs nothing — unlike getComputedStyle it never forces a reflow.
const at=(el:HTMLElement,name:string)=>Number.parseFloat(el.style.getPropertyValue(name))||0;
function stamp(el:HTMLElement){if(el.dataset.btnMotion===undefined)el.dataset.btnMotion='';}
function press(el:HTMLElement,on:boolean){stamp(el);animate(el,{'--btn-press':[at(el,'--btn-press'),on?1:0]},on?pressIn:pressOut);}
function hover(el:HTMLElement,on:boolean){stamp(el);animate(el,{'--btn-hover':[at(el,'--btn-hover'),on?1:0]},hoverGlide);}

/**
 * One delegated motion director for every button in the app. Mounted once from the root layout,
 * it costs a single `closest()` per pointer boundary instead of mounting a motion component onto
 * each of the hundreds of controls a page renders, and it only ever animates transform channels.
 */
export default function ButtonMotion(){
  const reduced=useReducedMotion();
  useEffect(()=>{
    const root=document.documentElement;
    root.dataset.buttonMotion=reduced?'off':'on';
    if(reduced)return()=>{delete root.dataset.buttonMotion;};
    let hovered:HTMLElement|null=null,pressed:HTMLElement|null=null;
    const dropHover=()=>{if(hovered){hover(hovered,false);hovered=null;}};
    const dropPress=()=>{if(pressed){press(pressed,false);pressed=null;}};
    const take=(el:HTMLElement)=>{if(el===pressed)return;dropPress();pressed=el;press(el,true);};
    // pointerover fires for whatever the pointer entered, so moving onto plain page chrome
    // resolves to null and releases the previous control without a second listener.
    const onOver=(event:PointerEvent)=>{
      if(event.pointerType!=='mouse')return;
      const el=control(event.target);
      if(el===hovered)return;
      dropHover();
      if(el){hovered=el;hover(el,true);}
    };
    const onOut=(event:PointerEvent)=>{if(!event.relatedTarget)dropHover();};
    const onDown=(event:PointerEvent)=>{const el=control(event.target);if(el)take(el);};
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.repeat||(event.key!==' '&&event.key!=='Enter'))return;
      const el=control(document.activeElement);
      if(el)take(el);
    };
    // Only the held control losing focus ends the press (Tab away mid-Enter). Focusing anything
    // else must not, because pressing a control blurs whatever held focus before it — and that
    // blur is dispatched after this pointerdown handler has already started the press.
    const onBlur=(event:FocusEvent)=>{if(event.target===pressed)dropPress();};
    const onWindowBlur=(event:Event)=>{if(event.target===window){dropPress();dropHover();}};
    // Passive: nothing here ever calls preventDefault, and pointerdown is otherwise treated as
    // scroll-blocking on touch.
    const passive={passive:true} as const;
    document.addEventListener('pointerover',onOver,passive);
    document.addEventListener('pointerout',onOut,passive);
    document.addEventListener('pointerdown',onDown,passive);
    document.addEventListener('keydown',onKeyDown);
    document.addEventListener('keyup',dropPress);
    // Capture, because focus leaving a held control does not bubble.
    document.addEventListener('blur',onBlur,true);
    window.addEventListener('pointerup',dropPress,passive);
    window.addEventListener('pointercancel',dropPress,passive);
    window.addEventListener('blur',onWindowBlur);
    return()=>{
      document.removeEventListener('pointerover',onOver);
      document.removeEventListener('pointerout',onOut);
      document.removeEventListener('pointerdown',onDown);
      document.removeEventListener('keydown',onKeyDown);
      document.removeEventListener('keyup',dropPress);
      document.removeEventListener('blur',onBlur,true);
      window.removeEventListener('pointerup',dropPress);
      window.removeEventListener('pointercancel',dropPress);
      window.removeEventListener('blur',onWindowBlur);
      dropPress();dropHover();
      delete root.dataset.buttonMotion;
    };
  },[reduced]);
  return null;
}
