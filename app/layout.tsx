import type { Metadata } from 'next';
import ButtonMotion from '@/components/platform/ButtonMotion';
import CookieConsent from '@/components/platform/CookieConsent';
import ActivityTracker from '@/components/platform/ActivityTracker';
import './globals.css';
export const metadata: Metadata = { title: 'Reppo GGITS — Good ideas deserve to be built on.', description: 'A shared space for student projects. Explore software, hardware, and the ideas in between.' };
// The @font-face rules live in globals.css, which Next hashes and loads as part of the first
// paint, so the browser no longer fetches a second stylesheet before it can even discover the
// fonts. These two cuts carry the body copy and every above-the-fold heading, so they are
// preloaded rather than waiting on that CSS to parse; the rest arrive via font-display: swap.
// globals.css sets `scroll-behavior:smooth` so in-page anchors glide to their target. Next 16 no longer
// overrides that during a route change on its own (it did up to 15): without this attribute, every
// client-side navigation animates a scroll from wherever you were all the way back to the top — seconds of
// whooshing on a long page. `data-scroll-behavior="smooth"` is how Next 16 is told to suppress the smooth
// behaviour for its own navigation scroll only, so route changes land at the top instantly while anchor
// links stay smooth. See node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" data-scroll-behavior="smooth"><head><link rel="preload" href="/fonts/dm-sans-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /><link rel="preload" href="/fonts/space-grotesk-500.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /></head><body>{children}<ButtonMotion /><CookieConsent /><ActivityTracker /></body></html>; }
