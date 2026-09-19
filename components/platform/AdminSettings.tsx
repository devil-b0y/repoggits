'use client';
import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronDown, Check, Plus, Search, GraduationCap, Briefcase, FlaskConical, ShieldCheck, AtSign, Layers, Sparkles } from 'lucide-react';
import { Notice, useData, send } from './shared';
import { AdminPage } from './admin/AdminFrame';
import Select from './Select';
import { branchCatalog } from '@/lib/branches';
import './admin/admin-system.css';
import './admin-settings-departments.css';
import './admin-settings.css';
type Settings={moderation:{requiredApprovals:1|2;allowedEmailDomains?:string[]};categories:{departments:string[];subjects:string[];tags:string[]};ai?:{enabled:boolean;hourlyLimit:number;dailyLimit:number;siteDailyLimit:number}};

// The branch catalog itself lives in lib/branches.ts, shared with the per-team-member Branch dropdown so the two can
// never drift apart. Only the group icons are chosen here: one representative icon per group is shown on every row,
// mirroring StackPicker's preset-menu pattern in TechnologyFields.tsx rather than a per-branch icon lookup.
const groupIcons:Record<string,typeof GraduationCap>={'B.Tech':GraduationCap,'M.Tech':FlaskConical,'Postgraduate & Diploma':Briefcase};
const departmentCatalog=branchCatalog.map(({group,items})=>({group,items,icon:groupIcons[group]??GraduationCap}));

/** "Pick from catalog" affordance for the free-text departments list: a button that opens a searchable menu and
 *  appends chosen branch names as new lines. The textarea stays the editable source of truth (other institutions
 *  using this platform aren't RGPV, so free text must keep working), this only offers a quicker way to fill it in. */
function DepartmentCatalogPicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const id=useId();
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const selected=value.split('\n').map(s=>s.trim()).filter(Boolean);
 const isSelected=(name:string)=>selected.some(s=>s.toLowerCase()===name.toLowerCase());
 function choose(name:string){
  if(isSelected(name))return;
  const trimmed=value.replace(/\s+$/,'');
  onChange(trimmed?`${trimmed}\n${name}`:name);
 }
 const q=query.trim().toLowerCase();
 const groups=departmentCatalog.map(g=>({...g,items:g.items.filter(name=>!q||name.toLowerCase().includes(q))})).filter(g=>g.items.length);
 return <div className="dept-catalog" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
  <button type="button" className="dept-catalog-toggle" aria-expanded={open} aria-controls={`${id}-menu`} onClick={()=>setOpen(!open)}><Plus size={15}/> Add from RGPV branch catalog<ChevronDown size={16} className="dept-catalog-chevron"/></button>
  {open&&<div className="dept-catalog-menu" id={`${id}-menu`}>
   <div className="dept-catalog-search"><Search size={15} aria-hidden="true"/><input autoFocus aria-label="Search branch catalog" placeholder="Search branches — CSE, IoT, MBA…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <div className="dept-catalog-list" role="listbox" aria-label="Branch catalog" aria-multiselectable="true">
    {groups.length?groups.map(({group,icon:Icon,items})=><div className="dept-catalog-group" key={group}><p>{group}</p>{items.map(name=><button type="button" key={name} role="option" aria-selected={isSelected(name)} onClick={()=>choose(name)}><Icon size={15}/><span>{name}</span>{isSelected(name)?<Check size={14}/>:<Plus size={13}/>}</button>)}</div>):<p className="dept-catalog-empty">No branches match that search.</p>}
   </div>
  </div>}
 </div>;
}

function Content(){
 const {data,loading,reload}=useData<Settings>('settings');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 // Select is a div-based custom control, not a real form field, so it cannot ride along in the form's FormData like
 // every other field here — it needs its own state, synced whenever fresh settings arrive from the server.
 const [requiredApprovals,setRequiredApprovals]=useState<1|2>(1);
 // The departments textarea is likewise promoted to controlled state, so the catalog picker can append a chosen
 // branch onto it as a new line.
 const [departments,setDepartments]=useState('');
 useEffect(()=>{if(data){setRequiredApprovals(data.moderation.requiredApprovals);setDepartments(data.categories.departments.join('\n'));}},[data]);
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');setNotice('');const f=new FormData(event.currentTarget);try{await send('admin/settings',{requiredApprovals,departments:String(f.get('departments')).split('\n').map(s=>s.trim()).filter(Boolean),subjects:String(f.get('subjects')).split('\n').map(s=>s.trim()).filter(Boolean),tags:String(f.get('tags')).split(',').map(s=>s.trim()).filter(Boolean),allowedEmailDomains:String(f.get('allowedEmailDomains')||'').split(/[\n,]/).map(s=>s.trim().replace(/^@/,'').toLowerCase()).filter(Boolean),ai:{enabled:f.get('aiEnabled')==='on',hourlyLimit:Number(f.get('aiHourlyLimit')),dailyLimit:Number(f.get('aiDailyLimit')),siteDailyLimit:Number(f.get('aiSiteDailyLimit'))}},'PATCH');setNotice('Settings saved. The approval count applies to future submissions; the domain list applies to new sign-ups.');await reload();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="editor admin-settings"><p className="muted admin-settings-links">Data retention is set in <Link className="inline-link" href="/admin/system#retention">System health</Link>; dashboards, logs and sessions are elsewhere in this panel.</p>{loading&&!data&&<p className="admin-note" role="status">Loading settings…</p>}{error&&<Notice error>{error}</Notice>}{notice&&<Notice>{notice}</Notice>}{data&&<form onSubmit={save}><fieldset disabled={busy}>
  <section className="form-section"><div className="form-section-title"><span className="settings-icon"><ShieldCheck size={20}/></span><span className="settings-step">01</span><div><h2>Review policy</h2><p>How many assigned educators must approve a submission before it goes live.</p></div></div><label>Approvals required<Select ariaLabel="Approvals required" value={String(requiredApprovals)} onChange={value=>setRequiredApprovals(Number(value) as 1|2)} options={[{value:'1',label:'One assigned reviewer'},{value:'2',label:'Two different assigned reviewers'}]}/><small>Each submission keeps the approval threshold in effect when it was submitted.</small></label></section>
  <section className="form-section"><div className="form-section-title"><span className="settings-icon"><AtSign size={20}/></span><span className="settings-step">02</span><div><h2>Who can sign up</h2><p>Limit self-service registration to specific email domains.</p></div></div><label>Allowed email domains<textarea name="allowedEmailDomains" defaultValue={(data.moderation.allowedEmailDomains||[]).join('\n')} rows={3} placeholder={'college.edu\nstudents.college.edu'}/><small>One domain per line, such as college.edu or gmail.com. Only new registrations are checked; existing accounts keep working. Leave empty to allow any email address.</small></label></section>
  <section className="form-section"><div className="form-section-title"><span className="settings-icon"><Layers size={20}/></span><span className="settings-step">03</span><div><h2>Organize the collective</h2><p>The departments, subjects, and technology tags every submission chooses from.</p></div></div><label>Departments<textarea name="departments" value={departments} onChange={e=>setDepartments(e.target.value)} rows={5}/></label><DepartmentCatalogPicker value={departments} onChange={setDepartments}/><small>One department per line. Type your own or add branches from the RGPV catalog above — this also drives the icon shown next to each department when students submit a project.</small><label>Subjects<textarea name="subjects" defaultValue={data.categories.subjects.join('\n')} rows={4}/><small>One subject per line.</small></label><label>Suggested technology tags<input name="tags" defaultValue={data.categories.tags.join(', ')}/><small>Separate tags with commas.</small></label></section>
  <section className="form-section"><div className="form-section-title"><span className="settings-icon"><Sparkles size={20}/></span><span className="settings-step">04</span><div><h2>Gemini project assistant</h2><p>Decide who can draft submissions with AI and how often. Every prompt is recorded in Admin › AI activity.</p></div></div><label className="checkbox-label"><input type="checkbox" name="aiEnabled" defaultChecked={data.ai?.enabled??true}/> Let signed-in members generate project drafts with Gemini</label><div className="form-row"><label>Drafts per account each hour<input type="number" name="aiHourlyLimit" min={1} max={100} required defaultValue={data.ai?.hourlyLimit??10}/></label><label>Drafts per account each day<input type="number" name="aiDailyLimit" min={1} max={500} required defaultValue={data.ai?.dailyLimit??40}/></label></div><label>Drafts for the whole site each day<input type="number" name="aiSiteDailyLimit" min={1} max={100000} required defaultValue={data.ai?.siteDailyLimit??300}/><small>Stops many accounts together from using up the shared API key. Pause a single account from Admin › AI activity.</small></label></section>
  <div className="editor-actions"><span/><button className="button blue" disabled={busy}>{busy?'Saving…':'Save settings'} <ArrowUpRight size={17}/></button></div>
 </fieldset></form>}</div>;
}
export default function AdminSettings(){return <AdminPage section="settings" title="Shape how the collective works." description="Review policy, sign-up access, and the categories every submission chooses from."><Content/></AdminPage>;}
