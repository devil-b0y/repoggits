import { test, expect } from '@playwright/test';

test('pages and API responses carry the baseline security headers', async ({ request }) => {
  for (const path of ['/', '/api/health']) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['x-frame-options'], path).toBe('SAMEORIGIN');
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    const csp = headers['content-security-policy'] || '';
    for (const directive of ["frame-ancestors 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"]) expect(csp, path).toContain(directive);
  }
});
