'use client';
import {useState} from 'react';
import {Download} from 'lucide-react';
import {Notice} from './shared';

export default function Backup(){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  async function download(){
    setBusy(true);setError('');setDone(false);
    try{
      const response=await fetch('/api/admin/backup',{method:'POST'});
      if(!response.ok){const result=await response.json();throw new Error(result.error||'Backup failed.');}
      const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
      link.href=url;link.download=`repoggits-website-${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setDone(true);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="panel"><h2>Website backup</h2><p>Download the website source, pages, public images and videos, tests, and setup files in one ZIP.</p><p>Excludes node_modules, build output, Git metadata, private environment files, and files excluded by .gitignore.</p><p><strong>Neon database records and uploaded project files stored in Neon are not included.</strong> Back up your database separately to preserve accounts and submissions.</p><button className="button blue" disabled={busy} onClick={()=>void download()}><Download size={17}/>{busy?'Preparing backup…':'Download website backup'}</button>{busy&&<p role="status">Preparing your ZIP. Keep this page open.</p>}{done&&<Notice>Your backup download has started. Restore instructions are inside the ZIP.</Notice>}{error&&<Notice error>{error}</Notice>}</section>;
}
