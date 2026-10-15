// @ts-check
// ============================================================
// Playwright global setup - runs once before the whole run.
// Signs in to the shared account here, outside any test, and saves the
// session to test-results/.auth. Tests then reuse it through loginToApp().
// Why: traces record network requests, so a test that signs in itself puts
// the password and the year-long access token into its trace - and the CI
// artifacts that contain those traces can be downloaded by anyone who can
// see the repository.
// ============================================================

import { chromium } from '@playwright/test';
import { hasCredentials, isFreshAuthState, signInWithForm } from './loginHelper.js';

export default async function globalSetup() {
  // Without credentials each test reports it (skip locally, fail in CI).
  if (!hasCredentials()) return;
  // Local re-runs reuse a recent session; CI always starts without one.
  if (isFreshAuthState()) return;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await signInWithForm(page);
  } finally {
    await browser.close();
  }
}
