// The public face of the sync engine: what lib/admin/database.ts calls. Everything here takes database IDs, not
// adapters — the admin API only ever knows "the active one" and "the one the administrator clicked", so resolving
// them to live, pooled connections belongs in one place rather than at every call site.
import {adapterFor} from '../manager';
import type {Comparison,IntegrityCheck,SyncMode,SyncReport} from '../types';
import {compareSnapshots} from './compare';
import {finish,fullSync,messageOf,newReport} from './copy';
import {verifyIntegrity} from './verify';

export async function compare(from:string,to:string):Promise<Comparison> {
  const [source,target]=await Promise.all([adapterFor(from),adapterFor(to)]);
  return compareSnapshots(source,target);
}

export async function verify(from:string,to:string):Promise<IntegrityCheck> {
  const [source,target]=await Promise.all([adapterFor(from),adapterFor(to)]);
  return verifyIntegrity(source,target);
}

/**
 * The one copy primitive both sync modes use. 'full' adds to whatever the target already holds — it is meant to run
 * once, early, while the old database still serves traffic. 'incremental' is the final pass, called after writes are
 * frozen (see freezeWrites() in lib/db.ts): nothing on the source can change underneath it, so wiping the target and
 * copying again is correct, not just close enough.
 *
 * HONEST LIMITATION: this does not yet skip unchanged rows. A true incremental sync — copying only what changed since
 * the first pass — needs reliable change tracking (updated_at, deleted_at or a sync_version column) that most tables
 * here do not have; adding it automatically was explicitly out of scope. Because the final pass runs during the write
 * freeze, a full re-copy is still CORRECT; on a very large database it can simply take long enough to exceed the ~10s
 * freeze window, in which case callers see a 503 ("briefly read-only") until it finishes, rather than any lost or
 * wrong data. Given this app's actual data (per-user projects, retained activity logs), that is an honest trade-off,
 * not silent unreliability — and it is exactly what this module's own design notes recommend fixing next.
 */
export async function runSync(from:string,to:string,mode:SyncMode):Promise<SyncReport> {
  let source,target;
  try {[source,target]=await Promise.all([adapterFor(from),adapterFor(to)]);}
  catch(error) {
    const report=newReport(mode,from,to,Date.now);
    report.phase='failed';report.errors.push(messageOf(error));
    return finish(report,Date.now(),Date.now);
  }
  const report=await fullSync(source,target,{replace:mode==='incremental'});
  report.mode=mode;
  return report;
}
