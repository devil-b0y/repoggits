'use client';
import {useEffect,useState} from 'react';
import dynamic from 'next/dynamic';
import {Upload,CheckCircle2,Crop} from 'lucide-react';
import {api,Notice,useSession} from './shared';

// The photo editor is only needed once someone picks an image, so its code is fetched then.
const AvatarEditor = dynamic(() => import('./AvatarEditor'));

export type CropAspect = { ratio:number; label:string };
export const COVER_ASPECT:CropAspect = { ratio:16/10, label:'widescreen photo' };
export const SQUARE_ASPECT:CropAspect = { ratio:1, label:'square photo' };

export function FilePicker({label,kind,value,onChange,disabled=false,aspect}:{label:string;kind:'image'|'source';value:string;onChange:(id:string)=>void;disabled?:boolean;aspect?:CropAspect}) {
 const {uploadsAvailable}=useSession();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[dragging,setDragging]=useState(false);
 const [editing,setEditing]=useState<Blob|string|null>(null),[cropError,setCropError]=useState('');
 async function send(file:Blob,filename:string){
  setBusy(true);
  try{
   const result=await api<{id:string}>('upload',{method:'POST',body:file,headers:{'Content-Type':'application/octet-stream','X-Filename':filename.replace(/[^a-zA-Z0-9._-]/g,'_')}});onChange(result.id);
  }finally{setBusy(false);}
 }
 async function upload(file:File){
  if(busy||!uploadsAvailable||disabled)return;
  setError('');
  if(file.size>20*1024*1024)return setError('The maximum file size is 20 MB.');
  if(!(kind==='source'?/\.zip$/i:/\.(png|jpe?g|webp)$/i).test(file.name))return setError(kind==='source'?'Choose a ZIP archive.':'Choose a PNG, JPG, or WebP image.');
  if(kind==='image'&&aspect){setEditing(file);return;}
  try{await send(file,file.name);}catch(err){setError((err as Error).message);}
 }
 async function saveCrop(photo:Blob){
  setCropError('');
  try{await send(photo,`photo.${photo.type==='image/webp'?'webp':'png'}`);setEditing(null);}
  catch(err){setCropError((err as Error).message);}
 }
 useEffect(()=>{
  if(!busy)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return ()=>window.removeEventListener('beforeunload',warn);
 },[busy]);
 return <div className={`file-picker ${dragging?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();if(!busy&&!disabled&&uploadsAvailable)setDragging(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files.length>1){setError('Add one file at a time.');return;}const file=e.dataTransfer.files[0];if(file)void upload(file);}}><label>{label}<span className="upload-invitation"><Upload size={22}/><span>Drop your {kind==='source'?'source archive':'image'} here, or browse<small>{kind==='source'?'ZIP archive':'PNG, JPG or WebP'} · Up to 20 MB</small></span></span><input type="file" aria-label={label} accept={kind==='source'?'.zip':'.png,.jpg,.jpeg,.webp'} disabled={busy||!uploadsAvailable||disabled} onChange={async e=>{const input=e.currentTarget,file=input.files?.[0];if(file)await upload(file);input.value='';}}/></label>{busy&&<p role="status">Checking your file…</p>}{!uploadsAvailable&&<small>Uploads are currently unavailable. Please refresh and try again.</small>}{value&&<div className="uploaded-file">{kind==='image'?<img src={`/api/files/${value}`} alt="Uploaded preview"/>:<span><CheckCircle2 size={16}/> Source archive attached</span>}<span className="uploaded-file-actions">{kind==='image'&&aspect&&<button type="button" disabled={busy} className="text-button" onClick={()=>setEditing(`/api/files/${value}`)}><Crop size={15}/> Crop</button>}<button type="button" disabled={busy} className="text-button" onClick={()=>onChange('')}>Remove</button></span></div>}{error&&<Notice error>{error}</Notice>}
  {editing&&aspect&&<AvatarEditor source={editing} aspect={aspect} title="Frame your photo" eyebrow={label.toUpperCase()} busy={busy} error={cropError} onCancel={()=>{if(!busy){setEditing(null);setCropError('');}}} onSave={photo=>void saveCrop(photo)}/>}
 </div>;
}
