'use client';

import {useId,useState} from 'react';
import {Check,ChevronDown,Type} from 'lucide-react';
import {findFont,projectFonts} from '@/lib/project-fonts';
import './font-picker.css';

/** Sits under the story field: every choice is drawn in its own typeface, so the list is its own preview. */
export default function FontPicker({value,sample,onChange}:{value:string;sample:string;onChange:(key:string)=>void}) {
  const id=useId();
  const [open,setOpen]=useState(false);
  const chosen=findFont(value);
  const preview=sample.trim().slice(0,90)||'Your project story will be set in this typeface.';
  return <div className="font-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}} onKeyDown={event=>{if(event.key==='Escape')setOpen(false);}}>
    <div className="font-picker-head"><span className="font-picker-label"><Type size={16}/>Page typeface</span><span>Sets the whole published project page</span></div>
    <button type="button" id={id} className="font-picker-current" aria-label={`Page typeface, currently ${chosen.name}`} aria-expanded={open} aria-controls={`${id}-menu`} onClick={()=>setOpen(!open)}>
      <span className="font-mark" style={{fontFamily:chosen.stack}} aria-hidden="true">Aa</span>
      <span className="font-picker-name"><strong style={{fontFamily:chosen.stack}}>{chosen.name}</strong><small>{chosen.note}</small></span>
      <ChevronDown size={18}/>
    </button>
    {open&&<div className="font-picker-menu" id={`${id}-menu`} role="listbox" aria-label="Page typeface">
      {projectFonts.map(font=><button type="button" role="option" aria-selected={font.key===chosen.key} key={font.key} onClick={()=>{onChange(font.key);setOpen(false);}}>
        <span className="font-mark" style={{fontFamily:font.stack}} aria-hidden="true">Aa</span>
        <span className="font-picker-name"><strong style={{fontFamily:font.stack}}>{font.name}</strong><small style={{fontFamily:font.stack}}>{font.note}</small></span>
        {font.key===chosen.key&&<Check size={17}/>}
      </button>)}
    </div>}
    <p className="font-preview" style={{fontFamily:chosen.stack}}>{preview}</p>
  </div>;
}
