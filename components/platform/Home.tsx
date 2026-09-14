'use client';
import {useState} from 'react';
import {Shell} from './shared';
import {MotionStage} from './MotionKit';
import WorkshopHome from './WorkshopHome';

function HomeContent(){
  const [paused,setPaused]=useState(false);
  return <MotionStage paused={paused}><WorkshopHome paused={paused} setPaused={setPaused}/></MotionStage>;
}
export default function Home(){return <Shell><HomeContent/></Shell>;}
