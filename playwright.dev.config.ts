import { defineConfig } from '@playwright/test';

process.env.REPOGGITS_TEST_DIST = '.next-test-dev';
process.loadEnvFile('.env.local');
process.env.APP_ORIGIN='http://localhost:3108';
process.env.MAIL_MODE='outbox';
process.env.EMAIL_VERIFICATION_REQUIRED='false';
process.env.REPOGGITS_DB_SCHEMA ||= `repoggits_test_dev_${process.pid}`;

export default defineConfig({
  testDir: './tests/development',
  outputDir:'test-results/dev',
  workers: 1,
  forbidOnly: true,
  globalTeardown:'./tests/teardown.ts',
  use: {
    baseURL: 'http://localhost:3108',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev -- --port 3108',
    url: 'http://localhost:3108',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  reporter: 'list',
});
