import { schemaName } from '../lib/db';
import { transferDatabase } from './database-transfer';

const flags = process.argv.slice(2);
const total = (rows:Record<string,number>) => Object.values(rows).reduce((sum, rowCount) => sum + rowCount, 0);

async function transfer() {
  const unknown = flags.filter(flag => flag !== '--check' && flag !== '--replace');
  if (unknown.length) throw new Error(`Unknown option: ${unknown.join(' ')}. Use --check to test without writing, or --replace to overwrite a target that already holds data.`);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured. It names the database to copy from.');
  // Read from the environment rather than an argument, so the password stays out of shell history and process lists.
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!targetUrl) throw new Error('Set TARGET_DATABASE_URL to the new PostgreSQL database, in .env.local or the environment. See "Moving to another database" in docs/DEPLOYMENT.md.');
  const mode = flags.includes('--check') ? 'check' : 'copy';
  const started = Date.now();
  const report = await transferDatabase({
    sourceUrl:process.env.DATABASE_URL, sourceSchema:schemaName(),
    targetUrl, targetSchema:process.env.TARGET_DATABASE_SCHEMA || schemaName(),
    mode, replace:flags.includes('--replace'), log:line => console.log(line),
  });
  const tables = Object.keys(report.source.rows).length;
  console.log(`Source: PostgreSQL ${report.source.version}, ${total(report.source.rows)} rows in ${tables} tables.`);
  console.log(`Target: PostgreSQL ${report.target.version}, ${report.target.existingRows ? `already holds ${report.target.existingRows} rows` : 'empty'}.`);
  if (mode === 'check') {
    console.log(report.target.existingRows
      ? 'Check passed. The target already holds data, so copying needs --replace to overwrite it. Nothing was written.'
      : 'Check passed: both databases are reachable and compatible. Nothing was written.');
    return;
  }
  console.log(`Copied and verified ${total(report.copied)} rows in ${tables} tables in ${Math.round((Date.now() - started) / 1000)} s.`);
  if (report.changedDuringCopy.length) console.warn(`Warning: ${report.changedDuringCopy.join(', ')} changed on the source while copying, and those changes are not in the copy. Stop the application and run again with --replace.`);
  console.log('Next: move the TARGET_DATABASE_* values into DATABASE_URL, DATABASE_SSL, and DATABASE_CA_CERT_FILE, keep DATA_ENCRYPTION_KEY unchanged, restart, and check /api/health. The source database was not changed.');
}

transfer().catch(error => {
  console.error('Database transfer stopped. The target was left as it was.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
