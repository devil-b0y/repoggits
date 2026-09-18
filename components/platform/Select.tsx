'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import './select.css';

export type SelectOption={value:string;label?:string;icon?:ReactNode};
type Item={value:string;label:ReactNode;icon?:ReactNode};

/** A styled, keyboard-accessible replacement for a native `<select>`, with an optional icon per option. */
export default function Select({value,options,onChange,ariaLabel,placeholder='Select…',disabled}:{value:string;options:(string|SelectOption)[];onChange:(value:string)=>void;ariaLabel?:string;placeholder?:string;disabled?:boolean}){
  const id=useId(),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false),[active,setActive]=useState(-1);
  const items:Item[]=options.map(o=>typeof o==='string'?{value:o,label:o}:{value:o.value,label:o.label??o.value,icon:o.icon});
  const currentIndex=items.findIndex(item=>item.value===value);
  const current=currentIndex>=0?items[currentIndex]:undefined;
  useEffect(()=>{if(open&&active>=0)document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block:'nearest'});},[active,open,id]);
  function choose(index:number){const item=items[index];if(!item)return;onChange(item.value);setOpen(false);setActive(-1);trigger.current?.focus();}
  function openAt(index:number){setOpen(true);setActive(index);}
  return <div className="dropdown-select" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setOpen(false);setActive(-1);}}}>
    <button ref={trigger} type="button" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-list`} aria-label={ariaLabel} disabled={disabled} className="dropdown-select-trigger" onClick={()=>open?setOpen(false):openAt(currentIndex>=0?currentIndex:0)} onKeyDown={event=>{
      if(disabled)return;
      if(event.key==='ArrowDown'){event.preventDefault();open?setActive(i=>(i+1)%items.length):openAt(currentIndex>=0?currentIndex:0);}
      else if(event.key==='ArrowUp'){event.preventDefault();open?setActive(i=>(i-1+items.length)%items.length):openAt(currentIndex>=0?currentIndex:0);}
      else if(event.key==='Enter'||event.key===' '){event.preventDefault();if(open&&active>=0)choose(active);else openAt(currentIndex>=0?currentIndex:0);}
      else if(event.key==='Escape'){setOpen(false);setActive(-1);}
    }}>
      {current?.icon&&<span className="dropdown-select-icon">{current.icon}</span>}
      <span className="dropdown-select-value">{current?.label??placeholder}</span>
      <ChevronDown size={18} className="dropdown-select-chevron" aria-hidden="true"/>
    </button>
    {open&&<div id={`${id}-list`} role="listbox" aria-label={ariaLabel} className="dropdown-select-menu">
      {items.map((item,index)=><div key={item.value} id={`${id}-option-${index}`} role="option" aria-selected={item.value===value} data-active={active===index} onPointerDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(index)}>
        {item.icon&&<span className="dropdown-select-icon">{item.icon}</span>}
        <span className="dropdown-select-label">{item.label}</span>
        {item.value===value&&<Check size={16} className="dropdown-select-check"/>}
      </div>)}
    </div>}
  </div>;
}
