import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Original, real geometry: milled laptop, keys, soldered board, camera and connected wiring. */
export function buildWorkshop(){
 const group=new THREE.Group(),textures:THREE.Texture[]=[],materials:THREE.Material[]=[],geometries=new Map<string,THREE.BufferGeometry>();
 const mat=(color:string,metalness=0,roughness=.4)=>{const m=new THREE.MeshStandardMaterial({color,metalness,roughness});materials.push(m);return m;};
 const blue=mat('#3159b1',.3,.3),navy=mat('#152746',.15,.4),silver=mat('#c6ced8',.75,.25),paper=mat('#efe8d9'),orange=mat('#f17d4b',.15,.3),gold=mat('#d3a357',.8,.25),pcb=mat('#193f48',.2,.5),black=mat('#172122'),white=mat('#f5f5ee');
 const mesh=(geometry:THREE.BufferGeometry,material:THREE.Material,parent:THREE.Object3D,x=0,y=0,z=0)=>{const obj=new THREE.Mesh(geometry,material);obj.position.set(x,y,z);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;};
 const box=(parent:THREE.Object3D,w:number,h:number,d:number,material:THREE.Material,x=0,y=0,z=0,r=.04)=>{const key=`b:${w}:${h}:${d}:${r}`;if(!geometries.has(key))geometries.set(key,new RoundedBoxGeometry(w,h,d,3,Math.min(r,w/2,h/2,d/2)));return mesh(geometries.get(key)!,material,parent,x,y,z);};
 const cylinder=(parent:THREE.Object3D,r:number,h:number,material:THREE.Material,x=0,y=0,z=0)=>{const key=`c:${r}:${h}`;if(!geometries.has(key))geometries.set(key,new THREE.CylinderGeometry(r,r,h,32));return mesh(geometries.get(key)!,material,parent,x,y,z);};
 const print=(parent:THREE.Object3D,w:number,h:number,paint:(c:CanvasRenderingContext2D)=>void,x:number,y:number,z:number,flat=false)=>{
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*h/w);const c=canvas.getContext('2d')!;paint(c);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;textures.push(texture);const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});materials.push(material);
  const geometry=new THREE.PlaneGeometry(w,h);geometries.set(`print:${geometries.size}`,geometry);const plane=mesh(geometry,material,parent,x,y,z);if(flat)plane.rotation.x=-Math.PI/2;return plane;
 };
 const stage=cylinder(group,3.5,.2,paper,0,-.13,0);stage.scale.z=.8;
 const rim=cylinder(group,3.52,.045,white,0,-.25,0);rim.scale.z=.8;
 const laptop=new THREE.Group();group.add(laptop);laptop.position.set(-.85,0,-.15);laptop.rotation.y=.16;
 box(laptop,3.55,.14,2.38,silver,0,.11,0,.08);box(laptop,3.6,.075,2.41,blue,0,.03,0,.045);
 box(laptop,3.13,.017,1.12,navy,0,.19,-.28,.04);
 for(let row=0;row<4;row++)for(let col=0;col<12;col++)box(laptop,.218,.035,.182,black,-1.42+col*.258,.215,-.68+row*.263,.025);
 box(laptop,1.25,.035,.17,black,0,.215,.36,.03);box(laptop,1.13,.012,.47,navy,0,.19,.86,.05);box(laptop,1.09,.014,.43,silver,0,.194,.86,.04);
 for(const side of [-1,1])for(let i=0;i<9;i++)box(laptop,.012,.012,.05,navy,side*1.65,.19,-.7+i*.115,.005);
 const lid=new THREE.Group();laptop.add(lid);lid.position.set(0,.16,-1.07);lid.rotation.x=-.17;
 box(lid,3.55,2.26,.14,blue,0,1.13,0,.09);box(lid,3.35,2.08,.03,navy,0,1.14,.082,.055);
 print(lid,3.12,1.84,c=>{
  const h=c.canvas.height;c.fillStyle='#13243e';c.fillRect(0,0,1024,h);c.fillStyle='#223755';c.fillRect(0,0,1024,70);
  ['#f27e51','#eac67b','#7fbca3'].forEach((color,i)=>{c.fillStyle=color;c.beginPath();c.arc(32+i*28,35,7,0,7);c.fill();});
  c.fillStyle='#c5d5ec';c.font='22px monospace';c.fillText('campus-garden / main.cpp',165,43);
  const lines=['// a little curiosity goes a long way','void setup() {','  connect(ideas, people);','  sensor.begin();','}','', 'void loop() {','  if (soil.needsWater()) {','    garden.grow();','  }','}'];
  lines.forEach((line,i)=>{c.font='22px monospace';c.fillStyle='#526b90';c.fillText(String(i+1).padStart(2,'0'),27,115+i*35);c.fillStyle=i===0?'#779594':line.includes('void')?'#a4c4fd':line.includes('garden')?'#f7ad7e':'#dee9f7';c.fillText(line,88,115+i*35);});
  c.fillStyle='#234233';c.fillRect(0,h-40,1024,40);c.fillStyle='#a9d5b6';c.font='18px monospace';c.fillText('● connected     ESP32     ready to build',25,h-14);
 },0,1.14,.1);
 const lens=cylinder(lid,.023,.015,black,0,2.195,.079);lens.rotation.x=Math.PI/2;
 // Four-layer ESP32 development board, solder pads, pin headers and USB socket.
 const board=new THREE.Group();group.add(board);board.position.set(1.65,.28,.7);board.rotation.y=-.2;
 box(board,1.42,.09,2.38,pcb,0,0,0,.065);box(board,1.4,.028,2.36,navy,0,-.055,0,.025);
 for(const side of [-1,1]){
  box(board,.15,.16,2.01,black,side*.57,.08,0,.015);
  for(let i=0;i<14;i++){const z=-.94+i*.145;cylinder(board,.04,.025,gold,side*.57,.178,z);box(board,.035,.26,.035,gold,side*.57,-.11,z,.003);}
 }
 const shield=new THREE.Group();board.add(shield);box(shield,.81,.15,1.0,silver,0,.13,-.35,.035);
 print(shield,.7,.84,c=>{c.fillStyle='#c6ced8';c.fillRect(0,0,1024,c.canvas.height);c.fillStyle='#34495d';c.textAlign='center';c.font='bold 138px sans-serif';c.fillText('ESP32',512,420);c.font='54px monospace';c.fillText('Wi-Fi + Bluetooth',512,535);c.font='46px monospace';c.fillText('BUILD. CONNECT.',512,680);},0,.212,-.35,true);
 for(let i=0;i<4;i++)box(board,.03,.01,.2,gold,-.3+i*.18,.051,-1.02,.004);
 for(let i=0;i<3;i++)box(board,.18,.01,.028,gold,-.225+i*.18,.051,-.93+(i%2)*-.17,.004);
 for(let i=0;i<6;i++){box(board,.12,.06,.17,black,-.3+(i%3)*.3,.09,.32+Math.floor(i/3)*.25,.01);box(board,.13,.015,.025,silver,-.3+(i%3)*.3,.12,.24+Math.floor(i/3)*.25,.004);}
 box(board,.39,.17,.29,silver,0,.12,1.12,.04);box(board,.29,.08,.015,black,0,.12,1.273,.025);
 for(const x of [-.48,.48])for(const z of [-1.06,1.06]){cylinder(board,.07,.012,gold,x,.057,z);cylinder(board,.033,.015,black,x,.067,z);}
 const ledMaterial=new THREE.MeshStandardMaterial({color:'#ff8e56',emissive:'#ff5a16',emissiveIntensity:.8});materials.push(ledMaterial);const led=box(board,.06,.05,.075,ledMaterial,.32,.1,.78,.01);
 // A camera module and a tangible coiled cable connect the build to its code.
 const camera=new THREE.Group();group.add(camera);camera.position.set(2.0,.34,-1.15);camera.rotation.y=-.2;
 box(camera,.8,.58,.48,orange,0,0,0,.13);const eye=cylinder(camera,.2,.13,navy,0,0,.29);eye.rotation.x=Math.PI/2;const glass=cylinder(camera,.145,.14,silver,0,0,.31);glass.rotation.x=Math.PI/2;const aperture=cylinder(camera,.105,.15,navy,0,0,.33);aperture.rotation.x=Math.PI/2;
 const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(.5,.18,.8),new THREE.Vector3(.8,.13,1.55),new THREE.Vector3(1.6,.13,1.95),new THREE.Vector3(2,.18,1.7),new THREE.Vector3(1.43,.4,1.68)]);
 const cableGeometry=new THREE.TubeGeometry(curve,70,.035,10,false);geometries.set('cable',cableGeometry);mesh(cableGeometry,orange,group);
 const mouse=new THREE.Group();group.add(mouse);mouse.position.set(-2.05,.21,1.7);mouse.rotation.y=.3;
 box(mouse,.57,.23,.84,blue,0,0,0,.12);box(mouse,.018,.01,.36,navy,0,.118,-.2,.006);box(mouse,.045,.025,.13,silver,0,.13,-.08,.012);
 return {group,laptop,board,shield,led,update(progress:number,time:number,moving:boolean){lid.rotation.x=-.17-(moving?progress*.12:0);shield.position.y=moving?progress*.22:0;board.position.y=.28+(moving?Math.sin(time*.0007)*.035:0);ledMaterial.emissiveIntensity=moving?.7+Math.sin(time*.003)*.25:.7;},dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
