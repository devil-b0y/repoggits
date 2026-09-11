'use client';
import {useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight,Code2,Cpu,Layers} from 'lucide-react';
import {Shell} from './shared';
import HomeOverview from './HomeOverview';
import EditionOpening from './EditionOpening';
import EditionNavigation from './EditionNavigation';
import './homepage-refinement.css';
import './edition.css';

function HomeContent(){
  const [paused,setPaused]=useState(false);
  return <div className="home-page edition-page">
    <EditionOpening paused={paused} setPaused={setPaused}/>
    <EditionNavigation/>
    <div className="discipline-strip"><span>ONE COLLECTIVE. EVERY KIND OF MAKER.</span><div><Code2 size={20}/>Software</div><span>+</span><div><Cpu size={20}/>Hardware</div><span>+</span><div><Layers size={20}/>Everything in between</div></div>
    <HomeOverview paused={paused} setPaused={setPaused}/>
    <section className="how-section" id="how-it-works"><div><div className="eyebrow">V / YOUR NEXT CHAPTER</div><h2>Great work starts with you.<br/>It goes further, together.</h2><Link className="button orange" href="/submit">Add your chapter <ArrowUpRight size={18}/></Link></div><div className="steps">{[['01','Build something.','Software, hardware, or a little of both. Every thoughtful idea has a place.'],['02','Share the process.','Add your team, costs, technologies, and source. Your educators review each submission.'],['03','Keep it growing.','Publish new versions with a changelog. Earlier approved versions stay available.']].map(([n,t,d])=><div key={n}><span>{n}</span><section><h3>{t}</h3><p>{d}</p></section></div>)}</div></section>
    <section className="home-finale"><div className="eyebrow">A LITTLE CURIOSITY GOES A LONG WAY</div><h2>The next great idea<br/>could be <em>yours.</em></h2><p>Find an idea that sparks yours, or give your own project a place to grow.</p><Link className="button blue" href="/projects">Open the project notebook <ArrowUpRight size={17}/></Link></section>
  </div>;
}
export default function Home(){return <Shell><HomeContent/></Shell>;}
