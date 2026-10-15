// @ts-check
// ============================================================
// TMDone Admin Console - TM Done Club - Analytics
// URL: #/home/tm-done-club/analytics
// Read-only dashboard: KPI cards and charts are checked against the
// api/clubAnalytics/* responses, the date range is verified in the requests
// the page sends, and card Refresh / Clear really re-query.
// ============================================================

import { test, expect } from '@playwright/test';
import { frontendIssue } from '../helpers/knownIssues.js';
import {
  TM_DONE_CLUB_ROUTES,
  API,
  openClubPage,
  toolbarButton,
  clickWhenReady,
  waitForNoSpinner,
  pickDateRange,
  dateRangeValues,
  apiDateRange,
  currentYearToToday,
  captureDownload,
  isPng,
} from './tm-done-club-helper.js';

const COUNT_CARDS = [
  { label: 'Total Subscriptions', status: 'Total' },
  { label: 'Purchase Subscriptions', status: 'Purchase' },
  { label: 'Renew Success Subscriptions', status: 'RenewSuccess' },
  { label: 'Pending Subscriptions', status: null },
  { label: 'Expired Subscriptions', status: 'Expire' },
  { label: 'Canceled Subscriptions', status: 'Cancel' },
];
const CHART_CARDS = [
  'Subscription Plan Distribution',
  'Renewal Rate',
  'Club Orders by Zone',
  'Club vs Non-Club Orders',
  'Savings & Earnings',
  'Active vs Inactive Subscribers',
  'Cancellation Reasons',
  'Renewal Conversion Funnel',
];
const ENDPOINTS = [
  'subscriptionCountByStatus',
  'subscriptionPercentageDistribution',
  'renewalRate',
  'clubOrdersByZone',
  'dailyOrdes',
  'subscriptionRevenueAnalytics',
  'usersBySubscriptionType',
  'mostCommonCancellationReasons',
  'renewalConversionFunnel',
];

/**
 * Starts listening for every analytics endpoint and resolves with
 * { endpoint: { dateRange, body } } once all have answered.
 * @param {import('@playwright/test').Page} page
 * @param {string[]} endpoints
 */
function captureAnalytics(page, endpoints = ENDPOINTS) {
  return Promise.all(
    endpoints.map((endpoint) =>
      page
        .waitForResponse((r) => r.url().includes(`/api/clubAnalytics/${endpoint}?`) && r.request().method() === 'GET', { timeout: 60000 })
        .then(async (r) => {
          expect(r.status(), `${endpoint} should succeed.`).toBe(200);
          return [endpoint, { dateRange: new URL(r.url()).searchParams.get('dateRange'), body: await r.json() }];
        })
    )
  ).then((entries) => Object.fromEntries(entries));
}

/** @param {import('@playwright/test').Page} page @param {string} title */
function chartCard(page, title) {
  return page.locator('.card').filter({ has: page.locator('h1, h2, h3, h4, h5, h6', { hasText: new RegExp(`^\\s*${title}\\s*$`) }) }).last();
}

/** @param {import('@playwright/test').Page} page @param {string} label */
function countCard(page, label) {
  return page.locator('.count-card').filter({ hasText: new RegExp(`^\\s*${label}\\s*-?\\d`) }).first();
}

test.describe('TM Done Club Analytics', () => {
  test.beforeEach(async () => {
    test.setTimeout(240000);
  });

  test('TDCA-01: Analytics page loads with KPI cards, chart cards and controls', async ({ page }) => {
    await openClubPage(page, TM_DONE_CLUB_ROUTES.analytics, 'TM Done Club Analytics', API.analytics);
    await expect(page.locator('input[formcontrolname="StartDate"]')).toBeVisible();
    await expect(page.locator('input[formcontrolname="EndDate"]')).toBeVisible();
    await expect(toolbarButton(page, 'Search')).toBeEnabled();
    await expect(toolbarButton(page, 'Clear')).toBeEnabled();
    for (const { label } of COUNT_CARDS) {
      await expect(countCard(page, label), `KPI card "${label}" should show a number.`).toBeVisible({ timeout: 20000 });
    }
    for (const title of CHART_CARDS) {
      const card = chartCard(page, title);
      await expect(card, `Chart card "${title}" should render.`).toBeVisible({ timeout: 20000 });
      await expect(card.locator('button[mattooltip="Download"]'), `"${title}" should offer Download.`).toBeVisible();
      await expect(card.locator('button[mattooltip="Refresh"]'), `"${title}" should offer Refresh.`).toBeVisible();
    }
    await expect(page.getByText('Key Insights').first()).toBeVisible();
  });

  test('TDCA-02: KPI cards and summary widgets match the analytics API', async ({ page }) => {
    const capture = captureAnalytics(page, ['subscriptionCountByStatus', 'renewalRate', 'subscriptionRevenueAnalytics', 'usersBySubscriptionType']);
    await openClubPage(page, TM_DONE_CLUB_ROUTES.analytics, 'TM Done Club Analytics', API.analytics);
    const data = await capture;
    await waitForNoSpinner(page);

    for (const { label, status } of COUNT_CARDS) {
      if (!status) continue;
      const item = data.subscriptionCountByStatus.body.find((/** @type {any} */ s) => s.Status === status);
      expect(item, `API should report a "${status}" count.`).toBeTruthy();
      await expect(countCard(page, label), `"${label}" should show ${item.Count}.`).toContainText(new RegExp(`${label}\\s*${item.Count}\\b`));
    }
    const rate = Number(data.renewalRate.body).toFixed(1);
    await expect(chartCard(page, 'Renewal Rate')).toContainText(`${rate}%`);
    const revenue = data.subscriptionRevenueAnalytics.body;
    await expect(chartCard(page, 'Savings & Earnings')).toContainText(`${revenue.TotalSavings} OMR`);
    await expect(chartCard(page, 'Savings & Earnings')).toContainText(`${revenue.TotalRevenue} OMR`);
    const users = data.usersBySubscriptionType.body;
    // Labels are upper-cased by CSS only; the DOM text is "Active<n>Inactive<n>".
    await expect(chartCard(page, 'Active vs Inactive Subscribers')).toContainText(new RegExp(`(?<!In)Active\\s*${users.Active}(?!\\d)`, 'i'));
    await expect(chartCard(page, 'Active vs Inactive Subscribers')).toContainText(new RegExp(`Inactive\\s*${users.Inactive}(?!\\d)`, 'i'));
  });

  test('TDCA-03: Date range filter re-queries every analytics endpoint with the picked range', async ({ page }) => {
    const initial = captureAnalytics(page, ['subscriptionCountByStatus']);
    await openClubPage(page, TM_DONE_CLUB_ROUTES.analytics, 'TM Done Club Analytics', API.analytics);
    const defaultRange = (await initial).subscriptionCountByStatus.dateRange;

    const { start, end } = currentYearToToday();
    const expected = apiDateRange(start, end);
    expect(expected, 'The picked range must differ from the default range.').not.toBe(defaultRange);
    await pickDateRange(page, start, end);
    const capture = captureAnalytics(page);
    await clickWhenReady(page, toolbarButton(page, 'Search'));
    const data = await capture;
    for (const endpoint of ENDPOINTS) {
      expect(data[endpoint].dateRange, `${endpoint} should be queried with the picked range.`).toBe(expected);
    }
    await waitForNoSpinner(page);
    const total = data.subscriptionCountByStatus.body.find((/** @type {any} */ s) => s.Status === 'Total');
    await expect(countCard(page, 'Total Subscriptions')).toContainText(new RegExp(`Total Subscriptions\\s*${total.Count}\\b`));
  });

  test('TDCA-04: Clear restores the default date range and re-queries', async ({ page }) => {
    const initial = captureAnalytics(page, ['subscriptionCountByStatus']);
    await openClubPage(page, TM_DONE_CLUB_ROUTES.analytics, 'TM Done Club Analytics', API.analytics);
    const defaultRange = (await initial).subscriptionCountByStatus.dateRange;
    const defaultInputs = await dateRangeValues(page);

    const { start, end } = currentYearToToday();
    await pickDateRange(page, start, end);
    expect(await dateRangeValues(page)).not.toEqual(defaultInputs);

    const capture = captureAnalytics(page, ['subscriptionCountByStatus']);
    await clickWhenReady(page, toolbarButton(page, 'Clear'));
    const data = await capture;
    expect(data.subscriptionCountByStatus.dateRange, 'Clear should re-query with the default range.').toBe(defaultRange);
    expect(await dateRangeValues(page)).toEqual(defaultInputs);
  });

  test('TDCA-05: Card Refresh re-queries only that widget', {
    annotation: frontendIssue('TM Done Club Analytics: the Refresh button on the chart cards sends no api/clubAnalytics request, so it does not reload its chart. First seen 2026-10-12.'),
  }, async ({ page }) => {
    await openClubPage(page, TM_DONE_CLUB_ROUTES.analytics, 'TM Done Club Analytics', API.analytics);
    await waitForNoSpinner(page);
    await page.waitForLoadState('networkidle').catch(() => {});

    /** @type {string[]} */
    const requested = [];
    page.on('request', (r) => {
      const match = r.url().match(/\/api\/clubAnalytics\/([A-Za-z]+)\?/);
      if (match && r.method() === 'GET') requested.push(match[1]);
    });
    await clickWhenReady(page, chartCard(page, 'Renewal Rate').locator('button[mattooltip="Refresh"]'));
    // Known product issue (2026-10-12): none of the 8 chart-card Refresh buttons sends any
    // api/clubAnalytics request, so this stays red until Refresh really reloads its widget.
    await expect
      .poll(() => requested.slice(), {
        message:
          'Renewal Rate "Refresh" should re-request api/clubAnalytics/renewalRate (and nothing else). ' +
          'On 2026-10-12 no card Refresh button sent any request - product issue.',
        timeout: 20000,
      })
      .toEqual(['renewalRate']);
  });

  test('TDCA-06: Every chart card Download saves a PNG image of that chart', async ({ page }, testInfo) => {
    await openClubPage(page, TM_DONE_CLUB_ROUTES.analytics, 'TM Done Club Analytics', API.analytics);
    await waitForNoSpinner(page);
    /** @type {string[]} */
    const names = [];
    for (const title of CHART_CARDS) {
      const file = await captureDownload(page, chartCard(page, title).locator('button[mattooltip="Download"]'), testInfo);
      expect(file.filename, `"${title}" should download as a *-chart.png file.`).toMatch(/^[A-Za-z-]+-chart\.png$/);
      expect(file.size, `"${title}" image should not be empty.`).toBeGreaterThan(100);
      expect(isPng(file.head), `"${title}" download should be a real PNG image.`).toBe(true);
      names.push(file.filename);
    }
    expect(names[0]).toBe('subscription-Plan-Distribution-chart.png');
    expect(new Set(names).size, `Each chart should export its own image: ${names.join(', ')}`).toBe(CHART_CARDS.length);
  });
});
