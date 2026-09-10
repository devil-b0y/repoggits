'use client';
import { useEffect, useState } from 'react';
import { Play, Image as ImageIcon, ExternalLink } from 'lucide-react';
import type { Project } from '@/lib/schema';
import { videoSource } from '@/lib/project-display';
import { ProjectCover } from './shared';

export default function ProjectMedia({project}:{project:Project}) {
  const d=project.version.data;
  const photos=[...new Set([d.coverId,...d.galleryIds].filter(Boolean))];
  const source=videoSource(d.videoUrl);
  const [selected,setSelected]=useState<string>('cover'),[failed,setFailed]=useState(false);
  useEffect(()=>{
    if(d.videoUrl&&new URLSearchParams(window.location.search).get('play')==='1'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)setSelected('video');
  },[d.videoUrl]);
  const playing=selected==='video';
  return <section className="project-media" aria-label="Project video and photos">
    <div className="media-stage">
      {playing&&source?.kind==='embed'?<iframe className="video-frame" src={source.url} title={`${d.title} working demo`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:
        playing&&source?.kind==='file'?<video className="video-frame" src={source.url} poster={d.coverId?`/api/files/${d.coverId}`:undefined} autoPlay muted playsInline controls preload="metadata" aria-label={`${d.title} working demo`} onError={()=>setFailed(true)}/>:
        <>{selected!=='cover'&&!playing?<img className="media-photo" src={`/api/files/${selected}`} alt={`${d.title} — photo ${photos.indexOf(selected)+1}`}/>:<ProjectCover project={project}/>} {!playing&&d.videoUrl&&<button className="media-play" onClick={()=>setSelected('video')}><Play size={24} fill="currentColor"/> Watch working demo</button>}</>}
    </div>
    {playing&&<div className="media-caption"><span>{source?'Video starts muted. Use the player controls for sound.':'Open the demo video to watch this project in action.'}</span><a className="inline-link" href={d.videoUrl} target="_blank" rel="noopener noreferrer">{failed?'Player unavailable. Open video':'Open video'} <ExternalLink size={13}/></a></div>}
    <div className="media-thumbnails" aria-label="Choose project media">
      {d.videoUrl&&<button aria-pressed={playing} onClick={()=>setSelected('video')}><Play size={20}/><span>Working demo</span></button>}
      {photos.map((photo,i)=><button key={photo} aria-label={`Show project photo ${i+1}`} aria-pressed={selected===photo||selected==='cover'&&i===0} onClick={()=>setSelected(photo)}><img src={`/api/files/${photo}`} alt="" loading="lazy"/><span>{i===0&&d.coverId?'Cover':`Photo ${i+1}`}</span></button>)}
      {!photos.length&&<button aria-pressed={!playing} onClick={()=>setSelected('cover')}><ImageIcon size={20}/><span>Project cover</span></button>}
    </div>
  </section>;
}
