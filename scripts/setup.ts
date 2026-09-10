import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { migrate, db, pool, transaction } from '../lib/db';
import { newToken, hashToken, audit } from '../lib/auth';

async function setup() {
  await migrate();
  console.log('Neon connection verified. Application schema is ready.');
  const email=process.argv[2]?.toLowerCase();
  if(email){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Supply a valid administrator email.');
    const token=newToken();
    const invited=await transaction(async client=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext('repoggits-bootstrap'))");
      const [existing]=await client.query("SELECT id FROM r.users WHERE role='superadmin' LIMIT 1");
      if(existing)return false;
      const id=randomUUID();
      await client.query("INSERT INTO r.users(id,email,name,role,profile) VALUES($1,$2,'Administrator','superadmin',$3)",[id,email,JSON.stringify({name:'Administrator'})]);
      await client.query("INSERT INTO r.tokens(hash,user_id,purpose,expires_at) VALUES($1,$2,'invite',now()+interval '24 hours')",[hashToken(token),id]);
      await audit(client,null,'admin.invited',id);
      return true;
    });
    if(invited){mkdirSync('.local',{recursive:true});writeFileSync('.local/admin-invitation.txt',`${process.env.APP_ORIGIN||'http://localhost:3000'}/auth?mode=invite&token=${token}\n\nSingle-use invitation for ${email}. Expires in 24 hours.\n`,{mode:0o600});console.log('Private admin invitation saved to .local/admin-invitation.txt.');}
    else console.log('An administrator already exists; no account changes made.');
  }
  await pool().end();
}
setup().catch(()=>{console.error('Setup failed. Check the private environment configuration and database connectivity.');process.exitCode=1;});
