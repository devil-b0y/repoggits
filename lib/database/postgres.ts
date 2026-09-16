// The PostgreSQL adapter. The bootstrap connection deliberately reuses lib/db's own pool rather than opening a second
// one: that keeps today's behaviour against DATABASE_URL bit-identical, and a switch away and back does not pay 2.8s to
// reconnect. Every other connection gets its own pool with the same long idle timeout and keepalive, because a round
// trip to a managed database is expensive and a dropped idle connection costs seconds to replace.
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { applySchema as applyAppSchema, checkedSchema, pool as bootstrapPool, qualify } from '../db';
import type { Adapter, ColumnInfo, DatabaseRecord, Row, Snapshot, TableInfo } from './types';

const quote=(name:string)=>`"${name.replace(/"/g,'""')}"`;
// Certificate verification stays on unless the record asks for less, matching lib/db's databaseSsl.
function sslFor(record:DatabaseRecord) {
  if(record.ssl==='disable')return false as const;
  const file=process.env.DATABASE_CA_CERT_FILE;
  const ca=process.env.DATABASE_CA_CERT?.trim()||(file?readFileSync(file,'utf8'):'');
  return {rejectUnauthorized:record.ssl!=='no-verify',...(ca?{ca}:{})};
}
function connectionFor(record:DatabaseRecord,password:string) {
  const host=record.host.includes(':')&&!record.host.startsWith('[')?`[${record.host}]`:record.host;
  const auth=`${encodeURIComponent(record.username)}${password?`:${encodeURIComponent(password)}`:''}`;
  return {connectionString:`postgresql://${auth}@${host}:${record.port}/${encodeURIComponent(record.database)}`,ssl:sslFor(record)};
}

export function createPostgresAdapter(record:DatabaseRecord,password:string):Adapter {
  const schema=checkedSchema(record.schema);
  let owned:Pool|undefined;
  const pool=()=>{
    if(record.bootstrap)return bootstrapPool();
    if(!owned){
      owned=new Pool({...connectionFor(record,password),max:Number(process.env.DATABASE_POOL_MAX)||5,idleTimeoutMillis:Number(process.env.DATABASE_POOL_IDLE_MS)||600000,keepAlive:true,keepAliveInitialDelayMillis:30000,connectionTimeoutMillis:15000,statement_timeout:15000});
      // The message is dropped: a connection error can carry the server's own text, and nothing from here may quote credentials.
      owned.on('error',()=>console.error('Database connection interrupted.'));
    }
    return owned;
  };
  // Application SQL is written against `r.`; each connection resolves that to its own schema, so the same statement
  // works whichever database is active.
  const run=async<T extends QueryResultRow>(statement:string,values:unknown[]=[])=>(await pool().query<T>(qualify(statement,schema),values)).rows;
  const rows=async<T extends Row>(statement:string,values:unknown[]=[])=>await run<QueryResultRow>(statement,values) as T[];

  async function tables(client:Pool):Promise<TableInfo[]> {
    const [columns,indexes,keys]=await Promise.all([
      client.query<{table_name:string;name:string;type:string;nullable:string;default:string|null}>(
        `SELECT c.relname AS table_name,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,
                CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS nullable,pg_get_expr(d.adbin,d.adrelid) AS default
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
         LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
         WHERE n.nspname=$1 AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,[schema]),
      client.query<{table_name:string;indexname:string}>('SELECT tablename AS table_name,indexname FROM pg_indexes WHERE schemaname=$1 ORDER BY tablename,indexname',[schema]),
      client.query<{table_name:string;name:string}>(
        `SELECT c.relname AS table_name,a.attname AS name FROM pg_index i
         JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(i.indkey)
         WHERE n.nspname=$1 AND i.indisprimary ORDER BY c.relname,a.attnum`,[schema]),
    ]);
    const byTable=new Map<string,TableInfo>();
    const of=(name:string)=>byTable.get(name)??(byTable.set(name,{name,columns:[],indexes:[],primaryKey:[]}),byTable.get(name)!);
    for(const row of columns.rows)of(row.table_name).columns.push({name:row.name,type:row.type,nullable:row.nullable==='YES',default:row.default} satisfies ColumnInfo);
    for(const row of indexes.rows)of(row.table_name).indexes.push(row.indexname);
    for(const row of keys.rows)of(row.table_name).primaryKey.push(row.name);
    return [...byTable.values()];
  }

  return {
    provider:'postgres',id:record.id,
    query:rows,
    async transaction<T>(work:(tx:Pick<Adapter,'query'>)=>Promise<T>) {
      const client:PoolClient=await pool().connect();
      try {
        await client.query('BEGIN');
        const result=await work({query:async<R extends Row>(statement:string,values:unknown[]=[])=>(await client.query(qualify(statement,schema),values)).rows as R[]});
        await client.query('COMMIT');
        return result;
      } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
      finally {client.release();}
    },
    // The one definition of the application's tables, shared with lib/db, so a new PostgreSQL database is built exactly
    // like the one in production instead of from a second copy that could drift.
    async applySchema() {
      const client=await pool().connect();
      try {await client.query('BEGIN');await applyAppSchema(client,schema);await client.query('COMMIT');}
      catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
      finally {client.release();}
    },
    async snapshot():Promise<Snapshot> {
      const client=pool();
      const [{rows:[server]},layout]=await Promise.all([client.query<{version:string}>("SELECT current_setting('server_version') AS version"),tables(client)]);
      // One statement for every count: a per-table round trip to a managed database would cost seconds.
      const names=layout.map(table=>table.name);
      const counts=names.length?(await client.query<{table_name:string;rows:string}>(names.map((name,index)=>`SELECT $${index+1}::text AS table_name,count(*) AS rows FROM ${quote(schema)}.${quote(name)}`).join(' UNION ALL '),names)).rows:[];
      return {serverVersion:server?.version??'',tables:layout,rows:Object.fromEntries(counts.map(row=>[row.table_name,Number(row.rows)]))};
    },
    // md5 per row, then md5 over the row hashes in sorted order: the result does not depend on the order rows come back
    // in, so two servers can be compared without shipping either table across the network.
    async checksum(table:string,columns:string[]) {
      if(!columns.length)throw new Error('A checksum needs at least one column.');
      const projection=columns.map(column=>`coalesce(${quote(column)}::text,'~')`).join(`||'|'||`);
      const {rows:[result]}=await pool().query<{checksum:string}>(`SELECT coalesce(md5(string_agg(h,'' ORDER BY h)),'') AS checksum FROM (SELECT md5(${projection}) AS h FROM ${quote(schema)}.${quote(table)}) hashed`);
      return result?.checksum??'';
    },
    async ping() {
      const started=Date.now();
      // Never throws: a failed test is an answer the panel shows, not a request that fails.
      try {
        const {rows:[server]}=await pool().query<{version:string}>("SELECT current_setting('server_version') AS version");
        return {ok:true,latencyMs:Date.now()-started,serverVersion:server?.version??''};
      } catch {return {ok:false,latencyMs:Date.now()-started,serverVersion:''};}
    },
    // The bootstrap pool belongs to lib/db and outlives any switch, so only a pool this adapter opened is closed.
    async close() {const open=owned;owned=undefined;await open?.end().catch(()=>{});},
  };
}
