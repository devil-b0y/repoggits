import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { db, migrate } from '../lib/db';
import { queueMail } from '../lib/mail';

// A local stand-in for the Azure Communication Services Email REST API, so the real SDK runs end to end
// (signed request, operation polling) without an Azure account.
type SendRequest={authorization:string;body:{senderAddress:string;content:{subject:string;plainText:string};recipients:{to:{address:string}[]};userEngagementTrackingDisabled?:boolean}};
let server:Server,finalStatus='Succeeded';
const received:SendRequest[]=[];
const saved={mode:process.env.MAIL_MODE,connection:process.env.AZURE_COMMUNICATION_CONNECTION_STRING,from:process.env.MAIL_FROM};

test.beforeAll(async()=>{
  await migrate();
  server=createServer((request,response)=>{
    const url=new URL(request.url||'/','http://localhost');
    let raw='';request.on('data',chunk=>{raw+=chunk;});
    request.on('end',()=>{
      const operation=`http://${request.headers.host}/emails/operations/op-1?${url.searchParams}`;
      if(request.method==='POST'&&url.pathname==='/emails:send'){
        received.push({authorization:String(request.headers.authorization||''),body:JSON.parse(raw)});
        response.writeHead(202,{'Content-Type':'application/json','operation-location':operation});
        response.end(JSON.stringify({id:'op-1',status:'Running'}));return;
      }
      if(request.method==='GET'&&url.pathname==='/emails/operations/op-1'){
        response.writeHead(200,{'Content-Type':'application/json'});
        response.end(JSON.stringify({id:'op-1',status:finalStatus,...(finalStatus==='Failed'?{error:{code:'Rejected',message:'Rejected by the test service'}}:{})}));return;
      }
      response.writeHead(404);response.end();
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  process.env.MAIL_MODE='azure';
  process.env.AZURE_COMMUNICATION_CONNECTION_STRING=`endpoint=http://127.0.0.1:${(server.address() as AddressInfo).port}/;accesskey=${randomBytes(32).toString('base64')}`;
  process.env.MAIL_FROM='DoNotReply@example.azurecomm.net';
});
test.afterAll(async()=>{
  for(const [key,value] of [['MAIL_MODE',saved.mode],['AZURE_COMMUNICATION_CONNECTION_STRING',saved.connection],['MAIL_FROM',saved.from]] as const){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  await new Promise(resolve=>server.close(resolve));
});

const outboxStatus=async(recipient:string)=>(await db.query('SELECT status FROM r.outbox WHERE recipient=$1',[recipient]))[0]?.status;

test('Azure Communication Services delivers the message and marks it sent', async () => {
  finalStatus='Succeeded';
  const recipient=`azure-${randomUUID()}@example.test`;
  await queueMail(recipient,'Verify your Repoggits account','Enter this code on the sign-in page instead: 123456');
  const sent=received.at(-1)!;
  expect(sent.body.senderAddress).toBe('DoNotReply@example.azurecomm.net');
  expect(sent.body.recipients.to).toEqual([{address:recipient}]);
  expect(sent.body.content).toMatchObject({subject:'Verify your Repoggits account',plainText:'Enter this code on the sign-in page instead: 123456'});
  // Click tracking would route one-time verify/reset links through a third-party redirect.
  expect(sent.body.userEngagementTrackingDisabled).toBe(true);
  expect(sent.authorization).toMatch(/^HMAC-SHA256 /);
  expect(await outboxStatus(recipient)).toBe('sent');
});

test('a message Azure fails to send stays pending in the outbox', async () => {
  finalStatus='Failed';
  const recipient=`azure-failed-${randomUUID()}@example.test`;
  await queueMail(recipient,'Reset your Repoggits password','This single-use link expires in one hour.');
  expect(received.at(-1)!.body.recipients.to).toEqual([{address:recipient}]);
  expect(await outboxStatus(recipient)).toBe('pending');
});
