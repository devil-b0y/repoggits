import type { NextConfig } from 'next';

const config: NextConfig = {
  // Give development regression tests their own cache and lock directory.
  distDir: process.env.REPOGGITS_TEST_DIST || '.next',
};

export default config;
