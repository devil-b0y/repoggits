'use client';
import {useEffect,useRef,useState} from 'react';
import {Search,Upload,X} from 'lucide-react';
import {api,useSession} from '../shared';
import type {Paged} from '@/lib/admin/types';
import type {MediaSummary} from '@/lib/admin/media';
import {DebouncedInput,useAdminData} from './kit';
import {formatBytes} from './format';
import './media.css';

// A reusable picker other admin forms can open to select an already-uploaded file (or upload a new one) without
// pulling in the whole Media Manager page — per the spec's "Insert/Select Media" requirement (project editing,
// galleries, banners, team photos, etc.). MediaPickerButton is the integration point: render it, get an id back.

export function MediaPickerButton({label='Choose media',type,onSelect}:{label?:string;type?:'image'|'video'|'document'|'archive';onSelect:(item:MediaSummary)=>void}) {
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" className="button outline" onClick={()=>setOpen(true)}>{label}</button>
    {open&&<MediaPicker type={type} onClose={()=>setOpen(false)} onSelect={item=>{onSelect(item);setOpen(false);}}/>}
  </>;
}

function MediaPicker({type,onClose,onSelect}:{type?:'image'|'video'|'document'|'archive';onClose:()=>void;onSelect:(item:MediaSummary)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const {uploadsAvailable}=useSession();
  const [q,setQ]=useState('');
  const [uploading,setUploading]=useState(false);
  const [uploadError,setUploadError]=useState('');
  const params=new URLSearchParams({q,...(type?{type}:{}),pageSize:'40'});
  const {data,loading,reload}=useAdminData<Paged<MediaSummary>>(`admin/media?${params}`);
  useEffect(()=>{const element=dialog.current;if(element&&!element.open)element.showModal();},[]);

  async function handleUpload(file:File) {
    setUploading(true);setUploadError('');
    try {
      const response=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Filename':file.name.replace(/[^a-zA-Z0-9._-]/g,'_')},body:file});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Upload failed.');
      const detail=await api<MediaSummary>(`admin/media/${result.id}`).catch(()=>null);
      reload();
      if(detail)onSelect(detail);
    } catch(e){setUploadError((e as Error).message);}
    finally{setUploading(false);}
  }

  return <dialog ref={dialog} className="media-picker-dialog" aria-label="Choose media" onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="media-detail-head">
      <h2>Choose media</h2>
      <button type="button" className="text-button" onClick={onClose} aria-label="Close"><X size={18} aria-hidden="true"/></button>
    </div>
    <div className="media-picker-search"><Search size={15} aria-hidden="true"/><DebouncedInput type="search" value={q} placeholder="Search media" onCommit={setQ}/></div>
    <label className="media-picker-upload">
      <Upload size={14} aria-hidden="true"/> {uploading?'Uploading…':'Upload a new file'}
      <input type="file" disabled={uploading||!uploadsAvailable} onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void handleUpload(file);e.currentTarget.value='';}}/>
    </label>
    {uploadError&&<p className="media-picker-error">{uploadError}</p>}
    <div className="media-picker-grid">
      {loading&&!data&&<p role="status">Loading…</p>}
      {data&&data.items.length===0&&<p className="muted">No media matches your search.</p>}
      {data?.items.map(item=><button type="button" key={item.id} className="media-picker-tile" onClick={()=>onSelect(item)}>
        {item.type==='image'?<img src={`/api/admin/media/${item.id}/content?w=480`} alt=""/>:<span className="media-picker-tile-type">{item.type}</span>}
        <span className="media-picker-tile-name">{item.displayName}</span>
        <span className="media-picker-tile-meta">{formatBytes(item.size)}</span>
      </button>)}
    </div>
  </dialog>;
}
