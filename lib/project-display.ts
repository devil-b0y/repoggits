export function projectDuration(start:string,end:string) {
  if(!start||!end)return '';
  const days=Math.max(1,Math.round((Date.parse(end)-Date.parse(start))/86400000));
  return Number.isFinite(days)&&end>=start?`${days} ${days===1?'day':'days'}`:'';
}

export function videoSource(data:{videoUrl:string;videoId:string}):{kind:'embed'|'file';url:string}|null {
  // An uploaded file always wins over a pasted link — it's the one with stored rotation/trim metadata.
  if(data.videoId)return {kind:'file',url:`/api/files/${data.videoId}`};
  const value=data.videoUrl;
  try {
    const url=new URL(value);
    if(!['http:','https:'].includes(url.protocol))return null;
    const host=url.hostname.toLowerCase();
    const youtube=['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'];
    const id=host==='youtu.be'?url.pathname.slice(1):youtube.includes(host)?(url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})\/?$/)?.[1]):null;
    if(id&&/^[\w-]{11}$/.test(id))return {kind:'embed',url:`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0`};
    if(/\.(mp4|webm)$/i.test(url.pathname))return {kind:'file',url:url.href};
    return null;
  }catch{return null;}
}
