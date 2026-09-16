// Batched row copying: the full migration. Every batch is its own transaction, so a dropped connection costs one batch
// and not the whole run; a transient failure is retried with a growing delay; and a table that cannot be copied is
// recorded against that table and the run carries on, because a half-copied report that names the broken table is far
// more useful than an exception that says nothing about the other twenty.
//
// The source is only ever read. Nothing here writes to it.

import {randomUUID} from 'node:crypto';
import type {Adapter,Provider,Row,Snapshot,SyncMode,SyncReport,TableInfo,TableResult} from '../types';
import {assertPlanCovers,copyPlan,deleteOrder,ref,type TableStep} from './plan';
import {convertValue,resolveLogical,type ColumnRule} from './convert';
import {tableChecksum,verifyIntegrity} from './verify';

export type CopyOptions={
  batchSize?:number;retries?:number;backoffMs?:number;
  /** Limits the run to these tables. They are still copied in plan order. */
  tables?:string[];
  /** Empties the target tables first. A re-run without it adds to whatever is already there. */
  replace?:boolean;
  onProgress?:(report:SyncReport)=>void;
  sleep?:(ms:number)=>Promise<void>;
  now?:()=>number;
};

const DEFAULTS={batchSize:500,retries:3,backoffMs:250};
export const messageOf=(error:unknown)=>error instanceof Error?error.message:String(error);
const wait=(ms:number)=>new Promise<void>(resolve=>{setTimeout(resolve,ms);});
const count=async (adapter:Adapter,table:string)=>Number((await adapter.query<Row>(`SELECT count(*) AS total FROM ${ref(table)}`))[0]?.total??0);

/** Worth another attempt: the network or the server said "not now", never "this data is wrong". */
export function transient(error:unknown){
  const text=messageOf(error).toLowerCase();
  const code=String((error as {code?:unknown})?.code??'').toUpperCase();
  if(['ECONNRESET','ETIMEDOUT','EPIPE','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT','ER_CON_COUNT_ERROR','40001','40P01','08006','08003','57P01','53300'].includes(code))return true;
  return /connection (terminated|closed|lost)|server closed|socket hang up|timeout|deadlock|lock wait|too many (connections|clients)|temporarily unavailable|read econnreset/.test(text);
}

export async function withRetry<T>(run:()=>Promise<T>,options:CopyOptions={}):Promise<T>{
  const retries=options.retries??DEFAULTS.retries,backoffMs=options.backoffMs??DEFAULTS.backoffMs,sleep=options.sleep??wait;
  for(let attempt=0;;attempt++){
    try{return await run();}
    catch(error){
      if(attempt>=retries||!transient(error))throw error;
      await sleep(backoffMs*2**attempt);
    }
  }
}

export type TableRules={rules:Record<string,ColumnRule>;missing:string[];unreadable:string[]};
/** Pairs the two sides column by column. A column the target lacks, or a type this engine cannot move, is reported
 *  rather than skipped — skipping it would drop that column's data from every row without anyone noticing. */
export function columnRules(source:TableInfo,target:TableInfo,sourceProvider:Provider,targetProvider:Provider):TableRules{
  const rules:Record<string,ColumnRule>={},missing:string[]=[],unreadable:string[]=[];
  for(const column of source.columns){
    const match=target.columns.find(candidate=>candidate.name===column.name);
    if(!match){missing.push(column.name);continue;}
    const logical=resolveLogical({provider:sourceProvider,type:column.type},{provider:targetProvider,type:match.type});
    if(!logical){unreadable.push(`${column.name} (${column.type} -> ${match.type})`);continue;}
    rules[column.name]={logical,nullable:match.nullable,column:`${source.name}.${column.name}`};
  }
  return {rules,missing,unreadable};
}

const placeholders=(row:unknown[],start:number)=>`(${row.map((_,index)=>`$${start+index+1}`).join(',')})`;
// Column names here come from live information_schema/pg_catalog introspection of whatever server an administrator
// configured (columnRules() in this file), not from the hardcoded, closed SCHEMA_TABLES list that table names come
// from (see plan.ts's assertPlanCovers). A compromised or malicious server on either side of a sync could therefore
// answer with a crafted column name; quoting it here — the same way postgres.ts/mysql.ts already quote identifiers
// in their own checksum()/snapshot() — stops that name from being read as anything but an identifier.
export const quoteIdent=(name:string)=>`"${name.replace(/"/g,'""')}"`;

/** Copies one table in batches. Returns the rows that still need their deferred reference columns filled in. */
async function copyTable(source:Adapter,target:Adapter,step:TableStep,rules:Record<string,ColumnRule>,options:CopyOptions){
  const columns=Object.keys(rules),batchSize=options.batchSize??DEFAULTS.batchSize;
  const deferred=step.deferred.filter(column=>columns.includes(column));
  const order=step.key.length?` ORDER BY ${step.key.join(',')}`:'';
  const select=`SELECT ${columns.map(quoteIdent).join(',')} FROM ${ref(step.table)}${order} LIMIT $1 OFFSET $2`;
  const insert=`INSERT INTO ${ref(step.table)} (${columns.map(quoteIdent).join(',')}) VALUES `;
  const pending:Row[]=[];
  let copied=0;
  for(let offset=0;;offset+=batchSize){
    const rows=await withRetry(()=>source.query<Row>(select,[batchSize,offset]),options);
    if(!rows.length)break;
    const values:unknown[]=[];
    const tuples=rows.map(row=>{
      const converted=columns.map(column=>convertValue(row[column],rules[column],target.provider));
      // A deferred column points at a table copied later, so it goes in empty and is filled by fillDeferred().
      if(deferred.some(column=>row[column]!==null&&row[column]!==undefined))pending.push(row);
      const tuple=placeholders(converted,values.length);
      converted.forEach((value,index)=>values.push(deferred.includes(columns[index])?null:value));
      return tuple;
    });
    await withRetry(()=>target.transaction(tx=>tx.query(insert+tuples.join(','),values)),options);
    copied+=rows.length;
    if(rows.length<batchSize)break;
  }
  return {copied,pending,deferred};
}

async function fillDeferred(target:Adapter,step:TableStep,rules:Record<string,ColumnRule>,rows:Row[],deferred:string[],options:CopyOptions){
  if(!rows.length||!deferred.length)return;
  const batchSize=options.batchSize??DEFAULTS.batchSize;
  for(let start=0;start<rows.length;start+=batchSize){
    const slice=rows.slice(start,start+batchSize);
    await withRetry(()=>target.transaction(async tx=>{
      for(const row of slice){
        const values:unknown[]=[];
        const assign=deferred.map(column=>{values.push(convertValue(row[column],rules[column],target.provider));return `${column}=$${values.length}`;}).join(',');
        const match=step.key.map(column=>{values.push(convertValue(row[column],rules[column],target.provider));return `${column}=$${values.length}`;}).join(' AND ');
        await tx.query(`UPDATE ${ref(step.table)} SET ${assign} WHERE ${match}`,values);
      }
    }),options);
  }
}

export const emptyResult=(table:string):TableResult=>({table,copied:0,sourceRows:0,targetRows:0,checksumMatch:null,error:''});

export function newReport(mode:SyncMode,source:string,target:string,now:()=>number):SyncReport{
  return {id:randomUUID(),mode,source,target,phase:'connecting',startedAt:new Date(now()).toISOString(),finishedAt:null,durationMs:0,tables:[],totalCopied:0,verified:false,errors:[]};
}
export function finish(report:SyncReport,started:number,now:()=>number){
  report.finishedAt=new Date(now()).toISOString();
  report.durationMs=now()-started;
  report.totalCopied=report.tables.reduce((sum,table)=>sum+table.copied,0);
  if(report.phase!=='failed')report.phase=report.errors.length?'failed':'done';
  // Nothing but a clean, fully verified run may claim to be verified — a switch reads this field.
  if(report.phase!=='done'||report.tables.some(table=>table.error||table.checksumMatch!==true))report.verified=false;
  return report;
}

/**
 * The one-time migration: every table, in foreign-key order, verified before it claims success. Table-level failures
 * are collected instead of thrown, so the report names exactly which tables need attention.
 */
export async function fullSync(source:Adapter,target:Adapter,options:CopyOptions={}):Promise<SyncReport>{
  const now=options.now??Date.now,started=now();
  const report=newReport('full',source.id,target.id,now);
  const progress=()=>options.onProgress?.(report);
  try{
    const [sourceShape]=await Promise.all([source.snapshot(),target.applySchema()]);
    report.phase='schema';progress();
    const targetShape=await target.snapshot();
    assertPlanCovers(sourceShape.tables.map(table=>table.name));
    const plan=copyPlan().filter(step=>(!options.tables||options.tables.includes(step.table))&&sourceShape.tables.some(table=>table.name===step.table));
    if(options.replace)for(const step of deleteOrder(plan))await withRetry(()=>target.query(`DELETE FROM ${ref(step.table)}`),options);
    report.phase='copying';progress();

    const ruleSets=new Map<string,Record<string,ColumnRule>>();
    for(const step of plan){
      const result=emptyResult(step.table);
      report.tables.push(result);
      try{
        const sourceTable=sourceShape.tables.find(table=>table.name===step.table)!;
        const targetTable=targetShape.tables.find(table=>table.name===step.table);
        if(!targetTable)throw new Error(`The target has no ${step.table} table, so its rows have nowhere to go.`);
        const {rules,missing,unreadable}=columnRules(sourceTable,targetTable,source.provider,target.provider);
        if(missing.length)throw new Error(`The target is missing ${step.table} column(s) ${missing.join(', ')}; copying would drop that data.`);
        if(unreadable.length)throw new Error(`These ${step.table} column types cannot be converted safely: ${unreadable.join(', ')}.`);
        ruleSets.set(step.table,rules);
        result.sourceRows=sourceShape.rows[step.table]??await count(source,step.table);
        const copied=await copyTable(source,target,step,rules,options);
        result.copied=copied.copied;
        await fillDeferred(target,step,rules,copied.pending,copied.deferred,options);
        result.targetRows=await count(target,step.table);
        if(result.targetRows!==result.sourceRows)throw new Error(`${step.table}: ${result.targetRows} rows arrived where the source holds ${result.sourceRows}.`);
      }catch(error){
        result.error=messageOf(error);
        report.errors.push(`${step.table}: ${result.error}`);
      }
      progress();
    }

    report.phase='verifying';progress();
    for(const result of report.tables){
      if(result.error)continue;
      try{
        const rules=ruleSets.get(result.table)!;
        const columns=Object.keys(rules);
        const [left,right]=await Promise.all([tableChecksum(source,result.table,columns,rules),tableChecksum(target,result.table,columns,rules)]);
        result.checksumMatch=left===right;
        if(!result.checksumMatch)report.errors.push(`${result.table}: the copied rows do not match the source.`);
      }catch(error){
        result.checksumMatch=false;
        result.error=messageOf(error);
        report.errors.push(`${result.table}: could not be verified: ${result.error}`);
      }
    }
    const integrity=await verifyIntegrity(source,target);
    if(!integrity.passed)report.errors.push('The integrity check did not pass.');
    report.verified=integrity.passed&&!report.errors.length;
  }catch(error){
    report.phase='failed';
    report.errors.push(messageOf(error));
  }
  finish(report,started,now);
  progress();
  return report;
}
