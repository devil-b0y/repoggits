import type { User } from '../schema';
import { requireCondition } from '../errors';

// What each part of the admin panel requires. Super Admins hold every permission; a Super Admin can grant a
// Teacher-Admin individual ones as `permission:<name>` entries alongside their review assignments; students hold none.
// Used by the API (requirePermission) and by the admin pages (hasPermission) to hide what the viewer cannot open.
export const ADMIN_PERMISSIONS={
  analytics:'Dashboards and analytics',
  live:'Live monitoring',
  users:'User directory and user activity',
  sessions:'Sessions, including ending one',
  activity:'Global activity logs',
  prompts:'Prompt logs (details, not prompt text)',
  prompt_content:'Read prompt text',
  network:'IP addresses and IP history',
  security:'Security logs',
  audit:'Admin audit log',
  system:'System health and data retention',
} as const;
export type AdminPermission=keyof typeof ADMIN_PERMISSIONS;
export const PERMISSION_NAMES=Object.keys(ADMIN_PERMISSIONS) as AdminPermission[];
type Holder=Pick<User,'role'|'scopes'>|null|undefined;

export function hasPermission(user:Holder,permission:AdminPermission) {
  if(!user)return false;
  return user.role==='superadmin'||user.role==='teacher'&&user.scopes.includes(`permission:${permission}`);
}
export const permissionsOf=(user:Holder)=>PERMISSION_NAMES.filter(permission=>hasPermission(user,permission));
export const hasAnyAdminPermission=(user:Holder)=>PERMISSION_NAMES.some(permission=>hasPermission(user,permission));
export function requirePermission(user:Holder,permission:AdminPermission) {
  requireCondition(hasPermission(user,permission),403,'You do not have permission to open this part of the admin panel.');
}
