'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {Ban,Bot,Check,ChevronDown,Plus,Search,Sparkles,X,type LucideIcon} from 'lucide-react';
import {aiToolMatches,aiToolsFor,findAiTool,isNoAi,NO_AI,type AiScope,type AiTool} from '@/lib/ai-tools';
import './ai-tool-picker.css';

const copy={
  project:{title:'AI tools in your project',hint:'AI models, APIs or features that run inside what you built.',placeholder:'Search — ChatGPT, Gemini, Hugging Face…',Icon:Sparkles},
  coding:{title:'AI tools used for coding',hint:'Assistants that helped you write, debug or understand the code.',placeholder:'Search — Copilot, Cursor, Claude…',Icon:Bot},
} as const;
type Row='none'|'other'|AiTool;

function Mark({tool,none,Icon}:{tool?:AiTool;none?:boolean;Icon:LucideIcon}){
  const [failed,setFailed]=useState(false);
  return <span className="ai-logo" aria-hidden="true">{none?<Ban size={18}/>:tool&&!failed?<img src={tool.icon} width={24} height={24} alt="" loading="lazy" onError={()=>setFailed(true)}/>:<Icon size={18}/>}</span>;
}

/** Comma-separated like the other stack fields, so saved custom tools survive. "No AI used" is exclusive. */
export default function AiToolPicker({scope,value,onChange}:{scope:AiScope;value:string;onChange:(value:string)=>void}){
  const {title,hint,placeholder,Icon}=copy[scope];
  const id=useId(),input=useRef<HTMLInputElement>(null),customInput=useRef<HTMLInputElement>(null);
  const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[custom,setCustom]=useState(false),[customName,setCustomName]=useState(''),[message,setMessage]=useState('');
  const tools=aiToolsFor(scope),selected=value.split(',').map(name=>name.trim()).filter(Boolean),noAi=selected.some(isNoAi);
  const matches=tools.filter(tool=>aiToolMatches(tool,query));
  const showNone=!query.trim()||'no ai used none did not use ai without ai'.includes(query.trim().toLowerCase());
  const rows:Row[]=[...(showNone?['none' as const]:[]),...matches,'other'];
  const has=(name:string)=>selected.some(current=>current.toLowerCase()===name.toLowerCase());
  useEffect(()=>{if(open&&active>=0)document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block:'nearest'});},[active,open,id]);
  useEffect(()=>{if(custom)customInput.current?.focus();},[custom]);
  function publish(next:string[]){const result=next.join(', ');if(result.length>300){setMessage('This list can hold up to 300 characters. Remove a tool to make room.');return false;}onChange(result);return true;}
  function choose(tool:AiTool){
    const exists=has(tool.name),others=selected.filter(name=>!isNoAi(name));
    if(publish(exists?others.filter(name=>name.toLowerCase()!==tool.name.toLowerCase()):[...others,tool.name])){setMessage(`${tool.name} ${exists?'removed':'added'}.`);setQuery('');setActive(-1);}input.current?.focus();
  }
  function chooseNone(){
    if(noAi){if(publish([]))setMessage('Answer cleared.');}else if(publish([NO_AI]))setMessage('Marked as no AI used.');
    setOpen(false);setActive(-1);setQuery('');input.current?.focus();
  }
  function showCustom(){setCustomName(query.trim());setCustom(true);setOpen(false);setActive(-1);setMessage('');}
  function addCustom(){
    const names=customName.split(',').map(name=>name.trim()).filter(Boolean);
    if(!names.length){setMessage('Enter a tool name first.');return;}
    if(names.some(name=>name.length>60)){setMessage('Keep each tool name to 60 characters or fewer.');return;}
    const next=selected.filter(name=>!isNoAi(name));
    for(const name of names){const canonical=findAiTool(name)?.name??name;if(!next.some(item=>item.toLowerCase()===canonical.toLowerCase()))next.push(canonical);}
    if(publish(names.some(isNoAi)?[NO_AI]:next)){setCustom(false);setCustomName('');setQuery('');setMessage('Tool added.');input.current?.focus();}
  }
  const pick=(row:Row)=>row==='none'?chooseNone():row==='other'?showCustom():choose(row);
  return <div className="ai-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setOpen(false);setActive(-1);}}}>
    <div className="ai-heading"><label htmlFor={id}><Icon size={17}/>{title}</label><span>{noAi?NO_AI:selected.length?`${selected.length} selected`:`${tools.length} built-in choices`}</span></div>
    <p id={`${id}-help`}>{hint}</p>
    {!!selected.length&&<div className="ai-chips">{selected.map((name,index)=><span className="ai-chip" key={`${name}-${index}`}><Mark tool={findAiTool(name)} none={isNoAi(name)} Icon={Icon}/><span>{name}</span><button type="button" aria-label={`Remove AI tool ${name}`} onClick={()=>{publish(selected.filter((_,i)=>i!==index));setMessage(`${name} removed.`);}}><X size={14}/></button></span>)}</div>}
    <div className="ai-search"><Search size={17} aria-hidden="true"/><input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open&&active>=0?`${id}-option-${active}`:undefined} aria-describedby={`${id}-help`} autoComplete="off" placeholder={placeholder} value={query} onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(-1);}} onKeyDown={event=>{
      if(event.nativeEvent.isComposing)return;
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(current=>current<0?(event.key==='ArrowDown'?0:rows.length-1):(current+(event.key==='ArrowDown'?1:-1)+rows.length)%rows.length);}
      else if(event.key==='Enter'){event.preventDefault();if(open&&active>=0)pick(rows[active]);else if(query.trim()){const exact=findAiTool(query.trim());if(exact)choose(exact);else showCustom();}else setOpen(true);}
      else if(event.key==='Escape'){event.preventDefault();setOpen(false);setActive(-1);}
    }}/><button type="button" className="ai-toggle" aria-label={open?`Close ${title} menu`:`Open ${title} menu`} aria-expanded={open} aria-controls={`${id}-list`} onClick={()=>{setOpen(!open);setActive(-1);}}><ChevronDown size={18}/></button></div>
    {open&&<div className="ai-menu"><div className="ai-menu-caption">{matches.length} {matches.length===1?'match':'AI tools'}<span>Select all that apply</span></div><div id={`${id}-list`} className="ai-options" role="listbox" aria-label={title} aria-multiselectable="true">
      {rows.map((row,index)=>{
        const props={id:`${id}-option-${index}`,role:'option','data-active':active===index,onPointerDown:(event:React.PointerEvent)=>event.preventDefault(),onClick:()=>pick(row)};
        if(row==='none')return <div key="none" className="ai-none" aria-selected={noAi} {...props}><Mark none Icon={Icon}/><span>{NO_AI}<small>I didn’t use AI for this</small></span>{noAi?<Check size={17}/>:<Plus size={16}/>}</div>;
        if(row==='other')return <div key="other" className="ai-other" aria-selected="false" {...props}><Mark Icon={Icon}/><span>Other tool<small>{query.trim()?`Add “${query.trim()}”`:'Not on the list? Add your own.'}</small></span><Plus size={16}/></div>;
        return <div key={row.name} aria-selected={has(row.name)} {...props}><Mark tool={row} Icon={Icon}/><span>{row.name}<small>{row.maker} · {row.category}</small></span>{has(row.name)?<Check size={17}/>:<Plus size={16}/>}</div>;
      })}
    </div></div>}
    {custom&&<div className="ai-custom"><label htmlFor={`${id}-custom`}>Other AI tool</label><div><input ref={customInput} id={`${id}-custom`} value={customName} maxLength={300} placeholder="Enter the tool name" onChange={e=>setCustomName(e.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();addCustom();}if(event.key==='Escape'){setCustom(false);input.current?.focus();}}}/><button type="button" onClick={addCustom}>Add tool</button></div><button className="ai-cancel" type="button" onClick={()=>{setCustom(false);input.current?.focus();}}>Cancel</button></div>}
    <div className="ai-quick"><button type="button" onClick={showCustom}><Plus size={13}/>Other / add an AI tool</button><button type="button" aria-pressed={noAi} onClick={chooseNone}><Ban size={13}/>I didn’t use AI</button></div>
    <span className="ai-feedback" role="status">{message}</span>
  </div>;
}
