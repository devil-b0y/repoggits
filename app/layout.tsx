import type { Metadata } from 'next';
import ButtonMotion from '@/components/platform/ButtonMotion';
import CookieConsent from '@/components/platform/CookieConsent';
import './globals.css';
export const metadata: Metadata = { title: 'Repoggits — Good ideas deserve to be built on.', description: 'A shared space for student projects. Explore software, hardware, and the ideas in between.' };
// The @font-face rules live in globals.css, which Next hashes and loads as part of the first
// paint, so the browser no longer fetches a second stylesheet before it can even discover the
// fonts. These two cuts carry the body copy and every above-the-fold heading, so they are
// preloaded rather than waiting on that CSS to parse; the rest arrive via font-display: swap.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><head><link rel="preload" href="/fonts/dm-sans-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /><link rel="preload" href="/fonts/space-grotesk-500.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /></head><body>{children}<ButtonMotion /><CookieConsent /></body></html>; }
