import { db, pool } from '../lib/db';
import { mkdirSync, writeFileSync } from 'node:fs';
async function main(){
  const rows=await db.query("SELECT recipient,subject,body,created_at FROM r.outbox WHERE status='pending' ORDER BY created_at DESC LIMIT 50");
  mkdirSync('.local',{recursive:true});
  writeFileSync('.local/outbox.txt',rows.map(row=>`To: ${row.recipient}\nSubject: ${row.subject}\n${row.body}\n`).join('\n---\n'),{mode:0o600});
  console.log('Private messages written to .local/outbox.txt.');await pool().end();
}
main().catch(()=>{console.error('Could not read the private outbox.');process.exitCode=1;});
