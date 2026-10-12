// @ts-check
// ============================================================
// TMDone Admin Console - Offers > Target Audience Builder (Offer Queries)
// URL: #/home/offers/offer-queries
// VIEW-ONLY by explicit user decision: page shell, sidebar navigation,
// query list, and the Create / Edit query dialogs are opened, inspected
// and closed with Cancel. Nothing is saved, updated or deleted, and the
// Delete Query action is never clicked.
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from '../helpers/loginHelper.js';

const OFFERS_URL = `${CREDENTIALS.baseUrl}/#/home/offers/offer-queries`;
const SPINNERS = ['.ngx-spinner-overlay', 'app-page-loader'];
const FILTER_LABELS = ['Select Chain', 'Select Vendor', 'Select Zone', 'Select Area', 'Select Date Range',
  'Order Date Min', 'Order Date Max', 'Order Count Min', 'Order Count Max'];
const COUNT_OPERATORS = ['=', '<', '<=', '>', '>='];

test.describe('08-Offers - Target Audience Builder (view-only)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    await goToOffersPage(page);
  });

  test('OF-01: Target Audience Builder lists offer queries with Edit and Delete actions', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Target Audience Builder' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Offer Query' })).toBeVisible();
    const headers = (await page.locator('thead th').allInnerTexts()).map((h) => h.trim());
    expect(headers).toEqual(['Query Name', 'Actions']);

    const rows = page.locator('tbody tr');
    const count = await rows.count();
    expect(count, 'Saved offer queries should be listed.').toBeGreaterThan(0);
    const names = await rows.locator('td:first-child').allInnerTexts();
    expect(names.filter((n) => !n.trim()), 'Every query should have a name.').toEqual([]);
    await expect(rows.locator('button[mattooltip="Edit Query"]')).toHaveCount(count);
    await expect(rows.locator('button[mattooltip="Delete Query"]')).toHaveCount(count);
  });

  test('OF-02: Sidebar Offers menu opens the Target Audience Builder sub-page', async ({ page }) => {
    await page.goto(`${CREDENTIALS.baseUrl}/#/home/dashboard`, { waitUntil: 'domcontentloaded' });
    await waitForSpinners(page);
    const subLink = page.locator('a[href="#/home/offers/offer-queries"]').filter({ hasText: 'Target Audience Builder' });
    if (!(await subLink.isVisible())) {
      await clickWhenReady(page, page.locator('a').filter({ hasText: /^\s*card_giftcard\s*Offers/ }).first());
    }
    await expect(subLink, 'Offers menu should reveal the Target Audience Builder entry.').toBeVisible({ timeout: 15000 });
    await clickWhenReady(page, subLink);
    await expect(page).toHaveURL(/#\/home\/offers\/offer-queries$/);
    await expect(page.getByRole('heading', { name: 'Target Audience Builder' })).toBeVisible({ timeout: 60000 });
  });

  test('OF-03: Create Offer Query dialog shows the audience filters with safe defaults and Cancel creates nothing', async ({ page }) => {
    const rowsBefore = await page.locator('tbody tr').count();
    await clickWhenReady(page, page.getByRole('button', { name: 'Create Offer Query' }));
    const dialog = page.locator('modal-container').filter({ hasText: 'Create Offer Query' });
    await expect(dialog).toBeVisible({ timeout: 30000 });

    for (const label of FILTER_LABELS) {
      await expect(dialog.locator('mat-label, label').filter({ hasText: label }).first(), `${label} field should be shown.`).toBeVisible();
    }
    const selects = dialog.locator('mat-select');
    await expect(selects).toHaveCount(6);
    await expect(selects.nth(2), 'Zone is disabled in the empty form.').toHaveAttribute('aria-disabled', 'true');
    await expect(selects.nth(3), 'Area is disabled in the empty form.').toHaveAttribute('aria-disabled', 'true');

    // Date range defaults to the last 30 days, ending today.
    await expect(dialog.getByRole('checkbox', { name: 'Select Date Range' })).toBeChecked();
    await expect(dialog.getByRole('textbox', { name: 'Order Date Min' })).toHaveValue(formatDate(daysAgo(30)));
    await expect(dialog.getByRole('textbox', { name: 'Order Date Max' })).toHaveValue(formatDate(daysAgo(0)));

    // Order count min/max default to "= 0"; the operator offers the comparison list.
    await expect(dialog.getByRole('spinbutton')).toHaveCount(2);
    await expect(dialog.getByRole('spinbutton').nth(0)).toHaveValue('0');
    await expect(dialog.getByRole('spinbutton').nth(1)).toHaveValue('0');
    await expect(selects.nth(4)).toContainText('=');
    await clickWhenReady(page, selects.nth(4));
    await expect(page.getByRole('option').first()).toBeVisible({ timeout: 15000 });
    expect((await page.getByRole('option').allInnerTexts()).map((t) => t.trim())).toEqual(COUNT_OPERATORS);
    await clickWhenReady(page, page.getByRole('option', { name: '=', exact: true }));
    await expect(page.locator('.mat-select-panel')).toHaveCount(0);

    // Nothing can be searched, exported or saved until filters are chosen.
    await expect(dialog.locator('button[mattooltip="Search"]')).toBeDisabled();
    await expect(dialog.locator('button[mattooltip="Download"]')).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();

    await clickWhenReady(page, dialog.getByRole('button', { name: 'Cancel' }));
    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(page.locator('tbody tr')).toHaveCount(rowsBefore);
  });

  test('OF-04: Edit Query opens the saved query with its filters and results, and Cancel leaves it unchanged', async ({ page }) => {
    const rows = page.locator('tbody tr');
    const rowsBefore = await rows.count();
    const queryName = (await rows.first().locator('td').first().innerText()).trim();
    const row = rows.filter({ has: page.locator('td:first-child', { hasText: new RegExp(`^\\s*${escapeRegExp(queryName)}\\s*$`) }) }).first();

    const dialog = page.locator('modal-container').filter({ hasText: `${queryName} - Edit` });
    // A click that lands while the list is still settling can be dropped; click again until it opens.
    await expect(async () => {
      if (!(await dialog.isVisible())) await clickWhenReady(page, row.locator('button[mattooltip="Edit Query"]'));
      await expect(dialog, 'Edit dialog should be titled with the query name.').toBeVisible({ timeout: 20000 });
    }).toPass({ timeout: 90000 });
    const update = dialog.getByRole('button', { name: 'Update' });
    await expect(update, 'Saved query form should load.').toBeVisible({ timeout: 60000 });
    await expect(update, 'Update stays disabled while nothing was changed.').toBeDisabled();

    for (const label of FILTER_LABELS) {
      await expect(dialog.locator('mat-label, label').filter({ hasText: label }).first()).toBeVisible();
    }
    // The saved query can be run and exported from the edit view.
    await expect(dialog.locator('button[mattooltip="Search"]')).toBeEnabled();
    await expect(dialog.locator('button[mattooltip="Download"]')).toBeEnabled();
    const resultHeaders = (await dialog.locator('thead th').allInnerTexts()).map((h) => h.trim());
    expect(resultHeaders).toEqual(['Customer Name', 'Phone Number', 'Order Count']);
    await expect(dialog.getByText(/Total \d+ results found/)).toBeVisible();

    await clickWhenReady(page, dialog.getByRole('button', { name: 'Cancel' }));
    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(rows).toHaveCount(rowsBefore);
    await expect(rows.first().locator('td').first()).toHaveText(queryName);
  });
});

// ============================================================
// Helpers
// ============================================================

/** @param {import('@playwright/test').Page} page */
async function goToOffersPage(page) {
  await loginToApp(page);
  await page.goto(OFFERS_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForSpinners(page);
  await expect(page.getByRole('heading', { name: 'Target Audience Builder' })).toBeVisible({ timeout: 60000 });
  await expect(page.locator('tbody tr').first(), 'Offer queries should load.').toBeVisible({ timeout: 90000 });
}

/** @param {import('@playwright/test').Page} page */
async function waitForSpinners(page) {
  for (const selector of SPINNERS) {
    await page.locator(selector).first().waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 */
async function clickWhenReady(page, locator) {
  await locator.waitFor({ state: 'visible', timeout: 30000 });
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await waitForSpinners(page);
    try {
      await locator.click({ timeout: 8000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1000);
    }
  }
  throw lastError;
}

/** @param {number} days */
function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/** @param {Date} date dd/mm/yyyy */
function formatDate(date) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
