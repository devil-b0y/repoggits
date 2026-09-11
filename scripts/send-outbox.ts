import { db, pool } from '../lib/db';
import { deliverMail, deliveryMode } from '../lib/mail';
async function main(){
  const mode=deliveryMode();
  if(!mode||!process.env.MAIL_FROM||(mode==='smtp'?!process.env.SMTP_HOST:!process.env.AZURE_COMMUNICATION_CONNECTION_STRING))throw new Error('Configure mail delivery first.');
  const rows=await db.query("SELECT * FROM r.outbox WHERE status='pending' ORDER BY created_at LIMIT 100");
  let sent=0;
  for(const row of rows){await deliverMail(row.recipient,row.subject,row.body);await db.query("UPDATE r.outbox SET status='sent' WHERE id=$1",[row.id]);sent++;}
  console.log(`${sent} queued messages sent.`);await pool().end();
}
main().catch(()=>{console.error('Email delivery failed. Check the MAIL_MODE settings; unsent messages remain queued.');process.exitCode=1;});
