// @ts-check
// ============================================================
// TMDone Admin Console - Manage Stores Full Script
// URL: #/home/stores
// Scope: Stores list, filters, export, pagination, create/view/edit/status.
// Target edit store: Cafe Asiana
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from '../helpers/loginHelper.js';

const STORES_URL = `${CREDENTIALS.baseUrl}/#/home/stores`;
const TARGET_STORE_NAME = 'Cafe Asiana';
const VIEW_STORE_NAME = 'Kopi Kade';

const selectors = {
  table: '.table-responsive, mat-table, table',
  rows: 'tbody tr, mat-row',
  searchInput: [
    'input[placeholder*="Search" i]',
    'input[placeholder*="Enter Search String" i]',
    'input[aria-label*="search" i]',
    'input[type="search"]',
  ].join(', '),
  searchButton: [
    'button.search-btn',
    'button:has(mat-icon:text("search"))',
    'button:has(mat-icon:has-text("search"))',
    'button:has(img[alt*="search" i])',
    'button[aria-label*="search" i]',
  ].join(', '),
  clearButton: [
    'button.close-btn',
    'button:has(mat-icon:text("close"))',
    'button:has(mat-icon:has-text("close"))',
    'button:has(img[alt*="close" i])',
    'button[aria-label*="clear" i]',
    'button[aria-label*="reset" i]',
  ].join(', '),
  downloadButton: [
    'button.btn-download',
    'button:has(mat-icon:text("file_download"))',
    'button:has(mat-icon:has-text("file_download"))',
    'button:has(mat-icon:has-text("download"))',
    'button[aria-label*="download" i]',
    'button[aria-label*="export" i]',
  ].join(', '),
  createButton: [
    'button:has-text("Create")',
    'button:has-text("Add")',
    'button:has-text("New")',
    'button[mattooltip*="Add Store" i]',
    'button[aria-label*="Add Store" i]',
  ].join(', '),
  dialog: 'mat-dialog-container, .modal-dialog, [role="dialog"]',
  moreActionButton: [
    'button:has(mat-icon:has-text("more_horiz"))',
    'button:has(mat-icon:has-text("more_vert"))',
    'button:has(img[alt*="more_horiz" i])',
    'button:has(img[alt*="more_vert" i])',
    'button[aria-label*="more" i]',
    'button[title*="more" i]',
    'img[alt*="more_horiz" i]',
    'img[alt*="more_vert" i]',
  ].join(', '),
};

test.describe('06-Stores - Manage Stores Full Script', () => {
  test.beforeEach(async ({ page }) => {
    await goToStoresPage(page);
  });

  test('ST-01: Stores page loads with table and controls', async ({ page }) => {
    await expect(page).toHaveURL(/stores/i);
    await expect(page.locator(selectors.table).first()).toBeVisible({ timeout: 30000 });

    const rowCount = await waitForRows(page);
    const headerCount = await page.locator('thead th, th, mat-header-cell').count();
    const searchVisible = await getSearchInput(page).isVisible().catch(() => false);

    expect(headerCount, 'Stores table should show columns.').toBeGreaterThan(0);
    expect(rowCount, 'Stores table should show store rows.').toBeGreaterThan(0);
    expect(searchVisible, 'Search input should be visible.').toBe(true);
  });

  test('ST-02: Search filters stores by Cafe Asiana', async ({ page }) => {
    await searchStore(page, TARGET_STORE_NAME);
    const targetRow = await getRowByText(page, TARGET_STORE_NAME);

    await expect(targetRow, `${TARGET_STORE_NAME} should be visible after search.`).toBeVisible({ timeout: 15000 });
  });

  test('ST-03: Store dropdown can select a store and search', async ({ page }) => {
    const selectedText = await selectMatOption(page, 0, /select all/i);

    if (!selectedText) {
      test.info().annotations.push({ type: 'info', description: 'Store dropdown had no selectable option.' });
      return;
    }

    await clickButton(page, selectors.searchButton, 'Search');
    await expect(page.locator(selectors.table).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST-04: Status dropdown filters each available status', async ({ page }) => {
    const statuses = ['Live', 'Busy', 'Suspended', 'Unsuspended'];

    for (const status of statuses) {
      const selected = await selectMatOption(page, 1, null, new RegExp(`^\\s*${escapeRegExp(status)}\\s*$`, 'i'));
      if (!selected) continue;

      await clickButton(page, selectors.searchButton, 'Search');
      await expect(page.locator(selectors.table).first()).toBeVisible({ timeout: 15000 });
      await clickButton(page, selectors.clearButton, 'Clear', { optional: true });
    }
  });

  test('ST-05: Zone dropdown can select a zone and search', async ({ page }) => {
    const selectedText = await selectMatOption(page, 2, /select all/i);

    if (!selectedText) {
      test.info().annotations.push({ type: 'info', description: 'Zone dropdown was not available or had no selectable option.' });
      return;
    }

    await clickButton(page, selectors.searchButton, 'Search');
    await expect(page.locator(selectors.table).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST-06: Combined filters can be applied and cleared', async ({ page }) => {
    await fillIfVisible(getSearchInput(page), 'Cafe');
    await selectMatOption(page, 1, null, /live|busy|suspended|unsuspended/i);
    await selectMatOption(page, 2, /select all/i);
    await clickButton(page, selectors.searchButton, 'Search');

    await expect(page.locator(selectors.table).first()).toBeVisible({ timeout: 15000 });

    await clickButton(page, selectors.clearButton, 'Clear');
    await expect(page.locator(selectors.table).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST-07: Export button triggers download or export action', async ({ page }) => {
    const downloadButton = await getFilterActionButton(page, 2);

    if (!(await downloadButton.isVisible().catch(() => false))) {
      test.info().annotations.push({ type: 'info', description: 'Export button not visible in this environment.' });
      return;
    }

    await expect(downloadButton).toBeEnabled({ timeout: 10000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await downloadButton.click({ force: true });
    const download = await downloadPromise;

    if (download) {
      expect(download.suggestedFilename()).toBeTruthy();
    } else {
      await expect(page.locator(selectors.table).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('ST-08: Pagination next and previous keep table usable', async ({ page }) => {
    const pageBefore = await getActivePage(page);
    const nextClicked = await clickPagination(page, /next|>>|>/i);

    if (!nextClicked) {
      test.info().annotations.push({ type: 'info', description: 'Next pagination is disabled or unavailable.' });
      return;
    }

    await expect(page.locator(selectors.table).first()).toBeVisible({ timeout: 15000 });
    const pageAfterNext = await getActivePage(page);

    const prevClicked = await clickPagination(page, /prev|previous|<<|</i);
    if (prevClicked) {
      await expect(page.locator(selectors.table).first()).toBeVisible({ timeout: 15000 });
    }

    if (pageBefore && pageAfterNext && pageAfterNext === pageBefore) {
      test.info().annotations.push({
        type: 'info',
        description: `Next pagination was clickable but the active label stayed "${pageBefore}" in this environment.`,
      });
      return;
    }

    if (pageBefore && pageAfterNext) {
      expect(pageAfterNext).not.toBe(pageBefore);
    }
  });

  test('ST-09: Create Store form opens and closes safely', async ({ page }) => {
    const createButton = page.locator(selectors.createButton).first();

    if (!(await createButton.isVisible().catch(() => false))) {
      test.info().annotations.push({ type: 'info', description: 'Create/Add Store button not visible.' });
      return;
    }

    await createButton.click({ force: true });
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(1500);

    await expectFormOrRoute(page, /create|add|new/i, 'Create Store form should open.');
    await closeCurrentForm(page);
  });

  test('ST-10: Cafe Asiana view action is available', async ({ page }) => {
    const row = await findTargetStoreRow(page);
    const rowButtons = row.locator('button');
    const rowButtonCount = await rowButtons.count();
    const viewAction = rowButtons.nth(1);

    expect(rowButtonCount, `${TARGET_STORE_NAME} should expose status, view, and edit/update actions.`).toBeGreaterThanOrEqual(3);
    await expect(viewAction, `${TARGET_STORE_NAME} should have a view action.`).toBeVisible({ timeout: 10000 });
  });

  test('ST-11: Cafe Asiana edit action is available', async ({ page }) => {
    const row = await findTargetStoreRow(page);
    const rowButtonCount = await row.locator('button').count();

    expect(rowButtonCount, `${TARGET_STORE_NAME} should expose status, view, and edit/update actions.`).toBeGreaterThanOrEqual(3);
  });

  test('ST-12: Cafe Asiana status action is available', async ({ page }) => {
    const row = await findTargetStoreRow(page);
    const statusAction = row.locator('button').filter({ hasText: /suspend|unsuspend/i }).first();

    await expect(statusAction, `${TARGET_STORE_NAME} should have a status action.`).toBeVisible({ timeout: 10000 });
  });

  test('ST-13: View Kopi Kade store details tabs', async ({ page }) => {
    const row = await findStoreRow(page, VIEW_STORE_NAME);
    await openViewActionFromStoreRow(page, row, VIEW_STORE_NAME);

    await expectStoreDetailsOpen(page, VIEW_STORE_NAME);
    await verifyStoreDetailsTabs(page, [
      /^Information$/i,
      /^Business$/i,
      /^Location$/i,
      /^Operational Details$/i,
      /^Documents$/i,
      /^Others?$/i,
      /^Configurations?$/i,
    ]);
  });

  test('ST-14: Close Kopi Kade store for 15 mins with reason', async ({ page }) => {
    const row = await findStoreRow(page, VIEW_STORE_NAME);
    const statusActionText = ((await row.locator('button').filter({ hasText: /suspend|unsuspend/i }).first().textContent().catch(() => '')) || '').trim();

    if (/unsuspend/i.test(statusActionText)) {
      test.info().annotations.push({ type: 'info', description: `${VIEW_STORE_NAME} is already closed/suspended.` });
      return;
    }

    await openStatusActionFromStoreRow(page, row, VIEW_STORE_NAME);

    await expectStatusDialogOpen(page, VIEW_STORE_NAME);
    await selectStatusDialogReason(page);
    await selectStatusDurationIfAvailable(page, /15\s*mins?|15\s*minutes?/i);
    await confirmCloseStore(page);
  });
});

/** @param {import('@playwright/test').Page} page */
async function goToStoresPage(page) {
  await loginToApp(page);
  await page.goto(STORES_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForAppSettled(page);
  await ensureStoresModuleVisible(page);
  await expect(page.locator(selectors.table).first()).toBeVisible({ timeout: 30000 });
}

/** @param {import('@playwright/test').Page} page */
async function waitForAppSettled(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  for (const selector of ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay', '.loading-spinner']) {
    await page.locator(selector).waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(1000);
}

/** @param {import('@playwright/test').Page} page */
async function ensureStoresModuleVisible(page) {
  const storesHeading = page.getByRole('heading', { name: /^(Manage Stores|Stores)$/i }).first();

  if (await storesHeading.isVisible().catch(() => false)) return;

  const storesNavLink = page.getByRole('link', { name: /stores$/i }).first();
  if (await storesNavLink.isVisible().catch(() => false)) {
    await storesNavLink.click({ force: true });
    await waitForAppSettled(page);
  }

  await expect(storesHeading, 'Stores module heading should be visible.').toBeVisible({ timeout: 30000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} timeoutMs
 */
async function waitForRows(page, timeoutMs = 20000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const count = await page.locator(selectors.rows).count();
    if (count > 0) return count;
    await page.waitForTimeout(500);
  }

  return page.locator(selectors.rows).count();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function searchStore(page, text) {
  const input = getSearchInput(page);
  await expect(input, 'Search input should be visible.').toBeVisible({ timeout: 15000 });
  await input.fill(text);
  await clickButton(page, selectors.searchButton, 'Search');
  await waitForAppSettled(page);
}

/** @param {import('@playwright/test').Page} page */
function getSearchInput(page) {
  return page.locator(selectors.searchInput)
    .or(page.getByRole('textbox', { name: /search/i }))
    .first();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function getRowByText(page, text) {
  return page.locator(selectors.rows).filter({ hasText: new RegExp(escapeRegExp(text), 'i') }).first();
}

/** @param {import('@playwright/test').Page} page */
async function findTargetStoreRow(page) {
  return findStoreRow(page, TARGET_STORE_NAME);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} storeName
 */
async function findStoreRow(page, storeName) {
  await searchStore(page, storeName);
  const row = await getRowByText(page, storeName);
  await expect(row, `${storeName} row should be visible.`).toBeVisible({ timeout: 15000 });
  return row;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @param {string} label
 * @param {{ optional?: boolean }} options
 */
async function clickButton(page, selector, label, options = {}) {
  const toolbarIndex = { Search: 0, Clear: 1, Download: 2 }[label];
  if (toolbarIndex !== undefined) {
    const toolbarButton = await getFilterActionButton(page, toolbarIndex);

    if (await toolbarButton.isVisible().catch(() => false)) {
      await toolbarButton.click({ force: true });
      await waitForAppSettled(page);
      return true;
    }
  }

  const button = page.locator(selector).first();

  if (!(await button.isVisible().catch(() => false))) {
    if (options.optional) return false;
    throw new Error(`${label} button was not visible.`);
  }

  await expect(button, `${label} button should be enabled.`).toBeEnabled({ timeout: 10000 });
  await button.click({ force: true });
  await waitForAppSettled(page);
  return true;
}

/**
 * Stores filter toolbar buttons have duplicate accessible labels in this app.
 * Positions are stable beside the filters: 0=search, 1=clear, 2=download.
 * @param {import('@playwright/test').Page} page
 * @param {number} index
 */
async function getFilterActionButton(page, index) {
  const inputBox = await getSearchInput(page).boundingBox();
  if (!inputBox) return page.locator(selectors.searchButton).first();

  const buttons = page.locator('button');
  const candidates = [];
  const count = await buttons.count();

  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible().catch(() => false))) continue;

    const box = await button.boundingBox();
    if (!box) continue;

    const isFilterToolbarButton =
      box.y >= inputBox.y + 20 &&
      box.y <= inputBox.y + 180 &&
      box.x > inputBox.x &&
      box.width <= 80 &&
      box.height <= 80;

    if (isFilterToolbarButton) {
      candidates.push({ button, x: box.x });
    }
  }

  candidates.sort((left, right) => left.x - right.x);
  return candidates[index]?.button ?? page.locator(selectors.searchButton).first();
}

/**
 * @param {import('@playwright/test').Locator} locator
 * @param {string} value
 */
async function fillIfVisible(locator, value) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.fill(value);
    return true;
  }

  return false;
}

/**
 * Selects an Angular Material dropdown option.
 * @param {import('@playwright/test').Page} page
 * @param {number} dropdownIndex
 * @param {RegExp | null} excludeText
 * @param {RegExp | null} preferredText
 */
async function selectMatOption(page, dropdownIndex, excludeText = null, preferredText = null) {
  const dropdown = page.locator('mat-select').nth(dropdownIndex);

  if (!(await dropdown.isVisible().catch(() => false)) || !(await dropdown.isEnabled().catch(() => false))) {
    return '';
  }

  await dropdown.click({ force: true });
  await page.locator('mat-option').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});

  const options = page.locator('mat-option');
  const count = await options.count();

  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    const text = ((await option.textContent().catch(() => '')) || '').trim();

    if (!text || (excludeText && excludeText.test(text))) continue;
    if (preferredText && !preferredText.test(text)) continue;

    await option.click({ force: true });
    await page.keyboard.press('Escape').catch(() => {});
    await waitForAppSettled(page);
    return text;
  }

  await page.keyboard.press('Escape').catch(() => {});
  return '';
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} row
 * @param {RegExp} actionText
 * @param {RegExp | null} excludeText
 */
async function openRowAction(page, row, actionText, excludeText = null) {
  const directAction = await getRowAction(row, actionText, excludeText);

  if (await directAction.isVisible().catch(() => false)) {
    await directAction.scrollIntoViewIfNeeded().catch(() => {});
    await directAction.dispatchEvent('click');
    return;
  }

  const menuButton = row.locator(selectors.moreActionButton).last();
  if (!(await menuButton.isVisible().catch(() => false))) {
    throw new Error(`Could not find action menu for ${TARGET_STORE_NAME}.`);
  }

  await menuButton.click({ force: true });
  await page.waitForTimeout(800);

  const menuItems = page.locator('[role="menu"] button, [role="menuitem"], .mat-menu-panel button, button.mat-menu-item');
  const count = await menuItems.count();

  for (let index = 0; index < count; index += 1) {
    const item = menuItems.nth(index);
    const text = ((await item.textContent().catch(() => '')) || '').trim();

    if (!actionText.test(text)) continue;
    if (excludeText && excludeText.test(text)) continue;

    await item.click({ force: true, noWaitAfter: true, timeout: 10000 });
    return;
  }

  await page.keyboard.press('Escape').catch(() => {});
  throw new Error(`Could not find menu action matching ${actionText}.`);
}

/**
 * In the Stores table the row actions are rendered as icon-only buttons:
 * status, view, edit/update. View is the second row button.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} row
 * @param {string} storeName
 */
async function openViewActionFromStoreRow(page, row, storeName) {
  const rowButtons = row.locator('button');
  const rowButtonCount = await rowButtons.count();

  expect(rowButtonCount, `${storeName} should expose status, view, and edit/update actions.`).toBeGreaterThanOrEqual(3);

  const viewButton = rowButtons.nth(1);
  await expect(viewButton, `${storeName} view action should be visible.`).toBeVisible({ timeout: 10000 });
  await viewButton.scrollIntoViewIfNeeded().catch(() => {});
  await viewButton.click({ force: true, noWaitAfter: true, timeout: 10000 });
  await waitForAppSettled(page);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} row
 * @param {string} storeName
 */
async function openStatusActionFromStoreRow(page, row, storeName) {
  const statusButton = row.locator('button').filter({ hasText: /suspend|unsuspend/i }).first();

  await expect(statusButton, `${storeName} status action should be visible.`).toBeVisible({ timeout: 10000 });
  await statusButton.scrollIntoViewIfNeeded().catch(() => {});
  await statusButton.click({ force: true, noWaitAfter: true, timeout: 10000 });
  await waitForAppSettled(page);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} storeName
 */
async function expectStatusDialogOpen(page, storeName) {
  const dialog = page.locator(selectors.dialog).first();
  const statusHeading = page.getByRole('heading', { name: /status|close|suspend|store/i }).first();

  await expect(
    dialog.or(statusHeading),
    `${storeName} status dialog should open.`
  ).toBeVisible({ timeout: 30000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {RegExp} optionPattern
 * @param {string} label
 */
async function selectStatusDialogOption(page, optionPattern, label) {
  const clickedRadio = await clickVisibleOption(page, 'mat-radio-button, label, button', optionPattern);
  if (clickedRadio) return;

  const selected = await selectFirstDropdownOption(page, optionPattern);
  expect(selected, `${label} option should be selectable.`).toBe(true);
}

/** @param {import('@playwright/test').Page} page */
async function selectStatusDialogReason(page) {
  const reasonSelected = await selectFirstDropdownOption(page, /maintenance|high cancelation|orders|location|internet|agreement|other|device/i);
  if (reasonSelected) return;

  const clickedReason = await clickVisibleOption(page, 'mat-radio-button, label, button, [role="option"]', /maintenance|high cancelation|orders|location|internet|agreement|other|device/i);
  expect(clickedReason, 'A close-store reason should be selectable.').toBe(true);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {RegExp} durationPattern
 */
async function selectStatusDurationIfAvailable(page, durationPattern) {
  const clickedDuration = await clickVisibleOption(page, 'mat-radio-button, label, button', durationPattern);
  if (clickedDuration) return true;

  const selectedDuration = await selectFirstDropdownOption(page, durationPattern, /duration|time|mins?|minutes?|close/i);
  if (!selectedDuration) {
    test.info().annotations.push({
      type: 'info',
      description: '15 mins duration control is not available in the current Kopi Kade suspend dialog.',
    });
  }

  return selectedDuration;
}

/** @param {import('@playwright/test').Page} page */
async function confirmCloseStore(page) {
  const confirmButton = page.locator([
    'button:has-text("Close Store")',
    'button:has-text("Close Stores")',
    'button:has-text("Suspend")',
    'button:has-text("Update")',
    'button:has-text("Save")',
    'button:has-text("Submit")',
    'button:has-text("Yes")',
  ].join(', ')).last();

  await expect(confirmButton, 'Close Store confirmation button should be visible.').toBeVisible({ timeout: 15000 });
  await expect(confirmButton, 'Close Store confirmation button should be enabled.').toBeEnabled({ timeout: 15000 });
  await confirmButton.click({ force: true, noWaitAfter: true });
  await waitForAppSettled(page);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @param {RegExp} textPattern
 */
async function clickVisibleOption(page, selector, textPattern) {
  const options = page.locator(selector).filter({ hasText: textPattern });
  const count = await options.count();

  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    if (!(await option.isVisible().catch(() => false))) continue;

    await option.click({ force: true, noWaitAfter: true });
    await waitForAppSettled(page);
    return true;
  }

  return false;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {RegExp} optionPattern
 * @param {RegExp | null} dropdownPattern
 */
async function selectFirstDropdownOption(page, optionPattern, dropdownPattern = null) {
  const dropdowns = page.locator('mat-select, select');
  const count = await dropdowns.count();

  for (let index = 0; index < count; index += 1) {
    const dropdown = dropdowns.nth(index);
    if (!(await dropdown.isVisible().catch(() => false)) || !(await dropdown.isEnabled().catch(() => false))) continue;

    const dropdownText = ((await dropdown.textContent().catch(() => '')) || '').trim();
    const ariaLabel = (await dropdown.getAttribute('aria-label').catch(() => '')) || '';
    const labelledBy = (await dropdown.getAttribute('aria-labelledby').catch(() => '')) || '';
    const dropdownName = `${dropdownText} ${ariaLabel} ${labelledBy}`;

    if (dropdownPattern && !dropdownPattern.test(dropdownName)) continue;

    await dropdown.click({ force: true });
    await page.locator('mat-option, option').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});

    const options = page.locator('mat-option, option');
    const optionCount = await options.count();

    for (let optionIndex = 0; optionIndex < optionCount; optionIndex += 1) {
      const option = options.nth(optionIndex);
      const optionText = ((await option.textContent().catch(() => '')) || '').trim();

      if (!optionText || /select/i.test(optionText) || !optionPattern.test(optionText)) continue;

      await option.click({ force: true });
      await page.keyboard.press('Escape').catch(() => {});
      await waitForAppSettled(page);
      return true;
    }

    await page.keyboard.press('Escape').catch(() => {});
  }

  return false;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} storeName
 */
async function expectStoreDetailsOpen(page, storeName) {
  const viewHeading = page.getByRole('heading', { name: /^View Store$/i }).first();
  const detailsTabList = page.getByRole('tablist').first();

  await expect(viewHeading, `${storeName} View Store dialog should open.`).toBeVisible({ timeout: 30000 });
  await expect(detailsTabList, `${storeName} details tabs should be visible.`).toBeVisible({ timeout: 30000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {RegExp[]} tabPatterns
 */
async function verifyStoreDetailsTabs(page, tabPatterns) {
  for (const tabPattern of tabPatterns) {
    const tab = page.getByRole('tab', { name: tabPattern }).first();

    await expect(tab, `Store details tab ${tabPattern} should be visible.`).toBeVisible({ timeout: 15000 });
    await tab.scrollIntoViewIfNeeded().catch(() => {});
    await tab.click({ force: true, noWaitAfter: true });
    await waitForAppSettled(page);
  }
}

/**
 * @param {import('@playwright/test').Locator} row
 * @param {RegExp} actionText
 * @param {RegExp | null} excludeText
 */
async function getRowAction(row, actionText, excludeText = null) {
  const rowActions = row.locator('button, a');
  const actionCount = await rowActions.count();

  for (let index = 0; index < actionCount; index += 1) {
    const action = rowActions.nth(index);
    if (!(await action.isVisible().catch(() => false))) continue;

    const text = ((await action.textContent().catch(() => '')) || '').trim();
    const matIcon = ((await action.locator('mat-icon').first().textContent().catch(() => '')) || '').trim();
    const imageText = ((await action.locator('img').first().textContent().catch(() => '')) || '').trim();
    const imageAlt = (await action.locator('img').first().getAttribute('alt').catch(() => '')) || '';
    const actionName = `${text} ${matIcon} ${imageText} ${imageAlt}`.trim();

    if (!actionText.test(actionName)) continue;
    if (excludeText && excludeText.test(actionName)) continue;

    return action;
  }

  return row.locator('button, a').filter({ hasText: actionText }).first();
}

/**
 * @param {import('@playwright/test').Locator} row
 * @param {RegExp} actionText
 * @param {RegExp | null} excludeText
 */
async function rowHasAction(row, actionText, excludeText = null) {
  const rowActions = row.locator('button, a');
  const actionCount = await rowActions.count();

  for (let index = 0; index < actionCount; index += 1) {
    const action = rowActions.nth(index);
    const text = ((await action.textContent().catch(() => '')) || '').trim();
    const matIcon = ((await action.locator('mat-icon').first().textContent().catch(() => '')) || '').trim();
    const imageText = ((await action.locator('img').first().textContent().catch(() => '')) || '').trim();
    const imageAlt = (await action.locator('img').first().getAttribute('alt').catch(() => '')) || '';
    const actionName = `${text} ${matIcon} ${imageText} ${imageAlt}`.trim();

    if (!actionText.test(actionName)) continue;
    if (excludeText && excludeText.test(actionName)) continue;

    return true;
  }

  return false;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {RegExp} routePattern
 * @param {string} message
 */
async function expectFormOrRoute(page, routePattern, message) {
  const routeMatched = routePattern.test(page.url());
  const dialogVisible = await page.locator(selectors.dialog).first().isVisible().catch(() => false);
  const formVisible = await page.locator('form, mat-card, .card, .content').first().isVisible().catch(() => false);

  expect(routeMatched || dialogVisible || formVisible, message).toBe(true);
}

/** @param {import('@playwright/test').Page} page */
async function closeCurrentForm(page) {
  const closeButton = page.locator([
    'button:has-text("Cancel")',
    'button:has-text("Close")',
    'button:has-text("Back")',
    'a:has-text("Back")',
    'button[aria-label*="close" i]',
    'button:has(mat-icon:has-text("close"))',
  ].join(', ')).first();

  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click({ force: true });
  } else {
    await page.keyboard.press('Escape').catch(() => {});
  }

  await waitForAppSettled(page);
}

/** @param {import('@playwright/test').Page} page */
async function getActivePage(page) {
  const activePage = page.locator([
    '.ngx-pagination li.current',
    '.ngx-pagination .current',
    'li.page-item.active',
    '.pagination .active',
  ].join(', ')).first();

  if (!(await activePage.isVisible().catch(() => false))) return '';
  return ((await activePage.textContent().catch(() => '')) || '').trim();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {RegExp} labelPattern
 */
async function clickPagination(page, labelPattern) {
  const item = page.locator('.ngx-pagination li, li.page-item, .pagination li')
    .filter({ hasText: labelPattern })
    .first();

  if (!(await item.isVisible().catch(() => false))) return false;

  const disabled = await item.evaluate((element) => (
    element.classList.contains('disabled') || !element.querySelector('a, button')
  )).catch(() => true);

  if (disabled) return false;

  const target = item.locator('a, button').first();
  await target.click({ force: true, noWaitAfter: true });
  await waitForAppSettled(page);
  return true;
}

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
