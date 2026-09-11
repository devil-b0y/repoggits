'use client';
import {useEffect,useRef,useState} from 'react';
import {editionChapters} from './EditionOpening';

export default function EditionNavigation(){
  const [active,setActive]=useState('edition-top'),[visible,setVisible]=useState(false);
  const progress=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let frame=0;
    function update(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;let current='edition-top';for(const chapter of editionChapters){const section=document.getElementById(chapter.id);if(section&&section.getBoundingClientRect().top<innerHeight*.45)current=chapter.id;}setActive(current);setVisible(scrollY>innerHeight*.5);const value=Math.max(0,Math.min(1,scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight)));progress.current?.style.setProperty('--reading-progress',String(value));});}
    window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);update();return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  },[]);
  return <><div ref={progress} className="edition-reading-progress" aria-hidden="true"/><nav aria-label="Page chapters" className={`edition-dock ${visible?'is-visible':''}`} inert={!visible}>{editionChapters.map(chapter=><a href={`#${chapter.id}`} key={chapter.id} aria-current={active===chapter.id?'location':undefined}><span className="chapter-numeral">{chapter.number}</span><span>{chapter.label}</span></a>)}</nav></>;
}
