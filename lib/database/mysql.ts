// The MySQL/MariaDB adapter: a pooled mysql2 connection behind the same Adapter shape as postgres.ts, so lib/db.ts and
// every one of the 206 call sites elsewhere never know they are not talking to PostgreSQL.
//
// Two things make this correct rather than merely convenient:
//  - `r.` stays in every statement all the way through translate() — the dialect module's RETURNING emulation
//    (rewriteWrites) matches and re-emits `r.tablename` verbatim, so stripping the prefix before translating would
//    break its regex, and stripping it after is what actually scopes each query to this connection's own database
//    (MySQL has no separate schema concept; DatabaseRecord.schema *is* the database name here — see the admin form).
//  - a translated statement with a `pre` or `post` companion (RETURNING's stand-in) is run on ONE connection inside
//    ONE transaction, never as two independent pool.query() calls. The row an UPDATE...RETURNING or an upsert reports
//    back must be read while the write's own row lock is still held, or a concurrent request could change it first —
//    exactly the query() vs. transaction() distinction that matters for lib/auth.ts rateLimit(), which calls plain
//    db.query() with an upsert-then-RETURNING statement outside any explicit transaction.
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import type { Adapter, ColumnInfo, DatabaseRecord, Row, Snapshot, TableInfo } from './types';
import { translate, UnsupportedSql, type Statement, type Translated } from './dialect/mysql';
import { CHARSET, DEFERRED_CONSTRAINTS, SEEDS, TABLES, alreadyApplied } from './dialect/ddl';

const strip=(sql:string)=>sql.replace(/\br\./g,'');
const messageOf=(error:unknown)=>error instanceof Error?error.message:String(error);

function sslFor(record:DatabaseRecord) {
  if(record.ssl==='disable')return undefined;
  const file=process.env.DATABASE_CA_CERT_FILE;
  const ca=process.env.DATABASE_CA_CERT?.trim()||(file?readFileSync(file,'utf8'):'');
  return {rejectUnauthorized:record.ssl!=='no-verify',...(ca?{ca}:{})};
}

export function createMysqlAdapter(record:DatabaseRecord,password:string):Adapter {
  const pool=mysql.createPool({
    host:record.host,port:record.port,user:record.username,password,database:record.database,
    ssl:sslFor(record),charset:CHARSET,
    connectionLimit:Number(process.env.DATABASE_POOL_MAX)||5,
    idleTimeout:Number(process.env.DATABASE_POOL_IDLE_MS)||600000,
    enableKeepAlive:true,keepAliveInitialDelay:30000,
    connectTimeout:15000,
    // Dates come back as JS Date objects in local (server) time by default; the app always writes and reads UTC, and
    // dateStrings would hand back text that the sync engine's convert.ts would have to re-parse for no benefit.
    timezone:'Z',
    supportBigNumbers:true,
  });
  // PIPES_AS_CONCAT makes `a||b` string concatenation, matching the Postgres operator some queries still use.
  // ANSI_QUOTES is a second line of defence: translate() already rewrites "quoted identifiers" to backticks itself.
  pool.on('connection',connection=>{void connection.query("SET SESSION sql_mode=CONCAT(@@sql_mode,',PIPES_AS_CONCAT,ANSI_QUOTES')").catch(()=>{});});
  // mysql2/promise's Pool typing omits 'error' (only connection/acquire/release/enqueue are declared), but the pool it
  // wraps still emits it — the same unhandled-error crash risk as pg.Pool, so it is still listened for.
  (pool as unknown as {on(event:'error',listener:(error:Error)=>void):void}).on('error',()=>console.error('Database connection interrupted.'));

  async function runMain<T extends Row>(runner:{query:(sql:string,values?:unknown[])=>Promise<[unknown,unknown]>},statement:Statement):Promise<T[]> {
    const [rows]=await runner.query(strip(statement.sql),statement.values);
    return (Array.isArray(rows)?rows:[]) as T[];
  }

  /** Runs one translated statement. A `pre`/`post` companion is the RETURNING stand-in and must share the main
   *  statement's transaction and connection so the row it reads cannot change between the two queries. */
  async function run<T extends Row>(translated:Translated):Promise<T[]> {
    if(!translated.pre&&!translated.post)return runMain<T>(pool,translated);
    const connection=await pool.getConnection();
    try {
      await connection.beginTransaction();
      const before=translated.pre?await runMain<T>(connection,translated.pre):null;
      await runMain(connection,translated);
      const after=translated.post?await runMain<T>(connection,translated.post):null;
      await connection.commit();
      return after??before??[];
    } catch(error) {await connection.rollback().catch(()=>{});throw error;}
    finally {connection.release();}
  }

  const query=async<T extends Row>(statement:string,values:unknown[]=[])=>run<T>(translate(statement,values));

  async function tables():Promise<TableInfo[]> {
    const [[columns],[indexes],[keys]]=await Promise.all([
      pool.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME AS table_name,COLUMN_NAME AS name,COLUMN_TYPE AS type,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS \`default\`
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION`),
      pool.query<mysql.RowDataPacket[]>(`SELECT TABLE_NAME AS table_name,INDEX_NAME AS indexname FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() GROUP BY TABLE_NAME,INDEX_NAME`),
      pool.query<mysql.RowDataPacket[]>(`SELECT TABLE_NAME AS table_name,COLUMN_NAME AS name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_NAME='PRIMARY' ORDER BY TABLE_NAME,ORDINAL_POSITION`),
    ]);
    const byTable=new Map<string,TableInfo>();
    const of=(name:string)=>byTable.get(name)??(byTable.set(name,{name,columns:[],indexes:[],primaryKey:[]}),byTable.get(name)!);
    for(const row of columns)of(String(row.table_name)).columns.push({name:String(row.name),type:String(row.type),nullable:row.nullable==='YES',default:row.default==null?null:String(row.default)} satisfies ColumnInfo);
    for(const row of indexes)of(String(row.table_name)).indexes.push(String(row.indexname));
    for(const row of keys)of(String(row.table_name)).primaryKey.push(String(row.name));
    return [...byTable.values()];
  }

  return {
    provider:'mysql',id:record.id,
    query,
    async transaction<T>(work:(tx:Pick<Adapter,'query'>)=>Promise<T>) {
      const connection=await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result=await work({query:async<R extends Row>(statement:string,values:unknown[]=[])=>{
          const translated=translate(statement,values);
          if(translated.pre||translated.post) {
            const before=translated.pre?await runMain<R>(connection,translated.pre):null;
            await runMain(connection,translated);
            const after=translated.post?await runMain<R>(connection,translated.post):null;
            return after??before??[];
          }
          return runMain<R>(connection,translated);
        }});
        await connection.commit();
        return result;
      } catch(error) {await connection.rollback().catch(()=>{});throw error;}
      finally {connection.release();}
    },
    // Every statement is idempotent (CREATE TABLE IF NOT EXISTS, or an error code alreadyApplied() recognises), so
    // this can run against a brand-new database or one this ran against before with the same result either way.
    async applySchema() {
      for(const statement of [...TABLES,...DEFERRED_CONSTRAINTS,...SEEDS]) {
        try {await pool.query(statement);}
        catch(error) {if(!alreadyApplied(error))throw new Error(`${messageOf(error)} — while running: ${statement.replace(/\s+/g,' ').trim().slice(0,200)}`);}
      }
    },
    async snapshot():Promise<Snapshot> {
      const [[[version]],layout]=await Promise.all([pool.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version'),tables()]);
      const names=layout.map(table=>table.name);
      const counts=names.length
        ?(await pool.query<mysql.RowDataPacket[]>(names.map(name=>`SELECT '${name.replace(/'/g,"''")}' AS table_name,COUNT(*) AS rows FROM \`${name.replace(/`/g,'``')}\``).join(' UNION ALL ')))[0]
        :[];
      return {serverVersion:String(version?.version??''),tables:layout,rows:Object.fromEntries(counts.map(row=>[String(row.table_name),Number(row.rows)]))};
    },
    // md5 per row (MySQL's own MD5()), then a stable aggregate over the sorted per-row hashes — GROUP_CONCAT is
    // MySQL's string_agg, and ORDER BY inside it makes the result independent of the order rows come back in, just
    // like the Postgres adapter's string_agg(...ORDER BY h).
    async checksum(table:string,columns:string[]) {
      if(!columns.length)throw new Error('A checksum needs at least one column.');
      const name=`\`${table.replace(/`/g,'``')}\``;
      const projection=columns.map(column=>`COALESCE(CAST(\`${column.replace(/`/g,'``')}\` AS CHAR),'~')`).join(`,'|',`);
      const [[result]]=await pool.query<mysql.RowDataPacket[]>(
        `SELECT COALESCE(MD5(GROUP_CONCAT(h ORDER BY h SEPARATOR '')),'') AS checksum FROM (SELECT MD5(CONCAT_WS('',${projection})) AS h FROM ${name}) hashed`);
      return String(result?.checksum??'');
    },
    async ping() {
      const started=Date.now();
      try {
        const [[row]]=await pool.query<mysql.RowDataPacket[]>('SELECT VERSION() AS version');
        return {ok:true,latencyMs:Date.now()-started,serverVersion:String(row?.version??'')};
      } catch {return {ok:false,latencyMs:Date.now()-started,serverVersion:''};}
    },
    async close() {await pool.end().catch(()=>{});},
  };
}

export {UnsupportedSql};
