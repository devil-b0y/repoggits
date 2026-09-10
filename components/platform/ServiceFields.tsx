'use client';
import { Plus, Trash2 } from 'lucide-react';
import type { ProjectData } from '@/lib/schema';

export default function ServiceFields({services,onChange}:{services:ProjectData['services'];onChange:(services:ProjectData['services'])=>void}) {
  function update(index:number,key:'name'|'purpose'|'url',value:string){onChange(services.map((s,i)=>i===index?{...s,[key]:value}:s));}
  return <div className="services-editor"><h3>Services used</h3><p>List hosting, cloud databases, APIs, and tools. Add their charges in the cost section below.</p>{services.map((service,i)=><div className="service-editor-card" key={i}><div className="form-row"><label>Service name<input value={service.name} maxLength={100} placeholder="e.g. Neon" onChange={e=>update(i,'name',e.target.value)}/></label><label>Service URL (optional)<input type="url" value={service.url} onChange={e=>update(i,'url',e.target.value)}/></label></div><label>What did you use it for?<input value={service.purpose} maxLength={300} placeholder="e.g. PostgreSQL database for project data" onChange={e=>update(i,'purpose',e.target.value)}/></label><button className="text-button" type="button" aria-label={`Remove service ${i+1}`} onClick={()=>onChange(services.filter((_,n)=>i!==n))}><Trash2 size={15}/> Remove service</button></div>)}<button type="button" className="text-button" disabled={services.length>=30} onClick={()=>onChange([...services,{name:'',purpose:'',url:''}])}><Plus size={16}/> Add service</button></div>;
}
