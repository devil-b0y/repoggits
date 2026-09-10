import { defineConfig } from '@playwright/test';

const externalServer = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalServer || 'http://127.0.0.1:3107';
process.loadEnvFile('.env.local');
process.env.APP_ORIGIN=baseURL;
process.env.MAIL_MODE='outbox';
process.env.EMAIL_VERIFICATION_REQUIRED='false';
process.env.CLAMD_HOST='';
process.env.REPOGGITS_DB_SCHEMA ||= `repoggits_test_${process.pid}`;

export default defineConfig({
  testDir: './tests',
  outputDir:'test-results/e2e',
  testIgnore: '**/development/**',
  workers: 1,
  forbidOnly: true,
  globalTeardown:'./tests/teardown.ts',
  timeout:60000,
  use: {
    baseURL,
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  // Build the current source and use an isolated port, never a stale preview.
  webServer: externalServer ? undefined : {
    command: 'npm run build && npm run start -- --port 3107',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  reporter: 'list',
});
