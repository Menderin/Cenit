import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'auth.spec.ts', fullyParallel: false, workers: 1,
  timeout: 30000, expect: { timeout: 10000 }, reporter: 'list',
  globalTeardown: './tests/e2e/support/teardown.ts',
  use: { baseURL: 'http://127.0.0.1:5174', browserName: 'chromium', trace: 'off', screenshot: 'off' },
  webServer: {
    command: 'node --import tsx tests/e2e/support/server.ts',
    url: 'http://127.0.0.1:5174', reuseExistingServer: false, timeout: 120000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15000 },
  },
});
