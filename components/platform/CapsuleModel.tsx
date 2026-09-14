'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const clamp01=(value:number)=>Math.min(1,Math.max(0,value));
const smooth=(from:number,to:number,value:number)=>{const t=clamp01((value-from)/(to-from));return t*t*(3-2*t);};
// Same rule as CapsuleJourney: a chosen chapter rests mid-way through its fifth of the journey, so chosen and scrolled poses agree.
const chapterProgress=(chapter:number)=>chapter<=0?0:(chapter+.5)/5;

/**
 * The Project Capsule. Scrolling its pinned journey lifts the lid and fans out four layers (code, build,
 * people, demo), then packs them away again. When the stage is not pinned the chosen chapter sets the pose.
 * Paused or reduced motion drops the easing, pointer tilt and idle float, and it renders only when something changes.
 */
export default function CapsuleModel({paused,pinned,chapter}:{paused:boolean;pinned:boolean;chapter:number}){
 const host=useRef<HTMLDivElement>(null),latest=useRef({paused,pinned,chapter}),refresh=useRef(()=>{});
 const [ready,setReady]=useState(false);
 useEffect(()=>{latest.current={paused,pinned,chapter};refresh.current();},[paused,pinned,chapter]);
 useEffect(()=>{
  const el=host.current,journey=el?.closest<HTMLElement>('.capsule-journey');if(!el||!journey)return;
  const stage=el.closest<HTMLElement>('.capsule-stage')??el;
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{el.dataset.failed='true';return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setClearColor(0x000000,0);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,1,.1,80);
  scene.add(new THREE.HemisphereLight(0xfff6e6,0x6f86b8,2.4));
  const key=new THREE.DirectionalLight(0xfff1dc,4.2);key.position.set(-5,9,6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{left:-7,right:7,top:8,bottom:-4});key.shadow.normalBias=.03;scene.add(key);
  const rim=new THREE.DirectionalLight(0x9db8ff,2.2);rim.position.set(6,3,-6);scene.add(rim);

  const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],textures:THREE.Texture[]=[],painters:(()=>void)[]=[];
  const material=(color:string,extra:THREE.MeshStandardMaterialParameters={})=>{const result=new THREE.MeshStandardMaterial({color,roughness:.42,...extra});materials.push(result);return result;};
  const cream=material('#fff6e6'),blue=material('#3059b5'),navy=material('#172e5d'),orange=material('#f27e51'),pale=material('#b8ccee');
  const metal=material('#c9d4e3',{metalness:.6,roughness:.28}),copper=material('#e3a26f',{metalness:.4});
  const mesh=(geometry:THREE.BufferGeometry,surface:THREE.Material,parent:THREE.Object3D,x=0,y=0,z=0,shadow=true)=>{
   geometries.push(geometry);const result=new THREE.Mesh(geometry,surface);result.position.set(x,y,z);result.castShadow=shadow;result.receiveShadow=true;parent.add(result);return result;
  };
  const block=(parent:THREE.Object3D,w:number,h:number,d:number,surface:THREE.Material,x=0,y=0,z=0,radius=.06)=>mesh(new RoundedBoxGeometry(w,h,d,3,Math.min(radius,h/2,w/2,d/2)),surface,parent,x,y,z);
  // Printed faces are drawn on a canvas; they are redrawn once the display font has loaded.
  const printed=(width:number,height:number,paint:(context:CanvasRenderingContext2D,w:number,h:number)=>void)=>{
   const canvas=document.createElement('canvas');canvas.width=768;canvas.height=Math.round(768*height/width);
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;textures.push(texture);
   const draw=()=>{const context=canvas.getContext('2d');if(!context)return;context.clearRect(0,0,canvas.width,canvas.height);paint(context,canvas.width,canvas.height);texture.needsUpdate=true;};
   draw();painters.push(draw);
   const surface=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});materials.push(surface);return surface;
  };
  const flat=(parent:THREE.Object3D,width:number,height:number,surface:THREE.Material,y:number)=>{const plane=mesh(new THREE.PlaneGeometry(width,height),surface,parent,0,y,0,false);plane.rotation.x=-Math.PI/2;return plane;};

  const capsule=new THREE.Group();scene.add(capsule);
  const base=new THREE.Group(),lid=new THREE.Group();capsule.add(base,lid);
  block(base,3.6,.7,2.7,blue,0,.35,0,.22);
  block(base,3.66,.1,2.76,orange,0,.72,0,.05);
  block(lid,3.6,.62,2.7,cream,0,.31,0,.22);
  flat(lid,2.2,1.1,printed(2.2,1.1,(c,w,h)=>{c.fillStyle='#fff6e6';c.fillRect(0,0,w,h);c.textAlign='center';c.textBaseline='middle';c.fillStyle='#3059b5';c.font="500 104px 'Space Grotesk', sans-serif";c.fillText('repoggits',w/2,h*.44);c.fillStyle='#f27e51';c.font="500 36px 'Space Grotesk', monospace";c.fillText('PROJECT CAPSULE',w/2,h*.78);}),.625);

  const layers=[0,1,2,3].map(()=>new THREE.Group());layers.forEach(layer=>capsule.add(layer));
  const plate=(layer:THREE.Group,surface:THREE.Material)=>block(layer,3,.14,2.1,surface,0,0,0,.07);
  // Code: an editor panel.
  plate(layers[0],navy);
  flat(layers[0],2.62,1.8,printed(2.62,1.8,(c,w,h)=>{
   c.fillStyle='#172e5d';c.fillRect(0,0,w,h);c.fillStyle='#294777';c.fillRect(0,0,w,60);
   ['#f27e51','#f5dcae','#a3c9c3'].forEach((color,i)=>{c.fillStyle=color;c.beginPath();c.arc(32+i*28,30,9,0,Math.PI*2);c.fill();});
   c.font='26px monospace';c.fillStyle='#c3d4f2';c.fillText('capsule.ts',140,40);
   const lines=[['const ','capsule',' = open();'],['capsule.','source','.version(2);'],['capsule.','build','.photos(8);'],['capsule.','team','.credit(all);'],['share','(capsule);','']];
   lines.forEach((line,i)=>{let x=76;c.font='32px monospace';c.fillStyle='#819cc6';c.fillText(String(i+1),24,140+i*84);line.forEach((part,j)=>{c.fillStyle=j===1?'#f3ac84':'#e0eafa';c.fillText(part,x,140+i*84);x+=c.measureText(part).width;});});
  }),.075);
  // Build: a microcontroller with pins, headers, traces and a status light.
  plate(layers[1],blue);
  block(layers[1],1,.2,.8,navy,0,.16,0,.04);block(layers[1],.7,.02,.52,metal,0,.27,0,.01);
  for(let i=0;i<7;i++)for(const side of [-1,1])block(layers[1],.07,.07,.24,copper,-.42+i*.14,.1,side*.56,.01);
  for(let i=0;i<2;i++)block(layers[1],.34,.16,.2,orange,-1.05,.14,-.5+i*.4,.03);
  for(let i=0;i<3;i++)block(layers[1],.5,.02,.06,pale,.95,.08,-.5+i*.22,.01);
  mesh(new THREE.SphereGeometry(.07,16,12),material('#ffb16a',{emissive:'#ff7a36',emissiveIntensity:1.4}),layers[1],1.05,.14,.62);
  // People: three maker badges with name lines.
  plate(layers[2],cream);
  [orange,blue,navy].forEach((surface,i)=>{const x=-.9+i*.9;mesh(new THREE.CylinderGeometry(.34,.34,.08,32),surface,layers[2],x,.12,-.25);block(layers[2],.62,.03,.09,pale,x,.09,.38,.02);block(layers[2],.4,.03,.09,pale,x,.09,.58,.02);});
  // Demo: a screen with a play mark.
  plate(layers[3],orange);
  block(layers[3],2.5,.06,1.55,navy,0,.1,0,.04);
  const triangle=new THREE.Shape();triangle.moveTo(-.22,-.3);triangle.lineTo(.34,0);triangle.lineTo(-.22,.3);triangle.closePath();
  mesh(new THREE.ExtrudeGeometry(triangle,{depth:.06,bevelEnabled:false}),cream,layers[3],0,.13,0).rotation.x=-Math.PI/2;

  const ring=mesh(new THREE.TorusGeometry(3.4,.018,8,160),material('#f27e51',{emissive:'#f27e51',emissiveIntensity:.35}),scene,0,1.4,0,false);ring.rotation.x=Math.PI/2.25;
  const dustGeometry=new THREE.BufferGeometry(),dustPositions=new Float32Array(160*3);let seed=7;
  const random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  for(let i=0;i<160;i++){const angle=random()*Math.PI*2,radius=3+random()*3.5;dustPositions.set([Math.cos(angle)*radius,random()*6-.5,Math.sin(angle)*radius],i*3);}
  dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));geometries.push(dustGeometry);
  const dustMaterial=new THREE.PointsMaterial({color:'#3059b5',size:.05,transparent:true,opacity:.45,depthWrite:false});materials.push(dustMaterial);
  const dust=new THREE.Points(dustGeometry,dustMaterial);scene.add(dust);
  const shadowMaterial=new THREE.ShadowMaterial({opacity:.14});materials.push(shadowMaterial);
  mesh(new THREE.PlaneGeometry(40,40),shadowMaterial,scene,0,-.02,0,false).rotation.x=-Math.PI/2;

  let frame=0,timer=0,visible=false,disposed=false,current=0,target=0,pointer=0,pointerTarget=0,distance=15.5,clock=0,last=0;
  const moving=()=>!latest.current.paused&&!preference.matches;
  function pose(progress:number,time:number){
   const open=smooth(.06,.24,progress)*(1-smooth(.9,1,progress));
   const focus=Math.min(4,Math.floor(progress*5));
   capsule.position.y=Math.sin(time*1.1)*.08;
   lid.position.set(0,.77+open*4.2,-open*.9);lid.rotation.x=-open*.5;
   layers.forEach((layer,i)=>{
    const angle=(i-1.5)*.62*open,active=focus===i+1,closedY=.22+i*.12,openY=1.3+i*1.02,drift=open*Math.sin(time*.9+i*1.3)*.05;
    layer.position.set(Math.sin(angle)*1.7*open,closedY+(openY-closedY)*open+drift,Math.cos(angle)*.9*open+(active?.6*open:0));
    layer.rotation.set(-.1*open,angle*.85,0);layer.scale.setScalar(.92+open*(active?.16:.03));
   });
   capsule.rotation.set(.04,-.62+progress*1.1+pointer+Math.sin(time*.4)*.05,0);
   ring.rotation.z=progress*1.6+time*.05;ring.scale.setScalar(.9+open*.15);dust.rotation.y=progress*.8+time*.02;
   camera.position.set(0,distance*.28+open*1.1,distance);camera.lookAt(0,1.1+open*1.5,0);
   el!.dataset.open=open.toFixed(3);el!.dataset.chapter=String(focus);
  }
  function schedule(delay=0){
   if(frame||disposed||!visible||document.hidden)return;
   if(delay){if(!timer)timer=window.setTimeout(()=>{timer=0;schedule();},delay);return;}
   if(timer){clearTimeout(timer);timer=0;}
   frame=requestAnimationFrame(tick);
  }
  function tick(now:number){
   frame=0;if(!visible||document.hidden||disposed)return;
   const easing=moving(),step=last?Math.min(now-last,64):16.7;last=now;
   if(easing){const blend=1-Math.pow(.91,step/16.7);current+=(target-current)*blend;pointer+=(pointerTarget-pointer)*blend;clock+=step/1000;}
   else{current=target;pointer=0;}
   if(Math.abs(target-current)<.0004)current=target;
   pose(current,easing?clock:0);renderer.render(scene,camera);el!.dataset.progress=current.toFixed(3);
   if(!easing){last=0;return;}
   // Once the pose has settled only the idle float is left, which needs far fewer frames.
   schedule(current!==target||Math.abs(pointerTarget-pointer)>.0004?0:40);
  }
  function update(){
   const state=latest.current;
   el!.dataset.motion=preference.matches?'reduced':state.paused?'paused':'running';
   if(moving()&&state.pinned){const bounds=journey!.getBoundingClientRect();target=clamp01(-bounds.top/Math.max(1,bounds.height-innerHeight));}
   else target=chapterProgress(state.chapter);
   if(!moving())pointerTarget=0;
   schedule();
  }
  refresh.current=update;
  const resize=new ResizeObserver(()=>{
   const {width,height}=el.getBoundingClientRect();if(!width||!height)return;
   renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
   // Tall, narrow stages pull the camera back so the fanned layers and the ring stay in frame.
   distance=Math.max(15.5,13.4/camera.aspect);schedule();
  });
  resize.observe(el);
  const move=(event:PointerEvent)=>{if(!moving()||event.pointerType!=='mouse')return;const bounds=stage.getBoundingClientRect();pointerTarget=((event.clientX-bounds.left)/bounds.width-.5)*.35;schedule();};
  const leave=()=>{pointerTarget=0;schedule();};
  // An offscreen resize clears the canvas, so returning to view must draw even when nothing is moving.
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)update();else{cancelAnimationFrame(frame);frame=0;clearTimeout(timer);timer=0;last=0;}},{rootMargin:'120px'});observer.observe(el);
  const pageVisibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;clearTimeout(timer);timer=0;last=0;}else update();};
  const lost=(event:Event)=>{event.preventDefault();disposed=true;cancelAnimationFrame(frame);clearTimeout(timer);el.dataset.failed='true';setReady(false);};
  renderer.domElement.addEventListener('webglcontextlost',lost);el.appendChild(renderer.domElement);
  stage.addEventListener('pointermove',move);stage.addEventListener('pointerleave',leave);
  window.addEventListener('scroll',update,{passive:true});preference.addEventListener('change',update);document.addEventListener('visibilitychange',pageVisibility);
  document.fonts.load("500 104px 'Space Grotesk'").then(()=>{if(disposed)return;painters.forEach(draw=>draw());schedule();}).catch(()=>{});
  pose(0,0);setReady(true);update();
  return()=>{
   disposed=true;cancelAnimationFrame(frame);clearTimeout(timer);observer.disconnect();resize.disconnect();
   stage.removeEventListener('pointermove',move);stage.removeEventListener('pointerleave',leave);
   window.removeEventListener('scroll',update);preference.removeEventListener('change',update);document.removeEventListener('visibilitychange',pageVisibility);
   renderer.domElement.removeEventListener('webglcontextlost',lost);
   geometries.forEach(geometry=>geometry.dispose());materials.forEach(surface=>surface.dispose());textures.forEach(texture=>texture.dispose());
   key.shadow.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();refresh.current=()=>{};
  };
 },[]);
 return <div ref={host} className="capsule-model" data-ready={ready} aria-hidden="true"/>;
}
