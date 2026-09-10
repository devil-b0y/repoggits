'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {buildDiscipline,type DisciplineKind} from './discipline-geometry';
import './discipline-model.css';

export default function DisciplineModel({kind,paused}:{kind:DisciplineKind;paused:boolean}){
  const host=useRef<HTMLDivElement>(null),pausedRef=useRef(paused),refresh=useRef(()=>{});
  const [ready,setReady]=useState(false);
  useEffect(()=>{pausedRef.current=paused;refresh.current();},[paused]);
  useEffect(()=>{
    const el=host.current;if(!el)return;
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    let renderer:THREE.WebGLRenderer|undefined,disposeScene=()=>{},draw=()=>{},frame=0,visible=false,failed=false,settling=false;
    let pointerX=0,pointerY=0,scrollTarget=.5,scrollCurrent=.5,angle=0,tilt=0;
    const motion=()=>pausedRef.current?'paused':preference.matches?'reduced':'running';
    function stop(){cancelAnimationFrame(frame);frame=0;}
    function schedule(){if(!frame&&visible&&!document.hidden&&renderer&&!failed)frame=requestAnimationFrame(tick);}
    function tick(){frame=0;draw();if(motion()==='running'&&settling)schedule();}
    function update(){
      el!.dataset.motion=motion();
      if(motion()!=='running'){pointerX=pointerY=0;stop();}
      const bounds=el!.getBoundingClientRect();scrollTarget=THREE.MathUtils.clamp((innerHeight-bounds.top)/(innerHeight+bounds.height),0,1);schedule();
    }
    refresh.current=update;
    function initialize(){
      if(renderer||failed)return;
      try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{failed=true;return;}
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      renderer.setClearColor(0x000000,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.1,60);
      const targetY=kind==='hardware'?.25:1;
      camera.position.set(kind==='software'?4.7:4.6,kind==='hardware'?5.4:4.3,7.8);camera.lookAt(0,targetY,0);
      scene.add(new THREE.HemisphereLight(0xeaf2ff,0x8192b0,2.3));
      const key=new THREE.DirectionalLight(0xfff5e5,4);key.position.set(-3,7,5);key.castShadow=true;key.shadow.mapSize.set(512,512);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;key.shadow.normalBias=.025;scene.add(key);
      const rim=new THREE.DirectionalLight(0xaac5ff,2);rim.position.set(4,3,-5);scene.add(rim);
      const model=buildDiscipline(kind);scene.add(model.group);
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.ShadowMaterial({opacity:.17}));ground.rotation.x=-Math.PI/2;ground.position.y=-.14;ground.receiveShadow=true;scene.add(ground);
      const resize=()=>{const {width,height}=el!.getBoundingClientRect();if(width&&height){renderer!.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();schedule();}};
      const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(el!);resize();
      const lost=(event:Event)=>{event.preventDefault();failed=true;stop();setReady(false);};renderer.domElement.addEventListener('webglcontextlost',lost);
      el!.appendChild(renderer.domElement);
      draw=()=>{
        if(failed||!renderer)return;
        const moving=motion()==='running';
        scrollCurrent+=(scrollTarget-scrollCurrent)*.055;angle+=(pointerX-angle)*.07;tilt+=(pointerY-tilt)*.07;
        settling=Math.abs(scrollTarget-scrollCurrent)+Math.abs(pointerX-angle)+Math.abs(pointerY-tilt)>.0005;
        model.group.rotation.y=-.22+(moving?(scrollCurrent-.5)*.55+angle:0);
        model.group.rotation.x=moving?tilt:0;
        model.update(moving?scrollCurrent:.5);renderer.render(scene,camera);
        el!.dataset.rotation=model.group.rotation.y.toFixed(4);
      };
      disposeScene=()=>{resizeObserver.disconnect();renderer!.domElement.removeEventListener('webglcontextlost',lost);const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(model.materials);scene.traverse(obj=>{if(obj instanceof THREE.Mesh){geometries.add(obj.geometry);(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());model.textures.forEach(t=>t.dispose());key.shadow.dispose();renderer!.dispose();renderer!.forceContextLoss();renderer!.domElement.remove();};
      draw();setReady(true);update();
    }
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible){initialize();update();}else stop();},{rootMargin:'100px'});observer.observe(el);
    const move=(event:PointerEvent)=>{if(motion()!=='running'||event.pointerType==='touch')return;const b=el.getBoundingClientRect();pointerX=((event.clientX-b.left)/b.width-.5)*.6;pointerY=((event.clientY-b.top)/b.height-.5)*.17;schedule();};
    const leave=()=>{pointerX=pointerY=0;schedule();};
    const visibility=()=>{if(document.hidden)stop();else update();};
    el.addEventListener('pointermove',move);el.addEventListener('pointerleave',leave);window.addEventListener('scroll',update,{passive:true});document.addEventListener('visibilitychange',visibility);preference.addEventListener('change',update);update();
    return()=>{stop();observer.disconnect();el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);window.removeEventListener('scroll',update);document.removeEventListener('visibilitychange',visibility);preference.removeEventListener('change',update);disposeScene();refresh.current=()=>{};};
  },[kind]);
  return <div ref={host} className="discipline-model" data-kind={kind} data-ready={ready} aria-hidden="true"/>;
}
