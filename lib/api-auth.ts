import { randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { db, transaction } from './db';
import { hashPassword, checkPassword, currentUser, requireUser, newToken, newCode, hashToken, SESSION_COOKIE, audit, rateLimit, userView } from './auth';
import { emailSchema, passwordSchema, profileSchema } from './schema';
import { bodyJson, json } from './http';
import { requireCondition, HttpError } from './errors';
import { queueMail } from './mail';
import { emailVerificationRequired } from './policy';

async function issueToken(userId:string,email:string,purpose:string) {
  // The link and the code are two independent ways to complete the same pending action: whichever
  // is used first consumes the row, so the other becomes invalid immediately afterward.
  // DEV_FIXED_OTP (local .env.local only) pins the registration code for manual testing without real email delivery.
  const token=newToken(),code=(purpose==='verify'&&process.env.DEV_FIXED_OTP)||newCode();
  await transaction(async client=>{
    await client.query('DELETE FROM r.tokens WHERE user_id=$1 AND purpose=$2',[userId,purpose]);
    await client.query("INSERT INTO r.tokens(hash,user_id,purpose,expires_at,code_hash) VALUES($1,$2,$3,now()+interval '1 hour',$4)",[hashToken(token),userId,purpose,hashToken(code)]);
  });
  await queueMail(email,purpose==='verify'?'Verify your Repoggits account':'Reset your Repoggits password',`${process.env.APP_ORIGIN || 'http://localhost:3000'}/auth?mode=${purpose}&token=${token}\n\nThis single-use link expires in one hour.\n\nOr enter this code on the sign-in page instead: ${code}`);
}
export async function authRoute(request:NextRequest,action:string) {
  if(action==='me')return json({user:await currentUser(request),uploadsAvailable:true,emailVerificationRequired:emailVerificationRequired()});
  if(action==='logout'){
    const token=request.cookies.get(SESSION_COOKIE)?.value;
    if(token)await db.query('DELETE FROM r.sessions WHERE hash=$1',[hashToken(token)]);
    const response=json({ok:true});response.cookies.set(SESSION_COOKIE,'',{path:'/',maxAge:0,httpOnly:true,sameSite:'lax'});return response;
  }
  if(action==='resend') {const user=await requireUser(request,false);if(!emailVerificationRequired())return json({message:'Email verification is not required. You can use your account now.'});await rateLimit(`verify:${user.id}`,3,3600);if(!user.verified)await issueToken(user.id,user.email,'verify');return json({message:'A verification message has been queued.'});}
  const body=await bodyJson(request);
  if(action==='register') {
    const input=z.object({name:z.string().trim().min(2).max(100),email:emailSchema,password:passwordSchema}).parse(body);
    await rateLimit(`signup:${input.email}`,3,3600);await rateLimit('signup:global',100,3600);
    // Super Admins can limit self-service sign-up to specific email domains (Admin → Settings).
    // Only new registrations are gated; existing accounts, resets, and operator invites are not.
    const [moderation]=await db.query("SELECT value FROM r.settings WHERE key='moderation'");
    const allowedDomains:string[]=Array.isArray(moderation?.value?.allowedEmailDomains)?moderation.value.allowedEmailDomains:[];
    if(allowedDomains.length)requireCondition(allowedDomains.includes(input.email.split('@').pop()||''),403,`Sign-up is limited to these email domains: ${allowedDomains.join(', ')}.`);
    const existing=await db.query('SELECT id FROM r.users WHERE email=$1',[input.email]);
    if(!existing.length){const id=randomUUID();const password=await hashPassword(input.password);await db.query('INSERT INTO r.users(id,email,password_hash,name,profile) VALUES($1,$2,$3,$4,$5)',[id,input.email,password,input.name,JSON.stringify({name:input.name})]);if(emailVerificationRequired())await issueToken(id,input.email,'verify');}
    return json({message:emailVerificationRequired()?'If this address is eligible, a verification message has been queued. Check your inbox before signing in.':'Registration received. You can sign in now. If you already have an account, use your existing password.'},202);
  }
  if(action==='login') {
    const input=z.object({email:emailSchema,password:z.string().max(128)}).parse(body);
    await rateLimit(`login:${input.email}`,10,900);await rateLimit('login:global',300,900);
    const [row]=await db.query('SELECT * FROM r.users WHERE email=$1',[input.email]);
    const valid=await checkPassword(input.password,row?.password_hash||null);
    requireCondition(valid&&row&&!row.suspended,401,'Email or password is incorrect.');
    const token=newToken();await db.query("INSERT INTO r.sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[hashToken(token),row.id]);
    const response=json({user:userView(row)});response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:'lax',secure:process.env.APP_ORIGIN?.startsWith('https:')||false,path:'/',maxAge:7*86400});return response;
  }
  if(action==='forgot') {
    const {email}=z.object({email:emailSchema}).parse(body);await rateLimit(`reset:${email}`,3,3600);
    const [row]=await db.query('SELECT id FROM r.users WHERE email=$1 AND NOT suspended',[email]);
    if(row)await issueToken(row.id,email,'reset');
    return json({message:'If an account exists, a password-reset message has been queued.'});
  }
  if(['verify','reset','invite'].includes(action)) {
    // Admin invites stay link-only (operator-issued, not self-service). Verify/reset accept
    // either the emailed link or the emailed 6-digit code — both complete the same pending action.
    const codeEligible=action!=='invite';
    const input=(codeEligible
      ? z.object({token:z.string().regex(/^[a-f0-9]{64}$/).optional(),email:emailSchema.optional(),code:z.string().regex(/^\d{6}$/).optional(),password:passwordSchema.optional()})
      : z.object({token:z.string().regex(/^[a-f0-9]{64}$/),password:passwordSchema.optional()})
    ).parse(body) as {token?:string;email?:string;code?:string;password?:string};
    requireCondition(action==='verify'||input.password,400,'A new password is required.');
    requireCondition(!!input.token||!!(codeEligible&&input.email&&input.code),400,'A verification link or code is required.');
    if(input.email&&input.code)await rateLimit(`code:${action}:${input.email}`,10,3600);
    const passwordHash=input.password?await hashPassword(input.password):null;
    const outcome=await transaction(async client=>{
      let userId:string;
      if(input.token) {
        const [row]=await client.query('DELETE FROM r.tokens WHERE hash=$1 AND purpose=$2 AND expires_at>now() RETURNING user_id',[hashToken(input.token),action]);
        requireCondition(row,400,'This link is invalid or has expired. Request a new one.');
        userId=row.user_id;
      } else {
        const [user]=await client.query('SELECT id FROM r.users WHERE email=$1',[input.email]);
        const [pending]=user?await client.query('SELECT hash,code_hash,code_attempts FROM r.tokens WHERE user_id=$1 AND purpose=$2 AND expires_at>now() FOR UPDATE',[user.id,action]):[];
        requireCondition(pending?.code_hash,400,'This code is invalid or has expired. Request a new one.');
        requireCondition(pending.code_attempts<5,429,'Too many incorrect attempts. Request a new code.');
        const expected=Buffer.from(pending.code_hash,'hex'),actual=Buffer.from(hashToken(input.code!),'hex');
        if(expected.length!==actual.length||!timingSafeEqual(expected,actual)) {
          // Returned rather than thrown: throwing here would roll back the increment, and the
          // attempt limit would silently never engage.
          await client.query('UPDATE r.tokens SET code_attempts=code_attempts+1 WHERE hash=$1',[pending.hash]);
          return 'wrong-code' as const;
        }
        await client.query('DELETE FROM r.tokens WHERE hash=$1',[pending.hash]);
        userId=user.id;
      }
      if(action==='verify')await client.query('UPDATE r.users SET verified=true WHERE id=$1',[userId]);
      else {await client.query('UPDATE r.users SET password_hash=$1,verified=true WHERE id=$2',[passwordHash,userId]);await client.query('DELETE FROM r.sessions WHERE user_id=$1',[userId]);}
      await audit(client,userId,`account.${action}`,userId,{method:input.token?'link':'code'});
      return 'ok' as const;
    });
    if(outcome==='wrong-code')throw new HttpError(400,'Incorrect code. Try again.');
    return json({message:action==='verify'?'Email verified. You can now sign in.':'Password saved. Sign in with your new password.'});
  }
  if(action==='profile') {
    const user=await requireUser(request,false);const profile=profileSchema.parse(body);
    if(profile.avatarId){const [file]=await db.query("SELECT id FROM r.files WHERE id=$1 AND owner_id=$2 AND mime='image/webp'",[profile.avatarId,user.id]);requireCondition(file,400,'Choose an image you uploaded.');}
    await db.query('UPDATE r.users SET name=$1,profile=$2 WHERE id=$3',[profile.name,JSON.stringify(profile),user.id]);
    return json({ok:true});
  }
  return json({error:'Unknown account action.'},404);
}
