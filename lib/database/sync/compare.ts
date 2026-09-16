// What a switch checks before it touches a single row: do the two servers agree on tables, columns and types closely
// enough to copy between them. Uses the exact same column pairing as the copy engine (columnRules), so a comparison
// that says "compatible" is a comparison that fullSync has already proven it can act on — never two different opinions
// about the same schema.

import type {Adapter,Comparison,Provider,TableDiff,TableInfo} from '../types';
import {columnRules} from './copy';

const messageOf=(error:unknown)=>error instanceof Error?error.message:String(error);

function diffTable(source:TableInfo,target:TableInfo,sourceProvider:Provider,targetProvider:Provider,sourceRows:number,targetRows:number):TableDiff {
  const {missing,unreadable}=columnRules(source,target,sourceProvider,targetProvider);
  const extra=target.columns.map(column=>column.name).filter(name=>!source.columns.some(candidate=>candidate.name===name));
  return {
    table:source.name,
    onlyInSource:missing,
    onlyInTarget:extra,
    // unreadable already reads "column (sourceType -> targetType)"; split it back into the shape the panel wants.
    typeMismatches:unreadable.map(entry=>{
      const match=/^(.+?) \((.+?) -> (.+?)\)$/.exec(entry);
      return match?{column:match[1],source:match[2],target:match[3]}:{column:entry,source:'',target:''};
    }),
    sourceRows,targetRows,
  };
}

/**
 * Compares two live adapters. A table missing from the target, or a column this engine cannot convert, makes the pair
 * incompatible — the switch refuses to proceed until `schema` (applySchema on the target) or a manual fix closes the
 * gap. Row-count and checksum agreement are NOT part of `compatible`: those only make sense after a sync has run, and
 * belong to verify.ts instead.
 */
export async function compareSnapshots(source:Adapter,target:Adapter):Promise<Comparison> {
  const generatedAt=new Date().toISOString();
  try {
    const [sourceShape,targetShape]=await Promise.all([source.snapshot(),target.snapshot()]);
    const sourceNames=sourceShape.tables.map(table=>table.name),targetNames=targetShape.tables.map(table=>table.name);
    const missingTables=sourceNames.filter(name=>!targetNames.includes(name));
    const extraTables=targetNames.filter(name=>!sourceNames.includes(name));
    const tables=sourceShape.tables.filter(table=>targetNames.includes(table.name)).map(table=>{
      const other=targetShape.tables.find(candidate=>candidate.name===table.name)!;
      return diffTable(table,other,source.provider,target.provider,sourceShape.rows[table.name]??0,targetShape.rows[table.name]??0);
    });
    const rowTotals={
      source:Object.values(sourceShape.rows).reduce((sum,value)=>sum+value,0),
      target:Object.values(targetShape.rows).reduce((sum,value)=>sum+value,0),
    };
    const compatible=!missingTables.length&&tables.every(diff=>!diff.onlyInSource.length&&!diff.typeMismatches.length);
    return {
      generatedAt,source:source.id,target:target.id,missingTables,extraTables,tables,rowTotals,
      // Schema version is not yet tracked per adapter (see DatabaseRecord.schemaVersion); reported as unknown on both
      // sides rather than guessed, so the panel shows "not tracked" instead of a false match.
      schemaVersion:{source:null,target:null},compatible,
    };
  } catch(error) {
    // A comparison that could not even run is not "compatible" by default — the caller's requireCondition(compatible)
    // must fail closed, exactly like verify.ts fails closed on a check it could not complete.
    return {
      generatedAt,source:source.id,target:target.id,missingTables:[],extraTables:[],
      tables:[{table:'*',onlyInSource:[],onlyInTarget:[],typeMismatches:[{column:'*',source:messageOf(error),target:''}],sourceRows:0,targetRows:0}],
      rowTotals:{source:0,target:0},schemaVersion:{source:null,target:null},compatible:false,
    };
  }
}
