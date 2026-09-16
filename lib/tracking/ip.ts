import { isIP } from 'node:net';
import type { NextRequest } from 'next/server';
import { trustedProxyHops } from './config';

// One address as a proxy wrote it: brackets, ports and IPv6 zone ids removed, IPv4-mapped IPv6 shown as IPv4.
export function normalizeIp(value:string):string {
  let text=value.trim().replace(/^"|"$/g,'');
  if(text.startsWith('[')){const end=text.indexOf(']');if(end<0)return '';text=text.slice(1,end);}
  else if(/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(text))text=text.slice(0,text.lastIndexOf(':'));
  const zone=text.indexOf('%');if(zone>=0)text=text.slice(0,zone);
  const mapped=/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(text);if(mapped)text=mapped[1];
  return text.length<=45&&isIP(text)?text.toLowerCase():'';
}

/**
 * next start fills X-Forwarded-For from the socket only when the request has none, and nginx
 * ($proxy_add_x_forwarded_for) and Caddy append the address they saw. So with N trusted proxies the N-th entry
 * from the right is what the outermost one saw; entries further left were supplied by the client and can be forged.
 */
export function clientIp(request:NextRequest):string {
  const hops=trustedProxyHops();
  const chain=(request.headers.get('x-forwarded-for')||'').split(',').map(entry=>entry.trim()).filter(Boolean);
  if(!chain.length)return hops>=1?normalizeIp(request.headers.get('x-real-ip')||''):'';
  // A chain shorter than the configured hops means a proxy did not append; its left-most entry is the nearest one seen.
  return normalizeIp(chain[Math.max(0,chain.length-Math.max(1,hops))]);
}
