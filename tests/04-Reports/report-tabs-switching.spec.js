// @ts-check
// ============================================================
// TMDone Admin Console - Reports page: tab bar and shared filters
// URL: #/home/reports
//
// The per-report spec files (fulfillment-report.spec.js etc.) each test one
// tab via defineReportSuite. This spec covers what the tabs share: the tab bar
// itself, the default date range the page opens with, the single Search that
// refreshes every report, and the multi-select store filter.
// ============================================================

import { test, expect } from '@playwright/test';
import {
  REPORT_TABS,
  TEST_STORES,
  activeTabBody,
  clickWhenReady,
  daysAgo,
  expectItemsBelongToStores,
  expectStoreColumnMatches,
  expectTotalResults,
  openReportsPage,
  parseUiDate,
  readDateRange,
  reportDateField,
  reportSearchButton,
  reportStoreSelect,
  setMultiSelectOption,
  switchToReportTab,
  toInputDate,
  waitForApi,
  waitForAppIdle,
} from '../helpers/reportHelper.js';

// Tab order as rendered by the app.
const EXPECTED_TAB_ORDER = [
  'Fulfillment Report',
  'Cancellation Reasons Report',
  'Orders Count Report',
  'Busy Vendors Report',
  'Menu Optimization Report',
  'Sales Report',
  'Target Offer Usage Report',
];

/**
 * Clicks Search and waits for every report API to answer for page 1.
 * @param {import('@playwright/test').Page} page
 * @param {(body: any) => boolean} predicate
 */
async function searchAllReports(page, predicate) {
  const pending = REPORT_TABS.map((report) => waitForApi(page, `reports/${report.api}`, (body) => body.Page === 1 && predicate(body)));
  await clickWhenReady(page, reportSearchButton(page), 'the Search button');
  const responses = await Promise.all(pending);
  /** @type {Record<string, { request: any, payload: any }>} */
  const results = {};
  for (let i = 0; i < REPORT_TABS.length; i += 1) {
    expect(responses[i].status(), `${REPORT_TABS[i].api} should answer 200.`).toBe(200);
    results[REPORT_TABS[i].api] = {
      request: JSON.parse(responses[i].request().postData() || '{}'),
      payload: await responses[i].json(),
    };
  }
  await waitForAppIdle(page);
  return results;
}

test.describe('Reports Tab Bar and Shared Filters', () => {
  test.describe.configure({ timeout: 300000 });

  test('RT-01: All expected report tabs are present in order', async ({ page }) => {
    await openReportsPage(page);
    const labels = (await page.getByRole('tab').allInnerTexts()).map((text) => text.trim());
    expect(labels, 'Reports tab bar should list every report, in the app order.').toEqual(EXPECTED_TAB_ORDER);
    await expect(page.getByRole('tab', { name: 'Fulfillment Report', exact: true }), 'Fulfillment is the default tab.').toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('RT-02: Switching tabs updates the displayed report for every tab', async ({ page }) => {
    const { payloads } = await openReportsPage(page);
    // Visit every tab in UI order and come back to the first one, so each
    // switch is a real change of the selected tab.
    const order = [...REPORT_TABS.slice(1), REPORT_TABS[0]];
    for (const report of order) {
      await switchToReportTab(page, report);
      const headers = (await activeTabBody(page).locator('thead th').allInnerTexts()).map((text) => text.trim());
      expect(headers, `"${report.tabLabel}" should show its own columns after switching.`).toEqual(report.columns);
      await expectTotalResults(activeTabBody(page), payloads[report.api].TotalItemCount);
      const otherTabsSelected = await page.locator('[role="tab"][aria-selected="true"]').count();
      expect(otherTabsSelected, 'Exactly one tab should be selected at a time.').toBe(1);
    }
  });

  test('RT-03: Page opens with the last 30 days pre-selected and auto-loads every report with it', async ({ page }) => {
    const { requests } = await openReportsPage(page);
    const range = await readDateRange(reportDateField(page));
    const start = /** @type {Date} */ (parseUiDate(range.start));
    const end = /** @type {Date} */ (parseUiDate(range.end));

    const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000);
    expect(spanDays, `Default range ${range.start} - ${range.end} should span 29-30 days.`).toBeGreaterThanOrEqual(29);
    expect(spanDays).toBeLessThanOrEqual(30);
    expect(end.getTime(), 'Default range should end yesterday or today.').toBeGreaterThanOrEqual(daysAgo(2).getTime());
    expect(end.getTime()).toBeLessThanOrEqual(daysAgo(0).getTime());

    for (const report of REPORT_TABS) {
      expect(requests[report.api].OrderDateRange, `${report.api} should auto-load with the pre-selected range.`).toBe(range.api);
      expect(requests[report.api].Page, `${report.api} should auto-load page 1.`).toBe(1);
    }
    console.log(`Default report range: ${range.start} - ${range.end} (today ${toInputDate(new Date())})`);
  });

  test('RT-04: One Search refreshes every report tab with the same filters', async ({ page }) => {
    await openReportsPage(page);
    const range = await readDateRange(reportDateField(page));
    const results = await searchAllReports(page, () => true);

    for (const report of REPORT_TABS) {
      expect(results[report.api].request.OrderDateRange, `${report.api} should use the shared date range.`).toBe(range.api);
    }
    // The tabs that were not visible during Search must also show the fresh data.
    for (const report of REPORT_TABS) {
      await switchToReportTab(page, report);
      await expectTotalResults(activeTabBody(page), results[report.api].payload.TotalItemCount);
    }
  });

  test('RT-05: Store dropdown is a searchable multi-select and two test stores filter every report', async ({ page }) => {
    /** @type {{ storeList?: any[] }} */
    const lookups = {};
    await openReportsPage(page, lookups);
    const [storeA, storeB] = TEST_STORES;

    await setMultiSelectOption(page, reportStoreSelect(page), storeA, true);
    await setMultiSelectOption(page, reportStoreSelect(page), storeB, true);
    await expect(reportStoreSelect(page), 'Both picked stores should be shown in the dropdown.').toContainText(storeA);
    await expect(reportStoreSelect(page)).toContainText(storeB);

    const results = await searchAllReports(page, (body) => Array.isArray(body.StoreIds) && body.StoreIds.length === 2);
    const expectedIds = (lookups.storeList || [])
      .filter((store) => [storeA, storeB].includes(String(store.Name).trim()))
      .map((store) => store.Id);
    expect(lookups.storeList?.length ?? 0, 'Store lookup list should have been loaded by the page.').toBeGreaterThan(0);

    for (const report of REPORT_TABS) {
      const { request, payload } = results[report.api];
      expect(request.StoreIds, `${report.api} should send one id per picked store.`).toHaveLength(2);
      for (const id of request.StoreIds) {
        expect(expectedIds, `${report.api} should only be filtered by the picked stores.`).toContain(id);
      }
      expectItemsBelongToStores(payload.Items, report, request.StoreIds, [storeA, storeB]);
      await switchToReportTab(page, report);
      await expectTotalResults(activeTabBody(page), payload.TotalItemCount);
      await expectStoreColumnMatches(activeTabBody(page), report, payload);
    }
  });
});
