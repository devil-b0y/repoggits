'use client';
import {TextRun} from './TextMotion';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {buildWorkshop} from '../workshop-geometry';
import {useStill} from '../MotionKit';

export default function EngineeringObject({kind}:{kind:number}){
 const host=useRef<HTMLDivElement>(null),still=useStill(),[failed,setFailed]=useState(false);
 useEffect(()=>{
  const el=host.current;if(!el)return;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{setFailed(true);return;}
  setFailed(false);let disposed=false,frame=0,visible=false,last=0;let environment:THREE.DataTexture|undefined;
  renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.2:1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
  el.appendChild(renderer.domElement);const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,100),model=buildWorkshop(true);
  model.group.children.forEach(child=>{child.visible=child===model.laptop||child===model.board;});
  model.laptop.visible=kind!==1;model.board.visible=kind!==0;
  model.laptop.position.set(kind===2?-.5:0,-.6,0);model.laptop.rotation.y=-.22;
  model.board.position.set(kind===2?1.6:0,kind===2?-.4:0,kind===2?.7:0);model.board.scale.setScalar(kind===2?.5:1.3);model.board.rotation.y=kind===2?-.25:-.35;
  const cableGeometry=kind===2?new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(1.23,-.49,.12),new THREE.Vector3(1.5,-.55,.35),new THREE.Vector3(2,-.55,1.6),new THREE.Vector3(1.45,-.34,1.34)]),40,.023,8,false):null;
  const cableMaterial=new THREE.MeshStandardMaterial({color:'#252b34',roughness:.6});if(cableGeometry)model.group.add(new THREE.Mesh(cableGeometry,cableMaterial));
  scene.add(model.group);scene.add(new THREE.HemisphereLight('#dce8ff','#293446',2));const key=new THREE.DirectionalLight('#fff3dd',4);key.position.set(3,6,4);scene.add(key);const rim=new THREE.DirectionalLight('#99baff',3);rim.position.set(-4,2,-2);scene.add(rim);
  camera.position.set(kind===1?1.3:3,kind===1?4.8:3.4,kind===1?4:6.5);camera.lookAt(0,kind===1?0:.4,0);
  const render=()=>{if(!disposed)renderer.render(scene,camera);};
  const resize=()=>{const b=el.getBoundingClientRect();renderer.setSize(b.width,b.height);camera.aspect=b.width/Math.max(1,b.height);camera.updateProjectionMatrix();render();};
  const observer=new ResizeObserver(resize);observer.observe(el);const visibility=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)render();});visibility.observe(el);
  new HDRLoader().load('/models/workbench/studio.hdr',texture=>{if(disposed){texture.dispose();return;}environment=texture;texture.mapping=THREE.EquirectangularReflectionMapping;scene.environment=texture;scene.environmentIntensity=.6;el.dataset.lighting='studio';render();},undefined,()=>{});
  const pointer={x:0,y:0};const move=(event:PointerEvent)=>{if(still||event.pointerType!=='mouse')return;const r=el.getBoundingClientRect();pointer.x=((event.clientX-r.left)/r.width-.5)*.35;pointer.y=((event.clientY-r.top)/r.height-.5)*.12;};const leave=()=>{pointer.x=0;pointer.y=0;};
  const tick=(time:number)=>{if(visible&&!document.hidden&&time-last>33){model.group.rotation.y=THREE.MathUtils.lerp(model.group.rotation.y,pointer.x,.1);model.group.rotation.x=THREE.MathUtils.lerp(model.group.rotation.x,pointer.y,.1);render();last=time;}frame=requestAnimationFrame(tick);};if(!still)frame=requestAnimationFrame(tick);
  const lost=(e:Event)=>{e.preventDefault();setFailed(true);};renderer.domElement.addEventListener('webglcontextlost',lost);el.addEventListener('pointermove',move);el.addEventListener('pointerleave',leave);resize();el.dataset.objectReady='true';
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();visibility.disconnect();el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);renderer.domElement.removeEventListener('webglcontextlost',lost);model.dispose();cableGeometry?.dispose();cableMaterial.dispose();environment?.dispose();renderer.dispose();renderer.domElement.remove();delete el.dataset.objectReady;};
 },[kind,still]);
 return <div className="pf-real-object" ref={host} role="img" aria-label={['Interactive aluminum laptop with a code editor','Interactive ESP32 development board with metal shield, USB port, and pin headers','Interactive laptop and connected ESP32 development board'][kind]} data-kind={kind}>{failed&&<img className="pf-object-fallback" src={`/images/maker-story/${kind===0?'coding-next-v2.webp':'circuit.webp'}`} alt="Engineering workspace"/>}<span className="pf-object-caption"><TextRun>{['01 / SOFTWARE WORKSTATION','02 / ESP32 DEVELOPMENT BOARD','03 / CODE MEETS CIRCUIT'][kind]}</TextRun></span></div>;
}
