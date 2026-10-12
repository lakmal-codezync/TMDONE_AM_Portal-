// @ts-check
// ============================================================
// TMDone Admin Console - Order Management
// URL: #/home/order-management
// VIEW-ONLY: the page lists orders for a date range with a free-text
// search (order id / branch name) and pagination. Rows have no actions.
// These tests never change, cancel, refund or reassign any order.
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from '../helpers/loginHelper.js';

const ORDERS_URL = `${CREDENTIALS.baseUrl}/#/home/order-management`;
const TEST_STORE = 'Food House';
const SPINNERS = ['.ngx-spinner-overlay', 'app-page-loader'];
const EXPECTED_HEADERS = ['Branch Name', 'Service Type', 'Order ID', 'Date/Time', 'Payment Type', 'Currency', 'Delivery Fee', 'Amount', 'Status'];
const COL = { branch: 0, service: 1, orderId: 2, date: 3, currency: 5, fee: 6, amount: 7, status: 8 };
const KNOWN_STATUSES = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'ENROUTE', 'PICKED', 'DELIVERED', 'COMPLETE', 'CANCELLED', 'REJECTED', 'UNSUCCESSFUL'];

test.describe('09-Order Management - Orders list (view-only)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    await goToOrdersPage(page);
  });

  test('OM-01: Order Management loads the last 30 days of orders with all columns', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Order Management' })).toBeVisible();
    await expect(searchInput(page)).toBeVisible();
    await expect(page.locator('button[mattooltip="Search"]')).toBeVisible();
    const headers = (await page.locator('thead th').allInnerTexts()).map((h) => h.trim());
    expect(headers).toEqual(EXPECTED_HEADERS);

    // Default range: 30 days ago .. yesterday.
    await expect(startDate(page)).toHaveValue(formatDate(daysAgo(30)));
    await expect(endDate(page)).toHaveValue(formatDate(daysAgo(1)));

    const total = await getTotalResults(page);
    expect(total, 'Orders should exist in the last 30 days.').toBeGreaterThan(0);
    await expect(page.locator('tbody tr')).toHaveCount(Math.min(total, 50));
    await expectRowsWithinRange(page, daysAgo(30), daysAgo(1));
  });

  test('OM-02: Order rows show valid ids, service types, money values and statuses', async ({ page }) => {
    const rows = await readRows(page);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row[COL.branch].length, 'Branch name should be filled.').toBeGreaterThan(0);
      expect(row[COL.orderId]).toMatch(/^[A-Z0-9]{6}$/);
      expect(['Express', 'Market Place', 'Scheduled', 'Pickup']).toContain(row[COL.service]);
      expect(row[COL.currency]).toBe('OMR');
      expect(row[COL.fee]).toMatch(/^\d+\.\d{3}$/);
      expect(row[COL.amount]).toMatch(/^\d+\.\d{3}$/);
      expect(KNOWN_STATUSES, `Unexpected status "${row[COL.status]}" for ${row[COL.orderId]}.`).toContain(row[COL.status]);
    }
    const ids = rows.map((row) => row[COL.orderId]);
    expect(new Set(ids).size, 'Order ids should be unique on the page.').toBe(ids.length);
    // Newest orders first.
    const times = rows.map((row) => parseRowDate(row[COL.date]).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  test('OM-03: Search by an order id returns exactly that order', async ({ page }) => {
    const rows = await readRows(page);
    const target = rows[Math.min(3, rows.length - 1)];
    await search(page, target[COL.orderId]);
    await expect.poll(async () => (await readRows(page)).map((row) => row[COL.orderId]), {
      message: `Search should return only order ${target[COL.orderId]}.`,
      timeout: 45000,
    }).toEqual([target[COL.orderId]]);
    expect(await readRows(page)).toEqual([target]);
    expect(await getTotalResults(page)).toBe(1);
  });

  test('OM-04: Search by branch name returns only Food House orders', async ({ page }) => {
    await search(page, TEST_STORE);
    await expect.poll(async () => {
      const branches = (await readRows(page)).map((row) => row[COL.branch]);
      return branches.length > 0 && branches.every((branch) => branch.includes(TEST_STORE));
    }, { message: 'Every result should be a Food House order.', timeout: 45000 }).toBe(true);
    const total = await getTotalResults(page);
    await expect(page.locator('tbody tr')).toHaveCount(Math.min(total, 50));
  });

  test('OM-05: A search with no match shows zero results and clearing the search restores the list', async ({ page }) => {
    const total = await getTotalResults(page);
    await search(page, 'ZZNOMATCH99');
    await expect.poll(async () => getTotalResults(page), { timeout: 45000 }).toBe(0);
    await expect(page.locator('tbody tr')).toHaveCount(0);

    await search(page, '');
    await expect.poll(async () => getTotalResults(page), {
      message: 'Clearing the search should restore all orders in the range.',
      timeout: 45000,
    }).toBe(total);
    await expect(page.locator('tbody tr')).toHaveCount(Math.min(total, 50));
  });

  test('OM-06: Pagination next, previous and page-number navigation', async ({ page }) => {
    const total = await getTotalResults(page);
    test.skip(total <= 100, `Only ${total} orders in the default range; three pages are needed for this check.`);
    const page1 = await readRows(page);
    await expect(activePage(page)).toContainText('1');

    await clickWhenReady(page, page.locator('.ngx-pagination li.pagination-next a'));
    await expect(activePage(page)).toContainText('2', { timeout: 30000 });
    await expect.poll(async () => (await readRows(page))[0]?.[COL.orderId], { timeout: 45000 }).not.toBe(page1[0][COL.orderId]);
    const page2 = await readRows(page);
    const page1Ids = page1.map((row) => row[COL.orderId]);
    expect(page2.filter((row) => page1Ids.includes(row[COL.orderId])), 'Page 2 should list different orders.').toEqual([]);
    expect(parseRowDate(page2[0][COL.date]).getTime(), 'Page 2 continues the newest-first order.')
      .toBeLessThanOrEqual(parseRowDate(page1[page1.length - 1][COL.date]).getTime());

    await clickWhenReady(page, page.locator('.ngx-pagination li.pagination-previous a'));
    await expect(activePage(page)).toContainText('1', { timeout: 30000 });
    await expect.poll(async () => (await readRows(page))[0]?.[COL.orderId], { timeout: 45000 }).toBe(page1[0][COL.orderId]);

    await clickWhenReady(page, page.locator('.ngx-pagination li a').filter({ hasText: /^\s*page\s*3\s*$|^\s*3\s*$/ }).first());
    await expect(activePage(page)).toContainText('3', { timeout: 30000 });
    await expect(page.locator('tbody tr')).toHaveCount(Math.min(total - 100, 50), { timeout: 45000 });
    expect(await getTotalResults(page)).toBe(total);
  });

  test('OM-07: Date range picker narrows the list to the chosen days', async ({ page }) => {
    const fullTotal = await getTotalResults(page);
    const from = daysAgo(20);
    const to = daysAgo(10);

    await clickWhenReady(page, page.locator('mat-datepicker-toggle button').first());
    const calendar = page.locator('mat-calendar');
    await expect(calendar).toBeVisible({ timeout: 15000 });
    await pickCalendarDay(page, from);
    await pickCalendarDay(page, to);
    await expect(calendar).toBeHidden({ timeout: 15000 });
    await expect(startDate(page)).toHaveValue(formatDate(from));
    await expect(endDate(page)).toHaveValue(formatDate(to));

    await clickWhenReady(page, page.locator('button[mattooltip="Search"]'));
    await waitForSpinners(page);
    // Known product bug (verified 2026-10-12, independent of browser timezone):
    // POST /api/order/getOrderList {"DateRange":"2026/10/02-2026/10/02"} returned
    // order IHJ1CF with OrderDateTime "2026-10-03T00:02:19" - the range is applied
    // in a different timezone (likely UTC) than the local OrderDateTime returned,
    // so orders from just after midnight of the next day leak into the range.
    await expect.poll(async () => {
      const rows = await readRows(page);
      return rows.length > 0 ? rows
        .filter((row) => { const d = parseRowDate(row[COL.date]); return d < startOfDay(from) || d > endOfDay(to); })
        .map((row) => `${row[COL.orderId]} ${row[COL.date]}`) : ['(no rows)'];
    }, {
      message: `Every order should fall inside ${formatDate(from)} - ${formatDate(to)}; listed orders outside the range ` +
        '(the API applies the date range in a different timezone than the OrderDateTime it returns).',
      timeout: 60000,
    }).toEqual([]);
    const total = await getTotalResults(page);
    expect(total, 'A 10-day window should hold fewer orders than the 30-day default.').toBeLessThan(fullTotal);
    await expect(page.locator('tbody tr')).toHaveCount(Math.min(total, 50));
  });
});

// ============================================================
// Helpers
// ============================================================

/** @param {import('@playwright/test').Page} page */
async function goToOrdersPage(page) {
  await loginToApp(page);
  await page.goto(ORDERS_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForSpinners(page);
  await expect(page.getByRole('heading', { name: 'Order Management' })).toBeVisible({ timeout: 60000 });
  await expect(page.locator('tbody tr').first(), 'Orders should load.').toBeVisible({ timeout: 90000 });
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

/** @param {import('@playwright/test').Page} page */
function searchInput(page) {
  return page.getByRole('textbox', { name: 'Search...' });
}

/** @param {import('@playwright/test').Page} page */
function startDate(page) {
  return page.locator('input[formcontrolname="start"]');
}

/** @param {import('@playwright/test').Page} page */
function endDate(page) {
  return page.locator('input[formcontrolname="end"]');
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function search(page, text) {
  await searchInput(page).fill(text);
  await expect(searchInput(page)).toHaveValue(text);
  await clickWhenReady(page, page.locator('button[mattooltip="Search"]'));
  await page.waitForTimeout(500);
  await waitForSpinners(page);
}

/** @param {import('@playwright/test').Page} page */
async function getTotalResults(page) {
  const label = page.getByText(/Total \d+ results found/).first();
  await expect(label).toBeVisible({ timeout: 60000 });
  return Number(((await label.innerText()).match(/Total (\d+) results found/) || [])[1]);
}

/** @param {import('@playwright/test').Page} page */
function activePage(page) {
  return page.locator('.ngx-pagination li.current').first();
}

/** @param {import('@playwright/test').Page} page */
async function readRows(page) {
  return page.locator('tbody tr').evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('td')]
    .map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim())));
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {Date} from
 * @param {Date} to
 */
async function expectRowsWithinRange(page, from, to) {
  for (const row of await readRows(page)) {
    const date = parseRowDate(row[COL.date]);
    expect(date >= startOfDay(from) && date <= endOfDay(to), `Order ${row[COL.orderId]} (${row[COL.date]}) should be inside the range.`).toBe(true);
  }
}

/**
 * Picks a day in the open range calendar, moving forward/back by month
 * until the day's cell is shown (cells are labelled with the full date).
 * @param {import('@playwright/test').Page} page
 * @param {Date} date
 */
async function pickCalendarDay(page, date) {
  const monthName = date.toLocaleString('en-US', { month: 'long' });
  const label = new RegExp(`(${monthName} ${date.getDate()}, ${date.getFullYear()})|(${date.getDate()} ${monthName} ${date.getFullYear()})`);
  for (let step = 0; step < 6; step += 1) {
    const byAria = page.locator('mat-calendar .mat-calendar-body-cell').filter({ hasText: new RegExp(`^\\s*${date.getDate()}\\s*$`) });
    const ariaLabels = await byAria.evaluateAll((cells) => cells.map((c) => c.getAttribute('aria-label') || ''));
    const index = ariaLabels.findIndex((a) => label.test(a));
    if (index >= 0) {
      await clickWhenReady(page, byAria.nth(index));
      return;
    }
    const periodLabel = (await page.locator('.mat-calendar-period-button').innerText()).trim();
    const shownMonth = new Date(`1 ${periodLabel.replace(/^SEPT/i, 'SEP')}`);
    const goBack = shownMonth.getFullYear() * 12 + shownMonth.getMonth() > date.getFullYear() * 12 + date.getMonth();
    await clickWhenReady(page, page.getByRole('button', { name: goBack ? 'Previous month' : 'Next month' }));
  }
  throw new Error(`Calendar never showed ${date.toDateString()}.`);
}

/** @param {string} text dd/mm/yyyy HH:MM:SS am|pm (24h clock) */
function parseRowDate(text) {
  const [, d, m, y, hh, mm, ss] = text.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/) || [];
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
}

/** @param {number} days */
function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/** @param {Date} date */
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
}

/** @param {Date} date */
function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
}

/** @param {Date} date dd/mm/yyyy */
function formatDate(date) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}
