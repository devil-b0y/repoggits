import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

function release(root:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 root.traverse(node=>{if(node instanceof THREE.Mesh){geometries.add(node.geometry);(Array.isArray(node.material)?node.material:[node.material]).forEach(material=>{materials.add(material);Object.values(material).forEach(value=>{if(value instanceof THREE.Texture)textures.add(value);});});}});
 geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());
}

/** Locally hosted CC0 models and studio HDRI; optional assets never block the page. */
export function loadWorkbenchAssets(scene:THREE.Scene,group:THREE.Group,renderer:THREE.WebGLRenderer,refresh:()=>void,host:HTMLElement){
 let disposed=false,environment:THREE.WebGLRenderTarget|undefined;const objects:THREE.Group[]=[],detached:THREE.Object3D[]=[];const loader=new GLTFLoader();
 const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();
 new HDRLoader().load('/models/workbench/studio.hdr',texture=>{
  if(disposed){texture.dispose();return;}
  environment=pmrem.fromEquirectangular(texture);scene.environment=environment.texture;scene.environmentIntensity=.8;texture.dispose();pmrem.dispose();host.dataset.lighting='studio';refresh();
 },undefined,()=>{pmrem.dispose();});
 for(const [id,width,position,rotation] of [
  ['retro_multimeter',1.15,[1.9,.2,-.8],[0,-.25,0]],
  ['binder_notebook',1.65,[-1.7,.08,1.7],[0,-.3,0]],
 ] as const){
  loader.load(`/models/workbench/${id}/${id}.gltf`,gltf=>{
   if(disposed){release(gltf.scene);return;}
   if(id==='binder_notebook'){
    const closed=gltf.scene.getObjectByName('binder_notebook_closed');
    if(closed){closed.removeFromParent();detached.push(closed);}
   }
   const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   gltf.scene.position.sub(center);const wrapper=new THREE.Group();wrapper.add(gltf.scene);wrapper.scale.setScalar(width/Math.max(size.x,size.y,size.z));wrapper.position.set(position[0],position[1],position[2]);wrapper.rotation.set(rotation[0],rotation[1],rotation[2]);
   wrapper.traverse(node=>{if(node instanceof THREE.Mesh){node.castShadow=true;node.receiveShadow=true;}});
   group.add(wrapper);objects.push(wrapper);host.dataset[id]='ready';refresh();
  },undefined,()=>{host.dataset[id]='unavailable';});
 }
 return()=>{disposed=true;scene.environment=null;environment?.dispose();pmrem.dispose();objects.forEach(object=>{group.remove(object);release(object);});detached.forEach(release);};
}
