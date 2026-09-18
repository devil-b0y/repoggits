'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useParams } from 'next/navigation';
import { api } from './shared';
import { readConsent, CONSENT_EVENT } from './CookieConsent';

// Sends page views and heartbeats to POST /api/activity for Admin › Live monitoring, exactly like the on-page copy
// there describes: a heartbeat every 45 seconds while the tab is visible, and the presence window (120s) spans at
// least two of them. Mounted once from app/layout.tsx alongside ButtonMotion/CookieConsent, and renders nothing.
//
// Consent-gated for anonymous visitors only: nothing is sent for them — no visitor cookie, no beacon — until
// readConsent()?.analytics===true. That check happens fresh on every send, and CookieConsent.tsx broadcasts
// CONSENT_EVENT the instant the banner or preferences dialog writes a new choice, so accepting mid-session starts
// sending immediately and declining stops the very next tick, with no reload required either way.
//
// A signed-in visitor is different: their own account being active is account/security information for the admins
// who already run this platform, not third-party analytics, so it always sends regardless of the analytics cookie
// choice. This component doesn't have access to Shell's SessionContext (it is mounted at the root layout, outside
// any <Shell>), so it makes its own lightweight, one-time `auth/me` check per full page load to learn this.
const HEARTBEAT_MS = 45_000;
const PROJECT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function currentProjectId(params: ReturnType<typeof useParams>): string | null {
  const raw = params?.id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && PROJECT_ID_RE.test(value) ? value : null;
}

async function send(kind: 'pageview' | 'heartbeat', page: string, projectId: string | null, includeReferrer: boolean, authenticated: boolean) {
  if (!authenticated && readConsent()?.analytics !== true) return;
  try {
    const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const body = JSON.stringify({
      kind,
      page,
      ...(projectId ? { projectId } : {}),
      screen: { width: window.screen?.width || 0, height: window.screen?.height || 0 },
      pixelRatio: window.devicePixelRatio || 1,
      touch: coarsePointer || (navigator.maxTouchPoints || 0) > 0,
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      networkOnline: navigator.onLine,
      referrer: includeReferrer ? document.referrer.slice(0, 300) : '',
    });
    await fetch('/api/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' });
  } catch { /* tracking must never surface an error to the visitor */ }
}

export default function ActivityTracker() {
  const pathname = usePathname();
  const params = useParams();
  const projectId = currentProjectId(params);
  // document.referrer describes how the browser arrived at the app, not how it moved between client-side routes
  // afterward, so it is only worth sending once per full page load — the schema's `referrer` column is about how
  // the tracked session started, not a per-navigation value.
  const referrerSent = useRef(false);
  // null = not answered yet. Every send waits for this rather than guessing "not signed in", so an authenticated
  // visitor's very first beacon is never wrongly skipped by the anonymous consent gate while this is in flight.
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    api<{ user: unknown }>('auth/me')
      .then(data => { if (active) setAuthenticated(!!data.user); })
      .catch(() => { if (active) setAuthenticated(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (authenticated === null) return;
    const includeReferrer = !referrerSent.current;
    referrerSent.current = true;
    send('pageview', pathname || '/', projectId, includeReferrer, authenticated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, projectId, authenticated]);

  useEffect(() => {
    const onConsent = () => {
      if (authenticated || readConsent()?.analytics === true) {
        const includeReferrer = !referrerSent.current;
        referrerSent.current = true;
        send('pageview', window.location.pathname, projectId, includeReferrer, !!authenticated);
      }
    };
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, [projectId, authenticated]);

  useEffect(() => {
    if (authenticated === null) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = () => send('heartbeat', window.location.pathname, projectId, false, authenticated);
    const start = () => { if (!timer) timer = setInterval(beat, HEARTBEAT_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => { if (document.visibilityState === 'visible') start(); else stop(); };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [projectId, authenticated]);

  return null;
}
