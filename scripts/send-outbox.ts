import nodemailer from 'nodemailer';
import { db, pool } from '../lib/db';
async function main(){
  if(process.env.MAIL_MODE!=='smtp'||!process.env.SMTP_HOST||!process.env.MAIL_FROM)throw new Error('Configure SMTP first.');
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined});
  const rows=await db.query("SELECT * FROM r.outbox WHERE status='pending' ORDER BY created_at LIMIT 100");
  let sent=0;
  for(const row of rows){await transport.sendMail({from:process.env.MAIL_FROM,to:row.recipient,subject:row.subject,text:row.body});await db.query("UPDATE r.outbox SET status='sent' WHERE id=$1",[row.id]);sent++;}
  console.log(`${sent} queued messages sent.`);await pool().end();
}
main().catch(()=>{console.error('Email delivery failed. Check SMTP configuration; unsent messages remain queued.');process.exitCode=1;});
