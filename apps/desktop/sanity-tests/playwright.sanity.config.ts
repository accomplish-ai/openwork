// apps/desktop/sanity-tests/playwright.sanity.config.ts
import { defineConfig } from '@playwright/test';

const SANITY_TIMEOUT = parseInt(process.env.SANITY_TIMEOUT || '300000', 10); // 5 min default

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  // Serial execution - agent tasks can't parallelize
  workers: 1,
  fullyParallel: false,

  // Long timeout for real agent work
  timeout: SANITY_TIMEOUT,
  expect: {
    timeout: 30000, // 30s for assertions
  },

  // No retries - we want to see real failures
  retries: 0,

  // Reporters
  reporter: [
    ['html', { outputFolder: './html-report' }],
    ['json', { outputFile: './sanity-report.json' }],
    ['list'],
  ],

  use: {
    screenshot: 'on', // Always capture for sanity tests
    video: 'on',
    trace: 'on',
  },

  projects: [
    {
      name: 'sanity',
      testMatch: /.*\.sanity\.ts/,
      timeout: SANITY_TIMEOUT,
    },
  ],
});
