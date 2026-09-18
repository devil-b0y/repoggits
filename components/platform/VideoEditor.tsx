'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, LoaderCircle, RotateCcw, RotateCw, Undo2, X } from 'lucide-react';
import { Notice } from './shared';
import { clampVideoPlayback, videoStageStyle, videoTransformStyle, type VideoRotation } from '@/lib/video-playback';
import './profile-studio.css';
import './video-field.css';

const nextRotation:Record<VideoRotation,VideoRotation> = {0:90,90:180,180:270,270:0};
const previousRotation:Record<VideoRotation,VideoRotation> = {0:270,270:180,180:90,90:0};

function Slider({ label, value, min, max, step=1, disabled=false, format, onChange }:{ label:string; value:number; min:number; max:number; step?:number; disabled?:boolean; format:(value:number)=>string; onChange:(value:number)=>void }) {
  return <label className="avatar-slider"><span>{label}</span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} style={{ '--fill':`${max>min ? (value-min)/(max-min)*100 : 0}%` } as CSSProperties} onChange={event => onChange(Number(event.target.value))}/>
    <output>{format(value)}</output>
  </label>;
}

export type VideoEdit = { rotation:VideoRotation; trimStart:number; trimEnd:number };

export default function VideoEditor({ source, rotation:initialRotation, trimStart:initialStart, trimEnd:initialEnd, busy, error, onCancel, onSave }:{ source:string; rotation:VideoRotation; trimStart:number; trimEnd:number; busy:boolean; error:string; onCancel:()=>void; onSave:(edit:VideoEdit)=>void }) {
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null);
  const [rotation,setRotation] = useState<VideoRotation>(initialRotation);
  const [naturalRatio,setNaturalRatio] = useState(16/9);
  const [duration,setDuration] = useState(0);
  const [start,setStart] = useState(Math.max(0,initialStart));
  const [end,setEnd] = useState(Math.max(0,initialEnd));
  const [problem,setProblem] = useState('');
  const [preparing,setPreparing] = useState(false);

  useEffect(() => { const element = dialog.current; if (element && !element.open) element.showModal(); }, []);
  // The same clamping the published page uses, so scrubbing here previews exactly what publishing will play.
  useEffect(() => { const element = video.current; if (!element) return; return clampVideoPlayback(element, start, end); }, [start, end]);

  function onLoadedMetadata() {
    const element = video.current; if (!element) return;
    const total = Number.isFinite(element.duration) ? element.duration : 0;
    setDuration(total);
    if (element.videoWidth && element.videoHeight) setNaturalRatio(element.videoWidth/element.videoHeight);
    setEnd(current => current>0 && current<=total ? current : total);
    setStart(current => Math.min(current, Math.max(0, total-0.1)));
  }

  const rotate = (turn:1|-1) => setRotation(current => turn===1 ? nextRotation[current] : previousRotation[current]);
  const reset = () => { setRotation(0); setStart(0); setEnd(0); };
  const swapped = rotation===90 || rotation===270;
  const stageRatio = swapped ? 1/naturalRatio : naturalRatio;
  const effectiveEnd = end>0 ? end : duration;

  const save = () => {
    setPreparing(true); setProblem('');
    try {
      if (end>0 && end<=start) throw new Error('The end must come after the start.');
      const trimStart = Math.round(start*100)/100;
      const rounded = Math.round(effectiveEnd*100)/100;
      // Storing 0 when the range still covers the whole clip keeps the "play to natural end" sentinel intact,
      // instead of baking in a duration that a re-encode or metadata quirk could later disagree with.
      const trimEnd = duration && rounded>=Math.round(duration*100)/100 ? 0 : rounded;
      onSave({ rotation, trimStart, trimEnd });
    } catch (e) { setProblem((e as Error).message); } finally { setPreparing(false); }
  };
  const working = busy || preparing;

  return <dialog ref={dialog} className="avatar-editor video-editor" aria-labelledby="video-editor-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <header className="avatar-editor-head">
      <div><span className="eyebrow">DEMO VIDEO</span><h2 id="video-editor-title">Trim and rotate</h2><p>The preview below plays only the trimmed range and rotates the same way it will after publishing.</p></div>
      <button type="button" className="avatar-icon-button" aria-label="Close video editor" disabled={busy} onClick={onCancel}><X size={18}/></button>
    </header>
    <div className="avatar-editor-body">
      <div className="video-editor-stage-wrap">
        <div className="video-editor-stage" style={{ aspectRatio:stageRatio, ...videoStageStyle() }}>
          <video ref={video} src={source} style={videoTransformStyle(rotation)} muted playsInline controls preload="metadata" onLoadedMetadata={onLoadedMetadata} aria-label="Video preview"/>
        </div>
        <p className="avatar-stage-caption">Plays {start.toFixed(1)}s–{effectiveEnd.toFixed(1)}s of {duration.toFixed(1)}s, rotated {rotation}°</p>
      </div>
      <div className="avatar-controls">
        <section className="avatar-group">
          <h3>Rotate</h3>
          <div className="avatar-tools">
            <button type="button" className="avatar-tool" onClick={() => rotate(-1)}><RotateCcw size={18}/>Rotate left</button>
            <button type="button" className="avatar-tool" onClick={() => rotate(1)}><RotateCw size={18}/>Rotate right</button>
          </div>
        </section>
        <section className="avatar-group">
          <h3>Trim</h3>
          <Slider label="Start" value={start} min={0} max={Math.max(duration,0)} step={0.1} disabled={!duration} format={value => `${value.toFixed(1)}s`} onChange={value => setStart(Math.min(value, (end>0?end:duration)-0.1))}/>
          <Slider label="End" value={effectiveEnd} min={0} max={Math.max(duration,0)} step={0.1} disabled={!duration} format={value => `${value.toFixed(1)}s`} onChange={value => setEnd(Math.max(value, start+0.1))}/>
        </section>
      </div>
    </div>
    <footer className="avatar-editor-foot">
      {(error || problem) && <Notice error>{error || problem}</Notice>}
      <button type="button" className="text-button" disabled={working} onClick={reset}><Undo2 size={15}/> Reset</button>
      <span className="avatar-editor-spacer"/>
      <button type="button" className="button outline" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="button blue" disabled={working} onClick={save}>{working ? <><LoaderCircle size={16} className="profile-spin"/> Saving…</> : <><Check size={16}/> Save video</>}</button>
    </footer>
  </dialog>;
}
