import { randomInt } from 'node:crypto';
import { Client } from 'pg';
import { applySchema, checkedSchema, connectionConfig } from '../lib/db';

type Column = { name:string; type:string };
type Table = { name:string; columns:Column[]; keys:Column[]; references:Column[] };
type ForeignKey = { table:string; referenced:string; columns:string[]; required:boolean };
type Side = { client:Client; schema:string };
type Connection = { client:Client; version:string };

export type TransferOptions = {
  sourceUrl:string; sourceSchema:string;
  targetUrl:string; targetSchema:string;
  mode:'check'|'copy';
  replace?:boolean;
  log?:(line:string)=>void;
};
export type TransferReport = {
  mode:'check'|'copy';
  source:{ version:string; rows:Record<string,number> };
  target:{ version:string; existingRows:number };
  copied:Record<string,number>;
  changedDuringCopy:string[];
};

// applySchema seeds default settings, so a brand-new target is empty apart from these rows.
const SEEDED_TABLES = new Set(['settings']);
const quote = (name:string) => `"${name.replace(/"/g, '""')}"`;
const qualified = (side:Side, table:string) => `${quote(side.schema)}.${quote(table)}`;
const messageOf = (error:unknown) => error instanceof Error ? error.message : String(error);

async function connect(url:string, prefix:string, label:string):Promise<Connection> {
  let config;
  try { config = connectionConfig(url, prefix); }
  catch (error) { throw new Error(`The ${label} connection settings are invalid: ${messageOf(error)}`); }
  const client = new Client({ ...config, connectionTimeoutMillis:15000, keepAlive:true });
  // A dropped connection also rejects the query in flight, which is where it gets reported.
  client.on('error', () => {});
  try { await client.connect(); }
  catch (error) { throw new Error(`Could not connect to the ${label} database: ${messageOf(error)}`); }
  const { rows:[server] } = await client.query<{ version_number:string; version:string }>("SELECT current_setting('server_version_num') AS version_number, current_setting('server_version') AS version");
  if (Number(server.version_number) < 120000) {
    await client.end();
    throw new Error(`The ${label} database runs PostgreSQL ${server.version}; version 12 or newer is required.`);
  }
  return { client, version:server.version };
}

// Databases are often far apart, so work that can share a round trip or run on both connections at once does.
async function connectBoth(options:TransferOptions, opened:Client[]) {
  const results = await Promise.allSettled([connect(options.sourceUrl, 'DATABASE', 'source'), connect(options.targetUrl, 'TARGET_DATABASE', 'target')]);
  for (const result of results) if (result.status === 'fulfilled') opened.push(result.value.client);
  const failure = results.find((result):result is PromiseRejectedResult => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results.map(result => (result as PromiseFulfilledResult<Connection>).value);
}

async function begin(client:Client, snapshot:boolean) {
  // Fixed text formats keep row checksums comparable between servers, and a large copy must not hit server timeouts.
  await client.query(`${snapshot ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN'}; SET LOCAL TimeZone='UTC'; SET LOCAL DateStyle='ISO, YMD'; SET LOCAL IntervalStyle='postgres'; SET LOCAL bytea_output='hex'; SET LOCAL extra_float_digits=1; SET LOCAL statement_timeout=0; SET LOCAL idle_in_transaction_session_timeout=0`);
}

// Host names cannot tell a pooler address from a direct one, so ask the servers: a lock the target
// holds is visible from the source only when both connections reach the same database.
async function sameDatabase(source:Side, target:Side) {
  const [classId, objectId] = [randomInt(1, 2**31 - 1), randomInt(1, 2**31 - 1)];
  await target.client.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [classId, objectId]);
  const { rows } = await source.client.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=$1::oid AND objid=$2::oid AND objsubid=2 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())", [classId, objectId]);
  return rows.length > 0;
}

async function layout(side:Side) {
  const { rows } = await side.client.query<{ table_name:string; column_name:string; column_type:string }>(
    `SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS column_type
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
     WHERE n.nspname=$1 AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
     ORDER BY c.relname, a.attnum`, [side.schema]);
  const tables = new Map<string, Column[]>();
  for (const row of rows) tables.set(row.table_name, [...(tables.get(row.table_name) ?? []), { name:row.column_name, type:row.column_type }]);
  return tables;
}

function compareLayouts(source:Map<string, Column[]>, target:Map<string, Column[]>) {
  const upgradeSource = 'Start the application or run npm run db:setup against the source first, so both sides share the same layout.';
  const upgradeCode = 'Update this copy of Repoggits to the version that last ran against the source, then try again.';
  for (const [table, columns] of source) {
    const expected = target.get(table);
    if (!expected) throw new Error(`The source has a table this version of Repoggits does not create: ${table}. ${upgradeCode}`);
    for (const column of columns) {
      const match = expected.find(candidate => candidate.name === column.name);
      if (!match) throw new Error(`The source has a column this version of Repoggits does not create: ${table}.${column.name}. ${upgradeCode}`);
      if (match.type !== column.type) throw new Error(`${table}.${column.name} is ${column.type} in the source but ${match.type} in the target.`);
    }
    for (const column of expected) if (!columns.some(candidate => candidate.name === column.name)) throw new Error(`The source is missing ${table}.${column.name}. ${upgradeSource}`);
  }
  for (const table of target.keys()) if (!source.has(table)) throw new Error(`The source is missing the ${table} table. ${upgradeSource}`);
}

// Parents are inserted before the rows that reference them. A self-reference or a cycle
// (projects.parent_version_id and versions.project_id) is broken by inserting a nullable
// reference empty and filling it in once every row exists.
async function plan(target:Side, columnsByTable:Map<string, Column[]>):Promise<Table[]> {
  const names = [...columnsByTable.keys()];
  const { rows:primary } = await target.client.query<{ table_name:string; columns:string[] }>(
    `SELECT c.relname AS table_name, array_agg(a.attname::text ORDER BY k.ordinal) AS columns
     FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ordinal)
     JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
     WHERE n.nspname=$1 AND i.indisprimary GROUP BY c.relname`, [target.schema]);
  const { rows:foreign } = await target.client.query<ForeignKey>(
    `SELECT c.relname AS "table", r.relname AS referenced, array_agg(a.attname::text ORDER BY k.ordinal) AS columns, bool_or(a.attnotnull) AS required
     FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class r ON r.oid=f.confrelid
     CROSS JOIN LATERAL unnest(f.conkey) WITH ORDINALITY AS k(attnum, ordinal)
     JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
     WHERE f.contype='f' AND n.nspname=$1 AND r.relnamespace=c.relnamespace GROUP BY f.oid, c.relname, r.relname`, [target.schema]);
  const links = foreign.filter(link => columnsByTable.has(link.referenced));
  const deferred = new Map(names.map(name => [name, new Set<string>()]));
  for (const link of links) if (link.table === link.referenced) link.columns.forEach(column => deferred.get(link.table)!.add(column));
  const placed = new Set<string>(), order:string[] = [];
  const unmet = (name:string) => links.filter(link => link.table === name && !placed.has(link.referenced) && !link.columns.every(column => deferred.get(name)!.has(column)));
  while (order.length < names.length) {
    const ready = names.filter(name => !placed.has(name) && !unmet(name).length);
    if (ready.length) { for (const name of ready) { placed.add(name); order.push(name); } continue; }
    const waiting = (name:string) => names.filter(other => !placed.has(other) && unmet(other).some(link => link.referenced === name)).length;
    const [breakable] = names.filter(name => !placed.has(name) && unmet(name).every(link => !link.required)).sort((a, b) => waiting(b) - waiting(a));
    if (!breakable) throw new Error(`These tables reference each other through required columns, so no copy order exists: ${names.filter(name => !placed.has(name)).join(', ')}.`);
    for (const link of unmet(breakable)) link.columns.forEach(column => deferred.get(breakable)!.add(column));
  }
  return order.map(name => {
    const columns = columnsByTable.get(name)!;
    const keyNames = primary.find(row => row.table_name === name)?.columns ?? [];
    const table = { name, columns, keys:columns.filter(column => keyNames.includes(column.name)), references:columns.filter(column => deferred.get(name)!.has(column.name)) };
    if (table.references.length && !table.keys.length) throw new Error(`${name} needs a primary key to be copied.`);
    return table;
  });
}

async function countRows(side:Side, tables:Table[]) {
  const { rows } = await side.client.query<{ slot:number; total:string }>(tables.map((table, slot) => `SELECT ${slot} AS slot, count(*) AS total FROM ${qualified(side, table.name)}`).join(' UNION ALL '));
  const totals = tables.map(() => 0);
  for (const row of rows) totals[row.slot] = Number(row.total);
  return totals;
}

// rowCount comes from the same snapshot the rows are read from, so it is exact: empty tables are skipped
// and small ones arrive in a single query instead of through a cursor.
async function copyTable(source:Side, target:Side, table:Table, rowCount:number) {
  const { columns } = table, cursor = quote(`transfer_${table.name}`);
  const emptyFirst = new Set(table.references.map(column => column.name));
  const savedIndexes = [...table.keys, ...table.references].map(column => columns.indexOf(column));
  const referenceIndexes = table.references.map(column => columns.indexOf(column));
  // Values travel as text so microseconds and JSON arrays arrive exactly; the driver's own conversions would change them.
  const select = `SELECT ${columns.map(column => column.type === 'bytea' ? quote(column.name) : `${quote(column.name)}::text`).join(', ')} FROM ${qualified(source, table.name)}`;
  const insert = `INSERT INTO ${qualified(target, table.name)} (${columns.map(column => quote(column.name)).join(', ')}) VALUES `;
  const batch = columns.some(column => column.type === 'bytea') ? 8 : Math.max(1, Math.min(500, Math.floor(20000 / columns.length)));
  const useCursor = rowCount > batch;
  const pending:unknown[][] = [];
  let copied = 0;
  if (useCursor) await source.client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR ${select}`);
  while (copied < rowCount) {
    const { rows } = await source.client.query({ text:useCursor ? `FETCH ${batch} FROM ${cursor}` : select, rowMode:'array' as const });
    if (!rows.length) break;
    const values:unknown[] = [];
    const tuples = rows.map(row => {
      if (referenceIndexes.some(index => row[index] !== null)) pending.push(savedIndexes.map(index => row[index]));
      return `(${columns.map((column, index) => { values.push(emptyFirst.has(column.name) ? null : row[index]); return `$${values.length}::${column.type}`; }).join(', ')})`;
    });
    await target.client.query(insert + tuples.join(', '), values);
    copied += rows.length;
  }
  if (useCursor) await source.client.query(`CLOSE ${cursor}`);
  return { copied, pending };
}

async function fillReferences(target:Side, table:Table, rows:unknown[][]) {
  const columns = [...table.keys, ...table.references];
  const assign = table.references.map((column, index) => `${quote(column.name)}=d.c${table.keys.length + index}::${column.type}`).join(', ');
  const match = table.keys.map((column, index) => `t.${quote(column.name)}=d.c${index}::${column.type}`).join(' AND ');
  const statement = `UPDATE ${qualified(target, table.name)} AS t SET ${assign} FROM unnest(${columns.map((_, index) => `$${index + 1}::text[]`).join(', ')}) AS d(${columns.map((_, index) => `c${index}`).join(', ')}) WHERE ${match}`;
  for (let start = 0; start < rows.length; start += 1000) {
    const slice = rows.slice(start, start + 1000);
    await target.client.query(statement, columns.map((_, index) => slice.map(row => row[index])));
  }
}

// No table uses a sequence today; a future serial or identity column must not restart at 1 on the new server.
async function resetSequences(target:Side) {
  const { rows } = await target.client.query<{ sequence_name:string; table_name:string; column_name:string }>(
    `SELECT format('%I.%I', sn.nspname, s.relname) AS sequence_name, t.relname AS table_name, a.attname AS column_name
     FROM pg_depend d JOIN pg_class s ON s.oid=d.objid AND s.relkind='S' JOIN pg_namespace sn ON sn.oid=s.relnamespace
     JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace n ON n.oid=t.relnamespace
     JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
     WHERE d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i') AND n.nspname=$1`, [target.schema]);
  for (const row of rows) {
    const column = quote(row.column_name);
    await target.client.query(`SELECT setval($1::regclass, coalesce(max(${column}), 1)::bigint, max(${column}) IS NOT NULL) FROM ${qualified(target, row.table_name)}`, [row.sequence_name]);
  }
}

async function checksums(side:Side, tables:Table[]) {
  const { rows } = await side.client.query<{ slot:number; total:string; digest:string }>(tables.map((table, slot) => {
    const row = `ROW(${table.columns.map(column => quote(column.name)).join(', ')})::text`;
    return `(SELECT ${slot} AS slot, count(*) AS total, encode(sha256(convert_to(coalesce(string_agg(h, '' ORDER BY h COLLATE "C"), ''), 'UTF8')), 'hex') AS digest
      FROM (SELECT encode(sha256(convert_to(${row}, 'UTF8')), 'hex') AS h FROM ${qualified(side, table.name)}) AS hashed)`;
  }).join(' UNION ALL '));
  return tables.map((_, slot) => {
    const found = rows.find(row => row.slot === slot)!;
    return { rows:Number(found.total), digest:found.digest };
  });
}

// Copies every Repoggits table from the source schema to the target schema. The source is read from one
// snapshot and never written; the target changes in a single transaction that commits only after every
// table matches the source by row count and checksum. 'check' does everything short of copying rows.
export async function transferDatabase(options:TransferOptions):Promise<TransferReport> {
  const log = options.log ?? (() => {});
  if (options.mode === 'check' && options.replace) throw new Error('--check and --replace cannot be combined.');
  const sourceSchema = checkedSchema(options.sourceSchema), targetSchema = checkedSchema(options.targetSchema);
  const opened:Client[] = [];
  try {
    const [from, to] = await connectBoth(options, opened);
    const source:Side = { client:from.client, schema:sourceSchema }, target:Side = { client:to.client, schema:targetSchema };
    const report:TransferReport = { mode:options.mode, source:{ version:from.version, rows:{} }, target:{ version:to.version, existingRows:0 }, copied:{}, changedDuringCopy:[] };
    await Promise.all([begin(source.client, true), begin(target.client, false)]);
    if (sourceSchema === targetSchema && await sameDatabase(source, target)) throw new Error('TARGET_DATABASE_URL points at the same database and schema as DATABASE_URL, so there is nothing to copy.');

    log(`Preparing the "${targetSchema}" schema on the target…`);
    const [sourceLayout] = await Promise.all([layout(source), applySchema(target.client, targetSchema)]);
    if (!sourceLayout.size) throw new Error(`No Repoggits tables were found in the "${sourceSchema}" schema of the source database.`);
    const targetLayout = await layout(target);
    compareLayouts(sourceLayout, targetLayout);
    const tables = await plan(target, targetLayout);
    const [sourceCounts, targetCounts] = await Promise.all([countRows(source, tables), countRows(target, tables)]);
    tables.forEach((table, slot) => {
      report.source.rows[table.name] = sourceCounts[slot];
      if (!SEEDED_TABLES.has(table.name)) report.target.existingRows += targetCounts[slot];
    });
    if (options.mode === 'check') {
      await Promise.all([target.client.query('ROLLBACK'), source.client.query('ROLLBACK')]);
      return report;
    }
    if (report.target.existingRows && !options.replace) throw new Error(`The target already holds ${report.target.existingRows} rows in the "${targetSchema}" schema, so nothing was copied. Run again with --replace to overwrite them with the source data.`);

    // Removes the seeded default settings, or with --replace everything already there.
    await target.client.query(`TRUNCATE ${tables.map(table => qualified(target, table.name)).join(', ')}`);
    const pending:[Table, unknown[][]][] = [];
    for (const [slot, table] of tables.entries()) {
      log(`Copying ${table.name} (${sourceCounts[slot]} rows)…`);
      const result = await copyTable(source, target, table, sourceCounts[slot]);
      report.copied[table.name] = result.copied;
      if (result.pending.length) pending.push([table, result.pending]);
    }
    for (const [table, rows] of pending) await fillReferences(target, table, rows);
    await resetSequences(target);

    log('Verifying every table against the source…');
    const [expected, actual] = await Promise.all([checksums(source, tables), checksums(target, tables)]);
    tables.forEach((table, slot) => {
      if (expected[slot].rows !== actual[slot].rows || expected[slot].digest !== actual[slot].digest) throw new Error(`Verification failed for ${table.name}: ${actual[slot].rows} of ${expected[slot].rows} rows arrived, or their contents differ.`);
    });
    // Rows written after the snapshot are not in the copy. Counting again catches the usual cause, a running application.
    await source.client.query('COMMIT');
    const afterCopy = await countRows(source, tables);
    tables.forEach((table, slot) => { if (afterCopy[slot] !== sourceCounts[slot]) report.changedDuringCopy.push(table.name); });
    await target.client.query('COMMIT');
    return report;
  } catch (error) {
    await Promise.all(opened.map(client => client.query('ROLLBACK').catch(() => {})));
    throw error;
  } finally {
    await Promise.all(opened.map(client => client.end().catch(() => {})));
  }
}
