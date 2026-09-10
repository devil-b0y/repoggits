import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {websiteBackup} from '../lib/site-backup';
import {readArchive} from './helpers/read-archive';

test('website backup follows nested ignore rules and excludes credentials and dependencies',async()=>{
  const root=resolve('test-results',`backup-fixture-${randomUUID()}`);
  const files:Record<string,string>={
    'package.json':'{"name":"fixture"}','app/page.tsx':'export default function Page() {}',
    '.gitignore':'*.tmp\n.env*\n!.env.example\nignored/\n',
    '.env.local':'secret','.env.example':'DATABASE_URL=',
    'app/.gitignore':'hidden.txt\n!keep.tmp\n','app/hidden.txt':'hidden','app/keep.tmp':'keep',
    'app/omit.tmp':'omit','ignored/data.txt':'omit','node_modules/package/index.js':'omit',
    '.git/config':'omit','.next/server.js':'omit','.local/admin.txt':'omit','private.key':'omit',
    'public/cover.svg':'<svg/>',
  };
  for(const [name,body] of Object.entries(files)){await mkdir(dirname(resolve(root,name)),{recursive:true});await writeFile(resolve(root,name),body);}
  const contents=await readArchive((await websiteBackup(root)).buffer);
  expect([...contents.keys()].sort()).toEqual(['BACKUP-README.txt','repoggits/.env.example','repoggits/.gitignore','repoggits/app/.gitignore','repoggits/app/keep.tmp','repoggits/app/page.tsx','repoggits/package.json','repoggits/public/cover.svg'].sort());
  expect(contents.get('repoggits/app/keep.tmp')!.toString()).toBe('keep');
  expect(contents.get('BACKUP-README.txt')!.toString()).toContain('NOT included');
});
