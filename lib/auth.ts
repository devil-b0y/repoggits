import { randomBytes, randomInt, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { db, type Db } from './db';
import { emailVerificationRequired } from './policy';
import { HttpError, requireCondition } from './errors';
import { profileSchema, type User, type ProjectData } from './schema';
// Each derivation holds 128 MiB, and a burst of logins all pass the rate limiter together, so cap concurrency to keep memory bounded.
const MAX_CONCURRENT_HASHES=4;
let activeHashes=0;const waitingHashes:(()=>void)[]=[];
async function withHashSlot<T>(work:()=>Promise<T>) {
  if(activeHashes>=MAX_CONCURRENT_HASHES)await new Promise<void>(resolve=>waitingHashes.push(resolve));else activeHashes++;
  try{return await work();}finally{const next=waitingHashes.shift();if(next)next();else activeHashes--;}
}
const deriveKey = (password:string,salt:string) => withHashSlot(()=>new Promise<Buffer>((resolve,reject) => scryptCallback(password,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024},(error,key)=>error?reject(error):resolve(key))));
export const SESSION_COOKIE = 'repoggits_session';
export const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export const newToken=()=>randomBytes(32).toString('hex');
// Cryptographically random, not Math.random — this is a guessable-length secret, so the source matters.
export const newCode=()=>String(randomInt(0,1_000_000)).padStart(6,'0');

export async function hashPassword(password:string) {
  const salt=randomBytes(16).toString('hex');
  const key=await deriveKey(password,salt);
  return `${salt}:${key.toString('hex')}`;
}
export async function checkPassword(password:string,stored:string|null) {
  const [salt,hex]=(stored||'00000000000000000000000000000000:'+ '0'.repeat(128)).split(':');
  const key=await deriveKey(password,salt);
  const expected=Buffer.from(hex,'hex');
  return expected.length===key.length && timingSafeEqual(key,expected) && !!stored;
}
export function userView(row:Record<string,unknown>):User {
  return {id:String(row.id),email:String(row.email),name:String(row.name),role:row.role as User['role'],verified:!!row.verified,suspended:!!row.suspended,scopes:row.scopes as string[],profile:profileSchema.parse({name:row.name,...row.profile as object})};
}
export async function currentUser(request:NextRequest):Promise<User|null> {
  const token=request.cookies.get(SESSION_COOKIE)?.value;
  if(!token||token.length>128)return null;
  const [row]=await db.query('SELECT u.* FROM r.users u JOIN r.sessions s ON s.user_id=u.id WHERE s.hash=$1 AND s.expires_at>now() AND NOT u.suspended',[hashToken(token)]);
  return row?userView(row):null;
}
export async function requireUser(request:NextRequest,verified=true) {
  const user=await currentUser(request);requireCondition(user,401,'Sign in to continue.');
  if(verified&&emailVerificationRequired())requireCondition(user.verified,403,'Verify your email address first.');
  return user;
}
export function canReview(user:User,data:ProjectData) {
  return user.role==='superadmin'||user.role==='teacher'&&(user.scopes.includes(`department:${data.department}`)||user.scopes.includes(`subject:${data.subject}`));
}
export async function audit(client:Db,actorId:string|null,action:string,targetId:string,details:object={}) {
  await client.query('INSERT INTO r.audit(id,actor_id,action,target_id,details) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actorId,action,targetId,JSON.stringify(details)]);
}
export async function rateLimit(key:string,limit:number,seconds:number,message='Too many attempts. Please wait before trying again.') {
  const [row]=await db.query(`INSERT INTO r.rate_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN r.rate_limits.expires_at<now() THEN 1 ELSE r.rate_limits.count+1 END,
    expires_at=CASE WHEN r.rate_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE r.rate_limits.expires_at END RETURNING count`,[key,seconds]);
  if(row.count>limit)throw new HttpError(429,message);
}
