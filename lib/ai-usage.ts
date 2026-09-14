import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db,transaction} from './db';
import {audit,rateLimit} from './auth';
import {HttpError,requireCondition} from './errors';
import {openText,sealText} from './encryption';
import {generateProjectDraft,geminiKeys,geminiModel} from './gemini';
import type {AiDraft} from './ai-project-draft';
import type {User} from './schema';

export const aiSettingsSchema=z.object({
 enabled:z.boolean(),
 hourlyLimit:z.number().int().min(1).max(100),
 dailyLimit:z.number().int().min(1).max(500),
 siteDailyLimit:z.number().int().min(1).max(100000),
}).refine(settings=>settings.hourlyLimit<=settings.dailyLimit,{message:'The hourly limit cannot be higher than the daily limit.',path:['hourlyLimit']});
export type AiSettings=z.infer<typeof aiSettingsSchema>;
export const defaultAiSettings:AiSettings={enabled:true,hourlyLimit:10,dailyLimit:40,siteDailyLimit:300};
export const AI_RETENTION_DAYS=180;
const MAX_ATTEMPTS_PER_HOUR=60;

export async function aiSettings():Promise<AiSettings>{
 const [row]=await db.query("SELECT value FROM r.settings WHERE key='ai'");
 const parsed=aiSettingsSchema.safeParse(row?.value);
 return parsed.success?parsed.data:defaultAiSettings;
}

const reasonOf=(error:unknown)=>(error instanceof HttpError?error.message:'Unexpected error').slice(0,300);

/**
 * Every attempt that reaches the assistant is recorded against the account, refused ones included,
 * so administrators can see who asked what. Prompts are encrypted; generated text is not stored.
 */
export async function trackedProjectDraft(user:Pick<User,'id'>,prompt:string,generate:(prompt:string)=>Promise<AiDraft>=generateProjectDraft):Promise<AiDraft>{
 // Bounds how many log rows one account can create, before anything is written.
 await rateLimit(`gemini-attempts:${user.id}`,MAX_ATTEMPTS_PER_HOUR,3600,'Too many AI requests from this account. Please wait before trying again.');
 const id=randomUUID(),started=Date.now();
 await db.query('INSERT INTO r.ai_requests(id,user_id,prompt,prompt_chars,status,model) VALUES($1,$2,$3,$4,$5,$6)',[id,user.id,sealText(prompt,'ai_requests.prompt'),prompt.length,'pending',geminiModel()]);
 await db.query(`DELETE FROM r.ai_requests WHERE created_at<now()-interval '${AI_RETENTION_DAYS} days'`);
 const finish=(status:'completed'|'blocked'|'failed',reason='',fields:string[]=[])=>db.query('UPDATE r.ai_requests SET status=$2,reason=$3,fields=$4,duration_ms=$5 WHERE id=$1',[id,status,reason,JSON.stringify(fields),Date.now()-started]);
 try{
  const settings=await aiSettings();
  requireCondition(settings.enabled,503,'An administrator has turned off the Gemini assistant. You can still fill the form manually.');
  const [account]=await db.query('SELECT ai_blocked FROM r.users WHERE id=$1',[user.id]);
  requireCondition(account&&!account.ai_blocked,403,'An administrator has paused your access to the Gemini assistant. You can still fill the form manually.');
  requireCondition(geminiKeys().length>0,503,'The Gemini assistant is not configured yet. You can still fill the form manually.');
  await rateLimit(`gemini-hour:${user.id}`,settings.hourlyLimit,3600,`You have used your ${settings.hourlyLimit} AI drafts for this hour. Please try again later.`);
  await rateLimit(`gemini-day:${user.id}`,settings.dailyLimit,86400,'You have used your AI drafts for today. Continue manually or try tomorrow.');
  // Many accounts together must not exhaust the shared key.
  await rateLimit('gemini-site-day',settings.siteDailyLimit,86400,'The Gemini assistant has reached today’s limit for this site. Continue manually or try again tomorrow.');
 }catch(error){await finish('blocked',reasonOf(error)).catch(()=>{});throw error;}
 try{
  const draft=await generate(prompt);
  await finish('completed','',Object.keys(draft.fields));
  return draft;
 }catch(error){
  // 422 means the prompt itself was refused (unsafe or not a project); anything else is a provider or parsing failure.
  await finish(error instanceof HttpError&&error.status===422?'blocked':'failed',reasonOf(error)).catch(()=>{});
  throw error;
 }
}

export type AiRequestView={id:string;userId:string;name:string;email:string;role:string;aiBlocked:boolean;suspended:boolean;prompt:string;promptChars:number;status:'pending'|'completed'|'blocked'|'failed';reason:string;fields:string[];model:string;durationMs:number|null;createdAt:string};

export async function aiActivity(userId?:string):Promise<{retentionDays:number;requests:AiRequestView[]}>{
 const rows=await db.query(`SELECT a.id,a.user_id,a.prompt,a.prompt_chars,a.status,a.reason,a.fields,a.model,a.duration_ms,a.created_at,u.name,u.email,u.role,u.ai_blocked,u.suspended FROM r.ai_requests a JOIN r.users u ON u.id=a.user_id${userId?' WHERE a.user_id=$1':''} ORDER BY a.created_at DESC LIMIT 300`,userId?[userId]:[]);
 // One unreadable value (for example after restoring with a different key) must not hide the rest of the log.
 const read=(value:string,context:string)=>{try{return openText(value,context);}catch{return '';}};
 return {retentionDays:AI_RETENTION_DAYS,requests:rows.map(row=>({
  id:row.id,userId:row.user_id,name:row.name,email:read(row.email,'users.email'),role:row.role,aiBlocked:row.ai_blocked,suspended:row.suspended,
  prompt:read(row.prompt,'ai_requests.prompt'),promptChars:row.prompt_chars,status:row.status,reason:row.reason,fields:row.fields,model:row.model,
  durationMs:row.duration_ms,createdAt:new Date(row.created_at).toISOString(),
 }))};
}

export async function setAiAccess(actorId:string,targetId:string,blocked:boolean){
 await transaction(async client=>{
  const [target]=await client.query('UPDATE r.users SET ai_blocked=$1 WHERE id=$2 RETURNING id',[blocked,targetId]);
  requireCondition(target,404,'User not found.');
  await audit(client,actorId,blocked?'ai.access.paused':'ai.access.restored',targetId);
 });
}
