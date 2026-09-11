import { defineConfig } from '@playwright/test';

// Real email delivery, end to end: Repoggits sends through Azure Communication Services (when
// AZURE_COMMUNICATION_CONNECTION_STRING is set) or SMTP, testmail.app receives, and the tests read
// the delivered message back through the testmail.app API. Optional — it needs TESTMAIL_NAMESPACE,
// TESTMAIL_APIKEY and working Azure or SMTP_* settings in .env.local, and skips itself (without
// building or starting a server) when any of them are missing.
process.loadEnvFile('.env.local');
const baseURL = 'http://127.0.0.1:3109';
process.env.APP_ORIGIN = baseURL;
process.env.MAIL_MODE = process.env.AZURE_COMMUNICATION_CONNECTION_STRING ? 'azure' : 'smtp';
process.env.EMAIL_VERIFICATION_REQUIRED = 'true';
process.env.REPOGGITS_DB_SCHEMA ||= `repoggits_test_otp_${process.pid}`;
const configured = Boolean(process.env.TESTMAIL_NAMESPACE && process.env.TESTMAIL_APIKEY && (process.env.AZURE_COMMUNICATION_CONNECTION_STRING || process.env.SMTP_HOST));

export default defineConfig({
  testDir: './tests/otp',
  outputDir: 'test-results/otp',
  workers: 1,
  forbidOnly: true,
  globalTeardown: './tests/teardown.ts',
  // Waiting on real delivery takes longer than an in-process check.
  timeout: 120_000,
  use: { baseURL },
  webServer: configured ? {
    command: 'npm run build && npm run start -- --port 3109',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  } : undefined,
  reporter: 'list',
});
