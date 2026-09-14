import { pool } from '../lib/db';
import { encryptExistingData } from './encryption-backfill';

encryptExistingData().then(async counts => {
  console.log(`Encrypted ${counts.users} accounts, ${counts.outbox} queued emails, and ${counts.files} files; removed ${counts.rateLimits} rate-limit entries that held plain addresses.`);
  await pool().end();
}).catch(async error => {
  console.error('Encryption stopped. Rows already converted stay readable; fix the cause and run it again.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
  await pool().end().catch(() => {});
});
