// PostgreSQL -> MySQL/MariaDB statement translation.
//
// This is NOT a general SQL translator. The application funnels every statement through one choke point (`sql()` in
// lib/db.ts), so the set of PostgreSQL constructs that can ever arrive here is closed and known: the inventory in
// tests/mysql-dialect.spec.ts is lifted verbatim from lib/admin/*, lib/auth.ts, lib/api-auth.ts and lib/projects.ts.
// Everything outside that set throws `UnsupportedSql` — a translation that runs but means something else is far worse
// than a loud failure, so nothing is ever guessed at or silently dropped.
//
// Two connection settings are assumed and set by lib/database/mysql.ts on every pooled connection:
//   PIPES_AS_CONCAT  — `'u'||x` is string concatenation here, not boolean OR. Same NULL propagation as PostgreSQL.
//   ANSI_QUOTES      — belt and braces; double-quoted identifiers are rewritten to backticks anyway.

export class UnsupportedSql extends Error {
  constructor(construct:string,statement:string) {
    super(`${construct} cannot be translated to MySQL. Statement: ${statement.replace(/\s+/g,' ').trim().slice(0,400)}`);
    this.name='UnsupportedSql';
  }
}

export type Statement={sql:string;values:unknown[]};
/** `pre` runs before `sql`, `post` after it; whichever is present supplies the rows a RETURNING clause would have. */
export type Translated=Statement&{pre?:Statement;post?:Statement};

// ----- Lexical masking -------------------------------------------------------------------------------------------
// Every pass below is a scanner or regex over the statement text, so string literals, comments and quoted identifiers
// are lifted out first and replaced by \x01<index>\x01 sentinels. A sentinel is [\w] shaped on purpose: it survives
// the identifier scans unharmed. Passes that need the literal's text (interval, date_trunc, ->>) look it up by index.
type Masked={text:string;frags:string[]};
const sentinel=(index:number)=>`\x01${index}\x01`;
const SENT=/\x01(\d+)\x01/;
const push=(m:Masked,text:string)=>sentinel(m.frags.push(text)-1);
/** The raw source of a sentinel, or '' when `token` is not one. */
const fragOf=(m:Masked,token:string)=>{const hit=SENT.exec(token.trim());return hit&&hit[0]===token.trim()?m.frags[Number(hit[1])]:'';};
/** The text inside a masked single-quoted literal, with '' unescaped. */
function literalOf(m:Masked,token:string,construct:string,sql:string) {
  const raw=fragOf(m,token);
  if(!raw.startsWith("'"))throw new UnsupportedSql(`${construct} needs a literal argument`,sql);
  return raw.slice(1,-1).replace(/''/g,"'");
}
const quote=(text:string)=>`'${text.replace(/'/g,"''")}'`;

function mask(sql:string):Masked {
  const m:Masked={text:'',frags:[]};
  for(let i=0;i<sql.length;) {
    const c=sql[i];
    if(c==='$'&&sql[i+1]==='$')throw new UnsupportedSql('A dollar-quoted body ($$…$$)',sql);
    if(c==="'") {
      let j=i+1;
      while(j<sql.length){if(sql[j]!=="'")j++;else if(sql[j+1]==="'")j+=2;else{j++;break;}}
      m.text+=push(m,sql.slice(i,j));i=j;continue;
    }
    // A PostgreSQL "quoted identifier" becomes a MySQL `quoted identifier`; nothing in this codebase uses "" as a string.
    if(c==='"'){let j=i+1;while(j<sql.length&&sql[j]!=='"')j++;m.text+=push(m,`\`${sql.slice(i+1,j).replace(/`/g,'')}\``);i=j+1;continue;}
    if(c==='`'){let j=i+1;while(j<sql.length&&sql[j]!=='`')j++;m.text+=push(m,sql.slice(i,j+1));i=j+1;continue;}
    if(c==='-'&&sql[i+1]==='-'){let j=sql.indexOf('\n',i);if(j<0)j=sql.length;m.text+=push(m,sql.slice(i,j));i=j;continue;}
    if(c==='/'&&sql[i+1]==='*'){const j=sql.indexOf('*/',i);const end=j<0?sql.length:j+2;m.text+=push(m,sql.slice(i,end));i=end;continue;}
    m.text+=c;i++;
  }
  return m;
}
const unmask=(m:Masked,text=m.text)=>text.replace(/\x01(\d+)\x01/g,(_,index)=>m.frags[Number(index)]);

// ----- Expression helpers ----------------------------------------------------------------------------------------
function matchParen(text:string,open:number,sql:string) {
  let depth=0;
  for(let i=open;i<text.length;i++){const c=text[i];if(c==='(')depth++;else if(c===')'&&!--depth)return i;}
  throw new UnsupportedSql('An unbalanced parenthesis',sql);
}
function splitTop(text:string,separator:string) {
  const parts:string[]=[];let depth=0,start=0;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='(')depth++;else if(c===')')depth--;
    else if(!depth&&c===separator){parts.push(text.slice(start,i));start=i+1;}
  }
  parts.push(text.slice(start));
  return parts.map(part=>part.trim());
}
const splitArgs=(inner:string)=>splitTop(inner,',');
// `$` (placeholders), `:` (:: casts) and \x01 (sentinels) are part of an operand for the purposes of scanning back.
const WORD=/[\w$.:\x01]/;
/** Where the operand that ends at `end` begins — an identifier, a placeholder, a cast chain or a (possibly named) call. */
function operandStart(text:string,end:number,sql:string) {
  let i=end;
  while(i>0&&/\s/.test(text[i-1]))i--;
  if(i>0&&text[i-1]===')') {
    let depth=0,j=i-1;
    for(;j>=0;j--){const c=text[j];if(c===')')depth++;else if(c==='('&&!--depth)break;}
    if(j<0)throw new UnsupportedSql('An unbalanced parenthesis',sql);
    let k=j;while(k>0&&WORD.test(text[k-1]))k--;
    return k;
  }
  let j=i;while(j>0&&WORD.test(text[j-1]))j--;
  if(j===i)throw new UnsupportedSql('An operand that cannot be located',sql);
  return j;
}
/** Rewrites every `name(args)` call, innermost result first. `build` receives the split arguments. */
function rewriteCalls(m:Masked,name:string,sql:string,build:(args:string[])=>string) {
  const re=new RegExp(`\\b${name}\\s*\\(`,'i');
  for(let guard=0;guard<500;guard++) {
    const hit=re.exec(m.text);
    if(!hit)return;
    const open=hit.index+hit[0].length-1,close=matchParen(m.text,open,sql);
    m.text=m.text.slice(0,hit.index)+build(splitArgs(m.text.slice(open+1,close)))+m.text.slice(close+1);
  }
  throw new UnsupportedSql(`Too many ${name}() calls`,sql);
}

// ----- Pass 1: identifiers that are MySQL keywords ----------------------------------------------------------------
// Only the ones this schema actually uses as column names. Qualified uses (`t`.`key`) need no quoting in MySQL, and a
// word followed by `(` is a function call (count(*)), so both are skipped.
const RESERVED=/(?<![.\w`\x01])\b(key|read|count|rows|status)\b(?!\s*\()/gi;
const quoteReserved=(m:Masked)=>{m.text=m.text.replace(RESERVED,word=>push(m,`\`${word.toLowerCase()}\``));};

// ----- Pass 2: =ANY($n::type[]) ------------------------------------------------------------------------------------
// MySQL has no array type. The bound array is expanded into one placeholder per element, marked \x02n:i\x02 so the
// binding pass at the end can push the elements in the order they appear. An empty array becomes IN (NULL): never true,
// which is what PostgreSQL's `x = ANY('{}')` also yields.
function expandArrays(m:Masked,values:unknown[],sql:string) {
  m.text=m.text.replace(/=\s*ANY\s*\(\s*\$(\d+)\s*(?:::\s*\w+\s*\[\s*\])?\s*\)/gi,(_,index:string)=>{
    const value=values[Number(index)-1];
    if(!Array.isArray(value))throw new UnsupportedSql(`=ANY($${index}) whose bound value is not an array`,sql);
    return value.length?` IN (${value.map((__,i)=>`\x02${index}:${i}\x02`).join(',')})`:' IN (NULL)';
  });
}

// ----- Pass 3: intervals -------------------------------------------------------------------------------------------
const UNITS:Record<string,string>={second:'SECOND',seconds:'SECOND',minute:'MINUTE',minutes:'MINUTE',hour:'HOUR',hours:'HOUR',
  day:'DAY',days:'DAY',week:'WEEK',weeks:'WEEK',month:'MONTH',months:'MONTH',year:'YEAR',years:'YEAR'};
function intervalParts(m:Masked,token:string,sql:string) {
  const text=literalOf(m,token,'interval',sql).trim();
  const hit=/^(\d+)\s+([a-z]+)$/i.exec(text);
  const unit=hit&&UNITS[hit[2].toLowerCase()];
  if(!hit||!unit)throw new UnsupportedSql(`interval '${text}'`,sql);
  return {count:Number(hit[1]),unit};
}
function rewriteIntervals(m:Masked,sql:string) {
  // `<expr> * interval '1 unit'` — PostgreSQL scales an interval; MySQL spells the same thing INTERVAL <expr> UNIT.
  for(let guard=0;guard<100;guard++) {
    const hit=/\*\s*interval\s+(\x01\d+\x01)/i.exec(m.text);
    if(!hit)break;
    const {count,unit}=intervalParts(m,hit[1],sql);
    if(count!==1)throw new UnsupportedSql(`A scaled interval of ${count} ${unit}`,sql);
    const start=operandStart(m.text,hit.index,sql);
    m.text=`${m.text.slice(0,start)}INTERVAL (${m.text.slice(start,hit.index).trim()}) ${unit}${m.text.slice(hit.index+hit[0].length)}`;
  }
  m.text=m.text.replace(/\binterval\s+(\x01\d+\x01)/gi,(_,token:string)=>{
    const {count,unit}=intervalParts(m,token,sql);
    return `INTERVAL ${count} ${unit}`;
  });
}

// ----- Pass 4: AT TIME ZONE ----------------------------------------------------------------------------------------
// PostgreSQL's `AT TIME ZONE` changes direction with the operand's type: a timestamptz becomes local wall time, a bare
// timestamp is read AS local wall time and becomes an instant. MySQL's CONVERT_TZ is explicit about both ends, so the
// operand has to be classified. Rather than guess, the classification is a closed rule set and anything it does not
// recognise throws. Storage convention: every DATETIME(6) column holds UTC (see ./ddl.ts).
const UTC_COLUMNS=new Set(['created_at','updated_at','expires_at','started_at','ended_at','last_seen_at','first_seen_at','bucket']);
/** Derived names that already hold *local* wall time: the CTE columns of lib/admin/metrics.ts and lib/admin/query.ts. */
const LOCAL_NAMES=new Set(['midnight','g','week','local_start','local_end','local_hour','starts_local']);
const UTC_ZONE=/^'(?:utc|\+00:00)'$/i;

function zoneOf(m:Masked,expr:string,sql:string):'utc'|'local' {
  let text=expr.trim();
  while(text.startsWith('(')&&matchParen(text,0,sql)===text.length-1)text=text.slice(1,-1).trim();
  if(/^CASE\b/i.test(text)) {
    const hit=/\bTHEN\b/i.exec(text);
    if(!hit)throw new UnsupportedSql(`AT TIME ZONE over ${expr.trim()}`,sql);
    const rest=text.slice(hit.index+hit[0].length);
    const stop=/\b(WHEN|ELSE|END)\b/i.exec(rest);
    return zoneOf(m,stop?rest.slice(0,stop.index):rest,sql);
  }
  const additive=splitTop(text,'-').length>1?splitTop(text,'-')[0]:splitTop(text,'+')[0];
  if(additive.trim()&&additive.trim()!==text)return zoneOf(m,additive,sql);
  const cast=/::\s*(\w+)\s*$/.exec(text);
  if(cast)return cast[1].toLowerCase()==='timestamptz'?'utc':cast[1].toLowerCase()==='timestamp'?'local':zoneOf(m,text.slice(0,cast.index),sql);
  const call=/^([A-Za-z_]\w*)\s*\(/.exec(text);
  if(call) {
    const name=call[1].toLowerCase();
    const args=splitArgs(text.slice(call[0].length-1+1,matchParen(text,call[0].length-1,sql)));
    if(name==='now'||name==='current_timestamp'||name==='utc_timestamp')return 'utc';
    // CONVERT_TZ(x,from,to): the result is in `to`, so a UTC target means the value is an instant again.
    if(name==='convert_tz')return UTC_ZONE.test(unmask(m,args[2]||''))?'utc':'local';
    if(name==='date_trunc'||name==='date'||name==='date_add'||name==='date_sub')return zoneOf(m,args[1]??args[0],sql);
    if(name==='cast'){const as=/\bAS\s+(\w+)/i.exec(args[0]||'');return as&&/^datetime$/i.test(as[1])?'local':zoneOf(m,args[0],sql);}
    if(name==='coalesce'||name==='least'||name==='greatest'||name==='min'||name==='max')return zoneOf(m,args[0],sql);
    throw new UnsupportedSql(`AT TIME ZONE over ${name}()`,sql);
  }
  if(/^now\s*\(\s*\)$/i.test(text))return 'utc';
  const name=text.replace(/^.*\./,'').replace(/`/g,'').toLowerCase();
  const plain=fragOf(m,text)?unmask(m,text).replace(/^.*\./,'').replace(/`/g,'').toLowerCase():name;
  if(UTC_COLUMNS.has(plain))return 'utc';
  if(LOCAL_NAMES.has(plain))return 'local';
  throw new UnsupportedSql(`AT TIME ZONE over the unclassified expression "${unmask(m,expr.trim())}" (add it to UTC_COLUMNS or LOCAL_NAMES in lib/database/dialect/mysql.ts)`,sql);
}
function rewriteTimeZones(m:Masked,sql:string) {
  for(let guard=0;guard<100;guard++) {
    const hit=/\bAT\s+TIME\s+ZONE\s+/i.exec(m.text);
    if(!hit)break;
    const start=operandStart(m.text,hit.index,sql);
    const value=m.text.slice(start,hit.index).trim();
    const after=m.text.slice(hit.index+hit[0].length);
    const zone=/^(\$\d+|\x01\d+\x01|[A-Za-z_][\w.]*)((?:\s*::\s*\w+)*)/.exec(after);
    if(!zone)throw new UnsupportedSql('AT TIME ZONE without a recognisable zone',sql);
    const direction=zoneOf(m,value,sql);
    const converted=direction==='utc'?`CONVERT_TZ(${value},'+00:00',${zone[1]})`:`CONVERT_TZ(${value},${zone[1]},'+00:00')`;
    m.text=m.text.slice(0,start)+converted+after.slice(zone[0].length);
  }
}

// ----- Pass 5: date_trunc / to_char --------------------------------------------------------------------------------
// The analytics bucket by *local* day, so date_trunc is always applied to an already-converted local value; these
// expressions only have to reproduce the same truncation. WEEKDAY() is 0 on Monday, matching date_trunc('week',…).
function truncate(unit:string,value:string,sql:string) {
  switch(unit) {
    case 'minute':return `CAST(DATE_FORMAT(${value},'%Y-%m-%d %H:%i:00') AS DATETIME)`;
    case 'hour':return `CAST(DATE_FORMAT(${value},'%Y-%m-%d %H:00:00') AS DATETIME)`;
    case 'day':return `CAST(DATE(${value}) AS DATETIME)`;
    case 'week':return `CAST(DATE_SUB(DATE(${value}),INTERVAL WEEKDAY(${value}) DAY) AS DATETIME)`;
    case 'month':return `CAST(DATE_FORMAT(${value},'%Y-%m-01') AS DATETIME)`;
    case 'year':return `CAST(DATE_FORMAT(${value},'%Y-01-01') AS DATETIME)`;
    default:throw new UnsupportedSql(`date_trunc('${unit}',…)`,sql);
  }
}
const TO_CHAR:Record<string,string>={YYYY:'%Y',MM:'%m',DD:'%d',HH24:'%H',MI:'%i',SS:'%s'};
function dateFormat(pattern:string,sql:string) {
  let out='';
  for(let i=0;i<pattern.length;) {
    if(pattern[i]==='"'){const j=pattern.indexOf('"',i+1);if(j<0)throw new UnsupportedSql(`to_char format "${pattern}"`,sql);out+=pattern.slice(i+1,j);i=j+1;continue;}
    const token=Object.keys(TO_CHAR).find(key=>pattern.startsWith(key,i));
    if(token){out+=TO_CHAR[token];i+=token.length;continue;}
    if('-:/. T'.includes(pattern[i])){out+=pattern[i];i++;continue;}
    throw new UnsupportedSql(`to_char format "${pattern}" (at "${pattern.slice(i,i+4)}")`,sql);
  }
  return out;
}

// ----- Pass 6: FILTER (WHERE …) ------------------------------------------------------------------------------------
// MySQL has no FILTER. Every aggregate here is rewritten as the aggregate over a CASE that yields NULL for rows the
// filter excludes — count/sum/avg/min/max all ignore NULL, so the result is identical. Aggregates where NULL is *not*
// the neutral value (json_object_agg: a NULL key raises) are rejected rather than approximated.
const FILTERABLE=new Set(['count','sum','avg','min','max','bool_or','bool_and']);
function rewriteFilters(m:Masked,sql:string) {
  for(let guard=0;guard<200;guard++) {
    const hit=/\bFILTER\s*\(\s*WHERE\b/i.exec(m.text);
    if(!hit)break;
    const close=matchParen(m.text,m.text.indexOf('(',hit.index),sql);
    const condition=m.text.slice(m.text.indexOf('(',hit.index)+1,close).replace(/^\s*WHERE\b/i,'').trim();
    const callEnd=operandStart(m.text,hit.index,sql);
    const call=m.text.slice(callEnd,hit.index).trim();
    const open=call.indexOf('(');
    const name=call.slice(0,open).trim().toLowerCase();
    if(!FILTERABLE.has(name))throw new UnsupportedSql(`FILTER (WHERE …) over ${name||'an unnamed expression'}()`,sql);
    const inner=call.slice(open+1,call.length-1).trim();
    const distinct=/^DISTINCT\b/i.exec(inner);
    const argument=distinct?inner.slice(distinct[0].length).trim():inner;
    const body=argument==='*'?'1':argument;
    const rebuilt=`${name}(${distinct?'DISTINCT ':''}CASE WHEN ${condition} THEN ${body} END)`;
    m.text=m.text.slice(0,callEnd)+rebuilt+m.text.slice(close+1);
  }
}

// ----- Pass 7: JSON ------------------------------------------------------------------------------------------------
// jsonb becomes MySQL JSON. The explicit function calls are used rather than MySQL's `->`/`->>` operators because
// MariaDB does not implement the operator forms.
function rewriteJson(m:Masked,sql:string) {
  for(let guard=0;guard<200;guard++) {
    const hit=/(->>?)\s*(\x01\d+\x01)/.exec(m.text);
    if(!hit)break;
    const key=literalOf(m,hit[2],'a JSON key',sql);
    const start=operandStart(m.text,hit.index,sql);
    const target=m.text.slice(start,hit.index).trim();
    const path=push(m,quote(`$.${key}`));
    const extract=`JSON_EXTRACT(${target},${path})`;
    m.text=m.text.slice(0,start)+(hit[1]==='->>'?`JSON_UNQUOTE(${extract})`:extract)+m.text.slice(hit.index+hit[0].length);
  }
  // JSON_TYPE reports ARRAY/OBJECT/STRING in upper case where jsonb_typeof reports lower case.
  rewriteCalls(m,'jsonb_typeof',sql,args=>`LOWER(JSON_TYPE(${args[0]}))`);
  rewriteCalls(m,'json_object_agg',sql,args=>`JSON_OBJECTAGG(${args[0]},${args[1]})`);
  rewriteCalls(m,'jsonb_object_agg',sql,args=>`JSON_OBJECTAGG(${args[0]},${args[1]})`);
  rewriteArrayElements(m,sql);
}
/**
 * `FROM t, jsonb_array_elements_text(x) AS tag` -> `FROM t, JSON_TABLE(x,'$[*]' COLUMNS(value … PATH '$')) AS tag`.
 * PostgreSQL lets the alias itself be read as the scalar; MySQL exposes a column, so bare references to the alias are
 * qualified. The alias must therefore not collide with a column name in the same query, which is checked here.
 */
function rewriteArrayElements(m:Masked,sql:string) {
  for(let guard=0;guard<20;guard++) {
    const hit=/\bjsonb?_array_elements_text\s*\(/i.exec(m.text);
    if(!hit)break;
    const open=hit.index+hit[0].length-1,close=matchParen(m.text,open,sql);
    const inner=m.text.slice(open+1,close);
    const alias=/^\s+(?:AS\s+)?([A-Za-z_]\w*)/i.exec(m.text.slice(close+1));
    if(!alias)throw new UnsupportedSql('jsonb_array_elements_text() without an alias',sql);
    const name=alias[1];
    const replacement=`JSON_TABLE(${inner},'$[*]' COLUMNS(value VARCHAR(1024) PATH '$')) AS ${name}`;
    const before=m.text.slice(0,hit.index),after=m.text.slice(close+1+alias[0].length);
    const qualify=(part:string)=>part.replace(new RegExp(`(?<![.\\w\`])\\b${name}\\b(?!\\s*[.(])`,'g'),`${name}.value`);
    m.text=qualify(before)+replacement+qualify(after);
  }
}

// ----- Pass 8: EXTRACT(EPOCH FROM …) -------------------------------------------------------------------------------
function rewriteEpoch(m:Masked,sql:string) {
  for(let guard=0;guard<50;guard++) {
    const hit=/\bEXTRACT\s*\(\s*EPOCH\s+FROM\b/i.exec(m.text);
    if(!hit)break;
    const open=m.text.indexOf('(',hit.index),close=matchParen(m.text,open,sql);
    const body=m.text.slice(hit.index+hit[0].length,close).trim();
    const parts=splitTop(body,'-').filter(part=>part!=='');
    // Two timestamps: the seconds between them, at microsecond resolution. One timestamp: seconds since the epoch.
    const seconds=parts.length===2?`(TIMESTAMPDIFF(MICROSECOND,${parts[1]},${parts[0]})/1000000)`
      :parts.length===1?`UNIX_TIMESTAMP(${parts[0]})`
      :(()=>{throw new UnsupportedSql(`EXTRACT(EPOCH FROM ${unmask(m,body)})`,sql);})();
    m.text=m.text.slice(0,hit.index)+seconds+m.text.slice(close+1);
  }
}

// ----- Pass 9: casts ---------------------------------------------------------------------------------------------
// Numeric-width casts are dropped: they exist so node-postgres hands back a JS number instead of a string, and mysql2
// already does that. Dropping them cannot change a comparison's meaning, whereas CAST(x AS DOUBLE) needs MySQL 8.0.17.
const CASTS:Record<string,string|null>={int:'SIGNED',int4:'SIGNED',int8:'SIGNED',integer:'SIGNED',bigint:'SIGNED',smallint:'SIGNED',
  text:'CHAR',varchar:'CHAR',char:'CHAR',uuid:null,float:null,float4:null,float8:null,numeric:null,decimal:null,real:null,
  timestamptz:'DATETIME',timestamp:'DATETIME',date:'DATE',json:'JSON',jsonb:'JSON',boolean:'SIGNED',bool:'SIGNED'};
function rewriteCasts(m:Masked,sql:string) {
  for(let guard=0;guard<400;guard++) {
    const hit=/::\s*([A-Za-z_]\w*)/.exec(m.text);
    if(!hit)break;
    const type=hit[1].toLowerCase();
    if(!(type in CASTS))throw new UnsupportedSql(`The cast ::${hit[1]}`,sql);
    const target=CASTS[type];
    const start=operandStart(m.text,hit.index,sql);
    const value=m.text.slice(start,hit.index).trim();
    m.text=m.text.slice(0,start)+(target?`CAST(${value} AS ${target})`:value)+m.text.slice(hit.index+hit[0].length);
  }
}

// ----- Pass 10: generate_series -> recursive CTE -------------------------------------------------------------------
// Hoisted to the statement's WITH clause rather than inlined, because MySQL only allows WITH at the head of a query
// block. The generated column is named after the alias so that unqualified references to it still resolve.
// MySQL's cte_max_recursion_depth defaults to 1000; the widest range this application allows is 366 daily buckets.
function rewriteSeries(m:Masked,sql:string) {
  const ctes:string[]=[];
  for(let guard=0;guard<20;guard++) {
    const hit=/\bgenerate_series\s*\(/i.exec(m.text);
    if(!hit)break;
    const open=hit.index+hit[0].length-1,close=matchParen(m.text,open,sql);
    const args=splitArgs(m.text.slice(open+1,close));
    const step=/^INTERVAL\s+(\d+)\s+(\w+)$/i.exec(args[2]||'');
    if(args.length!==3||!step)throw new UnsupportedSql('generate_series() without a literal interval step',sql);
    const before=m.text.slice(0,hit.index),after=m.text.slice(close+1);
    const inFrom=/\bFROM\s+$/i.test(before),inSelect=/\bSELECT\s+$/i.test(before);
    const alias=/^\s+(?:AS\s+)?([A-Za-z_]\w*)/i.exec(after);
    if((!inFrom&&!inSelect)||!alias)throw new UnsupportedSql('generate_series() outside `FROM generate_series(…) alias` or `SELECT generate_series(…) AS alias`',sql);
    const name=`__gs${ctes.length}`,column=alias[1],bump=`INTERVAL ${step[1]} ${step[2].toUpperCase()}`;
    ctes.push(`${name} AS (SELECT CAST(${args[0]} AS DATETIME(6)) AS ${column} UNION ALL SELECT ${column}+${bump} FROM ${name} WHERE ${column}+${bump}<=${args[1]})`);
    m.text=before.replace(/\bSELECT\s+$/i,'SELECT ')+(inFrom?`${name} ${column}`:`${column} FROM ${name}`)+after.slice(alias[0].length);
  }
  if(!ctes.length)return;
  const head=/^(\s*(?:\x01\d+\x01\s*)*)WITH\s+(RECURSIVE\s+)?/i.exec(m.text);
  m.text=head?`${head[1]}WITH RECURSIVE ${ctes.join(',')},${m.text.slice(head[0].length)}`:`WITH RECURSIVE ${ctes.join(',')} ${m.text}`;
}

// ----- Pass 11: ON CONFLICT and RETURNING --------------------------------------------------------------------------
const TABLE=String.raw`(?:\x01\d+\x01|[\w$]+)(?:\s*\.\s*(?:\x01\d+\x01|[\w$]+))*`;
/**
 * MySQL cannot return rows from a write. This application generates every id in JS with randomUUID, so no RETURNING
 * here exists to discover a generated key — each one re-reads columns the statement did not change. That is replayed
 * as a companion SELECT: before the statement for DELETE/UPDATE (the rows are about to go), after it for an upsert
 * (the merged counter is what the caller wants). Both callers already run inside transaction(), which is what makes
 * the pair atomic; a RETURNING outside a transaction would be rejected here rather than raced.
 */
function rewriteWrites(m:Masked,sql:string):{pre?:string;post?:string} {
  let conflictKey='',doNothing=false;
  // DO NOTHING is INSERT IGNORE. Note the widened blast radius: IGNORE also downgrades other errors to warnings.
  m.text=m.text.replace(/\bON\s+CONFLICT\s*(?:\([^)]*\))?\s*DO\s+NOTHING/i,()=>{
    if(!/^\s*INSERT\s+INTO\b/i.test(m.text))throw new UnsupportedSql('ON CONFLICT DO NOTHING outside an INSERT',sql);
    doNothing=true;
    return '';
  });
  if(!doNothing&&/\bON\s+CONFLICT\s*\(/i.test(m.text)===false&&/\bON\s+CONFLICT\b/i.test(m.text))
    throw new UnsupportedSql('ON CONFLICT without a conflict target',sql);
  if(doNothing)m.text=m.text.replace(/^(\s*)INSERT\s+INTO\b/i,(_,space:string)=>`${space}INSERT IGNORE INTO`);
  m.text=m.text.replace(/\bON\s+CONFLICT\s*\(([^)]*)\)\s*DO\s+UPDATE\s+SET\b/i,(_,columns:string)=>{
    conflictKey=splitArgs(columns)[0];
    return 'ON DUPLICATE KEY UPDATE';
  });
  m.text=m.text.replace(/\bEXCLUDED\s*\.\s*(\x01\d+\x01|\w+)/gi,(_,column:string)=>`VALUES(${column})`);
  const returning=/\bRETURNING\s+([\s\S]+)$/i.exec(m.text);
  if(!returning)return {};
  const columns=returning[1].trim();
  m.text=m.text.slice(0,returning.index).trimEnd();
  if(/^\s*DELETE\s+FROM\s+/i.test(m.text)) {
    const hit=new RegExp(String.raw`^\s*DELETE\s+FROM\s+(${TABLE})([\s\S]*)$`,'i').exec(m.text);
    if(!hit)throw new UnsupportedSql('DELETE … RETURNING with an unexpected shape',sql);
    return {pre:`SELECT ${columns} FROM ${hit[1]}${hit[2]}`};
  }
  if(/^\s*UPDATE\s+/i.test(m.text)) {
    const hit=new RegExp(String.raw`^\s*UPDATE\s+(${TABLE})\s+SET\s+([\s\S]*?)(\sWHERE\b[\s\S]*)$`,'i').exec(m.text);
    if(!hit)throw new UnsupportedSql('UPDATE … RETURNING without a WHERE clause',sql);
    const assigned=new Set(splitArgs(hit[2]).map(part=>part.split('=')[0].trim().toLowerCase()));
    for(const column of splitArgs(columns))
      if(assigned.has(column.toLowerCase()))throw new UnsupportedSql(`UPDATE … RETURNING ${column}, a column the statement also assigns`,sql);
    return {pre:`SELECT ${columns} FROM ${hit[1]}${hit[3]}`};
  }
  const insert=new RegExp(String.raw`^\s*INSERT\s+(?:IGNORE\s+)?INTO\s+(${TABLE})\s*\(([^)]*)\)\s*VALUES\s*\(`,'i').exec(m.text);
  if(!insert||!conflictKey)throw new UnsupportedSql('INSERT … RETURNING without ON CONFLICT (…) DO UPDATE',sql);
  const open=m.text.indexOf('(',insert.index+insert[0].length-1);
  const tuple=splitArgs(m.text.slice(open+1,matchParen(m.text,open,sql)));
  // Comparing the raw tokens would fail whenever the conflict column is a reserved word (r.rate_limits.key, for one):
  // quoteReserved() pushes a FRESH sentinel for every occurrence it masks, so two mentions of the same word — once in
  // the column list, once in ON CONFLICT(...) — end up as different sentinel numbers even though they read identically.
  const wanted=unmask(m,conflictKey);
  const position=splitArgs(insert[2]).findIndex(column=>unmask(m,column)===wanted);
  if(position<0||position>=tuple.length)throw new UnsupportedSql(`INSERT … RETURNING whose conflict key ${unmask(m,conflictKey)} is not in the column list`,sql);
  return {post:`SELECT ${columns} FROM ${insert[1]} WHERE ${conflictKey}=${tuple[position]}`};
}

// ----- Pass 12: the odds and ends ----------------------------------------------------------------------------------
function rewriteMisc(m:Masked,sql:string) {
  // MySQL's default collations (utf8mb4_0900_ai_ci / utf8mb4_general_ci) are case-insensitive, so LIKE already behaves
  // as ILIKE. The backslash escapes that lib/admin/query.ts containsPattern() emits mean the same thing in both.
  m.text=m.text.replace(/\bILIKE\b/gi,'LIKE');
  for(let guard=0;guard<50;guard++) {
    const hit=/(?<![~!<>=])~(\*?)\s*(\x01\d+\x01)/.exec(m.text);
    if(!hit)break;
    const start=operandStart(m.text,hit.index,sql);
    m.text=`${m.text.slice(0,start)}REGEXP_LIKE(${m.text.slice(start,hit.index).trim()},${hit[2]},'${hit[1]?'i':'c'}')${m.text.slice(hit.index+hit[0].length)}`;
  }
  rewriteCalls(m,'bool_or',sql,args=>`MAX(${args[0]})`);
  rewriteCalls(m,'bool_and',sql,args=>`MIN(${args[0]})`);
  // MySQL sorts NULL first ascending and last descending and has no NULLS clause; ISNULL() restores the intent.
  for(let guard=0;guard<20;guard++) {
    const hit=/\s+NULLS\s+(LAST|FIRST)\b/i.exec(m.text);
    if(!hit)break;
    const tail=/(\s+(?:ASC|DESC))\s*$/i.exec(m.text.slice(0,hit.index));
    const end=tail?hit.index-tail[1].length:hit.index;
    const start=operandStart(m.text,end,sql);
    const expression=m.text.slice(start,end).trim();
    const nulls=`ISNULL(${expression}) ${hit[1].toUpperCase()==='LAST'?'ASC':'DESC'}`;
    m.text=`${m.text.slice(0,start)}${nulls},${expression}${tail?tail[1]:''}${m.text.slice(hit.index+hit[0].length)}`;
  }
  // Catalogue lookups this application makes. Anything else under pg_ has no information_schema equivalent worth guessing.
  m.text=m.text.replace(/\bpg_timezone_names\b/gi,'mysql.time_zone_name')
    .replace(/\bcurrent_database\s*\(\s*\)/gi,'DATABASE()')
    .replace(/\bpg_database_size\s*\(\s*DATABASE\(\)\s*\)/gi,'(SELECT COALESCE(SUM(data_length+index_length),0) FROM information_schema.tables WHERE table_schema=DATABASE())');
  const catalogue=/\bpg_(class|namespace|attribute|index|constraint|get_constraintdef|total_relation_size|advisory_xact_lock|relation_size|stat_\w+)\b/i.exec(m.text);
  if(catalogue)throw new UnsupportedSql(`The PostgreSQL catalogue reference ${catalogue[0]}`,sql);
  const distinctOn=/\bDISTINCT\s+ON\s*\(/i.exec(m.text);
  if(distinctOn)throw new UnsupportedSql('SELECT DISTINCT ON (…)',sql);
  const aggregate=/\b(string_agg|array_agg|array_to_string|unnest|percentile_cont|width_bucket|hashtext)\s*\(/i.exec(m.text);
  if(aggregate)throw new UnsupportedSql(`The PostgreSQL function ${aggregate[1]}()`,sql);
  // jsonb containment (lib/projects.ts fileReference()). Left unchecked, MySQL would not reject this: `@` opens a
  // session-variable reference there, so `data @> $1` mis-parses into a variable compared with `>` instead of failing
  // — a wrong answer that runs is exactly what this module exists to prevent. JSON_CONTAINS() is not a drop-in
  // replacement (array-wrapping and key-order semantics differ), so this throws rather than guesses.
  if(/@>|<@/.test(m.text))throw new UnsupportedSql('The PostgreSQL jsonb containment operator (@> / <@)',sql);
}

// ----- Binding: $n -> ? ------------------------------------------------------------------------------------------
// MySQL's ? is strictly positional while $n is not: $1 may be used twice, $3 may appear before $2, and a rewritten
// statement may repeat a placeholder that appeared once (the recursive CTE re-reads its bound end date). So the value list
// is rebuilt by walking the finished statement left to right and pushing the bound value each time one is referenced.
export function bind(sql:string,values:unknown[]):Statement {
  const out:unknown[]=[];
  const text=sql.replace(/\$(\d+)|\x02(\d+):(\d+)\x02/g,(_,index:string,array:string,element:string)=>{
    if(index!==undefined) {
      const position=Number(index)-1;
      if(position>=values.length)throw new UnsupportedSql(`The placeholder $${index}, which has no bound value`,sql);
      out.push(values[position]);
      return '?';
    }
    out.push((values[Number(array)-1] as unknown[])[Number(element)]);
    return '?';
  });
  return {sql:text,values:out};
}

// ----- Entry point -------------------------------------------------------------------------------------------------
/** PostgreSQL SQL and its $n values in; MySQL SQL and a positional value list out. Throws UnsupportedSql, never guesses. */
export function translate(statement:string,values:unknown[]=[]):Translated {
  const m=mask(statement);
  quoteReserved(m);
  expandArrays(m,values,statement);
  rewriteIntervals(m,statement);
  rewriteTimeZones(m,statement);
  rewriteCalls(m,'date_trunc',statement,args=>truncate(literalOf(m,args[0],'date_trunc',statement).toLowerCase(),args[1],statement));
  rewriteCalls(m,'to_char',statement,args=>`DATE_FORMAT(${args[0]},${push(m,quote(dateFormat(literalOf(m,args[1],'to_char',statement),statement)))})`);
  rewriteFilters(m,statement);
  rewriteJson(m,statement);
  rewriteEpoch(m,statement);
  rewriteCasts(m,statement);
  rewriteSeries(m,statement);
  const companion=rewriteWrites(m,statement);
  rewriteMisc(m,statement);
  const main=bind(unmask(m).replace(/\s+$/,''),values);
  return {
    ...main,
    ...(companion.pre?{pre:bind(unmask(m,companion.pre),values)}:{}),
    ...(companion.post?{post:bind(unmask(m,companion.post),values)}:{}),
  };
}
