'use client';
import {useState} from 'react';
import {MotionStage} from './MotionKit';
import ProductHome from './product/ProductHome';

function HomeContent(){
  const [paused,setPaused]=useState(false);
  return <MotionStage paused={paused}><ProductHome paused={paused} setPaused={setPaused}/></MotionStage>;
}
export default function Home(){return <HomeContent/>;}
