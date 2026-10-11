// @ts-check
// ============================================================
// TMDone Admin Console - Report / Analysis helpers
//
// Used by tests/04-Reports, tests/05-Analysis and tests/10-Portfolio Analysis.
// All of these pages are read-only analytics: they share the same building
// blocks (mat-date-range pickers, an ngx-mat-select-search store/manager
// multi-select, a Search fab, a Download fab, an ngx-pagination table and a
// "Total N results found" footer), and every one of them is backed by a JSON
// API, so the tests verify what the UI shows against what the API returned.
// ============================================================
import fs from 'node:fs';
import { expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from './loginHelper.js';

export const REPORTS_URL = `${CREDENTIALS.baseUrl}/#/home/reports`;

/** Stores the user nominated for test data (read-only filtering only). */
export const TEST_STORES = ['Food House', 'Cafe Asiana', 'Eat Fresh Store'];

/**
 * @typedef {{
 *   name: string,
 *   keyword: RegExp,
 *   tabLabel: string,
 *   api: string,
 *   excelApi: string,
 *   filePattern: RegExp,
 *   columns: string[],
 *   storeColumn: string,
 *   storeField: string,
 *   dateColumn: string | null,
 * }} ReportConfig
 */

/** @type {ReportConfig[]} */
export const REPORT_TABS = [
  {
    name: 'Fulfillment',
    keyword: /fulfillment/i,
    tabLabel: 'Fulfillment Report',
    api: 'getFulfillmentReport',
    excelApi: 'getFulfillmentReportExcel',
    // The product spells the exported file name "Fullfilment".
    filePattern: /^TMDONE_Fullfilment_Report_.+\.xlsx$/,
    columns: [
      'Branch Name', 'Date/Time', 'Order ID', 'Delivery Zone', 'Status', 'Sector',
      'Minutes to Vendor Accept', 'Minutes to Driver Accept', 'Total Waiting Time', 'Minutes to Pickup',
      'Minutes to Arrive at Customer', 'Minutes to Hand Over', 'Minutes to Deliver', 'Total Hire Time',
      'Total Order Time', 'Minutes to Order Ready', 'Vendor Ready Time',
    ],
    storeColumn: 'Branch Name',
    storeField: 'StoreName',
    dateColumn: 'Date/Time',
  },
  {
    name: 'Sales',
    keyword: /sales/i,
    tabLabel: 'Sales Report',
    api: 'getSalesReport',
    excelApi: 'getSalesReportExcel',
    filePattern: /^TMDONE_Sales_Report_.+\.xlsx$/,
    columns: [
      'Service Type', 'Branch Name', 'Date/Time', 'Order ID', 'Status', 'Payment Method', 'Delivery Fee',
      'Municipality Tax', 'Municipality Tax VAT', 'Tourism Tax', 'Tourism Tax VAT', 'VAT On Order',
      'Order Total', 'Net Vendor Bill',
    ],
    storeColumn: 'Branch Name',
    storeField: 'StoreName',
    dateColumn: 'Date/Time',
  },
  {
    name: 'Orders Count',
    keyword: /orders count/i,
    tabLabel: 'Orders Count Report',
    api: 'getOrderCountReport',
    excelApi: 'getOrderCountExcelReport',
    filePattern: /^TMDONE_Order_Count_Report_.+\.xlsx$/,
    columns: [
      'Branch Name', 'Date', 'Completed Orders', 'Completed Orders Value (OMR)', 'Cancelled Orders',
      'Cancelled Orders Value (OMR)',
    ],
    storeColumn: 'Branch Name',
    storeField: 'StoreName',
    dateColumn: 'Date',
  },
  {
    name: 'Cancellation Reasons',
    keyword: /cancellation/i,
    tabLabel: 'Cancellation Reasons Report',
    api: 'getCancellationReasonReport',
    excelApi: 'getCancellationReasonExcelReport',
    filePattern: /^TMDONE_Cancellation_Reason_Report_.+\.xlsx$/,
    columns: [
      'Branch Name', 'Date/Time', 'Order ID', 'Amount', 'Total Time to Cancel (HH:MM)', 'Type',
      'Cancellation Reason', 'Cancellation Date/Time', 'Cancellation Comment',
    ],
    storeColumn: 'Branch Name',
    storeField: 'StoreName',
    dateColumn: 'Date/Time',
  },
  {
    name: 'Busy Vendors',
    keyword: /busy vendor/i,
    tabLabel: 'Busy Vendors Report',
    api: 'getVendorBusyReport',
    excelApi: 'getVendorBusyExcelReport',
    filePattern: /^TMDONE_Vendor_Busy_Report_.+\.xlsx$/,
    columns: ['Branch Name', 'Start Date & Time', 'End Date & Time', 'Duration (HH:MM)', 'Set Busy By', 'Reason'],
    storeColumn: 'Branch Name',
    storeField: 'StoreName',
    dateColumn: 'Start Date & Time',
  },
  {
    name: 'Menu Optimization',
    keyword: /menu optimization/i,
    tabLabel: 'Menu Optimization Report',
    api: 'getMenuOptimizationReport',
    excelApi: 'getMenuOptimizationExcelReport',
    filePattern: /^TMDONE_Menu_Optimization_Report_.+\.xlsx$/,
    columns: [
      'Branch Name', 'Cuisines', 'Menu Item Count', 'Images URL Count', '% of Items with Pictures',
      'English Description Count', '% of Items with English Description', 'Arabic Descrption Count',
      '% of Items with Arabic Description', 'Customization Count', '% of Items with Customization', 'Status',
      'Published',
    ],
    storeColumn: 'Branch Name',
    storeField: 'Name',
    // Menu Optimization is a snapshot of every store's menu; it has no date column.
    dateColumn: null,
  },
  {
    name: 'Target Offer Usage',
    keyword: /target offer/i,
    tabLabel: 'Target Offer Usage Report',
    api: 'getTargetOfferUsageReport',
    excelApi: 'getTargetOfferUsageReportExcel',
    filePattern: /^TMDONE_Target_Offer_Usage_Report_.+\.xlsx$/,
    columns: [
      'Offer Name', 'Order No', 'Store Name', 'Log Date', 'Customer Name', 'Customer Phone Number',
      'Discount Type', 'Discount Value', 'Discount Max Amount', 'Order Total',
    ],
    storeColumn: 'Store Name',
    storeField: 'StoreName',
    dateColumn: 'Log Date',
  },
];

/** @param {{ name: string }} report */
export function getReportConfig(report) {
  const config = REPORT_TABS.find((candidate) => candidate.name === report.name);
  if (!config) throw new Error(`No report configuration registered for "${report.name}".`);
  return config;
}

// ===================== generic page utilities =====================

/** @param {import('@playwright/test').Page} page */
export async function waitForAppIdle(page) {
  const blockers = page.locator('.ngx-spinner-overlay, app-page-loader, .loading-overlay, .loading-spinner');
  await expect
    .poll(
      () =>
        blockers.evaluateAll((nodes) =>
          nodes.filter((node) => {
            const element = /** @type {HTMLElement} */ (node);
            const style = window.getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
          }).length
        ),
      { timeout: 60000, message: 'Loading spinner overlay should disappear.' }
    )
    .toBe(0);
}

/**
 * Real click with a retry loop: the app's spinner overlay cycles in and out and
 * intercepts clicks, so wait for it and retry with a short timeout.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 * @param {string} description
 */
export async function clickWhenReady(page, locator, description) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await waitForAppIdle(page).catch(() => {});
    try {
      await locator.click({ timeout: 8000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1000);
    }
  }
  throw new Error(`Could not click ${description}: ${lastError instanceof Error ? lastError.message : lastError}`);
}

/** @param {string} text */
export function parseCount(text) {
  return Number(String(text).replace(/,/g, '').trim());
}

/** @param {Date} date */
export function toInputDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** @param {Date} date */
export function toApiDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}/${mm}/${dd}`;
}

/**
 * Parses the first dd/mm/yyyy found in a string (input values and table cells).
 * @param {string} text
 */
export function parseUiDate(text) {
  const match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(text || '');
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

/** @param {string} value dd/mm/yyyy */
export function inputDateToApi(value) {
  const date = parseUiDate(value);
  if (!date) throw new Error(`"${value}" is not a dd/mm/yyyy date.`);
  return toApiDate(date);
}

/** @param {number} daysAgo */
export function daysAgo(daysAgo) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Moves an open mat-calendar (month view) to the month of `target`.
 * @param {import('@playwright/test').Page} page
 * @param {Date} target
 */
async function navigateCalendarTo(page, target) {
  const calendar = page.locator('mat-calendar');
  const periodButton = calendar.locator('.mat-calendar-period-button');
  for (let step = 0; step < 36; step += 1) {
    const label = ((await periodButton.innerText()) || '').toUpperCase();
    const match = /([A-Z]{3})[A-Z]*\.?\s+(\d{4})/.exec(label);
    if (!match) throw new Error(`Unexpected calendar period label "${label}".`);
    const shownIndex = Number(match[2]) * 12 + MONTHS.indexOf(match[1]);
    const targetIndex = target.getFullYear() * 12 + target.getMonth();
    if (shownIndex === targetIndex) return;
    const button = calendar.locator(shownIndex < targetIndex ? '.mat-calendar-next-button' : '.mat-calendar-previous-button');
    await expect(button, `Calendar should allow navigating towards ${toInputDate(target)}.`).toBeEnabled();
    await button.click();
    await expect(periodButton).not.toHaveText(label, { ignoreCase: true });
  }
  throw new Error(`Calendar never reached the month of ${toInputDate(target)}.`);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {Date} day
 */
async function clickCalendarDay(page, day) {
  await navigateCalendarTo(page, day);
  const cell = page
    .locator('mat-calendar .mat-calendar-body-cell')
    .filter({ has: page.locator('.mat-calendar-body-cell-content', { hasText: new RegExp(`^\\s*${day.getDate()}\\s*$`) }) });
  await expect(cell, `Calendar day ${toInputDate(day)} should exist.`).toHaveCount(1);
  await expect(cell, `Calendar day ${toInputDate(day)} should be selectable.`).not.toHaveAttribute('aria-disabled', 'true');
  await cell.click();
}

/**
 * Picks a date range with the mat-date-range-picker inside `formField` and
 * verifies the read-only inputs show exactly the requested dates.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} formField  a mat-form-field holding a mat-date-range-input
 * @param {Date} start
 * @param {Date} end
 */
export async function pickDateRange(page, formField, start, end) {
  await clickWhenReady(page, formField.locator('button[aria-label="Open calendar"]'), 'the date range calendar toggle');
  await expect(page.locator('mat-calendar'), 'Date range calendar should open.').toBeVisible({ timeout: 15000 });
  await clickCalendarDay(page, start);
  await clickCalendarDay(page, end);
  await expect(page.locator('mat-calendar'), 'Calendar should close after the end date is picked.').toHaveCount(0, {
    timeout: 10000,
  });
  await expect(formField.locator('input.mat-start-date')).toHaveValue(toInputDate(start));
  await expect(formField.locator('input.mat-end-date')).toHaveValue(toInputDate(end));
}

/**
 * @param {import('@playwright/test').Locator} formField
 * @returns {Promise<{ start: string, end: string, api: string }>}
 */
export async function readDateRange(formField) {
  const start = await formField.locator('input.mat-start-date').inputValue();
  const end = await formField.locator('input.mat-end-date').inputValue();
  return { start, end, api: `${inputDateToApi(start)}-${inputDateToApi(end)}` };
}

/**
 * Opens an ngx-mat-select-search multi-select, waits for its (API-loaded)
 * options, narrows them with the search box and toggles the exact option.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} select  the mat-select element
 * @param {string} optionName exact option text
 * @param {boolean} shouldBeSelected the selected state the option must end in
 */
export async function setMultiSelectOption(page, select, optionName, shouldBeSelected) {
  await clickWhenReady(page, select, `the "${optionName}" dropdown`);
  const panel = page.locator('.mat-select-panel');
  await expect(panel, 'Select panel should open.').toBeVisible({ timeout: 15000 });
  await expect
    .poll(() => panel.locator('mat-option').count(), { timeout: 60000, message: 'Dropdown options should load.' })
    .toBeGreaterThan(1);

  const searchBox = panel.locator('input.mat-select-search-input:not(.mat-select-search-hidden)');
  if ((await searchBox.count()) > 0) {
    // The search box sits inside an aria-disabled mat-option wrapper: force is
    // only used to focus it, the typing itself is real keystrokes.
    // (Playwright's fill() refuses it for the same reason, so clear with keys.)
    await searchBox.first().click({ force: true });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await searchBox.first().pressSequentially(optionName, { delay: 30 });
    await expect
      .poll(
        async () => {
          const texts = await panel.locator('mat-option:not(.contains-mat-select-search)').allInnerTexts();
          return texts.length > 0 && texts.every((text) => text.toLowerCase().includes(optionName.toLowerCase()));
        },
        { timeout: 20000, message: `Dropdown search should narrow the options to "${optionName}".` }
      )
      .toBe(true);
  }

  const option = panel.getByRole('option', { name: optionName, exact: true });
  await expect(option, `Dropdown should contain exactly one "${optionName}" option.`).toHaveCount(1);
  const selectedNow = (await option.getAttribute('aria-selected')) === 'true';
  if (selectedNow !== shouldBeSelected) await option.click();
  await expect(option).toHaveAttribute('aria-selected', String(shouldBeSelected));

  // Multi-select panels stay open; their transparent backdrop closes them.
  const backdrop = page.locator('.cdk-overlay-transparent-backdrop');
  if ((await backdrop.count()) > 0) await backdrop.first().click();
  await expect(panel, 'Select panel should close.').toHaveCount(0, { timeout: 10000 });
}

/**
 * @param {import('@playwright/test').Response} response
 */
async function readJson(response) {
  expect(response.status(), `${response.url()} should answer 200.`).toBe(200);
  return response.json();
}

/**
 * Waits for a POST to /api/<path> whose JSON body satisfies `predicate`.
 * @param {import('@playwright/test').Page} page
 * @param {string} path e.g. 'reports/getSalesReport'
 * @param {(body: any) => boolean} [predicate]
 */
export function waitForApi(page, path, predicate = () => true, timeout = 90000) {
  return page.waitForResponse(
    (response) => {
      const request = response.request();
      if (request.method() !== 'POST') return false;
      if (!new URL(response.url()).pathname.endsWith(`/api/${path}`)) return false;
      try {
        return predicate(JSON.parse(request.postData() || '{}'));
      } catch {
        return false;
      }
    },
    { timeout }
  );
}

/**
 * Reads "Total N results found" inside `scope`.
 * @param {import('@playwright/test').Locator} scope
 */
export async function readTotalResults(scope) {
  const label = scope.getByText(/Total\s+[\d,]+\s+results found/i).first();
  await expect(label, '"Total N results found" footer should be visible.').toBeVisible({ timeout: 30000 });
  const match = /Total\s+([\d,]+)\s+results found/i.exec(await label.innerText());
  return parseCount(match ? match[1] : 'NaN');
}

/**
 * @param {import('@playwright/test').Locator} scope
 * @param {number} expected
 */
export async function expectTotalResults(scope, expected) {
  await expect(scope.getByText(/Total\s+[\d,]+\s+results found/i).first()).toHaveText(
    new RegExp(`Total\\s+${expected.toLocaleString('en-US').replace(/,/g, ',?')}\\s+results found`, 'i'),
    { timeout: 30000 }
  );
}

/** @param {import('@playwright/test').Locator} scope */
export async function readCurrentPage(scope) {
  const text = await scope.locator('li.current').first().innerText();
  return Number((text.match(/\d+/) || ['NaN'])[0]);
}

/**
 * @param {import('@playwright/test').Download} download
 * @param {RegExp} filePattern
 */
export async function expectXlsxDownload(download, filePattern) {
  expect(download.suggestedFilename(), 'Downloaded file name should match the report.').toMatch(filePattern);
  expect(await download.failure(), 'Download should complete without failure.').toBeNull();
  const filePath = await download.path();
  const bytes = fs.readFileSync(filePath);
  expect(bytes.length, 'Downloaded workbook should not be empty.').toBeGreaterThan(100);
  expect(bytes.subarray(0, 2).toString('latin1'), 'Downloaded file should be an .xlsx (zip) workbook.').toBe('PK');
}

/**
 * Column texts of the rows in `scope` for the given header.
 * @param {import('@playwright/test').Locator} scope
 * @param {string} header
 */
export async function columnValues(scope, header) {
  const headers = (await scope.locator('thead th').allInnerTexts()).map((text) => text.trim());
  const index = headers.indexOf(header);
  expect(index, `Column "${header}" should exist (headers: ${headers.join(' | ')}).`).toBeGreaterThanOrEqual(0);
  return scope
    .locator('tbody tr')
    .evaluateAll(
      (rows, columnIndex) =>
        rows
          .filter((row) => row.querySelectorAll('td').length > columnIndex)
          .map((row) => (row.querySelectorAll('td')[columnIndex].textContent || '').trim()),
      index
    );
}

/**
 * Every API row must belong to one of the filtered stores. Rows that carry a
 * StoreId are checked by id: the StoreName on an order row is a snapshot taken
 * when the order was placed, so a store that was renamed since (e.g. Cafe
 * Asiana, formerly "Store Alpha") legitimately shows its old name. Rows without
 * a StoreId (Sales) are checked by name.
 * @param {any[]} items
 * @param {ReportConfig} report
 * @param {string[]} storeIds ids sent in the request
 * @param {string[]} storeNames
 */
export function expectItemsBelongToStores(items, report, storeIds, storeNames) {
  for (const item of items) {
    if (item.StoreId) {
      expect(storeIds, `${report.api} returned a row of store id ${item.StoreId} ("${item[report.storeField]}") outside the filter.`).toContain(
        item.StoreId
      );
    } else {
      expect(storeNames, `${report.api} returned a row for another store.`).toContain(String(item[report.storeField] || '').trim());
    }
  }
}

/**
 * The store column must show exactly the store names of the API rows, in order.
 * @param {import('@playwright/test').Locator} body
 * @param {ReportConfig} report
 * @param {any} payload
 */
export async function expectStoreColumnMatches(body, report, payload) {
  await expect
    .poll(() => columnValues(body, report.storeColumn), { timeout: 30000, message: `${report.storeColumn} column should equal the API rows.` })
    .toEqual(payload.Items.map((/** @type {any} */ item) => String(item[report.storeField] || '').trim()));
}

// ===================== Reports page =====================

/** @param {import('@playwright/test').Page} page */
export function activeTabBody(page) {
  return page.locator('mat-tab-body.mat-tab-body-active');
}

/** @param {import('@playwright/test').Page} page */
export function reportDateField(page) {
  return page.locator('mat-form-field').filter({ has: page.locator('mat-date-range-input') }).first();
}

/** @param {import('@playwright/test').Page} page */
export function reportStoreSelect(page) {
  return page.locator('mat-select[formcontrolname="storeArr"]');
}

/** @param {import('@playwright/test').Page} page */
export function reportSearchButton(page) {
  return page.locator('button[mattooltip="Search"]');
}

/** @param {import('@playwright/test').Page} page */
export function reportDownloadButton(page) {
  return page.locator('button[mattooltip="Download"]');
}

/**
 * Logs in, opens the Reports page and returns the initial (auto-loaded) API
 * payload and request body of every report, keyed by API name.
 * @param {import('@playwright/test').Page} page
 * @param {{ storeList?: any[] }} [sink] receives the store lookup list when it loads
 */
export async function openReportsPage(page, sink) {
  await loginToApp(page);
  if (sink) {
    page.on('response', async (response) => {
      if (/getStoreList/i.test(response.url()) && response.status() === 200) {
        sink.storeList = await response.json().catch(() => sink.storeList);
      }
    });
  }
  const initial = Object.fromEntries(REPORT_TABS.map((report) => [report.api, waitForApi(page, `reports/${report.api}`)]));
  await page.goto(REPORTS_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await expect(page.getByRole('heading', { name: /^Reports$/ }).first(), 'Reports page heading should be visible.').toBeVisible({
    timeout: 60000,
  });
  /** @type {Record<string, any>} */
  const payloads = {};
  /** @type {Record<string, any>} */
  const requests = {};
  for (const [api, promise] of Object.entries(initial)) {
    const response = await promise;
    requests[api] = JSON.parse(response.request().postData() || '{}');
    payloads[api] = await readJson(response);
  }
  await waitForAppIdle(page);
  return { payloads, requests };
}

/**
 * The tab bar is wider than the card: tabs scrolled out of the header sit under
 * the header and cannot be clicked (scrollIntoView does not move a mat-tab
 * header). Use the header's own chevrons until the tab is fully in view.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} tab
 */
async function revealTab(page, tab) {
  const container = page.locator('.mat-tab-label-container').first();
  for (let step = 0; step < 20; step += 1) {
    const tabBox = await tab.boundingBox();
    const viewBox = await container.boundingBox();
    if (!tabBox || !viewBox) throw new Error('Report tab header is not rendered.');
    // The click lands on the tab centre, so that is what must be inside the header viewport.
    const centre = tabBox.x + tabBox.width / 2;
    const before = centre < viewBox.x + 8;
    const after = centre > viewBox.x + viewBox.width - 8;
    if (!before && !after) return;
    const chevron = page.locator(before ? '.mat-tab-header-pagination-before' : '.mat-tab-header-pagination-after').first();
    await expect(chevron, 'Tab header chevron should be enabled to reach the tab.').not.toHaveClass(/mat-tab-header-pagination-disabled/);
    await chevron.click();
    await page.waitForTimeout(400);
  }
  throw new Error('Could not scroll the report tab into view.');
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {ReportConfig} report
 */
export async function switchToReportTab(page, report) {
  const tab = page.getByRole('tab', { name: report.tabLabel, exact: true });
  await expect(tab, `"${report.tabLabel}" tab should exist.`).toBeVisible({ timeout: 30000 });
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await revealTab(page, tab);
    await clickWhenReady(page, tab, `the "${report.tabLabel}" tab`);
  }
  await expect(tab, `"${report.tabLabel}" tab should become selected.`).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('h5', { hasText: report.tabLabel }).first(), 'Report heading should follow the selected tab.').toBeVisible();
  await expect(activeTabBody(page).locator('thead th').first()).toHaveText(report.columns[0], { timeout: 30000 });
}

export class ReportPage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {{ name: string }} report
   */
  constructor(page, report) {
    this.page = page;
    this.report = getReportConfig(report);
    /** @type {{ storeList?: any[] }} */
    this.lookups = {};
    /** @type {any} */
    this.initial = null;
  }

  get body() {
    return activeTabBody(this.page);
  }

  /** Opens the Reports page on this report's tab; returns the initial API payload. */
  async open() {
    const { payloads } = await openReportsPage(this.page, this.lookups);
    this.initial = payloads[this.report.api];
    await switchToReportTab(this.page, this.report);
    return this.initial;
  }

  /**
   * Clicks Search and returns the payload/request body of this report's API call.
   * @param {(body: any) => boolean} [predicate]
   */
  async search(predicate = (body) => body.Page === 1) {
    const responsePromise = waitForApi(this.page, `reports/${this.report.api}`, predicate);
    await clickWhenReady(this.page, reportSearchButton(this.page), 'the Search button');
    const response = await responsePromise;
    const request = JSON.parse(response.request().postData() || '{}');
    const payload = await readJson(response);
    await waitForAppIdle(this.page);
    return { request, payload };
  }

  /**
   * Asserts the visible table equals the API payload.
   * @param {any} payload
   */
  async expectTableMatches(payload) {
    await expectTotalResults(this.body, payload.TotalItemCount);
    await expect(this.body.locator('tbody tr'), 'Rendered rows should equal the API page size.').toHaveCount(payload.Items.length, {
      timeout: 30000,
    });
    if (payload.Items.length > 0) {
      const stores = await columnValues(this.body, this.report.storeColumn);
      expect(stores[0], 'First row should be the first record returned by the API.').toBe(
        String(payload.Items[0][this.report.storeField] || '').trim()
      );
    }
  }

  async storeColumnValues() {
    return columnValues(this.body, this.report.storeColumn);
  }

  async dateColumnValues() {
    if (!this.report.dateColumn) return [];
    return columnValues(this.body, this.report.dateColumn);
  }

  /** Picks the first nominated test store that has rows in the initial result, else Food House. */
  pickTestStore() {
    const names = (this.initial?.Items || []).map((/** @type {any} */ item) => String(item[this.report.storeField] || '').trim());
    const store = TEST_STORES.find((candidate) => names.includes(candidate)) || TEST_STORES[0];
    return { store, expectRows: names.includes(store) };
  }

  /** @param {string} storeName */
  storeIdsFor(storeName) {
    return (this.lookups.storeList || [])
      .filter((/** @type {any} */ store) => String(store.Name || '').trim() === storeName)
      .map((/** @type {any} */ store) => store.Id);
  }

  /**
   * @param {string} storeName
   * @param {boolean} selected
   */
  async setStore(storeName, selected) {
    await setMultiSelectOption(this.page, reportStoreSelect(this.page), storeName, selected);
  }
}

/**
 * Defines the standard per-report suite used by the individual report specs.
 * @param {import('@playwright/test').TestType<any, any>} testType
 * @param {{ name: string, keyword: RegExp }} reportRef
 * @param {string} prefix
 */
export function defineReportSuite(testType, reportRef, prefix) {
  const report = getReportConfig(reportRef);

  testType.describe(`${report.name} Report`, () => {
    testType.describe.configure({ timeout: 240000 });

    testType(`${prefix}-01: Navigate to ${report.name} Report tab and verify its table`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      const initial = await reportPage.open();

      const headers = (await reportPage.body.locator('thead th').allInnerTexts()).map((text) => text.trim());
      expect(headers, `${report.name} table should show its documented columns.`).toEqual(report.columns);
      await reportPage.expectTableMatches(initial);
    });

    testType(`${prefix}-02: Pick a date range on the calendar and the report is filtered by it`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      await reportPage.open();

      const start = daysAgo(14);
      const end = daysAgo(1);
      await pickDateRange(page, reportDateField(page), start, end);
      const expectedRange = `${toApiDate(start)}-${toApiDate(end)}`;
      const { request, payload } = await reportPage.search((body) => body.Page === 1 && body.OrderDateRange === expectedRange);

      expect(request.OrderDateRange, 'Search should send the picked date range.').toBe(expectedRange);
      await reportPage.expectTableMatches(payload);

      if (report.dateColumn) {
        // One day of tolerance on each side for the store/server time zone offset.
        const min = new Date(start);
        min.setDate(min.getDate() - 1);
        const max = new Date(end);
        max.setDate(max.getDate() + 1);
        const dates = await reportPage.dateColumnValues();
        for (const value of dates) {
          const date = parseUiDate(value);
          expect(date, `"${value}" should be a dd/mm/yyyy date.`).not.toBeNull();
          expect(
            /** @type {Date} */ (date) >= min && /** @type {Date} */ (date) <= max,
            `${report.dateColumn} "${value}" should fall inside ${toInputDate(start)} - ${toInputDate(end)}.`
          ).toBe(true);
        }
      }
    });

    testType(`${prefix}-03: Filter the report by a test store`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      await reportPage.open();
      const { store, expectRows } = reportPage.pickTestStore();

      await reportPage.setStore(store, true);
      await expect(reportStoreSelect(page), 'Store dropdown should show the picked store.').toContainText(store);
      const { request, payload } = await reportPage.search((body) => body.Page === 1 && Array.isArray(body.StoreIds) && body.StoreIds.length === 1);

      const knownIds = reportPage.storeIdsFor(store);
      if (knownIds.length > 0) {
        expect(knownIds, `Search should send the id of "${store}".`).toContain(request.StoreIds[0]);
      }
      expectItemsBelongToStores(payload.Items, report, request.StoreIds, [store]);
      if (expectRows) {
        expect(payload.TotalItemCount, `"${store}" had rows before filtering, so it must still have rows.`).toBeGreaterThan(0);
      }
      await reportPage.expectTableMatches(payload);
      await expectStoreColumnMatches(reportPage.body, report, payload);
    });

    testType(`${prefix}-04: Search icon/button reloads the report for the current filters`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      await reportPage.open();
      const range = await readDateRange(reportDateField(page));

      const { request, payload } = await reportPage.search();
      expect(request.OrderDateRange, 'Search should send the date range shown in the inputs.').toBe(range.api);
      expect(request.StoreIds ?? [], 'No store is selected, so no store filter should be sent.').toEqual([]);
      await reportPage.expectTableMatches(payload);
    });

    testType(`${prefix}-05: Download exports the ${report.name} report as an .xlsx file`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      await reportPage.open();
      const range = await readDateRange(reportDateField(page));

      const exportRequest = page.waitForRequest(
        (request) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith(`/api/reports/${report.excelApi}`),
        { timeout: 60000 }
      );
      const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
      await clickWhenReady(page, reportDownloadButton(page), 'the Download button');

      const sent = JSON.parse((await exportRequest).postData() || '{}');
      expect(sent.OrderDateRange, 'Export should use the date range shown in the inputs.').toBe(range.api);
      await expectXlsxDownload(await downloadPromise, report.filePattern);
    });

    testType(`${prefix}-06: Next and Previous pagination buttons move between result pages`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      const initial = await reportPage.open();
      const body = reportPage.body;
      const next = body.locator('li.pagination-next');
      const previous = body.locator('li.pagination-previous');

      expect(await readCurrentPage(body), 'Report should start on page 1.').toBe(1);
      await expect(previous, 'Previous should be disabled on page 1.').toHaveClass(/disabled/);

      if (initial.PageCount <= 1) {
        // A single page of results: the pager must not offer a next page.
        await expect(next, `${report.name} has ${initial.TotalItemCount} rows (one page), so Next must be disabled.`).toHaveClass(/disabled/);
        return;
      }

      await expect(next, 'Next should be enabled when there is more than one page.').not.toHaveClass(/disabled/);
      const page2 = waitForApi(page, `reports/${report.api}`, (requestBody) => requestBody.Page === 2);
      await clickWhenReady(page, next.locator('a'), 'the Next page link');
      const page2Payload = await readJson(await page2);
      await expect.poll(() => readCurrentPage(body), { message: 'Pager should move to page 2.' }).toBe(2);
      await reportPage.expectTableMatches(page2Payload);

      const page1 = waitForApi(page, `reports/${report.api}`, (requestBody) => requestBody.Page === 1);
      await clickWhenReady(page, previous.locator('a'), 'the Previous page link');
      const page1Payload = await readJson(await page1);
      await expect.poll(() => readCurrentPage(body), { message: 'Pager should return to page 1.' }).toBe(1);
      await reportPage.expectTableMatches(page1Payload);
    });

    testType(`${prefix}-07: Clearing the store selection restores the all-stores report`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      const initial = await reportPage.open();
      const { store } = reportPage.pickTestStore();

      await reportPage.setStore(store, true);
      const filtered = await reportPage.search((body) => body.Page === 1 && Array.isArray(body.StoreIds) && body.StoreIds.length === 1);
      expect(filtered.payload.TotalItemCount, 'Filtered result cannot be larger than the unfiltered one.').toBeLessThanOrEqual(
        initial.TotalItemCount
      );

      await reportPage.setStore(store, false);
      const cleared = await reportPage.search((body) => body.Page === 1 && (body.StoreIds ?? []).length === 0);
      expect(cleared.request.StoreIds ?? [], 'After clearing, no store filter should be sent.').toEqual([]);
      expect(cleared.payload.TotalItemCount, 'Clearing the store should bring back the all-stores total.').toBe(initial.TotalItemCount);
      await reportPage.expectTableMatches(cleared.payload);
    });
  });
}

// ===================== Performance comparison pages =====================
// Analysis (#/home/analysis) and Portfolio Analysis (#/home/portfolio-analysis)
// share one "Performance Comparison Report" layout: date range 1 (previous
// period), date range 2 (current period), a store / account-manager
// multi-select, Search, Download and a paged table with a "Total" row.

/**
 * @param {import('@playwright/test').Page} page
 * @param {1 | 2} index
 */
export function comparisonRangeField(page, index) {
  return page.locator('mat-form-field').filter({ hasText: `Select date range ${index}` }).first();
}

/**
 * Data rows of a comparison table (excludes the "Total" summary row and the empty spacer row).
 * @param {import('@playwright/test').Page} page
 */
export async function comparisonDataRows(page) {
  const names = await page
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows
        .map((row) => row.querySelectorAll('td'))
        .filter((cells) => cells.length > 1)
        .map((cells) => (cells[0].textContent || '').trim())
    );
  return names.filter((name) => name !== 'Total');
}

/** Metric groups shown by the Analysis (per store) comparison table, in column order. */
export const ANALYSIS_METRICS = ['CompletedOrderCount', 'CancelledOrderCount', 'CancellationRatio', 'Sales', 'Aov'];
/** Portfolio Analysis (per account manager) adds the commission groups. */
export const PORTFOLIO_METRICS = [...ANALYSIS_METRICS, 'TotalCommission', 'CommissionPercentage'];

/**
 * Header texts of the first header row of a comparison table.
 * @param {string} nameHeader e.g. 'Brand Name'
 * @param {string[]} metrics
 */
export function comparisonHeaders(nameHeader, metrics) {
  /** @type {Record<string, string>} */
  const labels = {
    CompletedOrderCount: 'Completed Orders',
    CancelledOrderCount: 'Cancelled Orders',
    CancellationRatio: 'Cancellation Ratio %',
    Sales: 'Sales',
    Aov: 'AOV',
    TotalCommission: 'Commission',
    CommissionPercentage: 'Commission Rate %',
  };
  /** @type {string[]} */
  const headers = [nameHeader];
  for (const metric of metrics) headers.push(labels[metric], metric === 'CancellationRatio' ? 'Variance' : 'Variance %');
  return headers;
}

/**
 * All rendered cell texts of the comparison table body (rows with more than one cell).
 * @param {import('@playwright/test').Page} page
 */
export async function comparisonCells(page) {
  return page
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows
        .map((row) => [...row.querySelectorAll('td')].map((cell) => (cell.textContent || '').trim()))
        .filter((cells) => cells.length > 1)
    );
}

/**
 * Expected (numeric) cells for one API row: name, then value1, value2, variance per metric.
 * @param {any} row
 * @param {string[]} metrics
 */
function expectedComparisonCells(row, metrics) {
  /** @type {(string | number)[]} */
  const cells = [String(row.Name || '').trim()];
  for (const metric of metrics) {
    cells.push(Number(row[`${metric}1`] ?? 0), Number(row[`${metric}2`] ?? 0), Number(row[`${metric}Variance`] ?? 0));
  }
  return cells;
}

/**
 * Compares rendered cells with the API values (numbers are displayed rounded to 2-3 decimals).
 * @param {string[]} actual
 * @param {(string | number)[]} expected
 * @param {string} rowLabel
 */
function expectCellsMatch(actual, expected, rowLabel) {
  expect(actual.length, `${rowLabel}: rendered cell count`).toBe(expected.length);
  expect(actual[0], `${rowLabel}: name cell`).toBe(expected[0]);
  for (let i = 1; i < expected.length; i += 1) {
    const shown = parseCount(actual[i]);
    expect(Number.isNaN(shown), `${rowLabel}: cell ${i} "${actual[i]}" should be numeric.`).toBe(false);
    expect(
      Math.abs(shown - /** @type {number} */ (expected[i])),
      `${rowLabel}: cell ${i} shows "${actual[i]}" but the API value is ${expected[i]}.`
    ).toBeLessThanOrEqual(0.0051);
  }
}

/**
 * Asserts the comparison table shows exactly the API rows (every cell) and its Total row.
 * @param {import('@playwright/test').Page} page
 * @param {any} payload
 * @param {string[]} [metrics]
 */
export async function expectComparisonTableMatches(page, payload, metrics = ANALYSIS_METRICS) {
  await expectTotalResults(page.locator('body'), payload.TotalItemCount);
  await expect
    .poll(() => comparisonDataRows(page), { timeout: 30000, message: 'Table rows should equal the API rows, in order.' })
    .toEqual(payload.Report.map((/** @type {any} */ row) => String(row.Name || '').trim()));
  const cells = await comparisonCells(page);
  const dataCells = cells.filter((row) => row[0] !== 'Total');
  payload.Report.forEach((/** @type {any} */ row, /** @type {number} */ index) => {
    expectCellsMatch(dataCells[index], expectedComparisonCells(row, metrics), `Row ${index + 1} (${row.Name})`);
  });
  const totals = cells.filter((row) => row[0] === 'Total');
  expect(totals.length, 'Table should have exactly one Total summary row.').toBe(1);
  expect(cells[cells.length - 1][0], 'Total summary row should be the last row.').toBe('Total');
  expectCellsMatch(totals[0], expectedComparisonCells(payload.Total, metrics), 'Total row');
}

/**
 * Asserts the second header row shows the two compared ranges (yyyy/mm/dd-yyyy/mm/dd) for every metric.
 * @param {import('@playwright/test').Page} page
 * @param {string} range1
 * @param {string} range2
 * @param {number} metricCount
 */
export async function expectComparisonRangeHeaders(page, range1, range2, metricCount) {
  const subHeaders = page.locator('thead tr').nth(1).locator('th');
  /** @type {string[]} */
  const expected = [];
  for (let i = 0; i < metricCount; i += 1) expected.push(range1, range2);
  await expect
    .poll(async () => (await subHeaders.allInnerTexts()).map((text) => text.trim()).filter(Boolean), {
      timeout: 30000,
      message: 'Sub-header should label each metric with range 1 and range 2.',
    })
    .toEqual(expected);
}

/**
 * Logs in and opens a comparison page; returns the initial API payload.
 * @param {import('@playwright/test').Page} page
 * @param {string} hashPath e.g. '#/home/analysis'
 * @param {string} api e.g. 'reports/getPerformanceReport'
 * @param {RegExp} heading
 */
export async function openComparisonPage(page, hashPath, api, heading) {
  await loginToApp(page);
  const initial = waitForApi(page, api);
  await page.goto(`${CREDENTIALS.baseUrl}/${hashPath}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await expect(page.getByRole('heading', { name: heading }).first(), 'Page heading should be visible.').toBeVisible({ timeout: 60000 });
  const response = await initial;
  const request = JSON.parse(response.request().postData() || '{}');
  const payload = await readJson(response);
  await waitForAppIdle(page);
  return { request, payload };
}

/**
 * Clicks Search on a comparison page and returns the matching request/payload.
 * @param {import('@playwright/test').Page} page
 * @param {string} api
 * @param {(body: any) => boolean} [predicate]
 */
export async function searchComparison(page, api, predicate = (body) => body.Page === 1) {
  const responsePromise = waitForApi(page, api, predicate);
  await clickWhenReady(page, page.locator('button[mattooltip="Search"]'), 'the Search button');
  const response = await responsePromise;
  const request = JSON.parse(response.request().postData() || '{}');
  const payload = await readJson(response);
  await waitForAppIdle(page);
  return { request, payload };
}

/**
 * @typedef {{
 *   name: string,
 *   prefix: string,
 *   hashPath: string,
 *   api: string,
 *   excelApi: string,
 *   heading: RegExp,
 *   nameHeader: string,
 *   metrics: string[],
 *   filterControl: string,
 *   filterLabel: string,
 *   pickFilterValue: (initialPayload: any) => string,
 *   filePattern: RegExp,
 * }} ComparisonConfig
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {ComparisonConfig} config
 */
function comparisonFilterSelect(page, config) {
  return page.locator(`mat-select[formcontrolname="${config.filterControl}"]`);
}

/**
 * Defines the standard suite for a "Performance Comparison Report" page
 * (Analysis and Portfolio Analysis). Read-only: filters, search, export, paging.
 * @param {import('@playwright/test').TestType<any, any>} testType
 * @param {ComparisonConfig} config
 */
export function defineComparisonSuite(testType, config) {
  const { prefix, api, metrics } = config;
  const open = (/** @type {import('@playwright/test').Page} */ page) =>
    openComparisonPage(page, config.hashPath, api, config.heading);

  testType.describe(`${config.name} - Performance Comparison Report`, () => {
    testType.describe.configure({ timeout: 240000 });

    testType(`${prefix}-01: ${config.name} page loads with headings, columns and the API data`, async ({ page }) => {
      const { payload } = await open(page);
      expect(page.url(), 'URL should be the comparison page.').toContain(config.hashPath);
      await expect(page.getByRole('heading', { name: 'Performance Comparison Report' }).first()).toBeVisible();
      const headers = (await page.locator('thead tr').first().locator('th').allInnerTexts()).map((text) => text.trim());
      expect(headers, 'Comparison table should show its documented metric columns.').toEqual(
        comparisonHeaders(config.nameHeader, metrics)
      );
      await expectComparisonRangeHeaders(page, payload.DateRange1, payload.DateRange2, metrics.length);
      await expectComparisonTableMatches(page, payload, metrics);
    });

    testType(`${prefix}-02: Default ranges are two consecutive 30-day periods and are sent to the API`, async ({ page }) => {
      const { request } = await open(page);
      const range1 = await readDateRange(comparisonRangeField(page, 1));
      const range2 = await readDateRange(comparisonRangeField(page, 2));
      expect(request.DateRange1, 'Initial load should use date range 1 from the inputs.').toBe(range1.api);
      expect(request.DateRange2, 'Initial load should use date range 2 from the inputs.').toBe(range2.api);
      expect(request.Ids ?? [], 'Nothing is selected, so no id filter should be sent.').toEqual([]);

      const days = (/** @type {string} */ a, /** @type {string} */ b) =>
        Math.round((/** @type {Date} */ (parseUiDate(b)).getTime() - /** @type {Date} */ (parseUiDate(a)).getTime()) / 86400000);
      expect(days(range1.start, range1.end), `Range 1 ${range1.start}-${range1.end} should cover 30 calendar days.`).toBe(29);
      expect(days(range2.start, range2.end), `Range 2 ${range2.start}-${range2.end} should cover 30 calendar days.`).toBe(29);
      expect(days(range1.end, range2.start), 'Range 2 should start the day after range 1 ends.').toBe(1);
      const end2 = /** @type {Date} */ (parseUiDate(range2.end)).getTime();
      expect(end2, 'Range 2 should end yesterday or today.').toBeGreaterThanOrEqual(daysAgo(1).getTime());
      expect(end2).toBeLessThanOrEqual(daysAgo(0).getTime());
    });

    for (const index of [1, 2]) {
      testType(`${prefix}-0${index + 2}: Date range ${index} picked on the calendar is searched and shown in the table header`, async ({ page }) => {
        const { request: initialRequest } = await open(page);
        const start = index === 1 ? daysAgo(60) : daysAgo(20);
        const end = index === 1 ? daysAgo(41) : daysAgo(6);
        await pickDateRange(page, comparisonRangeField(page, /** @type {1|2} */ (index)), start, end);
        const picked = `${toApiDate(start)}-${toApiDate(end)}`;
        const otherKey = index === 1 ? 'DateRange2' : 'DateRange1';

        const { request, payload } = await searchComparison(page, api, (body) => body.Page === 1 && body[`DateRange${index}`] === picked);
        expect(request[`DateRange${index}`], `Search should send the picked range ${index}.`).toBe(picked);
        expect(request[otherKey], 'The other range should be unchanged.').toBe(initialRequest[otherKey]);
        expect(payload[`DateRange${index}`], 'API should answer for the picked range.').toBe(picked);
        await expectComparisonRangeHeaders(page, payload.DateRange1, payload.DateRange2, metrics.length);
        await expectComparisonTableMatches(page, payload, metrics);
      });
    }

    testType(`${prefix}-05: ${config.filterLabel} filter narrows the comparison to the picked value`, async ({ page }) => {
      const { payload: initial } = await open(page);
      const value = config.pickFilterValue(initial);
      await setMultiSelectOption(page, comparisonFilterSelect(page, config), value, true);
      await expect(comparisonFilterSelect(page, config), 'Dropdown should show the picked value.').toContainText(value);

      const { request, payload } = await searchComparison(page, api, (body) => body.Page === 1 && (body.Ids ?? []).length === 1);
      expect(request.Ids, 'Exactly one id should be sent.').toHaveLength(1);
      expect(payload.TotalItemCount, `"${value}" should have exactly one comparison row.`).toBe(1);
      expect(String(payload.Report[0].Name).trim()).toBe(value);
      await expectComparisonTableMatches(page, payload, metrics);
    });

    testType(`${prefix}-06: Clearing the ${config.filterLabel} selection restores the full comparison`, async ({ page }) => {
      const { payload: initial } = await open(page);
      const value = config.pickFilterValue(initial);
      await setMultiSelectOption(page, comparisonFilterSelect(page, config), value, true);
      await searchComparison(page, api, (body) => body.Page === 1 && (body.Ids ?? []).length === 1);

      await setMultiSelectOption(page, comparisonFilterSelect(page, config), value, false);
      const { request, payload } = await searchComparison(page, api, (body) => body.Page === 1 && (body.Ids ?? []).length === 0);
      expect(request.Ids ?? [], 'After clearing, no id filter should be sent.').toEqual([]);
      expect(payload.TotalItemCount, 'Clearing should bring back the unfiltered total.').toBe(initial.TotalItemCount);
      await expectComparisonTableMatches(page, payload, metrics);
    });

    testType(`${prefix}-07: Search button reloads the comparison for the ranges in the inputs`, async ({ page }) => {
      await open(page);
      const range1 = await readDateRange(comparisonRangeField(page, 1));
      const range2 = await readDateRange(comparisonRangeField(page, 2));
      const { request, payload } = await searchComparison(page, api);
      expect(request.DateRange1).toBe(range1.api);
      expect(request.DateRange2).toBe(range2.api);
      await expectComparisonTableMatches(page, payload, metrics);
    });

    testType(`${prefix}-08: Download exports the comparison as an .xlsx file`, async ({ page }) => {
      await open(page);
      const range1 = await readDateRange(comparisonRangeField(page, 1));
      const range2 = await readDateRange(comparisonRangeField(page, 2));
      const exportRequest = page.waitForRequest(
        (request) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith(`/api/${config.excelApi}`),
        { timeout: 60000 }
      );
      const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
      await clickWhenReady(page, page.locator('button[mattooltip="Download"]'), 'the Download button');
      const sent = JSON.parse((await exportRequest).postData() || '{}');
      expect(sent.DateRange1, 'Export should use range 1 from the inputs.').toBe(range1.api);
      expect(sent.DateRange2, 'Export should use range 2 from the inputs.').toBe(range2.api);
      await expectXlsxDownload(await downloadPromise, config.filePattern);
    });

    testType(`${prefix}-09: Next and Previous pagination buttons move between result pages`, async ({ page }) => {
      const { payload: initial } = await open(page);
      const body = page.locator('body');
      const next = page.locator('li.pagination-next');
      const previous = page.locator('li.pagination-previous');
      expect(await readCurrentPage(body), 'Comparison should start on page 1.').toBe(1);
      await expect(previous, 'Previous should be disabled on page 1.').toHaveClass(/disabled/);

      if (initial.PageCount <= 1) {
        await expect(next, `${config.name} has ${initial.TotalItemCount} rows (one page), so Next must be disabled.`).toHaveClass(/disabled/);
        return;
      }
      await expect(next, 'Next should be enabled when there is more than one page.').not.toHaveClass(/disabled/);
      const page2 = waitForApi(page, api, (requestBody) => requestBody.Page === 2);
      await clickWhenReady(page, next.locator('a'), 'the Next page link');
      const page2Payload = await readJson(await page2);
      await expect.poll(() => readCurrentPage(body), { message: 'Pager should move to page 2.' }).toBe(2);
      await expectComparisonTableMatches(page, page2Payload, metrics);
      expect(page2Payload.Report[0].Name, 'Page 2 should show different rows than page 1.').not.toBe(initial.Report[0].Name);

      const page1 = waitForApi(page, api, (requestBody) => requestBody.Page === 1);
      await clickWhenReady(page, previous.locator('a'), 'the Previous page link');
      const page1Payload = await readJson(await page1);
      await expect.poll(() => readCurrentPage(body), { message: 'Pager should return to page 1.' }).toBe(1);
      await expectComparisonTableMatches(page, page1Payload, metrics);
    });
  });
}
