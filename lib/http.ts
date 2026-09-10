import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { HttpError, requireCondition } from './errors';

export function json(value:unknown,status=200) {
  return NextResponse.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
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
