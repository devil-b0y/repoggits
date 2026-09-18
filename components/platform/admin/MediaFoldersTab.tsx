'use client';
import {useState} from 'react';
import {FolderPlus,Pencil,Trash2} from 'lucide-react';
import {Notice,send} from '../shared';
import {useAdminData} from './kit';

// Admin › Media Manager → Folders: create, rename, and delete folders (only when empty — the backend enforces this
// too, since a folder holding files can be renamed but never deleted underneath them).

type Folder={id:string;name:string;fileCount:number;createdAt:string};

export default function MediaFoldersTab() {
  const {data,error,loading,reload}=useAdminData<{folders:Folder[]}>('admin/media/folders');
  const [name,setName]=useState('');
  const [busy,setBusy]=useState(false);
  const [actionError,setActionError]=useState('');
  const [renaming,setRenaming]=useState<string|null>(null);
  const [renameValue,setRenameValue]=useState('');

  async function createFolder(event:React.FormEvent) {
    event.preventDefault();
    if(!name.trim())return;
    setBusy(true);setActionError('');
    try{await send('admin/media/folders',{name:name.trim()},'POST');setName('');reload();}
    catch(e){setActionError((e as Error).message);}
    finally{setBusy(false);}
  }
  async function rename(id:string) {
    if(!renameValue.trim())return;
    setBusy(true);setActionError('');
    try{await send('admin/media/folders',{id,name:renameValue.trim()},'PATCH');setRenaming(null);reload();}
    catch(e){setActionError((e as Error).message);}
    finally{setBusy(false);}
  }
  async function remove(id:string,fileCount:number) {
    if(fileCount>0){setActionError('Move or delete the files in this folder before deleting it.');return;}
    if(!confirm('Delete this empty folder?'))return;
    setBusy(true);setActionError('');
    try{await send('admin/media/folders',{id,delete:true},'PATCH');reload();}
    catch(e){setActionError((e as Error).message);}
    finally{setBusy(false);}
  }

  return <section className="panel media-folders">
    <h2>Folders</h2>
    <form className="media-folder-create" onSubmit={createFolder}>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="New folder name" maxLength={120} disabled={busy}/>
      <button type="submit" className="button outline" disabled={busy||!name.trim()}><FolderPlus size={14} aria-hidden="true"/> Create folder</button>
    </form>
    {(error||actionError)&&<Notice error>{error||actionError}</Notice>}
    {loading&&!data&&<p role="status">Loading folders…</p>}
    {data&&<ul className="media-folder-list">
      {data.folders.map(folder=><li key={folder.id}>
        {renaming===folder.id
          ?<><input value={renameValue} onChange={e=>setRenameValue(e.target.value)} maxLength={120}/><button type="button" className="text-button" onClick={()=>rename(folder.id)} disabled={busy}>Save</button><button type="button" className="text-button" onClick={()=>setRenaming(null)}>Cancel</button></>
          :<><span>{folder.name}</span><span className="muted">{folder.fileCount} file{folder.fileCount===1?'':'s'}</span>
            <button type="button" className="text-button" onClick={()=>{setRenaming(folder.id);setRenameValue(folder.name);}}><Pencil size={13} aria-hidden="true"/> Rename</button>
            <button type="button" className="text-button" onClick={()=>remove(folder.id,folder.fileCount)}><Trash2 size={13} aria-hidden="true"/> Delete</button></>}
      </li>)}
      {data.folders.length===0&&<li className="muted">No folders yet.</li>}
    </ul>}
  </section>;
}
