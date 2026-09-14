'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {Check,ChevronDown,Code2,Plus,Search,X} from 'lucide-react';
import catalogue from '@/lib/programming-languages.json';
import './language-picker.css';

type Language=typeof catalogue[number];
function findLanguage(name:string){return catalogue.find(item=>item.name.toLowerCase()===name.toLowerCase()||item.aliases.some(alias=>alias.toLowerCase()===name.toLowerCase()));}
function Logo({language}:{language?:Language}){return <span className="language-logo" aria-hidden="true">{language?.icon?<img src={language.icon} width={24} height={24} alt="" loading="lazy"/>:<Code2 size={20}/>}</span>;}

/** Keeps the existing comma-separated field, including saved custom languages. */
export default function LanguagePicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const id=useId(),input=useRef<HTMLInputElement>(null),customInput=useRef<HTMLInputElement>(null);
  const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[custom,setCustom]=useState(false),[customName,setCustomName]=useState(''),[message,setMessage]=useState('');
  const selected=value.split(',').map(name=>name.trim()).filter(Boolean);
  const matches=catalogue.filter(item=>[item.name,...item.aliases].some(name=>name.toLowerCase().includes(query.trim().toLowerCase())));
  const isSelected=(name:string)=>selected.some(current=>(findLanguage(current)?.name??current).toLowerCase()===name.toLowerCase());
  useEffect(()=>{if(open&&active>=0)document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block:'nearest'});},[active,open,id]);
  useEffect(()=>{if(custom)customInput.current?.focus();},[custom]);
  function publish(next:string[]){const result=next.join(', ');if(result.length>300){setMessage('Your language list can contain up to 300 characters. Remove a language to make room.');return false;}onChange(result);return true;}
  function choose(language:Language){
    const exists=isSelected(language.name);
    const next=exists?selected.filter(name=>(findLanguage(name)?.name??name).toLowerCase()!==language.name.toLowerCase()):[...selected,language.name];
    if(publish(next)){setMessage(`${language.name} ${exists?'removed':'added'}.`);setQuery('');setActive(-1);}input.current?.focus();
  }
  function showCustom(){setCustomName(query.trim());setCustom(true);setOpen(false);setActive(-1);setMessage('');}
  function addCustom(){
    const names=customName.split(',').map(name=>name.trim()).filter(Boolean);
    if(!names.length){setMessage('Enter a language name first.');return;}
    if(names.some(name=>name.length>60)){setMessage('Keep each custom language name to 60 characters or fewer.');return;}
    const next=[...selected];for(const name of names){const canonical=findLanguage(name)?.name??name;if(!next.some(item=>(findLanguage(item)?.name??item).toLowerCase()===canonical.toLowerCase()))next.push(canonical);}
    if(publish(next)){setCustom(false);setCustomName('');setQuery('');setMessage('Language added.');input.current?.focus();}
  }
  return <div className="language-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setOpen(false);setActive(-1);}}}>
    <div className="language-heading"><label htmlFor={id}><Code2 size={17}/>Languages</label><span>{selected.length?`${selected.length} selected`:`${catalogue.length} built-in choices`}</span></div>
    <p id={`${id}-help`}>Choose the languages you used. Search by name, select several, or add your own.</p>
    {!!selected.length&&<div className="language-chips">{selected.map((name,index)=><span className="language-chip" key={`${name}-${index}`}><Logo language={findLanguage(name)}/><span>{name}</span><button type="button" aria-label={`Remove language ${name}`} onClick={()=>{publish(selected.filter((_,i)=>i!==index));setMessage(`${name} removed.`);}}><X size={14}/></button></span>)}</div>}
    <div className="language-search"><Search size={17} aria-hidden="true"/><input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open&&active>=0?`${id}-option-${active}`:undefined} aria-describedby={`${id}-help`} autoComplete="off" placeholder="Search languages — Python, Java, C++…" value={query} onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(-1);}} onKeyDown={event=>{
      if(event.nativeEvent.isComposing)return;
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(current=>current<0?(event.key==='ArrowDown'?0:matches.length):(current+(event.key==='ArrowDown'?1:-1)+matches.length+1)%(matches.length+1));}
      else if(event.key==='Enter'){event.preventDefault();if(open&&active>=0&&active<matches.length)choose(matches[active]);else if(open&&active===matches.length)showCustom();else if(query.trim()){const exact=findLanguage(query.trim());if(exact)choose(exact);else showCustom();}else setOpen(true);}
      else if(event.key==='Escape'){event.preventDefault();setOpen(false);setActive(-1);}
    }}/><button type="button" className="language-toggle" aria-label={open?'Close language menu':'Open language menu'} aria-expanded={open} aria-controls={`${id}-list`} onClick={()=>{setOpen(!open);setActive(-1);}}><ChevronDown size={18}/></button></div>
    {open&&<div className="language-menu"><div className="language-menu-caption">{matches.length} {matches.length===1?'match':'languages & formats'}<span>Select all that apply</span></div><div id={`${id}-list`} className="language-options" role="listbox" aria-label="Programming languages" aria-multiselectable="true">
      {matches.map((language,index)=><div key={language.name} id={`${id}-option-${index}`} role="option" aria-selected={isSelected(language.name)} data-active={active===index} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(language)}><Logo language={language}/><span>{language.name}<small>{language.category}</small></span>{isSelected(language.name)?<Check size={17}/>:<Plus size={16}/>}</div>)}
      <div id={`${id}-option-${matches.length}`} className="language-other" role="option" aria-selected="false" data-active={active===matches.length} onPointerDown={event=>event.preventDefault()} onClick={showCustom}><Logo/><span>Other language<small>{query.trim()?`Add “${query.trim()}”`:'Not on the list? Add your own.'}</small></span><Plus size={16}/></div>
    </div></div>}
    {custom&&<div className="language-custom"><label htmlFor={`${id}-custom`}>Other coding language</label><div><input ref={customInput} id={`${id}-custom`} value={customName} maxLength={300} placeholder="Enter the language name" onChange={e=>setCustomName(e.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();addCustom();}if(event.key==='Escape'){setCustom(false);input.current?.focus();}}}/><button type="button" onClick={addCustom}>Add language</button></div><button className="language-cancel" type="button" onClick={()=>{setCustom(false);input.current?.focus();}}>Cancel</button></div>}
    <button className="language-other-link" type="button" onClick={showCustom}><Plus size={13}/>Other / add a language</button>
    <span className="language-feedback" role="status">{message}</span>
  </div>;
}
