// One adapter per configured database, kept alive for the life of the process. Opening a connection to a managed
// database costs seconds, so nothing here reconnects per request: the cache lives on globalThis because Next re-imports
// modules on every edit in development and a module-level cache would leak a pool on each reload.
import { PROVIDERS, type Adapter, type DatabaseRecord, type Row } from './types';
import { activeId, getDatabase, BOOTSTRAP_ID } from './registry';
import { resolveSecret } from './secrets';
import { createPostgresAdapter } from './postgres';

export { freezeWrites, unfreezeWrites, writesFrozen } from '../db';

type Entry={adapter:Adapter;inFlight:number};
type State={adapters:Map<string,Promise<Entry>>;activeId?:string};
const globalManager=globalThis as unknown as {repoAdapters?:State};
const state:State=globalManager.repoAdapters??={adapters:new Map()};

async function build(record:DatabaseRecord,password:string):Promise<Adapter> {
  if(record.provider==='postgres')return createPostgresAdapter(record,password);
  // Other providers live in their own module and are loaded by name, so a provider that is not installed fails here,
  // loudly and only for that connection, instead of making the whole database layer unloadable.
  const loaded=await import(`./${record.provider}`).catch(()=>null) as Record<string,unknown>|null;
  const factory=Object.entries(loaded??{}).find(([name,value])=>typeof value==='function'&&/^create\w*Adapter$/.test(name))?.[1];
  if(typeof factory!=='function')throw new Error(`${PROVIDERS[record.provider]} support is not installed on this server.`);
  return (factory as (record:DatabaseRecord,password:string)=>Adapter|Promise<Adapter>)(record,password);
}

// Queries are counted as they pass through so a retired connection can be closed once the work already sent to it is
// finished, rather than cancelling it mid-flight.
function tracked(adapter:Adapter,entry:{inFlight:number}):Adapter {
  const count=async<T>(work:()=>Promise<T>)=>{entry.inFlight++;try {return await work();} finally {entry.inFlight--;}};
  return {
    provider:adapter.provider,id:adapter.id,
    query:<T extends Row>(statement:string,values?:unknown[])=>count(()=>adapter.query<T>(statement,values)),
    transaction:<T>(work:(tx:Pick<Adapter,'query'>)=>Promise<T>)=>count(()=>adapter.transaction(work)),
    applySchema:()=>count(()=>adapter.applySchema()),
    snapshot:()=>count(()=>adapter.snapshot()),
    checksum:(table:string,columns:string[])=>count(()=>adapter.checksum(table,columns)),
    ping:()=>count(()=>adapter.ping()),
    close:()=>adapter.close(),
  };
}

export function adapterFor(id:string):Promise<Adapter> {
  const cached=state.adapters.get(id);
  if(cached)return cached.then(entry=>entry.adapter);
  const opening=(async():Promise<Entry>=>{
    const record=await getDatabase(id);
    if(!record)throw new Error('That database is not configured.');
    if(!record.enabled)throw new Error('That database is disabled.');
    // The bootstrap connection is opened from DATABASE_URL itself, so its password is never unpacked or passed around.
    const entry:Entry={inFlight:0,adapter:undefined as unknown as Adapter};
    entry.adapter=tracked(await build(record,record.bootstrap?'':resolveSecret(record.secretRef)),entry);
    return entry;
  })();
  // A failed open must not be cached, or one bad password would keep the database unreachable until a restart.
  state.adapters.set(id,opening);
  opening.catch(()=>{if(state.adapters.get(id)===opening)state.adapters.delete(id);});
  return opening.then(entry=>entry.adapter);
}

export async function activeAdapter():Promise<Adapter> {
  state.activeId??=await activeId();
  try {return await adapterFor(state.activeId);}
  catch(error) {
    if(state.activeId===BOOTSTRAP_ID)throw error;
    // A configured database that will not open must never take the application down: DATABASE_URL still answers.
    console.error('The active database could not be opened; falling back to DATABASE_URL.');
    state.activeId=BOOTSTRAP_ID;
    return adapterFor(BOOTSTRAP_ID);
  }
}

export async function setActive(id:string):Promise<void> {
  const previous=state.activeId??await activeId();
  await adapterFor(id);
  state.activeId=id;
  if(previous!==id)void retire(previous);
}

// Closing a pool with queries still on it would fail requests that were already accepted, so the old connection is
// drained first. The bootstrap pool belongs to lib/db and is kept: a switch back to it must not pay to reconnect.
async function retire(id:string) {
  if(id===BOOTSTRAP_ID)return;
  const entry=await state.adapters.get(id)?.catch(()=>undefined);
  if(!entry)return;
  const deadline=Date.now()+15000;
  while(entry.inFlight>0&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  if(state.activeId===id)return; // A switch back while it drained: keep the connection that is now serving requests.
  state.adapters.delete(id);
  await entry.adapter.close().catch(()=>{});
}
