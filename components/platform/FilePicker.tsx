'use client';
import {useEffect,useState} from 'react';
import {Upload} from 'lucide-react';
import {api,Notice,useSession} from './shared';
export function FilePicker({label,kind,value,onChange,disabled=false}:{label:string;kind:'image'|'source';value:string;onChange:(id:string)=>void;disabled?:boolean}) {
 const {uploadsAvailable}=useSession();const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(!busy)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return ()=>window.removeEventListener('beforeunload',warn);
 },[busy]);
 return <div className="file-picker"><label>{label}<input type="file" aria-label={label} accept={kind==='source'?'.zip':'.png,.jpg,.jpeg,.webp'} disabled={busy||!uploadsAvailable||disabled} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setError('');try{if(file.size>20*1024*1024)throw new Error('The maximum file size is 20 MB.');const result=await api<{id:string}>('upload',{method:'POST',body:file,headers:{'Content-Type':'application/octet-stream','X-Filename':file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}});onChange(result.id);}catch(err){setError((err as Error).message);}finally{setBusy(false);e.target.value='';}}}/></label>{busy&&<p role="status">Checking your file…</p>}{!uploadsAvailable&&<small>Uploads are currently unavailable. Please refresh and try again.</small>}{value&&<div className="uploaded-file">{kind==='image'?<img src={`/api/files/${value}`} alt="Uploaded preview"/>:<span><Upload size={16}/> Source archive attached</span>}<button type="button" className="text-button" onClick={()=>onChange('')}>Remove</button></div>}{error&&<Notice error>{error}</Notice>}</div>;
}
