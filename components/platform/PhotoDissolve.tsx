'use client';
import {useEffect,useRef} from 'react';
import * as THREE from 'three';

/** Image-colored particles travel through depth during each photographic scene change. */
export default function PhotoDissolve({paused}:{paused:boolean}){
  const root=useRef<HTMLDivElement>(null),pause=useRef(paused),refresh=useRef<()=>void>(()=>{});pause.current=paused;
  useEffect(()=>{refresh.current();},[paused]);
  useEffect(()=>{
    const el=root.current,story=el?.closest('.maker-story');if(!el||!story)return;
    const media=matchMedia('(prefers-reduced-motion: reduce)');let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power'});}catch{return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0,0);el.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,40);camera.position.z=5;
    const geometry=new THREE.BufferGeometry(),count=220*146,positions=new Float32Array(count*3),uvs=new Float32Array(count*2),seeds=new Float32Array(count*3);
    for(let i=0;i<count;i++){const x=i%220,y=Math.floor(i/220);positions.set([(x/219-.5)*6.21,(.5-y/145)*4.14,0],i*3);uvs.set([x/219,1-y/145],i*2);seeds.set([Math.sin(i*12.9898)*.5,Math.cos(i*7.123)*.5,Math.sin(i*3.17)*.5],i*3);}
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setAttribute('seed',new THREE.BufferAttribute(seeds,3));
    const textures:THREE.Texture[]=[];
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{photo:{value:null},amount:{value:0},alpha:{value:0},size:{value:3}},vertexShader:`attribute vec3 seed; uniform float amount; uniform float size; varying vec2 photoUv; void main(){photoUv=uv;vec3 p=position;float a=amount*amount;p.x+=seed.x*a*3.0;p.y+=seed.y*a*2.5;p.z+=seed.z*a*4.0;vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=size*(5.0/-mv.z);}`,fragmentShader:`uniform sampler2D photo;uniform float alpha;varying vec2 photoUv;void main(){vec2 p=gl_PointCoord-.5;float soft=1.0-smoothstep(.05,.5,length(p));vec3 color=mix(texture2D(photo,photoUv).rgb,vec3(1.0,.85,.65),.35);gl_FragColor=vec4(color,alpha*soft*.55);}`});
    const points=new THREE.Points(geometry,material);scene.add(points);let disposed=false,frame=0,visible=false,ready=0;
    const loader=new THREE.TextureLoader();['coding-v2','circuit'].forEach((name,i)=>loader.load(`/images/maker-story/${name}-mobile.webp`,texture=>{if(disposed){texture.dispose();return;}textures[i]=texture;ready++;schedule();},undefined,()=>{}));
    function render(){frame=0;if(disposed)return;const bounds=story!.getBoundingClientRect();const p=Math.max(0,Math.min(1,-bounds.top/Math.max(1,bounds.height-innerHeight)))*2;const phase=p-Math.floor(p);const enabled=!pause.current&&!media.matches&&visible&&!document.hidden&&ready===2;
      material.uniforms.photo.value=textures[Math.min(1,Math.floor(p))]||null;material.uniforms.amount.value=phase;material.uniforms.alpha.value=enabled?Math.pow(Math.sin(phase*Math.PI),2)*.95:0;
      el!.dataset.amount=enabled?phase.toFixed(3):'0.000';renderer.render(scene,camera);
    }
    function schedule(){if(!frame)frame=requestAnimationFrame(render);}refresh.current=schedule;
    const resize=new ResizeObserver(()=>{const bounds=el.getBoundingClientRect();if(!bounds.width||!bounds.height)return;renderer.setSize(bounds.width,bounds.height);camera.aspect=bounds.width/bounds.height;camera.updateProjectionMatrix();const visibleHeight=2*Math.tan(Math.PI/8)*5,visibleWidth=visibleHeight*camera.aspect;const scale=Math.max(visibleWidth/6.21,visibleHeight/4.14);points.scale.setScalar(scale);material.uniforms.size.value=bounds.width<700?2.5:4;schedule();});resize.observe(el);
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;schedule();});observer.observe(el);window.addEventListener('scroll',schedule,{passive:true});media.addEventListener('change',schedule);document.addEventListener('visibilitychange',schedule);
    return()=>{disposed=true;refresh.current=()=>{};cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();window.removeEventListener('scroll',schedule);media.removeEventListener('change',schedule);document.removeEventListener('visibilitychange',schedule);textures.forEach(t=>t.dispose());geometry.dispose();material.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
  },[]);
  return <div ref={root} className="photo-dissolve" aria-hidden="true"/>;
}
