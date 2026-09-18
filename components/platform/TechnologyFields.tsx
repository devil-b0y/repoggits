'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {Brain,ShieldCheck,Cloud,BarChart3,Radio,Smartphone,Leaf,Heart,GraduationCap,ShoppingCart,MapPin,TestTube,Palette,ChevronDown,Bot,Cpu,Wifi,ScanFace,ClipboardCheck,Tag,Code2,Database,Globe,Layers,Link2,Plus,Server,Terminal,Video,Wrench,X} from 'lucide-react';
import {technologyTags,tagMatches} from '@/lib/technology-tags';
import type {ProjectData} from '@/lib/schema';
import LanguagePicker from './LanguagePicker';
import {TechnologyMark} from './ProjectIdentity';
import './technology-fields.css';

const popular=['Next.js','React','TypeScript','Python','Arduino','ESP32','IoT','PostgreSQL'];
const fields=[
  {key:'frontend',title:'Frontend',hint:'What people see and interact with',example:'React, Next.js, Flutter',Icon:Globe},
  {key:'backend',title:'Backend',hint:'The logic behind your project',example:'Node.js, Django, FastAPI',Icon:Server},
  {key:'database',title:'Database',hint:'Where your data lives',example:'PostgreSQL, MongoDB, Firebase',Icon:Database},
  {key:'frameworks',title:'Frameworks',hint:'The foundations you built on',example:'Express, TensorFlow, ROS',Icon:Layers},
  {key:'tools',title:'Tools',hint:'Your development and hardware tools',example:'VS Code, Figma, Arduino IDE',Icon:Wrench},
] as const;

const presets:Record<string,string[]>={
 frontend:['React','Next.js','JavaScript','TypeScript','HTML','CSS','Vue','Angular','Svelte','Flutter','Astro','Remix','Nuxt','Tailwind CSS','Bootstrap','Sass','React Native'],
 backend:['Node.js','Python','Django','FastAPI','Flask','Express','Java','PHP','Go','Rust','NestJS','Fastify','Laravel','Ruby on Rails','Spring Boot','.NET'],
 database:['PostgreSQL','PostgreSQL (Neon DB)','MySQL','SQLite','MongoDB','Firebase','Supabase','Redis','LocalStorage','Prisma','Elasticsearch'],
 frameworks:['Next.js','React','Express','Django','TensorFlow','PyTorch','Keras','Scikit-learn','OpenCV','Arduino','ROS','ROS 2','Spring Boot','.NET','Unity','Unreal Engine','Redux','GraphQL','Socket.IO'],
 tools:['VS Code','Git','GitHub','GitLab','Bitbucket','Docker','Kubernetes','Figma','Arduino IDE','Playwright','Jest','Cypress','Postman','Chrome DevTools','PlatformIO','Jenkins','Notion','Jupyter Notebook','Anaconda','PyCharm','IntelliJ IDEA','Maven','Gradle','CMake']
};
function StackPicker({field,value,onChange}:{field:typeof fields[number];value:string;onChange:(value:string)=>void}){
 const {key,title,hint,example,Icon}=field;
 const id=useId(),input=useRef<HTMLInputElement>(null);
 const [open,setOpen]=useState(false),[message,setMessage]=useState('');
 const selected=value.split(',').map(v=>v.trim()).filter(Boolean);
 function choose(name:string){
  if(selected.some(v=>v.toLowerCase()===name.toLowerCase()))return;
  const next=value.trim()?`${value.trim()}, ${name}`:name;
  if(next.length>300){setMessage('Keep this field to 300 characters or fewer.');return;}
  onChange(next);setMessage('');
 }
 return <div className="tech-stack-field" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}>
  <label htmlFor={id}><Icon size={17}/>{title}</label><small>{hint}</small>
  <div className="stack-presets-control"><input ref={input} id={id} aria-label={title} value={value} maxLength={300} placeholder={example} onChange={e=>onChange(e.target.value)}/><button type="button" aria-label={`Choose ${title.toLowerCase()} technologies`} aria-expanded={open} aria-controls={`${id}-presets`} onClick={()=>setOpen(!open)}><ChevronDown size={18}/></button></div>
  {selected.length>0&&<div className="stack-selected-logos">{selected.map((name,i)=><span key={`${name}-${i}`}><TechnologyMark name={name} icon={Icon}/><span>{name}</span></span>)}</div>}
  {open&&<div className="stack-presets-menu" id={`${id}-presets`} aria-label={`${title} presets`}>{presets[key].map(name=><button type="button" key={name} aria-pressed={selected.some(v=>v.toLowerCase()===name.toLowerCase())} onClick={()=>choose(name)}><TechnologyMark name={name} icon={Icon}/><span>{name}</span><Plus size={15}/></button>)}<button type="button" onClick={()=>{setOpen(false);input.current?.focus();setMessage('Type your own technology in the field above. Separate multiple names with commas.');}}><TechnologyMark name="Custom technology" icon={Icon}/><span>Other / type custom</span></button></div>}
  <small>Choose presets or type your own. Separate multiple technologies with commas.</small>
  {message&&<small role="status">{message}</small>}
 </div>;
}

function TagLogo({name}:{name:string}){
 const key=name.toLowerCase();
 const icon=/learning|intelligence|neural|language model|rag|generative/.test(key)?Brain:/security|cryptography|authentication/.test(key)?ShieldCheck:/cloud|serverless|devops|microservices/.test(key)?Cloud:/data |analytics|visualization/.test(key)?BarChart3:/sensor|rfid|gps|serial|i2c|spi|uart/.test(key)?Radio:/mobile|wearable/.test(key)?Smartphone:/sustainab|energy|agriculture/.test(key)?Leaf:/health/.test(key)?Heart:/education|student/.test(key)?GraduationCap:/commerce|fintech/.test(key)?ShoppingCart:/navigation/.test(key)?MapPin:/testing/.test(key)?TestTube:/design|cad/.test(key)?Palette:/esp32|circuit|hardware|microcontroller|embedded|fpga|vlsi/.test(key)?Cpu:/iot/.test(key)?Wifi:/robot/.test(key)?Bot:/face|vision/.test(key)?ScanFace:/attendance/.test(key)?ClipboardCheck:Tag;
 return <TechnologyMark name={name} icon={icon}/>;
}

function TechnologyTags({value,onChange,suggestions}:{value:string[];onChange:(tags:string[])=>void;suggestions:string[]}){
  const id=useId(),input=useRef<HTMLInputElement>(null);
  const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[message,setMessage]=useState('');
  useEffect(()=>{if(open&&active>=0)document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block:'nearest'});},[active,open,id]);
  const choices=Array.from(new Set([...suggestions,...technologyTags])).filter(tag=>!value.some(v=>v.toLowerCase()===tag.toLowerCase())&&tagMatches(tag,query));
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
    <div className="tech-selected">{value.map((tag,i)=><span className="tech-chip" key={`${tag}-${i}`}><TagLogo name={tag}/><span>{tag}</span><button type="button" aria-label={`Remove technology ${tag}`} onClick={()=>{onChange(value.filter((_,n)=>i!==n));setMessage(`${tag} removed.`);}}><X size={13}/></button></span>)}</div>
    <div className="tech-search-wrap"><Terminal size={17} aria-hidden="true"/><input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open&&active>=0?`${id}-option-${active}`:undefined} aria-describedby={`${id}-hint ${id}-help`} value={query} placeholder="Search or add a technology…" autoComplete="off" onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(-1);setMessage('');}} onKeyDown={e=>{
      if(e.nativeEvent.isComposing)return;
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(current=>options.length?(current<0?(e.key==='ArrowDown'?0:options.length-1):(current+(e.key==='ArrowDown'?1:-1)+options.length)%options.length):-1);}
      else if(e.key==='Enter'){e.preventDefault();if(open&&active>=0&&options[active])add(options[active]);else if(query.trim())add(query);}
      else if(e.key==='Escape'){e.preventDefault();setOpen(false);setActive(-1);}
    }}/><button type="button" className="tech-add" aria-label="Add technology" disabled={!query.trim()} onClick={()=>add(query)}><Plus size={18}/></button></div>
    {open&&<div className="tech-options" role="listbox" id={`${id}-options`} aria-label="Technology suggestions">{options.length?options.map((tag,i)=><div role="option" aria-selected={i===active} id={`${id}-option-${i}`} key={tag} onPointerDown={e=>e.preventDefault()} onClick={()=>add(tag)}><TagLogo name={tag}/><span className="tech-option-name">{custom&&i===options.length-1?'Add “'+tag+'”':tag}</span><Plus size={15}/></div>):<div className="tech-options-empty">No more matches. Type a technology to add it.</div>}</div>}
    <div className="tech-quick"><span>Popular</span>{popular.filter(tag=>!value.some(v=>v.toLowerCase()===tag.toLowerCase())).slice(0,5).map(tag=><button type="button" key={tag} onClick={()=>add(tag)}><TagLogo name={tag}/>{tag}<Plus size={12}/></button>)}</div>
    <small id={`${id}-help`}>Press Enter to add. You can also paste names separated by commas.</small>
    <span className="tech-feedback" role="status">{message}</span>
  </div>;
}

export default function TechnologyFields({data,onChange,suggestions}:{data:ProjectData;onChange:(patch:Partial<ProjectData>)=>void;suggestions:string[]}){
  return <div className="technology-fields">
    <TechnologyTags value={data.tags} onChange={tags=>onChange({tags})} suggestions={suggestions}/>
    <div className="tech-group-heading"><span><Layers size={18}/>Your build stack</span><p>Add the details that apply to your project. Leave the rest blank.</p></div>
    <div className="tech-stack-grid"><LanguagePicker value={data.stack.languages} onChange={languages=>onChange({stack:{...data.stack,languages}})}/>{fields.map(field=><StackPicker key={field.key} field={field} value={data.stack[field.key]} onChange={value=>onChange({stack:{...data.stack,[field.key]:value}})}/>)}</div>
    <div className="tech-group-heading"><span><Link2 size={18}/>See it in action</span><p>Connect your repository and working demos.</p></div>
    <div className="form-row"><label>GitHub repository URL (optional)<input type="url" value={data.github} onChange={e=>onChange({github:e.target.value})} placeholder="https://github.com/your-team/project"/></label><label>Live demo URL<input type="url" value={data.liveUrl} onChange={e=>onChange({liveUrl:e.target.value})} placeholder="https://your-project.com"/></label></div>
    <label className="tech-video-label"><span><Video size={17}/>Demo video URL</span><input aria-label="Demo video URL" type="url" value={data.videoUrl} onChange={e=>onChange({videoUrl:e.target.value})} placeholder="YouTube link or direct MP4 / WebM URL"/><small>Show the moment it works. The video opens when someone clicks your project thumbnail.</small></label>
  </div>;
}
