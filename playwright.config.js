// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * TMDone Admin Console - Playwright Configuration
 * Base URL: https://console.demo.dr.tmd1.org
 */
// Only the origin of TMDONE_BASE_URL is used (a value with a #/route would break every URL).
const BASE_URL = new URL(process.env.TMDONE_BASE_URL || 'https://console.demo.dr.tmd1.org').origin;

export default defineConfig({
  // Test folder.
  testDir: './tests',

  // Signs in once before the run, outside any test (keeps the password out of traces).
  globalSetup: './tests/helpers/global-setup.js',

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
    baseURL: BASE_URL,

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
