'use client';
import {useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight,Code2,Cpu,Layers} from 'lucide-react';
import {Shell} from './shared';
import HomeOverview from './HomeOverview';
import MakerStory from './MakerStory';
import EditionNavigation from './EditionNavigation';
import BuildShowcase from './BuildShowcase';
import NextChapter from './NextChapter';
import './homepage-refinement.css';
import './edition.css';
import './maker-story.css';

function HomeContent(){
  const [paused,setPaused]=useState(false);
  return <div className="home-page edition-page">
    <MakerStory paused={paused} setPaused={setPaused}/>
    <EditionNavigation/>
    <div className="discipline-strip"><span>ONE COLLECTIVE. EVERY KIND OF MAKER.</span><div><Code2 size={20}/>Software</div><span>+</span><div><Cpu size={20}/>Hardware</div><span>+</span><div><Layers size={20}/>Everything in between</div></div>
    <BuildShowcase paused={paused}/>
    <HomeOverview paused={paused} setPaused={setPaused}/>
    <NextChapter paused={paused}/>
    <section className="home-finale"><div className="eyebrow">A LITTLE CURIOSITY GOES A LONG WAY</div><h2>The next great idea<br/>could be <em>yours.</em></h2><p>Find an idea that sparks yours, or give your own project a place to grow.</p><Link className="button blue" href="/projects">Open the project notebook <ArrowUpRight size={17}/></Link></section>
  </div>;
}
export default function Home(){return <Shell><HomeContent/></Shell>;}
