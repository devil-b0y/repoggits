'use client';
import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,Trash2} from 'lucide-react';
import {Notice,send} from '../shared';
import {Badge, DetailList} from './kit';
import {formatDateTime} from './format';
import {ROLE_LABELS} from './UsersPage';

// The Users list's Delete action: a native <dialog> (same pattern as AvatarEditor/MediaDetailPanel — showModal(),
// Escape via onCancel, focus trapped by the browser) showing who is about to be removed, an extra confirmation
// step for privileged accounts, and an optional reason. The backend (POST admin/users/delete in the catch-all
// route) re-checks everything shown here — role, self-delete, last-Super-Admin — so this dialog is UX, not the guard.

export type DeletableUser={id:string;name:string;email:string;role:string;createdAt:string};

export default function DeleteUserDialog({target,onClose,onDeleted}:{target:DeletableUser;onClose:()=>void;onDeleted:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [reason,setReason]=useState('');
  const [confirmedPrivileged,setConfirmedPrivileged]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const privileged=target.role!=='student';

  useEffect(()=>{const element=dialog.current;if(element&&!element.open)element.showModal();},[]);

  async function confirmDelete() {
    setBusy(true);setError('');
    try{await send('admin/users/delete',{id:target.id,reason:reason.trim()},'POST');onDeleted();}
    catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  }

  return <dialog ref={dialog} className="delete-user-dialog" aria-labelledby="delete-user-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <div className="delete-user-head">
      <h2 id="delete-user-title"><Trash2 size={18} aria-hidden="true"/> Delete User?</h2>
    </div>
    <p>You are about to delete this user account. This action may remove the user&rsquo;s access to the website and associated account data.</p>
    <DetailList items={[
      ['Name',target.name],['Email',target.email||'Unreadable'],
      ['Role',<Badge key="role" tone={privileged?'warn':'neutral'}>{ROLE_LABELS[target.role]??target.role}</Badge>],
      ['User ID',<code key="id">{target.id}</code>],['Joined',formatDateTime(target.createdAt)],
    ]}/>
    {privileged&&<div className="delete-user-warning">
      <p><AlertTriangle size={15} aria-hidden="true"/> {target.role==='superadmin'
        ? 'This account has Super Admin privileges. Deleting it may affect administrative access to this admin panel.'
        : 'This account has Teacher-Admin privileges and may hold review assignments. Deleting it may affect project reviews.'}</p>
      <label className="checkbox-label">
        <input type="checkbox" checked={confirmedPrivileged} onChange={e=>setConfirmedPrivileged(e.target.checked)} disabled={busy}/>
        I understand this account has administrative privileges and want to delete it anyway.
      </label>
    </div>}
    <label>Reason for deletion (optional)<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} rows={2} disabled={busy} placeholder="Shown only in the admin audit log"/></label>
    {error&&<Notice error>{error}</Notice>}
    <div className="delete-user-actions">
      <button type="button" className="button outline" disabled={busy} onClick={onClose}>Cancel</button>
      <button type="button" className="button outline delete-user-confirm" disabled={busy||(privileged&&!confirmedPrivileged)} onClick={confirmDelete}>
        {busy?'Deleting…':'Delete User'}
      </button>
    </div>
  </dialog>;
}
