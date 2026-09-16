import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db';
import { audit, rateLimit } from '../auth';
import { HttpError, requireCondition } from '../errors';
import { bodyJson, json, originCheck } from '../http';
import { recordEvent } from '../tracking';
import { PROVIDERS, SSL_MODES, type DatabaseOverview, type DatabaseRecord, type Provider, type SwitchReport, type SwitchStep } from '../database/types';
import { activeId, addDatabase, getDatabase, listDatabases, removeDatabase, setRole, updateDatabase } from '../database/registry';
import { adapterFor, freezeWrites, setActive, unfreezeWrites, writesFrozen } from '../database/manager';
import { compare, runSync, verify } from '../database/sync';
import type { AdminContext } from './router';

// Admin › Database manager: GET /api/admin/database plus the per-target actions. Super Admin only — deliberately not a
// grantable permission, because these endpoints move every row in the product from one server to another.
// A password is accepted on add and edit, handed straight to the registry to be sealed, and never read back: the record
// carries only `secretRef`, the *name* of where the password lives. Every response body and every audit detail is walked
// by redact() first, so a credential or connection string cannot leave here even if a lower layer starts returning one.

/** Where the list of databases is stored, for the "read from" line on the page. */
export const REGISTRY_SOURCE='r.settings › databases';
const MASK='[redacted]';
const SECRET_KEY=/^(password|pass|pwd|secret|dsn|url|uri|connectionstring|connection_string|databaseurl|database_url)$/i;
/** Masks a known environment secret, and any user:password@host that an exception quoted back at us. */
export function safe(text:string) {
  const secrets=['DATABASE_URL','TARGET_DATABASE_URL','DATA_ENCRYPTION_KEY'].map(name=>process.env[name]?.trim()).filter((value):value is string=>!!value&&value.length>=8);
  let clean=String(text);for(const secret of secrets)clean=clean.replaceAll(secret,MASK);
  return clean.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi,`$1${MASK}@`);
}
/** Drops every credential-shaped key and masks free text. Applied to every response and every audit detail. */
export function redact<T>(value:T):T {
  if(typeof value==='string')return safe(value) as T;
  if(Array.isArray(value))return value.map(item=>redact(item)) as T;
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([key])=>!SECRET_KEY.test(key)).map(([key,item])=>[key,redact(item)])) as T;
  return value;
}
const body=(value:unknown,status=200)=>json(redact(value),status);
/** A target named without a credential: enough to tell two servers apart in the audit log, never enough to connect. */
const where=(record:DatabaseRecord)=>`${record.provider}://${record.host}:${record.port}/${record.database}`;

const providers=Object.keys(PROVIDERS) as [Provider,...Provider[]];
const identifier=z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_$.-]+$/,'Use letters, numbers, dots, dashes or underscores.');
const inputSchema=z.object({
  name:z.string().trim().min(1).max(80),provider:z.enum(providers),
  host:z.string().trim().min(1).max(255),port:z.coerce.number().int().min(1).max(65535),
  database:identifier,username:identifier,schema:identifier,ssl:z.enum(SSL_MODES),
  // Write-only: the registry seals it and reports back only where it was put.
  password:z.string().min(1).max(200).optional(),
});
const patchSchema=inputSchema.partial();
const syncSchema=z.object({mode:z.enum(['full','incremental'])});

const overview=async():Promise<DatabaseOverview>=>({databases:await listDatabases(),activeId:await activeId(),writesFrozen:await writesFrozen(),registrySource:REGISTRY_SOURCE});
type Actor=AdminContext['user'];
/** Who, when, from where, to where, and what happened. The audit row is the only lasting record of a switch. */
async function trail(user:Actor,request:AdminContext['request'],action:string,target:string,details:Record<string,unknown>) {
  await audit(db,user.id,`database.${action}`,target,redact(details));
  await recordEvent({type:'ADMIN_ACTION',request,userId:user.id,metadata:redact({action:`database.${action}`,target,...details})});
}

/**
 * Moves the product onto another database: prove it answers, prove the shapes agree, copy, pause writes so nothing is
 * written to the old one mid-flight, copy the last changes, verify the counts, then point the application at it.
 * Any failed step rolls back — the old database is untouched throughout, so rolling back is only re-activating it.
 */
async function switchTo(from:string,to:string):Promise<SwitchReport> {
  const report:SwitchReport={id:randomUUID(),from,to,startedAt:new Date().toISOString(),finishedAt:null,steps:[],integrity:null,succeeded:false,rolledBack:false,error:''};
  const step=async<T,>(name:SwitchStep,run:()=>Promise<[T,string]>):Promise<T>=>{
    const started=performance.now();
    try {const [value,detail]=await run();report.steps.push({step:name,ok:true,detail,ms:Math.round(performance.now()-started)});return value;}
    catch(error){report.steps.push({step:name,ok:false,detail:safe((error as Error).message),ms:Math.round(performance.now()-started)});throw error;}
  };
  try {
    await step('test',async()=>{const probe=await (await adapterFor(to)).ping();requireCondition(probe.ok,409,'The target database did not answer.');return [probe,`${probe.serverVersion} · ${Math.round(probe.latencyMs)} ms`];});
    await step('compare',async()=>{const diff=await compare(from,to);requireCondition(diff.compatible,409,'The two databases are not compatible. Apply the schema to the target first.');return [diff,`${diff.tables.length} tables compared`];});
    await step('schema',async()=>{await (await adapterFor(to)).applySchema();return [null,'Schema created or upgraded on the target'];});
    await step('sync',async()=>{const copy=await runSync(from,to,'full');requireCondition(copy.phase!=='failed',409,copy.errors[0]||'The first copy failed.');return [copy,`${copy.totalCopied} rows copied`];});
    await step('freeze',async()=>{await freezeWrites();return [null,'Writes paused so the last copy cannot miss a row'];});
    await step('final-sync',async()=>{const copy=await runSync(from,to,'incremental');requireCondition(copy.phase!=='failed',409,copy.errors[0]||'The final copy failed.');return [copy,`${copy.totalCopied} rows copied since the first pass`];});
    report.integrity=await step('verify',async()=>{const check=await verify(from,to);requireCondition(check.passed,409,'The integrity check did not pass, so the switch was abandoned.');return [check,'Row counts, foreign keys and checksums match'];});
    await step('activate',async()=>{await setActive(to);await setRole(from,'standby');return [null,'The application now reads and writes the new database'];});
    await step('unfreeze',async()=>{await unfreezeWrites();return [null,'Writes resumed'];});
    report.succeeded=true;
  } catch(error) {
    report.error=safe((error as Error).message);
    // The old database was never stopped or emptied, so going back is just making it active again and releasing writes.
    try {await step('rollback',async()=>{await setActive(from);await setRole(from,'active');await unfreezeWrites();return [null,'Returned to the previous database; no data was lost'];});report.rolledBack=true;} catch {}
  }
  report.finishedAt=new Date().toISOString();
  return report;
}

export async function databaseRoute({request,user,method,path}:AdminContext):Promise<Response> {
  // Not a grantable permission: only a Super Admin may even see which databases exist.
  requireCondition(user.role==='superadmin',403,'Only Super Admins can open the database manager.');
  // Same-origin proof for every mutation, exactly as the rest of the admin API requires it.
  if(method!=='GET')originCheck(request);
  const [,id,action]=path;
  if(!id) {
    if(method==='GET')return body(await overview());
    if(method==='POST') {
      const input=inputSchema.parse(await bodyJson(request));
      const record=await addDatabase(input);
      await trail(user,request,'added',record.id,{name:record.name,destination:where(record),sealed:record.secretRef,result:'configured'});
      return body({database:record,...await overview()},201);
    }
    throw new HttpError(405,'Method not allowed.');
  }
  const existing=await getDatabase(id);
  requireCondition(existing,404,'That database is not configured.');
  if(!action) {
    if(method==='PATCH') {
      const patch=patchSchema.parse(await bodyJson(request));
      const record=await updateDatabase(id,patch);
      await trail(user,request,'updated',id,{destination:where(record),changed:Object.keys(patch).filter(key=>key!=='password'),passwordChanged:!!patch.password,result:'updated'});
      return body({database:record,...await overview()});
    }
    if(method==='DELETE') {
      // Removing a connection forgets how to reach a server. It never drops a table, and never touches the data there.
      requireCondition(!existing.bootstrap,409,'The database this site started from cannot be removed.');
      requireCondition(existing.role!=='active',409,'Switch to another database before removing this one.');
      await removeDatabase(id);
      await trail(user,request,'removed',id,{source:where(existing),result:'configuration removed; no data was dropped'});
      return body({removed:true,...await overview()});
    }
    throw new HttpError(405,'Method not allowed.');
  }
  requireCondition(method==='POST',405,'Method not allowed.');
  const from=await activeId();
  if(action==='test') {
    try {
      const probe=await (await adapterFor(id)).ping();
      await trail(user,request,'tested',id,{destination:where(existing),result:probe.ok?'healthy':'unreachable',latencyMs:probe.latencyMs});
      return body({ok:probe.ok,latencyMs:probe.latencyMs,serverVersion:probe.serverVersion,database:await getDatabase(id)});
    } catch(error) {
      // A refused connection is an answer, not a server fault: it belongs on the card, not in a 500.
      const message=safe((error as Error).message);
      await trail(user,request,'tested',id,{destination:where(existing),result:'unreachable',error:message});
      return body({ok:false,error:message,database:await getDatabase(id)});
    }
  }
  if(action==='schema') {
    const adapter=await adapterFor(id);
    await adapter.applySchema();
    const snapshot=await adapter.snapshot();
    await trail(user,request,'schema.applied',id,{destination:where(existing),result:`${snapshot.tables.length} tables present`});
    return body({applied:true,tables:snapshot.tables.length,serverVersion:snapshot.serverVersion,database:await getDatabase(id)});
  }
  if(action==='sync') {
    requireCondition(id!==from,409,'The active database cannot be copied onto itself.');
    await rateLimit(`database-sync:${user.id}`,20,3600);
    const {mode}=syncSchema.parse(await bodyJson(request));
    const report=await runSync(from,id,mode);
    await trail(user,request,'synced',id,{source:from,destination:where(existing),mode,verified:report.verified,result:report.phase==='done'?`${report.totalCopied} rows copied`:`failed: ${report.errors[0]??'unknown'}`});
    return body({report,...await overview()});
  }
  if(action==='compare') {
    const comparison=await compare(from,id);
    await trail(user,request,'compared',id,{source:from,destination:where(existing),result:comparison.compatible?'compatible':'differences found'});
    return body({comparison});
  }
  if(action==='verify') {
    const integrity=await verify(from,id);
    await trail(user,request,'verified',id,{source:from,destination:where(existing),result:integrity.passed?'passed':'failed'});
    return body({integrity});
  }
  if(action==='switch') {
    requireCondition(id!==from,409,'That database is already the active one.');
    requireCondition(existing.enabled&&existing.role!=='disabled',409,'Enable this database before switching to it.');
    await rateLimit(`database-switch:${user.id}`,5,3600);
    const report=await switchTo(from,id);
    await trail(user,request,'switched',id,{source:from,destination:where(existing),steps:report.steps.map(entry=>`${entry.step}:${entry.ok?'ok':'failed'}`),error:report.error,
      result:report.succeeded?'active':report.rolledBack?'failed; rolled back to the previous database':'failed'});
    // A failed switch is still a complete answer: the page needs the steps to show where it stopped.
    return body({report,...await overview()});
  }
  if(action==='disable') {
    requireCondition(id!==from,409,'Switch to another database before disabling this one.');
    await setRole(id,'disabled');
    await trail(user,request,'disabled',id,{destination:where(existing),result:'disabled; the configuration and its data are left in place'});
    return body(await overview());
  }
  throw new HttpError(404,'Endpoint not found.');
}
