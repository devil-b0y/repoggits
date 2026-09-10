'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';

export default function ProjectSculpture({paused}:{paused:boolean}){
  const host=useRef<HTMLDivElement>(null);const [available,setAvailable]=useState(false);
  useEffect(()=>{
    const el=host.current;if(!el)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});}catch{return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000,0);el.appendChild(renderer.domElement);setAvailable(true);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.1,100);
    camera.position.set(8,8,11);camera.lookAt(0,.8,0);
    scene.add(new THREE.HemisphereLight(0xffffff,0x879ac3,3));
    const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(-4,10,5);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-7;light.shadow.camera.right=7;light.shadow.camera.top=7;light.shadow.camera.bottom=-7;light.shadow.normalBias=.035;scene.add(light);
    const material=(color:string,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness:.48,metalness});
    const cream=material('#fffdf5'),blue=material('#345cc0'),navy=material('#172e60'),orange=material('#ee845b'),pale=material('#c7d5ea'),chrome=material('#a8b5c8',.6);
    const model=new THREE.Group();scene.add(model);
    function box(parent:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
    function slab(parent:THREE.Group,mat:THREE.Material){const shape=new THREE.Shape(),w=4.8,h=3.15,r=.2;shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);shape.lineTo(w/2,h/2-r);shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);shape.lineTo(-w/2+r,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);shape.lineTo(-w/2,-h/2+r);shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.035,bevelThickness:.035}),mat);mesh.rotation.x=-Math.PI/2;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);}
    const layers=[new THREE.Group(),new THREE.Group(),new THREE.Group()];layers.forEach(g=>model.add(g));
    slab(layers[0],navy);slab(layers[1],cream);slab(layers[2],blue);
    for(let i=0;i<6;i++){box(layers[0],1.1+(i%3)*.38,.035,.055,-.9,.2,-.95+i*.3,i%2?orange:pale);box(layers[0],.45,.035,.055,1,.2,-.95+i*.3,pale);}
    for(let i=0;i<3;i++){const head=new THREE.Mesh(new THREE.SphereGeometry(.22,24,16),i===1?orange:blue);head.position.set(-1.35+i*1.3,.36,-.4);head.castShadow=true;layers[1].add(head);box(layers[1],.72,.06,.08,-1.35+i*1.3,.21,.25,pale);box(layers[1],.47,.06,.06,-1.35+i*1.3,.21,.5,pale);}
    box(layers[2],4.2,.025,2.15,0,.18,.05,navy);
    const triangle=new THREE.Shape();triangle.moveTo(-.22,-.36);triangle.lineTo(.36,0);triangle.lineTo(-.22,.36);triangle.closePath();const play=new THREE.Mesh(new THREE.ExtrudeGeometry(triangle,{depth:.065,bevelEnabled:false}),cream);play.rotation.x=-Math.PI/2;play.position.y=.23;layers[2].add(play);
    for(let i=0;i<3;i++){const dot=new THREE.Mesh(new THREE.SphereGeometry(.045,12,8),i===0?orange:pale);dot.position.set(-1.95+i*.18,.23,-1.3);layers[2].add(dot);}
    const base=new THREE.Mesh(new THREE.CylinderGeometry(3.3,3.5,.22,64),cream);base.position.y=-1.1;base.receiveShadow=true;base.castShadow=true;model.add(base);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(3.15,.025,10,96),chrome);ring.rotation.x=Math.PI/2;ring.position.y=-.97;model.add(ring);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.13}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.24;scene.add(floor);
    let frame=0,visible=false,progress=.35,target=.35,pointer=0;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    function scroll(){if(paused||reduced.matches)return;const bounds=el!.closest('.overview-story')!.getBoundingClientRect();target=THREE.MathUtils.clamp((innerHeight*.7-bounds.top)/(bounds.height*.9),0,1);}
    const resize=new ResizeObserver(()=>{const {width,height}=el.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();scroll();});resize.observe(el);
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;scroll();});observer.observe(el);
    const move=(e:PointerEvent)=>{if(paused||reduced.matches)return;const bounds=el.getBoundingClientRect();pointer=((e.clientX-bounds.left)/bounds.width-.5)*.12;};
    const leave=()=>{pointer=0;};el.addEventListener('pointermove',move);el.addEventListener('pointerleave',leave);window.addEventListener('scroll',scroll,{passive:true});
    const render=()=>{frame=requestAnimationFrame(render);if(!visible||document.hidden)return;progress+=(target-progress)*.065;const value=(paused||reduced.matches)? .5:progress;
      layers.forEach((layer,i)=>{layer.position.y=-.65+i*(.35+value*1.35);layer.rotation.y=(i-1)*value*.13;});model.rotation.y=-.22+value*.38+pointer;renderer.render(scene,camera);el.dataset.progress=value.toFixed(3);};render();
    return()=>{cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();window.removeEventListener('scroll',scroll);el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();scene.traverse(obj=>{if(obj instanceof THREE.Mesh){geometries.add(obj.geometry);(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();};
  },[paused]);
  return <div ref={host} className={`project-sculpture ${available?'sculpture-ready':''}`} aria-hidden="true"/>;
}
