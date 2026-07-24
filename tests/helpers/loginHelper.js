// @ts-check
// ============================================================
// TMDone Admin Console - Shared Helper Functions
// Common functions reused across all test files.
// ============================================================

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const AUTH_STATE_PATH = path.resolve(process.cwd(), 'test-results', '.auth', 'tmdone-admin.json');
const AUTH_STATE_MAX_AGE_MS = 30 * 60 * 1000;

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

function isFreshAuthState() {
  if (!fs.existsSync(AUTH_STATE_PATH)) return false;
  const ageMs = Date.now() - fs.statSync(AUTH_STATE_PATH).mtimeMs;
  return ageMs < AUTH_STATE_MAX_AGE_MS;
}

function readAuthState() {
  if (!isFreshAuthState()) return null;

  try {
    return JSON.parse(fs.readFileSync(AUTH_STATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function saveAuthState(page) {
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: AUTH_STATE_PATH }).catch(() => {});
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function applyCachedAuthState(page) {
  const state = readAuthState();
  if (!state) return false;

  if (Array.isArray(state.cookies) && state.cookies.length > 0) {
    await page.context().addCookies(state.cookies).catch(() => {});
  }

  if (Array.isArray(state.origins) && state.origins.length > 0) {
    await page.addInitScript((origins) => {
      const matchingOrigin = origins.find((origin) => origin.origin === window.location.origin);
      if (!matchingOrigin) return;
      for (const item of matchingOrigin.localStorage || []) {
        window.localStorage.setItem(item.name, item.value);
      }
    }, state.origins).catch(() => {});
  }

  return true;
}

// ===================== CONSTANTS ============================
// Centralized credentials. Keep sensitive values in environment variables
// or GitHub Actions secrets, never in source control.
export const CREDENTIALS = {
  email: process.env.TMDONE_EMAIL || '',
  password: process.env.TMDONE_PASSWORD || '',
  baseUrl: process.env.TMDONE_BASE_URL || 'https://consoledemo.uat.v3.dr.tmd1.org',
  get loginUrl() {
    return `${this.baseUrl}/#/authentication/signin`;
  },
};

export function requireCredentials() {
  const hasPlaceholder =
    CREDENTIALS.email === 'your-email@example.com' ||
    CREDENTIALS.password === 'your-password';

  if (!CREDENTIALS.email || !CREDENTIALS.password || hasPlaceholder) {
    test.skip(true, 'Set real TMDONE_EMAIL and TMDONE_PASSWORD values in .env, environment variables, or GitHub Actions secrets.');
  }
}

// ============================================================
// loginToApp() - Reusable sign-in helper.
// page = Playwright page object.
// ============================================================
/**
 * @param {import('@playwright/test').Page} page
 */
async function waitForNoSpinner(page) {
  const spinnerSelectors = ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay', '.loading-spinner'];
  const blockers = page.locator(spinnerSelectors.join(', '));

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const visibleCount = await blockers
      .evaluateAll((nodes) =>
        nodes.filter((node) => {
          const element = /** @type {HTMLElement} */ (node);
          const style = window.getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
        }).length
      )
      .catch(() => 0);

    if (visibleCount === 0) return;
    await page.waitForTimeout(500);
  }

  for (const selector of spinnerSelectors) {
    await page.locator(selector).waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

/**
 * @param {import('@playwright/test').Locator} button
 * @param {import('@playwright/test').Page} page
 */
async function clickLoginButton(button, page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForNoSpinner(page);
    await expect(button, 'Login button should be enabled before clicking.').toBeEnabled({ timeout: 15000 });

    const clicked = await button.click({ timeout: 10000 }).then(() => true).catch(() => false);
    if (clicked) return;

    await page.waitForTimeout(1000);
  }

  await button.click({ force: true, timeout: 10000 });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function dismissSweetAlert(page) {
  const alert = page.locator('.swal2-container.swal2-backdrop-show, .swal2-popup').filter({ visible: true }).first();
  if (!(await alert.isVisible().catch(() => false))) return false;

  const okButton = page
    .locator('.swal2-confirm, button:has-text("OK"), button:has-text("Ok"), button:has-text("Yes")')
    .filter({ visible: true })
    .first();
  if (await okButton.isVisible().catch(() => false)) {
    await okButton.click({ force: true }).catch(() => {});
  } else {
    await page.keyboard.press('Escape').catch(() => {});
  }
  await page.locator('.swal2-container, .swal2-popup').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  return true;
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function getSweetAlertText(page) {
  const alert = page.locator('.swal2-popup, .swal2-container.swal2-backdrop-show').filter({ visible: true }).first();
  if (!(await alert.isVisible().catch(() => false))) return '';
  return (await alert.innerText().catch(() => '')).trim();
}

/** @param {import('@playwright/test').Page} page */
async function waitForLoginOrAppSignal(page) {
  await Promise.race([
    page.locator('input').first().waitFor({ state: 'visible', timeout: 30000 }),
    page.locator('.sidebar, nav.navbar, a[href*="#/home"]').first().waitFor({ state: 'visible', timeout: 30000 }),
  ]).catch(() => {});
}

/**
 * @param {import("playwright-core").Page} page
 */
export async function loginToApp(page) {
  requireCredentials();
  const isLoggedIn = () => page.url().includes('home') || page.url().includes('dashboard');

  if (await applyCachedAuthState(page)) {
    await page.goto(`${CREDENTIALS.baseUrl}/#/home/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
    await waitForNoSpinner(page);
    await page.waitForTimeout(1500);

    if (!page.url().includes('signin') && isLoggedIn()) {
      console.log('Already logged in from cached state - skip!');
      return;
    }
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await dismissSweetAlert(page);

    try {
      await page.goto(CREDENTIALS.loginUrl, { waitUntil: 'commit', timeout: 120000 });
    } catch (error) {
      if (isLoggedIn()) return;
      if (attempt === 3) throw error;
      await page.waitForTimeout(3000).catch(() => {});
      continue;
    }

    if (page.isClosed()) throw new Error('Login page was closed while navigating to the sign-in form.');
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await waitForNoSpinner(page);
    await dismissSweetAlert(page);
    if (page.isClosed()) throw new Error('Login page was closed while waiting for the sign-in form.');
    await waitForLoginOrAppSignal(page);

    // Check whether the user is already logged in and on the dashboard.
    if (isLoggedIn()) {
      console.log('Already logged in - skip!');
      return;
    }

    // Fill the email/username field. Some Angular builds expose it only as a generic textbox.
    const emailInput = page
      .locator('input[type="email"], input[formcontrolname*="email" i], input[placeholder*="email" i], input')
      .or(page.getByRole('textbox', { name: /email|username/i }))
      .or(page.getByRole('textbox'))
      .first();
    const emailVisible = await emailInput.isVisible({ timeout: 20000 }).catch(() => false);
    if (!emailVisible) {
      if (isLoggedIn()) return;

      const appShellVisible = await page
        .locator('.sidebar, nav.navbar, a[href*="#/home"], app-root')
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (appShellVisible && !page.url().includes('signin')) return;

      const bodyLine = ((await page.locator('body').innerText().catch(() => '')) || '').split('\n')[0] || page.url();
      console.log(`Login email field was not visible after attempt ${attempt}; current page: ${bodyLine}`);
      if (attempt === 3) {
        throw new Error(`Login form did not render after retries. Current URL: ${page.url()}`);
      }
      continue;
    }
    await emailInput.fill('');
    await emailInput.fill(CREDENTIALS.email);

    // Fill the password field.
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('');
    await passwordInput.fill(CREDENTIALS.password);

    // Click the login button after it becomes enabled.
    const loginBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")').first();
    await loginBtn.waitFor({ state: 'visible', timeout: 15000 });
    await clickLoginButton(loginBtn, page);

    await waitForNoSpinner(page);
    await Promise.race([
      page.waitForURL((url) => !url.toString().includes('signin'), { timeout: 45000 }),
      page.locator('.swal2-popup, .swal2-container.swal2-backdrop-show').filter({ visible: true }).first().waitFor({
        state: 'visible',
        timeout: 15000,
      }),
    ]).catch(() => {});
    if (page.isClosed()) throw new Error('Login page was closed after submitting credentials.');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const loginAlertText = await getSweetAlertText(page);
    const dismissedLoginAlert = await dismissSweetAlert(page);
    if (page.isClosed()) throw new Error('Login page was closed after dismissing the login alert.');
    await page.waitForTimeout(1500);

    if (!page.url().includes('signin')) {
      await saveAuthState(page);
      console.log('Login success! URL:', page.url());
      return;
    }

    if (/check your username and password|invalid|incorrect|unauthori[sz]ed/i.test(loginAlertText)) {
      test.skip(
        true,
        `Login rejected the configured shared account: ${loginAlertText}. Check TMDONE_EMAIL/TMDONE_PASSWORD or account state.`
      );
    }

    console.log(`Login still on signin after attempt ${attempt}${dismissedLoginAlert ? ' (alert dismissed)' : ''}; retrying...`);
  }

  throw new Error(`Login failed after retries. Current URL: ${page.url()}`);
}

// ============================================================
// goToPage() - Helper for navigating to a specific page.
// hashPath = URL path such as '#/home/campaigns'.
// ============================================================
/**
 * @param {import('@playwright/test').Page} page
 * @param {string} hashPath
 */
export async function goToPage(page, hashPath) {
  const fullUrl = `${CREDENTIALS.baseUrl}/${hashPath}`;
  await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('domcontentloaded');
  await waitForNoSpinner(page);
  await page.waitForTimeout(1000);
  console.log(`Navigated: ${fullUrl}`);
}

// ============================================================
// clickCreateButton() - Click the Create or Add button.
// Uses a generic selector shared by multiple pages.
// ============================================================
/**
 * @param {import('@playwright/test').Page} page
 */
export async function clickCreateButton(page) {
  const createBtn = page.locator(
    'button:has-text("Create"), button:has-text("Add"), button:has-text("New"), button:has-text("CREATE")'
  ).first();
  await createBtn.waitFor({ state: 'visible', timeout: 10000 });
  await createBtn.click();
  await page.waitForTimeout(1500);
  console.log('Create button clicked!');
}

// ============================================================
// closeModalIfOpen() - Close an open modal.
// Presses Escape or clicks the X button.
// ============================================================
/**
 * @param {import('@playwright/test').Page} page
 */
export async function closeModalIfOpen(page) {
  // Check whether the close button (X) is visible.
  const closeBtn = page.locator('button[mat-icon-button][aria-label="Close"], mat-dialog-container button mat-icon:has-text("close")').first();
  const closeVisible = await closeBtn.isVisible().catch(() => false);

  if (closeVisible) {
    await closeBtn.click();
    await page.waitForTimeout(1000);
    console.log('Modal close button clicked!');
  } else {
    // Close the modal with the Escape key.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    console.log('Modal closed via Escape!');
  }
}

// ============================================================
// clickMoreActionsMenu() - Click a row's dots menu.
// Opens the actions menu for a row in a table.
// ============================================================
/**
 * @param {import('@playwright/test').Page} page
 * @param {number} rowIndex
 */
export async function clickMoreActionsMenu(page, rowIndex = 0) {
  const moreMenuBtns = page.locator('button mat-icon:has-text("more_horiz"), button mat-icon:has-text("more_vert"), [aria-label="More actions"]');
  const count = await moreMenuBtns.count();

  if (count > rowIndex) {
    await moreMenuBtns.nth(rowIndex).click();
    await page.waitForTimeout(1000);
    console.log(`More actions menu opened for row ${rowIndex}!`);
    return true;
  }

  console.log('More actions menu not found!');
  return false;
}

// ============================================================
// confirmDeleteDialog() - Cancel the delete confirmation dialog.
// This avoids deleting real data.
// ============================================================
/**
 * @param {import('@playwright/test').Page} page
 */
export async function cancelDeleteDialog(page) {
  // Click the cancel button to avoid deleting real data.
  const cancelBtn = page.locator('button:has-text("Cancel"), button:has-text("CANCEL"), button:has-text("No")').first();
  const cancelVisible = await cancelBtn.isVisible().catch(() => false);

  if (cancelVisible) {
    await cancelBtn.click();
    await page.waitForTimeout(1000);
    console.log('Delete dialog cancelled (data safe)!');
    return true;
  }
  return false;
}
