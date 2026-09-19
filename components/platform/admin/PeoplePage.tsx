'use client';
import { useState, type FocusEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, ClipboardList, Eye, Globe, GraduationCap, HeartPulse, Images, MessageSquareText, MonitorSmartphone, Plus, Radio, ScrollText, ShieldAlert, ShieldCheck, Tag, UserCog, Users, X, type LucideIcon } from 'lucide-react';
import type { Role } from '@/lib/schema';
import { Notice, ShowMore, useData, usePaged, send } from '../shared';
import { AdminPage } from './AdminFrame';
import { ADMIN_PERMISSIONS, PERMISSION_NAMES, type AdminPermission } from '@/lib/admin/permissions';
import { departmentIconFor } from '../Submit';
import Select from '../Select';
import { ease } from '../MotionKit';
import { rowFade, staggerGroup, tileRise, useAdminStill, useCollapse } from './AdminMotion';
import './admin-people.css';

// Admin › Roles & permissions: change a person's role, review assignments and (for Teacher-Admins) which admin
// panel sections they can open. Moved out of the review desk so that page is only ever about reviewing.

type ManagedUser={id:string;name:string;email:string;role:Role;scopes:string[];suspended:boolean;verified:boolean};
type ScopeEntry={kind:'department'|'subject';value:string};
// Admin panel permissions are stored as permission:<name> scopes beside the review assignments; the picker below
// shows only the department:/subject: entries and the ticked permissions are merged back in on save.
const PERSONAL_DATA:readonly AdminPermission[]=['prompt_content','network'];
// Same four sections the admin sidebar itself uses (see admin/nav.ts's ADMIN_NAV groups), so a Teacher-Admin's
// grant list reads as "which sidebar sections can they open" rather than an alphabetical wall of checkboxes.
// 'prompt_content' and 'network' are modifiers within other pages rather than sections of their own, so they get
// their own icon here instead of borrowing one from nav.ts.
const PERMISSION_GROUPS:{group:string;items:{key:AdminPermission;icon:LucideIcon}[]}[]=[
 {group:'Dashboard',items:[{key:'analytics',icon:BarChart3},{key:'live',icon:Radio}]},
 {group:'People',items:[{key:'users',icon:Users},{key:'sessions',icon:MonitorSmartphone}]},
 {group:'Projects',items:[{key:'media',icon:Images}]},
 {group:'Logs',items:[{key:'activity',icon:ScrollText},{key:'prompts',icon:MessageSquareText},{key:'prompt_content',icon:Eye},{key:'network',icon:Globe},{key:'security',icon:ShieldAlert},{key:'audit',icon:ClipboardList}]},
 {group:'Platform',items:[{key:'system',icon:HeartPulse}]},
];
const isPermissionScope=(scope:string)=>scope.startsWith('permission:');
const parseScopeText=(text:string):ScopeEntry[]=>text.split(',').map(s=>s.trim()).filter(Boolean).map(s=>{
 const sep=s.indexOf(':'),kind=s.slice(0,sep),v=s.slice(sep+1).trim();
 return sep>0&&(kind==='department'||kind==='subject')&&v?{kind,value:v} as ScopeEntry:null;
}).filter((e):e is ScopeEntry=>!!e);
const scopeText=(entries:ScopeEntry[])=>entries.map(e=>`${e.kind}:${e.value}`).join(', ');

/** Chip list of a Teacher-Admin's department:/subject: review assignments, with a searchable, icon-labelled
 *  catalog to add more from (the same department catalog and icon mapping Submit.tsx and AdminSettings.tsx use) —
 *  or type a name that isn't in either list, since not every institution's departments are in the RGPV catalog. */
function ScopePicker({value,onChange,departments,subjects}:{value:string;onChange:(value:string)=>void;departments:string[];subjects:string[]}){
 const entries=parseScopeText(value);
 const [kind,setKind]=useState<'department'|'subject'>('department');
 const [query,setQuery]=useState(''),[open,setOpen]=useState(false);
 const catalog=kind==='department'?departments:subjects;
 const already=(name:string)=>entries.some(e=>e.kind===kind&&e.value.toLowerCase()===name.trim().toLowerCase());
 const filtered=catalog.filter(name=>!already(name)&&(!query.trim()||name.toLowerCase().includes(query.trim().toLowerCase())));
 const still=useAdminStill();
 const {visible:menuVisible,onExitComplete:menuExited}=useCollapse(open);
 function add(name:string){
  const trimmed=name.trim();
  if(!trimmed||already(trimmed))return;
  onChange(scopeText([...entries,{kind,value:trimmed}]));
  setQuery('');
 }
 function remove(at:number){onChange(scopeText(entries.filter((_,i)=>i!==at)));}
 return <motion.div className="scope-picker" variants={rowFade} initial={still?false:'hidden'} animate="show" onBlur={(event:FocusEvent<HTMLDivElement>)=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
  {entries.length>0&&<motion.div className="scope-chips" variants={staggerGroup} initial={still?false:'hidden'} animate="show">{entries.map((entry,i)=>{
   const Icon=entry.kind==='department'?departmentIconFor(entry.value):Tag;
   return <motion.span className="scope-chip" key={`${entry.kind}:${entry.value}:${i}`} variants={tileRise} layout={still?false:'position'}><Icon size={14}/><span>{entry.value}</span><motion.button type="button" aria-label={`Remove ${entry.kind} ${entry.value}`} onClick={()=>remove(i)} whileHover={still?undefined:{opacity:1}} whileTap={still?undefined:{scale:.9}} transition={{duration:.15}}><X size={13}/></motion.button></motion.span>;
  })}</motion.div>}
  <div className="scope-add-row">
   <Select ariaLabel="Assignment kind" value={kind} onChange={v=>{setKind(v as 'department'|'subject');setQuery('');setOpen(false);}} options={[{value:'department',label:'Department',icon:<GraduationCap size={16}/>},{value:'subject',label:'Subject',icon:<Tag size={16}/>}]}/>
   <div className="scope-add-search">
    <input aria-label={kind==='department'?'Search or add a department':'Search or add a subject'} value={query} placeholder={kind==='department'?'Search or type a department…':'Search or type a subject…'}
     onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true);}}
     onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add(query);setOpen(false);}else if(e.key==='Escape')setOpen(false);}}/>
    <motion.button type="button" className="icon-button" aria-label="Add assignment" disabled={!query.trim()} onClick={()=>{add(query);setOpen(false);}} whileHover={still||!query.trim()?undefined:{y:-2}} whileTap={still||!query.trim()?undefined:{y:0}} transition={{duration:.2}}><Plus size={16}/></motion.button>
    {menuVisible&&<AnimatePresence initial={false} onExitComplete={menuExited}>
     {open&&<motion.div className="scope-menu" role="listbox" aria-label={kind==='department'?'Department catalog':'Subject catalog'}
      initial={still?false:{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:still?0:.16,ease}}>
      {filtered.length?filtered.map(name=>{const Icon=kind==='department'?departmentIconFor(name):Tag;
       return <button type="button" key={name} role="option" onMouseDown={e=>e.preventDefault()} onClick={()=>{add(name);setOpen(false);}}><Icon size={15}/><span>{name}</span><Plus size={13}/></button>;
      }):<p className="scope-menu-empty">{query.trim()?<>No catalog matches. Press Enter to add “{query.trim()}” as a custom {kind}.</>:'Every catalog entry is already assigned.'}</p>}
     </motion.div>}
    </AnimatePresence>}
   </div>
  </div>
  <small>Pick from the list or type your own, then press Enter or the add button.</small>
 </motion.div>;
}

function UserRow({user,onSaved,departments,subjects}:{user:ManagedUser;onSaved:()=>Promise<void>;departments:string[];subjects:string[]}){
 const [role,setRole]=useState(user.role),[scopes,setScopes]=useState(user.scopes.filter(s=>!isPermissionScope(s)).join(', ')),[permissions,setPermissions]=useState(()=>PERMISSION_NAMES.filter(p=>user.scopes.includes(`permission:${p}`))),[suspended,setSuspended]=useState(user.suspended),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const still=useAdminStill();
 // Grants only mean something for a Teacher-Admin, so a role change drops them instead of keeping them to reappear later.
 const savedScopes=()=>[...scopes.split(',').map(s=>s.trim()).filter(s=>s&&!isPermissionScope(s)),...(role==='teacher'?PERMISSION_NAMES.filter(p=>permissions.includes(p)).map(p=>`permission:${p}`):[])];
 return <div className="user-row panel"><div><strong>{user.name}</strong><p>{user.email}</p><small>{user.verified?'Email verified':'Email not verified'}</small></div><label>Role for {user.name}<Select ariaLabel={`Role for ${user.name}`} value={role} onChange={value=>setRole(value as Role)} options={[{value:'student',label:'Student',icon:<GraduationCap size={16}/>},{value:'teacher',label:'Teacher-Admin',icon:<UserCog size={16}/>},{value:'superadmin',label:'Super Admin',icon:<ShieldCheck size={16}/>}]}/></label><label>Review assignments<ScopePicker value={scopes} onChange={setScopes} departments={departments} subjects={subjects}/></label>{role==='teacher'&&<fieldset className="admin-permissions"><legend>Admin panel permissions</legend><div className="admin-permission-groups">{PERMISSION_GROUPS.map(({group,items})=><div className="admin-permission-group" key={group}><h4>{group}</h4><motion.div className="admin-permission-grid" variants={staggerGroup} initial={still?false:'hidden'} animate="show">{items.map(({key:p,icon:Icon})=>{const checked=permissions.includes(p);return <motion.label className={`admin-permission-toggle${checked?' is-checked':''}`} key={p} variants={rowFade} whileTap={still?undefined:{scale:.98}} transition={{duration:.15}}><input type="checkbox" checked={checked} onChange={e=>{const next=e.target.checked;setPermissions(list=>next?[...list,p]:list.filter(item=>item!==p));}}/><Icon size={17}/><span>{ADMIN_PERMISSIONS[p]}</span>{PERSONAL_DATA.includes(p)&&<span className="status-tag">personal data</span>}</motion.label>;})}</motion.div></div>)}</div><small>Saving signs {user.name} out, so changed permissions apply straight away.</small></fieldset>}{role==='superadmin'&&<p className="admin-permissions muted">Super Admins have every permission.</p>}<label className="checkbox-label"><input type="checkbox" checked={suspended} onChange={e=>setSuspended(e.target.checked)}/> Suspended</label><button className="button outline" disabled={busy} onClick={async()=>{setError('');setBusy(true);try{await send('admin/users',{id:user.id,role,scopes:savedScopes(),suspended},'PATCH');await onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Saving…':'Save user'}</button>{error&&<Notice error>{error}</Notice>}</div>;
}

function Roles(){
 const {data,error,loading,reload}=useData<{users:ManagedUser[]}>('admin');
 const settings=useData<{categories:{departments:string[];subjects:string[]}}>('settings');
 const departments=settings.data?.categories.departments||[],subjects=settings.data?.categories.subjects||[];
 const people=usePaged(data?.users||[],25);
 if(loading&&!data)return <p className="muted" role="status">Loading people…</p>;
 return <>{error&&<Notice error>{error}</Notice>}{people.visible.map(u=><UserRow user={u} key={u.id} onSaved={reload} departments={departments} subjects={subjects}/>)}<ShowMore remaining={people.remaining} onClick={people.showMore} noun="people"/></>;
}

export default function PeoplePage(){
 return <AdminPage section="people" title="Roles & permissions" description="Change a person's role, their review assignments, and — for Teacher-Admins — which admin panel sections they can open.">
  <Roles/>
 </AdminPage>;
}
