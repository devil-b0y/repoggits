'use client';
import { useCallback, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { useSession } from '../shared';
import { hasPermission } from '@/lib/admin/permissions';
import { DATE_PRESETS, DEVICE_TYPES, SESSION_STATUSES, type DatePreset, type PersonRef, type ProjectRef, type SessionStatus, type StatCard } from '@/lib/admin/types';
import { Sparkline } from './charts';
import { formatBytes, formatChange, formatDuration, formatNumber, formatPercent, viewerTimeZone } from './format';
import Select from '../Select';

// Building blocks every admin panel page shares: filters kept in the URL, data loading, the Advanced Filters bar,
// server-paged tables, pagination, exports, stat tiles and small display helpers.

export type FilterValues=Record<string,string>;

/**
 * Filter state kept in the address bar, so a filtered view survives a refresh and can be bookmarked or shared with
 * another administrator. Only keys present in `defaults` are read; values equal to their default stay out of the URL.
 * Changing any filter other than `page` returns to the first page.
 */
export function useUrlFilters<T extends FilterValues>(defaults:T) {
  const defaultsRef=useRef(defaults);
  const [values,setValues]=useState<T>(defaults);
  const valuesRef=useRef(values);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    const read=()=>{
      const params=new URLSearchParams(window.location.search),next:FilterValues={...defaultsRef.current};
      for(const key of Object.keys(next)){const value=params.get(key);if(value!==null)next[key]=value;}
      valuesRef.current=next as T;setValues(next as T);setReady(true);
    };
    read();window.addEventListener('popstate',read);
    return()=>window.removeEventListener('popstate',read);
  },[]);
  const update=useCallback((patch:Partial<T>)=>{
    const next:FilterValues={...valuesRef.current,...patch} as FilterValues;
    if('page' in next&&!('page' in patch))next.page=defaultsRef.current.page??'1';
    valuesRef.current=next as T;setValues(next as T);
    const params=new URLSearchParams(window.location.search);
    for(const [key,value] of Object.entries(next)){if(value===''||value===defaultsRef.current[key])params.delete(key);else params.set(key,value);}
    const query=params.toString();
    window.history.replaceState(window.history.state,'',`${window.location.pathname}${query?`?${query}`:''}${window.location.hash}`);
  },[]);
  const reset=useCallback(()=>update({...defaultsRef.current}),[update]);
  return {values,update,reset,ready};
}

/**
 * The query string for an admin API call: non-empty filters plus the viewer's time zone. A custom date range is left
 * out until both ends are chosen, so a half-filled range never produces an error.
 */
export function adminQuery(values:FilterValues,extra:FilterValues={}) {
  const merged={...values,...extra};
  if(merged.date==='custom'&&!(merged.from&&merged.to)){delete merged.date;delete merged.from;delete merged.to;}
  if(merged.date!=='custom'){delete merged.from;delete merged.to;}
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(merged))if(value!=='')params.set(key,value);
  if(!params.has('tz'))params.set('tz',viewerTimeZone());
  return params.toString();
}

// What each admin path last returned, for this tab and this tab only. Revisiting a section then paints its rows at
// once instead of waiting on a round trip to a database on another continent, and refreshes them behind the paint.
// Nothing is written to storage: signing out leaves the document, which is what empties this.
const adminCache=new Map<string,unknown>(),CACHE_LIMIT=60;
const peek=<T,>(path:string|null,enabled:boolean)=>enabled&&path?adminCache.get(path) as T|undefined:undefined;
/** Re-inserting on every write keeps the map in least-recently-used order, so a long session of filtering cannot grow it without bound. */
const remember=(path:string,body:unknown)=>{
  adminCache.delete(path);adminCache.set(path,body);
  if(adminCache.size>CACHE_LIMIT)adminCache.delete(adminCache.keys().next().value!);
};

/**
 * Loads /api/<path> whenever the path (including its query) changes, cancelling the request it replaces. A path this
 * tab has already loaded comes straight back from memory — rows on screen, nothing loading — and is refreshed behind
 * them; a path it has not keeps the previous data visible while the next loads. A refresh that fails leaves the last
 * good data on screen and reports the error beside it. pollMs refreshes in the background while the tab is visible.
 * Pass cache:false where the server audits every read, so that reading always reaches the server.
 */
export function useAdminData<T>(path:string|null,{pollMs=0,cache=true}:{pollMs?:number;cache?:boolean}={}) {
  const [tick,setTick]=useState(0);
  const shown=useRef(path),quiet=useRef(''),key=`${tick}#${path}`;
  const [state,setState]=useState<{data:T|null;error:string;loading:boolean}>(()=>{
    const first=peek<T>(path,cache);
    if(first!==undefined)quiet.current=key;
    return {data:first===undefined?null:first,error:'',loading:!!path&&first===undefined};
  });
  // Swapping in the cached rows during the render that changes path, rather than in an effect, keeps the loading state
  // from ever reaching the screen.
  if(shown.current!==path) {
    const hit=peek<T>(path,cache);
    shown.current=path;if(hit!==undefined)quiet.current=key;
    setState(current=>hit===undefined?{...current,loading:!!path}:{data:hit,error:'',loading:false});
  }
  useEffect(()=>{
    if(!path)return;
    const controller=new AbortController();
    if(quiet.current!==key)setState(current=>({...current,loading:true}));
    fetch(`/api/${path}`,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json'}})
      .then(async response=>{const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'The request could not be completed. Please try again.');if(cache)remember(path,body);setState({data:body as T,error:'',loading:false});})
      .catch(error=>{if(!controller.signal.aborted)setState(current=>({...current,error:(error as Error).message,loading:false}));});
    return()=>controller.abort();
  },[path,key,cache]);
  useEffect(()=>{
    if(!pollMs||!path)return;
    const timer=setInterval(()=>{if(document.visibilityState==='visible')setTick(value=>value+1);},pollMs);
    return()=>clearInterval(timer);
  },[pollMs,path]);
  const reload=useCallback(()=>setTick(value=>value+1),[]);
  return {...state,reload};
}

/** The current time, updated every `intervalMs`, for "12 sec ago" labels. */
export function useNow(intervalMs=1000) {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),intervalMs);return()=>clearInterval(timer);},[intervalMs]);
  return now;
}

/** A text box that reports its value once typing pauses (or on Enter), so searching never sends a request per keystroke. */
export function DebouncedInput({value,onCommit,delay=350,...props}:{value:string;onCommit:(value:string)=>void;delay?:number}&Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'>) {
  const [draft,setDraft]=useState(value);
  const committed=useRef(value),commit=useRef(onCommit);
  commit.current=onCommit;
  useEffect(()=>{if(value!==committed.current){committed.current=value;setDraft(value);}},[value]);
  useEffect(()=>{
    if(draft===committed.current)return;
    const timer=setTimeout(()=>{committed.current=draft;commit.current(draft);},delay);
    return()=>clearTimeout(timer);
  },[draft,delay]);
  return <input {...props} value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&draft!==committed.current){committed.current=draft;commit.current(draft);}props.onKeyDown?.(event);}}/>;
}

// ----- Advanced Filters -----
export type FilterOption={value:string;label:string};
export type FilterField=
  |{type:'search';name:string;label:string;placeholder?:string}
  |{type:'text';name:string;label:string;placeholder?:string}
  |{type:'select';name:string;label:string;options:readonly FilterOption[];allLabel?:string}
  |{type:'dateRange';presets?:readonly DatePreset[];allowAllTime?:boolean};
/** Options from a label map such as DEVICE_TYPES or ACTIVITY_FILTERS. */
export const optionsFrom=(record:Readonly<Record<string,string|{label:string}>>):FilterOption[]=>Object.entries(record).map(([value,entry])=>({value,label:typeof entry==='string'?entry:entry.label}));
export const optionsOf=(values:readonly string[]):FilterOption[]=>values.map(value=>({value,label:value}));

/**
 * The filter bar used on every log and list page. Search and the date range stay visible; other fields sit behind
 * "More filters", which opens by itself when one of them is already set (for example from a shared link).
 * `quickFilters` renders a row of one-click presets such as "Prompts only".
 */
export function AdvancedFilters({fields,values,onChange,onReset,quickFilters,children}:{fields:FilterField[];values:FilterValues;onChange:(patch:FilterValues)=>void;onReset:()=>void;quickFilters?:ReactNode;children?:ReactNode}) {
  const panelId=useId();
  const primary=fields.filter(field=>field.type==='search'||field.type==='dateRange');
  const secondary=fields.filter(field=>field.type!=='search'&&field.type!=='dateRange') as Extract<FilterField,{name:string}>[];
  const active=secondary.filter(field=>values[field.name]).length;
  const [expanded,setExpanded]=useState<boolean|null>(null);
  const open=expanded??active>0;
  const render=(field:FilterField)=>{
    if(field.type==='dateRange')return <DateRangeField key="date" values={values} onChange={onChange} presets={field.presets} allowAllTime={field.allowAllTime}/>;
    if(field.type==='search')return <label key={field.name} className="admin-filter-search">{field.label}<span><Search size={15} aria-hidden="true"/><DebouncedInput type="search" value={values[field.name]||''} placeholder={field.placeholder} onCommit={value=>onChange({[field.name]:value.trim()})}/></span></label>;
    if(field.type==='text')return <label key={field.name}>{field.label}<DebouncedInput type="text" value={values[field.name]||''} placeholder={field.placeholder} spellCheck={false} onCommit={value=>onChange({[field.name]:value.trim()})}/></label>;
    return <label key={field.name}>{field.label}<Select ariaLabel={field.label} value={values[field.name]||''} onChange={value=>onChange({[field.name]:value})} options={[{value:'',label:field.allLabel??'All'},...field.options.map(option=>({value:option.value,label:option.label}))]}/></label>;
  };
  return <section className="admin-filters panel" aria-label="Filters">
    <div className="admin-filters-row">
      {primary.map(render)}
      {secondary.length>0&&<button type="button" className="button outline" aria-expanded={open} aria-controls={panelId} onClick={()=>setExpanded(!open)}><SlidersHorizontal size={15} aria-hidden="true"/> More filters{active?` (${active})`:''}</button>}
      <button type="button" className="text-button" onClick={()=>{setExpanded(null);onReset();}}><RotateCcw size={14} aria-hidden="true"/> Reset filters</button>
    </div>
    {quickFilters&&<div className="admin-quick-filters" role="group" aria-label="Quick filters">{quickFilters}</div>}
    {secondary.length>0&&<div id={panelId} className="admin-filters-grid" hidden={!open}>{secondary.map(render)}</div>}
    {children}
  </section>;
}
function DateRangeField({values,onChange,presets=['today','yesterday','7d','30d','90d','custom'],allowAllTime=false}:{values:FilterValues;onChange:(patch:FilterValues)=>void;presets?:readonly DatePreset[];allowAllTime?:boolean}) {
  const preset=values.date??'';
  return <div className="admin-date-range" role="group" aria-label="Date range">
    <label>Date range<Select ariaLabel="Date range" value={preset} onChange={value=>onChange(value==='custom'?{date:'custom'}:{date:value,from:'',to:''})} options={[...(allowAllTime?[{value:'',label:'All time'}]:[]),...presets.map(option=>({value:option,label:DATE_PRESETS[option]}))]}/></label>
    {preset==='custom'&&<><label>From<input type="datetime-local" value={values.from||''} max={values.to||undefined} onChange={event=>onChange({from:event.target.value})}/></label><label>To<input type="datetime-local" value={values.to||''} min={values.from||undefined} onChange={event=>onChange({to:event.target.value})}/></label></>}
  </div>;
}
/** A one-click preset for AdvancedFilters' quickFilters row. */
export function QuickFilter({pressed,onClick,children}:{pressed:boolean;onClick:()=>void;children:ReactNode}) {
  return <button type="button" className="admin-chip" aria-pressed={pressed} onClick={onClick}>{children}</button>;
}

// ----- Tables, pagination and export -----
export type Column<T>={key:string;label:string;render:(row:T)=>ReactNode;sortKey?:string;className?:string};
/** A server-sorted table. Below 760px each row becomes a card with its column labels. */
export function DataTable<T,>({caption,columns,rows,rowKey,sort,dir,onSort,empty='Nothing matches these filters.',busy=false}:{caption:string;columns:Column<T>[];rows:T[];rowKey:(row:T)=>string;sort?:string;dir?:string;onSort?:(sort:string,dir:'asc'|'desc')=>void;empty?:ReactNode;busy?:boolean}) {
  return <div className="admin-table-wrap" aria-busy={busy}>
    <table className="admin-table"><caption className="sr-only">{caption}</caption>
      <thead><tr>{columns.map(column=>{
        const active=!!column.sortKey&&sort===column.sortKey;
        return <th key={column.key} scope="col" className={column.className} aria-sort={active?(dir==='asc'?'ascending':'descending'):undefined}>
          {column.sortKey&&onSort?<button type="button" onClick={()=>onSort(column.sortKey!,active&&dir!=='asc'?'asc':'desc')}>{column.label}{active&&(dir==='asc'?<ArrowUp size={13} aria-hidden="true"/>:<ArrowDown size={13} aria-hidden="true"/>)}</button>:column.label}
        </th>;
      })}</tr></thead>
      <tbody>{rows.length?rows.map(row=><tr key={rowKey(row)}>{columns.map(column=><td key={column.key} className={column.className} data-label={column.label}>{column.render(row)}</td>)}</tr>):<tr><td className="admin-table-empty" colSpan={columns.length}>{empty}</td></tr>}</tbody>
    </table>
  </div>;
}
export function Pager({page,pageSize,total,totalCapped=false,count,onPage}:{page:number;pageSize:number;total:number;totalCapped?:boolean;count:number;onPage:(page:number)=>void}) {
  const pages=Math.max(1,Math.ceil(total/pageSize)),first=count?(page-1)*pageSize+1:0,last=(page-1)*pageSize+count;
  const hasNext=totalCapped?count===pageSize:page<pages;
  return <nav className="admin-pager" aria-label="Pagination">
    <span>{count?`Showing ${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(total)}${totalCapped?'+':''}`:'No results'}</span>
    <div><button type="button" className="button outline" disabled={page<=1} onClick={()=>onPage(page-1)}><ChevronLeft size={15} aria-hidden="true"/> Previous</button><span aria-live="polite">Page {formatNumber(page)} of {formatNumber(pages)}{totalCapped?'+':''}</span><button type="button" className="button outline" disabled={!hasNext} onClick={()=>onPage(page+1)}>Next <ChevronRight size={15} aria-hidden="true"/></button></div>
  </nav>;
}
/** Download links for the current results. `endpoint` is the list endpoint, e.g. "admin/logs"; paging is dropped so the export covers every match. */
export function ExportButtons({endpoint,query}:{endpoint:string;query:string}) {
  const params=new URLSearchParams(query);for(const key of ['page','pageSize','cursor'])params.delete(key);
  const href=(format:'csv'|'json')=>{const copy=new URLSearchParams(params);copy.set('format',format);return `/api/${endpoint}/export?${copy}`;};
  return <div className="admin-export" role="group" aria-label="Export current results"><span>Export current results</span><a className="button outline" href={href('csv')}><Download size={14} aria-hidden="true"/> CSV</a><a className="button outline" href={href('json')}><Download size={14} aria-hidden="true"/> JSON</a></div>;
}

// ----- Stat tiles -----
const formatStat=(card:StatCard)=>card.format==='bytes'?formatBytes(card.value):card.format==='duration'?formatDuration(card.value):card.format==='percent'?formatPercent(card.value):formatNumber(card.value);
/** A statistic linking to its detail page: value, percentage change against the previous period (StatCard.change is a percentage) and a trend line. */
export function StatTile({card}:{card:StatCard}) {
  // For failures and errors, going up is the bad direction.
  const upIsBad=/fail|error|denied|limit/i.test(card.key);
  const direction=card.change==null||card.change===0?'flat':card.change>0?'up':'down';
  const tone=direction==='flat'?'':(direction==='up')!==upIsBad?'good':'bad';
  return <Link className="admin-stat panel" href={card.href}>
    <span className="admin-stat-label">{card.label}</span>
    <strong className="admin-stat-value">{formatStat(card)}</strong>
    <span className={`admin-stat-change ${tone}`}>{direction==='up'&&<ArrowUp size={13} aria-hidden="true"/>}{direction==='down'&&<ArrowDown size={13} aria-hidden="true"/>}{card.change==null?card.hint??'No earlier period to compare':`${formatChange(card.change)} vs previous period`}</span>
    <Sparkline values={card.trend}/>
  </Link>;
}
export function StatGrid({cards,label}:{cards:StatCard[];label:string}) {
  return <div className="admin-stat-grid" role="list" aria-label={label}>{cards.map(card=><div role="listitem" key={card.key}><StatTile card={card}/></div>)}</div>;
}
/** A plain figure with no earlier period to compare against: analytics totals, "most common device" and the like. */
export type Fact={key:string;label:string;value:ReactNode;hint?:ReactNode;href?:string};
export function FactGrid({facts,label}:{facts:Fact[];label:string}) {
  const body=(fact:Fact)=><><span className="admin-stat-label">{fact.label}</span><strong className="admin-stat-value">{fact.value}</strong>{fact.hint&&<span className="admin-stat-hint">{fact.hint}</span>}</>;
  return <div className="admin-stat-grid" role="list" aria-label={label}>{facts.map(fact=><div role="listitem" key={fact.key}>
    {fact.href?<Link className="admin-stat panel" href={fact.href}>{body(fact)}</Link>:<div className="admin-stat panel">{body(fact)}</div>}
  </div>)}</div>;
}

// ----- Display helpers -----
export function Section({title,description,actions,children,id}:{title:string;description?:ReactNode;actions?:ReactNode;children:ReactNode;id?:string}) {
  const generated=useId(),headingId=`${id??generated}-title`;
  return <section className="admin-section panel" id={id} aria-labelledby={headingId}>
    <div className="admin-section-head"><div><h2 id={headingId}>{title}</h2>{description&&<p>{description}</p>}</div>{actions}</div>
    {children}
  </section>;
}
export function Badge({tone='neutral',children}:{tone?:'neutral'|'good'|'warn'|'bad'|'info';children:ReactNode}) {
  return <span className={`admin-badge ${tone}`}>{children}</span>;
}
export function PresenceBadge({status}:{status:SessionStatus}) {
  return <Badge tone={status==='online'?'good':'neutral'}><span className={`admin-dot ${status}`} aria-hidden="true"/>{SESSION_STATUSES[status]}</Badge>;
}
/** A person's name, linking to their activity page when the viewer may open it. */
export function PersonLink({person,fallback='Anonymous visitor'}:{person:PersonRef|null;fallback?:string}) {
  const {user}=useSession();
  if(!person)return <span className="muted">{fallback}</span>;
  return hasPermission(user,'users')?<Link className="inline-link" href={`/admin/users/${person.id}`}>{person.name}</Link>:<span>{person.name}</span>;
}
export function ProjectLink({project}:{project:ProjectRef|null}) {
  return project?<Link className="inline-link" href={`/projects/${project.id}`}>{project.title}</Link>:<span className="muted">—</span>;
}
/** An IP address, or why it is not shown: null means the viewer lacks the network permission. */
export function IpAddress({value}:{value:string|null}) {
  if(value===null)return <span className="muted" title="Requires the network permission">Hidden</span>;
  return value?<code>{value}</code>:<span className="muted">Unknown</span>;
}
export const deviceLabel=(deviceType:string)=>(DEVICE_TYPES as Record<string,string>)[deviceType]??deviceType;
export function DetailList({items}:{items:[ReactNode,ReactNode][]}) {
  return <dl className="admin-details">{items.map(([term,detail],index)=><div key={index}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl>;
}
