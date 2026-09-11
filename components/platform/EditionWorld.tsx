'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {buildDiscipline} from './discipline-geometry';

export default function EditionWorld({paused}:{paused:boolean}){
  const host=useRef<HTMLDivElement>(null),pausedRef=useRef(paused),refresh=useRef(()=>{});
  const [ready,setReady]=useState(false);
  useEffect(()=>{pausedRef.current=paused;refresh.current();},[paused]);
  useEffect(()=>{
    const el=host.current;if(!el)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0,0);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.set(0,3,18);camera.lookAt(0,0,0);
    scene.add(new THREE.HemisphereLight(0xfff6e7,0x657ba8,2.8));const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(-4,8,7);scene.add(light);const rim=new THREE.DirectionalLight(0x91b7ff,2.5);rim.position.set(7,2,-6);scene.add(rim);
    const models=[buildDiscipline('software'),buildDiscipline('hardware'),buildDiscipline('hybrid')];models.forEach(model=>scene.add(model.group));
    const materials=new Set<THREE.Material>();models.forEach(model=>{model.materials.forEach(m=>materials.add(m));model.group.traverse(obj=>{if(obj instanceof THREE.Mesh)(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>materials.add(m));});});
    materials.forEach(m=>{m.transparent=true;});
    const points=new Float32Array(650*3),colors=new Float32Array(650*3);let seed=19;
    const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    for(let i=0;i<650;i++){const angle=random()*Math.PI*2,radius=2+random()*9;points[i*3]=Math.cos(angle)*radius;points[i*3+1]=Math.sin(angle)*radius*.65;points[i*3+2]=-4+random()*5;const c=new THREE.Color(i%7===0?'#f28a5e':'#6486c6');colors.set([c.r,c.g,c.b],i*3);}
    const pointGeometry=new THREE.BufferGeometry();pointGeometry.setAttribute('position',new THREE.BufferAttribute(points,3));pointGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const pointMaterial=new THREE.PointsMaterial({size:.035,transparent:true,opacity:.5,vertexColors:true,depthWrite:false});const particles=new THREE.Points(pointGeometry,pointMaterial);scene.add(particles);
    const wireMaterial=new THREE.LineBasicMaterial({color:'#6486c6',transparent:true,opacity:.14});
    const rings=new THREE.Group();for(let i=0;i<3;i++){const pts:THREE.Vector3[]=[];for(let j=0;j<=120;j++){const a=j/120*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(a)*(6+i*.8),Math.sin(a)*(3+i*.7),-2));}const ring=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),wireMaterial);ring.rotation.z=(i-1)*.5;rings.add(ring);}scene.add(rings);
    const preference=matchMedia('(prefers-reduced-motion: reduce)');let frame=0,visible=true,target=0,progress=0,pointerTarget=0,pointer=0,mobile=false;
    const moving=()=>!pausedRef.current&&!preference.matches;
    function schedule(){if(!frame&&visible&&!document.hidden)frame=requestAnimationFrame(render);}
    function update(){const section=el!.closest('.edition-opening')!;const bounds=section.getBoundingClientRect();target=moving()?THREE.MathUtils.clamp(-bounds.top/Math.max(1,bounds.height-innerHeight),0,1):0;el!.dataset.motion=preference.matches?'reduced':pausedRef.current?'paused':'running';schedule();}
    refresh.current=update;
    function render(){
      frame=0;if(!visible||document.hidden)return;progress=moving()?progress+(target-progress)*.07:0;pointer=moving()?pointer+(pointerTarget-pointer)*.06:0;
      const spread=progress*3;
      const laptop=models[0].group;laptop.position.set(mobile?-1.8:-5.4-spread,-1.6+progress*.5,mobile?-3:0);laptop.rotation.set(.18+progress*.25,.48+pointer+progress*.3,-.12);laptop.scale.setScalar(mobile?.7:1.12);
      const hardware=models[1].group;hardware.position.set(mobile?2.8:5.4+spread,2.7+progress*1.5,-1);hardware.rotation.set(.62,-.45-pointer,.3+progress*.35);hardware.scale.setScalar(mobile?.7:1.22);
      const hybrid=models[2].group;hybrid.position.set(mobile?2.2:5.1+spread,-2.4-progress,0);hybrid.rotation.set(.17,-.5+pointer,-.1-progress*.2);hybrid.scale.setScalar(mobile?.63:1.05);models[2].update(.5+progress*.5);
      materials.forEach(mat=>{mat.opacity=1-progress*.85;});particles.rotation.z=progress*.55+pointer*.04;particles.scale.setScalar(1+progress*.7);pointMaterial.opacity=.35+progress*.6;rings.rotation.z=-progress*.18;wireMaterial.opacity=.12+progress*.13;
      renderer.render(scene,camera);el!.dataset.progress=progress.toFixed(3);(el!.closest('.edition-opening') as HTMLElement).style.setProperty('--opening-progress',String(progress));
      if(moving()&&(Math.abs(target-progress)>.0005||Math.abs(pointerTarget-pointer)>.0005))schedule();
    }
    const resize=new ResizeObserver(()=>{const {width,height}=el.getBoundingClientRect();if(width&&height){mobile=width<700;renderer.setSize(width,height);camera.aspect=width/height;camera.position.z=mobile?19:18;camera.updateProjectionMatrix();update();}});resize.observe(el);el.appendChild(renderer.domElement);setReady(true);
    const visibility=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)update();else{cancelAnimationFrame(frame);frame=0;}});visibility.observe(el);
    const move=(e:PointerEvent)=>{if(!moving()||e.pointerType==='touch')return;pointerTarget=(e.clientX/innerWidth-.5)*.24;schedule();};
    const leave=()=>{pointerTarget=0;schedule();};const pageVisibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else update();};
    const lost=(e:Event)=>{e.preventDefault();visible=false;cancelAnimationFrame(frame);setReady(false);};renderer.domElement.addEventListener('webglcontextlost',lost);
    el.addEventListener('pointermove',move);el.addEventListener('pointerleave',leave);window.addEventListener('scroll',update,{passive:true});preference.addEventListener('change',update);document.addEventListener('visibilitychange',pageVisibility);update();
    return()=>{cancelAnimationFrame(frame);resize.disconnect();visibility.disconnect();window.removeEventListener('scroll',update);preference.removeEventListener('change',update);document.removeEventListener('visibilitychange',pageVisibility);el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);renderer.domElement.removeEventListener('webglcontextlost',lost);const geometries=new Set<THREE.BufferGeometry>();scene.traverse(obj=>{if(obj instanceof THREE.Mesh||obj instanceof THREE.Line||obj instanceof THREE.Points){geometries.add(obj.geometry);(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(mat=>materials.add(mat));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());models.forEach(m=>m.textures.forEach(t=>t.dispose()));renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();refresh.current=()=>{};};
  },[]);
  return <div ref={host} className={`edition-world ${ready?'world-ready':''}`} aria-hidden="true"/>;
}
