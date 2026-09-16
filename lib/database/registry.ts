// Where the configured databases are recorded. This file deliberately lives on disk rather than in a table: the record of
// where to switch cannot be kept inside the database you are switching away from, or the first switch would destroy it.
// DATABASE_URL is always present here as the `bootstrap` record, synthesised when the file is missing, and it can never
// be removed or disabled — that is what guarantees the application can always fall back to the database it shipped with.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PROVIDERS, SSL_MODES, type DatabaseInput, type DatabaseRecord, type Provider, type Role, type SslMode } from './types';
import { DEFAULT_REGISTRY_FILE, deleteSecret, storeSecret } from './secrets';

export const BOOTSTRAP_ID='bootstrap';
export type DatabasePatch=Partial<DatabaseInput>&Partial<Pick<DatabaseRecord,'enabled'|'lastTestedAt'|'lastTestError'|'health'|'latencyMs'|'lastSyncAt'|'lastSyncRows'|'schemaVersion'|'serverVersion'>>;
type Stored={version:number;activeId:string;databases:DatabaseRecord[]};

export const registryFile=()=>process.env.DATABASE_REGISTRY_FILE||DEFAULT_REGISTRY_FILE;
const globalRegistry=globalThis as unknown as {repoRegistryWrites?:Promise<unknown>};
const text=(value:unknown,fallback='')=>typeof value==='string'?value.trim():fallback;
const sslOf=(value:unknown,fallback:SslMode):SslMode=>SSL_MODES.includes(value as SslMode)?value as SslMode:fallback;

function bootstrapRecord(stored?:Partial<DatabaseRecord>):DatabaseRecord {
  let host='',port=5432,database='',username='',mode:SslMode='require';
  try {
    const url=new URL(process.env.DATABASE_URL||'');
    host=url.hostname;port=Number(url.port)||5432;database=decodeURIComponent(url.pathname.replace(/^\//,''));username=decodeURIComponent(url.username);
    const local=/^(?:localhost|127(?:\.\d+){1,3}|\[?::1\]?|)$/.test(url.hostname);
    mode=sslOf((process.env.DATABASE_SSL||url.searchParams.get('sslmode')||(local?'disable':'require')).toLowerCase(),'require');
  } catch {/* Without DATABASE_URL the record still exists, so the panel can say what is missing. */}
  return {
    id:BOOTSTRAP_ID,name:text(stored?.name)||'Primary (DATABASE_URL)',provider:'postgres',
    host,port,database,username,schema:process.env.REPOGGITS_DB_SCHEMA||'repoggits',ssl:mode,
    // The password sits inside DATABASE_URL; the adapter uses that variable directly and never unpacks it.
    secretRef:'env:DATABASE_URL',
    enabled:true,role:stored?.role==='standby'?'standby':'configured',
    createdAt:text(stored?.createdAt)||new Date(0).toISOString(),
    lastTestedAt:stored?.lastTestedAt??null,lastTestError:text(stored?.lastTestError),health:stored?.health??'unknown',latencyMs:stored?.latencyMs??null,
    lastSyncAt:stored?.lastSyncAt??null,lastSyncRows:stored?.lastSyncRows??null,
    schemaVersion:stored?.schemaVersion??null,serverVersion:text(stored?.serverVersion),bootstrap:true,
  };
}

// Anything the file cannot be trusted to hold — a password, an unknown provider, a stray bootstrap twin — is dropped
// here rather than at the driver.
function sanitise(value:Partial<DatabaseRecord>):DatabaseRecord|null {
  const id=text(value?.id),provider=value?.provider as Provider;
  if(!id||id===BOOTSTRAP_ID||!(provider in PROVIDERS))return null;
  const roles:Role[]=['active','standby','configured','disabled'];
  return {
    id,name:text(value.name)||id,provider,
    host:text(value.host),port:Number(value.port)||(provider==='mysql'?3306:5432),database:text(value.database),username:text(value.username),
    schema:text(value.schema),ssl:sslOf(value.ssl,'require'),secretRef:text(value.secretRef),
    enabled:value.enabled!==false,role:roles.includes(value.role as Role)?value.role as Role:'configured',
    createdAt:text(value.createdAt)||new Date().toISOString(),
    lastTestedAt:value.lastTestedAt??null,lastTestError:text(value.lastTestError),health:value.health??'unknown',latencyMs:value.latencyMs??null,
    lastSyncAt:value.lastSyncAt??null,lastSyncRows:value.lastSyncRows??null,
    schemaVersion:value.schemaVersion??null,serverVersion:text(value.serverVersion),bootstrap:false,
  };
}

async function load():Promise<Stored> {
  let parsed:Partial<Stored>={};
  try {parsed=JSON.parse(await readFile(registryFile(),'utf8')) as Partial<Stored>;}
  catch {/* No file yet, or an unreadable one: the bootstrap connection alone is then the whole registry. */}
  const listed=Array.isArray(parsed.databases)?parsed.databases:[];
  const databases=[bootstrapRecord(listed.find(record=>record?.id===BOOTSTRAP_ID)),...listed.map(sanitise).filter((record):record is DatabaseRecord=>record!==null)];
  const wanted=text(parsed.activeId)||BOOTSTRAP_ID;
  const activeId=databases.find(record=>record.id===wanted&&record.enabled)?.id||BOOTSTRAP_ID;
  // Exactly one record is active and the roles are derived, so a hand-edited file cannot leave two of them claiming it.
  for(const record of databases)record.role=record.id===activeId?'active':!record.enabled?'disabled':record.role==='active'?'standby':record.role;
  return {version:1,activeId,databases};
}

// Every mutation is a read-modify-write, so they are queued: two admin clicks at once cannot lose one another's change.
// The file is replaced by rename, which is atomic, so a crash leaves either the old registry or the new one, never half.
async function save(change:(current:Stored)=>Stored):Promise<Stored> {
  const run=(globalRegistry.repoRegistryWrites??=Promise.resolve()).then(async()=>{
    const next=change(await load());
    const file=registryFile(),temp=`${file}.${process.pid}.tmp`;
    await mkdir(dirname(file),{recursive:true});
    await writeFile(temp,`${JSON.stringify(next,null,2)}\n`,'utf8');
    await rename(temp,file);
    return next;
  });
  globalRegistry.repoRegistryWrites=run.catch(()=>{});
  return run;
}

function findOrThrow(stored:Stored,id:string) {
  const record=stored.databases.find(entry=>entry.id===id);
  if(!record)throw new Error('That database is not configured.');
  return record;
}
// A name that reaches a URL or an identifier that reaches SQL is checked here, once, before it is ever stored.
function identifier(value:string,label:string) {
  if(!/^[A-Za-z0-9_$-]{1,63}$/.test(value))throw new Error(`The ${label} must be 1 to 63 letters, digits, dashes or underscores.`);
  return value;
}
function validate(input:DatabaseInput) {
  if(!(input.provider in PROVIDERS))throw new Error('Choose a supported database provider.');
  if(!text(input.name))throw new Error('Give this connection a name.');
  if(!text(input.host))throw new Error('A host is required.');
  if(!(Number(input.port)>0&&Number(input.port)<65536))throw new Error('The port must be between 1 and 65535.');
  identifier(text(input.database),'database name');
  identifier(text(input.schema)||text(input.database),'schema');
  if(!SSL_MODES.includes(input.ssl))throw new Error('Choose a TLS mode.');
}
// A password given by an administrator is sealed the moment it arrives and replaced by a reference; the plain value
// never reaches the registry file, a log line, or any value returned from this module.
const referenceFor=(id:string,password:string)=>password.startsWith('env:')?password:(storeSecret(id,password),`vault:${id}`);

export async function listDatabases():Promise<DatabaseRecord[]> {return (await load()).databases;}
export async function getDatabase(id:string):Promise<DatabaseRecord|undefined> {return (await load()).databases.find(record=>record.id===id);}
export async function activeId():Promise<string> {return (await load()).activeId;}

export async function addDatabase(input:DatabaseInput):Promise<DatabaseRecord> {
  validate(input);
  const slug=text(input.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,24)||'database';
  const id=`${slug}-${randomUUID().slice(0,8)}`;
  const record:DatabaseRecord={
    id,name:text(input.name),provider:input.provider,host:text(input.host),port:Number(input.port),database:text(input.database),
    username:text(input.username),schema:text(input.schema)||text(input.database),ssl:input.ssl,
    secretRef:input.password?referenceFor(id,input.password):'',
    enabled:true,role:'configured',createdAt:new Date().toISOString(),
    lastTestedAt:null,lastTestError:'',health:'unknown',latencyMs:null,lastSyncAt:null,lastSyncRows:null,
    schemaVersion:null,serverVersion:'',bootstrap:false,
  };
  await save(current=>({...current,databases:[...current.databases,record]}));
  return record;
}

export async function updateDatabase(id:string,patch:DatabasePatch):Promise<DatabaseRecord> {
  const stored=await save(current=>{
    const record=findOrThrow(current,id);
    if(record.bootstrap&&patch.enabled===false)throw new Error('The DATABASE_URL connection cannot be disabled.');
    const merged:DatabaseRecord={...record};
    for(const key of ['name','host','database','username','schema'] as const)if(patch[key]!==undefined)merged[key]=text(patch[key]);
    if(patch.port!==undefined)merged.port=Number(patch.port);
    if(patch.provider!==undefined)merged.provider=patch.provider;
    if(patch.ssl!==undefined)merged.ssl=sslOf(patch.ssl,record.ssl);
    if(patch.enabled!==undefined)merged.enabled=patch.enabled;
    for(const key of ['lastTestedAt','lastTestError','health','latencyMs','lastSyncAt','lastSyncRows','schemaVersion','serverVersion'] as const)
      if(patch[key]!==undefined)Object.assign(merged,{[key]:patch[key]});
    if(patch.password)merged.secretRef=referenceFor(id,patch.password);
    // Connection details of the bootstrap record come from DATABASE_URL whatever the panel sends, so it stays reachable.
    const next=record.bootstrap?bootstrapRecord(merged):merged;
    if(!next.bootstrap)validate(next);
    return {...current,activeId:next.enabled?current.activeId:current.activeId===id?BOOTSTRAP_ID:current.activeId,databases:current.databases.map(entry=>entry.id===id?next:entry)};
  });
  return findOrThrow(stored,id);
}

export async function removeDatabase(id:string):Promise<void> {
  await save(current=>{
    const record=findOrThrow(current,id);
    if(record.bootstrap)throw new Error('The DATABASE_URL connection cannot be removed.');
    // Defense in depth: the admin route already refuses this before calling removeDatabase, but the guard belongs
    // here too, or removing the active record out from under itself would only ever be caught by whichever caller
    // remembers to check first.
    if(record.role==='active')throw new Error('Switch to another database before removing this one.');
    if(record.secretRef.startsWith('vault:'))deleteSecret(record.secretRef.slice('vault:'.length));
    return {...current,activeId:current.activeId===id?BOOTSTRAP_ID:current.activeId,databases:current.databases.filter(entry=>entry.id!==id)};
  });
}

/** Moves a connection through the switching lifecycle. `active` also makes it the one the application queries. */
export async function setRole(id:string,role:Role):Promise<DatabaseRecord> {
  const stored=await save(current=>{
    const record=findOrThrow(current,id);
    if(record.bootstrap&&role==='disabled')throw new Error('The DATABASE_URL connection cannot be disabled.');
    if(role==='active'&&!record.enabled)throw new Error('Enable this connection before making it active.');
    const databases=current.databases.map(entry=>{
      if(entry.id===id)return {...entry,role,enabled:role==='disabled'?false:entry.enabled};
      // The connection being replaced stays as standby, which is what a rollback switches back to.
      if(role==='active'&&entry.id===current.activeId)return {...entry,role:'standby' as Role};
      return entry;
    });
    return {...current,activeId:role==='active'?id:current.activeId===id?BOOTSTRAP_ID:current.activeId,databases};
  });
  return findOrThrow(stored,id);
}
