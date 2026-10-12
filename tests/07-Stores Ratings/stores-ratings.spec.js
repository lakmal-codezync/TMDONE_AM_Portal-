// @ts-check
// ============================================================
// TMDone Admin Console - Stores Ratings Module
// URL: #/home/stores-ratings (+ /summary?StoreId=..&storeName=..)
// Scope (read-only - the module has no create/edit/delete actions):
//   list page: store filter, search, clear, export, all-stores listing and
//   pagination; Rating Summary page: rating analysis consistency, comment
//   search by order number, clear and export.
// Test store: "Food House" (Colombo test store).
// ============================================================

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { loginToApp, CREDENTIALS } from '../helpers/loginHelper.js';

const RATINGS_URL = `${CREDENTIALS.baseUrl}/#/home/stores-ratings`;
const TEST_STORE = 'Food House';
const EXPECTED_HEADERS = ['Branch English Name', 'Branch Arabic Name', 'Rating Count', 'Average Rating', 'Actions'];
const SPINNERS = ['.ngx-spinner-overlay', 'app-page-loader'];

test.describe('07-Stores Ratings - Stores Ratings Module', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000);
    await goToRatingsPage(page);
  });

  test('SR-01: Stores Ratings page loads with store filter and toolbar, and no results before a search', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Stores Ratings' }).first()).toBeVisible();
    await expect(storeSelect(page)).toBeVisible();
    for (const tip of ['Download', 'Clear', 'Search']) {
      await expect(toolbarButton(page, tip), `${tip} toolbar button should be visible.`).toBeVisible();
    }
    // The ratings table only appears after a search is run.
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.getByText(/Total \d+ results found/)).toHaveCount(0);
  });

  test('SR-02: Store filter for Food House lists exactly that store with its rating count and average', async ({ page }) => {
    await selectStore(page, TEST_STORE);
    await clickToolbar(page, 'Search');
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 60000 });

    const headers = (await page.locator('thead th').allInnerTexts()).map((h) => h.trim());
    expect(headers).toEqual(EXPECTED_HEADERS);

    const row = await readRow(page.locator('tbody tr').first());
    expect(row.name).toBe(TEST_STORE);
    expect(row.arabicName.length, 'Arabic name should be filled.').toBeGreaterThan(0);
    expect(row.count, 'Food House has ratings.').toBeGreaterThan(0);
    expect(row.average).toBeGreaterThanOrEqual(1);
    expect(row.average).toBeLessThanOrEqual(5);
    await expect(page.locator('tbody tr').first().locator('button[mattooltip="View Store Ratings"]')).toBeVisible();
    expect(await getTotalResults(page)).toBe(1);
  });

  test('SR-03: Search without a store filter lists all stores and pagination pages through them', async ({ page }) => {
    test.setTimeout(600000);
    const firstPage = waitForRatingsPage(page, 1);
    await clickToolbar(page, 'Search');
    // The unfiltered ratings query is slow on this environment (60-90s).
    await firstPage;
    await expect(page.locator('tbody tr').first(), 'All-stores ratings should load.').toBeVisible({ timeout: 180000 });
    await expect(page.locator('tbody tr')).toHaveCount(50);
    // Search fires the same Page 1 request several times; let the table settle.
    await waitForStableNames(page);
    const total = await getTotalResults(page);
    expect(total, 'Every store with ratings should be counted.').toBeGreaterThan(50);
    await expect(activePage(page)).toContainText('1');

    const page1 = await getNames(page);
    for (const row of await page.locator('tbody tr').all()) {
      const data = await readRow(row);
      expect(Number.isInteger(data.count) && data.count >= 0, `${data.name} rating count "${data.count}" should be a whole number.`).toBe(true);
      expect(data.average >= 0 && data.average <= 5, `${data.name} average "${data.average}" should be within 0-5.`).toBe(true);
    }

    const page2Response = waitForRatingsPage(page, 2);
    await clickWhenReady(page, page.locator('.ngx-pagination li.pagination-next a'));
    await page2Response;
    await expect(activePage(page)).toContainText('2', { timeout: 180000 });
    await expect.poll(async () => {
      const names = await getNames(page);
      return names.length === 50 && names[0] !== page1[0];
    }, { message: 'Page 2 should render 50 stores.', timeout: 180000 }).toBe(true);
    await waitForStableNames(page);
    const page2 = await getNames(page);
    expect(await getTotalResults(page)).toBe(total);
    // Known product bug (verified 2026-10-12 by replaying POST
    // /api/ratings/getAmStoreRatings {"StoreIds":[],"Page":1} twice: the two
    // responses contained different store sets, and one shared 2 stores with
    // Page 2). The API has no stable sort, so stores repeat across pages and
    // others are never shown.
    expect(
      page2.filter((name) => page1.includes(name)),
      'Page 2 repeats stores already shown on page 1: getAmStoreRatings has no stable sort order, ' +
      'so the same Page request returns a different store set each time.'
    ).toEqual([]);

    const page1Response = waitForRatingsPage(page, 1);
    await clickWhenReady(page, page.locator('.ngx-pagination li.pagination-previous a'));
    await page1Response;
    await expect(activePage(page)).toContainText('1', { timeout: 180000 });
    await expect.poll(async () => (await getNames(page)).length, { timeout: 180000 }).toBe(50);
    await waitForStableNames(page);
    await expect.poll(async () => [...(await getNames(page))].sort(), {
      message: 'Going back to page 1 should list the same stores as before - getAmStoreRatings returns a different store set for the same Page (no stable sort; product bug).',
      timeout: 30000,
    }).toEqual([...page1].sort());
  });

  test('SR-04: Clear resets the store filter and removes the results', async ({ page }) => {
    await selectStore(page, TEST_STORE);
    await clickToolbar(page, 'Search');
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 60000 });

    await clickToolbar(page, 'Clear');
    await expect(storeSelect(page)).not.toContainText(TEST_STORE);
    await expect(page.locator('tbody tr')).toHaveCount(0, { timeout: 30000 });
    await expect(page.getByText(/Total \d+ results found/)).toHaveCount(0);
  });

  test('SR-05: Download exports the filtered store ratings as an Excel file', async ({ page }) => {
    await selectStore(page, TEST_STORE);
    await clickToolbar(page, 'Search');
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 60000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
    await clickToolbar(page, 'Download');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^TMDONE_Store_Rating_Management_.*\.xlsx$/i);
    expect(await download.failure()).toBeNull();
    expect(fs.statSync(await download.path()).size, 'Exported file should not be empty.').toBeGreaterThan(0);
  });

  test('SR-06: View Store Ratings opens the Food House Rating Summary matching the list values', async ({ page }) => {
    const listRow = await openFoodHouseSummary(page);

    await expect(page).toHaveURL(/stores-ratings\/summary\?StoreId=[0-9a-f]+&storeName=Food%20House/);
    await expect(page.getByRole('heading', { name: `Rating Summary - ${TEST_STORE}` })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rating Analysis' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comment Summary' })).toBeVisible();

    const analysis = await readRatingAnalysis(page);
    expect(analysis.average, 'Summary average should match the list average.').toBeCloseTo(listRow.average, 1);
    expect(analysis.reviews, 'Summary review count should match the list rating count.').toBe(listRow.count);
    expect(analysis.bars.map((bar) => bar.label)).toEqual(['5 star', '4 star', '3 star', '2 star', '1 star']);
    const percentSum = analysis.bars.reduce((sum, bar) => sum + bar.percent, 0);
    expect(percentSum, 'Star distribution should add up to 100%.').toBeCloseTo(100, 0);
    const weighted = analysis.bars.reduce((sum, bar, index) => sum + (5 - index) * bar.percent, 0) / 100;
    expect(weighted, 'Star distribution should produce the shown average.').toBeCloseTo(analysis.average, 1);

    // Every rating in the comment list is a 1-5 star value; the list total equals the review count.
    expect(await getTotalResults(page)).toBe(listRow.count);
    const comments = await readComments(page);
    expect(comments.length).toBe(Math.min(listRow.count, 50));
    for (const comment of comments) {
      expect(comment.orderNo).toMatch(/^[A-Z0-9]{6}$/);
      expect(comment.date).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2} (AM|PM)$/);
      expect(comment.rating).toBeGreaterThanOrEqual(1);
      expect(comment.rating).toBeLessThanOrEqual(5);
    }
  });

  test('SR-07: Rating Summary comment search by order number, no-match search and Clear', async ({ page }) => {
    const listRow = await openFoodHouseSummary(page);
    const comments = await readComments(page);
    expect(comments.length).toBeGreaterThan(0);
    const target = comments[comments.length - 1];
    const expectedMatches = comments.filter((c) => c.orderNo === target.orderNo).length;

    const searchBox = page.getByRole('textbox', { name: 'Search' });
    await expect(page.getByText('Search By Order No or Tags')).toBeVisible();
    await searchBox.fill(target.orderNo);
    await clickToolbar(page, 'Search');
    await expect.poll(async () => (await readComments(page)).map((c) => c.orderNo), {
      message: `Comment search should show only order ${target.orderNo}.`,
      timeout: 45000,
    }).toEqual(Array(expectedMatches).fill(target.orderNo));
    expect(await getTotalResults(page)).toBe(expectedMatches);

    await searchBox.fill('ZZNOMATCH99');
    await clickToolbar(page, 'Search');
    await expect.poll(async () => getTotalResults(page), { timeout: 45000 }).toBe(0);
    expect(await readComments(page)).toEqual([]);

    await clickToolbar(page, 'Clear');
    await expect(searchBox).toHaveValue('');
    await expect.poll(async () => getTotalResults(page), {
      message: 'Clear should restore all comments.',
      timeout: 45000,
    }).toBe(listRow.count);
  });

  test('SR-08: Rating Summary Download exports the comments as an Excel file', async ({ page }) => {
    await openFoodHouseSummary(page);
    const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
    await clickToolbar(page, 'Download');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^TMDONE_Store_Rating_.*\.xlsx$/i);
    expect(await download.failure()).toBeNull();
    expect(fs.statSync(await download.path()).size, 'Exported file should not be empty.').toBeGreaterThan(0);
  });
});

// ============================================================
// Helpers
// ============================================================

/** @param {import('@playwright/test').Page} page */
async function goToRatingsPage(page) {
  await loginToApp(page);
  await page.goto(RATINGS_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForSpinners(page);
  await expect(page.getByRole('heading', { name: 'Stores Ratings' }).first()).toBeVisible({ timeout: 60000 });
  await expect(storeSelect(page)).toBeVisible({ timeout: 60000 });
}

/** @param {import('@playwright/test').Page} page */
async function waitForSpinners(page) {
  for (const selector of SPINNERS) {
    await page.locator(selector).first().waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  }
}

/**
 * Real click with a retry loop around the cycling page loader overlay.
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
function storeSelect(page) {
  return page.getByRole('combobox', { name: /Select a store/ });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'Download' | 'Clear' | 'Search'} tooltip
 */
function toolbarButton(page, tooltip) {
  return page.locator(`button[mattooltip="${tooltip}"]`).first();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'Download' | 'Clear' | 'Search'} tooltip
 */
async function clickToolbar(page, tooltip) {
  await clickWhenReady(page, toolbarButton(page, tooltip));
  await page.waitForTimeout(500);
  await waitForSpinners(page);
}

/**
 * Multi-select store dropdown with a search box; its ~5000 options load
 * from the API after it opens.
 * @param {import('@playwright/test').Page} page
 * @param {string} storeName
 */
async function selectStore(page, storeName) {
  await clickWhenReady(page, storeSelect(page));
  await expect.poll(async () => page.locator('mat-option').count(), {
    message: 'Store options should load from the API.',
    timeout: 90000,
  }).toBeGreaterThan(10);
  const searchBox = page.locator('.cdk-overlay-pane input.mat-select-search-input').first();
  await searchBox.click({ force: true }); // focus input inside an aria-disabled wrapper
  await searchBox.pressSequentially(storeName, { delay: 80 });
  const option = page.locator('mat-option').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(storeName)}\\s*$`) }).first();
  await expect(option, `"${storeName}" should be offered after typing it.`).toBeVisible({ timeout: 30000 });
  await clickWhenReady(page, option);
  await expect(option).toHaveAttribute('aria-selected', 'true');
  // Multi-select panel stays open; its transparent backdrop closes it.
  await page.locator('.cdk-overlay-transparent-backdrop').first().click();
  await expect(page.locator('.mat-select-panel')).toHaveCount(0, { timeout: 10000 });
  await expect(storeSelect(page)).toContainText(storeName);
}

/** @param {import('@playwright/test').Page} page */
async function getTotalResults(page) {
  const label = page.getByText(/Total \d+ results found/).first();
  await expect(label).toBeVisible({ timeout: 60000 });
  return Number(((await label.innerText()).match(/Total (\d+) results found/) || [])[1]);
}

/**
 * Waits for the ratings list API response for a given page number.
 * @param {import('@playwright/test').Page} page
 * @param {number} pageNumber
 */
function waitForRatingsPage(page, pageNumber) {
  return page.waitForResponse((r) => /\/api\/ratings\/getAmStoreRatings/.test(r.url()) &&
    r.request().method() === 'POST' &&
    (() => { try { return JSON.parse(r.request().postData() || '{}').Page === pageNumber; } catch { return false; } })(),
  { timeout: 240000 });
}

/**
 * Waits until the listed store names stop changing for 5 seconds.
 * @param {import('@playwright/test').Page} page
 */
async function waitForStableNames(page) {
  let previous = '';
  let stableSince = Date.now();
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const current = JSON.stringify(await getNames(page));
    if (current !== previous) { previous = current; stableSince = Date.now(); }
    else if (Date.now() - stableSince >= 5000) return;
    await page.waitForTimeout(1000);
  }
  throw new Error('Store ratings table kept changing for 2 minutes.');
}

/** @param {import('@playwright/test').Page} page */
function activePage(page) {
  return page.locator('.ngx-pagination li.current').first();
}

/** @param {import('@playwright/test').Page} page */
async function getNames(page) {
  return page.locator('tbody tr td:first-child').evaluateAll((cells) => cells.map((c) => (c.textContent || '').trim()));
}

/** @param {import('@playwright/test').Locator} row */
async function readRow(row) {
  const cells = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
  return { name: cells[0], arabicName: cells[1], count: Number(cells[2]), average: Number(cells[3]) };
}

/**
 * Filters the list to Food House, reads its row and opens its summary.
 * @param {import('@playwright/test').Page} page
 */
async function openFoodHouseSummary(page) {
  await selectStore(page, TEST_STORE);
  await clickToolbar(page, 'Search');
  const row = page.locator('tbody tr').first();
  await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 60000 });
  const data = await readRow(row);
  expect(data.name).toBe(TEST_STORE);
  await clickWhenReady(page, row.locator('button[mattooltip="View Store Ratings"]'));
  await expect(page.getByRole('heading', { name: `Rating Summary - ${TEST_STORE}` })).toBeVisible({ timeout: 60000 });
  await waitForSpinners(page);
  await expect(page.getByText(/Total \d+ results found/)).toBeVisible({ timeout: 60000 });
  return data;
}

/** @param {import('@playwright/test').Page} page */
async function readRatingAnalysis(page) {
  const card = page.locator('app-store-rating-bar');
  await expect(card.locator('.rating-points')).toBeVisible({ timeout: 30000 });
  const average = Number((await card.locator('.rating-points').innerText()).trim());
  const reviews = Number(((await card.locator('.reviews-text').innerText()).match(/(\d+)\s+reviews/) || [])[1]);
  const labels = (await card.locator('.star-color').allInnerTexts()).map((t) => t.trim()).filter((t) => /star$/.test(t));
  const percents = await card.locator('mat-progress-bar').evaluateAll((bars) => bars.map((b) => Number(b.getAttribute('aria-valuenow') || 0)));
  return { average, reviews, bars: labels.map((label, i) => ({ label, percent: percents[i] })) };
}

/**
 * Comment rows: sentiment icon, order no (mat-card-title), date, star rating.
 * @param {import('@playwright/test').Page} page
 */
async function readComments(page) {
  return page.locator('mat-card-title').evaluateAll((titles) => titles.map((title) => {
    const row = title.closest('.row');
    return {
      orderNo: (title.textContent || '').trim(),
      date: (title.parentElement?.querySelector('span')?.textContent || '').trim(),
      rating: Number(row?.querySelector('rating [role="slider"]')?.getAttribute('aria-valuenow') || 0),
    };
  }));
}

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
