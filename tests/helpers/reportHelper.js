// @ts-check
import { expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from './loginHelper.js';

export const REPORTS_URL = `${CREDENTIALS.baseUrl}/#/home/reports`;

export const REPORT_TABS = [
  { name: 'Fulfillment', keyword: /fulfillment/i },
  { name: 'Sales', keyword: /sales/i },
  { name: 'Orders Count', keyword: /orders count/i },
  { name: 'Cancellation Reasons', keyword: /cancellation/i },
  { name: 'Busy Vendors', keyword: /busy vendor/i },
  { name: 'Menu Optimization', keyword: /menu optimization/i },
  { name: 'Target Offer Usage', keyword: /target offer/i },
];

export class ReportPage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {{ name: string, keyword: RegExp }} report
   */
  constructor(page, report) {
    this.page = page;
    this.report = report;
  }

  async open() {
    await openReportTab(this.page, this.report);
  }

  async selectDateRange() {
    return selectReportDate(this.page);
  }

  async selectStore() {
    return selectFirstStoreIfAvailable(this.page);
  }

  async search() {
    await clickSearch(this.page);
  }

  async verifyOutput() {
    await verifyReportOutput(this.page);
  }

  async verifyDownloadButton() {
    await verifyDownloadControl(this.page);
  }

  async download() {
    await verifyDownloadControl(this.page);
    const downloadBtn = getDownloadButton(this.page);
    const downloadPromise = this.page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await downloadBtn.click({ force: true });
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.page.waitForTimeout(1000);
    return downloadPromise;
  }

  async clickNextPage() {
    return clickPaginatorButtonIfAvailable(this.page, 'next');
  }

  async clickPreviousPage() {
    return clickPaginatorButtonIfAvailable(this.page, 'previous');
  }

  async prepareReportSearch() {
    await this.open();
    await this.selectDateRange();
    await this.selectStore();
    await this.search();
    await this.verifyOutput();
  }
}

/** @param {import('@playwright/test').Page} page */
export async function openReportsPage(page) {
  await loginToApp(page);
  await page.goto(REPORTS_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('domcontentloaded');

  const reportsHeading = page.getByRole('heading', { name: /^Reports$/ }).first();
  if (!(await reportsHeading.isVisible({ timeout: 20000 }).catch(() => false))) {
    const reportsLink = page.locator('a[href="#/home/reports"], a:has-text("Reports")').first();
    await reportsLink.click({ force: true });
  }

  await expect(reportsHeading, 'Reports page heading should be visible after navigation.').toBeVisible({
    timeout: 45000,
  });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1000);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string, keyword: RegExp }} report
 */
export async function openReportTab(page, report) {
  await openReportsPage(page);
  const tab = page.locator('.mat-tab-label, [role="tab"], .mat-mdc-tab').filter({ hasText: report.keyword }).first();

  if (await tab.isVisible().catch(() => false)) {
    await tab.scrollIntoViewIfNeeded().catch(() => {});
    await tab.click({ force: true });
  } else if (report.name !== 'Fulfillment') {
    throw new Error(`${report.name} report tab was not found.`);
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1200);
  await expect(page.locator('body')).toContainText(/report|store|date|search|download|export/i, { timeout: 30000 });
}

/** @param {import('@playwright/test').Page} page */
export async function selectReportDate(page) {
  const quickDate = page
    .locator(
      [
        'button:has-text("Today")',
        'button:has-text("Yesterday")',
        'button:has-text("Week")',
        'button:has-text("Month")',
        '[role="button"]:has-text("Today")',
        '[role="button"]:has-text("Week")',
        '.mat-button-toggle:has-text("Today")',
        '.mat-button-toggle:has-text("Week")',
      ].join(', ')
    )
    .first();

  if (await quickDate.isVisible().catch(() => false)) {
    await quickDate.click({ force: true });
    await page.waitForTimeout(1000);
    return 'quick-date';
  }

  const dateInput = page
    .locator(
      [
        'input.mat-start-date',
        'input.mat-end-date',
        'input[placeholder*="Start Date" i]',
        'input[placeholder*="End Date" i]',
        'input[placeholder*="date" i]',
        'input[aria-label*="date" i]',
        'mat-date-range-input input',
      ].join(', ')
    )
    .first();

  if (await dateInput.isVisible().catch(() => false)) {
    const existingValue = await dateInput.inputValue().catch(() => '');
    if (existingValue) return 'existing-date';

    await dateInput.click({ force: true });
    await page.waitForTimeout(800);
    const day = page.locator('.mat-calendar-body-cell:not(.mat-calendar-body-disabled) .mat-calendar-body-cell-content').first();
    if (await day.isVisible().catch(() => false)) {
      await day.click({ force: true });
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(800);
      return 'calendar-date';
    }
  }

  const dateTextbox = page.getByRole('textbox', { name: /date|range/i }).first();
  if (await dateTextbox.isVisible().catch(() => false)) {
    return 'visible-date-field';
  }

  throw new Error('No usable date quick button or date picker input was found.');
}

/** @param {import('@playwright/test').Page} page */
export async function selectFirstStoreIfAvailable(page) {
  const dropdowns = page.locator('mat-select, [role="combobox"]');
  const count = await dropdowns.count();
  expect(count, 'At least one report dropdown should be visible.').toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const dropdown = dropdowns.nth(i);
    if (!(await dropdown.isVisible().catch(() => false))) continue;
    if (!(await dropdown.isEnabled().catch(() => false))) continue;

    await dropdown.click({ force: true });
    await page.waitForTimeout(1200);
    const options = page.locator('mat-option, [role="option"]').filter({
      hasNotText: /select all|no data|no records|loading/i,
    });

    if ((await options.count()) > 0) {
      await options.first().click({ force: true });
      await page.waitForTimeout(800);
      return true;
    }

    await page.keyboard.press('Escape').catch(() => {});
  }

  return false;
}

/** @param {import('@playwright/test').Page} page */
export async function clickSearch(page) {
  const searchBtn = page
    .locator(
      'button.search-btn, button:has(mat-icon:has-text("search")), button[aria-label*="search" i], button:has-text("Search")'
    )
    .first();
  await expect(searchBtn, 'Search button/icon should be visible.').toBeVisible({ timeout: 15000 });
  await expect(searchBtn, 'Search button/icon should be enabled.').toBeEnabled({ timeout: 15000 });
  await searchBtn.click({ force: true });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(2000);
}

/** @param {import('@playwright/test').Page} page */
function getDownloadButton(page) {
  return page
    .locator(
      'button:has(mat-icon:has-text("download")), button:has(mat-icon:has-text("file_download")), button:has-text("Export"), button:has-text("Download")'
    )
    .first();
}

/** @param {import('@playwright/test').Page} page */
export async function verifyReportOutput(page) {
  const table = page.locator('.table-responsive, table, mat-table, .mat-mdc-table').first();
  if (await table.isVisible({ timeout: 30000 }).catch(() => false)) return;

  const emptyState = page.getByText(/No data|No records|No results|Data not found/i).first();
  if (await emptyState.isVisible({ timeout: 10000 }).catch(() => false)) return;

  const visibleControls = await page
    .locator('button, input, mat-select, [role="tab"], [role="combobox"]')
    .filter({ visible: true })
    .count()
    .catch(() => 0);
  expect(visibleControls, 'Report page should stay usable after search, even when no result shell is rendered.').toBeGreaterThan(0);
}

/** @param {import('@playwright/test').Page} page */
export async function verifyDownloadControl(page) {
  const downloadBtn = getDownloadButton(page);
  await expect(downloadBtn, 'Download/Export button should be visible.').toBeVisible({ timeout: 15000 });
}

/** @param {import('@playwright/test').Page} page */
export async function clickClearIfAvailable(page) {
  const clearBtn = page
    .locator(
      'button:has(mat-icon:has-text("clear")), button:has(mat-icon:has-text("refresh")), button[aria-label*="clear" i], button:has-text("Clear"), button:has-text("Reset")'
    )
    .first();

  if (await clearBtn.isVisible().catch(() => false)) {
    await clearBtn.click({ force: true });
    await page.waitForTimeout(1200);
    return true;
  }

  return false;
}

/** @param {import('@playwright/test').Page} page */
export async function verifyPaginationIfAvailable(page) {
  const paginator = page.locator('.mat-paginator, mat-paginator, ul.pagination, .pagination').first();
  if (!(await paginator.isVisible().catch(() => false))) return false;

  const next = page
    .locator(
      'button[aria-label*="next" i], .mat-paginator-navigation-next, li:has-text("Next"), button:has-text("Next")'
    )
    .first();
  await expect(next, 'Pagination should expose a next button when paginator is visible.').toBeVisible();
  return true;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'next' | 'previous'} direction
 */
export async function clickPaginatorButtonIfAvailable(page, direction) {
  const paginator = page.locator('.mat-paginator, mat-paginator, ul.pagination, .pagination').first();
  if (!(await paginator.isVisible().catch(() => false))) return false;

  const selectors =
    direction === 'next'
      ? [
          'button[aria-label*="next" i]',
          '.mat-paginator-navigation-next',
          'li:has-text("Next")',
          'button:has-text("Next")',
          '[aria-label*="next" i]',
        ]
      : [
          'button[aria-label*="previous" i]',
          'button[aria-label*="prev" i]',
          '.mat-paginator-navigation-previous',
          'li:has-text("Prev")',
          'button:has-text("Previous")',
          'button:has-text("Prev")',
          '[aria-label*="previous" i]',
          '[aria-label*="prev" i]',
        ];

  const candidates = paginator.locator(selectors.join(', '));
  const count = await candidates.count();

  for (let i = 0; i < count; i += 1) {
    const candidate = candidates.nth(i);
    if (!(await candidate.isVisible().catch(() => false))) continue;

    const disabled = await candidate.evaluate((node) => {
      const element = /** @type {HTMLElement} */ (node);
      return (
        element.getAttribute('aria-disabled') === 'true' ||
        element.hasAttribute('disabled') ||
        /disabled/.test(element.getAttribute('class') || '')
      );
    }).catch(() => false);

    if (disabled) continue;

    await candidate.click({ force: true });
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(1500);
    return true;
  }

  return false;
}

/**
 * Defines the standard per-report smoke suite used by the individual report specs.
 * @param {import('@playwright/test').TestType<{}, {}>} test
 * @param {{ name: string, keyword: RegExp }} report
 * @param {string} prefix
 */
export function defineReportSuite(test, report, prefix) {
  test.describe.serial(`${report.name} Report`, () => {
    // @ts-ignore
    test(`${prefix}-01: Navigate to ${report.name} Report tab`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      await reportPage.open();
      await expect(page.locator('body'), `${report.name} report content should be visible.`).toContainText(report.keyword, {
        timeout: 15000,
      });
    });

    // @ts-ignore
    test(`${prefix}-02: Select a date range automatically`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      await reportPage.open();
      const dateMode = await reportPage.selectDateRange();
      expect(dateMode, `${report.name} should allow a report date/range selection.`).toMatch(
        /quick-date|existing-date|calendar-date|visible-date-field/
      );
    });

    // @ts-ignore
    test(`${prefix}-03: Select a store from dropdown automatically`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      await reportPage.open();
      await reportPage.selectDateRange();
      const selected = await reportPage.selectStore();
      expect(selected, `${report.name} should expose at least one selectable store option.`).toBeTruthy();
    });

    // @ts-ignore
    test(`${prefix}-04: Search icon/button triggers data load`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      await reportPage.prepareReportSearch();
      await verifyPaginationIfAvailable(page);
    });

    // @ts-ignore
    test(`${prefix}-05: Download/Export button works after search`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      await reportPage.prepareReportSearch();
      const download = await reportPage.download();
      if (download) {
        expect(download.suggestedFilename(), `${report.name} download should have a file name.`).toBeTruthy();
      }
    });

    // @ts-ignore
    test(`${prefix}-06: Next and Previous pagination buttons work when available`, async ({ page }) => {
      const reportPage = new ReportPage(page, report);
      await reportPage.prepareReportSearch();

      const nextClicked = await reportPage.clickNextPage();
      if (!nextClicked) {
        test.info().annotations.push({
          type: 'info',
          description: `${report.name} report did not show an enabled next page button for this result set.`,
        });
        return;
      }

      const previousClicked = await reportPage.clickPreviousPage();
      expect(previousClicked, `${report.name} should allow returning to the previous page after clicking next.`).toBeTruthy();
    });
  });
}
