'use client';
import {useEffect,useRef,useState} from 'react';
import {motion,useReducedMotion} from 'framer-motion';
import {ArrowUpRight,Check,LoaderCircle,Sparkles,X} from 'lucide-react';
import {aiDraftSchema,aiFieldLabels,type AiDraft} from '@/lib/ai-project-draft';
import type {ProjectData} from '@/lib/schema';
import {api,Notice} from './shared';
import './gemini-assistant.css';

type Field=keyof AiDraft['fields'];
const examples=[
 {name:'ESP32 build',text:'We built an ESP32-based smart garden. A soil-moisture sensor reads the soil and a relay switches the water pump. We wrote the firmware in C++ using Arduino IDE. Help me write a clear title, description and feature points. Ask me for any missing team, cost or date details.'},
 {name:'Software project',text:'Our project is a student task planner made with HTML, CSS and JavaScript. Students add tasks with deadlines and priorities, move them across a task board, and search by title. It saves tasks in localStorage. Help me turn this into a project submission.'},
];
function readable(value:unknown):string{
 if(typeof value==='boolean')return value?'Yes':'No';
 if(Array.isArray(value))return value.map((item,i)=>`${i+1}. ${readable(item)}`).join('\n\n');
 if(value&&typeof value==='object')return Object.entries(value).filter(([key,v])=>key!=='photoId'&&v!==''&&v!==undefined&&v!==null).map(([key,v])=>`${key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,s=>s.toUpperCase())}: ${readable(v)}`).join('\n');
 return String(value??'');
}
export default function GeminiProjectAssistant({data,storageKey,onApply}:{data:ProjectData;storageKey:string;onApply:(draft:AiDraft,fields:Field[])=>void}){
 const [prompt,setPrompt]=useState(''),[draft,setDraft]=useState<AiDraft|null>(null),[selected,setSelected]=useState<Field[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[restored,setRestored]=useState(false);
 const request=useRef<AbortController|null>(null),result=useRef<HTMLDivElement>(null),textareaRef=useRef<HTMLTextAreaElement>(null),reduced=useReducedMotion();
 useEffect(()=>{setRestored(false);try{const saved=localStorage.getItem(storageKey);setPrompt(saved&&saved.length<=12000?saved:'');}catch{}setRestored(true);return()=>request.current?.abort();},[storageKey]);
 useEffect(()=>{if(!restored)return;try{if(prompt)localStorage.setItem(storageKey,prompt);else localStorage.removeItem(storageKey);}catch{/* Form recovery has its own status indicator. */}},[prompt,storageKey,restored]);
 useEffect(()=>{const el=textareaRef.current;if(!el)return;el.style.height='auto';const natural=el.scrollHeight;el.style.height=Math.min(natural,320)+'px';el.style.overflowY=natural>320?'auto':'hidden';},[prompt]);
 async function generate(){
  if(busy||prompt.trim().length<20)return;
  setBusy(true);setError('');setMessage('');setDraft(null);
  const controller=new AbortController();request.current=controller;
  try{
   const generated=aiDraftSchema.parse(await api<AiDraft>('ai/project-draft',{method:'POST',body:JSON.stringify({prompt}),signal:controller.signal}));
   if(controller.signal.aborted)return;
   setDraft(generated);setSelected(Object.keys(generated.fields) as Field[]);
   requestAnimationFrame(()=>result.current?.focus());
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(request.current===controller){setBusy(false);request.current=null;}}
 }
 function cancel(){request.current?.abort();setBusy(false);setMessage('Generation cancelled. Your form has not changed.');}
 return <section className="gemini-assistant" aria-labelledby="gemini-title">
  <div className="gemini-heading"><span className="gemini-mark" aria-hidden="true"><Sparkles size={24}/></span><div><span className="gemini-eyebrow">YOUR IDEA, WITH A LITTLE HELP</span><h2 id="gemini-title">Tell Gemini what you built.</h2><p>Rough notes are enough. Turn your idea into a project story you can make your own.</p></div><span className="gemini-badge">GEMINI AI</span></div>
  <label className="gemini-prompt-label" htmlFor="gemini-prompt">Describe your project</label>
  <div className="gemini-composer">
   <textarea ref={textareaRef} id="gemini-prompt" rows={3} maxLength={12000} disabled={busy} value={prompt} onChange={e=>{setPrompt(e.target.value);setMessage('');}} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();void generate();}}} placeholder="What did you build, how does it work, and which technologies did you use? Add team names, roll numbers, colleges, semesters, contributions, exact dates and costs if you have them. English, Hindi or Hinglish all work."/>
   <div className="gemini-prompt-meta"><span>Include real details. Gemini will flag what’s missing.</span><span>{prompt.length.toLocaleString()} / 12,000</span></div>
   <div className="gemini-examples"><span>Need a starting point?</span>{examples.map(example=><button key={example.name} type="button" disabled={busy||!!prompt.trim()} onClick={()=>setPrompt(example.text)}>{example.name} <ArrowUpRight size={13}/></button>)}</div>
   <div className="gemini-actions"><button type="button" className="button blue gemini-generate" disabled={busy||prompt.trim().length<20} onClick={()=>void generate()}><span className={`gemini-generate-icon${busy?' is-busy':''}`} aria-hidden="true"><Sparkles size={17} className="gemini-icon-idle"/><span className="gemini-icon-busy"><LoaderCircle size={17} className="gemini-spinner"/></span></span> {busy?'Writing your draft…':'Generate project details'}</button>{busy&&<button type="button" className="text-button" onClick={cancel}><X size={16}/> Cancel</button>}<small>Review first. Apply only what you want.</small></div>
  </div>
  <p className="gemini-disclosure">Your prompt is sent to Google Gemini and saved with your account so administrators can prevent misuse; saved prompts are deleted after 180 days. The rest of this form and your uploaded files are not sent. Photos and source ZIP uploads are always manual.</p>
  {busy&&<p role="status" className="gemini-status">Organising your notes into project fields. This can take up to 45 seconds.</p>}
  {error&&<Notice error>{error}</Notice>}{message&&<p role="status" className="gemini-status">{message}</p>}
  {draft&&<motion.div ref={result} tabIndex={-1} className="gemini-result" initial={reduced?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.25}}>
   <div className="gemini-result-heading"><div><span className="gemini-eyebrow">YOUR DRAFT IS READY</span><h3>A first draft. Your final say.</h3></div><span>{selected.length} selected</span></div>
   <p>Check every detail below. Applying a selected field replaces its current answer. Team details replace the team list; photos are kept only for matching members.</p>
   <div className="gemini-selection"><button type="button" onClick={()=>setSelected(Object.keys(draft.fields) as Field[])}>Select all</button><button type="button" onClick={()=>setSelected([])}>Clear selection</button></div>
   <div className="gemini-fields">{(Object.entries(draft.fields) as [Field,unknown][]).map(([field,value])=><div className="gemini-field" key={field}><label className="checkbox-label"><input type="checkbox" aria-label={`Use suggested ${aiFieldLabels[field]}`} checked={selected.includes(field)} onChange={e=>setSelected(s=>e.target.checked?[...s,field]:s.filter(k=>k!==field))}/>{aiFieldLabels[field]}</label><details open={['title','summary','description','team'].includes(field)}><summary>Review suggestion</summary><div className="gemini-proposed">{readable(value)}</div>{readable(data[field])&&<details className="gemini-current"><summary>Current answer</summary><div>{readable(data[field])}</div></details>}</details></div>)}</div>
   {(draft.missingDetails.length>0||draft.notes.length>0)&&<div className="gemini-missing"><strong>Still needs your input</strong><ul>{[...draft.missingDetails,...draft.notes].map((note,i)=><li key={i}>{note}</li>)}</ul></div>}
   <div className="gemini-actions"><button type="button" className="button blue" disabled={!selected.length} onClick={()=>{onApply(draft,selected);setDraft(null);setMessage('Selected details added to your form. Review them below, then upload your images and source ZIP.');}}><Check size={17}/> Apply selected details</button><button type="button" className="text-button" onClick={()=>{setDraft(null);setMessage('Suggestions discarded. Your form has not changed.');}}>Discard suggestions</button></div>
  </motion.div>}
 </section>;
}
