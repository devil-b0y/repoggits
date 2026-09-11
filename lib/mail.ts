import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { EmailClient } from '@azure/communication-email';
import { db } from './db';

export function deliveryMode() {
  const mode=process.env.MAIL_MODE;
  return mode==='smtp'||mode==='azure'?mode:null;
}

export async function deliverMail(recipient:string,subject:string,body:string) {
  const mode=deliveryMode();
  if(mode==='azure') {
    const connection=process.env.AZURE_COMMUNICATION_CONNECTION_STRING||'';
    // Plain HTTP is only accepted for a loopback endpoint (a local test double); real Azure endpoints must use TLS.
    const loopback=/(?:^|;)\s*endpoint=http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//i.test(connection);
    // Engagement tracking would rewrite links, sending one-time verify/reset tokens through Microsoft's click redirect.
    const poller=await new EmailClient(connection,{allowInsecureConnection:loopback}).beginSend({senderAddress:process.env.MAIL_FROM||'',content:{subject,plainText:body},recipients:{to:[{address:recipient}]},disableUserEngagementTracking:true},{updateIntervalInMs:1000});
    const result=await poller.pollUntilDone();
    if(result.status!=='Succeeded')throw new Error(`Azure email ended as ${result.status}`);
    return;
  }
  if(mode==='smtp') {
    const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined});
    await transport.sendMail({from:process.env.MAIL_FROM,to:recipient,subject,text:body});
    return;
  }
  throw new Error('Mail delivery is not configured.');
}

export async function queueMail(recipient:string,subject:string,body:string) {
  const id=randomUUID(),mode=deliveryMode();
  await db.query('INSERT INTO r.outbox(id,recipient,subject,body) VALUES($1,$2,$3,$4)',[id,recipient,subject,body]);
  if(!mode)return;
  try {
    await deliverMail(recipient,subject,body);
    await db.query("UPDATE r.outbox SET status='sent' WHERE id=$1",[id]);
  }catch(error){console.error(`Email delivery via ${mode} failed (${error instanceof Error?error.name:'unknown error'}); the message stays pending in the private outbox.`);}
}
