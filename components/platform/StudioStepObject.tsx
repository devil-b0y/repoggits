'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const objectNames=['Project notebook','Team identity badges','Development board','Demo camera','Project calculator','Review folder'];
export default function StudioStepObject({step}:{step:number}){
 const host=useRef<HTMLDivElement>(null);const [ready,setReady]=useState(false);
 useEffect(()=>{
  const el=host.current;if(!el)return;setReady(false);
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0,0);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  el.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.1,50);
  camera.position.set(0,1,8.5);camera.lookAt(0,0,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x34558c,3));
  for(const [x,y,z,intensity,color] of [[-4,5,6,5,0xfff2df],[4,2,-3,4,0x8db5ff]]){const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);}
  const model=new THREE.Group();scene.add(model);model.rotation.set(-.15,-.35,-.08);
  const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],textures:THREE.Texture[]=[];
  const mat=(color:string,metalness=0,roughness=.4)=>{const m=new THREE.MeshStandardMaterial({color,metalness,roughness});materials.push(m);return m;};
  const blue=mat('#3059b5'),paper=mat('#fff7e7'),silver=mat('#aab9c9',.8,.22),dark=mat('#172435',.25),gold=mat('#dca15b',.75,.25),green=mat('#164e45'),orange=mat('#f27e51');
  function mesh(g:THREE.BufferGeometry,m:THREE.Material,x=0,y=0,z=0,parent:THREE.Object3D=model){geometries.push(g);const obj=new THREE.Mesh(g,m);obj.position.set(x,y,z);parent.add(obj);return obj;}
  function box(w:number,h:number,d:number,m:THREE.Material,x=0,y=0,z=0,parent:THREE.Object3D=model){return mesh(new RoundedBoxGeometry(w,h,d,3,Math.min(.08,w/3,h/3,d/3)),m,x,y,z,parent);}
  function disc(r:number,d:number,m:THREE.Material,x=0,y=0,z=0,parent:THREE.Object3D=model){const o=mesh(new THREE.CylinderGeometry(r,r,d,48),m,x,y,z,parent);o.rotation.x=Math.PI/2;return o;}
  function print(text:string,w:number,h:number,x:number,y:number,z:number,parent:THREE.Object3D=model,bg='#fff7e7',color='#243e77'){
   const c=document.createElement('canvas');c.width=768;c.height=Math.round(768*h/w);const ctx=c.getContext('2d')!;
   ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=color;ctx.font=`600 ${Math.round(c.height*.36)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,c.width/2,c.height/2,c.width*.9);
   const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);const m=new THREE.MeshStandardMaterial({map:t,roughness:.6});materials.push(m);mesh(new THREE.PlaneGeometry(w,h),m,x,y,z,parent);
  }
  if(step===1){
   box(2.5,3.05,.23,blue);box(2.32,2.88,.19,paper,.06,0,.13);box(2.5,3.05,.045,blue,0,0,.25);
   print('IDEA NOTEBOOK',1.9,.35,.1,.55,.278,model,'#3059b5','#fff7e7');
   print('REPPO GGITS / BUILD NOTES',1.8,.18,.1,-.83,.279,model,'#3059b5','#b8ccee');
   for(let i=0;i<8;i++){const ring=mesh(new THREE.TorusGeometry(.12,.025,8,24),silver,-1.18,1.17-i*.33,.15);ring.rotation.y=Math.PI/2;}
   const pencil=new THREE.Group();model.add(pencil);pencil.position.set(1.65,0,.3);pencil.rotation.z=-.22;
   mesh(new THREE.CylinderGeometry(.075,.075,2.7,6),orange,0,0,0,pencil);mesh(new THREE.ConeGeometry(.075,.27,6),gold,0,1.48,0,pencil);mesh(new THREE.CylinderGeometry(.078,.078,.2,12),silver,0,-1.4,0,pencil);
  }else if(step===2){
   for(let i=0;i<2;i++){const badge=new THREE.Group();badge.position.set(i? .7:-.65,i?-.22:.22,i?.3:0);badge.rotation.z=i?-.15:.12;model.add(badge);
    box(1.75,2.55,.12,paper,0,0,0,badge);box(.8,.14,.14,silver,0,1.25,.01,badge);box(.2,.8,.035,blue,0,1.67,-.02,badge);
    disc(.36,.035,blue,0,.43,.08,badge);disc(.14,.04,paper,0,.51,.11,badge);box(.42,.18,.05,paper,0,.24,.12,badge);
    print(i?'TEAMMATE':'CREATOR',1.5,.24,0,-.27,.065,badge);for(let j=0;j<3;j++)box(1.05-j*.17,.035,.01,silver,0,-.55-j*.15,.073,badge);
    for(let j=0;j<13;j++)box(.025,.19,.01,dark,-.5+j*.08,-.98,.075,badge);
   }
  }else if(step===3){
   box(2.2,3.1,.13,green);box(1.23,1.35,.22,silver,0,.38,.17);print('ESP32',1,.3,0,.35,.285,model,'#aab9c9','#172435');
   for(let side of [-1,1])for(let i=0;i<12;i++){box(.15,.13,.3,dark,side*.94,1.22-i*.22,.14);box(.09,.08,.52,gold,side*1.12,1.22-i*.22,.18);}
   box(.62,.36,.26,silver,0,-1.39,.18);box(.44,.17,.015,dark,0,-1.4,.32);
   for(let i=0;i<5;i++){box(.09,.13,.06,silver,-.5+i*.25,-.65,.12);box(.025,.5,.008,gold,-.5+i*.25,-.94,.072);}
   for(let i=0;i<4;i++)box(.7,.045,.012,gold,i%2?.1:0,1.04+i*.1,.08);
   disc(.06,.06,orange,.65,-1.03,.13);
  }else if(step===4){
   box(3,1.92,.85,dark);box(.78,1.84,.98,blue,-1.08,-.01,.06);box(.83,.3,.6,dark,.2,1.04,-.06);
   disc(.86,.22,silver,.32,0,.52);disc(.77,.68,dark,.32,0,.87);disc(.64,.05,silver,.32,0,1.23);disc(.57,.07,mat('#163665',.65,.12),.32,0,1.28);disc(.32,.018,mat('#4358a4',.7,.1),.32,0,1.325);
   const shutter=disc(.16,.1,orange,1,.99,.1);shutter.rotation.x=0;
   print('REPPO',.7,.17,-.92,.52,.565,model,'#3059b5','#ffffff');
  }else if(step===5){
   box(2,2.85,.3,dark);box(1.65,.65,.045,mat('#bbcdad'),0,.88,.17);print('012 450',1.5,.38,0,.88,.196,model,'#bbcdad','#172435');
   for(let y=0;y<4;y++)for(let x=0;x<3;x++){box(.43,.34,.13,y===3?blue:paper,-.58+x*.58,.19-y*.47,.2);print(String(y*3+x+1),.27,.23,-.58+x*.58,.19-y*.47,.27,model,y===3?'#3059b5':'#fff7e7',y===3?'#ffffff':'#172435');}
   for(let i=0;i<5;i++){const coin=disc(.44,.1,gold,1.5,-1.17+i*.12,.15);coin.rotation.x=-Math.PI/2;}
  }else{
   box(2.7,2.9,.24,blue);box(2.42,2.66,.13,paper,0,.02,.19);box(.8,.33,.14,silver,0,1.4,.23);
   print('READY FOR REVIEW',2.1,.25,0,.9,.267);
   for(let i=0;i<4;i++){box(.23,.23,.035,blue,-.86,.35-i*.4,.28);box(1.28,.045,.01,silver,.15,.35-i*.4,.268);}
   const seal=disc(.43,.11,gold,.83,-1.03,.32);print('OK',.53,.25,.83,-1.03,.382,model,'#dca15b','#172435');
  }
  let frame=0,visible=true;const reduced=matchMedia('(prefers-reduced-motion: reduce)');let px=0,py=0;
  const render=()=>{model.rotation.y=-.35+(reduced.matches?0:px*.14);model.rotation.x=-.15+(reduced.matches?0:py*.08);renderer.render(scene,camera);};
  const tick=(time:number)=>{if(!visible||document.hidden||reduced.matches)return;model.position.y=Math.sin(time*.0006)*.035;render();frame=requestAnimationFrame(tick);};
  const resume=()=>{cancelAnimationFrame(frame);render();if(visible&&!document.hidden&&!reduced.matches)frame=requestAnimationFrame(tick);};
  const resize=new ResizeObserver(()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();});resize.observe(el);
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;resume();});observer.observe(el);
  const pointer=(e:PointerEvent)=>{const r=el.getBoundingClientRect();px=(e.clientX-r.left)/r.width-.5;py=(e.clientY-r.top)/r.height-.5;};
  el.addEventListener('pointermove',pointer);document.addEventListener('visibilitychange',resume);reduced.addEventListener('change',resume);setReady(true);resume();
  return ()=>{cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();el.removeEventListener('pointermove',pointer);document.removeEventListener('visibilitychange',resume);reduced.removeEventListener('change',resume);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();};
 },[step]);
 return <div className="studio-step-object" data-object={step} aria-hidden="true"><div ref={host} className="studio-object-canvas"/>{!ready&&<div className="studio-object-fallback"><span>{String(step).padStart(2,'0')}</span><strong>{objectNames[step-1]}</strong></div>}<span className="studio-object-caption">{objectNames[step-1]} / 0{step}</span></div>;
}
