'use client';
import {useEffect,useRef} from 'react';
import Link from 'next/link';
import {ArrowUpRight,Code2,Play,Users} from 'lucide-react';
import {StoryImage} from './MakerStory';

export default function BuildShowcase({paused}:{paused:boolean}){
  const ref=useRef<HTMLElement>(null);
  useEffect(()=>{const el=ref.current;if(!el)return;const media=matchMedia('(prefers-reduced-motion: reduce)');let frame=0;
    function update(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;if(!el)return;const bounds=el.getBoundingClientRect(),p=(paused||media.matches) ? .5 :Math.max(0,Math.min(1,(innerHeight*.25-bounds.top)/Math.max(1,bounds.height-innerHeight*.6)));el.style.setProperty('--showcase-progress',String(p));el.dataset.progress=p.toFixed(3);});}
    update();window.addEventListener('scroll',update,{passive:true});media.addEventListener('change',update);const observer=new ResizeObserver(update);observer.observe(el);return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',update);media.removeEventListener('change',update);};
  },[paused]);
  return <section ref={ref} className={`build-showcase ${paused?'is-paused':''}`} aria-labelledby="showcase-title"><div className="build-showcase-stage"><div className="showcase-heading"><span>FROM YOUR DESK. TO SOMEONE ELSE’S NEXT IDEA.</span><h2 id="showcase-title">Don’t just submit it.<br/><em>Bring it to life.</em></h2><p>The demo. The people. The source. A project is more than its final screenshot.</p></div><div className="showcase-space">
    <div className="showcase-orbit orbit-a"/><div className="showcase-orbit orbit-b"/>
    <article className="showcase-card showcase-code"><div className="showcase-bar"><Code2 size={15}/><span>01 / THE SOURCE</span><i/></div><div className="showcase-photo"><StoryImage name="coding-v2" alt="Illustrated student coding at a correctly oriented laptop"/></div><div className="showcase-card-copy"><span>Built to be built on.</span><small>Languages · Source ZIP · Version history</small></div></article>
    <article className="showcase-card showcase-demo"><div className="showcase-bar"><Play size={15}/><span>02 / THE WORKING BUILD</span><i/></div><div className="showcase-photo"><StoryImage name="circuit" alt="Illustrative ESP32 prototype with wiring and sensors"/><span className="showcase-caption">FROM FIRST CONNECTION<br/>TO FIRST WORKING DEMO.</span></div><div className="showcase-card-copy"><span>Show the moment it works.</span><small>Demo video · Build gallery · Features</small></div></article>
    <article className="showcase-card showcase-team"><div className="showcase-bar"><Users size={15}/><span>03 / THE MAKERS</span><i/></div><div className="showcase-photo"><StoryImage name="team" alt="Illustrated student team testing their project"/></div><div className="showcase-card-copy"><span>Put people in the picture.</span><small>Team · Contributions · College</small></div></article>
    </div><div className="showcase-bottom"><span>SCROLL TO OPEN THE STORY</span><Link href="/projects">Explore what students are building <ArrowUpRight size={18}/></Link><span>01 — 03</span></div></div></section>;
}
