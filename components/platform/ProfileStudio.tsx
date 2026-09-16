'use client';
import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type FormEvent } from 'react';
import { Building2, Camera, Circle, CircleCheck, Github, GraduationCap, IdCard, ImagePlus, Link2, Linkedin, LoaderCircle, Mail, Pencil, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Shell, Gate, PageTitle, Notice, Logout, api, send, useData, useSession } from './shared';
import type { Role, User } from '@/lib/schema';
import './profile-studio.css';

// The photo editor is needed only once someone picks a photo, so its code is fetched then.
const AvatarEditor = dynamic(() => import('./AvatarEditor'));

type Fields = { name:string; rollNumber:string; batch:string; department:string; bio:string; github:string; linkedin:string };
const keys = ['name','rollNumber','batch','department','bio','github','linkedin'] as const;
const fieldsOf = (user:User):Fields => ({ name:user.name, rollNumber:user.profile.rollNumber||'', batch:user.profile.batch||'', department:user.profile.department||'', bio:user.profile.bio||'', github:user.profile.github||'', linkedin:user.profile.linkedin||'' });
const roleLabel:Record<Role,string> = { student:'Student', teacher:'Teacher-Admin', superadmin:'Super Admin' };
const MAX_PHOTO = 20*1024*1024;
const BIO_LIMIT = 1500;

// Accepts a pasted profile link or a bare username and returns the full HTTPS address the server requires.
function fullLink(kind:'github'|'linkedin', raw:string) {
  const value = raw.trim().replace(/^@/,'');
  if (!value || /^https?:\/\//i.test(value)) return value;
  if (/^(www\.)?(github|linkedin)\.com\//i.test(value)) return `https://${value}`;
  if (kind==='github' && /^[a-z\d][a-z\d-]{0,38}$/i.test(value)) return `https://github.com/${value}`;
  if (kind==='linkedin' && /^[\w-]{3,100}$/.test(value)) return `https://www.linkedin.com/in/${value}`;
  return value;
}
const initialsOf = (name:string) => name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase() || '?';

function ProfileStudio() {
  const { user, refresh, uploadsAvailable } = useSession();
  const settings = useData<{ categories?:{ departments?:string[] } }>('settings');
  const [fields,setFields] = useState<Fields>(() => user ? fieldsOf(user) : { name:'', rollNumber:'', batch:'', department:'', bio:'', github:'', linkedin:'' });
  const [message,setMessage] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false), [savedOnce,setSavedOnce] = useState(false);
  const [editing,setEditing] = useState<Blob|string|null>(null), [photoBusy,setPhotoBusy] = useState(false), [photoError,setPhotoError] = useState(''), [dropping,setDropping] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const saved = user ? fieldsOf(user) : fields;
  const dirty = keys.some(key => fields[key] !== saved[key]);
  useEffect(() => {
    if (!dirty && !photoBusy) return;
    const warn = (event:BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, photoBusy]);
  if (!user) return null;

  const avatar = user.profile.avatarId;
  const displayName = fields.name.trim() || user.name;
  const set = (key:keyof Fields) => (event:{ target:{ value:string } }) => setFields(current => ({ ...current, [key]:event.target.value }));
  const tidyLink = (key:'github'|'linkedin') => () => setFields(current => ({ ...current, [key]:fullLink(key, current[key]) }));
  const checklist = [
    { id:'photo', label:'Add a profile photo', done:!!avatar },
    { id:'rollNumber', label:'Add your student ID', done:!!fields.rollNumber.trim() },
    { id:'batch', label:'Add your batch or year', done:!!fields.batch.trim() },
    { id:'department', label:'Add your department', done:!!fields.department.trim() },
    { id:'bio', label:'Write a short bio', done:!!fields.bio.trim() },
    { id:'github', label:'Link your GitHub', done:!!fields.github.trim() },
    { id:'linkedin', label:'Link your LinkedIn', done:!!fields.linkedin.trim() },
  ];
  const strength = Math.round(checklist.filter(item => item.done).length / checklist.length * 100);
  const links = ([['github','GitHub',Github],['linkedin','LinkedIn',Linkedin]] as const).filter(([key]) => /^https?:\/\/\S+$/i.test(fields[key]));
  const departments = settings.data?.categories?.departments || [];
  const status = busy ? 'Saving…' : dirty ? 'You have unsaved changes' : savedOnce ? 'All changes saved' : 'Everything is up to date';

  const clearNotices = () => { setError(''); setMessage(''); setPhotoError(''); };
  const choosePhoto = () => picker.current?.click();
  const focusItem = (id:string) => {
    if (id==='photo') return choosePhoto();
    const field = document.getElementById(`profile-${id}`);
    field?.scrollIntoView({ behavior:'smooth', block:'center' });
    field?.focus({ preventScroll:true });
  };
  const openPhoto = (file:File|undefined) => {
    clearNotices();
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) return setError('Choose a PNG, JPEG, or WebP image.');
    if (file.size > MAX_PHOTO) return setError('The maximum file size is 20 MB.');
    setEditing(file);
  };
  // A photo change is saved on its own against the last saved details, so unsaved form edits stay pending.
  const savePhoto = async (photo:Blob) => {
    setPhotoBusy(true); setPhotoError('');
    try {
      const uploaded = await api<{ id:string }>('upload', { method:'POST', body:photo, headers:{ 'Content-Type':'application/octet-stream', 'X-Filename':`profile-photo.${photo.type==='image/webp'?'webp':'png'}` } });
      await send('auth/profile', { ...fieldsOf(user), avatarId:uploaded.id }, 'PATCH');
      await refresh();
      setEditing(null); setMessage('Profile photo saved.');
    } catch (e) { setPhotoError((e as Error).message); } finally { setPhotoBusy(false); }
  };
  const removePhoto = async () => {
    setPhotoBusy(true); clearNotices();
    try { await send('auth/profile', { ...fieldsOf(user), avatarId:'' }, 'PATCH'); await refresh(); setMessage('Profile photo removed.'); }
    catch (e) { setError((e as Error).message); } finally { setPhotoBusy(false); }
  };
  const save = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = { ...fields, github:fullLink('github', fields.github), linkedin:fullLink('linkedin', fields.linkedin) };
    for (const key of keys) next[key] = next[key].trim();
    setFields(next); setBusy(true); clearNotices();
    try { await send('auth/profile', { ...next, avatarId:avatar }, 'PATCH'); await refresh(); setSavedOnce(true); setMessage('Profile saved.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const drag = (event:DragEvent<HTMLElement>) => {
    if (!uploadsAvailable || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    if (event.type==='dragleave' && event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDropping(event.type!=='dragleave');
  };

  return <div className="page-wrap profile-page profile-studio">
    <PageTitle eyebrow="THE PERSON BEHIND THE PROJECTS" title="Make it yours." description="Your photo, your story, and where to find your work, shaped the way you want it." action={<Logout/>}/>
    {message && <Notice>{message}</Notice>}
    {error && <Notice error>{error}</Notice>}
    <div className="profile-studio-grid">
      <aside className={`profile-card${dropping?' dropping':''}`} aria-label="Profile preview" onDragEnter={drag} onDragOver={drag} onDragLeave={drag}
        onDrop={event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); setDropping(false); openPhoto(event.dataTransfer.files[0]); }}>
        <div className="profile-card-cover" aria-hidden="true"><span>MAKER ID</span><span>{roleLabel[user.role].toUpperCase()}</span></div>
        <div className="profile-avatar" style={{ '--strength':`${strength}%` } as CSSProperties}>
          <div className="profile-avatar-ring">
            {avatar ? <img src={`/api/files/${avatar}`} alt={`${displayName} profile photo`}/> : <span className="profile-initials" aria-hidden="true">{initialsOf(displayName)}</span>}
          </div>
          <button type="button" className="profile-avatar-button" aria-label={avatar?'Change profile photo':'Add profile photo'} disabled={!uploadsAvailable||photoBusy} onClick={choosePhoto}>
            {photoBusy ? <LoaderCircle size={18} className="profile-spin"/> : <Camera size={18}/>}
          </button>
          <input ref={picker} type="file" hidden aria-label="Choose a profile photo" accept="image/png,image/jpeg,image/webp" onChange={event => { openPhoto(event.target.files?.[0]); event.target.value=''; }}/>
        </div>
        <p className="profile-hello" aria-hidden="true">hello, I&apos;m</p>
        <h2 className="profile-card-name">{displayName}</h2>
        <span className={`profile-role ${user.role}`}><ShieldCheck size={13}/>{roleLabel[user.role]}</span>
        <ul className="profile-facts">
          <li><Mail size={15}/><span>{user.email}</span></li>
          {fields.department.trim() && <li><Building2 size={15}/><span>{fields.department}</span></li>}
          {(fields.batch.trim() || fields.rollNumber.trim()) && <li><GraduationCap size={15}/><span>{[fields.batch.trim()&&`Batch ${fields.batch.trim()}`, fields.rollNumber.trim()&&`ID ${fields.rollNumber.trim()}`].filter(Boolean).join(' · ')}</span></li>}
        </ul>
        {fields.bio.trim() && <p className="profile-card-bio">{fields.bio}</p>}
        {links.length > 0 && <div className="profile-card-links">{links.map(([key,label,Icon]) => <a key={key} href={fields[key]} target="_blank" rel="noopener noreferrer"><Icon size={15}/>{label}</a>)}</div>}
        {user.role!=='student' && <div className="profile-scope"><span>Review scope</span><div>{user.role==='superadmin' ? <em>Every department</em> : user.scopes.length ? user.scopes.map(scope => <em key={scope}>{scope.replace(':',': ')}</em>) : <em>Not assigned yet</em>}</div></div>}
        <div className="profile-photo-actions">
          {avatar ? <>
            <button type="button" className="text-button" disabled={!uploadsAvailable||photoBusy} onClick={() => { clearNotices(); setEditing(`/api/files/${avatar}`); }}><Pencil size={15}/> Adjust photo</button>
            <button type="button" className="text-button" disabled={photoBusy} onClick={() => void removePhoto()}><Trash2 size={15}/> Remove photo</button>
          </> : <button type="button" className="text-button" disabled={!uploadsAvailable||photoBusy} onClick={choosePhoto}><ImagePlus size={15}/> Upload photo</button>}
        </div>
        <p className="profile-drop-hint">{uploadsAvailable ? 'Tip: drop an image anywhere on this card.' : 'Photo uploads are unavailable right now.'}</p>
        <div className="profile-strength">
          <div className="profile-strength-head"><span>Profile strength</span><strong>{strength}%</strong></div>
          <div className="profile-strength-bar" role="progressbar" aria-label="Profile strength" aria-valuemin={0} aria-valuemax={100} aria-valuenow={strength}><span style={{ width:`${strength}%` }}/></div>
          {strength===100
            ? <p className="profile-complete"><Sparkles size={15}/> Your profile is complete. Nice work.</p>
            : <ul className="profile-checklist">{checklist.map(item => <li key={item.id} className={item.done?'done':''}>{item.done ? <span><CircleCheck size={16}/>{item.label}</span> : <button type="button" onClick={() => focusItem(item.id)}><Circle size={16}/>{item.label}</button>}</li>)}</ul>}
        </div>
      </aside>

      <form className="profile-form" onSubmit={save}>
        <section className="panel profile-section">
          <div className="profile-section-head"><span className="profile-section-icon"><IdCard size={20}/></span><div><h2>The basics</h2><p>How classmates and reviewers will recognise you.</p></div></div>
          <label>Full name<input id="profile-name" value={fields.name} onChange={set('name')} required minLength={2} maxLength={100} autoComplete="name"/></label>
          <div className="form-row">
            <label>Roll number / student ID<input id="profile-rollNumber" value={fields.rollNumber} onChange={set('rollNumber')} maxLength={60} placeholder="e.g. 22CS042"/></label>
            <label>Batch / year<input id="profile-batch" value={fields.batch} onChange={set('batch')} maxLength={30} placeholder="e.g. 2022–2026"/></label>
          </div>
          <label>Department<input id="profile-department" value={fields.department} onChange={set('department')} maxLength={100} list="profile-departments" placeholder="Start typing to see suggestions"/></label>
          <datalist id="profile-departments">{departments.map(department => <option key={department} value={department}/>)}</datalist>
        </section>

        <section className="panel profile-section">
          <div className="profile-section-head"><span className="profile-section-icon orange"><Sparkles size={20}/></span><div><h2>Your story</h2><p>A few lines about what you build and what you are curious about.</p></div></div>
          <label>Bio<textarea id="profile-bio" value={fields.bio} onChange={set('bio')} rows={5} maxLength={BIO_LIMIT} placeholder="I like turning messy campus problems into small, useful tools…"/></label>
          <div className="profile-bio-meta"><small>Keep it short and friendly.</small><small className={fields.bio.length > BIO_LIMIT-100 ? 'near-limit' : ''}>{fields.bio.length} / {BIO_LIMIT}</small></div>
        </section>

        <section className="panel profile-section">
          <div className="profile-section-head"><span className="profile-section-icon"><Link2 size={20}/></span><div><h2>Find my work</h2><p>Paste a link or just your username. We fill in the rest.</p></div></div>
          <div className="form-row">
            <label>GitHub profile<span className="profile-input-icon"><Github size={16}/><input id="profile-github" inputMode="url" value={fields.github} onChange={set('github')} onBlur={tidyLink('github')} maxLength={2000} placeholder="github.com/username"/></span></label>
            <label>LinkedIn profile<span className="profile-input-icon"><Linkedin size={16}/><input id="profile-linkedin" inputMode="url" value={fields.linkedin} onChange={set('linkedin')} onBlur={tidyLink('linkedin')} maxLength={2000} placeholder="linkedin.com/in/username"/></span></label>
          </div>
        </section>

        <div className={`profile-savebar${dirty?' dirty':''}`}>
          <span className="profile-savebar-status" role="status">{status}</span>
          <div className="profile-savebar-actions">
            {dirty && !busy && <button type="button" className="text-button" onClick={() => { setFields(saved); clearNotices(); }}>Discard</button>}
            <button className="button blue" disabled={busy||!dirty}>{busy?'Saving…':'Save profile'}</button>
          </div>
        </div>
      </form>
    </div>
    {editing && <AvatarEditor source={editing} busy={photoBusy} error={photoError} onCancel={() => { if (!photoBusy) { setEditing(null); setPhotoError(''); } }} onSave={photo => void savePhoto(photo)}/>}
  </div>;
}

export function Account() { return <Shell><Gate><ProfileStudio/></Gate></Shell>; }
