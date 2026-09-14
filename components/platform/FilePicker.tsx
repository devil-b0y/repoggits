'use client';
import {useEffect,useState} from 'react';
import {Upload,CheckCircle2} from 'lucide-react';
import {api,Notice,useSession} from './shared';
export function FilePicker({label,kind,value,onChange,disabled=false}:{label:string;kind:'image'|'source';value:string;onChange:(id:string)=>void;disabled?:boolean}) {
 const {uploadsAvailable}=useSession();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[dragging,setDragging]=useState(false);
 async function upload(file:File){
  if(busy||!uploadsAvailable||disabled)return;
  setBusy(true);setError('');
  try{
   if(file.size>20*1024*1024)throw new Error('The maximum file size is 20 MB.');
   if(!(kind==='source'?/\.zip$/i:/\.(png|jpe?g|webp)$/i).test(file.name))throw new Error(kind==='source'?'Choose a ZIP archive.':'Choose a PNG, JPG, or WebP image.');
   const result=await api<{id:string}>('upload',{method:'POST',body:file,headers:{'Content-Type':'application/octet-stream','X-Filename':file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}});onChange(result.id);
  }catch(err){setError((err as Error).message);}finally{setBusy(false);}
 }
 useEffect(()=>{
  if(!busy)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return ()=>window.removeEventListener('beforeunload',warn);
 },[busy]);
 return <div className={`file-picker ${dragging?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();if(!busy&&!disabled&&uploadsAvailable)setDragging(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files.length>1){setError('Add one file at a time.');return;}const file=e.dataTransfer.files[0];if(file)void upload(file);}}><label>{label}<span className="upload-invitation"><Upload size={22}/><span>Drop your {kind==='source'?'source archive':'image'} here, or browse<small>{kind==='source'?'ZIP archive':'PNG, JPG or WebP'} · Up to 20 MB</small></span></span><input type="file" aria-label={label} accept={kind==='source'?'.zip':'.png,.jpg,.jpeg,.webp'} disabled={busy||!uploadsAvailable||disabled} onChange={async e=>{const input=e.currentTarget,file=input.files?.[0];if(file)await upload(file);input.value='';}}/></label>{busy&&<p role="status">Checking your file…</p>}{!uploadsAvailable&&<small>Uploads are currently unavailable. Please refresh and try again.</small>}{value&&<div className="uploaded-file">{kind==='image'?<img src={`/api/files/${value}`} alt="Uploaded preview"/>:<span><CheckCircle2 size={16}/> Source archive attached</span>}<button type="button" disabled={busy} className="text-button" onClick={()=>onChange('')}>Remove</button></div>}{error&&<Notice error>{error}</Notice>}</div>;
}
