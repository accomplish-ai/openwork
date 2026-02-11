import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';

config({ path: '../../.env.e2e' });

export default defineConfig({
  testDir: './__tests__/e2e',
  testMatch: '**/*.smoke.test.ts',
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
