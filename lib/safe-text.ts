// Text that reaches activity logs and the admin panel is kept on one plain line: control characters (CR/LF could
// forge extra lines in an exported log), zero-width and bidirectional-override characters become spaces, runs of
// space collapse, and the length is capped. The ranges are built from code points so none appears literally here.
const UNSAFE_RANGES:[number,number][]=[[0x00,0x1f],[0x7f,0x9f],[0x200b,0x200f],[0x2028,0x202e],[0x2066,0x2069],[0xfeff,0xfeff]];
const UNSAFE=new RegExp(`[${UNSAFE_RANGES.map(([from,to])=>`${String.fromCharCode(from)}-${String.fromCharCode(to)}`).join('')}]`,'g');
const BACKSLASH=String.fromCharCode(92);

export function cleanText(value:unknown,max=200):string {
  if(typeof value!=='string')return '';
  return value.replace(UNSAFE,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
// A same-site path without its query string or fragment, which can carry reset tokens, codes or search text.
export function cleanPath(value:unknown):string {
  const text=cleanText(value,2048).split(/[?#]/)[0];
  if(!text.startsWith('/')||text.startsWith('//')||text.includes(BACKSLASH))return '';
  return text.slice(0,300);
}
