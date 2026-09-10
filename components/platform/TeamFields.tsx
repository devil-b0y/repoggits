'use client';
import { Plus, Trash2 } from 'lucide-react';
import { type TeamMember } from '@/lib/schema';
import { FilePicker } from './FilePicker';

export default function TeamFields({members,onChange}:{members:TeamMember[];onChange:(members:TeamMember[])=>void}) {
  function update(index:number,key:keyof TeamMember,value:string){onChange(members.map((m,i)=>i===index?{...m,[key]:value}:m));}
  return <div className="team-editor">{members.map((member,i)=><section className="team-editor-card" aria-label={`Team member ${i+1}`} key={i}>
    <div className="team-editor-heading"><h3>Team member {String(i+1).padStart(2,'0')}</h3><button type="button" className="icon-button" aria-label={`Remove member ${i+1}`} onClick={()=>onChange(members.filter((_,n)=>n!==i))}><Trash2 size={17}/></button></div>
    <div className="form-row"><label>Member name<input value={member.name} maxLength={100} onChange={e=>update(i,'name',e.target.value)}/></label><label>Member email<input type="email" value={member.email} onChange={e=>update(i,'email',e.target.value)}/></label></div>
    <div className="form-row"><label>College<select value={member.college} onChange={e=>update(i,'college',e.target.value)}><option value="">Select college</option><option>GGITS</option><option>GGCT</option></select></label><label>Branch<input value={member.branch} maxLength={100} placeholder="e.g. Computer Science" onChange={e=>update(i,'branch',e.target.value)}/></label></div>
    <div className="form-row"><label>Semester<select value={member.semester} onChange={e=>update(i,'semester',e.target.value)}><option value="">Select semester</option>{Array.from({length:8},(_,n)=><option value={String(n+1)} key={n}>{n+1}</option>)}</select></label><label>Contribution<input value={member.contribution} maxLength={200} placeholder="e.g. Backend development" onChange={e=>update(i,'contribution',e.target.value)}/></label></div>
    <FilePicker label={`Member ${i+1} photo`} kind="image" value={member.photoId} onChange={id=>update(i,'photoId',id)}/>
  </section>)}<button type="button" className="text-button" disabled={members.length>=20} onClick={()=>onChange([...members,{name:'',email:'',contribution:'',branch:'',semester:'',college:'',photoId:''}])}><Plus size={16}/> Add team member</button></div>;
}
