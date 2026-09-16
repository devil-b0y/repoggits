'use client';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {Component,Suspense,useEffect,useMemo,useRef,type MutableRefObject,type ReactNode} from 'react';
import * as THREE from 'three';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js';
import {clamp} from './story';

type State={progress:MutableRefObject<number>;hovered:MutableRefObject<boolean>;still:boolean;compact:boolean;dark:boolean};
function LightingSystem({dark}:{dark:boolean}){
  const {scene,invalidate}=useThree();
  useEffect(()=>{let disposed=false;let texture:THREE.DataTexture|undefined;new RGBELoader().load('/models/workbench/studio.hdr',t=>{if(disposed){t.dispose();return;}texture=t;t.mapping=THREE.EquirectangularReflectionMapping;scene.environment=t;invalidate();},undefined,()=>{});return()=>{disposed=true;scene.environment=null;texture?.dispose();};},[scene,invalidate]);
  return <><ambientLight intensity={dark?.55:1.1}/><directionalLight position={[5,8,6]} intensity={3} color="#fff4dc"/><pointLight position={[-4,0,3]} intensity={35} color="#3059b5"/><pointLight position={[3,-2,2]} intensity={18} color="#f27e51"/></>;
}
/** Bevelled manufactured frames, with open centres rather than stacked boxes. */
function precisionFrame(){
 const shape=new THREE.Shape();const path=(p:THREE.Path,size:number,r:number)=>{p.moveTo(-size+r,-size);p.lineTo(size-r,-size);p.quadraticCurveTo(size,-size,size,-size+r);p.lineTo(size,size-r);p.quadraticCurveTo(size,size,size-r,size);p.lineTo(-size+r,size);p.quadraticCurveTo(-size,size,-size,size-r);p.lineTo(-size,-size+r);p.quadraticCurveTo(-size,-size,-size+r,-size);};
 path(shape,1,.24);const hole=new THREE.Path();path(hole,.78,.17);shape.holes.push(hole);const geometry=new THREE.ExtrudeGeometry(shape,{depth:.10,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.035,bevelThickness:.035,curveSegments:12});geometry.center();return geometry;
}
function DataCore(){return <group rotation={[0,0,Math.PI/4]}><mesh><octahedronGeometry args={[.58,0]}/><meshPhysicalMaterial color="#3059b5" metalness={.65} roughness={.12} clearcoat={1} emissive="#3059b5" emissiveIntensity={.35}/></mesh><mesh><octahedronGeometry args={[.74,0]}/><meshPhysicalMaterial color="#c3d8ff" metalness={.1} roughness={.08} transparent opacity={.16} depthWrite={false}/></mesh>{[-1,1].map(s=><mesh key={s} position={[0,s*.35,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.4,.012,8,64]}/><meshStandardMaterial color="#f27e51" emissive="#f27e51" emissiveIntensity={.5}/></mesh>)}</group>;}
function VaultInterior(){return <group><DataCore/>{[-1,1].map(s=><group key={s} position={[0,0,s*.5]}>{Array.from({length:13},(_,i)=><mesh key={i} position={[(i-6)*.075,-.7,0]}><boxGeometry args={[.018,.14,.18]}/><meshStandardMaterial color="#8295b4" metalness={.8} roughness={.35}/></mesh>)}</group>)}</group>;}
function VaultDoor({side,state}:{side:number;state:State}){
 const ref=useRef<THREE.Group>(null);useFrame(()=>{if(!ref.current)return;const p=state.progress.current;const open=(p>4.5&&p<7?Math.sin(clamp((p-4.5)/2.5)*Math.PI):p>12.6?clamp(p-12.6):0)+(state.hovered.current&&!state.still?.2:0);ref.current.position.z=side*(.38+open*.65);ref.current.rotation.y=side*open*.15;});
 return <group ref={ref}><mesh><boxGeometry args={[1.5,1.5,.035]}/><meshPhysicalMaterial color="#96b6e6" metalness={.2} roughness={.13} transparent opacity={state.dark?.16:.12} depthWrite={false}/></mesh>{[-1,1].map(s=><mesh key={s} position={[s*.71,0,0]}><boxGeometry args={[.014,1.2,.05]}/><meshStandardMaterial color="#f27e51" emissive="#f27e51" emissiveIntensity={.5}/></mesh>)}</group>;
}
function VaultCore({state}:{state:State}){
 const root=useRef<THREE.Group>(null),rings=useRef<THREE.Group>(null);const geometry=useMemo(precisionFrame,[]);useEffect(()=>()=>geometry.dispose(),[geometry]);
 useFrame(({clock})=>{if(!root.current||!rings.current)return;const p=state.progress.current;root.current.visible=p>=3.4;const assembly=clamp((p-3.4)/1.2);root.current.scale.setScalar((.02+assembly*.98)*(p>9&&p<11.5?.65:1));root.current.rotation.set(.25,-.45+Math.sin(p*.6)*.15,-.10+(state.still?0:Math.sin(clock.elapsedTime*.3)*.025));rings.current.children.forEach((r,i)=>{r.position.z=(i-2)*(.22+(1-assembly)*.65);r.rotation.z=(1-assembly)*(i-2)*.12;});});
 return <group ref={root}><group ref={rings}>{Array.from({length:5},(_,i)=><group key={i}><mesh geometry={geometry}><meshStandardMaterial color={i===2?'#3059b5':state.dark?'#788aa5':'#bdc7d5'} metalness={.86} roughness={.22}/></mesh>{[-1,1].map(x=><group key={x}>{[-1,1].map(y=><mesh key={y} position={[x*.87,y*.87,.09]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.032,.032,.015,12]}/><meshStandardMaterial color="#53637c" metalness={.85} roughness={.32}/></mesh>)}</group>)}</group>)}</group><VaultInterior/><VaultDoor side={-1} state={state}/><VaultDoor side={1} state={state}/></group>;
}
function ParticleField({state}:{state:State}){
  const ref=useRef<THREE.Group>(null);
  useFrame(({clock})=>{if(!ref.current)return;const p=state.progress.current;ref.current.visible=(p>1.5&&p<3.2)||(p>5.7&&p<7.3);ref.current.children.forEach((o,i)=>{const converge=p>5?1-clamp((p-5.7)/1.4):1;const t=state.still?0:clock.elapsedTime*.1;o.position.set(Math.sin(i*2.4+t)*(2+i%4)*converge,Math.cos(i*1.7+t)*2.5*converge,Math.sin(i*3.2)*2*converge);o.rotation.set(i*.3+t,i+t,0);});});
  return <group ref={ref}>{Array.from({length:state.compact?16:42},(_,i)=><mesh key={i}><boxGeometry args={[.13+(i%3)*.09,.025,.22]}/><meshStandardMaterial color={i%5===0?'#f27e51':'#3059b5'} metalness={.6} roughness={.3}/></mesh>)}</group>;
}
function NetworkSystem({state}:{state:State}){
  const root=useRef<THREE.Group>(null);const geometry=useMemo(()=>{const points=[];for(let i=0;i<(state.compact?24:96);i++){const a=i*2.399,r=1.8+(i%6)*.55;points.push(new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r*.7,Math.sin(i)*2));}const coords=[];for(let i=1;i<points.length;i++)coords.push(...points[i].toArray(),...points[Math.floor(i/2)].toArray());return {points,line:new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(coords,3))};},[state.compact]);
  useEffect(()=>()=>geometry.line.dispose(),[geometry]);
  useFrame(()=>{if(root.current){const p=state.progress.current;root.current.visible=p>8.8&&p<11.5;root.current.scale.setScalar(.01+clamp(p-8.8));root.current.rotation.y=(p-9)*.12;}});
  return <group ref={root}><lineSegments geometry={geometry.line}><lineBasicMaterial color="#7894c8" transparent opacity={.4}/></lineSegments>{geometry.points.map((p,i)=><mesh position={p} key={i}><octahedronGeometry args={[i%4===0?.12:.045]}/><meshStandardMaterial color={i%5===0?'#f27e51':'#3059b5'} metalness={.6} roughness={.3}/></mesh>)}</group>;
}
function CameraRig({state}:{state:State}){useFrame(({camera,pointer})=>{const p=state.progress.current;camera.position.set(state.still||state.compact?0:pointer.x*.25, .4+(state.still?0:pointer.y*.15),state.compact?8.5:p>9&&p<11.5?8:7.4);camera.lookAt(state.compact?0:-1.15,0,0);});return null;}
function SecurityLayers({state}:{state:State}){
 const ref=useRef<THREE.Group>(null);useFrame(()=>{if(ref.current){const p=state.progress.current;ref.current.visible=p>=7.8&&p<9.2;ref.current.scale.setScalar(.8+clamp(p-7.8)*.2);}});
 return <group ref={ref}>{[1.6,1.85,2.1].map((r,i)=><mesh key={r} rotation={[Math.PI/2+i*.3,i*.4,0]}><torusGeometry args={[r,.008,6,80]}/><meshStandardMaterial color={i===1?'#f27e51':'#3059b5'} metalness={.7} roughness={.3}/></mesh>)}</group>;
}
function DigitalEnvironment({state}:{state:State}){
  const {invalidate,gl}=useThree();useEffect(()=>{let frame=0,last=0,visible=true;const observer=new IntersectionObserver(([e])=>{visible=e.isIntersecting;});observer.observe(gl.domElement);const refresh=()=>invalidate();const tick=(now:number)=>{const p=state.progress.current;const chapter=Math.floor(p);if(visible&&!document.hidden&&![0,1,3,7,11].includes(chapter)&&now-last>(state.compact?50:33)){invalidate();last=now;}frame=requestAnimationFrame(tick);};if(!state.still)frame=requestAnimationFrame(tick);invalidate();addEventListener('scroll',refresh,{passive:true});addEventListener('resize',refresh);return()=>{cancelAnimationFrame(frame);observer.disconnect();removeEventListener('scroll',refresh);removeEventListener('resize',refresh);};},[invalidate,gl,state.compact,state.still,state.progress]);
  return <><LightingSystem dark={state.dark}/><VaultCore state={state}/><ParticleField state={state}/><NetworkSystem state={state}/><SecurityLayers state={state}/><CameraRig state={state}/></>;
}
class Boundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<div className="pv-fallback"><span>PROJECT VAULT</span><p>A home for what you build.</p></div>:this.props.children;}}
export default function VaultCanvas(props:State){return <Boundary><Canvas aria-hidden="true" frameloop="demand" dpr={props.compact?[1,1.2]:[1,1.6]} camera={{position:[0,.4,7],fov:42}} gl={{alpha:true,antialias:!props.compact,powerPreference:'low-power'}} onCreated={({gl})=>{gl.domElement.dataset.vaultReady='true';}}><Suspense fallback={null}><DigitalEnvironment state={props}/></Suspense></Canvas></Boundary>;}
