'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import * as THREE from 'three';
import {buildWorkshop} from './workshop-geometry';
import {loadWorkbenchAssets} from './workbench-assets';

export default function WorkshopScene({paused,mode,storyProgress}:{paused:boolean;mode:number;storyProgress?:RefObject<number>}){
 const host=useRef<HTMLDivElement>(null),latest=useRef({paused,mode}),refresh=useRef(()=>{}),[ready,setReady]=useState(false);
 useEffect(()=>{latest.current={paused,mode};refresh.current();},[paused,mode]);
 useEffect(()=>{
  const el=host.current!;const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let renderer:THREE.WebGLRenderer|undefined,frame=0,visible=false,failed=false,last=0,rotation=0,targetRotation=0,progress=0,pointer=0,disposeAssets:(()=>void)|undefined;
  const moving=()=>!latest.current.paused&&!reduced.matches;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,50);camera.position.set(6,5.1,8.2);camera.lookAt(0,.65,0);
  const model=buildWorkshop(!!storyProgress);scene.add(model.group);
  if(storyProgress){model.stage.visible=false;model.rim.visible=false;model.board.scale.setScalar(.32);model.board.position.set(1.2,.14,1.45);}
  scene.add(new THREE.HemisphereLight(0xfff6e6,0x567097,storyProgress?.7:2.6));
  const key=new THREE.DirectionalLight(0xfff5e5,storyProgress?2.1:4.2);key.position.set(-3,8,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5});key.shadow.normalBias=.025;scene.add(key);
  const rim=new THREE.DirectionalLight(0xd8e5ff,storyProgress?1.2:2.6);rim.position.set(5,4,-4);scene.add(rim);
  const groundGeometry=new THREE.PlaneGeometry(30,30),groundMaterial=new THREE.ShadowMaterial({opacity:.17});const ground=new THREE.Mesh(groundGeometry,groundMaterial);ground.rotation.x=-Math.PI/2;ground.position.y=-.29;ground.receiveShadow=true;scene.add(ground);
  function stop(){cancelAnimationFrame(frame);frame=0;}
  function schedule(){if(!frame&&visible&&!document.hidden&&!failed)frame=requestAnimationFrame(draw);}
  function draw(time:number){frame=0;if(!renderer||failed)return;if(moving()&&time-last<32){schedule();return;}last=time;
   const b=el.getBoundingClientRect();progress=THREE.MathUtils.clamp(-b.top/Math.max(b.height,1),0,1);
   const story=storyProgress?.current;
   if(story!==undefined)progress=story;
   targetRotation=story!==undefined?-.25+Math.sin(story*Math.PI*2)*.65:latest.current.mode===1?.2:latest.current.mode===2?-.28:0;
   rotation=moving()?THREE.MathUtils.lerp(rotation,targetRotation+pointer+progress*.18,.08):targetRotation;
   model.group.rotation.y=rotation;
   camera.zoom=story!==undefined?1.02+Math.sin(story*Math.PI)*.14:latest.current.mode===0?1:1.13;camera.updateProjectionMatrix();
   model.update(progress,time,moving());
   if(story!==undefined){
    const spread=Math.sin(story*Math.PI);
    model.board.position.y=.14+spread*.55;
    model.board.rotation.y=-.2+spread*.45;
    model.shield.position.y=spread*.55;
    model.laptop.position.y=spread*.13;
    el.dataset.story=story.toFixed(3);
   }
   renderer.render(scene,camera);
   el.dataset.motion=reduced.matches?'reduced':latest.current.paused?'paused':'running';el.dataset.rotation=rotation.toFixed(4);el.dataset.mode=String(latest.current.mode);
   if(moving())schedule();
  }
  const resize=()=>{if(!renderer)return;const b=el.getBoundingClientRect();if(b.width&&b.height){renderer.setSize(b.width,b.height);camera.aspect=b.width/b.height;camera.updateProjectionMatrix();schedule();}};
  const lost=(event:Event)=>{event.preventDefault();failed=true;stop();setReady(false);el.dataset.failed='true';};
  function initialize(){if(renderer||failed)return;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor(0,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.domElement.addEventListener('webglcontextlost',lost);el.appendChild(renderer.domElement);resize();setReady(true);if(storyProgress)disposeAssets=loadWorkbenchAssets(scene,model.group,renderer,schedule,el);}catch{failed=true;el.dataset.failed='true';}}
  const observe=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible){initialize();schedule();}else stop();},{rootMargin:'50px'});observe.observe(el);
  const observer=new ResizeObserver(resize);observer.observe(el);
  const move=(event:PointerEvent)=>{if(!moving()||event.pointerType==='touch')return;const b=el.getBoundingClientRect();pointer=((event.clientX-b.left)/b.width-.5)*.3;schedule();};
  const leave=()=>{pointer=0;schedule();};
  const update=()=>{stop();schedule();};refresh.current=update;
  const visibility=()=>{if(document.hidden)stop();else schedule();};
  el.addEventListener('pointermove',move);el.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',update);window.addEventListener('scroll',schedule,{passive:true});
  return()=>{stop();observe.disconnect();observer.disconnect();el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',update);window.removeEventListener('scroll',schedule);disposeAssets?.();model.dispose();groundGeometry.dispose();groundMaterial.dispose();key.shadow.dispose();if(renderer){renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}refresh.current=()=>{};};
 },[storyProgress]);
 return <div ref={host} className="workshop-scene" data-ready={ready} aria-hidden="true"><div className="workshop-fallback"><span>&lt;/&gt;</span><i/><strong>Code meets curiosity.</strong></div></div>;
}
