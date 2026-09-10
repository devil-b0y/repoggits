import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

export type DisciplineKind='software'|'hardware'|'hybrid';

export function buildDiscipline(kind:DisciplineKind){
  const group=new THREE.Group();
  const material=(color:string,metalness=0,roughness=.43)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const blue=material('#345fc6'),navy=material('#172e5d'),cream=material('#fff6e6'),orange=material('#f08b60'),metal=material('#c4cfdf',.65,.3),copper=material('#e4a378',.45),pale=material('#b8ccee');
  const textures:THREE.Texture[]=[];
  const geometryCache=new Map<string,THREE.BufferGeometry>();
  function box(parent:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material,radius=0){
    const key=[w,h,d,radius].join(':');
    if(!geometryCache.has(key))geometryCache.set(key,radius?new RoundedBoxGeometry(w,h,d,3,radius):new THREE.BoxGeometry(w,h,d));
    const mesh=new THREE.Mesh(geometryCache.get(key),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function cylinder(parent:THREE.Group,r:number,h:number,x:number,y:number,z:number,mat:THREE.Material){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  function circuit(parent:THREE.Group,y:number,width=3.5,depth=2.55){
    box(parent,width,.16,depth,0,y,0,blue,.06);
    box(parent,1.14,.24,.95,0,y+.18,0,navy,.05);
    box(parent,.77,.012,.57,0,y+.307,0,metal,.025);
    for(let i=0;i<8;i++){
      const x=-.49+i*.14;
      for(const sign of [-1,1]){box(parent,.065,.065,.27,x,y+.11,sign*.57,copper);box(parent,.035,.015,.36,x,y+.087,sign*.89,pale);}
    }
    for(let i=0;i<6;i++)for(const sign of [-1,1]){box(parent,.27,.065,.065,sign*.65,y+.11,-.35+i*.14,copper);box(parent,.5,.015,.027,sign*1.02,y+.087,-.35+i*.14,pale);}
    for(const x of [-width/2+.2,width/2-.2])for(const z of [-depth/2+.2,depth/2-.2]){cylinder(parent,.1,.025,x,y+.09,z,metal);cylinder(parent,.05,.03,x,y+.108,z,navy);}
    for(let i=0;i<3;i++){box(parent,.34,.17,.18,-1.18,y+.17,-.6+i*.34,orange,.025);box(parent,.12,.075,.22,.8+i*.24,y+.13,.83,cream);}
    for(let i=0;i<2;i++){cylinder(parent,.14,.36,1.08+i*.32,y+.26,-.76,navy);cylinder(parent,.13,.015,1.08+i*.32,y+.445,-.76,metal);}
    box(parent,.65,.2,.23,-.8,y+.18,depth/2+.025,metal,.04);
    box(parent,.43,.08,.01,-.8,y+.18,depth/2+.148,navy);
  }
  let update=(_progress:number)=>{};
  if(kind==='software'){
    box(group,3.6,.19,2.3,0,.16,.28,blue,.08);
    box(group,3.4,.05,2.13,0,.27,.28,metal,.055);
    for(let row=0;row<4;row++)for(let col=0;col<10;col++)box(group,.245,.038,.15,-1.37+col*.303,.317,-.35+row*.235,navy,.02);
    box(group,1.15,.035,.135,0,.316,.6,navy,.025);
    box(group,.94,.012,.42,0,.3,1.0,pale,.04);
    const lid=new THREE.Group();lid.position.set(0,.26,-.75);lid.rotation.x=-.16;group.add(lid);
    box(lid,3.6,2.35,.19,0,1.18,0,blue,.085);
    box(lid,3.32,2.07,.035,0,1.18,.11,navy,.04);
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=448;
    const ctx=canvas.getContext('2d');
    if(ctx){
      ctx.fillStyle='#172e5d';ctx.fillRect(0,0,768,448);ctx.fillStyle='#294777';ctx.fillRect(0,0,768,52);
      ['#f08b60','#f5dcae','#a3c9c3'].forEach((color,i)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(28+i*24,25,6,0,Math.PI*2);ctx.fill();});
      ctx.font='17px monospace';ctx.fillStyle='#c3d4f2';ctx.fillText('project.tsx',135,32);
      const lines=[['const ','project',' = {'],['  idea: ','"make something useful",',''],['  team: ','["you", "your people"],',''],['  status: ','"ready to share"',''],['};','',''],['build','(project);','']];
      lines.forEach((line,i)=>{ctx.font='22px monospace';ctx.fillStyle='#819cc6';ctx.fillText(String(i+1),26,108+i*48);let x=74;line.forEach((part,j)=>{ctx.fillStyle=j===1?'#f3ac84':'#e0eafa';ctx.fillText(part,x,108+i*48);x+=ctx.measureText(part).width;});});
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;textures.push(texture);
      const screen=new THREE.Mesh(new THREE.PlaneGeometry(3.14,1.83),new THREE.MeshBasicMaterial({map:texture}));screen.position.set(0,1.18,.137);lid.add(screen);
    }
    const lens=new THREE.Mesh(new THREE.SphereGeometry(.025,12,8),pale);lens.position.set(0,2.29,.108);lid.add(lens);
    update=progress=>{lid.rotation.x=-.11-progress*.15;};
  }else if(kind==='hardware'){
    circuit(group,.16);
    // Underside feet make the board's thickness and its soldered construction visible.
    for(const x of [-1.45,1.45])for(const z of [-1.02,1.02])cylinder(group,.09,.2,x,0,z,metal);
  }else{
    const base=new THREE.Group(),middle=new THREE.Group(),top=new THREE.Group();group.add(base,middle,top);
    circuit(base,.04,3.5,2.55);
    box(middle,3.5,.15,2.55,0,0,0,cream,.07);
    box(middle,1.1,.18,.82,0,.15,0,orange,.05);
    for(let i=0;i<5;i++){box(middle,.045,.014,.55,-1.25+i*.17,.084,.45,pale);box(middle,.045,.014,.55,.55+i*.17,.084,-.45,pale);}
    box(top,3.5,.16,2.55,0,0,0,blue,.07);
    box(top,3.08,.028,1.98,0,.095,.08,navy,.045);
    for(let i=0;i<4;i++){box(top,1.2+i%2*.55,.014,.06,-.42,.116,-.52+i*.29,i===1?orange:pale);box(top,.24,.014,.06,1.07,.116,-.52+i*.29,pale);}
    for(let i=0;i<3;i++)cylinder(top,.045,.025,-1.4+i*.16,.105,-1.09,i===0?orange:cream);
    const posts:THREE.Mesh[]=[];
    for(const x of [-1.51,1.51])for(const z of [-1.04,1.04])posts.push(cylinder(group,.045,1,x,.8,z,metal));
    update=progress=>{const gap=.65+progress*.3;middle.position.y=gap;top.position.y=gap*2;posts.forEach(post=>{post.scale.y=gap*2;post.position.y=gap;});};
  }
  update(.5);
  return {group,update,textures,materials:[blue,navy,cream,orange,metal,copper,pale]};
}
