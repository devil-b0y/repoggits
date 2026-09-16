'use client';
import { Shell, PageTitle } from './shared';
import { openCookiePreferences } from './CookieConsent';

const CATEGORIES = [
  { title: 'Necessary cookies', description: 'Keep you signed in, remember security settings, and let core features like submitting a project work. These cannot be turned off.' },
  { title: 'Analytics cookies', description: 'Help us understand which pages and features are used, so we can improve the site.' },
  { title: 'Functional cookies', description: 'Remember preferences such as your chosen theme, so you don’t have to set them again.' },
  { title: 'Marketing cookies', description: 'Used for personalized advertising and marketing about repoggits and related projects.' },
];

export default function CookiePolicy() {
  return <Shell><div className="page-wrap">
    <PageTitle eyebrow="LEGAL" title="Cookie Policy" description="What cookies repoggits uses and how to control them." action={<button type="button" className="button outline" onClick={openCookiePreferences}>Manage cookie preferences</button>}/>
    <section className="detail-section"><h2>What are cookies</h2><p>Cookies are small pieces of data stored in your browser. We use them, and similar local storage, to run the site and, with your consent, to understand usage and remember preferences.</p></section>
    {CATEGORIES.map(category => <section className="detail-section" key={category.title}><h3>{category.title}</h3><p>{category.description}</p></section>)}
    <section className="detail-section"><h2>Managing your choices</h2><p>Use the &ldquo;Manage cookie preferences&rdquo; button above, or the Cookie Settings link in the footer of any page, to accept, reject, or customize optional cookies at any time.</p></section>
  </div></Shell>;
}
