'use client';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { BookmarkPlus, Command, CornerDownLeft, Keyboard, Pencil, Search, Star, Trash2, X } from 'lucide-react';
import { useSession } from '../shared';
import { ADMIN_NAV, canOpenSection, type AdminNavItem, type AdminSection } from './nav';
import { ease } from '../MotionKit';
import './admin-tools.css';

/**
 * The admin panel's command palette: Ctrl/⌘ K from anywhere in the panel jumps to any section, to a saved view, or
 * back to somewhere visited recently. It lists a section only when `canOpenSection` says this viewer may open it —
 * the same predicate the sidebar uses — so it can never advertise a section that would answer 403.
 *
 * Saved views build on the filters the pages already keep in the address bar: a view is nothing but
 * `pathname + search`, named and kept in this browser, so "failed logins, last 30 days" is one keystroke away.
 */

type SavedView={id:string;name:string;path:string;savedAt:string};
type Row={key:string;kind:'section'|'view'|'action';group:string;label:string;hint:string;icon:ReactNode;view?:SavedView;run:()=>void};

const EASE=[ease[0],ease[1],ease[2],ease[3]] as [number,number,number,number];
const RECENT_LIMIT=5,VIEW_LIMIT=24,NAME_LIMIT=80;
const viewsKey=(userId:string)=>`repoggits.admin.views.v1:${userId}`;
const recentKey=(userId:string)=>`repoggits.admin.recent.v1:${userId}`;

/** Natural words an administrator might reach for, per section. Kept here so the shared `nav.ts` stays untouched. */
const KEYWORDS:Record<AdminSection,string>={
  overview:'dashboard home summary start stats kpi tiles today',
  live:'realtime real time online now presence who is here monitoring',
  analytics:'charts graphs metrics reports trends insights retention cohorts',
  users:'people accounts members students teachers directory profiles suspend',
  sessions:'devices logins signed in sign out revoke end session tokens',
  people:'roles permissions access control grants scopes admins staff teacher admin',
  projects:'project analytics popular most viewed downloads submissions departments tags',
  library:'projects catalog browse archive files versions submissions gallery',
  logs:'activity events history trail global log page views everything',
  prompts:'ai prompts gemini requests conversation log tokens model',
  security:'failed logins threats incidents server errors exceptions log breach',
  audit:'admin actions accountability compliance history trail log who did what',
  ai:'gemini usage tokens spend model llm assistant cost',
  aiActivity:'ai activity bot requests live assistant stream',
  system:'health status uptime storage disk retention server maintenance',
  database:'db sql tables schema rows query manager maintenance',
  backups:'backup restore snapshot dump export archive recovery',
  settings:'configuration preferences options platform config toggles',
};

const norm=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const subsequence=(term:string,text:string)=>{let at=0;for(let i=0;i<text.length&&at<term.length;i++)if(text[i]===term[at])at++;return at===term.length;};
/** Every term has to land somewhere, and where it lands decides how high the row sorts. */
function score(terms:string[],label:string,extra:string){
  const whole=`${label} ${extra}`,words=whole.split(' ').filter(Boolean);
  let total=0;
  for(const term of terms){
    const best=label.startsWith(term)?120:words.some(word=>word.startsWith(term))?(label.includes(term)?90:70):whole.includes(term)?45:subsequence(term,label)?18:0;
    if(!best)return 0;
    total+=best;
  }
  return total;
}
/** The section a URL belongs to: the longest matching href, so /admin/logs/prompts is prompts and not the activity log. */
const sectionAt=(items:AdminNavItem[],pathname:string)=>items.filter(entry=>pathname===entry.href||pathname.startsWith(`${entry.href}/`)).sort((a,b)=>b.href.length-a.href.length)[0];
const isSavedView=(value:unknown):value is SavedView=>{
  const view=value as SavedView|null;
  // Only ever restore an in-panel path: a stored value is still user input by the time it comes back.
  return !!view&&typeof view==='object'&&typeof view.id==='string'&&typeof view.name==='string'&&typeof view.path==='string'&&view.path.startsWith('/admin');
};
function readList<T>(key:string,keep:(value:unknown)=>value is T):T[]{
  try{const raw=localStorage.getItem(key);const parsed=raw?JSON.parse(raw):null;return Array.isArray(parsed)?parsed.filter(keep):[];}catch{return [];}
}
/** False when this browser refuses to store anything, which the palette reports rather than failing quietly. */
function writeList(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
const freshId=()=>globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():`v${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
const isTyping=(target:EventTarget|null)=>{
  const element=target as HTMLElement|null;
  if(!element||typeof element.tagName!=='string')return false;
  return element.tagName==='INPUT'||element.tagName==='TEXTAREA'||element.tagName==='SELECT'||element.isContentEditable;
};

export default function AdminCommandPalette(){
  const {user}=useSession();
  const router=useRouter(),pathname=usePathname();
  const listId=useId(),titleId=useId(),nameId=useId();
  const dialog=useRef<HTMLDialogElement>(null),search=useRef<HTMLInputElement>(null),nameField=useRef<HTMLInputElement>(null);
  const opener=useRef<HTMLElement|null>(null),viewsRef=useRef<SavedView[]>([]),recentRef=useRef<AdminSection[]>([]);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
  const [views,setViews]=useState<SavedView[]>([]),[recent,setRecent]=useState<AdminSection[]>([]);
  const [naming,setNaming]=useState<{id:string|null;name:string;path:string}|null>(null);
  const [status,setStatus]=useState(''),[help,setHelp]=useState(false);
  // Read after hydration so the server and the first client render agree.
  const [reduced,setReduced]=useState(false),[mac,setMac]=useState(false),[storageOff,setStorageOff]=useState(false);
  const sections=useMemo(()=>ADMIN_NAV.filter(entry=>canOpenSection(user,entry)),[user]);
  const meta=mac?'⌘':'Ctrl';

  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)'),sync=()=>setReduced(media.matches);
    sync();media.addEventListener('change',sync);
    return()=>media.removeEventListener('change',sync);
  },[]);
  useEffect(()=>{setMac(/mac|iphone|ipad|ipod/i.test(navigator.userAgent));},[]);

  // Saved views and recents are per account, so two people sharing a machine never see each other's.
  useEffect(()=>{
    const id=user?.id;
    if(!id){viewsRef.current=[];recentRef.current=[];setViews([]);setRecent([]);return;}
    const keys=new Set(ADMIN_NAV.map(entry=>entry.key as string));
    const storedViews=readList(viewsKey(id),isSavedView).slice(0,VIEW_LIMIT).map(view=>({...view,savedAt:view.savedAt||''}));
    const storedRecent=readList(recentKey(id),(value):value is AdminSection=>typeof value==='string'&&keys.has(value)).slice(0,RECENT_LIMIT);
    viewsRef.current=storedViews;recentRef.current=storedRecent;setViews(storedViews);setRecent(storedRecent);
    setStorageOff(!writeList(`repoggits.admin.probe`,1));
  },[user?.id]);

  useEffect(()=>{
    const id=user?.id,here=pathname&&sectionAt(sections,pathname);
    if(!id||!here)return;
    const next=[here.key,...recentRef.current.filter(key=>key!==here.key)].slice(0,RECENT_LIMIT);
    if(next.length===recentRef.current.length&&next.every((key,index)=>key===recentRef.current[index]))return;
    recentRef.current=next;setRecent(next);writeList(recentKey(id),next);
  },[pathname,sections,user?.id]);

  const applyViews=useCallback((next:SavedView[])=>{
    viewsRef.current=next;setViews(next);
    if(user?.id&&!writeList(viewsKey(user.id),next))setStorageOff(true);
  },[user?.id]);

  const openPalette=useCallback((withHelp=false)=>{
    opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    setQuery('');setActive(0);setNaming(null);setStatus('');setHelp(withHelp);setOpen(true);
  },[]);
  const requestClose=useCallback(()=>{setOpen(false);setNaming(null);},[]);
  /** Runs once the exit animation has finished, so the dialog closes on the frame the panel disappears. */
  const finishClose=useCallback(()=>{
    const element=dialog.current;
    if(element?.open)element.close();
    const back=opener.current;opener.current=null;
    if(back?.isConnected)back.focus();
  },[]);

  const openSection=useCallback((entry:AdminNavItem)=>{requestClose();router.push(entry.href);},[requestClose,router]);
  // A saved view carries its filters in the query string, and the pages read those from `location.search` when they
  // mount — so a saved view opens the way a bookmark would, rather than a push that would leave the filters as they are.
  const openView=useCallback((view:SavedView)=>{requestClose();window.location.assign(view.path);},[requestClose]);
  const startSave=useCallback(()=>{
    const path=`${window.location.pathname}${window.location.search}`,[here,rest='']=path.split('?');
    const entry=sectionAt(sections,here);
    const filters=[...new URLSearchParams(rest)].filter(([key])=>key!=='page'&&key!=='tz').map(([key,value])=>`${key}: ${value}`);
    const base=entry?entry.label:'Admin view';
    setStatus('');setHelp(false);
    setNaming({id:null,name:(filters.length?`${base} · ${filters.join(', ')}`:base).slice(0,NAME_LIMIT),path});
  },[sections]);
  const startRename=useCallback((view:SavedView)=>{setStatus('');setHelp(false);setNaming({id:view.id,name:view.name,path:view.path});},[]);
  const removeView=useCallback((view:SavedView)=>{
    applyViews(viewsRef.current.filter(saved=>saved.id!==view.id));
    setActive(0);setStatus(`Removed the saved view “${view.name}”.`);
  },[applyViews]);
  const commitName=useCallback(()=>{
    if(!naming)return;
    const name=naming.name.trim().slice(0,NAME_LIMIT);
    if(!name){setStatus('Give this view a name first.');return;}
    if(naming.id)applyViews(viewsRef.current.map(view=>view.id===naming.id?{...view,name}:view));
    else applyViews([{id:freshId(),name,path:naming.path,savedAt:new Date().toISOString()},...viewsRef.current].slice(0,VIEW_LIMIT));
    setNaming(null);setActive(0);setStatus(naming.id?`Renamed to “${name}”.`:`Saved “${name}”.`);
  },[applyViews,naming]);

  const rows=useMemo(()=>{
    const terms=norm(query).split(' ').filter(Boolean),out:Row[]=[];
    const sectionRow=(entry:AdminNavItem,group:string):Row=>({key:`${group}:${entry.key}`,kind:'section',group,label:entry.label,hint:entry.group,icon:<entry.icon size={16} aria-hidden="true"/>,run:()=>openSection(entry)});
    const viewRow=(view:SavedView):Row=>({key:`view:${view.id}`,kind:'view',group:'Saved views',label:view.name,hint:view.path,icon:<Star size={16} aria-hidden="true"/>,view,run:()=>openView(view)});
    const actions:Row[]=[
      {key:'action:save',kind:'action',group:'Actions',label:'Save this view…',hint:'Keep this page and its filters as a saved view',icon:<BookmarkPlus size={16} aria-hidden="true"/>,run:startSave},
      {key:'action:help',kind:'action',group:'Actions',label:'Keyboard shortcuts',hint:'Every shortcut this palette answers to',icon:<Keyboard size={16} aria-hidden="true"/>,run:()=>setHelp(value=>!value)},
    ];
    if(!terms.length){
      const lately=recent.map(key=>sections.find(entry=>entry.key===key)).filter((entry):entry is AdminNavItem=>!!entry);
      for(const entry of lately)out.push(sectionRow(entry,'Recently visited'));
      for(const view of views)out.push(viewRow(view));
      out.push(...actions);
      for(const entry of sections)if(!lately.includes(entry))out.push(sectionRow(entry,'Jump to a section'));
      return out;
    }
    const ranked=<T,>(items:T[],text:(item:T)=>[string,string],make:(item:T)=>Row)=>items
      .map(item=>{const [label,extra]=text(item);return {item,rank:score(terms,norm(label),norm(extra))};})
      .filter(entry=>entry.rank>0).sort((a,b)=>b.rank-a.rank).map(entry=>make(entry.item));
    out.push(...ranked(views,view=>[view.name,`saved view bookmark ${view.path}`],viewRow));
    out.push(...ranked(sections,entry=>[entry.label,`${entry.group} ${KEYWORDS[entry.key]}`],entry=>sectionRow(entry,'Sections')));
    out.push(...ranked(actions,row=>[row.label,`${row.hint} bookmark shortcuts keys help`],row=>row));
    return out;
  },[openSection,openView,query,recent,sections,startSave,views]);

  const index=rows.length?Math.min(active,rows.length-1):0;
  const optionId=(at:number)=>`${listId}-option-${at}`;
  useEffect(()=>{setActive(0);},[query]);
  useEffect(()=>{if(open&&!naming)document.getElementById(optionId(index))?.scrollIntoView({block:'nearest'});
  },[index,naming,open,rows.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const element=dialog.current;if(open&&element&&!element.open)element.showModal();},[open]);
  const nameToken=naming?`${naming.id??'new'}:${naming.path}`:'';
  useEffect(()=>{if(nameToken)nameField.current?.select();},[nameToken]);
  useEffect(()=>{if(open&&!nameToken)search.current?.focus();},[open,nameToken]);

  // The palette owns Ctrl/⌘ K everywhere inside the admin panel, the way every command palette does. "?" only opens
  // it where the key is not being typed into something.
  useEffect(()=>{
    if(!sections.length)return;
    const onKey=(event:KeyboardEvent)=>{
      if((event.metaKey||event.ctrlKey)&&!event.altKey&&(event.key==='k'||event.key==='K')){event.preventDefault();open?requestClose():openPalette();return;}
      if(event.key==='?'&&!event.metaKey&&!event.ctrlKey&&!open&&!isTyping(event.target)){event.preventDefault();openPalette(true);}
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[open,openPalette,requestClose,sections.length]);

  function onDialogKey(event:ReactKeyboardEvent<HTMLDialogElement>){
    if(event.key!=='Escape')return;
    // Handled here and never passed on, so Escape inside the palette can never close something behind it.
    event.preventDefault();event.stopPropagation();
    if(naming){setNaming(null);setStatus('');return;}
    requestClose();
  }
  function onSearchKey(event:ReactKeyboardEvent<HTMLInputElement>){
    const move=(step:number)=>{event.preventDefault();if(rows.length)setActive((index+step+rows.length)%rows.length);};
    if(event.key==='ArrowDown')return move(1);
    if(event.key==='ArrowUp')return move(-1);
    if(event.key==='Enter'){event.preventDefault();rows[index]?.run();return;}
    const view=rows[index]?.view;
    if(event.key==='F2'&&view){event.preventDefault();startRename(view);return;}
    if((event.key==='Backspace'||event.key==='Delete')&&(event.metaKey||event.ctrlKey)&&view){event.preventDefault();removeView(view);}
  }

  const groups:{name:string;items:{row:Row;at:number}[]}[]=[];
  rows.forEach((row,at)=>{
    const last=groups[groups.length-1];
    if(last&&last.name===row.group)last.items.push({row,at});else groups.push({name:row.group,items:[{row,at}]});
  });
  const panel={duration:reduced?0:.19,ease:EASE},fade={duration:reduced?0:.15,ease:EASE};
  const shortcuts:[string,string][]=[
    [`${meta} K`,'Open or close this palette'],['?','Open it with these shortcuts showing'],['↑ ↓','Move through the results'],
    ['Enter','Open whatever is highlighted'],['F2','Rename the highlighted saved view'],[`${meta} Backspace`,'Delete the highlighted saved view'],['Esc','Close the palette'],
  ];

  // Nothing to offer someone who cannot open a single section — and no launcher until the session has arrived.
  if(!sections.length)return null;

  return <>
    <button type="button" className="admin-palette-launch" aria-haspopup="dialog" aria-expanded={open} aria-label="Search admin — open the command palette" onClick={()=>openPalette()}>
      <Command size={14} aria-hidden="true"/><span className="admin-palette-launch-label">Search admin</span><kbd aria-hidden="true">{meta} K</kbd>
    </button>
    <dialog ref={dialog} className="admin-palette-dialog" aria-labelledby={titleId} onKeyDown={onDialogKey}
      onCancel={event=>{event.preventDefault();requestClose();}} onClose={()=>setOpen(false)}>
      <AnimatePresence onExitComplete={finishClose}>
        {open&&<motion.div key="scrim" className="admin-palette-backdrop" initial={reduced?false:{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={fade} onClick={requestClose}/>}
        {open&&<motion.div key="panel" className="admin-palette" initial={reduced?false:{opacity:0,y:-14,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:.985}} transition={panel}>
          <h2 id={titleId} className="admin-palette-sr">Admin command palette</h2>
          {naming?<form className="admin-palette-name" onSubmit={event=>{event.preventDefault();commitName();}}>
            <label htmlFor={nameId}>{naming.id?'Rename this saved view':'Name this saved view'}</label>
            <input id={nameId} ref={nameField} value={naming.name} maxLength={NAME_LIMIT} autoComplete="off"
              onChange={event=>setNaming(current=>current&&{...current,name:event.target.value})}/>
            <p className="admin-palette-path"><Star size={13} aria-hidden="true"/>{naming.path}</p>
            <div className="admin-palette-nameactions">
              <button type="button" className="button outline" onClick={()=>{setNaming(null);setStatus('');}}>Cancel</button>
              <button type="submit" className="button blue">{naming.id?'Save name':'Save view'}</button>
            </div>
          </form>:<>
            <div className="admin-palette-search">
              <Search size={18} aria-hidden="true"/>
              <input ref={search} className="admin-palette-input" type="text" role="combobox" autoComplete="off" spellCheck={false}
                aria-expanded aria-controls={listId} aria-autocomplete="list" aria-activedescendant={rows.length?optionId(index):undefined}
                aria-label="Search admin sections and saved views" placeholder="Search sections, saved views…"
                value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={onSearchKey}/>
              <button type="button" className="admin-palette-close" aria-label="Close the command palette" onClick={requestClose}><X size={16}/></button>
            </div>
            <div id={listId} className="admin-palette-list" role="listbox" aria-label="Admin sections and saved views">
              {groups.map(set=><div key={set.name} role="group" aria-label={set.name}>
                <p className="admin-palette-group" aria-hidden="true">{set.name}</p>
                {set.items.map(({row,at})=><div key={row.key} id={optionId(at)} role="option" aria-selected={at===index} data-active={at===index}
                  className="admin-palette-option" onMouseMove={()=>setActive(at)} onPointerDown={event=>event.preventDefault()} onClick={()=>row.run()}>
                  {at===index&&<motion.span className="admin-palette-cursor" layoutId="admin-palette-cursor" transition={{duration:reduced?0:.18,ease:EASE}} aria-hidden="true"/>}
                  <span className="admin-palette-icon">{row.icon}</span>
                  <span className="admin-palette-text">
                    <span className="admin-palette-label">{row.label}</span>
                    <span className="admin-palette-hint">{row.hint}</span>
                  </span>
                  {row.view&&<>
                    <span className="admin-palette-sr"> Saved view. Press F2 to rename it, or {meta} and Backspace to delete it.</span>
                    <span className="admin-palette-rowactions">
                      <button type="button" tabIndex={-1} className="admin-palette-rowaction" aria-label={`Rename ${row.label}`} onClick={event=>{event.stopPropagation();startRename(row.view!);}}><Pencil size={14}/></button>
                      <button type="button" tabIndex={-1} className="admin-palette-rowaction" aria-label={`Delete ${row.label}`} onClick={event=>{event.stopPropagation();removeView(row.view!);}}><Trash2 size={14}/></button>
                    </span>
                  </>}
                  <CornerDownLeft size={14} className="admin-palette-enter" aria-hidden="true"/>
                </div>)}
              </div>)}
              {!rows.length&&<p className="admin-palette-empty">Nothing matches “{query}”. Try a section name, a group such as “Logs”, or a plain word like “backup” or “permissions”.</p>}
            </div>
          </>}
          <div className="admin-palette-foot">
            <p className="admin-palette-count" role="status" aria-live="polite">{status||(naming?'':`${rows.length} ${rows.length===1?'result':'results'}`)}</p>
            <span className="admin-palette-keys" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> move<kbd>↵</kbd> open<kbd>esc</kbd> close</span>
            <button type="button" className="admin-palette-helpbtn" aria-expanded={help} onClick={()=>setHelp(value=>!value)}><Keyboard size={14} aria-hidden="true"/> Shortcuts</button>
          </div>
          <AnimatePresence initial={false}>
            {help&&<motion.dl className="admin-palette-help" initial={reduced?false:{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={fade}>
              <div>{shortcuts.map(([key,meaning])=><div key={key}><dt><kbd>{key}</kbd></dt><dd>{meaning}</dd></div>)}</div>
            </motion.dl>}
          </AnimatePresence>
          {storageOff&&<p className="admin-palette-note">This browser is not storing anything for this site, so saved views and recent sections last only while this page is open.</p>}
        </motion.div>}
      </AnimatePresence>
    </dialog>
  </>;
}
