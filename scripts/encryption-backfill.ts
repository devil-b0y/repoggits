import { db, transaction } from '../lib/db';
import { FILE_MAGIC, emailIndex, isSealedBytes, isSealedText, openProfile, openText, sealBytes, sealProfile, sealText } from '../lib/encryption';

// Converts rows written before encryption was switched on. Already-encrypted values are skipped, so it is safe to run again.
export async function encryptExistingData() {
  const counts = { users:0, outbox:0, files:0, rateLimits:0 };
  for (const { id } of await db.query("SELECT id FROM r.users WHERE email NOT LIKE 'enc:v1:%' OR email_hash IS NULL OR NOT (profile ? 'sealed')")) {
    await transaction(async client => {
      const [row] = await client.query('SELECT email,profile FROM r.users WHERE id=$1 FOR UPDATE', [id]);
      if (!row) return;
      const email = openText(row.email, 'users.email');
      await client.query('UPDATE r.users SET email=$1,email_hash=$2,profile=$3 WHERE id=$4', [isSealedText(row.email) ? row.email : sealText(email, 'users.email'), emailIndex(email), sealProfile(openProfile(row.profile)), id]);
      counts.users++;
    });
  }
  for (const row of await db.query("SELECT id,recipient,subject,body FROM r.outbox WHERE recipient NOT LIKE 'enc:v1:%'")) {
    const updated = await db.query('UPDATE r.outbox SET recipient=$1,recipient_hash=$2,subject=$3,body=$4 WHERE id=$5 AND recipient=$6 RETURNING id', [sealText(row.recipient, 'outbox.recipient'), emailIndex(row.recipient), sealText(row.subject, 'outbox.subject'), sealText(row.body, 'outbox.body'), row.id, row.recipient]);
    counts.outbox += updated.length;
  }
  for (const { id } of await db.query('SELECT id FROM r.files WHERE substring(content from 1 for $1::int) IS DISTINCT FROM $2::bytea', [FILE_MAGIC.length, FILE_MAGIC])) {
    await transaction(async client => {
      const [file] = await client.query('SELECT filename,content FROM r.files WHERE id=$1 FOR UPDATE', [id]);
      if (!file || isSealedBytes(file.content)) return;
      await client.query('UPDATE r.files SET filename=$1,content=$2 WHERE id=$3', [isSealedText(file.filename) ? file.filename : sealText(file.filename, 'files.filename'), sealBytes(file.content, 'files.content'), id]);
      counts.files++;
    });
  }
  // Rate-limit keys used to embed plain addresses; they expire within an hour, so removing them loses nothing.
  counts.rateLimits = (await db.query("DELETE FROM r.rate_limits WHERE key LIKE '%@%' RETURNING key")).length;
  return counts;
}
