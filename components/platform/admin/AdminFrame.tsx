'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { Shell, Gate, Notice, useSession } from '../shared';
import { ADMIN_NAV, canOpenSection, type AdminSection } from './nav';
import AdminCommandPalette from './AdminCommandPalette';
import { ease } from '../MotionKit';
import { staggerGroup, tileRise, useAdminStill, useCollapse, useIsMobileNav } from './AdminMotion';
import './admin-panel.css';

// Every admin panel page: the site shell, the reviewer gate, the section navigation and the page heading.
// A section the viewer lacks permission for shows a notice instead of its content; the API refuses it regardless.
export function AdminPage({section,title,description,actions,children}:{section:AdminSection;title:string;description?:string;actions?:ReactNode;children:ReactNode}) {
  return <Shell><Gate admin><Frame section={section} title={title} description={description} actions={actions}>{children}</Frame></Gate></Shell>;
}

// There is no persistent admin layout — every /admin/* route is its own independent page, so Frame fully unmounts
// and remounts on every click between sections. Replaying the sidebar's entrance stagger and the heading reveal
// on every one of those reads as the whole panel reloading, not as a normal page change. This flag is remembered
// for the tab (not per Frame instance, the same way shared.tsx's sessionCache remembers the signed-in session
// across Shell remounts): the very first admin page this tab opens still gets the full reveal, every click after
// that renders straight into the settled state instead of fading/staggering in again.
let admittedAdminShellOnce=false;

function Frame({section,title,description,actions,children}:{section:AdminSection;title:string;description?:string;actions?:ReactNode;children:ReactNode}) {
  const {user}=useSession();
  const still=useAdminStill();
  // Separate from `still`: this only skips the mount reveal (desktop nav stagger + heading below), never the
  // mobile menu's own open/close slide, which should keep animating every time someone taps it regardless of
  // how many admin pages this tab has already visited.
  const skipEntrance=still||admittedAdminShellOnce;
  useEffect(()=>{admittedAdminShellOnce=true;},[]);
  const {mobile:isMobile,ready:navReady}=useIsMobileNav();
  const [open,setOpen]=useState(false);
  // Deferred, not `open` directly: on mobile the panel needs to stay classed "open" (CSS keeps it displayed) for
  // the whole length of its closing animation, or the collapse would be cut off the instant `open` flips.
  const {visible:navOpenClass,onExitComplete:navExitComplete}=useCollapse(open);
  const visible=ADMIN_NAV.filter(entry=>canOpenSection(user,entry));
  const groups=[...new Set(visible.map(entry=>entry.group))];
  const current=ADMIN_NAV.find(entry=>entry.key===section);
  const allowed=!current||canOpenSection(user,current);
  const navGroups=groups.map(group=><div key={group}><h2>{group}</h2><ul>{visible.filter(entry=>entry.group===group).map(entry=>
    <motion.li key={entry.key} variants={tileRise}>
      <Link className="admin-nav-link" href={entry.href} aria-current={entry.key===section?'page':undefined} onClick={()=>setOpen(false)}>
        {entry.key===section&&<motion.span className="admin-nav-indicator" layoutId="admin-nav-indicator" aria-hidden="true"/>}
        <entry.icon size={16} aria-hidden="true"/>{entry.label}
      </Link>
    </motion.li>)}</ul></div>);
  // Until we know whether this is the mobile breakpoint, render exactly what always shipped here (no motion
  // wrapper at all) rather than guess — guessing "desktop" and correcting a moment later would, on an actual
  // phone, animate the panel shut right after load as though a person had just closed it.
  const navContent=!navReady
    ? <>{navGroups}</>
    : isMobile
      ? <AnimatePresence initial={false} onExitComplete={navExitComplete}>
          {open&&<motion.div key="panel" className="admin-nav-groups" initial={still?false:{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} transition={{duration:still?0:.2,ease}}>
            <motion.div variants={staggerGroup} initial={still?false:'hidden'} animate="show">{navGroups}</motion.div>
          </motion.div>}
        </AnimatePresence>
      : <motion.div className="admin-nav-groups" variants={staggerGroup} initial={skipEntrance?false:'hidden'} animate="show">{navGroups}</motion.div>;
  return <div className="page-wrap admin-panel">
    <aside className="admin-sidebar">
      <button type="button" className="admin-menu-toggle" aria-expanded={open} aria-controls="admin-navigation" onClick={()=>setOpen(!open)}>{open?<X size={18} aria-hidden="true"/>:<Menu size={18} aria-hidden="true"/>}<span>Admin menu · {current?.label??title}</span></button>
      <nav id="admin-navigation" className={(navReady&&isMobile?navOpenClass:open)?'admin-nav open':'admin-nav'} aria-label="Admin panel">
        {navContent}
      </nav>
    </aside>
    <div className="admin-main">
      <header className="admin-heading">
        <motion.div variants={staggerGroup} initial={skipEntrance?false:'hidden'} animate="show">
          <motion.div className="eyebrow" variants={tileRise}>ADMIN PANEL{current?` / ${current.group.toUpperCase()}`:''}</motion.div>
          <motion.h1 variants={tileRise}>{title}</motion.h1>
          {description&&<motion.p variants={tileRise}>{description}</motion.p>}
        </motion.div>
        {actions&&allowed&&<div className="admin-heading-actions">{actions}</div>}
      </header>
      {allowed?children:<Notice error>You do not have permission to open this part of the admin panel. A Super Admin can grant access from Admin panel › Roles & permissions.</Notice>}
    </div>
    <AdminCommandPalette/>
  </div>;
}
