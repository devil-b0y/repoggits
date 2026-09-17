// The copy order, derived rather than guessed. Every table lands after the tables it points at, so a foreign key is
// never inserted before its parent. The relationships below are transcribed from applySchema() in lib/db.ts, which is
// the authoritative layout; the ORDER is computed from them, so adding a relation is enough to move a table.
// Cycles are broken the way scripts/database-transfer.ts breaks them: a nullable reference column is inserted empty
// and filled once every row exists. A cycle through a required column has no valid order at all, so it throws rather
// than produce a plan that would die halfway through a migration.

/** The `r.` sigil every query in this codebase uses; the adapter rewrites it to the connection's own schema. */
export const ref=(table:string)=>`r.${table}`;

export type TableSpec={
  name:string;key:string[];
  /** The column a row is stamped with when it is created, or null when the table has none. Incremental sync needs it. */
  time:string|null;
};
export type Relation={table:string;references:string;columns:string[];required:boolean};
export type TableStep={
  table:string;key:string[];
  /** Nullable reference columns inserted empty and filled by a second pass, because their parent is copied later. */
  deferred:string[];
};

export const SCHEMA_TABLES:readonly TableSpec[]=[
  {name:'users',key:['id'],time:'created_at'},
  {name:'visitors',key:['id'],time:'first_seen_at'},
  {name:'tracked_sessions',key:['id'],time:'started_at'},
  {name:'sessions',key:['hash'],time:'created_at'},
  {name:'tokens',key:['hash'],time:null},
  {name:'projects',key:['id'],time:'created_at'},
  {name:'versions',key:['id'],time:'created_at'},
  {name:'reviews',key:['id'],time:'created_at'},
  {name:'comments',key:['id'],time:'created_at'},
  {name:'comment_votes',key:['user_id','comment_id'],time:'created_at'},
  {name:'reactions',key:['user_id','project_id','kind'],time:'created_at'},
  {name:'bookmarks',key:['user_id','project_id'],time:null},
  {name:'notifications',key:['id'],time:'created_at'},
  {name:'files',key:['id'],time:'created_at'},
  {name:'ai_requests',key:['id'],time:'created_at'},
  {name:'activity_events',key:['id'],time:'created_at'},
  {name:'audit',key:['id'],time:'created_at'},
  {name:'error_log',key:['id'],time:'created_at'},
  {name:'api_usage',key:['bucket'],time:'bucket'},
  {name:'outbox',key:['id'],time:'created_at'},
  {name:'rate_limits',key:['key'],time:null},
  {name:'settings',key:['key'],time:null},
];

export const SCHEMA_RELATIONS:readonly Relation[]=[
  {table:'sessions',references:'users',columns:['user_id'],required:true},
  {table:'sessions',references:'tracked_sessions',columns:['tracked_session_id'],required:false},
  {table:'tokens',references:'users',columns:['user_id'],required:true},
  {table:'projects',references:'users',columns:['owner_id'],required:true},
  {table:'projects',references:'projects',columns:['parent_project_id'],required:false},
  {table:'projects',references:'versions',columns:['parent_version_id'],required:false},
  {table:'versions',references:'projects',columns:['project_id'],required:true},
  {table:'reviews',references:'versions',columns:['version_id'],required:true},
  {table:'reviews',references:'users',columns:['admin_id'],required:true},
  {table:'comments',references:'projects',columns:['project_id'],required:false},
  {table:'comments',references:'users',columns:['user_id'],required:false},
  {table:'comments',references:'comments',columns:['parent_id'],required:false},
  {table:'comment_votes',references:'users',columns:['user_id'],required:true},
  {table:'comment_votes',references:'comments',columns:['comment_id'],required:true},
  {table:'reactions',references:'users',columns:['user_id'],required:true},
  {table:'reactions',references:'projects',columns:['project_id'],required:true},
  {table:'bookmarks',references:'users',columns:['user_id'],required:true},
  {table:'bookmarks',references:'projects',columns:['project_id'],required:true},
  {table:'notifications',references:'users',columns:['user_id'],required:true},
  {table:'notifications',references:'projects',columns:['project_id'],required:false},
  {table:'files',references:'users',columns:['owner_id'],required:true},
  {table:'audit',references:'users',columns:['actor_id'],required:false},
  {table:'visitors',references:'users',columns:['user_id'],required:false},
  {table:'tracked_sessions',references:'users',columns:['user_id'],required:false},
  {table:'tracked_sessions',references:'visitors',columns:['visitor_id'],required:false},
  {table:'tracked_sessions',references:'projects',columns:['current_project_id'],required:false},
  {table:'ai_requests',references:'users',columns:['user_id'],required:true},
  {table:'ai_requests',references:'tracked_sessions',columns:['session_id'],required:false},
  {table:'ai_requests',references:'projects',columns:['project_id'],required:false},
  {table:'activity_events',references:'users',columns:['user_id'],required:false},
  {table:'activity_events',references:'tracked_sessions',columns:['session_id'],required:false},
  {table:'activity_events',references:'visitors',columns:['visitor_id'],required:false},
  {table:'activity_events',references:'projects',columns:['project_id'],required:false},
  {table:'activity_events',references:'ai_requests',columns:['prompt_id'],required:false},
];

export function copyPlan(tables:readonly TableSpec[]=SCHEMA_TABLES,relations:readonly Relation[]=SCHEMA_RELATIONS):TableStep[]{
  const names=tables.map(table=>table.name);
  for(const link of relations){
    const missing=!names.includes(link.table)?link.table:!names.includes(link.references)?link.references:'';
    if(missing)throw new Error(`The relation ${link.table} -> ${link.references} names a table that is not in the plan: ${missing}.`);
  }
  const deferred=new Map(names.map(name=>[name,new Set<string>()]));
  // A self reference orders rows *within* one table, which no table order can fix, so it is always filled afterwards.
  for(const link of relations)if(link.table===link.references){
    if(link.required)throw new Error(`${link.table} references itself through a required column, so no copy order exists: ${link.columns.join(', ')}.`);
    link.columns.forEach(column=>deferred.get(link.table)!.add(column));
  }
  const placed=new Set<string>(),order:string[]=[];
  const unmet=(name:string)=>relations.filter(link=>link.table===name&&!placed.has(link.references)&&!link.columns.every(column=>deferred.get(name)!.has(column)));
  while(order.length<names.length){
    const ready=names.filter(name=>!placed.has(name)&&!unmet(name).length);
    if(ready.length){for(const name of ready){placed.add(name);order.push(name);}continue;}
    // Nothing is ready, so a cycle is left. Break it at the table the most others wait on, and only through nullable
    // columns — emptying a required column would break the copy instead of deferring it.
    const waiting=(name:string)=>names.filter(other=>!placed.has(other)&&unmet(other).some(link=>link.references===name)).length;
    const [breakable]=names.filter(name=>!placed.has(name)&&unmet(name).every(link=>!link.required)).sort((a,b)=>waiting(b)-waiting(a));
    if(!breakable)throw new Error(`These tables reference each other through required columns, so no copy order exists: ${names.filter(name=>!placed.has(name)).join(', ')}.`);
    for(const link of unmet(breakable))link.columns.forEach(column=>deferred.get(breakable)!.add(column));
  }
  return order.map(name=>{
    const spec=tables.find(table=>table.name===name)!,columns=[...deferred.get(name)!];
    if(columns.length&&!spec.key.length)throw new Error(`${name} needs a primary key: its deferred reference columns (${columns.join(', ')}) are filled in by key.`);
    return {table:name,key:spec.key,deferred:columns};
  });
}

/** Rows are removed child-first, the mirror of the copy order, so a delete never trips a foreign key either. */
export const deleteOrder=(plan:TableStep[]=copyPlan())=>[...plan].reverse();

export const specFor=(table:string,tables:readonly TableSpec[]=SCHEMA_TABLES)=>tables.find(spec=>spec.name===table)??null;

/**
 * Guards the failure that silently loses data: a schema upgrade adds a table, the registry above does not know it, and
 * the engine copies everything *except* that table while reporting success. Live tables must be a subset of the plan.
 */
export function assertPlanCovers(liveTables:string[],tables:readonly TableSpec[]=SCHEMA_TABLES){
  const known=new Set(tables.map(table=>table.name));
  const unknown=liveTables.filter(name=>!known.has(name));
  if(unknown.length)throw new Error(`The database holds tables the sync plan does not know, so they would not be copied: ${unknown.join(', ')}. Add them to SCHEMA_TABLES in lib/database/sync/plan.ts.`);
}
