'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {buildWorkshop} from './workshop-geometry';

export default function WorkshopScene({paused,mode}:{paused:boolean;mode:number}){
 const host=useRef<HTMLDivElement>(null),latest=useRef({paused,mode}),refresh=useRef(()=>{}),[ready,setReady]=useState(false);
 useEffect(()=>{latest.current={paused,mode};refresh.current();},[paused,mode]);
 useEffect(()=>{
  const el=host.current!;const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let renderer:THREE.WebGLRenderer|undefined,frame=0,visible=false,failed=false,last=0,rotation=0,targetRotation=0,progress=0,pointer=0;
  const moving=()=>!latest.current.paused&&!reduced.matches;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,50);camera.position.set(6,5.1,8.2);camera.lookAt(0,.65,0);
  const model=buildWorkshop();scene.add(model.group);
  scene.add(new THREE.HemisphereLight(0xfff6e6,0x567097,2.6));
  const key=new THREE.DirectionalLight(0xfff5e5,4.2);key.position.set(-3,8,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5});key.shadow.normalBias=.025;scene.add(key);
  const rim=new THREE.DirectionalLight(0xa5c1ff,2.6);rim.position.set(5,4,-4);scene.add(rim);
  const groundGeometry=new THREE.PlaneGeometry(30,30),groundMaterial=new THREE.ShadowMaterial({opacity:.17});const ground=new THREE.Mesh(groundGeometry,groundMaterial);ground.rotation.x=-Math.PI/2;ground.position.y=-.29;ground.receiveShadow=true;scene.add(ground);
  function stop(){cancelAnimationFrame(frame);frame=0;}
  function schedule(){if(!frame&&visible&&!document.hidden&&!failed)frame=requestAnimationFrame(draw);}
  function draw(time:number){frame=0;if(!renderer||failed)return;if(moving()&&time-last<32){schedule();return;}last=time;
   const b=el.getBoundingClientRect();progress=THREE.MathUtils.clamp(-b.top/Math.max(b.height,1),0,1);
   targetRotation=latest.current.mode===1?.2:latest.current.mode===2?-.28:0;
   rotation=moving()?THREE.MathUtils.lerp(rotation,targetRotation+pointer+progress*.18,.08):targetRotation;
   model.group.rotation.y=rotation;
   camera.zoom=latest.current.mode===0?1:1.13;camera.updateProjectionMatrix();
   model.update(progress,time,moving());renderer.render(scene,camera);
   el.dataset.motion=reduced.matches?'reduced':latest.current.paused?'paused':'running';el.dataset.rotation=rotation.toFixed(4);el.dataset.mode=String(latest.current.mode);
   if(moving())schedule();
  }
  const resize=()=>{if(!renderer)return;const b=el.getBoundingClientRect();if(b.width&&b.height){renderer.setSize(b.width,b.height);camera.aspect=b.width/b.height;camera.updateProjectionMatrix();schedule();}};
  const lost=(event:Event)=>{event.preventDefault();failed=true;stop();setReady(false);el.dataset.failed='true';};
  function initialize(){if(renderer||failed)return;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor(0,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.domElement.addEventListener('webglcontextlost',lost);el.appendChild(renderer.domElement);resize();setReady(true);}catch{failed=true;el.dataset.failed='true';}}
  const observe=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible){initialize();schedule();}else stop();},{rootMargin:'50px'});observe.observe(el);
  const observer=new ResizeObserver(resize);observer.observe(el);
  const move=(event:PointerEvent)=>{if(!moving()||event.pointerType==='touch')return;const b=el.getBoundingClientRect();pointer=((event.clientX-b.left)/b.width-.5)*.3;schedule();};
  const leave=()=>{pointer=0;schedule();};
  const update=()=>{stop();schedule();};refresh.current=update;
  const visibility=()=>{if(document.hidden)stop();else schedule();};
  el.addEventListener('pointermove',move);el.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',update);window.addEventListener('scroll',schedule,{passive:true});
  return()=>{stop();observe.disconnect();observer.disconnect();el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',update);window.removeEventListener('scroll',schedule);model.dispose();groundGeometry.dispose();groundMaterial.dispose();key.shadow.dispose();if(renderer){renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}refresh.current=()=>{};};
 },[]);
 return <div ref={host} className="workshop-scene" data-ready={ready} aria-hidden="true"><div className="workshop-fallback"><span>&lt;/&gt;</span><i/><strong>Code meets curiosity.</strong></div></div>;
}
