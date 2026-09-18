'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {AlertTriangle,Check,Copy,Download,ExternalLink,RotateCcw,Trash2,Upload,X} from 'lucide-react';
import {Notice,send,useData} from '../shared';
import type {MediaDetail} from '@/lib/admin/media';
import {Badge,DetailList} from './kit';
import {formatBytes,formatDateTime} from './format';

// The media detail modal: large preview, full metadata editing, usage breakdown, copy URL/ID, replace, and the
// used-media delete warning. One dialog handles every media type — the preview area switches on `item.type`.

export default function MediaDetailPanel({id,onClose,onChanged}:{id:string;onClose:()=>void;onChanged:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const {data,error,loading,reload,setData}=useData<MediaDetail>(`admin/media/${id}`);
  const [copied,setCopied]=useState<'url'|'id'|null>(null);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [draft,setDraft]=useState({displayName:'',altText:'',caption:'',description:'',tags:''});
  const [replacing,setReplacing]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [confirmPurge,setConfirmPurge]=useState(false);

  useEffect(()=>{const element=dialog.current;if(element&&!element.open)element.showModal();},[]);
  useEffect(()=>{
    if(data)setDraft({displayName:data.displayName,altText:data.altText,caption:data.caption,description:data.description,tags:data.tags.join(', ')});
  },[data]);

  function close() {
    onClose();
  }
  async function copy(kind:'url'|'id',value:string) {
    try{await navigator.clipboard.writeText(value);setCopied(kind);setTimeout(()=>setCopied(null),2000);}catch{}
  }
  async function saveMetadata() {
    setSaving(true);setSaveError('');
    try {
      const updated=await send<MediaDetail>(`admin/media/${id}`,{
        displayName:draft.displayName,altText:draft.altText,caption:draft.caption,description:draft.description,
        tags:draft.tags.split(',').map(tag=>tag.trim()).filter(Boolean),
      },'PATCH');
      setData(updated);onChanged();
    } catch(e){setSaveError((e as Error).message);}
    finally{setSaving(false);}
  }
  async function performAction(action:'trash'|'restore'|'purge',force=false) {
    setSaving(true);setSaveError('');
    try {
      if(action==='purge'){await send(`admin/media/${id}/action`,{action,force},'POST');onChanged();close();return;}
      const updated=await send<MediaDetail>(`admin/media/${id}/action`,{action,force},'POST');
      setData(updated);onChanged();setConfirmDelete(false);
    } catch(e){
      const message=(e as Error).message;
      if(action==='trash'&&!force&&/used in/i.test(message)){setSaveError(message);setConfirmDelete(true);}
      else setSaveError(message);
    } finally{setSaving(false);}
  }

  if(loading)return <dialog ref={dialog} className="media-detail-dialog" aria-label="Loading media"><p role="status">Loading…</p></dialog>;
  if(error||!data)return <dialog ref={dialog} className="media-detail-dialog" aria-label="Media error" onCancel={close}><Notice error>{error||'Media not found.'}</Notice><button type="button" className="button outline" onClick={close}>Close</button></dialog>;

  const url=typeof window!=='undefined'?`${window.location.origin}${data.url}`:data.url;
  const trashed=!!data.deletedAt;
  const usageTotal=data.usage.entries.length+data.usage.avatarOf.length;

  return <dialog ref={dialog} className="media-detail-dialog" aria-labelledby="media-detail-title" onCancel={event=>{event.preventDefault();close();}}>
    <div className="media-detail-head">
      <h2 id="media-detail-title">{data.displayName}</h2>
      <button type="button" className="text-button" onClick={close} aria-label="Close"><X size={18} aria-hidden="true"/></button>
    </div>
    {trashed&&<Notice error>This file is in the trash{data.deletedAt?` (deleted ${formatDateTime(data.deletedAt)})`:''}.</Notice>}
    <div className="media-detail-body">
      <div className="media-detail-preview">
        {data.type==='image'&&<img src={data.url} alt={data.altText||data.displayName}/>}
        {data.type==='video'&&<video src={data.url} controls preload="none"/>}
        {data.type==='document'&&<div className="media-doc-preview"><a className="button outline" href={data.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true"/> Open in new tab</a></div>}
        {data.type==='archive'&&<div className="media-doc-preview"><span className="muted">Source archive — preview not available.</span></div>}
      </div>
      <div className="media-detail-info">
        <DetailList items={[
          ['File name',data.filename],['MIME type',data.mime],['Size',formatBytes(data.size)],
          ...(data.width?[['Dimensions',`${data.width}×${data.height}px`]] as [string,string][]:[]),
          ...(data.pageCount?[['Pages',String(data.pageCount)]] as [string,string][]:[]),
          ['Uploaded',formatDateTime(data.createdAt)],['Uploaded by',data.uploadedBy?.name??'Unknown'],
          ['Folder',data.folder?.name??'—'],['Media ID',data.id],
        ]}/>
        <div className="media-detail-actions">
          <button type="button" className="button outline" onClick={()=>copy('url',url)}>{copied==='url'?<Check size={14} aria-hidden="true"/>:<Copy size={14} aria-hidden="true"/>} {copied==='url'?'Copied':'Copy URL'}</button>
          <button type="button" className="button outline" onClick={()=>copy('id',data.id)}>{copied==='id'?<Check size={14} aria-hidden="true"/>:<Copy size={14} aria-hidden="true"/>} {copied==='id'?'Copied':'Copy Media ID'}</button>
          <a className="button outline" href={data.url} download><Download size={14} aria-hidden="true"/> Download</a>
        </div>

        <h3>Usage {usageTotal?`(used in ${usageTotal} location${usageTotal===1?'':'s'})`:'(unused)'}</h3>
        {usageTotal===0&&<p className="muted">Not currently used anywhere.</p>}
        {data.usage.entries.length>0&&<ul className="media-usage-list">
          {data.usage.entries.map((entry,index)=><li key={index}><Link className="inline-link" href={`/projects/${entry.projectId}`}>{entry.title}</Link> <span className="muted">— {entry.role}, v{entry.status}</span></li>)}
        </ul>}
        {data.usage.avatarOf.map(name=><p key={name} className="muted">Profile photo for {name}</p>)}

        <h3>Metadata</h3>
        <label>Display name<input value={draft.displayName} onChange={e=>setDraft({...draft,displayName:e.target.value})} maxLength={200}/></label>
        <label>Alt text<input value={draft.altText} onChange={e=>setDraft({...draft,altText:e.target.value})} maxLength={500}/></label>
        <label>Caption<input value={draft.caption} onChange={e=>setDraft({...draft,caption:e.target.value})} maxLength={500}/></label>
        <label>Description<textarea value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} maxLength={4000} rows={3}/></label>
        <label>Tags (comma separated)<input value={draft.tags} onChange={e=>setDraft({...draft,tags:e.target.value})}/></label>
        {data.tags.length>0&&<div className="media-tag-chips">{data.tags.map(tag=><Badge key={tag} tone="neutral">{tag}</Badge>)}</div>}
        {saveError&&<Notice error>{saveError}</Notice>}
        <div className="media-detail-actions">
          <button type="button" className="button blue" disabled={saving||trashed} onClick={saveMetadata}>{saving?'Saving…':'Save metadata'}</button>
          <button type="button" className="button outline" disabled={saving||trashed} onClick={()=>setReplacing(true)}><Upload size={14} aria-hidden="true"/> Replace file</button>
          {!trashed&&!confirmDelete&&<button type="button" className="button outline bad" disabled={saving} onClick={()=>performAction('trash')}><Trash2 size={14} aria-hidden="true"/> Move to trash</button>}
          {trashed&&<button type="button" className="button outline" disabled={saving} onClick={()=>performAction('restore')}><RotateCcw size={14} aria-hidden="true"/> Restore</button>}
          {trashed&&!confirmPurge&&<button type="button" className="button outline bad" disabled={saving} onClick={()=>setConfirmPurge(true)}><Trash2 size={14} aria-hidden="true"/> Delete permanently</button>}
        </div>
        {confirmDelete&&<div className="media-confirm-block">
          <p><AlertTriangle size={15} aria-hidden="true"/> This media is currently used in {usageTotal} location{usageTotal===1?'':'s'}. Deleting it may cause broken images or files.</p>
          <div className="media-detail-actions">
            <button type="button" className="button outline" onClick={()=>{setConfirmDelete(false);setSaveError('');}}>Cancel</button>
            <button type="button" className="button outline" onClick={()=>setReplacing(true)}>Replace media instead</button>
            <button type="button" className="button outline bad" disabled={saving} onClick={()=>performAction('trash',true)}>Delete anyway</button>
          </div>
        </div>}
        {confirmPurge&&<div className="media-confirm-block">
          <p><AlertTriangle size={15} aria-hidden="true"/> Permanent deletion cannot be undone. Are you sure?</p>
          <div className="media-detail-actions">
            <button type="button" className="button outline" onClick={()=>setConfirmPurge(false)}>Cancel</button>
            <button type="button" className="button outline bad" disabled={saving} onClick={()=>performAction('purge')}>Delete permanently</button>
          </div>
        </div>}
      </div>
    </div>
    {replacing&&<ReplaceMediaFlow id={id} currentType={data.type} onClose={()=>setReplacing(false)} onReplaced={()=>{setReplacing(false);void reload();onChanged();}}/>}
  </dialog>;
}

function ReplaceMediaFlow({id,currentType,onClose,onReplaced}:{id:string;currentType:string;onClose:()=>void;onReplaced:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function handleFile(file:File) {
    setBusy(true);setError('');
    try {
      const body=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Filename':file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),'X-Allow-Duplicate':'true'},body:file});
      const result=await body.json();
      if(!body.ok||result.duplicate){setError(result.error||'That file already exists in Media Manager.');return;}
      await send(`admin/media/${id}/action`,{action:'replace',newFileId:result.id},'POST');
      onReplaced();
    } catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  return <div className="media-replace-panel panel">
    <h3>Replace file</h3>
    <p className="muted">Upload a new {currentType} to replace this one. Its Media ID and every existing reference stay the same.</p>
    <input type="file" disabled={busy} onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void handleFile(file);e.currentTarget.value='';}}/>
    {error&&<Notice error>{error}</Notice>}
    <div className="media-detail-actions"><button type="button" className="text-button" disabled={busy} onClick={onClose}>Cancel</button></div>
  </div>;
}
