'use client';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { Cookie, ShieldCheck, BarChart3, Settings2, Megaphone, X } from 'lucide-react';
import './cookie-consent.css';

type Prefs = { analytics: boolean; functional: boolean; marketing: boolean };
type Consent = Prefs & { updatedAt: string };
const STORAGE_KEY = 'repoggits-cookie-consent';
const OPEN_EVENT = 'repoggits:cookie-preferences';
const DECLINED: Prefs = { analytics: false, functional: false, marketing: false };

// Read-only helper for gating optional scripts elsewhere in the app, e.g. `if (readConsent()?.analytics) {...}`.
export function readConsent(): Consent | null {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as Consent : null; } catch { return null; }
}
function writeConsent(prefs: Prefs): Consent {
  const consent: Consent = { ...prefs, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(consent)); } catch {}
  return consent;
}
// The footer's "Cookie Settings" link calls this to reopen the panel from anywhere in the tree.
export function openCookiePreferences() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_EVENT)); }

const CATEGORIES: { key: keyof Prefs; icon: ComponentType<{ size?: number }>; title: string; description: string }[] = [
  { key: 'analytics', icon: BarChart3, title: 'Analytics cookies', description: 'Help us understand website traffic and usage so we can improve the experience.' },
  { key: 'functional', icon: Settings2, title: 'Functional cookies', description: 'Remember your preferences and improve functionality across visits.' },
  { key: 'marketing', icon: Megaphone, title: 'Marketing cookies', description: 'Used for personalized advertising and marketing.' },
];

// Shell defaults to its light theme and ProductHome defaults to dark, so guessing from the stored
// preference alone picks the wrong one on whichever page didn't just write it. Reading the class each
// shell actually applied to the DOM matches the page underneath regardless of that default.
function isDark() { return typeof document !== 'undefined' && !!document.querySelector('.platform.dark, .ph-home.ph-dark'); }

export default function CookieConsent() {
  const [banner, setBanner] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DECLINED);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(isDark());
    const existing = readConsent();
    if (existing) setPrefs({ analytics: existing.analytics, functional: existing.functional, marketing: existing.marketing });
    else setBanner(true);
    const openPanel = () => { setDark(isDark()); setPanelOpen(true); };
    const syncTheme = (event: StorageEvent) => { if (event.key === 'repoggits-theme') setDark(isDark()); };
    window.addEventListener(OPEN_EVENT, openPanel);
    window.addEventListener('storage', syncTheme);
    return () => { window.removeEventListener(OPEN_EVENT, openPanel); window.removeEventListener('storage', syncTheme); };
  }, []);

  function acceptAll() { setPrefs({ analytics: true, functional: true, marketing: true }); writeConsent({ analytics: true, functional: true, marketing: true }); setBanner(false); setPanelOpen(false); }
  function rejectNonEssential() { setPrefs(DECLINED); writeConsent(DECLINED); setBanner(false); setPanelOpen(false); }
  function savePreferences(next: Prefs) { setPrefs(next); writeConsent(next); setBanner(false); setPanelOpen(false); }

  return <>
    {banner && !panelOpen && <div className={`cookie-banner${dark ? ' cookie-dark' : ''}`} role="region" aria-label="Cookie consent">
      <div className="cookie-banner-copy">
        <Cookie size={22} aria-hidden="true"/>
        <div>
          <strong>We use cookies</strong>
          <p>We use cookies to provide essential site functionality, improve your experience, and understand how repoggits is used. Read our <Link href="/privacy" className="inline-link">Privacy Policy</Link> and <Link href="/cookies" className="inline-link">Cookie Policy</Link>.</p>
        </div>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" className="button outline" onClick={rejectNonEssential}>Reject non-essential</button>
        <button type="button" className="button outline" onClick={() => setPanelOpen(true)}>Customize cookies</button>
        <button type="button" className="button blue" onClick={acceptAll}>Accept all</button>
      </div>
    </div>}
    {panelOpen && <CookiePreferencesDialog initial={prefs} dark={dark} onClose={() => setPanelOpen(false)} onAcceptAll={acceptAll} onSave={savePreferences}/>}
  </>;
}

function CookiePreferencesDialog({ initial, dark, onClose, onAcceptAll, onSave }:{ initial: Prefs; dark: boolean; onClose: () => void; onAcceptAll: () => void; onSave: (prefs: Prefs) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [prefs, setPrefs] = useState<Prefs>(initial);
  useEffect(() => { const element = dialog.current; if (element && !element.open) element.showModal(); }, []);
  return <dialog ref={dialog} className={`cookie-dialog${dark ? ' cookie-dark' : ''}`} aria-labelledby="cookie-preferences-title" onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <div className="dialog-inner">
      <button type="button" className="dialog-close icon-button" aria-label="Close cookie preferences" onClick={() => dialog.current?.close()}><X size={18}/></button>
      <div className="eyebrow">COOKIE PREFERENCES</div>
      <h2 id="cookie-preferences-title">Manage your cookies</h2>
      <p className="cookie-dialog-intro">Choose which optional cookies repoggits can use. Necessary cookies keep the site working and can&apos;t be turned off. You can change these choices at any time from the Cookie Settings link in the footer.</p>
      <ul className="cookie-categories">
        <li className="cookie-category">
          <ShieldCheck size={20} aria-hidden="true"/>
          <div><strong>Necessary cookies</strong><p>Required for sign-in, security, and core functionality. Always active.</p></div>
          <span className="cookie-locked">Always on</span>
        </li>
        {CATEGORIES.map(({ key, icon: Icon, title, description }) => (
          <li className="cookie-category" key={key}>
            <Icon size={20}/>
            <div><strong>{title}</strong><p>{description}</p></div>
            <button type="button" role="switch" aria-checked={prefs[key]} aria-label={title} className={`cookie-switch${prefs[key] ? ' on' : ''}`} onClick={() => setPrefs(current => ({ ...current, [key]: !current[key] }))}><span className="cookie-switch-knob"/></button>
          </li>
        ))}
      </ul>
      <div className="cookie-dialog-actions">
        <button type="button" className="button outline" onClick={() => onSave(prefs)}>Save preferences</button>
        <button type="button" className="button blue" onClick={onAcceptAll}>Accept all</button>
      </div>
    </div>
  </dialog>;
}
