'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RotateCcw } from 'lucide-react';

export default function Workbench() {
  const host = useRef<HTMLDivElement>(null);
  const rotation = useRef(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, 1, .1, 100);
    camera.position.set(10, 10, 13); camera.lookAt(0, .7, 0);
    scene.add(new THREE.AmbientLight(0xfff5df, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 4); light.position.set(-4, 12, 6); light.castShadow = true; light.shadow.mapSize.set(2048, 2048); light.shadow.camera.left = -10; light.shadow.camera.right = 10; light.shadow.camera.top = 10; light.shadow.camera.bottom = -10; light.shadow.normalBias = .03; scene.add(light);
    const group = new THREE.Group(); scene.add(group);
    const blue = new THREE.MeshStandardMaterial({ color: '#365fc0', roughness: .65 });
    const dark = new THREE.MeshStandardMaterial({ color: '#18336e', roughness: .7 });
    const cream = new THREE.MeshStandardMaterial({ color: '#fff8e9', roughness: .9 });
    const orange = new THREE.MeshStandardMaterial({ color: '#ed764b', roughness: .7 });
    const pale = new THREE.MeshStandardMaterial({ color: '#bacce7', roughness: .8 });
    function box(w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material, target:THREE.Group=group) { const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; target.add(mesh); return mesh; }
    function cylinder(r:number,h:number,x:number,y:number,z:number,mat:THREE.Material) { const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,48),mat); mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh); return mesh; }
    // A miniature student studio, built from original geometry.
    box(8.4,.2,5.7,0,0,0,cream);
    const grid=new THREE.GridHelper(8,32,0xa6b5cb,0xd3d6d1); grid.position.y=.111; grid.scale.z=.69; group.add(grid);
    box(3.2,.13,2.25,-.6,.23,.15,blue);
    const lid=new THREE.Group(); lid.position.set(-.6,.27,-.9); lid.rotation.x=-.14; group.add(lid);
    box(3.2,2.05,.15,0,1,0,blue,lid); box(2.92,1.74,.04,0,1,.09,dark,lid);
    for(let i=0;i<7;i++) {box(.35+(i%3)*.23,.025,.014,-.86+(i%2)*.15,1.65-i*.19,.12,i%3===0?orange:pale,lid);box(.55,.025,.014,.15+(i%2)*.22,1.65-i*.19,.12,cream,lid);}
    for(let r=0;r<5;r++)for(let c=0;c<11;c++)box(.20,.018,.12,-1.87+c*.25,.31,-.62+r*.20,pale);
    box(.8,.013,.4,-.6,.31,.65,pale);
    // Architectural model with open floors and blue structural columns.
    for(let floor=0;floor<4;floor++) {box(1.8,.12,1.7,2.32,.28+floor*.78,-.7,cream);for(const x of [1.55,3.08])for(const z of [-1.4,0])box(.1,.72,.1,x,.67+floor*.78,z,blue);if(floor<3)box(1.3,.58,.065,2.33,.65+floor*.78,-1.38,pale);}
    box(1.9,.13,1.8,2.32,3.4,-.7,blue);
    // Circuit board and copper components.
    box(1.4,.1,1.1,2.55,.25,1.65,blue);box(.52,.16,.48,2.55,.37,1.65,dark);
    for(let i=0;i<7;i++){box(.09,.06,.18,2.04+i*.17,.34,1.17,orange);box(.09,.06,.18,2.04+i*.17,.34,2.12,pale);}
    for(let i=0;i<4;i++)box(.055,.016,.3,2.2+i*.2,.31,1.98,cream);
    // Stacked books, plant and drafting pencil.
    const book=box(1.5,.18,1.12,-2.65,.23,1.6,blue);book.rotation.y=.12;
    box(1.4,.15,1.08,-2.65,.41,1.6,cream).rotation.y=.12;
    box(1.45,.12,1.12,-2.6,.55,1.6,orange).rotation.y=-.09;
    cylinder(.34,.6,-2.8,.43,-1.5,cream);
    for(let i=0;i<6;i++){const leaf=new THREE.Mesh(new THREE.SphereGeometry(.23,16,12),blue);leaf.scale.set(.5,2,1);leaf.position.set(-2.8+Math.sin(i)*.18,1.02+(i%2)*.15,-1.5+Math.cos(i)*.18);leaf.rotation.z=Math.sin(i)*.65;group.add(leaf);}
    const pencil=box(.065,.07,1.7,.35,.2,1.8,orange);pencil.rotation.y=-.45;
    cylinder(.27,.46,-2.55,.34,-.25,blue);
    const handle=new THREE.Mesh(new THREE.TorusGeometry(.18,.05,12,28),blue);handle.position.set(-2.86,.4,-.25);group.add(handle);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.13}));ground.rotation.x=-Math.PI/2;ground.position.y=-.16;ground.receiveShadow=true;scene.add(ground);
    const resize=()=>{ const w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
    const observer=new ResizeObserver(resize);observer.observe(el);resize();
    let pointerX=0,pointerY=0,frame=0,visible=true;
    const move=(event:PointerEvent)=>{const bounds=el.getBoundingClientRect();pointerX=(event.clientX-bounds.left)/bounds.width-.5;pointerY=(event.clientY-bounds.top)/bounds.height-.5;};
    const leave=()=>{pointerX=0;pointerY=0;};el.addEventListener('pointermove',move);el.addEventListener('pointerleave',leave);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const visibility=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;});visibility.observe(el);
    const render=()=>{frame=requestAnimationFrame(render);if(!visible)return;const target=rotation.current+(reduced.matches?0:pointerX*.24);group.rotation.y+=(target-group.rotation.y)*.055;group.rotation.x+=((reduced.matches?0:pointerY*.055)-group.rotation.x)*.055;renderer.render(scene,camera);};render();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();visibility.disconnect();el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);scene.traverse(obj=>{if(obj instanceof THREE.Mesh){obj.geometry.dispose();const mats=Array.isArray(obj.material)?obj.material:[obj.material];mats.forEach(mat=>mat.dispose());}});renderer.dispose();renderer.domElement.remove();};
  }, []);
  return <div className="workbench"><div ref={host} className="scene" role="img" aria-label="Interactive 3D student workbench with a laptop, architectural model, circuit board, and notebooks"/>{failed&&<div className="scene-fallback"><span>⌘</span><p>A space for your next big idea.</p></div>}<span className="scene-note note-one">a little curiosity.<svg viewBox="0 0 100 60" aria-hidden="true"><path d="M5 5 Q75 0 73 48 M63 38 L73 49 84 36"/></svg></span><span className="scene-note note-two">a whole lot of possibility.</span><div className="scene-caption"><span>FIG. 01 — THE MAKER’S WORKSPACE</span><button onClick={()=>{rotation.current+=Math.PI/4;}} aria-label="Rotate 3D workbench"><RotateCcw size={14}/> <span>TAKE A LOOK AROUND</span></button></div></div>;
}
