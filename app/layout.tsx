import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Repoggits — Good ideas deserve to be built on.', description: 'A shared space for student projects. Explore software, hardware, and the ideas in between.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><head><link rel="stylesheet" href="/fonts/fonts.css" /></head><body>{children}</body></html>; }
