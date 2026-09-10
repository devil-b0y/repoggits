import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { db } from './db';

export async function queueMail(recipient:string,subject:string,body:string) {
  const id=randomUUID();
  await db.query('INSERT INTO r.outbox(id,recipient,subject,body) VALUES($1,$2,$3,$4)',[id,recipient,subject,body]);
  if(process.env.MAIL_MODE!=='smtp')return;
  try {
    const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined});
    await transport.sendMail({from:process.env.MAIL_FROM,to:recipient,subject,text:body});
    await db.query("UPDATE r.outbox SET status='sent' WHERE id=$1",[id]);
  }catch{console.error('Email delivery pending; inspect the private outbox.');}
}
