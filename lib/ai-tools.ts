import catalogue from './ai-tools.json';

/** Which question a picker answers: AI built into the project, or AI used while writing it. */
export type AiScope='project'|'coding';
export type AiTool={name:string;maker:string;category:string;use:'both'|AiScope;aliases:string[];icon:string};

/** Stored in the same comma-separated field as tool names; picking it replaces every other answer. */
export const NO_AI='No AI used';
export const aiTools=catalogue as AiTool[];

const same=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
export const isNoAi=(name:string)=>same(name,NO_AI);
/** Exact names only, so a custom entry is never given another tool's logo through an alias. */
export const findAiTool=(name:string)=>aiTools.find(tool=>same(tool.name,name));
export const aiToolMatches=(tool:AiTool,query:string)=>{const q=query.trim().toLowerCase();return !q||[tool.name,tool.maker,tool.category,...tool.aliases].some(text=>text.toLowerCase().includes(q));};

/** Coding assistants lead the coding list; general assistants and model providers lead the project list. */
export function aiToolsFor(scope:AiScope){
 const list=aiTools.filter(tool=>tool.use==='both'||tool.use===scope);
 return scope==='coding'?[...list.filter(tool=>tool.use==='coding'),...list.filter(tool=>tool.use!=='coding')]:list;
}
