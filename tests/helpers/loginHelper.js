// @ts-check
// ============================================================
// TMDone Admin Console - Shared Helper Functions
// Common functions reused across all test files.
// ============================================================

import { expect } from '@playwright/test';

// ===================== CONSTANTS ============================
// Centralized credentials. Updating these values applies to all tests.
export const CREDENTIALS = {
  email: process.env.TMDONE_EMAIL || 'nimsara@codezync.com',
  password: process.env.TMDONE_PASSWORD || '123123',
  baseUrl: process.env.TMDONE_BASE_URL || 'https://consoledemo.uat.v3.dr.tmd1.org',
  get loginUrl() {
    return `${this.baseUrl}/#/authentication/signin`;
  },
};

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

/**
 * @param {import("playwright-core").Page} page
 */
export async function loginToApp(page) {
  const isLoggedIn = () => page.url().includes('home') || page.url().includes('dashboard');

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

    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await waitForNoSpinner(page);
    await dismissSweetAlert(page);
    await page.waitForTimeout(1500);

    // Check whether the user is already logged in and on the dashboard.
    if (isLoggedIn()) {
      console.log('Already logged in - skip!');
      return;
    }

    // Fill the email field.
    const emailInput = page
      .locator('input[type="email"], input[formcontrolname*="email" i], input[placeholder*="email" i], input')
      .first();
    await emailInput.waitFor({ state: 'visible', timeout: 20000 });
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
    await page.waitForURL((url) => !url.toString().includes('signin'), { timeout: 45000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const loginAlertText = await getSweetAlertText(page);
    const dismissedLoginAlert = await dismissSweetAlert(page);
    await page.waitForTimeout(1500);

    if (!page.url().includes('signin')) {
      console.log('Login success! URL:', page.url());
      return;
    }

    if (attempt === 3 && /check your username and password|invalid|incorrect|unauthori[sz]ed/i.test(loginAlertText)) {
      throw new Error(
        `Login failed: ${loginAlertText}. Check TMDONE_EMAIL/TMDONE_PASSWORD or the shared test account state.`
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
