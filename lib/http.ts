import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { HttpError, requireCondition } from './errors';

export function json(value:unknown,status=200) {
  return NextResponse.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
// For a GET the browser may reuse: it keeps a private copy, checks it on every request, and receives an empty 304
// while the data is unchanged. Vary: Cookie stops one account's copy from answering for another.
export function revalidatedJson(request:NextRequest,value:unknown) {
  const body=JSON.stringify(value);
  const etag=`W/"${createHash('sha1').update(body).digest('base64url')}"`;
  const headers={'Cache-Control':'private, no-cache','ETag':etag,'Vary':'Cookie','X-Content-Type-Options':'nosniff'};
  if(request.headers.get('if-none-match')?.split(',').some(tag=>tag.trim()===etag))return new NextResponse(null,{status:304,headers});
  return new NextResponse(body,{headers:{...headers,'Content-Type':'application/json'}});
}
// next start gzips pages and static files but not what route handlers return, so text responses from the API are
// compressed here, which matters when no proxy sits in front. A response that is already encoded is left alone.
const gzipAsync=promisify(gzip);
const COMPRESSIBLE=/^(?:application\/(?:json|rss\+xml)|text\/)/i;
export async function compressed(request:Request,response:Response) {
  if(!response.body||response.headers.has('content-encoding')||!COMPRESSIBLE.test(response.headers.get('content-type')||'')||!/\bgzip\b/i.test(request.headers.get('accept-encoding')||''))return response;
  const body=Buffer.from(await response.arrayBuffer());
  const headers=new Headers(response.headers);headers.append('Vary','Accept-Encoding');
  if(body.length<1024)return new Response(body,{status:response.status,headers});
  headers.set('Content-Encoding','gzip');headers.delete('Content-Length');
  return new Response(new Uint8Array(await gzipAsync(body)),{status:response.status,headers});
}
export function originCheck(request:NextRequest) {
  const origin=request.headers.get('origin');
  const expected=process.env.APP_ORIGIN || new URL(request.url).origin;
  requireCondition(origin===expected,403,'This request did not come from the application.');
}
export async function readBody(request:NextRequest,max=128*1024) {
  requireCondition(Number(request.headers.get('content-length')||0)<=max,413,'Request is too large.');
  const reader=request.body?.getReader();requireCondition(reader,400,'Request body is required.');
  let size=0;const chunks:Uint8Array[]=[];
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new HttpError(413,'Request is too large.');}chunks.push(value);}}finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}
export async function bodyJson(request:NextRequest) {
  requireCondition(request.headers.get('content-type')?.includes('application/json'),415,'Use application/json.');
  try {return JSON.parse((await readBody(request)).toString());}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'Invalid JSON.');}
}
export function failure(error:unknown) {
  if(error instanceof ZodError)return json({error:error.issues[0]?.message||'Invalid input.',fields:error.flatten().fieldErrors},400);
  if(error instanceof HttpError)return json({error:error.message},error.status);
  if((error as {code?:string})?.code==='23505')return json({error:'This action conflicts with an existing record. Refresh and try again.'},409);
  console.error('Request failed:',error instanceof Error?error.name:'Unknown error');
  return json({error:'The request could not be completed. Please try again.'},500);
}
