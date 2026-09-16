import Link from 'next/link';
import { Shell, PageTitle } from './shared';

export default function Privacy() {
  return <Shell><div className="page-wrap">
    <PageTitle eyebrow="LEGAL" title="Privacy Policy" description="How repoggits collects, uses, and protects your information."/>
    <section className="detail-section"><h2>What we collect</h2><p>When you create an account we store your name, email address, and the projects, comments, and preferences you add. When you browse without an account we still process the minimum technical data needed to serve the site, such as request logs.</p></section>
    <section className="detail-section"><h2>How we use it</h2><p>Account data lets you sign in, submit and review projects, and pick up your saved work later. With your consent we also use cookies to understand how the site is used and to remember your preferences — see our <Link className="inline-link" href="/cookies">Cookie Policy</Link> for details.</p></section>
    <section className="detail-section"><h2>Your choices</h2><p>You can update or delete your account from your profile at any time, and you can change your cookie preferences whenever you like from the Cookie Settings link in the footer.</p></section>
    <section className="detail-section"><h2>Contact</h2><p>Questions about this policy can be sent to the repoggits team through the contact details on your institution's portal.</p></section>
  </div></Shell>;
}
