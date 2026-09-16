// The only place a configured database's password is ever handled. A password enters through storeSecret, lives sealed
// with DATA_ENCRYPTION_KEY in a server-side file, and leaves only through resolveSecret straight into a driver's
// connection settings. Nothing here returns, logs, or puts a password in an error message.
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openText, sealText } from '../encryption';

const CONTEXT='databases.password';
export const DEFAULT_REGISTRY_FILE='.data/databases.json';
// Kept beside the registry: both are server-only state that must survive a switch away from the active database.
export const secretsFile=()=>process.env.DATABASE_SECRETS_FILE||join(dirname(process.env.DATABASE_REGISTRY_FILE||DEFAULT_REGISTRY_FILE),'secrets.json');

type Vault=Record<string,string>;
function read():Vault {
  try {const parsed=JSON.parse(readFileSync(secretsFile(),'utf8'));return parsed&&typeof parsed==='object'?parsed as Vault:{};}
  // A missing or damaged file means no stored passwords, never a leaked one: the error text is dropped on purpose.
  catch {return {};}
}
function write(vault:Vault) {
  const file=secretsFile(),temp=`${file}.${process.pid}.tmp`;
  mkdirSync(dirname(file),{recursive:true});
  writeFileSync(temp,JSON.stringify(vault),{encoding:'utf8',mode:0o600});
  renameSync(temp,file);
  try {chmodSync(file,0o600);} catch {/* Windows has no POSIX mode; the file still sits outside the web root. */}
}

export function storeSecret(id:string,password:string) {
  if(!password)throw new Error('A password is required.');
  write({...read(),[id]:sealText(password,CONTEXT)});
}
export function deleteSecret(id:string) {
  const vault=read();
  if(!(id in vault))return;
  delete vault[id];
  if(Object.keys(vault).length)write(vault);
  else try {unlinkSync(secretsFile());} catch {/* already gone */}
}
export const hasSecret=(id:string)=>id in read();

/** Resolves a `secretRef` to the password itself. Callers pass the result straight to a driver and never keep it. */
export function resolveSecret(ref:string):string {
  if(!ref)return '';
  const [kind,...rest]=ref.split(':');const name=rest.join(':');
  if(kind==='env'){
    const value=process.env[name];
    if(value===undefined)throw new Error(`The password for this connection comes from ${name}, which is not set on this server.`);
    return value;
  }
  if(kind==='vault'){
    const sealed=read()[name];
    if(!sealed)throw new Error('No stored password was found for this connection. Enter it again.');
    // A failure here means the key changed or the file was tampered with; the ciphertext must not reach the message.
    try {return openText(sealed,CONTEXT);} catch {throw new Error('The stored password could not be read with this DATA_ENCRYPTION_KEY.');}
  }
  throw new Error('A password source must be env:NAME or vault:<id>.');
}
