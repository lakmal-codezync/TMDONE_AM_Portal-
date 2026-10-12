// @ts-check
// ============================================================
// TMDone Admin Console - User Notifications
// URL: #/home/user-notifications
//
// VIEW-ONLY by explicit user decision: notifications go to real users, so
// this suite NEVER creates, edits or sends one. It covers page load, the
// table against the list API (api/userIndividualNotification/list), the
// read-only "View User Notification" 2-step modal (persisted values, step 2
// and the attached Excel download), server-side search, no-match search and
// Clear. The "Create User Notification" button is only checked for presence.
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

const ROUTE = '#/home/user-notifications';
const LIST_API = /\/api\/userIndividualNotification\/list/i;
const NO_MATCH_TERM = `zz-no-notification-${Date.now()}`;

/** @param {import('@playwright/test').Page} page */
async function waitForNoSpinner(page) {
  for (const selector of ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay']) {
    await page.locator(selector).first().waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  }
}

/**
 * Real click that survives the cycling loader overlay.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 */
async function clickWhenReady(page, locator, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await waitForNoSpinner(page);
    try {
      await locator.click({ timeout: 8000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(800);
    }
  }
  throw lastError;
}

/**
 * Same format the table uses: dd/MM/yyyy hh:mm AM (browser = runner timezone);
 * notifications without a schedule show "-".
 * @param {string | null} iso
 */
function formatScheduled(iso) {
  if (!iso || new Date(iso).getFullYear() < 2000) return '-';
  const d = new Date(iso);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const hours = d.getHours() % 12 || 12;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(hours)}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

/** @param {import('@playwright/test').Page} page */
const searchInput = (page) => page.locator('input[formcontrolname="SearchString"]').first();
/** @param {import('@playwright/test').Page} page @param {string} tooltip */
const toolbarButton = (page, tooltip) => page.locator(`button[mattooltip="${tooltip}"]`).filter({ visible: true }).first();
/** @param {import('@playwright/test').Page} page */
const dataRows = (page) => page.locator('tbody tr').filter({ has: page.locator('td') });
/** @param {import('@playwright/test').Page} page */
const viewModal = (page) => page.locator('.modal-content').filter({ hasText: /View User Notification/ }).filter({ visible: true }).first();

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} tooltip
 */
async function clickAndCapture(page, tooltip) {
  const responsePromise = page.waitForResponse((r) => LIST_API.test(r.url()) && r.request().method() === 'POST', { timeout: 45000 });
  await clickWhenReady(page, toolbarButton(page, tooltip));
  const response = await responsePromise;
  expect(response.status(), `${tooltip} request should succeed.`).toBe(200);
  const request = JSON.parse(response.request().postData() || '{}');
  const body = await response.json();
  await waitForNoSpinner(page);
  return { request, body };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ Items: any[] }} body
 */
async function expectRowsMatchApi(page, body) {
  await expect(dataRows(page), 'Rendered rows should match the API items.').toHaveCount(body.Items.length, { timeout: 20000 });
  const titles = (await dataRows(page).locator('td:first-child').allInnerTexts()).map((t) => t.trim());
  expect(titles).toEqual(body.Items.map((/** @type {any} */ n) => n.Title.trim()));
}

/**
 * Opens the read-only View modal for the API item at `index` (rows render in API order).
 * @param {import('@playwright/test').Page} page
 * @param {any} item
 * @param {number} index
 */
async function openViewModal(page, item, index) {
  const row = dataRows(page).nth(index);
  await expect(row.locator('td').first()).toHaveText(item.Title.trim());
  await clickWhenReady(page, row.locator('button[mattooltip="View"]'));
  const modal = viewModal(page);
  await expect(modal, 'View User Notification modal should open.').toBeVisible({ timeout: 15000 });
  return modal;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} modal
 */
async function closeViewModal(page, modal) {
  await clickWhenReady(page, modal.locator('button, mat-icon, span').filter({ hasText: /^\s*close\s*$/ }).first());
  await expect(viewModal(page), 'View modal should close.').toHaveCount(0, { timeout: 10000 });
}

test.describe('17 - User Notifications - View-Only Coverage', () => {
  /** @type {{ TotalItemCount: number, Items: any[] }} */
  let initial;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(180000);
    await loginToApp(page);
    const responsePromise = page.waitForResponse((r) => LIST_API.test(r.url()) && r.request().method() === 'POST', { timeout: 60000 });
    await goToPage(page, ROUTE);
    const response = await responsePromise;
    expect(response.status(), 'Notification list request should succeed.').toBe(200);
    initial = await response.json();
    await expect(page.locator('h1, h2, h3, h4').filter({ hasText: /^\s*User Notifications\s*$/ }).first()).toBeVisible({ timeout: 30000 });
    await waitForNoSpinner(page);
  });

  test('UN-01: User Notifications page loads with main controls', async ({ page }) => {
    await expect(page.locator('button').filter({ hasText: 'Create User Notification' }).first()).toBeVisible();
    await expect(searchInput(page)).toBeVisible();
    await expect(toolbarButton(page, 'Search')).toBeEnabled();
    await expect(toolbarButton(page, 'Clear')).toBeEnabled();
    const headers = (await page.locator('thead th').filter({ visible: true }).allInnerTexts()).map((h) => h.trim());
    expect(headers).toEqual(['Title', 'Arabic Title', 'Description', 'Arabic Description', 'Scheduled Date & Time', 'Actions']);
    expect(initial.Items.length, 'Existing notifications should be listed.').toBeGreaterThan(0);
    await expectRowsMatchApi(page, initial);
    await expect(dataRows(page).first().locator('button[mattooltip="View"]')).toBeVisible();
  });

  test('UN-02: View an existing User Notification shows its persisted values read-only', async ({ page }) => {
    const item = initial.Items[0];
    const modal = await openViewModal(page, item, 0);
    await expect(modal).toContainText('1 of 2 Steps');
    await expect(modal).toContainText('Basic Information');
    for (const [control, value] of [
      ['Title', item.Title],
      ['ArabicTitle', item.ArabicTitle],
      ['Description', item.Description],
      ['ArabicDescription', item.ArabicDescription],
    ]) {
      const field = modal.locator(`[formcontrolname="${control}"]`);
      await expect(field, `${control} should show the saved value.`).toHaveValue(value);
      await expect(field, `${control} should be read-only in View.`).toBeDisabled();
    }
    const scheduled = modal.locator('[formcontrolname="ScheduledDateTime"]');
    await expect(scheduled).toHaveValue(formatScheduled(item.ScheduledAt));
    await expect(scheduled).toBeDisabled();
    await closeViewModal(page, modal);
  });

  test('UN-03: View step 2 downloads the Excel file attached to a notification', async ({ page }) => {
    const index = initial.Items.findIndex((/** @type {any} */ n) => /\.xlsx?$/i.test(n.FileUrl || ''));
    expect(index, 'At least one notification should have an attached Excel file.').toBeGreaterThanOrEqual(0);
    const item = initial.Items[index];
    const modal = await openViewModal(page, item, index);
    await clickWhenReady(page, modal.getByRole('button', { name: /^\s*Next\s*$/ }));
    const stepTwo = viewModal(page);
    await expect(stepTwo).toContainText('2 of 2 Steps', { timeout: 10000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await clickWhenReady(page, stepTwo.getByRole('button', { name: /Download attached excel/i }));
    const download = await downloadPromise;
    expect(download.url(), 'Download should fetch the file stored on the notification.').toBe(item.FileUrl);
    expect(download.suggestedFilename()).toMatch(/\.xlsx?$/i);
    expect(await download.failure(), 'Excel download should complete.').toBeNull();
    await download.delete().catch(() => {});
    await closeViewModal(page, stepTwo);
  });

  test('UN-04: Search filters notifications server-side and Clear restores the list', async ({ page }) => {
    const source = initial.Items.find((/** @type {any} */ n) => /^[A-Za-z][A-Za-z ]{3,}/.test(n.Title)) || initial.Items[0];
    const term = (source.Title.match(/[A-Za-z]{4,}/) || [source.Title])[0];
    await searchInput(page).fill(term);
    const searched = await clickAndCapture(page, 'Search');
    expect(searched.request.SearchString, 'Search term should be sent to the API.').toBe(term);
    expect(searched.body.Items.length).toBeGreaterThan(0);
    expect(searched.body.Items.length).toBeLessThanOrEqual(initial.Items.length);
    await expectRowsMatchApi(page, searched.body);
    await expect(dataRows(page).filter({ hasText: source.Title.trim() }).first()).toBeVisible();
    for (const text of await dataRows(page).allInnerTexts()) {
      expect(text.toLowerCase(), `Every row should match "${term}".`).toContain(term.toLowerCase());
    }

    const cleared = await clickAndCapture(page, 'Clear');
    expect(cleared.request.SearchString).toBe('');
    await expect(searchInput(page)).toHaveValue('');
    expect(cleared.body.TotalItemCount).toBe(initial.TotalItemCount);
    await expectRowsMatchApi(page, cleared.body);
  });

  test('UN-05: Search with no matching notification shows an empty list', async ({ page }) => {
    await searchInput(page).fill(NO_MATCH_TERM);
    const searched = await clickAndCapture(page, 'Search');
    expect(searched.request.SearchString).toBe(NO_MATCH_TERM);
    expect(searched.body.TotalItemCount).toBe(0);
    await expect(dataRows(page).filter({ has: page.locator('button[mattooltip="View"]') })).toHaveCount(0);
  });

  test('UN-06: Scheduled Date & Time column shows each notification schedule', async ({ page }) => {
    const scheduled = (await dataRows(page).locator('td:nth-child(5)').allInnerTexts()).map((t) => t.trim());
    expect(scheduled).toEqual(initial.Items.map((/** @type {any} */ n) => formatScheduled(n.ScheduledAt)));
  });
});
