import type { NextConfig } from 'next';

const config: NextConfig = {
  // Give development regression tests their own cache and lock directory.
  distDir: process.env.REPOGGITS_TEST_DIST || '.next',
  // Baseline security headers on every response, so they apply regardless of how this is
  // deployed (the VPS nginx/Caddy configs in deploy/ set a similar set for defense in depth,
  // but a deployment that skips those still gets these). The CSP below only sets directives that
  // don't affect scripts or styles; a script-src policy needs a per-request nonce for Next.js's
  // inline hydration payload and is not in place yet.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
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
