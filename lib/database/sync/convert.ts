// The type conversion layer between PostgreSQL and MySQL. Every rule below is lossless or throws: a migration that
// quietly rounds a timestamp, drops a JSON key or turns NULL into '' is worse than one that stops, because the damage
// is only found once the old database is gone.
//
// CONVENTIONS THIS FILE FIXES, AND WHY
//  * Time is UTC, always. MySQL DATETIME(6) carries no zone, so a zone would have to live somewhere else and be
//    guessed later. PostgreSQL timestamptz values are therefore rendered as UTC wall time on the way out, and MySQL
//    DATETIME values are read back as UTC on the way in. Sub-microsecond precision has nowhere to go in DATETIME(6),
//    so a value carrying it throws instead of being rounded.
//  * An id is CHAR(36) text in its canonical lowercase form, never BINARY(16). The id text is what appears in URLs,
//    audit rows and JSON payloads, so it has to survive the move byte for byte.
//  * NULL and '' are different values and are never swapped. A NULL bound for a NOT NULL column throws.
//  * JSON is moved as the source's own text, never re-serialised, so whatever key order the source kept is kept.
//    Both engines normalise JSON on storage in their own way, so *comparisons* use canonicalJson() instead of the text.

import type {Provider,Row} from '../types';

export type Logical='uuid'|'text'|'timestamptz'|'boolean'|'json'|'text[]'|'integer'|'bigint'|'numeric'|'float'|'bytes';
export type ColumnRule={logical:Logical;nullable:boolean;column?:string};

/** The rule table, in one place, so it can be read and tested rather than inferred from the code below. */
export const RULES:{logical:Logical;postgres:string;mysql:string;rule:string}[]=[
  {logical:'uuid',postgres:'uuid',mysql:'CHAR(36)',rule:'Canonical lowercase 8-4-4-12 text both ways. Anything that is not a uuid throws; BINARY(16) is rejected, not decoded.'},
  {logical:'text',postgres:'text',mysql:'LONGTEXT',rule:"Passed through unchanged. '' stays '', NULL stays NULL. Unpaired surrogates throw (utf8mb4 cannot hold them) and a NUL character throws on the way into PostgreSQL."},
  {logical:'timestamptz',postgres:'timestamptz',mysql:'DATETIME(6)',rule:'Normalised to UTC. To MySQL: "YYYY-MM-DD HH:MM:SS.ffffff". To PostgreSQL: the same instant with a Z suffix. A MySQL DATETIME with no offset is read as UTC. More than 6 fractional digits throws.'},
  {logical:'boolean',postgres:'boolean',mysql:'TINYINT(1)',rule:"true/false <-> 1/0. 't'/'f', '1'/'0', 'true'/'false' and a one-byte BIT are accepted; any other number (TINYINT holds 2) throws."},
  {logical:'json',postgres:'jsonb',mysql:'JSON',rule:'Moved as the source\'s own text after a parse check, so key order survives. Objects are stringified; undefined, NaN, Infinity, bigint, Date, binary and cycles throw.'},
  {logical:'text[]',postgres:'text[]',mysql:'JSON (array of strings)',rule:'PostgreSQL array literals and driver arrays become a JSON array; elements must be text or null. Nested arrays throw.'},
  {logical:'integer',postgres:'integer',mysql:'INT',rule:'Must be a whole number inside signed 32-bit range; a fraction or an overflow throws.'},
  {logical:'bigint',postgres:'bigint',mysql:'BIGINT',rule:'Carried as a digit string, never a JS number, so values past 2^53 keep every digit. An unsafe number input throws.'},
  {logical:'numeric',postgres:'numeric',mysql:'DECIMAL(65,30)',rule:'Carried as an exact decimal string. Exponent notation, NaN, Infinity, more than 65 digits or more than 30 decimal places throw.'},
  {logical:'float',postgres:'real / double precision',mysql:'FLOAT / DOUBLE',rule:'Carried as a finite JS number (IEEE 754 double). NaN and Infinity throw, as neither column type can store them.'},
  {logical:'bytes',postgres:'bytea',mysql:'LONGBLOB',rule:"Carried as bytes. PostgreSQL's \\x hex text form is decoded; any other string throws rather than being stored as its own characters."},
];

const fail=(rule:ColumnRule,detail:string):never=>{throw new Error(`${rule.column??rule.logical}: ${detail}`);};
const shortText=(value:unknown)=>{const text=typeof value==='string'?value:Object.prototype.toString.call(value);return text.length>40?`${text.slice(0,40)}…`:text;};

// ----- type names -----
const PG_TYPES:[RegExp,Logical][]=[
  [/^uuid$/,'uuid'],
  [/^jsonb?$/,'json'],
  [/^text\[\]$/,'text[]'],
  [/^(character varying|character|text|citext|name|"char")/,'text'],
  [/^timestamp/,'timestamptz'],
  [/^bool(ean)?$/,'boolean'],
  [/^(smallint|integer|int[248]?|serial)/,'integer'],
  [/^bigint|^bigserial/,'bigint'],
  [/^(numeric|decimal)/,'numeric'],
  [/^(real|double precision|float)/,'float'],
  [/^bytea$/,'bytes'],
];
const MYSQL_TYPES:[RegExp,Logical][]=[
  [/^char\(36\)/,'uuid'],
  [/^json$/,'json'],
  [/^(tinyint\(1\)|bool(ean)?|bit\(1\))/,'boolean'],
  [/^(longtext|mediumtext|tinytext|text|varchar|char|enum|set)/,'text'],
  [/^(datetime|timestamp|date)/,'timestamptz'],
  [/^bigint/,'bigint'],
  [/^(int|integer|mediumint|smallint|tinyint|year)/,'integer'],
  [/^(decimal|numeric)/,'numeric'],
  [/^(float|double)/,'float'],
  [/^(longblob|mediumblob|tinyblob|blob|varbinary|binary)/,'bytes'],
];

/** Null when the type is not one this engine can move — callers treat that as incompatible, never as "probably fine". */
export function logicalOf(type:string,provider:Provider):Logical|null{
  const name=type.trim().toLowerCase();
  for(const [pattern,logical] of provider==='postgres'?PG_TYPES:MYSQL_TYPES)if(pattern.test(name))return logical;
  return null;
}
/**
 * PostgreSQL type names say exactly what a column holds; MySQL's do not (CHAR(36) could be an id or a code,
 * TINYINT(1) a flag or a small number), so where both sides are known the PostgreSQL side decides.
 */
export function resolveLogical(source:{provider:Provider;type:string}|null,target:{provider:Provider;type:string}|null):Logical|null{
  const sides=[source,target].filter(side=>side!==null);
  const authority=sides.find(side=>side.provider==='postgres')??sides[0];
  return authority?logicalOf(authority.type,authority.provider):null;
}

// ----- timestamps -----
const TIMESTAMP=/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?\s*(Z|z|[+-]\d{2}(?::?\d{2})?)?$/;
type Instant={epochMs:number;micros:string};

function readInstant(value:unknown,rule:ColumnRule):Instant{
  // A JS Date only ever carried milliseconds, so it cannot be told apart from a value that was already rounded by the
  // driver. Adapters should hand timestamps over as text (scripts/database-transfer.ts casts to ::text for this reason).
  if(value instanceof Date){
    if(Number.isNaN(value.getTime()))fail(rule,'the timestamp is an invalid Date.');
    return {epochMs:value.getTime(),micros:String(value.getUTCMilliseconds()).padStart(3,'0')+'000'};
  }
  if(typeof value!=='string')return fail(rule,`a timestamp must arrive as text or a Date, not ${typeof value}.`);
  const match=TIMESTAMP.exec(value.trim());
  if(!match)return fail(rule,`"${shortText(value)}" is not a timestamp this engine can read.`);
  const [,year,month,day,hour,minute,second='0',fraction='',zone]=match;
  if(fraction.length>6&&/[1-9]/.test(fraction.slice(6)))fail(rule,`"${shortText(value)}" carries finer than microsecond precision, which DATETIME(6) cannot store.`);
  let offsetMinutes=0;
  if(zone&&zone!=='Z'&&zone!=='z'){
    const sign=zone.startsWith('-')?-1:1,digits=zone.slice(1).replace(':','');
    offsetMinutes=sign*(Number(digits.slice(0,2))*60+Number(digits.slice(2)||0));
  }
  const epochMs=Date.UTC(Number(year),Number(month)-1,Number(day),Number(hour),Number(minute),Number(second))-offsetMinutes*60000;
  if(Number.isNaN(epochMs))fail(rule,`"${shortText(value)}" is not a real date.`);
  return {epochMs,micros:fraction.padEnd(6,'0').slice(0,6)};
}
const renderInstant=(instant:Instant,separator:string,suffix:string)=>`${new Date(instant.epochMs).toISOString().slice(0,19).replace('T',separator)}.${instant.micros}${suffix}`;
/** The one text form both providers and the checksums agree on. */
export const utcText=(value:unknown,column='timestamp')=>renderInstant(readInstant(value,{logical:'timestamptz',nullable:false,column}),'T','Z');

// ----- JSON -----
function jsonText(value:unknown,rule:ColumnRule):string{
  if(typeof value==='string'){
    try{JSON.parse(value);}catch{fail(rule,`the stored JSON text is not valid JSON: "${shortText(value)}".`);}
    return value;
  }
  const open=new Set<unknown>();
  const walk=(node:unknown):void=>{
    if(node===null)return;
    const kind=typeof node;
    if(kind==='string'||kind==='boolean')return;
    if(kind==='number'){if(!Number.isFinite(node))fail(rule,'JSON cannot hold NaN or Infinity.');return;}
    if(kind!=='object')fail(rule,`a value of type ${kind} cannot be stored as JSON without changing it.`);
    if(node instanceof Date)fail(rule,'a Date inside JSON would become an opaque string; convert it first.');
    if(ArrayBuffer.isView(node))fail(rule,'binary data cannot be stored as JSON.');
    if(open.has(node))fail(rule,'this JSON value refers to itself.');
    open.add(node);
    if(Array.isArray(node))for(const item of node){if(item===undefined)fail(rule,'an undefined array element would become null.');walk(item);}
    else for(const [key,item] of Object.entries(node as object)){if(item===undefined)fail(rule,`the key "${key}" holds undefined, which JSON would drop.`);walk(item);}
    open.delete(node);
  };
  walk(value);
  return JSON.stringify(value);
}
/** Deep key-sorted JSON, for comparison only. PostgreSQL jsonb and MySQL JSON each normalise storage their own way,
 *  so two faithful copies can hold different text; a checksum has to compare structure, not bytes. */
export function canonicalJson(value:unknown):string{
  const normalise=(node:unknown):unknown=>{
    if(node===null||typeof node!=='object')return node;
    if(Array.isArray(node))return node.map(normalise);
    return Object.fromEntries(Object.keys(node as object).sort().map(key=>[key,normalise((node as Record<string,unknown>)[key])]));
  };
  return JSON.stringify(normalise(typeof value==='string'?JSON.parse(value):value));
}

// ----- arrays -----
/** Parses the `{a,b,"c,d",NULL}` literal PostgreSQL prints when an array arrives as text rather than through a driver. */
export function parsePgArray(literal:string):(string|null)[]{
  if(!literal.startsWith('{')||!literal.endsWith('}'))throw new Error(`"${shortText(literal)}" is not a PostgreSQL array literal.`);
  const body=literal.slice(1,-1);
  if(!body.trim().length)return [];
  const items:(string|null)[]=[];
  let current='',quoted=false,wasQuoted=false;
  for(let index=0;index<body.length;index++){
    const character=body[index];
    if(quoted){
      if(character==='\\'){current+=body[++index]??'';continue;}
      if(character==='"'){quoted=false;continue;}
      current+=character;continue;
    }
    if(character==='"'){quoted=true;wasQuoted=true;continue;}
    if(character==='{')throw new Error('Nested arrays cannot be moved to a JSON array without changing their shape.');
    if(character===','){items.push(!wasQuoted&&current.trim()==='NULL'?null:wasQuoted?current:current.trim());current='';wasQuoted=false;continue;}
    current+=character;
  }
  if(quoted)throw new Error('The array literal ends inside a quoted element.');
  items.push(!wasQuoted&&current.trim()==='NULL'?null:wasQuoted?current:current.trim());
  return items;
}
function readArray(value:unknown,rule:ColumnRule):(string|null)[]{
  const items=Array.isArray(value)?value
    :typeof value==='string'?(value.trimStart().startsWith('[')?JSON.parse(value):parsePgArray(value))
    :fail(rule,`an array column cannot hold ${typeof value}.`);
  if(!Array.isArray(items))return fail(rule,'the stored value is not an array.');
  return items.map(item=>{
    if(item===null||item===undefined)return null;
    if(typeof item!=='string')return fail(rule,`array elements must be text; found ${typeof item}.`);
    return item;
  });
}

// ----- text -----
function checkText(value:string,rule:ColumnRule,target:Provider){
  for(let index=0;index<value.length;index++){
    const unit=value.charCodeAt(index);
    if(unit>=0xd800&&unit<=0xdbff){
      const next=value.charCodeAt(index+1);
      if(!(next>=0xdc00&&next<=0xdfff))fail(rule,'the text holds an unpaired surrogate, which utf8mb4 cannot store.');
      index++;
    }else if(unit>=0xdc00&&unit<=0xdfff)fail(rule,'the text holds an unpaired surrogate, which utf8mb4 cannot store.');
    else if(unit===0&&target==='postgres')fail(rule,'the text holds a NUL character, which PostgreSQL text cannot store.');
  }
  return value;
}

// ----- numbers -----
const DECIMAL=/^-?\d+(\.\d+)?$/;
function digits(value:unknown,rule:ColumnRule):string{
  if(typeof value==='bigint')return value.toString();
  if(typeof value==='number'){
    if(!Number.isFinite(value))fail(rule,'the number is NaN or Infinity.');
    if(!Number.isSafeInteger(value)&&Number.isInteger(value))fail(rule,`${value} is past the range a JS number represents exactly; the adapter must return large integers as text.`);
    return String(value);
  }
  if(typeof value!=='string')return fail(rule,`a number column cannot hold ${typeof value}.`);
  const text=value.trim();
  if(!DECIMAL.test(text))fail(rule,`"${shortText(value)}" is not a plain decimal number; exponent notation and NaN are refused rather than rounded.`);
  return text;
}

// ----- the conversion itself -----
export function convertValue(value:unknown,rule:ColumnRule,target:Provider):unknown{
  if(value===null||value===undefined){
    if(!rule.nullable)fail(rule,'the source holds NULL but the target column is NOT NULL. An empty string is not a substitute.');
    return null;
  }
  switch(rule.logical){
    case 'uuid':{
      if(typeof value!=='string')fail(rule,`an id must arrive as CHAR(36) text, not ${ArrayBuffer.isView(value)?'binary':typeof value}; BINARY(16) ids are not supported because the text form is what the application uses.`);
      const text=(value as string).trim();
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text))fail(rule,`"${shortText(value)}" is not an id.`);
      return text.toLowerCase();
    }
    case 'text':{
      if(ArrayBuffer.isView(value)){
        // A binary collation makes mysql2 hand text back as a Buffer; decoding is only safe if it round-trips.
        const decoded=Buffer.from(value as Uint8Array).toString('utf8');
        if(Buffer.compare(Buffer.from(decoded,'utf8'),Buffer.from(value as Uint8Array))!==0)fail(rule,'the stored bytes are not valid UTF-8 text.');
        return checkText(decoded,rule,target);
      }
      if(typeof value!=='string')fail(rule,`a text column cannot hold ${typeof value}; nothing is stringified implicitly.`);
      return checkText(value as string,rule,target);
    }
    case 'timestamptz':{
      const instant=readInstant(value,rule);
      return target==='mysql'?renderInstant(instant,' ',''):renderInstant(instant,'T','Z');
    }
    case 'boolean':{
      const truth=readBoolean(value,rule);
      return target==='mysql'?(truth?1:0):truth;
    }
    case 'json':return jsonText(value,rule);
    case 'text[]':{
      const items=readArray(value,rule);
      items.forEach(item=>{if(item!==null)checkText(item,rule,target);});
      return target==='mysql'?JSON.stringify(items):items;
    }
    case 'integer':{
      const text=digits(value,rule);
      const number=Number(text);
      if(!Number.isInteger(number))fail(rule,`${text} is not a whole number.`);
      if(number<-2147483648||number>2147483647)fail(rule,`${text} does not fit in a 32-bit integer column.`);
      return number;
    }
    case 'bigint':return digits(value,rule);
    case 'numeric':{
      const text=digits(value,rule);
      const [whole,fraction='']=text.replace('-','').split('.');
      if(whole.replace(/^0+/,'').length+fraction.length>65)fail(rule,`${text} has more digits than DECIMAL(65,30) can hold.`);
      if(fraction.length>30)fail(rule,`${text} has more than 30 decimal places, which DECIMAL(65,30) would round.`);
      return text;
    }
    case 'float':{
      const number=typeof value==='number'?value:Number(digits(value,rule));
      if(!Number.isFinite(number))fail(rule,'the number is NaN or Infinity, which neither column type can store.');
      return number;
    }
    case 'bytes':{
      if(ArrayBuffer.isView(value))return Buffer.from((value as Uint8Array).buffer,(value as Uint8Array).byteOffset,(value as Uint8Array).byteLength);
      if(typeof value==='string'){
        const text=value as string;
        if(!/^\\x[0-9a-f]*$/i.test(text))fail(rule,'binary data arrived as text that is not PostgreSQL hex form; it is refused rather than stored as its own characters.');
        return Buffer.from(text.slice(2),'hex');
      }
      return fail(rule,`a binary column cannot hold ${typeof value}.`);
    }
  }
}

function readBoolean(value:unknown,rule:ColumnRule):boolean{
  if(typeof value==='boolean')return value;
  if(typeof value==='number'){if(value!==0&&value!==1)fail(rule,`${value} is not a flag; TINYINT(1) holds other numbers but this column is a boolean.`);return value===1;}
  if(ArrayBuffer.isView(value)){
    const bytes=Buffer.from(value as Uint8Array);
    if(bytes.length!==1||(bytes[0]!==0&&bytes[0]!==1))fail(rule,'the stored BIT value is not a single 0 or 1.');
    return bytes[0]===1;
  }
  if(typeof value==='string'){
    const text=value.trim().toLowerCase();
    if(['1','t','true','yes','y'].includes(text))return true;
    if(['0','f','false','no','n'].includes(text))return false;
  }
  return fail(rule,`"${shortText(value)}" is not a boolean.`);
}

export function convertRow(row:Row,rules:Record<string,ColumnRule>,target:Provider):Row{
  const converted:Row={};
  for(const [column,rule] of Object.entries(rules))converted[column]=convertValue(row[column],{...rule,column:rule.column??column},target);
  return converted;
}

/**
 * One value as a provider-independent string, for checksums. NULL gets a sentinel no text value can produce, because a
 * checksum that cannot tell NULL from '' would pass the exact migration bug this engine exists to catch.
 */
export function canonicalCell(value:unknown,logical:Logical):string{
  if(value===null||value===undefined)return '\u0000NULL';
  const rule:ColumnRule={logical,nullable:false};
  switch(logical){
    case 'timestamptz':return renderInstant(readInstant(value,rule),'T','Z');
    case 'json':return canonicalJson(value);
    case 'text[]':return JSON.stringify(readArray(value,rule));
    case 'boolean':return readBoolean(value,rule)?'1':'0';
    case 'bytes':return Buffer.isBuffer(value)||ArrayBuffer.isView(value)?Buffer.from(value as Uint8Array).toString('hex'):String(convertValue(value,rule,'postgres'));
    case 'numeric':{
      const text=digits(value,rule);
      // 1.10 and 1.1 are the same number stored with different scales on the two servers.
      return text.includes('.')?text.replace(/0+$/,'').replace(/\.$/,''):text;
    }
    case 'float':return String(convertValue(value,rule,'postgres'));
    case 'uuid':return String(convertValue(value,rule,'postgres'));
    default:return typeof value==='string'?value:String(value);
  }
}
