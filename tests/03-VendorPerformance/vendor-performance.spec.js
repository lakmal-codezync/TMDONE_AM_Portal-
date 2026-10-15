// ============================================================
// TMDone Admin Console - Vendor Performance (read-only analytics)
// ============================================================
// Every widget on this page is fed by a POST to /api/performance/*.
// The tests capture those API responses and verify that the page
// renders exactly the returned data (KPI cards, cancellation reasons,
// customers, response time, vendor delay, order health, top selling
// items/areas, the Order Performance table and its pagination), and
// that the store filter, Today/Week/Month buttons, the custom date
// range and the Search button send the right filter and re-render.
//
// Test data policy: store filter uses "Cafe Asiana". Nothing on this
// page is created, edited or deleted.
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from '../helpers/loginHelper.js';
import { backendIssue } from '../helpers/knownIssues.js';

// ===================== CONSTANTS ============================
const BASE_URL = CREDENTIALS.baseUrl;
const VP_URL = `${BASE_URL}/#/home/vendor-performance`;
const TEST_STORE = 'Cafe Asiana';
const PAGE_READY_TIMEOUT = 90000;
// getCustomerInfo is very slow on the demo backend (~40 s unfiltered).
// Measured up to ~3 min when the shared backend is busy.
const SLOW_API_TIMEOUT = 240000;

// ===================== HELPERS ==============================

const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** yyyy/MM/dd - the format the app sends in DateRange. */
function fmtApiDate(date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

/** dd/MM/yyyy - the format the date-range inputs display. */
function fmtInputDate(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/** DateRange computed by GlobalService.setDateRequest for the quick filters. */
function expectedQuickRange(type) {
  if (type === 'Today') return `${fmtApiDate(daysAgo(0))}-${fmtApiDate(daysAgo(0))}`;
  if (type === 'Week') return `${fmtApiDate(daysAgo(7))}-${fmtApiDate(daysAgo(1))}`;
  return `${fmtApiDate(daysAgo(30))}-${fmtApiDate(daysAgo(1))}`;
}

/**
 * Calendar period label, e.g. "SEPT 2026" / "OCT 2026". The app's
 * DateAdapter abbreviates some months with 4 letters (SEPT), so match
 * the 3-letter month prefix followed by any letters and the year.
 */
function calendarLabel(date) {
  const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase().slice(0, 3);
  return new RegExp(`^\\s*${month}[A-Z]*\\s+${date.getFullYear()}\\s*$`);
}

/**
 * Records every amportal /api/* response as {endpoint, status,
 * requestBody, body}. Attach before loginToApp.
 * @param {import('@playwright/test').Page} page
 */
function trackApi(page) {
  const calls = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (!/\/api\/(performance|looksup)\//.test(url)) return;
    const endpoint = url.split('?')[0].split('/').filter(Boolean).pop();
    let requestBody = null;
    try {
      requestBody = response.request().postDataJSON();
    } catch {
      requestBody = null;
    }
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    calls.push({ endpoint, status: response.status(), requestBody, body });
  });

  return {
    calls,
    count(endpoint) {
      return calls.filter((call) => call.endpoint === endpoint).length;
    },
    async latest(endpoint, predicate = () => true, timeout = PAGE_READY_TIMEOUT) {
      let match;
      await expect
        .poll(
          () => {
            match = [...calls].reverse().find((call) => call.endpoint === endpoint && predicate(call));
            return Boolean(match);
          },
          { timeout, message: `Expected a response from /api/.../${endpoint}` }
        )
        .toBe(true);
      expect(match.status, `${endpoint} should return HTTP 200`).toBe(200);
      return match;
    },
  };
}

/**
 * Real click that tolerates the app's cycling spinner overlay.
 * @param {import('@playwright/test').Locator} locator
 */
async function clickWhenReady(locator, attempts = 5) {
  const page = locator.page();
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.locator('.ngx-spinner-overlay, app-page-loader').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    try {
      await locator.click({ timeout: 8000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** @param {import('@playwright/test').Page} page */
async function openVendorPerformance(page) {
  const api = trackApi(page);
  await loginToApp(page);
  await page.goto(VP_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await expect(page.locator('h4.page-header', { hasText: 'Vendor Performance' })).toBeVisible({ timeout: PAGE_READY_TIMEOUT });
  return api;
}

/**
 * KPI card values for "Successful Orders" / "Failed Orders".
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 */
async function readKpiCard(page, title) {
  const card = page.locator('app-order-panel .plain-card').filter({ hasText: title });
  const text = norm(await card.innerText());
  const match = text.match(/(\d+) Order\(s\) ([\d.]+) OMR Compared to (.+?) (\d+)%/);
  if (match) return { count: Number(match[1]), amount: match[2], prior: match[3], percentage: Number(match[4]) };
  // Custom date ranges show no "Compared to" block.
  const plain = text.match(/^\S.*? (\d+) Order\(s\) ([\d.]+) OMR$/);
  return plain ? { count: Number(plain[1]), amount: plain[2] } : { raw: text };
}

/**
 * Asserts both KPI cards show exactly the getOrderInfo response.
 * Quick filters (Today/Week/Month) show a "Compared to <prior> N%"
 * block with a trend arrow; a custom date range (DateReqType "Day")
 * shows only the count and amount.
 * @param {import('@playwright/test').Page} page
 * @param {any} orderInfo
 * @param {{compare?: boolean}} [options]
 */
async function expectKpisMatchApi(page, orderInfo, { compare = true } = {}) {
  for (const [title, key] of [
    ['Successful Orders', 'SuccessfulOrder'],
    ['Failed Orders', 'FailedOrder'],
  ]) {
    const data = orderInfo[key];
    await expect
      .poll(() => readKpiCard(page, title), { timeout: 30000, message: `${title} card should match getOrderInfo.${key}` })
      .toEqual(
        compare
          ? {
              count: data.CurrentCount,
              amount: Number(data.Current).toFixed(3),
              prior: orderInfo.DataLabels.Prior,
              percentage: Math.round(Math.abs(data.Percentage)),
            }
          : { count: data.CurrentCount, amount: Number(data.Current).toFixed(3) }
      );
    const card = page.locator('app-order-panel .plain-card').filter({ hasText: title });
    if (compare) {
      await expect(card.locator(`i.fa-level-${data.IsUp ? 'up' : 'down'}-alt`)).toHaveCount(1);
    } else {
      await expect(card.getByText('Compared to')).toHaveCount(0);
      await expect(card.locator('i[class*="fa-level-"]')).toHaveCount(0);
    }
  }
}

/**
 * Reads the Order Performance table rows.
 * @param {import('@playwright/test').Page} page
 */
async function readOrderTable(page) {
  return page.locator('app-order-performance table tbody tr').evaluateAll((rows) =>
    rows.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim()))
  );
}

/**
 * Asserts the Order Performance table renders exactly the given page of
 * the performanceReport response.
 * @param {import('@playwright/test').Page} page
 * @param {any} report
 */
async function expectOrderTableMatchesApi(page, report) {
  // The backend currently returns every matching order in Items (it does
  // not page server-side); the table shows the PageNumber slice of
  // PageSize rows. Handle both shapes.
  const size = report.PageSize || 50;
  const pageNo = report.PageNumber || 1;
  const items = report.Items.length > size ? report.Items.slice((pageNo - 1) * size, pageNo * size) : report.Items;
  const expected = items.map((item) => [
    norm(item.StoreName),
    item.OrderNo,
    norm(item.Zone),
    item.PaymentMethod,
    Number(item.Amount).toFixed(3),
    item.Status,
    `${Number(item.VendorResponseTime).toFixed(2)} Min`,
    `${Number(item.VendorDelay).toFixed(2)} Min`,
    item.OrderHealth,
  ]);
  await expect
    .poll(
      async () =>
        (await readOrderTable(page)).map((cells) => [cells[0], cells[2], cells[3], cells[4], cells[5], cells[6], cells[7], cells[8], cells[9]]),
      { timeout: 30000, message: 'Order Performance table should render the performanceReport items' }
    )
    .toEqual(expected);
  if (report.TotalItemCount > 0) {
    await expect(page.locator('app-order-performance .results')).toHaveText(`Total ${report.TotalItemCount} results found`);
  }
}

/**
 * Picks a start/end day (both in the past) from the range picker and
 * verifies the inputs show exactly those dates.
 * @param {import('@playwright/test').Page} page
 */
async function pickDateRange(page, start, end) {
  const now = new Date();
  await clickWhenReady(page.locator('mat-datepicker-toggle button').first());
  const calendar = page.locator('mat-calendar');
  await expect(calendar).toBeVisible();

  const monthsBetween = (from, to) => (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  for (let i = 0; i < monthsBetween(start, now); i += 1) {
    await clickWhenReady(calendar.locator('.mat-calendar-previous-button'));
  }
  await expect(calendar.locator('.mat-calendar-period-button')).toHaveText(calendarLabel(start));
  const day = (n) => calendar.locator('.mat-calendar-body-cell-content').filter({ hasText: new RegExp(`^\\s*${n}\\s*$`) }).first();
  await clickWhenReady(day(start.getDate()));

  for (let i = 0; i < monthsBetween(start, end); i += 1) {
    await clickWhenReady(calendar.locator('.mat-calendar-next-button'));
  }
  await expect(calendar.locator('.mat-calendar-period-button')).toHaveText(calendarLabel(end));
  await clickWhenReady(day(end.getDate()));
  await expect(calendar).toBeHidden();

  await expect(page.locator('input[formcontrolname="start"]')).toHaveValue(fmtInputDate(start));
  await expect(page.locator('input[formcontrolname="end"]')).toHaveValue(fmtInputDate(end));
}

/**
 * Selects TEST_STORE in the store multi-select using its search box and
 * closes the panel. Returns the store's Id from the getStoreList lookup.
 * @param {import('@playwright/test').Page} page
 */
async function selectTestStore(page, api) {
  const storeList = await api.latest('getStoreList');
  const store = storeList.body.find((item) => norm(item.Name) === TEST_STORE);
  expect(store, `${TEST_STORE} should exist in the store lookup`).toBeTruthy();

  await clickWhenReady(page.locator('mat-select[formcontrolname="storeArr"]'));
  const panel = page.locator('.mat-select-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('mat-option:not(.mat-option-disabled)').first()).toBeVisible({ timeout: 30000 });

  const searchBox = panel.locator('input.mat-select-search-input:not(.mat-select-search-hidden)');
  await searchBox.click({ force: true }); // sits inside an aria-disabled option wrapper
  await searchBox.pressSequentially(TEST_STORE, { delay: 60 });

  const realOptions = panel.locator('mat-option:not(.mat-option-disabled)');
  await expect
    .poll(async () => (await realOptions.allInnerTexts()).map(norm), { timeout: 20000 })
    .toContain(TEST_STORE);
  for (const text of (await realOptions.allInnerTexts()).map(norm)) {
    expect(text.toLowerCase(), 'search should only leave matching stores').toContain(TEST_STORE.toLowerCase());
  }

  const option = realOptions.filter({ hasText: new RegExp(`^\\s*${TEST_STORE}\\s*$`) }).first();
  await clickWhenReady(option);
  await expect(option).toHaveAttribute('aria-selected', 'true');

  // Multi-select panels stay open: close via the transparent backdrop.
  await page.locator('.cdk-overlay-transparent-backdrop').click();
  await expect(panel).toBeHidden();
  await expect(page.locator('mat-select[formcontrolname="storeArr"]')).toContainText(TEST_STORE);
  return store.Id;
}

// ============================================================
// VP-01: Page Load & URL Verification
// ============================================================
test('VP-01: Vendor Performance page loads and URL is correct', async ({ page }) => {
  await openVendorPerformance(page);

  expect(page.url()).toContain('#/home/vendor-performance');
  for (const widget of [
    'app-order-panel',
    'app-cancellation',
    'app-customers',
    'app-average-response-time',
    'app-vendor-delay',
    'app-order-health',
    'app-top-selling-items',
    'app-top-selling-areas',
    'app-order-performance',
  ]) {
    await expect(page.locator(widget), `${widget} should be rendered`).toBeVisible();
  }

  console.log('VP-01 PASSED: URL verified:', page.url());
});

// ============================================================
// VP-02: Sidebar "Vendor Performance" Link
// ============================================================
test('VP-02: Sidebar shows Vendor Performance link correctly', async ({ page }) => {
  await loginToApp(page);

  // Collapsible group toggles also carry the current route as href, so
  // only the real top-level link is selected.
  const vpLink = page.locator('#leftsidebar a.menu-top:not(.menu-toggle)[href="#/home/vendor-performance"]');
  await expect(vpLink).toBeVisible({ timeout: PAGE_READY_TIMEOUT });
  await expect(vpLink).toHaveText(/Vendor Performance/);

  await clickWhenReady(vpLink);
  await page.waitForURL(/#\/home\/vendor-performance/, { timeout: 30000 });
  await expect(page.locator('h4.page-header', { hasText: 'Vendor Performance' })).toBeVisible({ timeout: PAGE_READY_TIMEOUT });
  await expect(vpLink.locator('xpath=..')).toHaveClass(/active/);

  console.log('VP-02 PASSED: Vendor Performance sidebar link navigates and is highlighted.');
});

// ============================================================
// VP-03: Page Header / Title Verification
// ============================================================
test('VP-03: Vendor Performance page title/header is visible', async ({ page }) => {
  await openVendorPerformance(page);

  const breadcrumb = page.locator('app-vendor-performance-panel ul.breadcrumb');
  await expect(breadcrumb.locator('h4.page-header')).toHaveText('Vendor Performance');
  await expect(page).toHaveTitle('TMDone-Console');

  console.log('VP-03 PASSED: Page title/header verified.');
});

// ============================================================
// VP-04: Filter controls and default (Month) filter
// ============================================================
test('VP-04: Filter dropdown elements are visible', async ({ page }) => {
  const api = await openVendorPerformance(page);

  await expect(page.locator('mat-select[formcontrolname="storeArr"]')).toBeVisible();
  await expect(page.locator('mat-label', { hasText: 'Select a store' })).toBeVisible();
  await expect(page.locator('mat-label', { hasText: 'Select a date range' })).toBeVisible();
  for (const field of ['start', 'end']) {
    const input = page.locator(`input[formcontrolname="${field}"]`);
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('readonly', '');
    await expect(input).toHaveValue('');
  }
  for (const name of ['Today', 'Week', 'Month']) {
    await expect(page.locator('.btn-filter button', { hasText: name })).toBeVisible();
  }

  // Month is the default filter and the initial load uses its window for every widget.
  await expect(page.locator('.btn-filter button', { hasText: 'Month' })).toHaveClass(/btn-primary/);
  for (const endpoint of ['getOrderInfo', 'getCancellationReasons', 'getTopSellingItems', 'getTopSellingAreas', 'getAverageOrderStatusChangeTime']) {
    const call = await api.latest(endpoint);
    expect(call.requestBody).toMatchObject({ DateReqType: 'Month', DateRange: expectedQuickRange('Month'), StoreIds: [] });
  }
  const report = await api.latest('performanceReport');
  expect(report.requestBody).toMatchObject({ PageNo: 1, DateRange: expectedQuickRange('Month'), StoreIds: [] });

  console.log('VP-04 PASSED: Filter controls present and default Month window applied.');
});

// ============================================================
// VP-05: Search button re-applies the current filter
// ============================================================
test('VP-05: Action buttons are present and visible', async ({ page }) => {
  const api = await openVendorPerformance(page);
  await api.latest('getOrderInfo');
  await api.latest('performanceReport');

  const searchBtn = page.locator('app-vendor-performance-panel button[mattooltip="Search"]');
  await expect(searchBtn).toBeVisible();

  const before = { info: api.count('getOrderInfo'), report: api.count('performanceReport') };
  await clickWhenReady(searchBtn);

  const info = await api.latest('getOrderInfo', () => api.count('getOrderInfo') > before.info);
  expect(info.requestBody).toMatchObject({ DateReqType: 'Month', DateRange: expectedQuickRange('Month'), StoreIds: [] });
  const report = await api.latest('performanceReport', () => api.count('performanceReport') > before.report);
  expect(report.requestBody.DateRange).toBe(expectedQuickRange('Month'));
  await expectKpisMatchApi(page, info.body);

  console.log('VP-05 PASSED: Search re-queried every widget with the active filter.');
});

// ============================================================
// VP-06: Order Performance table
// ============================================================
test('VP-06: Data table area is visible', async ({ page }) => {
  const api = await openVendorPerformance(page);
  const report = await api.latest('performanceReport');

  await expect(page.locator('app-order-performance h3')).toContainText('Order Performance');
  const headers = (await page.locator('app-order-performance table thead th').allInnerTexts()).map(norm);
  expect(headers).toEqual([
    'Branch Name',
    'Date/Time',
    'Order ID',
    'Delivery Zone',
    'Payment Method',
    'Amount',
    'Status',
    'Vendor Response Time',
    'Vendor Delay',
    'Vendor Performance',
  ]);
  expect(report.body.Items.length, 'demo data should have orders in the last 30 days').toBeGreaterThan(0);
  await expectOrderTableMatchesApi(page, report.body);

  console.log(`VP-06 PASSED: ${report.body.Items.length} order rows match the API (total ${report.body.TotalItemCount}).`);
});

// ============================================================
// VP-07: Top Cancellation Reasons
// ============================================================
test('VP-07: Top Cancellation Reasons table matches the API', async ({ page }) => {
  const api = await openVendorPerformance(page);
  const reasons = await api.latest('getCancellationReasons');
  expect(Array.isArray(reasons.body)).toBe(true);

  const card = page.locator('app-cancellation');
  await expect(card.locator('h3').first()).toContainText('Loss Due to Cancellation');
  await expect(card.locator('canvas')).toBeVisible();
  await expect(card.getByText('Top Cancellation Reasons')).toBeVisible();

  const expected = reasons.body.map((item) => [norm(item.Reason), String(item.Count)]);
  await expect
    .poll(() =>
      card.locator('table.cancellation-tbl tbody tr').evaluateAll((rows) =>
        rows.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim()))
      )
    )
    .toEqual(expected);

  console.log(`VP-07 PASSED: ${expected.length} cancellation reasons match the API.`);
});

// ============================================================
// VP-08: Average Response Time and Vendor Delay
// ============================================================
test('VP-08: Average Response Time and Vendor Delay cards match the API', async ({ page }) => {
  const api = await openVendorPerformance(page);
  const times = await api.latest('getAverageOrderStatusChangeTime');

  const response = page.locator('app-average-response-time');
  await expect(response).toContainText('Average Order Acceptance Time');
  await expect(response.locator('h2')).toHaveText(new RegExp(`^\\s*${Number(times.body.AverageTimeToAccept).toFixed(2)}\\s*MIN\\s*$`));

  const delay = page.locator('app-vendor-delay');
  await expect(delay).toContainText('Average Delay Time');
  await expect(delay.locator('h2')).toHaveText(new RegExp(`^\\s*${Number(times.body.PickupDelay.DelayTime).toFixed(2)}\\s*MIN\\s*$`));
  await expect(delay.locator('ngx-gauge-value')).toHaveText(`${Math.abs(parseInt(String(times.body.PickupDelay.OrdersPiuckedonTimePercentage), 10))}%`);

  console.log('VP-08 PASSED: Response time and vendor delay match the API.');
});

// ============================================================
// VP-09: Top Selling Areas chart
// ============================================================
// (The chart's download/export menu is disabled in the app config -
// toolbar.tools.download = false - so there is no export to test.)
// ============================================================
test('VP-09: Top Selling Areas chart plots the areas returned by the API', async ({ page }) => {
  const api = await openVendorPerformance(page);
  const areas = await api.latest('getTopSellingAreas');
  expect(Array.isArray(areas.body)).toBe(true);

  const card = page.locator('app-top-selling-areas');
  await expect(card.locator('h3')).toContainText('Top Selling Areas');
  if (areas.body.length === 0) {
    await expect(card.locator('.apexcharts-bar-area')).toHaveCount(0);
    console.log('VP-09 INFO: No areas for the default window.');
    return;
  }

  await expect(card.locator('.apexcharts-canvas')).toBeVisible();
  await expect(card.locator('.apexcharts-bar-area')).toHaveCount(areas.body.length, { timeout: 30000 });
  const svgText = norm(await card.locator('svg').first().textContent());
  for (const area of areas.body) {
    expect(svgText, `chart should label area "${area.Area}"`).toContain(norm(area.Area));
    expect(svgText, `chart should show count ${area.Count}`).toContain(String(area.Count));
  }

  console.log(`VP-09 PASSED: ${areas.body.length} areas plotted.`);
});

// ============================================================
// VP-10: Date Range Selection (Today, Week, Month)
// ============================================================
test('VP-10: Date range filter allows selecting Today, Week, Month', async ({ page }) => {
  test.setTimeout(300000);
  const api = await openVendorPerformance(page);
  await api.latest('getOrderInfo');

  for (const type of ['Today', 'Week', 'Month']) {
    const before = { info: api.count('getOrderInfo'), report: api.count('performanceReport') };
    await clickWhenReady(page.locator('.btn-filter button', { hasText: type }));

    const info = await api.latest('getOrderInfo', (call) => call.requestBody?.DateReqType === type && api.count('getOrderInfo') > before.info);
    expect(info.requestBody.DateRange, `${type} should query its own window`).toBe(expectedQuickRange(type));
    const report = await api.latest('performanceReport', () => api.count('performanceReport') > before.report);
    expect(report.requestBody.DateRange).toBe(expectedQuickRange(type));

    for (const name of ['Today', 'Week', 'Month']) {
      const button = page.locator('.btn-filter button', { hasText: name });
      if (name === type) await expect(button).toHaveClass(/btn-primary/);
      else await expect(button).not.toHaveClass(/btn-primary/);
    }
    await expectKpisMatchApi(page, info.body);
    await expectOrderTableMatchesApi(page, report.body);
    console.log(`  ${type}: ${info.requestBody.DateRange} -> ${info.body.SuccessfulOrder.CurrentCount} successful, ${report.body.TotalItemCount} rows`);
  }

  console.log('VP-10 PASSED: Today/Week/Month filters query the right window and re-render.');
});

// ============================================================
// VP-11: Custom Date Range
// ============================================================
test('VP-11: Custom Date Filter works correctly', async ({ page }) => {
  test.setTimeout(240000);
  const api = await openVendorPerformance(page);
  await api.latest('getOrderInfo');

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 10);
  const expectedRange = `${fmtApiDate(start)}-${fmtApiDate(end)}`;

  let orderInfoRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/performance/getOrderInfo')) orderInfoRequests += 1;
  });
  const infoResponsesBefore = api.count('getOrderInfo');

  await pickDateRange(page, start, end);

  const info = await api.latest('getOrderInfo', (call) => call.requestBody?.DateRange === expectedRange);
  expect(info.requestBody.DateReqType).toBe('Day');

  // Wait until every getOrderInfo request fired by the date picker has
  // been answered, then make sure the custom-range response is the one
  // the KPI cards ended up with (i.e. nothing stale arrived after it).
  await expect
    .poll(() => api.count('getOrderInfo') - infoResponsesBefore, { timeout: 150000 })
    .toBeGreaterThanOrEqual(orderInfoRequests);
  const infoCalls = api.calls.filter((call) => call.endpoint === 'getOrderInfo');
  const lastInfo = infoCalls[infoCalls.length - 1];
  expect(
    lastInfo.requestBody?.DateRange,
    `PRODUCT BUG (race): picking the start date fires getOrderInfo with the previous ${lastInfo.requestBody?.DateReqType} ` +
      `filter (${lastInfo.requestBody?.DateRange}); that response arrived after the custom-range (${expectedRange}) response ` +
      'and overwrote the Successful/Failed Orders cards, so they show data for a different period than the selected range.'
  ).toBe(expectedRange);
  const report = await api.latest('performanceReport', (call) => call.requestBody?.DateRange === expectedRange);
  for (const name of ['Today', 'Week', 'Month']) {
    await expect(page.locator('.btn-filter button', { hasText: name })).not.toHaveClass(/btn-primary/);
  }
  await expectKpisMatchApi(page, info.body, { compare: false });
  await expectOrderTableMatchesApi(page, report.body);

  // Every listed order was placed inside the chosen window. The Date/Time
  // column is the order's completion time; the range filters on when the
  // order was placed (= Date - TotalTimeToDeliver minutes), so e.g. an
  // order placed on the 10th and delivered 4 days later is still listed.
  const windowStart = start.getTime();
  const windowEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  expect(report.body.Items.length, `demo data should have orders in ${expectedRange}`).toBeGreaterThan(0);
  for (const item of report.body.Items) {
    const placedAt = new Date(item.Date).getTime() - Number(item.TotalTimeToDeliver || 0) * 60000;
    expect(
      placedAt >= windowStart && placedAt < windowEnd,
      `order ${item.OrderNo} (completed ${item.Date}, placed ~${new Date(placedAt).toISOString()}) should be within ${expectedRange}`
    ).toBe(true);
  }

  console.log(`VP-11 PASSED: Custom range ${expectedRange} applied (${report.body.TotalItemCount} orders).`);
});

// ============================================================
// VP-12: Store selection via the search box, applied by Search
// ============================================================
test('VP-12: Store selection search feature works correctly', async ({ page }) => {
  test.setTimeout(240000);
  const api = await openVendorPerformance(page);
  await api.latest('performanceReport');

  const storeId = await selectTestStore(page, api);

  // Selecting a store alone does not re-query: the Search button applies it.
  const before = api.count('performanceReport');
  await page.waitForTimeout(3000);
  expect(api.count('performanceReport'), 'store selection should wait for Search').toBe(before);

  await clickWhenReady(page.locator('app-vendor-performance-panel button[mattooltip="Search"]'));
  const report = await api.latest('performanceReport', (call) => JSON.stringify(call.requestBody?.StoreIds) === JSON.stringify([storeId]));
  expect(report.requestBody.DateRange).toBe(expectedQuickRange('Month'));
  for (const endpoint of ['getOrderInfo', 'getCancellationReasons', 'getTopSellingItems', 'getTopSellingAreas']) {
    await api.latest(endpoint, (call) => JSON.stringify(call.requestBody?.StoreIds) === JSON.stringify([storeId]));
  }

  await expectOrderTableMatchesApi(page, report.body);
  for (const cells of await readOrderTable(page)) {
    expect(cells[0], 'every order row should belong to the selected store').toBe(TEST_STORE);
  }

  console.log(`VP-12 PASSED: ${TEST_STORE} (${storeId}) filter applied - ${report.body.TotalItemCount} orders.`);
});

// ============================================================
// VP-13: Order Performance pagination (Next & Previous)
// ============================================================
// Uses a fixed historical window (1-10 Aug 2026, ~10k orders) so the
// report has many 50-row pages. Wide windows (6 months, ~160k orders)
// make performanceReport take well over a minute, so they are avoided.
// ============================================================
test('VP-13: Pagination - Next and Previous buttons work correctly', async ({ page }) => {
  test.setTimeout(300000);
  const api = await openVendorPerformance(page);
  await api.latest('performanceReport');

  const start = new Date(2026, 7, 1);
  const end = new Date(2026, 7, 10);
  const expectedRange = `${fmtApiDate(start)}-${fmtApiDate(end)}`;
  await pickDateRange(page, start, end);

  const page1 = await api.latest('performanceReport', (call) => call.requestBody?.DateRange === expectedRange);
  expect(page1.requestBody.PageNo).toBe(1);
  expect(
    page1.body.TotalItemCount,
    `pagination needs more than ${page1.body.PageSize} orders in ${expectedRange}; demo data has ${page1.body.TotalItemCount}`
  ).toBeGreaterThan(page1.body.PageSize);
  await expectOrderTableMatchesApi(page, page1.body);
  const page1Ids = (await readOrderTable(page)).map((cells) => cells[2]);
  expect(page1Ids).toHaveLength(page1.body.PageSize);

  const pager = page.locator('app-order-performance ul.ngx-pagination');
  await expect(pager.locator('li.current')).toContainText('1');
  await expect(pager.locator('li.pagination-previous')).toHaveClass(/disabled/);

  // Next -> page 2
  await clickWhenReady(pager.locator('li.pagination-next a'));
  const page2 = await api.latest('performanceReport', (call) => call.requestBody?.DateRange === expectedRange && call.requestBody?.PageNo === 2);
  await expect(pager.locator('li.current')).toContainText('2');
  await expectOrderTableMatchesApi(page, page2.body);
  const page2Ids = (await readOrderTable(page)).map((cells) => cells[2]);
  expect(page2Ids).toHaveLength(page2.body.PageSize);
  for (const id of page2Ids) {
    expect(page1Ids, 'page 2 should not repeat page 1 orders').not.toContain(id);
  }

  // Previous -> back to page 1
  const before = api.count('performanceReport');
  await clickWhenReady(pager.locator('li.pagination-previous a'));
  const back = await api.latest('performanceReport', (call) => call.requestBody?.PageNo === 1 && api.count('performanceReport') > before);
  await expect(pager.locator('li.current')).toContainText('1');
  await expectOrderTableMatchesApi(page, back.body);

  console.log(`VP-13 PASSED: ${page1.body.TotalItemCount} orders paged (1 -> 2 -> 1).`);
});

// ============================================================
// VP-14: Successful & Failed Orders KPI Cards
// ============================================================
test('VP-14: Successful and Failed Orders KPI cards display order counts and OMR values', async ({ page }) => {
  const api = await openVendorPerformance(page);
  const info = await api.latest('getOrderInfo');
  expect(typeof info.body?.SuccessfulOrder?.CurrentCount).toBe('number');
  expect(typeof info.body?.FailedOrder?.CurrentCount).toBe('number');

  await expectKpisMatchApi(page, info.body);

  console.log(
    `VP-14 PASSED: Successful ${info.body.SuccessfulOrder.CurrentCount} / Failed ${info.body.FailedOrder.CurrentCount} match the API.`
  );
});

// ============================================================
// VP-15: Customers breakdown
// ============================================================
test('VP-15: Additional performance metrics are visible', {
  annotation: backendIssue('api/performance/getCustomerInfo (Vendor Performance "Customers" widget) is very slow: 40-80 s on its own and over 4 minutes while other requests are running, so the widget and this test time out. First seen 2026-10-11.'),
}, async ({ page }) => {
  test.setTimeout(360000);
  const api = await openVendorPerformance(page);
  const customers = await api.latest('getCustomerInfo', () => true, SLOW_API_TIMEOUT);
  const info = customers.body;
  expect(typeof info?.NewCustomersCount, 'getCustomerInfo should return counts').toBe('number');

  const card = page.locator('app-customers');
  await expect(card.locator('app-loader')).toHaveCount(0, { timeout: 30000 });
  const text = norm(await card.innerText());
  const pct = (value) => Math.abs(parseInt(String(value), 10));
  expect(text).toMatch(new RegExp(`Returning Customers ${info.ReturningCustomersCount} ${pct(info.ReturningCustomersPercentage)}%`));
  expect(text).toMatch(new RegExp(`Regained Customers ${info.RegainedCustomersCount} ${pct(info.RegainedCustomersPercentage)}%`));
  expect(text).toMatch(new RegExp(`New Customers ${info.NewCustomersCount} ${pct(info.NewCustomersPercentage)}%`));

  console.log(
    `VP-15 PASSED: Customers new ${info.NewCustomersCount} / returning ${info.ReturningCustomersCount} / regained ${info.RegainedCustomersCount} match the API.`
  );
});

// ============================================================
// VP-16: Order Health Chart
// ============================================================
test('VP-16: Order Health chart shows Excellent/Good/Poor breakdown', async ({ page }) => {
  const api = await openVendorPerformance(page);
  const times = await api.latest('getAverageOrderStatusChangeTime');
  const data = times.body.OrderHealth.OrderHealthdoughnutChartData;
  expect(data).toHaveLength(3);

  const card = page.locator('app-order-health');
  await expect(card.locator('h3')).toContainText('Order Health');
  await expect(card.locator('.apexcharts-canvas')).toBeVisible({ timeout: 30000 });
  const svgText = norm(await card.locator('svg').first().textContent());
  for (const category of ['Excellent', 'Good', 'Poor']) {
    expect(svgText).toContain(category);
  }
  await expect
    .poll(async () => (await card.locator('.apexcharts-datalabel').allTextContents()).map(norm))
    .toEqual(data.map((value) => `${value}%`));

  console.log(`VP-16 PASSED: Order Health ${data.join('/')}% matches the API.`);
});

// ============================================================
// VP-17: Top Selling Items table
// ============================================================
test('VP-17: Top Selling Items table matches the API', async ({ page }) => {
  const api = await openVendorPerformance(page);
  const items = await api.latest('getTopSellingItems');
  expect(Array.isArray(items.body)).toBe(true);

  const card = page.locator('app-top-selling-items');
  await expect(card.locator('h3')).toContainText('Top Selling Items');
  const expected = items.body.map((item) => [norm(item.Name), String(item.Count)]);
  await expect
    .poll(() =>
      card.locator('table tbody tr').evaluateAll((rows) =>
        rows.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim()))
      )
    )
    .toEqual(expected);
  const counts = items.body.map((item) => item.Count);
  expect(counts, 'items are ranked by count').toEqual([...counts].sort((a, b) => b - a));

  console.log(`VP-17 PASSED: ${expected.length} top selling items match the API.`);
});

// ============================================================
// VP-18: Store Filter Refreshes KPI View
// ============================================================
test('VP-18: Selecting a store and searching refreshes the KPI view without errors', async ({ page }) => {
  test.setTimeout(240000);
  const api = await openVendorPerformance(page);
  const allStores = await api.latest('getOrderInfo');

  const storeId = await selectTestStore(page, api);
  await clickWhenReady(page.locator('app-vendor-performance-panel button[mattooltip="Search"]'));

  const sameStore = (call) => JSON.stringify(call.requestBody?.StoreIds) === JSON.stringify([storeId]);
  const info = await api.latest('getOrderInfo', sameStore);
  await expectKpisMatchApi(page, info.body);
  expect(
    info.body.SuccessfulOrder.CurrentCount,
    'a single store cannot have more successful orders than all stores combined'
  ).toBeLessThanOrEqual(allStores.body.SuccessfulOrder.CurrentCount);

  const items = await api.latest('getTopSellingItems', sameStore);
  await expect
    .poll(async () => (await page.locator('app-top-selling-items table tbody tr td:first-child').allTextContents()).map(norm))
    .toEqual(items.body.map((item) => norm(item.Name)));

  console.log(`VP-18 PASSED: KPIs refreshed for ${TEST_STORE}: ${info.body.SuccessfulOrder.CurrentCount} successful orders.`);
});

// ============================================================
// VP-19: Loss Due to Cancellation chart follows the API
// ============================================================
// The card is a Chart.js line chart fed by getCancellationLossChart.
// Verifies the chart is bound to the API's day labels and is actually
// drawn, that the header trend arrow follows CancellationLossData.IsUp,
// and that the Week filter re-queries the chart with the Week window
// and re-binds it to the new labels.
// ============================================================
async function expectLossChartMatchesApi(page, lossBody) {
  const card = page.locator('app-cancellation');
  const canvas = card.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('ng-reflect-chart-type', 'line');

  const labels = lossBody.CurrentDataLabels;
  expect(Array.isArray(labels) && labels.length > 0, 'getCancellationLossChart should return day labels').toBe(true);
  // Angular truncates reflected bindings to 30 characters.
  const reflected = labels.join(',').slice(0, 30);
  await expect.poll(() => canvas.getAttribute('ng-reflect-labels'), { timeout: 30000 }).toBe(reflected);

  const series = lossBody.CancellationLossData.CancellationLossLineChartData[0].Data;
  expect(series, 'one loss value per day label').toHaveLength(labels.length);

  // The canvas has really been painted (not an empty chart area).
  await expect
    .poll(() =>
      canvas.evaluate((el) => {
        const { data } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
        let painted = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
        return painted;
      })
    )
    .toBeGreaterThan(500);

  const arrow = lossBody.CancellationLossData.IsUp ? 'up' : 'down';
  await expect(card.locator(`h3 i.fa-level-${arrow}-alt`)).toHaveCount(1);
}

test('VP-19: Loss Due to Cancellation chart is bound to the API data and follows the filter', async ({ page }) => {
  test.setTimeout(240000);
  const api = await openVendorPerformance(page);

  const month = await api.latest('getCancellationLossChart');
  expect(month.requestBody).toMatchObject({ DateReqType: 'Month', DateRange: expectedQuickRange('Month'), StoreIds: [] });
  await expect(page.locator('app-cancellation h3').first()).toContainText('Loss Due to Cancellation');
  await expectLossChartMatchesApi(page, month.body);

  const before = api.count('getCancellationLossChart');
  await clickWhenReady(page.locator('.btn-filter button', { hasText: 'Week' }));
  const week = await api.latest(
    'getCancellationLossChart',
    (call) => call.requestBody?.DateReqType === 'Week' && api.count('getCancellationLossChart') > before
  );
  expect(week.requestBody.DateRange).toBe(expectedQuickRange('Week'));
  await expectLossChartMatchesApi(page, week.body);

  console.log(
    `VP-19 PASSED: loss chart bound to ${month.body.CurrentDataLabels.length} (Month) and ${week.body.CurrentDataLabels.length} (Week) day labels from the API.`
  );
});
