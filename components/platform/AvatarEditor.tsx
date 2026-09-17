'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Check, FlipHorizontal2, FlipVertical2, LoaderCircle, Move, RotateCcw, RotateCw, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Notice } from './shared';
import './profile-studio.css';

const OUTPUT_SIZE = 720, SOURCE_LIMIT = 2048, MAX_ZOOM = 4;
type Aspect = { ratio:number; label:string };
type Edit = { zoom:number; turns:number; straighten:number; flipX:boolean; flipY:boolean; x:number; y:number; look:string; brightness:number; contrast:number; saturation:number };
const fresh:Edit = { zoom:1, turns:0, straighten:0, flipX:false, flipY:false, x:0, y:0, look:'original', brightness:100, contrast:100, saturation:100 };
const looks = [
  { id:'original', label:'Original', filter:'' },
  { id:'vivid', label:'Vivid', filter:'saturate(1.35) contrast(1.08)' },
  { id:'mono', label:'Mono', filter:'grayscale(1) contrast(1.06)' },
  { id:'warm', label:'Warm', filter:'sepia(0.28) saturate(1.2) hue-rotate(-10deg)' },
  { id:'cool', label:'Cool', filter:'hue-rotate(14deg) saturate(1.05) brightness(1.03)' },
  { id:'fade', label:'Fade', filter:'contrast(0.86) brightness(1.08) saturate(0.78)' },
];

const filterOf = (edit:Edit) => [looks.find(look => look.id===edit.look)?.filter, edit.brightness!==100 && `brightness(${edit.brightness}%)`, edit.contrast!==100 && `contrast(${edit.contrast}%)`, edit.saturation!==100 && `saturate(${edit.saturation}%)`].filter(Boolean).join(' ') || 'none';
const zoomLimit = (zoom:number) => Math.round(Math.min(MAX_ZOOM, Math.max(1, zoom))*100)/100;
const radians = (edit:Edit) => (edit.turns*90 + edit.straighten) * Math.PI/180;
// Everything below works in "frame-width" units: the crop frame is 1 unit wide and 1/frameRatio units tall, and
// edit.x/edit.y (pan) are already stored in these units — see the pointer handler, which divides both axes by the
// same on-screen frame width. The frame's own corners, rotated into the image's local (unrotated) axes, give its
// half-extent there; the image covers the frame exactly when that half-extent fits the image's half-size.
function frameHalfExtent(t:number, frameRatio:number) {
  const cos = Math.abs(Math.cos(t)), sin = Math.abs(Math.sin(t)), frameHalfHeight = 1/(2*frameRatio);
  return { x:cos*0.5 + sin*frameHalfHeight, y:sin*0.5 + cos*frameHalfHeight };
}
function cover(edit:Edit, width:number, height:number, frameRatio:number) {
  const half = frameHalfExtent(radians(edit), frameRatio);
  // scale converts the source image's own pixels into frame-width units.
  const scale = Math.max(half.x*2/width, half.y*2/height) * edit.zoom;
  return { scale, imageWidth:width*scale, imageHeight:height*scale };
}
// The crop frame stays filled exactly when its own bounding box, measured in the image's local axes, fits inside
// the (unrotated) image — clamped by moving the frame's center in that same local space, then rotating back.
function keepCovered(edit:Edit, width:number, height:number, frameRatio:number):Edit {
  const t = radians(edit), cos = Math.cos(t), sin = Math.sin(t);
  const { imageWidth, imageHeight } = cover(edit, width, height, frameRatio);
  const half = frameHalfExtent(t, frameRatio);
  const limitX = Math.max(0, imageWidth/2 - half.x), limitY = Math.max(0, imageHeight/2 - half.y);
  // Frame center in image-local space is R(-t) · (-pan); clamp it, then invert back to a pan.
  const localX = -cos*edit.x - sin*edit.y, localY = sin*edit.x - cos*edit.y;
  const clampedX = Math.min(limitX, Math.max(-limitX, localX)), clampedY = Math.min(limitY, Math.max(-limitY, localY));
  return { ...edit, x:-(cos*clampedX - sin*clampedY), y:-(sin*clampedX + cos*clampedY) };
}
function paint(canvas:HTMLCanvasElement, source:HTMLCanvasElement, edit:Edit, filters:boolean) {
  const w = canvas.width, h = canvas.height, frameRatio = w/h, ctx = canvas.getContext('2d')!;
  const { imageWidth, imageHeight } = cover(edit, source.width, source.height, frameRatio);
  const width = imageWidth*w, height = imageHeight*w;
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.translate(w/2 + edit.x*w, h/2 + edit.y*w);
  ctx.rotate(radians(edit));
  ctx.scale(edit.flipX ? -1 : 1, edit.flipY ? -1 : 1);
  if (filters) ctx.filter = filterOf(edit);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, -width/2, -height/2, width, height);
  ctx.restore();
}
const toBlob = (canvas:HTMLCanvasElement, type:string, quality?:number) => new Promise<Blob|null>(resolve => canvas.toBlob(resolve, type, quality));

function Swatch({ source, filter }:{ source:HTMLCanvasElement; filter:string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!, side = Math.min(source.width, source.height);
    ctx.filter = filter || 'none';
    ctx.drawImage(source, (source.width-side)/2, (source.height-side)/2, side, side, 0, 0, canvas.width, canvas.height);
  }, [source, filter]);
  return <canvas ref={ref} width={96} height={96} aria-hidden="true"/>;
}

function Slider({ label, value, min, max, step=1, format, onChange }:{ label:string; value:number; min:number; max:number; step?:number; format:(value:number)=>string; onChange:(value:number)=>void }) {
  return <label className="avatar-slider"><span>{label}</span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} style={{ '--fill':`${(value-min)/(max-min)*100}%` } as CSSProperties} onChange={event => onChange(Number(event.target.value))}/>
    <output>{format(value)}</output>
  </label>;
}

const SQUARE:Aspect = { ratio:1, label:'square' };

export default function AvatarEditor({ source, busy, error, aspect=SQUARE, title='Frame your photo', eyebrow='PROFILE PHOTO', onCancel, onSave }:{ source:Blob|string; busy:boolean; error:string; aspect?:Aspect; title?:string; eyebrow?:string; onCancel:()=>void; onSave:(photo:Blob)=>void }) {
  const dialog = useRef<HTMLDialogElement>(null), stage = useRef<HTMLDivElement>(null), preview = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number,{ x:number; y:number }>()), pinch = useRef<{ distance:number; zoom:number }|null>(null);
  const [image,setImage] = useState<HTMLCanvasElement|null>(null), [problem,setProblem] = useState(''), [edit,setEdit] = useState(fresh), [dragging,setDragging] = useState(false), [preparing,setPreparing] = useState(false);
  const [filters] = useState(() => 'filter' in (document.createElement('canvas').getContext('2d') ?? {}));
  const update = useCallback((change:(edit:Edit)=>Edit) => setEdit(current => image ? keepCovered(change(current), image.width, image.height, aspect.ratio) : change(current)), [image, aspect.ratio]);
  const outputWidth = OUTPUT_SIZE, outputHeight = Math.round(OUTPUT_SIZE/aspect.ratio);

  useEffect(() => { const element = dialog.current; if (element && !element.open) element.showModal(); }, []);
  useEffect(() => {
    let active = true;
    const url = typeof source==='string' ? source : URL.createObjectURL(source), img = new Image();
    // Drawing through an <img> applies the photo's EXIF orientation, so phone pictures arrive upright.
    img.onload = () => {
      if (!active) return;
      const ratio = Math.min(1, SOURCE_LIMIT/Math.max(img.naturalWidth, img.naturalHeight)), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth*ratio)); canvas.height = Math.max(1, Math.round(img.naturalHeight*ratio));
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      setImage(canvas); setEdit(fresh);
    };
    img.onerror = () => { if (active) setProblem('This image could not be opened. Try a PNG, JPEG, or WebP photo.'); };
    img.src = url;
    return () => { active = false; if (typeof source!=='string') URL.revokeObjectURL(url); };
  }, [source]);
  useEffect(() => { if (preview.current && image) paint(preview.current, image, edit, filters); }, [edit, image, filters]);
  useEffect(() => {
    const element = stage.current; if (!element) return;
    const wheel = (event:WheelEvent) => { event.preventDefault(); update(current => ({ ...current, zoom:zoomLimit(current.zoom*Math.exp(-event.deltaY*0.0015)) })); };
    element.addEventListener('wheel', wheel, { passive:false });
    return () => element.removeEventListener('wheel', wheel);
  }, [update]);

  const down = (event:PointerEvent<HTMLDivElement>) => {
    if (!image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x:event.clientX, y:event.clientY });
    setDragging(true);
    if (pointers.current.size===2) { const [a,b] = [...pointers.current.values()]; pinch.current = { distance:Math.hypot(a.x-b.x, a.y-b.y) || 1, zoom:edit.zoom }; }
  };
  const move = (event:PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId); if (!previous) return;
    pointers.current.set(event.pointerId, { x:event.clientX, y:event.clientY });
    if (pointers.current.size>=2 && pinch.current) {
      const [a,b] = [...pointers.current.values()], zoom = zoomLimit(pinch.current.zoom * Math.hypot(a.x-b.x, a.y-b.y)/pinch.current.distance);
      return update(current => ({ ...current, zoom }));
    }
    const width = event.currentTarget.getBoundingClientRect().width || 1, dx = (event.clientX-previous.x)/width, dy = (event.clientY-previous.y)/width;
    update(current => ({ ...current, x:current.x+dx, y:current.y+dy }));
  };
  const up = (event:PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size<2) pinch.current = null;
    if (!pointers.current.size) setDragging(false);
  };
  const key = (event:KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.08 : 0.02;
    const moves:Record<string,[number,number]> = { ArrowLeft:[-step,0], ArrowRight:[step,0], ArrowUp:[0,-step], ArrowDown:[0,step] };
    if (moves[event.key]) { event.preventDefault(); const [dx,dy] = moves[event.key]; update(current => ({ ...current, x:current.x+dx, y:current.y+dy })); }
    else if (event.key==='+' || event.key==='=') { event.preventDefault(); update(current => ({ ...current, zoom:zoomLimit(current.zoom+0.1) })); }
    else if (event.key==='-' || event.key==='_') { event.preventDefault(); update(current => ({ ...current, zoom:zoomLimit(current.zoom-0.1) })); }
  };
  const rotate = (turn:1|-1) => update(current => ({ ...current, turns:(current.turns+turn+4)%4 }));
  // Mirroring the whole frame reverses the rotation and the pan along that axis, so flips always act on screen directions.
  const flip = (axis:'x'|'y') => update(current => ({ ...current, turns:(4-current.turns)%4, straighten:-current.straighten, flipX:axis==='x' ? !current.flipX : current.flipX, flipY:axis==='y' ? !current.flipY : current.flipY, x:axis==='x' ? -current.x : current.x, y:axis==='y' ? -current.y : current.y }));
  const save = async () => {
    if (!image) return;
    setPreparing(true); setProblem('');
    try {
      const canvas = document.createElement('canvas'); canvas.width = outputWidth; canvas.height = outputHeight;
      paint(canvas, image, edit, filters);
      const webp = await toBlob(canvas, 'image/webp', 0.92);
      const photo = webp?.type==='image/webp' ? webp : await toBlob(canvas, 'image/png');
      if (!photo) throw new Error('Your browser could not prepare this photo. Try another image.');
      onSave(photo);
    } catch (e) { setProblem((e as Error).message); } finally { setPreparing(false); }
  };
  const working = busy || preparing;

  return <dialog ref={dialog} className="avatar-editor" aria-labelledby="avatar-editor-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <header className="avatar-editor-head">
      <div><span className="eyebrow">{eyebrow}</span><h2 id="avatar-editor-title">{title}</h2><p>Crop, straighten, and give it a look. It saves as a crisp {aspect.label}.</p></div>
      <button type="button" className="avatar-icon-button" aria-label="Close photo editor" disabled={busy} onClick={onCancel}><X size={18}/></button>
    </header>
    <div className="avatar-editor-body">
      <div className="avatar-stage-wrap">
        <div ref={stage} className={`avatar-stage${dragging?' dragging':''}${aspect.ratio!==1?' avatar-stage-rect':''}`} style={{ aspectRatio:aspect.ratio }} tabIndex={0} role="group" aria-label="Crop area. Drag to reposition, use the arrow keys to move and plus or minus to zoom."
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
          <canvas ref={preview} width={outputWidth} height={outputHeight} aria-hidden="true"/>
          <span className="avatar-stage-grid" aria-hidden="true"/>
          <span className="avatar-stage-mask" aria-hidden="true"/>
          {!image && !problem && <span className="avatar-stage-status"><LoaderCircle size={18} className="profile-spin"/> Opening your photo…</span>}
        </div>
        <p className="avatar-stage-caption"><Move size={14}/> Drag to reposition · scroll or pinch to zoom</p>
      </div>
      <div className="avatar-controls">
        <section className="avatar-group">
          <h3>Crop</h3>
          <div className="avatar-zoom">
            <button type="button" className="avatar-icon-button" aria-label="Zoom out" onClick={() => update(current => ({ ...current, zoom:zoomLimit(current.zoom-0.25) }))}><ZoomOut size={16}/></button>
            <Slider label="Zoom" value={edit.zoom} min={1} max={MAX_ZOOM} step={0.01} format={value => `${value.toFixed(1)}×`} onChange={zoom => update(current => ({ ...current, zoom }))}/>
            <button type="button" className="avatar-icon-button" aria-label="Zoom in" onClick={() => update(current => ({ ...current, zoom:zoomLimit(current.zoom+0.25) }))}><ZoomIn size={16}/></button>
          </div>
          <Slider label="Straighten" value={edit.straighten} min={-45} max={45} format={value => `${value>0?'+':''}${value}°`} onChange={straighten => update(current => ({ ...current, straighten }))}/>
          <div className="avatar-tools">
            <button type="button" className="avatar-tool" onClick={() => rotate(-1)}><RotateCcw size={18}/>Rotate left</button>
            <button type="button" className="avatar-tool" onClick={() => rotate(1)}><RotateCw size={18}/>Rotate right</button>
            <button type="button" className="avatar-tool" aria-pressed={edit.flipX} onClick={() => flip('x')}><FlipHorizontal2 size={18}/>Flip horizontal</button>
            <button type="button" className="avatar-tool" aria-pressed={edit.flipY} onClick={() => flip('y')}><FlipVertical2 size={18}/>Flip vertical</button>
          </div>
        </section>
        {filters && <section className="avatar-group">
          <h3>Look</h3>
          <div className="avatar-looks" role="group" aria-label="Photo looks">
            {looks.map(look => <button key={look.id} type="button" className="avatar-look" aria-pressed={edit.look===look.id} onClick={() => setEdit(current => ({ ...current, look:look.id }))}>
              {image ? <Swatch source={image} filter={look.filter}/> : <span className="avatar-look-empty"/>}<span>{look.label}</span>
            </button>)}
          </div>
          <Slider label="Brightness" value={edit.brightness} min={50} max={150} format={value => `${value}%`} onChange={brightness => setEdit(current => ({ ...current, brightness }))}/>
          <Slider label="Contrast" value={edit.contrast} min={50} max={150} format={value => `${value}%`} onChange={contrast => setEdit(current => ({ ...current, contrast }))}/>
          <Slider label="Saturation" value={edit.saturation} min={0} max={200} format={value => `${value}%`} onChange={saturation => setEdit(current => ({ ...current, saturation }))}/>
        </section>}
      </div>
    </div>
    <footer className="avatar-editor-foot">
      {(error || problem) && <Notice error>{error || problem}</Notice>}
      <button type="button" className="text-button" disabled={working || !image} onClick={() => setEdit(fresh)}><Undo2 size={15}/> Reset</button>
      <span className="avatar-editor-spacer"/>
      <button type="button" className="button outline" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="button blue" disabled={working || !image} onClick={() => void save()}>{working ? <><LoaderCircle size={16} className="profile-spin"/> Saving…</> : <><Check size={16}/> Save photo</>}</button>
    </footer>
  </dialog>;
}
