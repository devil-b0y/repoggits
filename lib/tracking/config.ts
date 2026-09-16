import { z } from 'zod';
import { db } from '../db';

// Settings the tracker and the admin panel both read.

// How long tracked data is kept, editable in Admin › System health. Security events include failed logins, rate limits,
// denied admin requests and ended sessions; prompt logs keep their own window (AI_RETENTION_DAYS in lib/ai-usage.ts).
export const retentionSchema=z.object({
  activityDays:z.number().int().min(7).max(730),
  sessionDays:z.number().int().min(1).max(365),
  securityDays:z.number().int().min(30).max(730),
});
export type RetentionSettings=z.infer<typeof retentionSchema>;
export const DEFAULT_RETENTION:RetentionSettings={activityDays:90,sessionDays:30,securityDays:180};
export async function retentionSettings():Promise<RetentionSettings> {
  const [row]=await db.query("SELECT value FROM r.settings WHERE key='retention'");
  const parsed=retentionSchema.safeParse(row?.value);
  return parsed.success?parsed.data:DEFAULT_RETENTION;
}
/** Seconds after its last heartbeat that a browser still counts as online. PRESENCE_TIMEOUT_SECONDS: 60 to 3600, default 120. */
export function presenceTimeoutSeconds() {
  const value=Number(process.env.PRESENCE_TIMEOUT_SECONDS);
  return Number.isInteger(value)&&value>=60&&value<=3600?value:120;
}
/**
 * How many reverse proxies in front of the app append to X-Forwarded-For. TRUSTED_PROXY_HOPS: 0 to 5, default 0.
 * next start only fills X-Forwarded-For from the socket when the request has none, so with no proxy a client can
 * supply its own value; put nginx or Caddy in front and set this to 1 for addresses that cannot be forged.
 */
export function trustedProxyHops() {
  const value=Number(process.env.TRUSTED_PROXY_HOPS);
  return Number.isInteger(value)&&value>=0&&value<=5?value:0;
}
