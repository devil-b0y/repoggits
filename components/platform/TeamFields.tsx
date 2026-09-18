'use client';
import { Plus, Trash2 } from 'lucide-react';
import { type TeamMember } from '@/lib/schema';
import { FilePicker, SQUARE_ASPECT } from './FilePicker';
import Select from './Select';

export default function TeamFields({members,onChange}:{members:TeamMember[];onChange:(members:TeamMember[])=>void}) {
  function update(index:number,key:keyof TeamMember,value:string){onChange(members.map((m,i)=>i===index?{...m,[key]:value}:m));}
  return <div className="team-editor">{members.map((member,i)=><section className="team-editor-card" aria-label={`Team member ${i+1}`} key={i}>
    <div className="team-editor-heading"><h3>Team member {String(i+1).padStart(2,'0')}</h3><button type="button" className="icon-button" aria-label={`Remove member ${i+1}`} onClick={()=>onChange(members.filter((_,n)=>n!==i))}><Trash2 size={17}/></button></div>
    <div className="form-row"><label>Member name<input value={member.name} maxLength={100} onChange={e=>update(i,'name',e.target.value)}/></label><label>Member email<input type="email" value={member.email} onChange={e=>update(i,'email',e.target.value)}/></label></div>
    <label>Member roll number<input value={member.rollNumber||''} maxLength={60} onChange={e=>update(i,'rollNumber',e.target.value)} placeholder="e.g. 0201CS231001"/><small>Visible to the project team and reviewers; not shown on the public project page.</small></label>
    {i>0&&<button type="button" className="text-button" onClick={()=>onChange(members.map((m,n)=>n===i?{...m,college:m.college||members[0].college,branch:m.branch||members[0].branch,semester:m.semester||members[0].semester}:m))}>Use first member’s college, branch & semester in empty fields</button>}
    <div className="form-row"><label>College<Select ariaLabel="College" value={member.college} onChange={value=>update(i,'college',value)} options={[{value:'',label:'Select college'},'GGITS','GGCT']}/></label><label>Branch<input value={member.branch} maxLength={100} placeholder="e.g. Computer Science" onChange={e=>update(i,'branch',e.target.value)}/></label></div>
    <div className="form-row"><label>Semester<Select ariaLabel="Semester" value={member.semester} onChange={value=>update(i,'semester',value)} options={[{value:'',label:'Select semester'},...Array.from({length:8},(_,n)=>String(n+1))]}/></label><label>Contribution<input value={member.contribution} maxLength={200} placeholder="e.g. Backend development" onChange={e=>update(i,'contribution',e.target.value)}/></label></div>
    <FilePicker label={`Member ${i+1} photo`} kind="image" aspect={SQUARE_ASPECT} value={member.photoId} onChange={id=>update(i,'photoId',id)}/>
  </section>)}<button type="button" className="text-button" disabled={members.length>=20} onClick={()=>onChange([...members,{name:'',email:'',contribution:'',branch:'',semester:'',college:'',photoId:''}])}><Plus size={16}/> Add team member</button></div>;
}
