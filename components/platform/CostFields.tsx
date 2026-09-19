'use client';

import {useId,useRef,useState} from 'react';
import {ChevronDown,Cloud,Cpu,Globe,MapPin,Plus,ShoppingBag,Store,Trash2,Wallet} from 'lucide-react';
import {hardwareParts,hardwareShops,modelsForPart,softwareServices} from '@/lib/cost-catalogue';
import {money} from '@/lib/project-display';
import type {ProjectData} from '@/lib/schema';
import {TechnologyMark} from './ProjectIdentity';
import Select from './Select';
import './cost-fields.css';

const CURRENCIES=[{value:'INR',label:'INR · ₹'},{value:'USD',label:'USD · $'},{value:'EUR',label:'EUR · €'},{value:'GBP',label:'GBP · £'}];

// A plain controlled number field cannot be emptied: clearing it sends '', Number('') is 0, and the 0 is written
// straight back under the cursor — so a price can only be replaced by selecting the 0 first. While this field has
// focus it shows exactly what was typed, empty included, and reports 0 upstream until a real number is there.
function NumberInput({label,value,min,step,max,onChange}:{label:string;value:number;min:number;step?:string;max?:number;onChange:(value:number)=>void}) {
  const [draft,setDraft]=useState<string|null>(null);
  return <label className="cost-number">{label}<input type="number" min={min} max={max} step={step} value={draft??(value||'')} placeholder="0"
    onChange={event=>{setDraft(event.target.value);onChange(Number(event.target.value)||0);}}
    onBlur={()=>setDraft(null)}/></label>;
}

// Suggestions only. A board newer than this catalogue is typed in and kept, which is the whole point of free text.
// A native <datalist> would be one line, but the browser draws that menu itself — unstyled, and jarring against a dark
// page. The suggestions are rendered as an ordinary menu instead, and the field stays a plain text input underneath.
function ModelInput({index,value,partName,onChange}:{index:number;value:string;partName:string;onChange:(value:string)=>void}) {
  const id=useId(),input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false);
  const models=modelsForPart(partName),query=value.trim().toLowerCase();
  const matches=models.filter(model=>!query||model.toLowerCase().includes(query));
  return <div className="cost-model" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}} onKeyDown={event=>{if(event.key==='Escape')setOpen(false);}}>
    <label htmlFor={id}>Model / part no.</label>
    <div className="cost-model-control">
      <input ref={input} id={id} aria-label={`Model or part number for part ${index+1}`} autoComplete="off" value={value} maxLength={60} placeholder={models[0]||'e.g. R3, Pico 2 W'}
        onFocus={()=>{if(models.length)setOpen(true);}} onChange={event=>{onChange(event.target.value);setOpen(true);}}/>
      {!!models.length&&<button type="button" aria-label={`Suggested models for part ${index+1}`} aria-expanded={open} aria-controls={`${id}-models`} onClick={()=>{setOpen(!open);input.current?.focus();}}><ChevronDown size={17}/></button>}
      {open&&!!matches.length&&<div className="cost-model-menu" id={`${id}-models`} role="listbox" aria-label="Suggested models">
        {matches.map(model=><button type="button" role="option" aria-selected={model===value} key={model} onPointerDown={event=>event.preventDefault()} onClick={()=>{onChange(model);setOpen(false);input.current?.focus();}}>{model}</button>)}
      </div>}
    </div>
  </div>;
}

export function shopHost(url:string) {
  if(!url.trim())return '';
  try{return new URL(/^https?:\/\//i.test(url)?url:`https://${url}`).hostname.replace(/^www\./,'');}catch{return '';}
}
// The shop's own favicon, asked of the shop itself — no third-party logo service is involved, so nobody is told which
// project pages are being read. A site that serves no icon at that path falls back to the generic mark.
function ShopMark({url}:{url:string}) {
  const host=shopHost(url),[failed,setFailed]=useState(false);
  return <span className="shop-mark" aria-hidden="true">{host&&!failed?<img src={`https://${host}/favicon.ico`} alt="" width={22} height={22} loading="lazy" onError={()=>setFailed(true)}/>:<Globe size={18}/>}</span>;
}

/** Online or in a shop, then the detail that matches: a website for one, a place for the other. */
function PurchaseSource({data,onChange}:{data:ProjectData;onChange:(patch:Partial<ProjectData>)=>void}) {
  const id=useId();
  const [open,setOpen]=useState(false);
  const modes=[{key:'online' as const,label:'Online store',Icon:Globe},{key:'store' as const,label:'Physical store',Icon:Store}];
  return <div className="buy-source">
    <div className="buy-source-head"><span><ShoppingBag size={17}/>Where did you buy the parts?</span><small>So the next team can find the same ones.</small></div>
    <div className="buy-modes" role="group" aria-label="Where did you buy the parts?">
      {modes.map(({key,label,Icon})=><button type="button" key={key} aria-pressed={data.purchaseMode===key} onClick={()=>onChange({purchaseMode:data.purchaseMode===key?'':key})}><Icon size={16}/>{label}</button>)}
    </div>

    {data.purchaseMode==='online'&&<div className="buy-fields">
      <div className="buy-shop" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}} onKeyDown={event=>{if(event.key==='Escape')setOpen(false);}}>
        <label htmlFor={`${id}-shop`}>Store</label>
        <div className="buy-shop-control">
          <ShopMark url={data.purchaseUrl||data.purchaseSource}/>
          <input id={`${id}-shop`} value={data.purchaseSource} maxLength={120} placeholder="Amazon, Robu.in, your own shop…" onChange={event=>onChange({purchaseSource:event.target.value})}/>
          <button type="button" aria-label="Choose from the online store catalogue" aria-expanded={open} aria-controls={`${id}-shops`} onClick={()=>setOpen(!open)}><ChevronDown size={18}/></button>
          {open&&<div className="buy-shop-menu" id={`${id}-shops`} aria-label="Online stores">
            {hardwareShops.map(shop=><button type="button" key={shop.name} aria-pressed={shop.name.toLowerCase()===data.purchaseSource.trim().toLowerCase()} onClick={()=>{onChange({purchaseSource:shop.name,purchaseUrl:`https://${shop.domain}`});setOpen(false);}}><ShopMark url={shop.domain}/><span>{shop.name}<small>{shop.domain}</small></span></button>)}
            <button type="button" className="buy-shop-custom" onClick={()=>setOpen(false)}><Globe size={18}/><span>Other / type your own<small>Enter the shop name and its link</small></span></button>
          </div>}
        </div>
      </div>
      <label className="buy-link">Website link<input type="url" value={data.purchaseUrl} placeholder="https://robu.in/product/…" onChange={event=>onChange({purchaseUrl:event.target.value})}/></label>
      {shopHost(data.purchaseUrl)&&<p className="buy-preview"><ShopMark url={data.purchaseUrl}/>Logo and link shown on your project page: <strong>{shopHost(data.purchaseUrl)}</strong></p>}
    </div>}

    {data.purchaseMode==='store'&&<div className="buy-fields">
      <label>Shop name<input value={data.purchaseSource} maxLength={120} placeholder="The shop or market you visited" onChange={event=>onChange({purchaseSource:event.target.value})}/></label>
      {/* The hint below sits inside this label, and a label's accessible name swallows its descendants — so the
          field is named explicitly instead of being announced as "Location An address in plain words is fine…". */}
      <label className="buy-link">Location<input aria-label="Location" value={data.purchaseLocation} maxLength={300} placeholder="Address, or paste a Google Maps link" onChange={event=>onChange({purchaseLocation:event.target.value})}/><small>An address in plain words is fine — a Maps link becomes a button on your project page.</small></label>
      {data.purchaseLocation.trim()&&<p className="buy-preview"><MapPin size={16}/>{/^https?:\/\//i.test(data.purchaseLocation.trim())?'Shown as a "Open in Maps" button.':'Shown as written on your project page.'}</p>}
    </div>}
  </div>;
}

/** Fills a cost row's name from a grouped catalogue. Typing a name the list does not hold stays entirely possible. */
function CostPicker({groups,label,value,placeholder,icon,onChange}:{groups:{group:string;items:{name:string;hint?:string}[]}[];label:string;value:string;placeholder:string;icon:typeof Cpu;onChange:(value:string)=>void}) {
  const id=useId(),input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false);
  return <div className="cost-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}} onKeyDown={event=>{if(event.key==='Escape')setOpen(false);}}>
    <label htmlFor={id}>{label}</label>
    <div className="cost-picker-control">
      <span className="cost-picker-mark"><TechnologyMark name={value||label} icon={icon}/></span>
      <input ref={input} id={id} value={value} maxLength={100} placeholder={placeholder} onChange={event=>onChange(event.target.value)}/>
      <button type="button" aria-label={`Choose from the ${label.toLowerCase()} catalogue`} aria-expanded={open} aria-controls={`${id}-menu`} onClick={()=>setOpen(!open)}><ChevronDown size={18}/></button>
      {open&&<div className="cost-picker-menu" id={`${id}-menu`} aria-label={`${label} catalogue`}>
        {groups.map(({group,items})=><div key={group}><p className="cost-picker-group">{group}</p>{/* The model hint is inside the button, and a button is named by its contents — so the part name is set
                explicitly, or this reads aloud as "ESP32 DevKit V1 · WROOM-32 · WROVER". */}
            {items.map(item=><button type="button" key={item.name} aria-label={item.name} aria-pressed={item.name.toLowerCase()===value.trim().toLowerCase()} onClick={()=>{onChange(item.name);setOpen(false);input.current?.focus();}}><TechnologyMark name={item.name} icon={icon}/><span>{item.name}{item.hint&&<small>{item.hint}</small>}</span><Plus size={15}/></button>)}</div>)}
        <button type="button" className="cost-picker-custom" onClick={()=>{setOpen(false);input.current?.focus();}}><TechnologyMark name="Custom item" icon={icon}/><span>Other / type your own</span></button>
      </div>}
    </div>
  </div>;
}

export default function CostFields({data,onChange}:{data:ProjectData;onChange:(patch:Partial<ProjectData>)=>void}) {
  const hardware=data.hardwareCosts.reduce((sum,row)=>sum+row.quantity*row.unitCost,0);
  const software=data.softwareCosts.reduce((sum,row)=>sum+row.amount,0);
  const patchHardware=(rows:ProjectData['hardwareCosts'])=>onChange({hardwareCosts:rows});
  const patchSoftware=(rows:ProjectData['softwareCosts'])=>onChange({softwareCosts:rows});
  return <div className="cost-fields">
    <label className="cost-currency">Currency<Select ariaLabel="Currency" value={data.currency} onChange={value=>onChange({currency:value as ProjectData['currency']})} options={CURRENCIES}/></label>

    {/* A hidden panel looks like a missing feature, so each type says which table it is not asking for and why. */}
    {data.type==='Software'&&<p className="cost-not-applicable"><Cpu size={17}/>Hardware parts are not asked for on a Software project. Change the project type to Hardware or Hybrid in <strong>The big idea</strong> to list boards, sensors and materials here.</p>}
    {data.type==='Hardware'&&<p className="cost-not-applicable"><Cloud size={17}/>Software and service costs are not asked for on a Hardware project. Change the project type to Software or Hybrid in <strong>The big idea</strong> to list hosting, APIs and licences here.</p>}

    {data.type!=='Software'&&<section className="cost-panel">
      <div className="cost-panel-head"><span className="cost-panel-icon"><Cpu size={20}/></span><div><h3>Hardware parts</h3><p>Boards, sensors, motors and materials you bought or printed.</p></div><span className="cost-panel-total">{data.currency} {money(hardware)}</span></div>
      {data.hardwareCosts.map((row,i)=><div className="cost-row" key={i}>
        <CostPicker groups={hardwareParts.map(({group,items})=>({group,items:items.map(part=>({name:part.name,hint:part.models?.slice(0,3).join(' · ')}))}))} label="Part name" icon={Cpu} value={row.name} placeholder="Search or type a part" onChange={name=>patchHardware(data.hardwareCosts.map((r,n)=>i===n?{...r,name}:r))}/>
        <ModelInput index={i} value={row.model} partName={row.name} onChange={model=>patchHardware(data.hardwareCosts.map((r,n)=>i===n?{...r,model}:r))}/>
        <NumberInput label="Quantity" min={1} max={10000} value={row.quantity} onChange={quantity=>patchHardware(data.hardwareCosts.map((r,n)=>i===n?{...r,quantity}:r))}/>
        <NumberInput label="Unit cost" min={0} step="0.01" value={row.unitCost} onChange={unitCost=>patchHardware(data.hardwareCosts.map((r,n)=>i===n?{...r,unitCost}:r))}/>
        <div className="cost-row-total"><span>Row total</span><output>{data.currency} {money(row.quantity*row.unitCost)}</output></div>
        <button type="button" className="cost-remove" aria-label={`Remove part ${i+1}`} onClick={()=>patchHardware(data.hardwareCosts.filter((_,n)=>i!==n))}><Trash2 size={16}/></button>
      </div>)}
      {!data.hardwareCosts.length&&<p className="cost-empty">No parts listed yet. Add the first one below.</p>}
      <button type="button" className="text-button cost-add" onClick={()=>patchHardware([...data.hardwareCosts,{name:'',model:'',quantity:1,unitCost:0}])}><Plus size={16}/> Add part</button>
      <label className="cost-date">Parts purchase date<input type="date" value={data.purchaseDate} onChange={e=>onChange({purchaseDate:e.target.value})}/></label>
      <PurchaseSource data={data} onChange={onChange}/>
    </section>}

    {data.type!=='Hardware'&&<section className="cost-panel">
      <div className="cost-panel-head"><span className="cost-panel-icon"><Cloud size={20}/></span><div><h3>Software & services</h3><p>Hosting, databases, APIs and licences the project pays for.</p></div>{!data.openSource&&<span className="cost-panel-total">{data.currency} {money(software)}</span>}</div>
      <label className="checkbox-label"><input type="checkbox" checked={data.openSource} onChange={e=>{onChange({openSource:e.target.checked,...(e.target.checked?{softwareCosts:[]}:{})});}}/> No software or service costs</label>
      {!data.openSource&&<>
        {data.softwareCosts.map((row,i)=><div className="cost-row" key={i}>
          <CostPicker groups={softwareServices.map(({group,items})=>({group,items:items.map(name=>({name}))}))} label="License, hosting, or tool" icon={Cloud} value={row.name} placeholder="Search or type a service" onChange={name=>patchSoftware(data.softwareCosts.map((r,n)=>i===n?{...r,name}:r))}/>
          <NumberInput label="Cost" min={0} step="0.01" value={row.amount} onChange={amount=>patchSoftware(data.softwareCosts.map((r,n)=>i===n?{...r,amount}:r))}/>
          <button type="button" className="cost-remove" aria-label={`Remove software cost ${i+1}`} onClick={()=>patchSoftware(data.softwareCosts.filter((_,n)=>i!==n))}><Trash2 size={16}/></button>
        </div>)}
        {!data.softwareCosts.length&&<p className="cost-empty">No services listed yet. Add the first one below.</p>}
        <button type="button" className="text-button cost-add" onClick={()=>patchSoftware([...data.softwareCosts,{name:'',amount:0}])}><Plus size={16}/> Add software cost</button>
      </>}
    </section>}

    <div className="cost-total"><span><Wallet size={19}/> Estimated project cost</span><output>{data.currency} {money(hardware+software)}</output></div>
  </div>;
}
