'use client';
import EngineerStory from './EngineerStory';
import EngineeringCollection from './EngineeringCollection';
import './workshop-home.css';

export default function WorkshopHome({paused,setPaused}:{paused:boolean;setPaused:(value:boolean)=>void}){
 return <div className="workshop-home"><EngineerStory paused={paused} setPaused={setPaused}/><EngineeringCollection/></div>;
}
