import { BarChart3, ClipboardList, Database, FolderKanban, HeartPulse, Inbox, LayoutDashboard, MessageSquareText, MonitorSmartphone, Radio, ScrollText, Settings, ShieldAlert, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { hasPermission, type AdminPermission } from '@/lib/admin/permissions';
import type { User } from '@/lib/schema';

// The admin panel's sections. A link shows only to someone who can open it; the API enforces the same permission.
export type AdminSection='overview'|'live'|'analytics'|'users'|'sessions'|'projects'|'review'|'logs'|'prompts'|'security'|'audit'|'ai'|'system'|'database'|'settings';
export type AdminNavItem={key:AdminSection;label:string;href:string;icon:LucideIcon;group:string;permission?:AdminPermission;superadminOnly?:boolean};
const item=(group:string,entries:Omit<AdminNavItem,'group'>[])=>entries.map(entry=>({...entry,group}));
export const ADMIN_NAV:AdminNavItem[]=[
  ...item('Dashboard',[
    {key:'overview',label:'Overview',href:'/admin/overview',icon:LayoutDashboard,permission:'analytics'},
    {key:'live',label:'Live monitoring',href:'/admin/live',icon:Radio,permission:'live'},
    {key:'analytics',label:'Analytics',href:'/admin/analytics',icon:BarChart3,permission:'analytics'},
  ]),
  ...item('People',[
    {key:'users',label:'Users',href:'/admin/users',icon:Users,permission:'users'},
    {key:'sessions',label:'Sessions',href:'/admin/sessions',icon:MonitorSmartphone,permission:'sessions'},
  ]),
  ...item('Projects',[
    {key:'projects',label:'Project analytics',href:'/admin/projects',icon:FolderKanban,permission:'analytics'},
    {key:'review',label:'Review desk',href:'/admin',icon:Inbox},
  ]),
  ...item('Logs',[
    {key:'logs',label:'Global activity',href:'/admin/logs',icon:ScrollText,permission:'activity'},
    {key:'prompts',label:'Prompt logs',href:'/admin/logs/prompts',icon:MessageSquareText,permission:'prompts'},
    {key:'security',label:'Security logs',href:'/admin/logs/security',icon:ShieldAlert,permission:'security'},
    {key:'audit',label:'Admin audit log',href:'/admin/logs/audit',icon:ClipboardList,permission:'audit'},
  ]),
  ...item('Platform',[
    {key:'ai',label:'AI usage',href:'/admin/ai',icon:Sparkles,permission:'prompts'},
    {key:'system',label:'System health',href:'/admin/system',icon:HeartPulse,permission:'system'},
    {key:'database',label:'Database manager',href:'/admin/database',icon:Database,superadminOnly:true},
    {key:'settings',label:'Settings',href:'/admin/settings',icon:Settings,superadminOnly:true},
  ]),
];
type Viewer=Pick<User,'role'|'scopes'>|null|undefined;
export const canOpenSection=(user:Viewer,entry:AdminNavItem)=>!!user&&user.role!=='student'&&(entry.superadminOnly?user.role==='superadmin':!entry.permission||hasPermission(user,entry.permission));
/** Where the review desk's "Admin panel" link goes: the first section this person can open, or null for none. */
export const firstAdminHref=(user:Viewer)=>ADMIN_NAV.find(entry=>entry.permission&&canOpenSection(user,entry))?.href??null;
