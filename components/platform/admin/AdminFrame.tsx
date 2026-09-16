'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Shell, Gate, Notice, useSession } from '../shared';
import { ADMIN_NAV, canOpenSection, type AdminSection } from './nav';
import './admin-panel.css';

// Every admin panel page: the site shell, the reviewer gate, the section navigation and the page heading.
// A section the viewer lacks permission for shows a notice instead of its content; the API refuses it regardless.
export function AdminPage({section,title,description,actions,children}:{section:AdminSection;title:string;description?:string;actions?:ReactNode;children:ReactNode}) {
  return <Shell><Gate admin><Frame section={section} title={title} description={description} actions={actions}>{children}</Frame></Gate></Shell>;
}

function Frame({section,title,description,actions,children}:{section:AdminSection;title:string;description?:string;actions?:ReactNode;children:ReactNode}) {
  const {user}=useSession();
  const [open,setOpen]=useState(false);
  const visible=ADMIN_NAV.filter(entry=>canOpenSection(user,entry));
  const groups=[...new Set(visible.map(entry=>entry.group))];
  const current=ADMIN_NAV.find(entry=>entry.key===section);
  const allowed=!current||canOpenSection(user,current);
  return <div className="page-wrap admin-panel">
    <aside className="admin-sidebar">
      <button type="button" className="admin-menu-toggle" aria-expanded={open} aria-controls="admin-navigation" onClick={()=>setOpen(!open)}>{open?<X size={18} aria-hidden="true"/>:<Menu size={18} aria-hidden="true"/>}<span>Admin menu · {current?.label??title}</span></button>
      <nav id="admin-navigation" className={open?'admin-nav open':'admin-nav'} aria-label="Admin panel">
        {groups.map(group=><div key={group}><h2>{group}</h2><ul>{visible.filter(entry=>entry.group===group).map(entry=><li key={entry.key}><Link href={entry.href} aria-current={entry.key===section?'page':undefined} onClick={()=>setOpen(false)}><entry.icon size={16} aria-hidden="true"/>{entry.label}</Link></li>)}</ul></div>)}
      </nav>
    </aside>
    <div className="admin-main">
      <header className="admin-heading">
        <div><div className="eyebrow">ADMIN PANEL{current?` / ${current.group.toUpperCase()}`:''}</div><h1>{title}</h1>{description&&<p>{description}</p>}</div>
        {actions&&allowed&&<div className="admin-heading-actions">{actions}</div>}
      </header>
      {allowed?children:<Notice error>You do not have permission to open this part of the admin panel. A Super Admin can grant access from Review desk › People.</Notice>}
    </div>
  </div>;
}
