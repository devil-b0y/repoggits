'use client';
import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,Trash2} from 'lucide-react';
import {Notice,send} from '../shared';
import {Badge, DetailList} from './kit';
import {formatDateTime} from './format';
import {STATUS_LABELS} from './LibraryPage';

// The Review desk / Project library's Delete action: same native <dialog> pattern as DeleteUserDialog and Media
// Manager's detail panel (showModal(), Escape via onCancel, browser-native focus trap). Deleting a project uses
// the app's existing soft-delete (r.projects.archived, already excluded from every public listing) — this dialog
// is UX around that existing flag, not a new deletion mechanism. The backend (POST admin/projects/delete) re-checks
// review authorization itself, so this dialog is a confirmation step, not the guard.

export type DeletableProject={id:string;title:string;team:string;status:string;createdAt:string};

export default function DeleteProjectDialog({target,onClose,onDeleted}:{target:DeletableProject;onClose:()=>void;onDeleted:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{const element=dialog.current;if(element&&!element.open)element.showModal();},[]);

  async function confirmDelete() {
    setBusy(true);setError('');
    try{await send('admin/projects/delete',{id:target.id,reason:reason.trim()},'POST');onDeleted();}
    catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  }

  return <dialog ref={dialog} className="delete-user-dialog" aria-labelledby="delete-project-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <div className="delete-user-head">
      <h2 id="delete-project-title"><Trash2 size={18} aria-hidden="true"/> Delete Project?</h2>
    </div>
    <p>This action will remove this project from the review system. Please confirm that you want to continue.</p>
    <DetailList items={[
      ['Project title',target.title],['Owner/team',target.team],
      ['Status',<Badge key="status" tone="neutral">{STATUS_LABELS[target.status]??target.status}</Badge>],
      ['Submitted',formatDateTime(target.createdAt)],
    ]}/>
    <div className="delete-user-warning">
      <p><AlertTriangle size={15} aria-hidden="true"/> The project is removed from public listings and the review queue. Its submission record, review history, media and audit log are preserved and can be restored later from Archived projects.</p>
    </div>
    <label>Reason for deletion (optional)<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} rows={2} disabled={busy} placeholder="Shown only in the admin audit log"/></label>
    {error&&<Notice error>{error}</Notice>}
    <div className="delete-user-actions">
      <button type="button" className="button outline" disabled={busy} onClick={onClose}>Cancel</button>
      <button type="button" className="button outline delete-user-confirm" disabled={busy} onClick={confirmDelete}>
        {busy?'Deleting…':'Delete Project'}
      </button>
    </div>
  </dialog>;
}
