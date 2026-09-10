import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { ZipFile } from 'yazl';
import { HttpError } from './errors';

const excluded=new Set(['node_modules','.git','.next','.next-test-dev','out','dist','build','coverage','test-results','playwright-report','.local','.cache','backups']);
type Rules={base:string;matcher:Ignore};
export async function websiteBackup(root=process.cwd()){
  const base=await realpath(root);
  const entries:{name:string;content:Buffer}[]=[];
  let bytes=0;
  async function walk(folder:string,rules:Rules[]){
    const ignorePath=resolve(folder,'.gitignore');
    try{if((await lstat(ignorePath)).isFile())rules=[...rules,{base:folder,matcher:ignore().add(await readFile(ignorePath,'utf8'))}];}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    for(const item of await readdir(folder,{withFileTypes:true})){
      const lower=item.name.toLowerCase();
      if(item.isSymbolicLink()||excluded.has(lower)||lower.startsWith('.env')&&lower!=='.env.example'||/\.(?:tsbuildinfo|log|pem|key|pfx|p12)$/.test(lower))continue;
      const path=resolve(folder,item.name),isDirectory=item.isDirectory();
      if(!isDirectory&&!item.isFile())continue;
      let ignored=false;
      for(const rule of rules){const result=rule.matcher.test(relative(rule.base,path).split(sep).join('/')+(isDirectory?'/':''));if(result.ignored)ignored=true;if(result.unignored)ignored=false;}
      if(ignored)continue;
      const actual=await realpath(path),rel=relative(base,actual);
      if(rel.startsWith('..'+sep)||rel==='..'||resolve(actual)===base||rel.startsWith(sep))continue;
      if(isDirectory){await walk(path,rules);continue;}
      const stat=await lstat(path);
      if(!stat.isFile())continue;
      if(entries.length>=10000||bytes+stat.size>128*1024*1024)throw new HttpError(413,'Website source exceeds the 128 MB or 10,000 file backup limit.');
      const content=await readFile(path);bytes+=content.length;
      if(bytes>128*1024*1024)throw new HttpError(413,'Website source exceeds the backup limit.');
      entries.push({name:relative(base,path).split(sep).join('/'),content});
    }
  }
  await walk(base,[]);
  if(!entries.some(e=>e.name==='package.json')||!entries.some(e=>e.name.startsWith('app/')))throw new HttpError(503,'The website source is not available in this deployment. Create the backup from the local project server.');
  const zip=new ZipFile(),chunks:Buffer[]=[];
  const complete=new Promise<Buffer>((resolve,reject)=>{zip.outputStream.on('data',chunk=>chunks.push(chunk));zip.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));zip.outputStream.on('error',reject);zip.on('error',reject);});
  for(const entry of entries)zip.addBuffer(entry.content,`repoggits/${entry.name}`);
  zip.addBuffer(Buffer.from('WEBSITE SOURCE BACKUP\n\nIncludes source, public assets, tests, package lockfile, and environment template.\nExcludes ignored files, dependencies, builds, private environment settings, and Git metadata.\nNeon records and uploaded files stored in Neon are NOT included. Back up Neon separately.\n\nRestore: unzip, install Node.js 24+, run npm ci, copy .env.example to .env.local and configure your services, then run npm run build and npm run start.\n'),'BACKUP-README.txt');
  zip.end();
  return {buffer:await complete,fileCount:entries.length};
}
