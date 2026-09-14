import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const TEXT_PREFIX = 'enc:v1:';
export const FILE_MAGIC = Buffer.from('RGENC1');
const IV_BYTES = 12, TAG_BYTES = 16;
const PRIVATE_PROFILE_FIELDS = new Set(['rollNumber','department','batch','bio','github','linkedin']);
let keyring: { cipher:Buffer; index:Buffer } | undefined;

// One 32-byte secret; HKDF derives separate keys so lookup hashes never reuse the cipher key.
function keys() {
  if (keyring) return keyring;
  const raw = process.env.DATA_ENCRYPTION_KEY?.trim() || '';
  const help = `Generate one with: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`;
  if (!raw) throw new Error(`DATA_ENCRYPTION_KEY is not configured. ${help}`);
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new Error(`DATA_ENCRYPTION_KEY must be 32 random bytes encoded as base64. ${help}`);
  const secret = Buffer.from(raw, 'base64');
  keyring = { cipher:Buffer.from(hkdfSync('sha256', secret, 'repoggits', 'data-encryption', 32)), index:Buffer.from(hkdfSync('sha256', secret, 'repoggits', 'lookup-index', 32)) };
  return keyring;
}
export const assertEncryptionKey = () => { keys(); };

// The context (table and column) is authenticated with the ciphertext, so a value cannot be moved to another column unnoticed.
function seal(plain:Buffer, context:string) {
  const iv = randomBytes(IV_BYTES), cipher = createCipheriv('aes-256-gcm', keys().cipher, iv, { authTagLength:TAG_BYTES });
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}
function open(sealed:Buffer, context:string) {
  const decipher = createDecipheriv('aes-256-gcm', keys().cipher, sealed.subarray(0, IV_BYTES), { authTagLength:TAG_BYTES });
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
}

export const isSealedText = (value:unknown): value is string => typeof value==='string' && value.startsWith(TEXT_PREFIX);
export const sealText = (value:string, context:string) => TEXT_PREFIX + seal(Buffer.from(value, 'utf8'), context).toString('base64');
// Values stored before encryption was switched on pass through unchanged until `npm run db:encrypt` converts them.
export const openText = (value:string, context:string) => isSealedText(value) ? open(Buffer.from(value.slice(TEXT_PREFIX.length), 'base64'), context).toString('utf8') : value;
export const isSealedBytes = (value:Buffer) => value.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC);
export const sealBytes = (value:Buffer, context:string) => Buffer.concat([FILE_MAGIC, seal(value, context)]);
export const openBytes = (value:Buffer, context:string) => isSealedBytes(value) ? open(value.subarray(FILE_MAGIC.length), context) : value;

// An encrypted address changes on every write, so accounts are found through this keyed hash instead.
export const emailIndex = (email:string) => createHmac('sha256', keys().index).update(email.trim().toLowerCase()).digest('hex');
export const storedEmail = (email:string) => ({ email:sealText(email, 'users.email'), emailHash:emailIndex(email) });
// Also matches accounts created before encryption, which have no hash until `npm run db:encrypt` runs.
export const EMAIL_MATCH = '(email_hash=$1 OR (email_hash IS NULL AND email=$2))';
export const emailMatchParams = (email:string) => [emailIndex(email), email];

// Name and avatarId stay readable: names label comments and reviews through SQL joins, and avatarId drives file permissions.
export function sealProfile(profile:Record<string,unknown>) {
  const visible:Record<string,unknown> = {}, hidden:Record<string,unknown> = {};
  for (const [key, value] of Object.entries(profile)) (PRIVATE_PROFILE_FIELDS.has(key) ? hidden : visible)[key] = value;
  return JSON.stringify({ ...visible, sealed:sealText(JSON.stringify(hidden), 'users.profile') });
}
export function openProfile(stored:unknown):Record<string,unknown> {
  const { sealed, ...visible } = (stored ?? {}) as Record<string,unknown>;
  return isSealedText(sealed) ? { ...visible, ...JSON.parse(openText(sealed, 'users.profile')) } : visible;
}
