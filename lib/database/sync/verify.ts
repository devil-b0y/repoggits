// The gate a database switch depends on. Everything here is written to fail closed: a check that could not be run
// counts as a failed check, never as a passed one, because a false "passed" here is how a user loses their data —
// the switch happens, the old database is dropped, and the missing rows are found weeks later.
//
// Checksums are computed in this process rather than by each server, because the two servers do not agree on how to
// render a row: MySQL JSON and PostgreSQL jsonb normalise differently, DATETIME has no zone, and TINYINT(1) is not
// `true`. convert.ts canonicalCell() puts both sides into one form first, so a match means the values really are equal.

import {createHash} from 'node:crypto';
import type {Adapter,IntegrityCheck,Row,Snapshot} from '../types';
import {ref,specFor} from './plan';
import {canonicalCell,type ColumnRule} from './convert';
import {columnRules,quoteIdent} from './copy';

/** Tables whose rows are sampled and hashed on both sides. All have a single-column key, so the sample can be matched
 *  row for row by key instead of by position, which two servers with different collations would not agree on. */
export const CHECKSUM_TABLES=['users','projects','versions','settings','audit','activity_events'] as const;
export const SAMPLE_ROWS=200;
const UNKNOWN=-1;

const messageOf=(error:unknown)=>error instanceof Error?error.message:String(error);
const hashRow=(row:Row,columns:string[],rules:Record<string,ColumnRule>)=>createHash('sha256').update(columns.map(column=>canonicalCell(row[column],rules[column].logical)).join(''),'utf8').digest('hex');

/** A stable hash over a table, independent of row order and of which server the rows came from. */
export async function tableChecksum(adapter:Adapter,table:string,columns:string[],rules:Record<string,ColumnRule>,batchSize=500):Promise<string>{
  const key=specFor(table)?.key??[];
  const order=key.length?` ORDER BY ${key.join(',')}`:'';
  const digests:string[]=[];
  for(let offset=0;;offset+=batchSize){
    const rows=await adapter.query<Row>(`SELECT ${columns.map(quoteIdent).join(',')} FROM ${ref(table)}${order} LIMIT $1 OFFSET $2`,[batchSize,offset]);
    for(const row of rows)digests.push(hashRow(row,columns,rules));
    if(rows.length<batchSize)break;
  }
  digests.sort();
  return createHash('sha256').update(digests.join('')).digest('hex');
}

const countOf=async (adapter:Adapter,table:string)=>{
  try{return Number((await adapter.query<Row>(`SELECT count(*) AS total FROM ${ref(table)}`))[0]?.total??UNKNOWN);}
  catch{return UNKNOWN;}
};

/** Foreign keys checked on the target itself: cPanel MySQL installs vary in whether constraints survive an import, so
 *  the rows are asked directly instead of trusting that the constraint exists. Nullable columns are excluded by the
 *  IS NOT NULL test — an absent reference is data, an orphaned one is corruption. */
export const FOREIGN_KEY_CHECKS:{name:string;sql:string}[]=[
  {name:'projects.owner_id',sql:'SELECT count(*) AS orphans FROM r.projects c LEFT JOIN r.users p ON p.id=c.owner_id WHERE p.id IS NULL'},
  {name:'projects.parent_project_id',sql:'SELECT count(*) AS orphans FROM r.projects c LEFT JOIN r.projects p ON p.id=c.parent_project_id WHERE c.parent_project_id IS NOT NULL AND p.id IS NULL'},
  {name:'projects.parent_version_id',sql:'SELECT count(*) AS orphans FROM r.projects c LEFT JOIN r.versions p ON p.id=c.parent_version_id WHERE c.parent_version_id IS NOT NULL AND p.id IS NULL'},
  {name:'versions.project_id',sql:'SELECT count(*) AS orphans FROM r.versions c LEFT JOIN r.projects p ON p.id=c.project_id WHERE p.id IS NULL'},
  {name:'reviews.version_id',sql:'SELECT count(*) AS orphans FROM r.reviews c LEFT JOIN r.versions p ON p.id=c.version_id WHERE p.id IS NULL'},
  {name:'comments.parent_id',sql:'SELECT count(*) AS orphans FROM r.comments c LEFT JOIN r.comments p ON p.id=c.parent_id WHERE c.parent_id IS NOT NULL AND p.id IS NULL'},
  {name:'files.owner_id',sql:'SELECT count(*) AS orphans FROM r.files c LEFT JOIN r.users p ON p.id=c.owner_id WHERE p.id IS NULL'},
  {name:'bookmarks.user_id',sql:'SELECT count(*) AS orphans FROM r.bookmarks c LEFT JOIN r.users p ON p.id=c.user_id WHERE p.id IS NULL'},
  {name:'activity_events.user_id',sql:'SELECT count(*) AS orphans FROM r.activity_events c LEFT JOIN r.users p ON p.id=c.user_id WHERE c.user_id IS NOT NULL AND p.id IS NULL'},
  {name:'activity_events.session_id',sql:'SELECT count(*) AS orphans FROM r.activity_events c LEFT JOIN r.tracked_sessions p ON p.id=c.session_id WHERE c.session_id IS NOT NULL AND p.id IS NULL'},
];

async function foreignKeys(target:Adapter,tables:Set<string>,issues:string[]){
  let ok=true;
  for(const check of FOREIGN_KEY_CHECKS){
    const involved=[...check.sql.matchAll(/r\.(\w+)/g)].map(match=>match[1]);
    if(involved.some(table=>!tables.has(table))){issues.push(`${check.name}: skipped, the target is missing one of ${involved.join(', ')}.`);ok=false;continue;}
    try{
      const orphans=Number((await target.query<Row>(check.sql))[0]?.orphans??UNKNOWN);
      if(orphans!==0){issues.push(`${check.name}: ${orphans===UNKNOWN?'the check returned nothing':`${orphans} rows point at a row that is not there`}.`);ok=false;}
    }catch(error){issues.push(`${check.name}: the check could not be run: ${messageOf(error)}`);ok=false;}
  }
  return ok;
}

async function sampledChecksums(source:Adapter,target:Adapter,shapes:{source:Snapshot;target:Snapshot},issues:string[]){
  let ok=true;
  for(const table of CHECKSUM_TABLES){
    const sourceTable=shapes.source.tables.find(candidate=>candidate.name===table);
    const targetTable=shapes.target.tables.find(candidate=>candidate.name===table);
    if(!sourceTable||!targetTable){issues.push(`${table}: not present on ${sourceTable?'the target':'the source'}, so its rows could not be compared.`);ok=false;continue;}
    const {rules,missing,unreadable}=columnRules(sourceTable,targetTable,source.provider,target.provider);
    if(missing.length||unreadable.length){issues.push(`${table}: cannot be compared column for column (${[...missing,...unreadable].join(', ')}).`);ok=false;continue;}
    const [key]=specFor(table)?.key??[];
    if(!key){issues.push(`${table}: has no key to match rows by.`);ok=false;continue;}
    const columns=Object.keys(rules);
    try{
      // The sample is chosen on the source and then fetched from the target by key, never by position: the two
      // servers sort text differently, so "the first 200 rows" is not the same 200 rows on both sides.
      const sample=await source.query<Row>(`SELECT ${columns.map(quoteIdent).join(',')} FROM ${ref(table)} ORDER BY ${key} LIMIT $1`,[SAMPLE_ROWS]);
      if(!sample.length){
        const targetRows=await countOf(target,table);
        if(targetRows!==0){issues.push(`${table}: the source is empty but the target holds ${targetRows} rows.`);ok=false;}
        continue;
      }
      const keys=sample.map(row=>row[key]);
      const found=await target.query<Row>(`SELECT ${columns.map(quoteIdent).join(',')} FROM ${ref(table)} WHERE ${key} IN (${keys.map((_,index)=>`$${index+1}`).join(',')})`,keys);
      const byKey=new Map(found.map(row=>[canonicalCell(row[key],rules[key].logical),row]));
      for(const row of sample){
        const identity=canonicalCell(row[key],rules[key].logical);
        const other=byKey.get(identity);
        if(!other){issues.push(`${table}: the row ${identity} is on the source but not on the target.`);ok=false;break;}
        if(hashRow(row,columns,rules)!==hashRow(other,columns,rules)){issues.push(`${table}: the row ${identity} differs between the two databases.`);ok=false;break;}
      }
    }catch(error){issues.push(`${table}: the rows could not be compared: ${messageOf(error)}`);ok=false;}
  }
  return ok;
}

/** The same result as verifyIntegrity(), plus the reasons — the admin panel shows the reasons when `passed` is false. */
export async function verifyDetailed(source:Adapter,target:Adapter):Promise<{check:IntegrityCheck;issues:string[]}>{
  const issues:string[]=[];
  const counted={users:{source:UNKNOWN,target:UNKNOWN},projects:{source:UNKNOWN,target:UNKNOWN},events:{source:UNKNOWN,target:UNKNOWN},audit:{source:UNKNOWN,target:UNKNOWN}};
  const check:IntegrityCheck={...counted,foreignKeysOk:false,checksumsOk:false,passed:false};
  try{
    const [sourceShape,targetShape]=await Promise.all([source.snapshot(),target.snapshot()]);
    const tables:[keyof typeof counted,string][]=[['users','users'],['projects','projects'],['events','activity_events'],['audit','audit']];
    for(const [field,table] of tables){
      check[field]={source:await countOf(source,table),target:await countOf(target,table)};
      const {source:left,target:right}=check[field];
      if(left===UNKNOWN||right===UNKNOWN)issues.push(`${table}: the rows could not be counted on ${left===UNKNOWN?'the source':'the target'}.`);
      else if(left!==right)issues.push(`${table}: the source holds ${left} rows and the target holds ${right}.`);
    }
    check.foreignKeysOk=await foreignKeys(target,new Set(targetShape.tables.map(table=>table.name)),issues);
    check.checksumsOk=await sampledChecksums(source,target,{source:sourceShape,target:targetShape},issues);
  }catch(error){
    issues.push(`The check could not be completed: ${messageOf(error)}`);
  }
  const countsOk=Object.values(counted).length>0&&(['users','projects','events','audit'] as const).every(field=>check[field].source!==UNKNOWN&&check[field].source===check[field].target);
  check.passed=countsOk&&check.foreignKeysOk&&check.checksumsOk&&!issues.length;
  return {check,issues};
}

export const verifyIntegrity=async (source:Adapter,target:Adapter)=>(await verifyDetailed(source,target)).check;
