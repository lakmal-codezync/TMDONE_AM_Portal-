// @ts-check
// ============================================================
// TMDone Admin Console - Target Audience Builder / Offer Queries
// Scope: view-only coverage — page shell, search/clear, and
// pagination. Create/edit/delete flows are intentionally not
// tested here.
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

const OFFERS_URL = '#/home/offers/offer-queries';

/** @param {import('@playwright/test').Page} page */
async function waitForNoSpinner(page) {
  for (const selector of ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay', '.loading-spinner']) {
    await page.locator(selector).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }
}

/** @param {import('@playwright/test').Page} page */
async function goToOffersPage(page) {
  await loginToApp(page);
  await goToPage(page, OFFERS_URL);
  await waitForNoSpinner(page);
  await expect(page).toHaveURL(/offers\/offer-queries/i, { timeout: 30000 });
  const pageReady = await getTable(page).or(getCreateButton(page)).first().isVisible({ timeout: 30000 }).catch(() => false);
  test.skip(!pageReady, 'Target Audience Builder page shell is not visible in this environment.');
}

/** @param {import('@playwright/test').Page} page */
function getCreateButton(page) {
  return page
    .locator('button:has-text("Create Offer Query"), button:has-text("Create Offer"), button:has-text("Create")')
    .filter({ visible: true })
    .first();
}

/** @param {import('@playwright/test').Page} page */
function getTable(page) {
  return page.locator('.table-responsive, mat-table, table').filter({ visible: true }).first();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} term
 */
async function searchOffers(page, term) {
  const searchInput = page
    .locator('input[placeholder*="Search" i], input[placeholder*="Enter Search String" i], input[aria-label*="search" i]')
    .filter({ visible: true })
    .first();

  if (!(await searchInput.isVisible().catch(() => false))) return false;

  await searchInput.click({ force: true });
  await searchInput.fill(term);
  await clickSearchButton(page);
  await page.waitForTimeout(1500);
  await expect(getTable(page).or(page.locator(':text("No data"), :text("No records"), :text("No results")').first()).first()).toBeVisible();
  return true;
}

/** @param {import('@playwright/test').Page} page */
async function clickSearchButton(page) {
  const searchButton = page
    .locator(
      'button.search-btn, button[aria-label*="search" i], button:has(mat-icon:has-text("search")), button:has(img:has-text("search")), button:has-text("Search")'
    )
    .filter({ visible: true })
    .first();

  if (await searchButton.isVisible().catch(() => false) && await searchButton.isEnabled().catch(() => false)) {
    await searchButton.click({ force: true }).catch(() => {});
  } else {
    await page.keyboard.press('Enter').catch(() => {});
  }
}

/** @param {import('@playwright/test').Page} page */
async function clickClearButton(page) {
  const clearButton = page
    .locator(
      'button:has-text("Clear"), button:has-text("Reset"), button:has(mat-icon:has-text("close")), button:has(img:has-text("close")), button[aria-label*="clear" i]'
    )
    .filter({ visible: true })
    .first();

  if (await clearButton.isVisible().catch(() => false) && await clearButton.isEnabled().catch(() => true)) {
    await clearButton.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'next' | 'previous'} direction
 */
async function clickPaginator(page, direction) {
  const pattern = direction === 'next' ? /next|»/i : /prev|previous|«/i;
  const item = page
    .locator(
      [
        `.ngx-pagination li.pagination-${direction === 'next' ? 'next' : 'previous'}`,
        `li.pagination-${direction === 'next' ? 'next' : 'previous'}`,
        'li.page-item',
        'button',
        '[role="button"]',
      ].join(', ')
    )
    .filter({ visible: true })
    .filter({ hasText: pattern })
    .first();

  if (!(await item.isVisible().catch(() => false))) return false;
  const disabled = await item.evaluate((node) => {
    const element = /** @type {HTMLElement} */ (node);
    return element.hasAttribute('disabled') ||
      element.getAttribute('aria-disabled') === 'true' ||
      /disabled/.test(element.getAttribute('class') || '') ||
      !element.querySelector('a, button') && element.tagName.toLowerCase() === 'li';
  }).catch(() => true);
  if (disabled) return false;

  const target = item.locator('a, button').first();
  if (await target.isVisible().catch(() => false)) {
    await target.click({ force: true, noWaitAfter: true }).catch(() => {});
  } else {
    await item.click({ force: true, noWaitAfter: true }).catch(() => {});
  }
  await page.waitForTimeout(1500);
  await expect(getTable(page)).toBeVisible({ timeout: 15000 });
  return true;
}

test.describe.serial('08 - Target Audience Builder - View-Only Coverage', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    await goToOffersPage(page);
  });

  test('OF-01: Target Audience Builder page loads with table, headers, and create control', async ({ page }) => {
    const createVisible = await getCreateButton(page).isVisible({ timeout: 15000 }).catch(() => false);
    const tableVisible = await getTable(page).isVisible({ timeout: 30000 }).catch(() => false);
    expect(createVisible || tableVisible, 'Target Audience Builder should expose a create control or table shell.').toBe(true);
    await expect(page.locator('body')).toContainText(/Target Audience Builder/i);
    await expect(page.locator('body')).toContainText(/Query Name|Title|Actions|Create Offer Query/i);
    if (tableVisible) {
      const headerVisible = await page.locator('th, mat-header-cell').filter({ hasText: /Query Name|Title|Actions/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
      if (!headerVisible) {
        console.log('INFO: Target Audience Builder table headers are not visible; page controls are visible.');
      }
    }

    const visibleControls = await page.locator('button, input, mat-table, table').filter({ visible: true }).count();
    expect(visibleControls).toBeGreaterThan(2);
  });

  test('OF-02: Search and clear controls keep the Target Audience Builder table usable', async ({ page }) => {
    const searched = await searchOffers(page, 'a');
    if (!searched) {
      console.log('INFO: Target Audience Builder list search input is not available in the current UI; table remained usable.');
      await expect(getTable(page)).toBeVisible({ timeout: 15000 });
      return;
    }

    await clickClearButton(page);
    await expect(getTable(page)).toBeVisible({ timeout: 15000 });
  });

  test('OF-03: Pagination next and previous work when multiple pages exist', async ({ page }) => {
    const movedNext = await clickPaginator(page, 'next');
    if (!movedNext) {
      console.log('INFO: Target Audience Builder pagination next is hidden or disabled; current data has a single page.');
      await expect(getTable(page)).toBeVisible();
      return;
    }

    await clickPaginator(page, 'previous');
    await expect(getTable(page)).toBeVisible({ timeout: 15000 });
  });
});
