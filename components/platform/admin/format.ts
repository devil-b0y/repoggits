// Number, size, duration and time formatting shared by the admin pages and charts. Admin content renders only in the
// browser (behind the session gate), so the viewer's locale is used throughout.

const whole=new Intl.NumberFormat(undefined,{maximumFractionDigits:0});
const compact=new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1});
export const formatNumber=(value:number|null|undefined)=>value==null||Number.isNaN(value)?'—':Math.abs(value)>=100000?compact.format(value):Number.isInteger(value)?whole.format(value):value.toLocaleString(undefined,{maximumFractionDigits:1});
export const formatPercent=(value:number|null|undefined)=>value==null?'—':`${value.toLocaleString(undefined,{maximumFractionDigits:1})}%`;
/** A percentage change such as +12.5% (the value is already a percentage). */
export const formatChange=(value:number|null|undefined)=>value==null?'—':`${value>0?'+':value<0?'−':''}${Math.abs(value).toLocaleString(undefined,{maximumFractionDigits:1})}%`;
export function formatBytes(bytes:number|null|undefined) {
  if(bytes==null)return '—';
  const units=['B','KB','MB','GB','TB'];let value=bytes,unit=0;
  while(value>=1024&&unit<units.length-1){value/=1024;unit++;}
  return `${value.toLocaleString(undefined,{maximumFractionDigits:unit?1:0})} ${units[unit]}`;
}
export function formatDuration(ms:number|null|undefined) {
  if(ms==null)return '—';
  if(ms<1000)return `${Math.round(ms)} ms`;
  const seconds=Math.round(ms/1000);
  if(seconds<60)return `${(ms/1000).toLocaleString(undefined,{maximumFractionDigits:1})} s`;
  const minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60),days=Math.floor(hours/24);
  if(minutes<60)return `${minutes} min ${seconds%60} s`;
  if(hours<24)return `${hours} h ${minutes%60} min`;
  return `${days} d ${hours%24} h`;
}
export function timeAgo(iso:string|null|undefined,now=Date.now()) {
  if(!iso)return '—';
  const seconds=Math.max(0,Math.round((now-Date.parse(iso))/1000));
  if(seconds<5)return 'just now';
  if(seconds<60)return `${seconds} sec ago`;
  if(seconds<3600)return `${Math.floor(seconds/60)} min ago`;
  if(seconds<86400)return `${Math.floor(seconds/3600)} h ago`;
  return `${Math.floor(seconds/86400)} d ago`;
}
export const formatDateTime=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'—';
export const formatTime=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'—';
export const viewerTimeZone=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{return 'UTC';}};
/** A chart bucket label from the API (local time such as 2026-09-15T14:00) for display; parsed as UTC so it is never shifted again. */
export function bucketLabel(label:string,bucket:'hour'|'day'|'week'='day',long=false) {
  const date=new Date(`${label}:00Z`);if(Number.isNaN(date.getTime()))return label;
  const day=date.toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
  if(bucket==='hour'){const time=date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit',timeZone:'UTC'});return long?`${day}, ${time}`:time;}
  return bucket==='week'&&long?`Week of ${day}`:day;
}
