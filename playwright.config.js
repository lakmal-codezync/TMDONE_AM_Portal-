// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * TMDone Admin Console - Playwright Configuration
 * Base URL: https://consoledemo.uat.v3.dr.tmd1.org
 */
export default defineConfig({
  // Test folder.
  testDir: './tests',

  // Run test files sequentially for stability.
  fullyParallel: false,

  // Fail the build in CI if test.only is committed.
  forbidOnly: !!process.env.CI,

  // Use more retries in CI than in local runs.
  retries: process.env.CI ? 2 : 1,

  // Use one worker for stable execution.
  workers: 1,

  // Generate the HTML report after the test run.
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],

  // Common settings for all tests.
  use: {
    // TMDone Admin demo URL.
    baseURL: 'https://consoledemo.uat.v3.dr.tmd1.org',

    // Capture screenshots on failure.
    screenshot: 'only-on-failure',

    // Capture videos on failure.
    video: 'retain-on-failure',

    // Collect a trace on the first retry.
    trace: 'on-first-retry',

    // Action timeout - 30 seconds
    actionTimeout: 30000,

    // Navigation timeout - 60 seconds
    navigationTimeout: 60000,

    // To view the browser: HEADED=true npx playwright test
    headless: process.env.HEADED !== 'true',

    // Viewport size.
    viewport: { width: 1280, height: 720 },
  },

  // Run tests in Chromium only.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Test output folder
  outputDir: 'test-results/',

  // Global timeout per test - 2 minutes
  timeout: 120000,
});
