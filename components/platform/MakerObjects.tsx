'use client';

import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {buildDiscipline} from './discipline-geometry';
import './maker-objects.css';

const clamp=(value:number)=>THREE.MathUtils.clamp(value,0,1);
const ease=(value:number)=>{const t=clamp(value);return t*t*(3-2*t);};

/** A small, scroll-scrubbed object story. It renders only while its pose settles. */
export default function MakerObjects({paused}:{paused:boolean}){
  const host=useRef<HTMLDivElement>(null),pausedRef=useRef(paused),refresh=useRef(()=>{});
  const [ready,setReady]=useState(false);
  useEffect(()=>{pausedRef.current=paused;refresh.current();},[paused]);
  useEffect(()=>{
    const el=host.current,story=el?.closest<HTMLElement>('.maker-story');
    if(!el||!story)return;
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    let renderer:THREE.WebGLRenderer|undefined,frame=0,visible=false,failed=false,disposed=false;
    const selected=Number(story.dataset.manualScene??0)/2;
    let current=pausedRef.current||preference.matches?clamp(selected):0,target=current,draw=()=>{},disposeScene=()=>{};
    const motion=()=>preference.matches?'reduced':pausedRef.current?'paused':'running';
    const stop=()=>{cancelAnimationFrame(frame);frame=0;};
    const schedule=()=>{if(!frame&&renderer&&visible&&!document.hidden&&!failed)frame=requestAnimationFrame(tick);};
    function tick(){
      frame=0;
      if(!visible||document.hidden||failed)return;
      if(motion()==='running')current+=(target-current)*.14;
      if(Math.abs(target-current)<.0002)current=target;
      draw();
      if(motion()==='running'&&Math.abs(target-current)>.0002)schedule();
    }
    function update(){
      if(!el||!story)return;
      const nextMotion=motion(),motionChanged=el.dataset.motion!==nextMotion;
      el.dataset.motion=nextMotion;
      if(nextMotion==='running'){
        const bounds=story.getBoundingClientRect();
        target=clamp(-bounds.top/Math.max(1,bounds.height-innerHeight));
        schedule();
      }else{
        // Freeze the exact displayed pose, including when paused during a scroll.
        target=current;
        stop();
        if(motionChanged)schedule();
      }
    }
    refresh.current=update;
    // Manual scene buttons must change the illustration even when automatic motion is off.
    function selectScene(event:Event){
      if(motion()==='running')return;
      const index=(event as CustomEvent<number>).detail;
      if(!Number.isInteger(index)||index<0||index>2)return;
      current=target=index/2;stop();schedule();
    }
    function initialize(){
      if(renderer||failed||disposed||!el)return;
      try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}
      catch{failed=true;el.dataset.failed='true';return;}
      renderer.setClearColor(0x000000,0);
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.35;
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(28,1,.1,40);
      camera.position.set(4.4,4.7,7.2);camera.lookAt(0,.75,0);
      scene.add(new THREE.HemisphereLight(0xe6f0ff,0x1a2d50,3));
      const key=new THREE.DirectionalLight(0xffebd2,5);key.position.set(-3,7,5);scene.add(key);
      const rim=new THREE.DirectionalLight(0x91b7ff,4);rim.position.set(4,1,-3);scene.add(rim);
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
      const material=(color:string,metalness=0,roughness=.38)=>{
        const result=new THREE.MeshStandardMaterial({color,metalness,roughness});materials.add(result);return result;
      };
      const blue=material('#315ac3'),ink=material('#142b4a'),cream=material('#fff3da'),orange=material('#f98c55');
      const metal=material('#c6d6e6',.78,.25),copper=material('#d8a45d',.68,.3),pcb=material('#204e67',.22,.43);
      const addBox=(parent:THREE.Group,width:number,height:number,depth:number,x:number,y:number,z:number,mat:THREE.Material,radius=.025)=>{
        const geometry=radius?new RoundedBoxGeometry(width,height,depth,2,Math.min(radius,height/2,width/2,depth/2)):new THREE.BoxGeometry(width,height,depth);
        geometries.add(geometry);const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
      };
      const label=(parent:THREE.Group,text:string,width:number,height:number,x:number,y:number,z:number,flat=false,color='#fff2dc',background='#15304b')=>{
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=Math.round(512*height/width);
        const context=canvas.getContext('2d');
        if(!context)return;
        context.fillStyle=background;context.fillRect(0,0,canvas.width,canvas.height);
        context.fillStyle=color;context.font=`600 ${Math.min(60,canvas.height*.46)}px monospace`;context.textAlign='center';context.textBaseline='middle';context.fillText(text,256,canvas.height/2,460);
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);
        const mat=new THREE.MeshBasicMaterial({map:texture});materials.add(mat);
        const geometry=new THREE.PlaneGeometry(width,height);geometries.add(geometry);
        const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);if(flat)mesh.rotation.x=-Math.PI/2;parent.add(mesh);
      };

      const laptop=buildDiscipline('software'),computer=new THREE.Group();computer.add(laptop.group);scene.add(computer);
      laptop.materials.forEach(value=>materials.add(value));laptop.textures.forEach(value=>textures.add(value));
      const codeTile=new THREE.Group();computer.add(codeTile);
      addBox(codeTile,1.6,.75,.12,0,0,0,cream,.06);label(codeTile,'</>',1.4,.52,0,0,.068,false,'#315ac3','#fff3da');

      // A tangible development board, with a shield, antenna, two pin rails and USB port.
      const hardware=new THREE.Group(),board=new THREE.Group(),radio=new THREE.Group(),pins=new THREE.Group(),connector=new THREE.Group();
      hardware.add(board,radio,pins,connector);scene.add(hardware);
      addBox(board,2.35,.14,3.4,0,.15,0,pcb,.06);
      for(const x of [-.92,.92])for(let i=0;i<15;i++){
        const z=-1.4+i*.2;
        addBox(pins,.12,.38,.09,x,.06,z,copper,.012);
        addBox(pins,.16,.12,.15,x,.28,z,ink,.01);
        addBox(board,.26,.011,.027,x*.79,.225,z,copper,.003);
      }
      addBox(radio,1.42,.19,1.68,0,.38,-.38,metal,.04);
      label(radio,'ESP32',1.15,.44,0,.482,-.28,true,'#42536a','#cad5df');
      label(radio,'WI-FI + BLE',1.1,.18,0,.482,.2,true,'#42536a','#cad5df');
      addBox(board,1.42,.045,.46,0,.26,-1.39,ink,.012);
      for(let i=0;i<5;i++){
        addBox(board,.065,.018,.32,-.51+i*.25,.294,-1.39,copper,.002);
        if(i<4)addBox(board,.25,.018,.047,-.385+i*.25,.294,-1.39+(i%2?-.138:.138),copper,.002);
      }
      addBox(board,.44,.09,.4,-.16,.28,.86,ink,.02);
      for(let i=0;i<6;i++)addBox(board,.18,.1,.075,.43,.285,.56+i*.15,i===1?orange:cream,.01);
      for(const x of [-.52,.52]){addBox(board,.28,.13,.29,x,.29,1.26,metal,.02);addBox(board,.13,.1,.13,x,.38,1.26,ink,.02);}
      addBox(connector,.62,.26,.5,0,.33,1.64,metal,.06);
      addBox(connector,.45,.13,.023,0,.33,1.903,ink,.025);
      label(board,'3V3  GND  GPIO',.88,.13,-.04,.229,.48,true,'#c4dfef','#204e67');
      const led=new THREE.Mesh(new THREE.SphereGeometry(.055,12,8),new THREE.MeshStandardMaterial({color:'#ffa65d',emissive:'#ff7a36',emissiveIntensity:1.3}));
      led.position.set(-.5,.34,.75);board.add(led);

      // Three physical project sheets fan out at the end of the making sequence.
      const project=new THREE.Group(),sheets:THREE.Group[]=[];scene.add(project);
      ['THE BUILD','YOUR TEAM','SOURCE.ZIP'].forEach((title,index)=>{
        const sheet=new THREE.Group();sheets.push(sheet);project.add(sheet);
        addBox(sheet,2.75,.105,2.05,0,0,0,index===1?blue:cream,.045);
        label(sheet,title,2.33,.28,0,.06,-.7,true,index===1?'#fff3da':'#315ac3',index===1?'#315ac3':'#fff3da');
        if(index===0){
          addBox(sheet,2.22,.028,.95,0,.07,.05,ink,.03);
          addBox(sheet,.58,.075,.54,0,.12,.05,orange,.045);
          for(let line=0;line<3;line++)addBox(sheet,1.8-line*.3,.012,.032,-.13,.065,.69+line*.1,blue,.003);
        }else if(index===1){
          for(let person=0;person<3;person++){
            const geometry=new THREE.SphereGeometry(.23,16,12);geometries.add(geometry);
            const head=new THREE.Mesh(geometry,person===1?orange:cream);head.scale.y=.24;head.position.set((person-1)*.72,.075,0);sheet.add(head);
            addBox(sheet,.47,.012,.055,(person-1)*.72,.064,.44,cream,.003);
          }
        }else{
          label(sheet,'{ idea: shared }',2.1,.42,0,.065,-.06,true,'#315ac3','#fff3da');
          for(let line=0;line<4;line++)addBox(sheet,1.75-line%2*.44,.012,.042,-.13,.065,.33+line*.14,line===1?orange:blue,.003);
        }
      });
      const orbitGeometry=new THREE.TorusGeometry(2.6,.009,5,80);geometries.add(orbitGeometry);
      const orbitMaterial=new THREE.MeshBasicMaterial({color:0xf3bc95,transparent:true,opacity:.42});materials.add(orbitMaterial);
      const orbit=new THREE.Mesh(orbitGeometry,orbitMaterial);orbit.rotation.x=1.14;orbit.position.y=.55;scene.add(orbit);

      draw=()=>{
        if(!renderer||failed||!el)return;
        const a=ease((current-.13)/.24),b=ease((current-.58)/.24);
        const computerSize=1-a,hardwareSize=a*(1-b),projectSize=b;
        computer.visible=computerSize>.006;computer.scale.setScalar(Math.max(.001,computerSize*.78));
        computer.position.set(-a*2,.06-a*.8,a*1.1);computer.rotation.set(-.07,-.45+current*3.2,-current*.12);laptop.update(current);
        codeTile.position.set(1.8-current*2,2.1+Math.sin(current*7)*.2,.6);codeTile.rotation.set(-.08,-.1-current*.7,.13-current*.35);
        hardware.visible=hardwareSize>.006;hardware.scale.setScalar(Math.max(.001,hardwareSize*.95));
        hardware.position.set((1-a)*2.4-b*2.5,.18+b*.35,0);hardware.rotation.set(.07+(current-.5)*.32,-.5+(current-.32)*3.4,.08);
        const assembly=1-ease((current-.29)/.23);
        radio.position.y=assembly*1.05;pins.position.y=-assembly*.65;connector.position.z=assembly*.7;
        project.visible=projectSize>.006;project.scale.setScalar(Math.max(.001,projectSize));
        project.rotation.set(.08,-.58+b*.34,.03);project.position.set((1-b)*2.2,.2,0);
        sheets.forEach((sheet,index)=>{const fan=ease((current-.69)/.27);sheet.position.set((index-1)*fan*.62,index*.44,0);sheet.rotation.y=(index-1)*fan*.16;});
        orbit.rotation.z=current*1.4;orbit.scale.setScalar(.93+Math.sin(current*Math.PI)*.13);
        el.dataset.progress=current.toFixed(4);el.dataset.scene=current<.31?'code':current<.69?'circuit':'project';
        renderer.render(scene,camera);
      };
      const resize=()=>{if(!el||!renderer)return;const {width,height}=el.getBoundingClientRect();if(width&&height){renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();schedule();}};
      const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(el);resize();
      const contextLost=(event:Event)=>{event.preventDefault();failed=true;stop();el.dataset.failed='true';setReady(false);};
      renderer.domElement.addEventListener('webglcontextlost',contextLost);
      el.appendChild(renderer.domElement);
      draw();setReady(true);update();
      disposeScene=()=>{
        resizeObserver.disconnect();renderer?.domElement.removeEventListener('webglcontextlost',contextLost);
        scene.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);(Array.isArray(object.material)?object.material:[object.material]).forEach(value=>materials.add(value));}});
        geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());
        renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();
      };
    }
    // Returning after an offscreen resize must repaint even when motion is paused:
    // resizing clears the canvas while schedule() deliberately skips hidden work.
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible){initialize();update();schedule();}else stop();},{rootMargin:'80px'});
    observer.observe(el);
    const visibility=()=>{if(document.hidden)stop();else update();};
    window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);
    story.addEventListener('maker-scene-select',selectScene);
    preference.addEventListener('change',update);document.addEventListener('visibilitychange',visibility);update();
    return()=>{disposed=true;stop();observer.disconnect();window.removeEventListener('scroll',update);window.removeEventListener('resize',update);story.removeEventListener('maker-scene-select',selectScene);preference.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility);disposeScene();refresh.current=()=>{};};
  },[]);
  return <div ref={host} className="maker-objects" data-ready={ready} data-motion={paused?'paused':'running'} data-scene="code" aria-hidden="true">
    <div className="maker-object-halo"/>
    <div className="maker-object-fallback"><span/><i/><b>ESP32</b><em/></div>
    <div className="maker-object-note"><span className="object-note-code">01 / A FEW LINES OF POSSIBILITY</span><span className="object-note-circuit">02 / WATCH THE IDEA TAKE SHAPE</span><span className="object-note-project">03 / BUILT TO BE SHARED</span><i/></div>
  </div>;
}
