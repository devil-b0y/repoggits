import Link from 'next/link';
import { Shell, PageTitle, Notice } from './shared';
import { openCookiePreferences } from './CookieConsent';

const LAST_UPDATED = 'September 17, 2026';

export default function Privacy() {
  return <Shell><div className="page-wrap">
    <PageTitle eyebrow="LEGAL" title="Privacy Policy" description={`Last updated: ${LAST_UPDATED}. This policy explains how repoggits collects, uses, and protects information handled through the website.`}/>

    <section className="detail-section"><h2>1. Introduction</h2><p>This Privacy Policy explains what information repoggits collects through this website, why it is collected, how it is used, and the choices available to you. It applies to everyone who visits, signs in to, or submits a project through repoggits.</p></section>

    <section className="detail-section"><h2>2. Information we collect</h2><p>Depending on how you use the website, we may collect:</p><ul><li>Your name and email address, when you create an account</li><li>Account and sign-in information, including your role and verification status</li><li>Project submission information, such as titles, descriptions, source code, documentation, screenshots, and related files</li><li>Team or member information you intentionally provide as part of a project, such as roll number, department, or college</li><li>Messages or requests you send to administrators</li><li>Basic technical information such as IP address and browser or device information, generated automatically by normal web traffic</li><li>Basic usage information about how the website is used</li><li>Cookies and similar technologies, as described in <a className="inline-link" href="#cookies">Section 7</a></li></ul></section>

    <section className="detail-section"><h2>3. Information provided by users</h2><p>You may voluntarily provide information when you create an account, contact an administrator, submit a project, request access to a project, request permission to use project materials, or report an issue. Please avoid including unnecessary sensitive personal information in anything you submit or send to us.</p></section>

    <section className="detail-section"><h2>4. How we use information</h2><p>Information we collect may be used to:</p><ul><li>Provide and maintain the website</li><li>Authenticate users and manage accounts</li><li>Review project submissions</li><li>Respond to messages and requests</li><li>Process project-access or usage-approval requests</li><li>Communicate with you about your account, project, or requests</li><li>Maintain website security and prevent abuse or unauthorized access</li><li>Improve website functionality</li><li>Analyze website usage, where applicable</li><li>Comply with applicable legal requirements</li></ul></section>

    <section className="detail-section"><h2>5. Project submission and academic information</h2><p>Project submissions may include student or team names, project descriptions, academic information such as department or college, documentation, source code, screenshots, and related materials. If you submit a project, you are responsible for making sure you have the appropriate permission to submit that material and any personal information it contains.</p></section>

    <section className="detail-section" id="project-access"><h2>6. Project access and external usage</h2>
      <Notice><strong>Project Usage &amp; Approval.</strong> Project materials available through this website are intended for authorized academic, educational, and repository purposes unless otherwise stated. Availability on the website does not automatically grant permission to copy, modify, redistribute, publish, commercially use, or deploy project materials outside the permitted context.</Notice>
      <p>Beyond viewing project materials within the repository:</p>
      <ul><li>Requests for external use may require administrator review</li><li>Source code or project files may require explicit approval before external use</li><li>An administrator may request information about the intended use before granting access</li><li>Permission may be limited to a specific purpose, person, project, or period</li><li>Approval to use a project does not transfer ownership or intellectual property rights</li></ul>
    </section>

    <section className="detail-section" id="cookies"><h2>7. Cookies</h2><p>We use cookies and similar technologies to run the website and, with your consent, to understand usage and remember preferences. Cookies fall into these categories:</p><ul><li><strong>Necessary cookies</strong> — required for sign-in, security, and core functionality. These cannot be turned off.</li><li><strong>Functional cookies</strong> — remember preferences such as your chosen theme.</li><li><strong>Analytics cookies</strong> — help us understand which pages and features are used, so we can improve the site.</li><li><strong>Marketing cookies</strong> — used for personalized advertising and marketing about repoggits and related projects.</li></ul><p>Optional cookies are only set according to the choices you make through the site&rsquo;s consent banner. You can review or change these choices at any time in our <Link className="inline-link" href="/cookies">Cookie Policy</Link>, or by <button type="button" className="text-button" onClick={openCookiePreferences}>managing your cookie preferences</button> now.</p></section>

    <section className="detail-section"><h2>8. Analytics and third-party services</h2><p>The website may rely on third-party services to operate, including hosting and database infrastructure, email delivery providers for account and notification messages, and an AI assistant used to help students draft project submissions. Where analytics are enabled, they help us understand aggregate usage of the site. Any third-party service we use processes information according to its own privacy policy, in addition to this one.</p></section>

    <section className="detail-section"><h2>9. How we protect information</h2><p>We apply reasonable security practices to protect information handled by the website, including access controls, authentication, secure communication, limited administrative access, and monitoring for unauthorized activity. No website can guarantee complete security, and we cannot promise that information will always be protected against every possible threat.</p></section>

    <section className="detail-section"><h2>10. Data retention</h2><p>We retain information only for as long as reasonably necessary for the purpose it was collected — including account management, project administration, security, legal obligations, and other legitimate operational needs.</p></section>

    <section className="detail-section"><h2>11. Data sharing</h2><p>We do not sell personal information to third parties. Information may be shared where necessary with authorized administrators, service providers required to operate the website, relevant project reviewers, or legal or regulatory authorities when required by law.</p></section>

    <section className="detail-section"><h2>12. Student and project information</h2><p>Information you intentionally include on a public project page, such as team names or project descriptions, may be visible to anyone who visits that page. Only submit information you are authorized to publish. If you need to request correction or removal of personal information from a project page, contact an administrator as described in <a className="inline-link" href="#contact">Section 17</a>.</p></section>

    <section className="detail-section"><h2>13. Intellectual property and privacy</h2><p>This Privacy Policy describes how information is handled — it does not grant permission to use project materials. Privacy rights and intellectual-property rights are separate matters. Being able to view a project does not mean you are permitted to reuse its source code or materials; see <a className="inline-link" href="#project-access">Section 6</a> and our <Link className="inline-link" href="/terms">Terms &amp; Conditions</Link>.</p></section>

    <section className="detail-section"><h2>14. Children&rsquo;s privacy</h2><p>repoggits is intended for use by college students, faculty, and reviewers in an academic context, and is not directed at children.</p></section>

    <section className="detail-section"><h2>15. User rights and requests</h2><p>You may contact an administrator regarding access to your personal information, correction of inaccurate information, removal or deletion requests where applicable, questions about how your data is handled, or other privacy concerns. We will respond to reasonable requests where applicable.</p></section>

    <section className="detail-section"><h2>16. Changes to this Privacy Policy</h2><p>We may update this Privacy Policy periodically. The latest version will always be published on this page, with the last updated date shown above.</p></section>

    <section className="detail-section" id="contact"><h2>17. Contact</h2><p>Questions about this Privacy Policy, or requests relating to your information, can be sent to the repoggits team through the contact details on your institution&rsquo;s portal. For website usage rules, see our <Link className="inline-link" href="/terms">Terms &amp; Conditions</Link>.</p></section>
  </div></Shell>;
}
