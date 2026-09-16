import type { NextRequest } from 'next/server';
import type { EventType } from '../admin/types';

// Placeholder implementations; the tracking workstream replaces the bodies and keeps these signatures.

export type TrackEvent={type:EventType;request?:NextRequest|null;userId?:string|null;projectId?:string|null;promptId?:string|null;status?:'success'|'failure';page?:string;metadata?:Record<string,string|number|boolean|null>};
export type SessionEndReason='logout'|'expired'|'revoked'|'password_reset'|'inactive'|'signed_in';

/** Records one activity event. Never throws, so tracking cannot break the action it records. Resolves to the event id, or null when nothing was stored. */
export async function recordEvent(_event:TrackEvent):Promise<string|null> {return null;}
/** POST /api/activity: page views, heartbeats and searches sent by the browser tracker. */
export async function activityRoute(_request:NextRequest):Promise<Response> {return new Response(null,{status:204});}
/** Starts the tracked session for a sign-in that has just created the auth session with hash `sessionHash`. */
export async function startTrackedSession(_request:NextRequest,_userId:string,_sessionHash:string):Promise<string|null> {return null;}
/** Ends open tracked sessions: one by id, the one behind an auth session hash, or all of a user's. */
export async function endTrackedSessions(_target:{sessionId?:string;sessionHash?:string;userId?:string},_reason:SessionEndReason):Promise<void> {}
/** Counts one API response for System health. Synchronous and cheap; written in the background. */
export function recordApiRequest(_resource:string|undefined,_status:number):void {}
/** Keeps a 5xx failure for System health: method, path, status and error name, never the request body. */
export function recordServerError(_request:NextRequest,_error:unknown,_status:number):void {}
/** The client address according to TRUSTED_PROXY_HOPS, or '' when it cannot be determined. */
export function clientIp(_request:NextRequest):string {return '';}
export type PruneResult={events:number;sessions:number;visitors:number;apiUsage:number;errors:number};
/** Deletes tracked data older than the retention settings and ends stale sessions. Also runs on its own at most every few minutes. */
export async function pruneTrackingData():Promise<PruneResult> {return {events:0,sessions:0,visitors:0,apiUsage:0,errors:0};}
