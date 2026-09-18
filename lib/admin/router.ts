import type { NextRequest } from 'next/server';
import type { User } from '../schema';
import { overviewRoute } from './overview';
import { analyticsRoute } from './analytics';
import { liveRoute } from './live';
import { usersRoute } from './users';
import { sessionsRoute } from './sessions';
import { logsRoute } from './logs';
import { promptsRoute } from './prompts';
import { securityRoute } from './security';
import { auditRoute } from './audit';
import { systemRoute } from './system';
import { databaseRoute } from './database';
import { mediaRoute } from './media';

// /api/admin/<section>/… for the admin panel. The caller has already required a signed-in, verified, non-student
// account; each handler then checks its own permission (lib/admin/permissions.ts) before reading anything.
// `path` is everything after /api/admin, e.g. ['users','<id>'] for /api/admin/users/<id>.
export type AdminContext={request:NextRequest;user:User;method:string;path:string[];search:URLSearchParams};
export type AdminHandler=(context:AdminContext)=>Promise<Response>;

const sections:Record<string,AdminHandler>={overview:overviewRoute,analytics:analyticsRoute,live:liveRoute,users:usersRoute,sessions:sessionsRoute,logs:logsRoute,prompts:promptsRoute,security:securityRoute,audit:auditRoute,system:systemRoute,database:databaseRoute,media:mediaRoute};
export const adminSection=(name:string|undefined)=>name&&Object.hasOwn(sections,name)?sections[name]:undefined;
