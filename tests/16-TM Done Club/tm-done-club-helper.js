// @ts-check
// ============================================================
// Shared helpers for the TM Done Club pages:
//   #/home/tm-done-club/plans                 (Subscription Plans - VIEW-ONLY)
//   #/home/tm-done-club/cancellation-reasons  (Cancellation Reasons - VIEW-ONLY)
//   #/home/tm-done-club/subscriptions         (Subscriptions Reports - read-only)
//   #/home/tm-done-club/analytics             (TM Done Club Analytics - read-only)
// Nothing here creates, edits or deletes data. Row-action menus are only
// opened to verify the actions offered and are closed again without choosing.
// ============================================================
import { expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

export const TM_DONE_CLUB_ROUTES = {
  analytics: '#/home/tm-done-club/analytics',
  plans: '#/home/tm-done-club/plans',
  subscriptions: '#/home/tm-done-club/subscriptions',
  cancellationReasons: '#/home/tm-done-club/cancellation-reasons',
};

export const API = {
  plans: /\/api\/subscriptionPlan\/getAllSubscriptioPlansList/i,
  reasons: /\/api\/clubCancellationReasons\/getCancellationReasonsList/i,
  subscriptions: /\/api\/reports\/getSubscriptions/i,
  analytics: /\/api\/clubAnalytics\//i,
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * The date-range format the club APIs receive, e.g. "2026/01/01-2026/10/12".
 * @param {Date} start
 * @param {Date} end
 */
export function apiDateRange(start, end) {
  /** @param {Date} d */
  const fmt = (d) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  return `${fmt(start)}-${fmt(end)}`;
}

/** Current year 1 January .. today. */
export function currentYearToToday() {
  const end = new Date();
  return { start: new Date(end.getFullYear(), 0, 1), end };
}

/** @param {import('@playwright/test').Page} page */
export async function waitForNoSpinner(page) {
  for (const selector of ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay']) {
    await page.locator(selector).first().waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  }
}

/**
 * Real click that survives the cycling loader overlay.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 */
export async function clickWhenReady(page, locator, attempts = 5) {
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
 * Logs in and opens a club page, returning the JSON body of the first list /
 * analytics API response the page makes on load.
 * @param {import('@playwright/test').Page} page
 * @param {string} route
 * @param {string} heading exact page heading
 * @param {RegExp} apiPattern
 */
export async function openClubPage(page, route, heading, apiPattern) {
  await loginToApp(page);
  const responsePromise = page.waitForResponse((r) => apiPattern.test(r.url()) && r.request().method() !== 'OPTIONS', { timeout: 60000 });
  await goToPage(page, route);
  const response = await responsePromise;
  expect(response.status(), `${heading} data request should succeed.`).toBe(200);
  await expect(page).toHaveURL(new RegExp(route.replace('#', '').replace(/\//g, '\\/')), { timeout: 30000 });
  await expect(page.locator('h1, h2, h3, h4').filter({ hasText: new RegExp(`^\\s*${heading}\\s*$`) }).first(), `"${heading}" heading should render.`).toBeVisible({
    timeout: 30000,
  });
  await waitForNoSpinner(page);
  return response.json().catch(() => null);
}

/** @param {import('@playwright/test').Page} page */
export function toolbarButton(page, tooltip) {
  return page.locator(`button[mattooltip="${tooltip}"]`).filter({ visible: true }).first();
}

/** @param {import('@playwright/test').Page} page */
export function searchInput(page) {
  return page.locator('input[formcontrolname="SearchString"]').first();
}

/** Data rows (header/empty rows excluded). @param {import('@playwright/test').Page} page */
export function dataRows(page) {
  return page.locator('tbody tr').filter({ has: page.locator('td') });
}

/** @param {import('@playwright/test').Page} page */
export async function tableHeaders(page) {
  return (await page.locator('thead th').filter({ visible: true }).allInnerTexts()).map((h) => h.replace(/\s+/g, ' ').trim());
}

/**
 * Clicks a toolbar button and returns the parsed request body + response JSON
 * of the matching list API call.
 * @param {import('@playwright/test').Page} page
 * @param {string} tooltip 'Search' | 'Clear'
 * @param {RegExp} apiPattern
 */
export async function clickAndCapture(page, tooltip, apiPattern) {
  const responsePromise = page.waitForResponse((r) => apiPattern.test(r.url()) && r.request().method() === 'POST', { timeout: 45000 });
  await clickWhenReady(page, toolbarButton(page, tooltip));
  const response = await responsePromise;
  expect(response.status(), `${tooltip} request should succeed.`).toBe(200);
  const request = JSON.parse(response.request().postData() || '{}');
  const body = await response.json();
  await waitForNoSpinner(page);
  return { request, body };
}

/**
 * Asserts the table shows exactly the API's items and the "Total N results found" footer.
 * @param {import('@playwright/test').Page} page
 * @param {{ TotalItemCount: number, Items: any[] }} body
 */
export async function expectTableMatchesApi(page, body) {
  await expect(dataRows(page), 'Rendered rows should match the API page size.').toHaveCount(body.Items.length, { timeout: 20000 });
  await expect(page.getByText(new RegExp(`Total\\s+${body.TotalItemCount}\\s+results? found`, 'i')).first()).toBeVisible({ timeout: 15000 });
}

/**
 * Opens a row's "more_horiz" actions menu, returns the offered action labels
 * and closes the menu again WITHOUT choosing anything (no dialog is open, so
 * Escape is safe here).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} row
 */
export async function readRowActions(page, row) {
  await clickWhenReady(page, row.locator('mat-icon').filter({ hasText: /^more_horiz$/ }).first());
  const items = page.locator('.mat-menu-panel [mat-menu-item], .mat-menu-panel button');
  await expect(items.first(), 'Row-actions menu should open.').toBeVisible({ timeout: 10000 });
  const labels = (await items.allInnerTexts()).map((t) => t.replace(/^[a-z_]+(?=[A-Z])/, '').trim());
  await page.keyboard.press('Escape');
  await expect(page.locator('.mat-menu-panel')).toHaveCount(0, { timeout: 5000 });
  return labels;
}

/**
 * Opens a mat-select and returns its option labels; closes it without choosing.
 * @param {import('@playwright/test').Page} page
 * @param {string} controlName
 */
export async function readSelectOptions(page, controlName) {
  await clickWhenReady(page, page.locator(`mat-select[formcontrolname="${controlName}"]`).first());
  const options = page.locator('mat-option');
  await expect(options.first(), `"${controlName}" options should load.`).toBeVisible({ timeout: 10000 });
  const labels = (await options.allInnerTexts()).map((t) => t.trim());
  await page.keyboard.press('Escape');
  await expect(options.first()).toBeHidden({ timeout: 5000 });
  return labels;
}

/**
 * Picks an option of a single mat-select and verifies the trigger shows it.
 * @param {import('@playwright/test').Page} page
 * @param {string} controlName
 * @param {string} optionText
 */
export async function chooseSelectOption(page, controlName, optionText) {
  const select = page.locator(`mat-select[formcontrolname="${controlName}"]`).first();
  await clickWhenReady(page, select);
  const option = page.locator('mat-option').filter({ hasText: new RegExp(`^\\s*${optionText}\\s*$`) }).first();
  await expect(option, `"${controlName}" should offer "${optionText}".`).toBeVisible({ timeout: 10000 });
  await option.click();
  await expect(page.locator('mat-option').first()).toBeHidden({ timeout: 5000 });
  await expect(select).toContainText(optionText);
}

/**
 * Navigates the open mat-calendar to the month of `date` and clicks its day.
 * @param {import('@playwright/test').Page} page
 * @param {Date} date
 */
async function clickCalendarDay(page, date) {
  const target = new RegExp(`^${MONTHS[date.getMonth()]}[A-Z]*\\s+${date.getFullYear()}$`);
  for (let step = 0; step < 36; step += 1) {
    const period = ((await page.locator('.mat-calendar-period-button').first().innerText()) || '').trim().toUpperCase();
    if (target.test(period)) break;
    const [periodMonth, periodYear] = period.split(/\s+/);
    const current = Number(periodYear) * 12 + MONTHS.findIndex((m) => periodMonth.startsWith(m));
    const wanted = date.getFullYear() * 12 + date.getMonth();
    const button = page.locator(wanted < current ? 'button.mat-calendar-previous-button' : 'button.mat-calendar-next-button').first();
    await expect(button, `Calendar must be able to reach ${MONTHS[date.getMonth()]} ${date.getFullYear()} (at ${period}).`).toBeEnabled();
    await button.click();
  }
  const day = page
    .locator('.mat-calendar-body-cell:not(.mat-calendar-body-disabled)')
    .filter({ hasText: new RegExp(`^\\s*${date.getDate()}\\s*$`) })
    .first();
  await expect(day, `Day ${date.getDate()} should be selectable.`).toBeVisible({ timeout: 5000 });
  await day.click();
}

/**
 * Picks a range in the read-only "Select a date range" picker through its calendar.
 * @param {import('@playwright/test').Page} page
 * @param {Date} start
 * @param {Date} end
 */
export async function pickDateRange(page, start, end) {
  const toggle = page.locator('mat-datepicker-toggle button').filter({ visible: true }).first();
  await clickWhenReady(page, toggle);
  await expect(page.locator('mat-calendar').first(), 'Date range calendar should open.').toBeVisible({ timeout: 10000 });
  await clickCalendarDay(page, start);
  await clickCalendarDay(page, end);
  await expect(page.locator('mat-calendar'), 'Calendar should close once the range is complete.').toHaveCount(0, { timeout: 10000 });
  await expect(page.locator('input[formcontrolname="StartDate"]')).not.toHaveValue('');
  await expect(page.locator('input[formcontrolname="EndDate"]')).not.toHaveValue('');
}

/** @param {import('@playwright/test').Page} page */
export async function dateRangeValues(page) {
  return {
    start: await page.locator('input[formcontrolname="StartDate"]').inputValue(),
    end: await page.locator('input[formcontrolname="EndDate"]').inputValue(),
  };
}

/** 1 January of the previous year .. today (wide enough to always include the demo subscriptions). */
export function previousYearToToday() {
  const end = new Date();
  return { start: new Date(end.getFullYear() - 1, 0, 1), end };
}

/**
 * Clicks a read-only export control and returns the saved download plus the
 * export API call it made (when `apiPattern` is given). The file is saved in
 * the test's output dir and its leading bytes are returned for type checks.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} trigger
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {RegExp} [apiPattern]
 */
export async function captureDownload(page, trigger, testInfo, apiPattern) {
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
  const responsePromise = apiPattern
    ? page.waitForResponse((r) => apiPattern.test(r.url()) && r.request().method() !== 'OPTIONS', { timeout: 60000 })
    : Promise.resolve(null);
  await clickWhenReady(page, trigger);
  const [download, response] = await Promise.all([downloadPromise, responsePromise]);
  const filePath = testInfo.outputPath(`download-${Date.now()}-${download.suggestedFilename().replace(/[^\w.-]+/g, '_')}`);
  await download.saveAs(filePath);
  const fs = await import('node:fs');
  const bytes = fs.readFileSync(filePath);
  return {
    filename: download.suggestedFilename(),
    size: bytes.length,
    head: bytes.subarray(0, 8),
    request: response ? JSON.parse(response.request().postData() || '{}') : null,
    status: response ? response.status() : null,
  };
}

/** XLSX files are ZIP archives ("PK\x03\x04"). @param {Buffer} head */
export const isXlsx = (head) => head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
/** @param {Buffer} head */
export const isPng = (head) => head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/** Trimmed cell texts of every data row in `scope`. @param {import('@playwright/test').Locator} rows */
export function rowCells(rows) {
  return rows.evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => (td.textContent || '').trim())));
}

/**
 * Formats an ISO date the way the club tables do (dd/MM/yyyy, runner timezone).
 * @param {string} iso
 */
export function tableDate(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
