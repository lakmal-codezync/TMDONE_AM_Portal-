// @ts-check
// ============================================================
// TMDone Admin Console - TM Done Club - Subscriptions Reports
// URL: #/home/tm-done-club/subscriptions
// Read-only report. Every filter is verified by the request the page really
// sends (api/reports/getSubscriptions) and by the rows that come back.
// Exports (Download) and the View Reports dialogs are read-only too.
// ============================================================

import { test, expect } from '@playwright/test';
import {
  TM_DONE_CLUB_ROUTES,
  API,
  openClubPage,
  toolbarButton,
  searchInput,
  dataRows,
  tableHeaders,
  clickAndCapture,
  expectTableMatchesApi,
  readSelectOptions,
  chooseSelectOption,
  pickDateRange,
  dateRangeValues,
  apiDateRange,
  currentYearToToday,
  previousYearToToday,
  clickWhenReady,
  captureDownload,
  isXlsx,
  rowCells,
  tableDate,
} from './tm-done-club-helper.js';

const STATUS_OPTIONS = ['Trial', 'Active', 'Paused', 'In Grace', 'Expired', 'Canceled'];
const NO_MATCH_TERM = `zz-no-subscriber-${Date.now()}`;

/** Column indexes in the report table. */
const USER_COLUMN = 0;
const PHONE_COLUMN = 1;
const PERIOD_COLUMN = 2;
const STATUS_COLUMN = 6;

/** @param {number} months */
const periodLabel = (months) => (months === 1 ? '1 Month' : `${months} Months`);

/**
 * Picks the wide (1 Jan of last year .. today) range, searches unfiltered and
 * returns the API body. The report must contain at least one subscription.
 * @param {import('@playwright/test').Page} page
 */
async function searchWideRange(page) {
  const { start, end } = previousYearToToday();
  await pickDateRange(page, start, end);
  const searched = await clickAndCapture(page, 'Search', API.subscriptions);
  expect(searched.request.DateRange).toBe(apiDateRange(start, end));
  expect(searched.body.TotalItemCount, `Subscriptions Reports needs at least one subscription in ${searched.request.DateRange}.`).toBeGreaterThan(0);
  expect(searched.body.TotalItemCount, 'All subscriptions of the range should fit on the first page.').toBeLessThanOrEqual(searched.body.PageSize);
  await expectTableMatchesApi(page, searched.body);
  return searched.body;
}

/**
 * Opens a "View Reports" action of the subscription's row and returns the
 * dialog plus the report API call it made.
 * @param {import('@playwright/test').Page} page
 * @param {any} subscription
 * @param {string} action
 * @param {RegExp} apiPattern
 */
async function openViewReport(page, subscription, action, apiPattern) {
  const index = (await rowCells(dataRows(page))).findIndex((cells) => cells[PHONE_COLUMN] === subscription.PhoneNumber);
  expect(index, `Row of ${subscription.PhoneNumber} should be listed.`).toBeGreaterThanOrEqual(0);
  const responsePromise = page.waitForResponse((r) => apiPattern.test(r.url()) && r.request().method() === 'POST', { timeout: 45000 });
  await clickWhenReady(page, dataRows(page).nth(index).locator('mat-icon').filter({ hasText: /^more_horiz$/ }));
  const menuItems = page.locator('.mat-menu-panel button');
  await expect(menuItems.first()).toBeVisible({ timeout: 10000 });
  expect((await menuItems.allInnerTexts()).map((t) => t.replace(/^list/, '').trim())).toEqual(['View Subscription Events', 'View Subscription History']);
  await menuItems.filter({ hasText: action }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 15000 });
  return { dialog, request: JSON.parse(response.request().postData() || '{}'), body: await response.json() };
}

test.describe('TM Done Club Subscriptions Reports', () => {
  /** @type {any} */
  let initial;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    initial = await openClubPage(page, TM_DONE_CLUB_ROUTES.subscriptions, 'Subscriptions Reports', API.subscriptions);
    expect(initial, 'Subscriptions report API should return JSON.').not.toBeNull();
  });

  test('TDCSR-01: Subscriptions reports page loads with filters, table and controls', async ({ page }) => {
    await expect(searchInput(page)).toBeVisible();
    for (const control of ['SearchBy', 'Status', 'PeriodOfMonths']) {
      await expect(page.locator(`mat-select[formcontrolname="${control}"]`), `"${control}" filter should be visible.`).toBeVisible();
    }
    await expect(page.locator('input[formcontrolname="StartDate"]')).toBeVisible();
    await expect(page.locator('input[formcontrolname="EndDate"]')).toBeVisible();
    await expect(toolbarButton(page, 'Search')).toBeEnabled();
    await expect(toolbarButton(page, 'Clear')).toBeEnabled();
    await expect(toolbarButton(page, 'Download')).toBeEnabled();
    expect(await tableHeaders(page)).toEqual([
      'User',
      'Phone Number',
      'Period (Months)',
      'Plan Price (OMR)',
      'Term Start Date',
      'Term End Date',
      'Status',
      'View Reports',
    ]);
    await expectTableMatchesApi(page, initial);
  });

  test('TDCSR-02: Filter dropdowns offer the expected options', async ({ page }) => {
    expect(await readSelectOptions(page, 'SearchBy')).toEqual(['Name', 'Phone Number']);
    expect(await readSelectOptions(page, 'Status')).toEqual(STATUS_OPTIONS);
    expect(await readSelectOptions(page, 'PeriodOfMonths')).toEqual(['1 Month', '12 Months']);
    await expect(page.locator('mat-select[formcontrolname="SearchBy"]')).toContainText('Name');
  });

  test('TDCSR-03: Current year January-to-present date range is sent to the report API', async ({ page }) => {
    const { start, end } = currentYearToToday();
    await pickDateRange(page, start, end);
    const searched = await clickAndCapture(page, 'Search', API.subscriptions);
    expect(searched.request.DateRange, 'Picked range should be sent to the API.').toBe(apiDateRange(start, end));
    await expectTableMatchesApi(page, searched.body);
    console.log(`TDCSR-03: ${searched.body.TotalItemCount} subscriptions in ${searched.request.DateRange}.`);
  });

  test('TDCSR-04: Status and Period filters keep matching subscriptions and drop the others', async ({ page }) => {
    const unfiltered = await searchWideRange(page);
    const target = unfiltered.Items[0];
    const sameStatus = unfiltered.Items.filter((/** @type {any} */ i) => i.Status === target.Status);
    /** @param {any} body */
    const ids = (body) => body.Items.map((/** @type {any} */ i) => i.Id);

    // Positive: the subscription's own status + period keep it, and only matching rows come back.
    await chooseSelectOption(page, 'Status', target.Status);
    await chooseSelectOption(page, 'PeriodOfMonths', periodLabel(target.PeriodMonths));
    let searched = await clickAndCapture(page, 'Search', API.subscriptions);
    expect(searched.request.Status).toBe(target.Status);
    expect(searched.request.PereiodOfMonths).toBe(target.PeriodMonths);
    expect(ids(searched.body), `Subscription ${target.Id} (${target.Status}) should survive its own filters.`).toContain(target.Id);
    expect(searched.body.TotalItemCount).toBe(sameStatus.filter((/** @type {any} */ i) => i.PeriodMonths === target.PeriodMonths).length);
    await expectTableMatchesApi(page, searched.body);
    const rows = await rowCells(dataRows(page));
    expect(rows.length).toBeGreaterThan(0);
    for (const cells of rows) {
      expect(cells[STATUS_COLUMN], `Every row should have status ${target.Status}.`).toBe(target.Status);
      expect(cells[PERIOD_COLUMN], `Every row should be a ${target.PeriodMonths}-month subscription.`).toBe(String(target.PeriodMonths));
    }

    // Period really filters: same status, the other period.
    const otherPeriod = target.PeriodMonths === 1 ? 12 : 1;
    await chooseSelectOption(page, 'PeriodOfMonths', periodLabel(otherPeriod));
    searched = await clickAndCapture(page, 'Search', API.subscriptions);
    expect(searched.request.PereiodOfMonths).toBe(otherPeriod);
    expect(ids(searched.body), `A ${target.PeriodMonths}-month subscription must be excluded by Period=${otherPeriod}.`).not.toContain(target.Id);
    expect(searched.body.TotalItemCount).toBe(sameStatus.filter((/** @type {any} */ i) => i.PeriodMonths === otherPeriod).length);
    await expectTableMatchesApi(page, searched.body);

    // Status really filters: a status that none of the unfiltered subscriptions has.
    const absentStatus = ['Active', 'Trial', 'Paused', 'Expired', 'Canceled'].find((s) => !unfiltered.Items.some((/** @type {any} */ i) => i.Status === s));
    expect(absentStatus, 'Need a status that no subscription in the range has.').toBeTruthy();
    await chooseSelectOption(page, 'Status', /** @type {string} */ (absentStatus));
    await chooseSelectOption(page, 'PeriodOfMonths', periodLabel(target.PeriodMonths));
    searched = await clickAndCapture(page, 'Search', API.subscriptions);
    expect(searched.request.Status).toBe(absentStatus);
    expect(searched.request.PereiodOfMonths).toBe(target.PeriodMonths);
    expect(searched.body.TotalItemCount, `Status=${absentStatus} should return none of the ${unfiltered.TotalItemCount} subscriptions.`).toBe(0);
    await expectTableMatchesApi(page, searched.body);
  });

  test('TDCSR-05: Search by Phone Number with a non-matching value returns no rows', async ({ page }) => {
    const { start, end } = currentYearToToday();
    await pickDateRange(page, start, end);
    await chooseSelectOption(page, 'SearchBy', 'Phone Number');
    await searchInput(page).fill(NO_MATCH_TERM);
    const searched = await clickAndCapture(page, 'Search', API.subscriptions);
    expect(searched.request.SearchByText).toBe(NO_MATCH_TERM);
    expect(searched.request.SearchBy, 'Search-by should switch away from the user name.').not.toBe('USERNAME');
    expect(searched.body.TotalItemCount).toBe(0);
    await expectTableMatchesApi(page, searched.body);
  });

  test('TDCSR-06: Clear resets every filter and the date range to the defaults', async ({ page }) => {
    const defaults = await dateRangeValues(page);
    const { start, end } = currentYearToToday();
    await pickDateRange(page, start, end);
    await chooseSelectOption(page, 'Status', 'Expired');
    await searchInput(page).fill(NO_MATCH_TERM);
    expect(await dateRangeValues(page)).not.toEqual(defaults);

    const cleared = await clickAndCapture(page, 'Clear', API.subscriptions);
    expect(cleared.request.Status).toBe('');
    expect(cleared.request.SearchByText).toBe('');
    expect(cleared.request.PereiodOfMonths).toBeNull();
    await expect(searchInput(page)).toHaveValue('');
    await expect(page.locator('mat-select[formcontrolname="Status"]')).not.toContainText('Expired');
    expect(await dateRangeValues(page)).toEqual(defaults);
    await expectTableMatchesApi(page, cleared.body);
  });

  test('TDCSR-07: Search by Name and by Phone Number finds an existing subscriber', async ({ page }) => {
    const unfiltered = await searchWideRange(page);
    const target = unfiltered.Items[0];
    const firstName = target.FullName.split(/\s+/)[0];

    await searchInput(page).fill(firstName);
    let searched = await clickAndCapture(page, 'Search', API.subscriptions);
    expect(searched.request.SearchBy).toBe('USERNAME');
    expect(searched.request.SearchByText).toBe(firstName);
    expect(searched.body.Items.map((/** @type {any} */ i) => i.Id)).toContain(target.Id);
    await expectTableMatchesApi(page, searched.body);
    for (const cells of await rowCells(dataRows(page))) {
      expect(cells[USER_COLUMN].toLowerCase(), `Every row should match name "${firstName}".`).toContain(firstName.toLowerCase());
    }

    await chooseSelectOption(page, 'SearchBy', 'Phone Number');
    await searchInput(page).fill(target.PhoneNumber);
    searched = await clickAndCapture(page, 'Search', API.subscriptions);
    expect(searched.request.SearchBy).toBe('PHONENUMBER');
    expect(searched.request.SearchByText).toBe(target.PhoneNumber);
    expect(searched.body.Items.map((/** @type {any} */ i) => i.Id)).toContain(target.Id);
    await expectTableMatchesApi(page, searched.body);
    for (const cells of await rowCells(dataRows(page))) {
      expect(cells[PHONE_COLUMN], 'Every row should have the searched phone number.').toBe(target.PhoneNumber);
    }
  });

  test('TDCSR-08: Download exports the filtered report as an Excel file', async ({ page }, testInfo) => {
    const { start, end } = currentYearToToday();
    await pickDateRange(page, start, end);
    await clickAndCapture(page, 'Search', API.subscriptions);
    const file = await captureDownload(page, toolbarButton(page, 'Download'), testInfo, /\/api\/reports\/generateSubscriptionExel/i);
    expect(file.status, 'Export API should succeed.').toBe(200);
    expect(file.request.DateRange, 'Export should use the picked date range.').toBe(apiDateRange(start, end));
    expect(file.filename).toMatch(/^TMDONE_Subscription_\d{2}_\d{2}_\d{4},\d{2}_\d{2}\.xlsx$/);
    expect(file.size).toBeGreaterThan(0);
    expect(isXlsx(file.head), 'Downloaded file should be a real .xlsx (zip) file.').toBe(true);
  });

  test('TDCSR-09: View Reports > Subscription History shows the subscription history and exports it', async ({ page }, testInfo) => {
    const unfiltered = await searchWideRange(page);
    const target = unfiltered.Items[0];
    const { start, end } = previousYearToToday();
    const { dialog, request, body } = await openViewReport(page, target, 'View Subscription History', /\/api\/reports\/getSubscriptionHistory/i);
    expect(request.SubscriptionId, 'History should be loaded for the clicked subscription.').toBe(target.Id);
    expect(request.DateRange).toBe(apiDateRange(start, end));
    await expect(dialog.getByRole('heading', { name: 'Subscription History' })).toBeVisible();
    await expect(dialog.locator('thead th')).toHaveText(['Payment Ref', 'Type', 'Period (Months)', 'Amount (OMR)', 'Term Start', 'Term End', 'Date']);
    expect(body.TotalItemCount, 'The subscription should have at least one history entry.').toBeGreaterThan(0);
    const rows = dialog.locator('tbody tr').filter({ has: page.locator('td') });
    await expect(rows).toHaveCount(body.Items.length);
    await expect(dialog.getByText(new RegExp(`Total\\s+${body.TotalItemCount}\\s+results? found`))).toBeVisible();
    const cells = await rowCells(rows);
    body.Items.forEach((/** @type {any} */ item, /** @type {number} */ i) => {
      expect(cells[i][0]).toBe(item.PaymentRef);
      expect(cells[i][1].toUpperCase()).toBe(item.ActivationType.toUpperCase());
      expect(cells[i][2]).toBe(String(item.PricingSnapshot.PeriodMonths));
      expect(cells[i][3]).toBe(item.PricingSnapshot.Price.toFixed(3));
      expect(cells[i][4]).toBe(tableDate(item.TermStart));
      expect(cells[i][5]).toBe(tableDate(item.TermEnd));
    });
    expect(body.Items.map((/** @type {any} */ i) => i.PaymentRef), 'History should include the subscription payment.').toContain(target.PaymentRef);

    const file = await captureDownload(page, dialog.locator('button[mattooltip="Download"]'), testInfo, /\/api\/reports\/generateSubscriptionHistoryExel/i);
    expect(file.status).toBe(200);
    expect(file.request.SubscriptionId).toBe(target.Id);
    expect(file.filename).toMatch(/^TMDONE_Subscription_History_.*\.xlsx$/);
    expect(isXlsx(file.head), 'History export should be a real .xlsx file.').toBe(true);

    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('TDCSR-10: View Reports > Subscription Events lists the events of the subscription', async ({ page }) => {
    const unfiltered = await searchWideRange(page);
    const target = unfiltered.Items[0];
    const { dialog, request, body } = await openViewReport(page, target, 'View Subscription Events', /\/api\/reports\/getSubscriptionEvents/i);
    expect(request.SubscriptionId, 'Events should be loaded for the clicked subscription.').toBe(target.Id);
    expect(request.Type).toBe('');
    await expect(dialog.getByRole('heading', { name: 'Subscription Event' })).toBeVisible();
    await expect(dialog.locator('thead th')).toHaveText(['Payment Ref', 'Type', 'Amount (OMR)', 'Date']);
    const rows = dialog.locator('tbody tr').filter({ has: page.locator('td') });
    await expect(rows).toHaveCount(body.Items.length);
    await expect(dialog.getByText(new RegExp(`Total\\s+${body.TotalItemCount}\\s+results? found`))).toBeVisible();
    for (const [i, item] of body.Items.entries()) {
      await expect(rows.nth(i).locator('td').first()).toHaveText(String(item.PaymentRef));
    }
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
