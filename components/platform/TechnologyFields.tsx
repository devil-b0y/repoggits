'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {Code2,Database,Globe,Layers,Link2,Plus,Server,Terminal,Video,Wrench,X} from 'lucide-react';
import type {ProjectData} from '@/lib/schema';
import LanguagePicker from './LanguagePicker';
import './technology-fields.css';

const popular=['Next.js','React','TypeScript','Python','Arduino','ESP32','IoT','PostgreSQL'];
const fields=[
  {key:'frontend',title:'Frontend',hint:'What people see and interact with',example:'React, Next.js, Flutter',Icon:Globe},
  {key:'backend',title:'Backend',hint:'The logic behind your project',example:'Node.js, Django, FastAPI',Icon:Server},
  {key:'database',title:'Database',hint:'Where your data lives',example:'PostgreSQL, MongoDB, Firebase',Icon:Database},
  {key:'frameworks',title:'Frameworks',hint:'The foundations you built on',example:'Express, TensorFlow, ROS',Icon:Layers},
  {key:'tools',title:'Tools',hint:'Your development and hardware tools',example:'VS Code, Figma, Arduino IDE',Icon:Wrench},
] as const;

function TechnologyTags({value,onChange,suggestions}:{value:string[];onChange:(tags:string[])=>void;suggestions:string[]}){
  const id=useId(),input=useRef<HTMLInputElement>(null);
  const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[message,setMessage]=useState('');
  useEffect(()=>{if(open&&active>=0)document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block:'nearest'});},[active,open,id]);
  const choices=Array.from(new Set([...suggestions,...popular])).filter(tag=>!value.some(v=>v.toLowerCase()===tag.toLowerCase())&&tag.toLowerCase().includes(query.trim().toLowerCase())).slice(0,7);
  const custom=query.trim()&&!choices.some(tag=>tag.toLowerCase()===query.trim().toLowerCase())&&!value.some(tag=>tag.toLowerCase()===query.trim().toLowerCase());
  const options=[...choices,...(custom?[query.trim()]:[])];
  function add(raw:string){
    const tags=raw.split(',').map(tag=>tag.trim()).filter(Boolean);
    if(tags.some(tag=>tag.length>40)){setMessage('Keep each technology name to 40 characters or fewer.');return;}
    const next=[...value];for(const tag of tags)if(!next.some(v=>v.toLowerCase()===tag.toLowerCase()))next.push(tag);
    if(next.length>40){setMessage('You can add up to 40 technologies.');return;}
    onChange(next);setQuery('');setActive(-1);setMessage(tags.length?'Technology added.':'');input.current?.focus();
  }
  return <div className="tech-tag-editor" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setOpen(false);setActive(-1);}}}>
    <div className="tech-label-row"><label htmlFor={id}>Technology tags</label><span>{value.length}/40 selected</span></div>
    <p id={`${id}-hint`}>Make your project easier to discover. Pick your main technologies or add your own.</p>
    <div className="tech-selected">{value.map((tag,i)=><span className="tech-chip" key={`${tag}-${i}`}><span>{tag}</span><button type="button" aria-label={`Remove technology ${tag}`} onClick={()=>{onChange(value.filter((_,n)=>i!==n));setMessage(`${tag} removed.`);}}><X size={13}/></button></span>)}</div>
    <div className="tech-search-wrap"><Terminal size={17} aria-hidden="true"/><input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open&&active>=0?`${id}-option-${active}`:undefined} aria-describedby={`${id}-hint ${id}-help`} value={query} placeholder="Search or add a technology…" autoComplete="off" onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(-1);setMessage('');}} onKeyDown={e=>{
      if(e.nativeEvent.isComposing)return;
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(current=>options.length?(current<0?(e.key==='ArrowDown'?0:options.length-1):(current+(e.key==='ArrowDown'?1:-1)+options.length)%options.length):-1);}
      else if(e.key==='Enter'){e.preventDefault();if(open&&active>=0&&options[active])add(options[active]);else if(query.trim())add(query);}
      else if(e.key==='Escape'){e.preventDefault();setOpen(false);setActive(-1);}
    }}/><button type="button" className="tech-add" aria-label="Add technology" disabled={!query.trim()} onClick={()=>add(query)}><Plus size={18}/></button></div>
    {open&&<div className="tech-options" role="listbox" id={`${id}-options`} aria-label="Technology suggestions">{options.length?options.map((tag,i)=><div role="option" aria-selected={i===active} id={`${id}-option-${i}`} key={tag} onPointerDown={e=>e.preventDefault()} onClick={()=>add(tag)}><span>{custom&&i===options.length-1?'Add “'+tag+'”':tag}</span><Plus size={15}/></div>):<div className="tech-options-empty">No more matches. Type a technology to add it.</div>}</div>}
    <div className="tech-quick"><span>Popular</span>{popular.filter(tag=>!value.some(v=>v.toLowerCase()===tag.toLowerCase())).slice(0,5).map(tag=><button type="button" key={tag} onClick={()=>add(tag)}><Plus size={12}/>{tag}</button>)}</div>
    <small id={`${id}-help`}>Press Enter to add. You can also paste names separated by commas.</small>
    <span className="tech-feedback" role="status">{message}</span>
  </div>;
}

export default function TechnologyFields({data,onChange,suggestions}:{data:ProjectData;onChange:(patch:Partial<ProjectData>)=>void;suggestions:string[]}){
  return <div className="technology-fields">
    <TechnologyTags value={data.tags} onChange={tags=>onChange({tags})} suggestions={suggestions}/>
    <div className="tech-group-heading"><span><Layers size={18}/>Your build stack</span><p>Add the details that apply to your project. Leave the rest blank.</p></div>
    <div className="tech-stack-grid"><LanguagePicker value={data.stack.languages} onChange={languages=>onChange({stack:{...data.stack,languages}})}/>{fields.map(({key,title,hint,example,Icon})=><label className="tech-stack-field" key={key}><span><Icon size={17}/>{title}</span><small>{hint}</small><input aria-label={title} value={data.stack[key]} maxLength={300} placeholder={example} onChange={e=>onChange({stack:{...data.stack,[key]:e.target.value}})}/></label>)}</div>
    <div className="tech-group-heading"><span><Link2 size={18}/>See it in action</span><p>Connect your repository and working demos.</p></div>
    <div className="form-row"><label>GitHub repository URL (optional)<input type="url" value={data.github} onChange={e=>onChange({github:e.target.value})} placeholder="https://github.com/your-team/project"/></label><label>Live demo URL<input type="url" value={data.liveUrl} onChange={e=>onChange({liveUrl:e.target.value})} placeholder="https://your-project.com"/></label></div>
    <label className="tech-video-label"><span><Video size={17}/>Demo video URL</span><input aria-label="Demo video URL" type="url" value={data.videoUrl} onChange={e=>onChange({videoUrl:e.target.value})} placeholder="YouTube link or direct MP4 / WebM URL"/><small>Show the moment it works. The video opens when someone clicks your project thumbnail.</small></label>
  </div>;
}
