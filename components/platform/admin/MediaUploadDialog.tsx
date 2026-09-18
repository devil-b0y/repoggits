'use client';
import {useEffect,useRef,useState} from 'react';
import {AlertCircle,CheckCircle2,RotateCcw,Upload,X} from 'lucide-react';
import {useSession} from '../shared';

// The Media Manager's "+ Upload Media" dialog: multiple files at once, each tracked independently (queued →
// uploading → done/error/duplicate), with per-file cancel and retry. FilePicker.tsx (project cover/source picker)
// is one file at a time with no queue, so this is a parallel, purpose-built uploader rather than a stretch of it.

const ACCEPT='.png,.jpg,.jpeg,.webp,.mp4,.webm,.pdf,.doc,.docx,.ppt,.pptx,.zip';
const MAX_BYTES=100*1024*1024;
type Status='queued'|'uploading'|'done'|'error'|'duplicate';
type QueueItem={id:string;file:File;status:Status;error:string;progress:number;resultId?:string;existingId?:string;existingFilename?:string};

let counter=0;
const nextId=()=>String(++counter);

async function uploadFile(file:File,allowDuplicate:boolean,onProgress:(pct:number)=>void):Promise<{id:string}|{duplicate:true;existingId:string;existingFilename:string}> {
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST','/api/upload');
    xhr.setRequestHeader('Content-Type','application/octet-stream');
    xhr.setRequestHeader('X-Filename',file.name.replace(/[^a-zA-Z0-9._-]/g,'_'));
    if(allowDuplicate)xhr.setRequestHeader('X-Allow-Duplicate','true');
    xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(Math.round(event.loaded/event.total*100));};
    xhr.onload=()=>{
      let body:Record<string,unknown>={};
      try{body=JSON.parse(xhr.responseText);}catch{}
      if(xhr.status===201)resolve(body as {id:string});
      else if(xhr.status===409&&body.duplicate)resolve(body as {duplicate:true;existingId:string;existingFilename:string});
      else reject(new Error(String(body.error||'Upload failed.')));
    };
    xhr.onerror=()=>reject(new Error('The upload could not be completed. Check your connection and try again.'));
    xhr.send(file);
  });
}

export default function MediaUploadDialog({onClose,onUploaded}:{onClose:()=>void;onUploaded:()=>void}) {
  const {uploadsAvailable}=useSession();
  const dialog=useRef<HTMLDialogElement>(null);
  const [items,setItems]=useState<QueueItem[]>([]);
  const [dragging,setDragging]=useState(false);
  const uploadedAny=useRef(false);

  useEffect(()=>{const element=dialog.current;if(element&&!element.open)element.showModal();},[]);

  function addFiles(files:FileList|File[]) {
    const additions:QueueItem[]=[...files].map(file=>({id:nextId(),file,status:'queued' as Status,error:'',progress:0}));
    setItems(current=>[...current,...additions]);
    additions.forEach(item=>void run(item.id,item.file,false));
  }

  async function run(id:string,file:File,allowDuplicate:boolean) {
    if(file.size>MAX_BYTES){setItems(current=>current.map(item=>item.id===id?{...item,status:'error',error:'The maximum file size is 100 MB.'}:item));return;}
    setItems(current=>current.map(item=>item.id===id?{...item,status:'uploading',error:'',progress:0}:item));
    try {
      const result=await uploadFile(file,allowDuplicate,pct=>setItems(current=>current.map(item=>item.id===id?{...item,progress:pct}:item)));
      if('duplicate' in result)setItems(current=>current.map(item=>item.id===id?{...item,status:'duplicate',existingId:result.existingId,existingFilename:result.existingFilename}:item));
      else {uploadedAny.current=true;setItems(current=>current.map(item=>item.id===id?{...item,status:'done',resultId:result.id}:item));}
    } catch(error) {
      setItems(current=>current.map(item=>item.id===id?{...item,status:'error',error:(error as Error).message}:item));
    }
  }

  const remove=(id:string)=>setItems(current=>current.filter(item=>item.id!==id));
  const retry=(id:string)=>{const item=items.find(entry=>entry.id===id);if(item)void run(id,item.file,false);};
  const uploadAnyway=(id:string)=>{const item=items.find(entry=>entry.id===id);if(item)void run(id,item.file,true);};
  const busy=items.some(item=>item.status==='uploading');

  function close() {
    if(uploadedAny.current)onUploaded();else onClose();
  }

  return <dialog ref={dialog} className="media-upload-dialog" aria-labelledby="media-upload-title" onCancel={event=>{event.preventDefault();if(!busy)close();}}>
    <div className="media-upload-head">
      <h2 id="media-upload-title">Upload Media</h2>
      <button type="button" className="text-button" onClick={close} aria-label="Close" disabled={busy}><X size={18} aria-hidden="true"/></button>
    </div>
    <label className={`media-dropzone ${dragging?'is-dragging':''}`}
      onDragOver={e=>{e.preventDefault();if(uploadsAvailable)setDragging(true);}}
      onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}}
      onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files.length)addFiles(e.dataTransfer.files);}}>
      <Upload size={26} aria-hidden="true"/>
      <span>Drop files here, or browse<small>Images, video, PDF, DOC(X), PPT(X), ZIP · Up to 100 MB each</small></span>
      <input type="file" multiple accept={ACCEPT} disabled={!uploadsAvailable} onChange={e=>{if(e.currentTarget.files?.length)addFiles(e.currentTarget.files);e.currentTarget.value='';}}/>
    </label>
    {!uploadsAvailable&&<p className="muted">Uploads are currently unavailable. Please refresh and try again.</p>}
    {items.length>0&&<ul className="media-upload-queue">
      {items.map(item=><li key={item.id} className={`media-upload-row status-${item.status}`}>
        <span className="media-upload-name">{item.file.name}</span>
        {item.status==='uploading'&&<progress value={item.progress} max={100}/>}
        {item.status==='done'&&<span className="media-upload-status good"><CheckCircle2 size={15} aria-hidden="true"/> Uploaded</span>}
        {item.status==='error'&&<span className="media-upload-status bad"><AlertCircle size={15} aria-hidden="true"/> {item.error}</span>}
        {item.status==='duplicate'&&<span className="media-upload-status warn"><AlertCircle size={15} aria-hidden="true"/> Already exists as &ldquo;{item.existingFilename}&rdquo;</span>}
        <span className="media-upload-row-actions">
          {item.status==='error'&&<button type="button" className="text-button" onClick={()=>retry(item.id)}><RotateCcw size={13} aria-hidden="true"/> Retry</button>}
          {item.status==='duplicate'&&<button type="button" className="text-button" onClick={()=>uploadAnyway(item.id)}>Upload anyway</button>}
          {item.status!=='uploading'&&<button type="button" className="text-button" onClick={()=>remove(item.id)}>Remove</button>}
        </span>
      </li>)}
    </ul>}
    <div className="media-upload-actions">
      <button type="button" className="button blue" disabled={busy} onClick={close}>{busy?'Uploading…':'Done'}</button>
    </div>
  </dialog>;
}
