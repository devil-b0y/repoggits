import type { NextConfig } from 'next';

const config: NextConfig = {
  // Give development regression tests their own cache and lock directory.
  distDir: process.env.REPOGGITS_TEST_DIST || '.next',
  // Baseline security headers on every response, so they apply regardless of how this is
  // deployed (the VPS nginx/Caddy configs in deploy/ set a similar set for defense in depth,
  // but a deployment that skips those still gets these). No Content-Security-Policy here yet —
  // Next.js's own hydration payload needs care (inline script allowances or a nonce) to add one
  // without breaking the app; that's tracked separately rather than shipped half-verified.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // Ignored by browsers on a plain-HTTP response, so this is safe for local/dev use too.
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
      ],
    }];
  },
};

export default config;
