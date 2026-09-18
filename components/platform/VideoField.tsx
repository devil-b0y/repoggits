'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Upload, Video, Pencil } from 'lucide-react';
import { api, Notice, useSession } from './shared';
import type { ProjectData } from '@/lib/schema';
import type { VideoEdit } from './VideoEditor';
import './video-field.css';

// The editor is only needed once a video is attached, so its code (and the trim/rotate preview logic) is
// fetched then, the same way FilePicker defers AvatarEditor.
const VideoEditor = dynamic(() => import('./VideoEditor'));

const MAX_VIDEO_UPLOAD = 100 * 1024 * 1024;

export default function VideoField({data,onChange}:{data:ProjectData;onChange:(patch:Partial<ProjectData>)=>void}) {
  const {uploadsAvailable} = useSession();
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [dragging,setDragging] = useState(false);
  const [editing,setEditing] = useState(false), [editError,setEditError] = useState('');

  async function upload(file:File) {
    if (busy || !uploadsAvailable) return;
    setError('');
    if (file.size>MAX_VIDEO_UPLOAD) return setError('The maximum video size is 100 MB.');
    if (!/\.(mp4|webm)$/i.test(file.name)) return setError('Choose an MP4 or WebM video file.');
    setBusy(true);
    try {
      const result = await api<{id:string}>('upload',{method:'POST',body:file,headers:{'Content-Type':'application/octet-stream','X-Filename':file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}});
      onChange({videoId:result.id, videoRotation:0, videoTrimStart:0, videoTrimEnd:0});
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!busy) return;
    const warn = (event:BeforeUnloadEvent) => { event.preventDefault(); event.returnValue=''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  function saveEdit(edit:VideoEdit) {
    onChange({videoRotation:edit.rotation, videoTrimStart:edit.trimStart, videoTrimEnd:edit.trimEnd});
    setEditing(false); setEditError('');
  }
  function remove() {
    onChange({videoId:'', videoRotation:0, videoTrimStart:0, videoTrimEnd:0});
  }

  return <div className="video-field">
    <label className="tech-video-label"><span><Video size={17}/>Demo video URL</span><input aria-label="Demo video URL" type="url" value={data.videoUrl} onChange={e=>onChange({videoUrl:e.target.value})} placeholder="YouTube link or direct MP4 / WebM URL"/><small>Paste a link, or upload a video file below — an uploaded file is always shown first and can be trimmed and rotated.</small></label>
    <div className={`file-picker video-upload ${dragging?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();if(!busy&&uploadsAvailable)setDragging(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files.length>1){setError('Add one file at a time.');return;}const file=e.dataTransfer.files[0];if(file)void upload(file);}}>
      <label>Or upload a video file<span className="upload-invitation"><Upload size={22}/><span>Drop your demo video here, or browse<small>MP4 or WebM · Up to 100 MB</small></span></span>
        <input type="file" aria-label="Upload demo video" accept=".mp4,.webm,video/mp4,video/webm" disabled={busy||!uploadsAvailable} onChange={async e=>{const input=e.currentTarget,file=input.files?.[0];if(file)await upload(file);input.value='';}}/>
      </label>
      {busy && <p role="status">Checking your video…</p>}
      {!uploadsAvailable && <small>Uploads are currently unavailable. Please refresh and try again.</small>}
      {data.videoId && <div className="uploaded-file video-uploaded-file"><video src={`/api/files/${data.videoId}`} muted playsInline controls preload="metadata" aria-label="Uploaded video preview"/><span className="uploaded-file-actions"><button type="button" disabled={busy} className="text-button" onClick={()=>setEditing(true)}><Pencil size={15}/> Edit video</button><button type="button" disabled={busy} className="text-button" onClick={remove}>Remove</button></span></div>}
      {error && <Notice error>{error}</Notice>}
    </div>
    {editing && data.videoId && <VideoEditor source={`/api/files/${data.videoId}`} rotation={data.videoRotation} trimStart={data.videoTrimStart} trimEnd={data.videoTrimEnd} busy={false} error={editError} onCancel={()=>{setEditing(false);setEditError('');}} onSave={saveEdit}/>}
  </div>;
}
