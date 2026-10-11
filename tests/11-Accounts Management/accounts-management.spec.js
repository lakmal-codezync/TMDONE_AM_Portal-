// @ts-check
// ============================================================
// TMDone Admin Console - Accounts Management Module
// URL: #/home/accounts-management
//
// Covers: page shell + stat cards, store / account-manager filters (and the
// API they call), table, pagination, both downloads, Bulk Upload and Bulk
// Assignment (opened and verified, NEVER submitted), the Delegate dialog
// (verified and closed - there is no remove-delegation action), and a real
// Assign round-trip on one of the user's test stores:
//   reassign to a different manager -> verify -> assign back -> verify,
// with an afterAll safety net that restores the original manager.
// The round-trip runs on the first test store (Cafe Asiana, Food House,
// Eat Fresh Store) whose current manager is in the assignable managers list,
// because a manager that is not in that list could never be restored.
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

const MODULE_URL = '#/home/accounts-management';
const ROUND_TRIP_STORES = ['Cafe Asiana', 'Food House', 'Eat Fresh Store'];
const DIALOG_STORE = 'Cafe Asiana';
const COMBINED_FILTER_STORE = 'Food House';
const TOOLBAR_TOOLTIPS = ['Download Account Managers List', 'Bulk Upload', 'Download', 'Bulk Assignment', 'Search'];
const TABLE_HEADERS = [
  'Branch Name',
  'Delivery Zone',
  'Status',
  'Assigned Account Manager',
  'Assigned Date',
  'Temporary Account Manager',
  'Date Range',
  'Actions',
];
const COL = { name: 0, zone: 1, status: 2, manager: 3, assignedDate: 4, tempManager: 5, dateRange: 6 };

/**
 * State of the Assign round-trip, kept at module level so the afterAll safety
 * net can restore the original manager if a step fails midway.
 * @type {{ store: string, originalId: string, originalName: string, newId: string, newName: string, restored: boolean } | null}
 */
let assignRoundTrip = null;

/** @param {import('@playwright/test').Page} page */
async function waitForNoSpinner(page) {
  for (const selector of ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay', '.loading-spinner']) {
    await page.locator(selector).first().waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  }
}

/**
 * Real click that survives the cycling loader overlay.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 */
async function clickWhenReady(page, locator, attempts = 5) {
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

/** @param {import('@playwright/test').Page} page */
const tableRows = (page) => page.locator('table tbody tr').filter({ has: page.locator('td') });

/** @param {import('@playwright/test').Page} page */
const toolbarButton = (page, /** @type {string} */ tooltip) => page.locator(`button[mattooltip="${tooltip}"]`).first();

/** @param {import('@playwright/test').Page} page */
const activeDialog = (page) => page.locator('mat-dialog-container').last();

/** @param {import('@playwright/test').Page} page */
async function totalResults(page) {
  const text = await page.locator('body').innerText();
  const match = text.match(/Total\s+(\d+)\s+results?\s+found/i);
  return match ? parseInt(match[1], 10) : -1;
}

/**
 * @param {import('@playwright/test').Locator} row
 * @param {number} column
 */
async function cellText(row, column) {
  return ((await row.locator('td').nth(column).innerText()) || '').replace(/\s+/g, ' ').trim();
}

/** @param {import('@playwright/test').Page} page */
async function openAccountsManagement(page) {
  // Navigating to the same hash URL is an in-page hash change that keeps the
  // component (and its selected filters) alive, so reload for a clean page.
  if (/accounts-management/.test(page.url())) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  } else {
    await goToPage(page, MODULE_URL);
  }
  await expect(page).toHaveURL(/accounts-management/);
  await expect(tableRows(page).first(), 'Accounts table should load rows.').toBeVisible({ timeout: 45000 });
  await waitForNoSpinner(page);
}

/**
 * Waits for the list API call triggered by `action` and returns its request
 * payload and response body.
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} action
 */
async function withListResponse(page, action) {
  const responsePromise = page.waitForResponse(
    (response) => /\/api\/management\/list/i.test(response.url()) && response.request().method() === 'POST',
    { timeout: 45000 }
  );
  await action();
  const response = await responsePromise;
  expect(response.status(), 'Accounts list API should succeed.').toBe(200);
  const payload = JSON.parse(response.request().postData() || '{}');
  const body = await response.json();
  await waitForNoSpinner(page);
  return { payload, body };
}

/** @param {import('@playwright/test').Page} page */
async function clickToolbarSearch(page) {
  return withListResponse(page, () => clickWhenReady(page, toolbarButton(page, 'Search')));
}

/**
 * Picks a store in the multi-select "Select a store" filter. No dialog is
 * open on the list page, so Escape safely closes the panel.
 * @param {import('@playwright/test').Page} page
 * @param {string} storeName
 */
async function selectStoreFilter(page, storeName) {
  const storeSelect = page.locator('mat-select[formcontrolname="storeArr"]').first();
  await clickWhenReady(page, storeSelect);
  const option = page.locator('mat-option').filter({ hasText: new RegExp(`^\\s*${storeName}\\s*$`) }).first();
  await expect(option, `Store filter should offer "${storeName}".`).toBeVisible({ timeout: 30000 });
  await option.click();
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.cdk-overlay-pane mat-option').first()).toBeHidden({ timeout: 10000 });
  await expect(storeSelect).toContainText(storeName);
}

/**
 * Picks an account manager in the list-page "Select Account Manager" filter.
 * @param {import('@playwright/test').Page} page
 * @param {string} managerName
 */
async function selectManagerFilter(page, managerName) {
  const managerSelect = page.locator('mat-select:not([formcontrolname])').first();
  await clickWhenReady(page, managerSelect);
  const option = page.locator('mat-option').filter({ hasText: new RegExp(`^\\s*${managerName.trim()}\\s*$`) }).first();
  await expect(option, `Account Manager filter should offer "${managerName}".`).toBeVisible({ timeout: 30000 });
  await option.click();
  await expect(page.locator('.cdk-overlay-pane mat-option').first()).toBeHidden({ timeout: 10000 });
  await expect(managerSelect).toContainText(managerName.trim());
}

/**
 * Filters the list down to one store and returns its row.
 * @param {import('@playwright/test').Page} page
 * @param {string} storeName
 */
async function filterToStore(page, storeName) {
  await openAccountsManagement(page);
  await selectStoreFilter(page, storeName);
  const { payload, body } = await clickToolbarSearch(page);
  expect(payload.StoreIds, 'Store filter should send exactly one store id.').toHaveLength(1);
  expect(body.TotalItemCount, `Filtering by "${storeName}" should return exactly one branch.`).toBe(1);
  const row = tableRows(page).filter({ has: page.locator('td', { hasText: new RegExp(`^\\s*${storeName}\\s*$`) }) }).first();
  await expect(row, `"${storeName}" row should be listed.`).toBeVisible({ timeout: 20000 });
  await expect(tableRows(page)).toHaveCount(1);
  return row;
}

/**
 * Opens a row's Assign dialog and returns the store's currently assigned
 * manager (from the dialog's own API call) and the assignable managers.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} row
 */
async function openAssignDialog(page, row) {
  const assignedPromise = page.waitForResponse((r) => /getAssignedAccountManager/i.test(r.url()), { timeout: 45000 });
  const managersPromise = page.waitForResponse((r) => /getAccountManagers/i.test(r.url()) && r.request().method() === 'GET', {
    timeout: 45000,
  });
  await clickWhenReady(page, row.locator('button').filter({ hasText: /^\s*Assign\s*$/ }).first());
  const assigned = await (await assignedPromise).json();
  /** @type {{ Id: string, FullName: string }[]} */
  const managers = await (await managersPromise).json();

  const dialog = activeDialog(page);
  await expect(dialog, 'Assign dialog should open.').toBeVisible({ timeout: 15000 });
  await expect(dialog).toContainText('Select Account Manager');
  await expect(dialog.locator('button').filter({ hasText: /^\s*Assign\s*$/ })).toBeVisible();
  await expect(dialog.locator('button').filter({ hasText: /^\s*Close\s*$/ })).toBeVisible();
  return { dialog, assigned, managers };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 */
async function closeDialog(page, dialog) {
  await clickWhenReady(page, dialog.locator('button').filter({ hasText: /^\s*Close\s*$/ }).first());
  await expect(page.locator('mat-dialog-container')).toHaveCount(0, { timeout: 10000 });
}

/**
 * Picks a manager in the open Assign dialog and submits it.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 * @param {{ Id: string, FullName: string }} manager
 */
async function assignManagerInDialog(page, dialog, manager) {
  const managerName = manager.FullName.trim();
  const managerSelect = dialog.locator('mat-select').first();
  await clickWhenReady(page, managerSelect);
  const option = page.locator('mat-option').filter({ hasText: new RegExp(`^\\s*${managerName}\\s*$`) }).first();
  await expect(option, `Assign dialog should offer "${managerName}".`).toBeVisible({ timeout: 20000 });
  await option.click();
  await expect(page.locator('.cdk-overlay-pane mat-option').first()).toBeHidden({ timeout: 10000 });
  await expect(managerSelect).toContainText(managerName);

  const assignResponsePromise = page.waitForResponse(
    (r) =>
      /\/api\//i.test(r.url()) &&
      ['POST', 'PUT'].includes(r.request().method()) &&
      !/management\/list|dashboard|getNotifications/i.test(r.url()),
    { timeout: 45000 }
  );
  await clickWhenReady(page, dialog.locator('button').filter({ hasText: /^\s*Assign\s*$/ }).first());
  const assignResponse = await assignResponsePromise;
  const bodyText = await assignResponse.text().catch(() => '');
  console.log(`Assign request: ${assignResponse.request().method()} ${assignResponse.url()} ${assignResponse.request().postData() || ''} -> ${assignResponse.status()} ${bodyText.slice(0, 200)}`);
  expect(assignResponse.status(), `Assign "${managerName}" should succeed (${bodyText.slice(0, 200)}).`).toBe(200);
  expect(`${assignResponse.request().postData() || ''} ${assignResponse.url()}`, 'Assign request should carry the chosen manager id.').toContain(manager.Id);

  const okButton = page.locator('.swal2-confirm').filter({ visible: true }).first();
  if (await okButton.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
    console.log(`Assign feedback: ${(await page.locator('.swal2-popup').innerText()).replace(/\s+/g, ' ')}`);
    await okButton.click();
  }
  await expect(page.locator('mat-dialog-container'), 'Assign dialog should close after assigning.').toHaveCount(0, { timeout: 15000 });
}

/**
 * Reads the store's assigned manager id the same way the app does (by
 * opening the Assign dialog) and closes the dialog without changes.
 * @param {import('@playwright/test').Page} page
 * @param {string} storeName
 */
async function readAssignedManager(page, storeName) {
  const row = await filterToStore(page, storeName);
  const { dialog, assigned, managers } = await openAssignDialog(page, row);
  const rowManager = await cellText(row, COL.manager);
  await closeDialog(page, dialog);
  return { assigned, managers, rowManager };
}

/**
 * Restores the round-trip store's original manager.
 * @param {import('@playwright/test').Page} page
 */
async function restoreOriginalManager(page) {
  if (!assignRoundTrip || assignRoundTrip.restored) return;
  const { store, originalId, originalName } = assignRoundTrip;
  const row = await filterToStore(page, store);
  const { dialog, assigned } = await openAssignDialog(page, row);
  if (assigned?.Id === originalId) {
    await closeDialog(page, dialog);
  } else {
    await assignManagerInDialog(page, dialog, { Id: originalId, FullName: originalName });
  }
  const check = await readAssignedManager(page, store);
  expect(check.assigned?.Id, `"${store}" should be back on its original manager "${originalName}".`).toBe(originalId);
  assignRoundTrip.restored = true;
}

test.describe.serial('Accounts Management Module', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    await loginToApp(page);
  });

  test.afterAll(async ({ browser }) => {
    if (!assignRoundTrip || assignRoundTrip.restored) return;
    test.setTimeout(240000);
    const page = await browser.newPage();
    try {
      await loginToApp(page);
      await restoreOriginalManager(page);
      console.log(`afterAll safety net: restored "${assignRoundTrip.store}" to "${assignRoundTrip.originalName}".`);
    } finally {
      await page.close();
    }
  });

  test('AM-01: Accounts Management page loads with stat cards, toolbar, filters and table', async ({ page }) => {
    await openAccountsManagement(page);
    await expect(page.locator('h1, h2, h3, h4, .breadcrumb-item').filter({ hasText: 'Accounts Management' }).first()).toBeVisible();

    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(body, 'Brand stat card should show a count.').toMatch(/Number of Accounts per Brand \d+ BRAND\(s\)/);
    expect(body, 'Branch stat card should show a count.').toMatch(/Number of Accounts per Branch \d+ BRANCH\(s\)/);
    expect(body, 'Not Assigned stat card should show a count.').toMatch(/Not Assigned Number of Accounts per Branch \d+ BRANCH\(s\)/);

    for (const tooltip of TOOLBAR_TOOLTIPS) {
      await expect(toolbarButton(page, tooltip), `Toolbar should offer "${tooltip}".`).toBeVisible();
    }
    await expect(page.locator('mat-select[formcontrolname="storeArr"]')).toBeVisible();
    await expect(page.locator('mat-form-field').filter({ hasText: 'Select Account Manager' }).first()).toBeVisible();

    const headers = (await page.locator('table thead th').allInnerTexts()).map((h) => h.trim());
    expect(headers).toEqual(TABLE_HEADERS);
    console.log('AM-01 PASSED: Page shell, stat cards, toolbar, filters and table headers verified.');
  });

  test('AM-02: Store filter narrows the list to the selected store', async ({ page }) => {
    const row = await filterToStore(page, DIALOG_STORE);
    expect(await totalResults(page)).toBe(1);
    expect(await cellText(row, COL.name)).toBe(DIALOG_STORE);
    console.log(`AM-02 PASSED: Store filter returned only "${DIALOG_STORE}".`);
  });

  test('AM-03: Table rows render with status, manager and Assign/Delegate actions', async ({ page }) => {
    const { body } = await withListResponse(page, () => openAccountsManagement(page));
    expect(body.TotalItemCount, 'Accounts list should contain branches.').toBeGreaterThan(0);
    await expect(tableRows(page)).toHaveCount(Math.min(body.PageSize, body.TotalItemCount));
    await expect.poll(() => totalResults(page)).toBe(body.TotalItemCount);

    const firstRow = tableRows(page).first();
    expect(await cellText(firstRow, COL.name)).toBe(body.Items[0].Name.trim());
    expect(await cellText(firstRow, COL.status)).toBe(body.Items[0].Status);
    await expect(firstRow.locator('button').filter({ hasText: /^\s*Assign\s*$/ })).toBeVisible();
    await expect(firstRow.locator('button').filter({ hasText: /^\s*Delegate\s*$/ })).toBeVisible();
    console.log(`AM-03 PASSED: ${body.TotalItemCount} branches; first page rows match the API.`);
  });

  test('AM-04: Pagination next and previous move between pages', async ({ page }) => {
    await openAccountsManagement(page);
    const nextLi = page.locator('.ngx-pagination li.pagination-next').first();
    await expect(nextLi, 'Accounts list spans multiple pages, so Next should be enabled.').not.toHaveClass(/disabled/);
    const firstRowPage1 = await cellText(tableRows(page).first(), COL.name);

    const { payload: nextPayload } = await withListResponse(page, () => clickWhenReady(page, nextLi.locator('a')));
    expect(nextPayload.Page).toBe(2);
    await expect(page.locator('.ngx-pagination li.current').first()).toContainText('2');
    await expect.poll(async () => cellText(tableRows(page).first(), COL.name)).not.toBe(firstRowPage1);

    const prevLi = page.locator('.ngx-pagination li.pagination-previous').first();
    await expect(prevLi).not.toHaveClass(/disabled/);
    const { payload: prevPayload } = await withListResponse(page, () => clickWhenReady(page, prevLi.locator('a')));
    expect(prevPayload.Page).toBe(1);
    await expect(page.locator('.ngx-pagination li.current').first()).toContainText('1');
    await expect.poll(async () => cellText(tableRows(page).first(), COL.name)).toBe(firstRowPage1);
    console.log('AM-04 PASSED: Pagination next/previous verified.');
  });

  test('AM-05: Account Manager filter returns only that manager\'s branches', async ({ page }) => {
    const { rowManager } = await readAssignedManager(page, COMBINED_FILTER_STORE);
    await openAccountsManagement(page);
    await selectManagerFilter(page, rowManager);
    const { payload, body } = await clickToolbarSearch(page);
    expect(payload.AccountManagerId, 'Manager filter should send the manager id.').toBeTruthy();
    expect(body.TotalItemCount, `"${rowManager}" manages at least ${COMBINED_FILTER_STORE}.`).toBeGreaterThan(0);

    const rows = tableRows(page);
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      const managers = `${await cellText(rows.nth(index), COL.manager)} ${await cellText(rows.nth(index), COL.tempManager)}`;
      expect(managers.toLowerCase(), `Row ${index + 1} should belong to "${rowManager}".`).toContain(rowManager.trim().toLowerCase());
    }
    console.log(`AM-05 PASSED: Manager filter "${rowManager}" returned ${body.TotalItemCount} branches, all assigned to that manager.`);
  });

  test('AM-06: Store + Account Manager filters combine (match and no-match)', async ({ page }) => {
    const { rowManager, managers } = await readAssignedManager(page, COMBINED_FILTER_STORE);

    await openAccountsManagement(page);
    await selectStoreFilter(page, COMBINED_FILTER_STORE);
    await selectManagerFilter(page, rowManager);
    const matching = await clickToolbarSearch(page);
    expect(matching.body.TotalItemCount, `"${COMBINED_FILTER_STORE}" + its own manager should match one branch.`).toBe(1);
    await expect(tableRows(page)).toHaveCount(1);

    const otherManager = managers.find((m) => m.FullName.trim() && m.FullName.trim().toLowerCase() !== rowManager.toLowerCase());
    expect(otherManager, 'Another account manager should exist for the no-match check.').toBeTruthy();
    await selectManagerFilter(page, /** @type {{FullName: string}} */ (otherManager).FullName);
    const nonMatching = await clickToolbarSearch(page);
    expect(nonMatching.body.TotalItemCount, `"${COMBINED_FILTER_STORE}" + another manager should match nothing.`).toBe(0);
    await expect(tableRows(page)).toHaveCount(0);
    await expect.poll(() => totalResults(page)).toBe(0);
    console.log('AM-06 PASSED: Combined store/manager filters verified.');
  });

  test('AM-07: Download exports the accounts list as Excel', async ({ page }) => {
    await openAccountsManagement(page);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 90000 }),
      clickWhenReady(page, toolbarButton(page, 'Download')),
    ]);
    expect(download.suggestedFilename()).toMatch(/^TMDONE_Accounts_Management.*\.xlsx$/i);
    expect(await download.failure()).toBeNull();
    console.log(`AM-07 PASSED: Downloaded ${download.suggestedFilename()}.`);
  });

  test('AM-08: Bulk Upload opens an .xlsx file picker (not submitted)', async ({ page }) => {
    await openAccountsManagement(page);
    /** @type {string[]} */
    const writes = [];
    page.on('request', (request) => {
      if (/\/api\//.test(request.url()) && !['GET', 'OPTIONS'].includes(request.method()) && !/management\/list|dashboard/i.test(request.url())) {
        writes.push(`${request.method()} ${request.url()}`);
      }
    });

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 20000 }),
      clickWhenReady(page, toolbarButton(page, 'Bulk Upload')),
    ]);
    expect(chooser.isMultiple(), 'Bulk Upload accepts a single file.').toBe(false);
    expect(await chooser.element().getAttribute('accept')).toBe('.xlsx');
    // Deliberately no setFiles(): picking a file would submit a real bulk upload.
    await page.waitForTimeout(2000);
    expect(writes, 'Opening Bulk Upload must not send anything.').toEqual([]);
    console.log('AM-08 PASSED: Bulk Upload opens an .xlsx file chooser; nothing was uploaded.');
  });

  test('AM-09: Download Account Managers List exports an Excel file', async ({ page }) => {
    await openAccountsManagement(page);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      clickWhenReady(page, toolbarButton(page, 'Download Account Managers List')),
    ]);
    expect(download.suggestedFilename()).toMatch(/^TMDONE_Accounts_Managers.*\.xlsx$/i);
    expect(await download.failure()).toBeNull();
    console.log(`AM-09 PASSED: Downloaded ${download.suggestedFilename()}.`);
  });

  test('AM-10: Assign round-trip on a test store (reassign, verify, restore, verify)', async ({ page }) => {
    test.setTimeout(420000);
    /** @type {string[]} */
    const skippedStores = [];

    for (const store of ROUND_TRIP_STORES) {
      const row = await filterToStore(page, store);
      const rowManager = await cellText(row, COL.manager);
      const { dialog, assigned, managers } = await openAssignDialog(page, row);
      const original = managers.find((m) => m.Id === assigned?.Id);
      if (!original) {
        skippedStores.push(`${store} (current manager "${rowManager}" / id ${assigned?.Id} is not assignable, so it could not be restored)`);
        await closeDialog(page, dialog);
        continue;
      }
      await expect(dialog.locator('mat-select').first(), 'Dialog should preselect the current manager.').toContainText(original.FullName.trim());

      const replacement = managers.find((m) => m.Id !== original.Id && m.FullName.trim());
      expect(replacement, 'A different assignable manager should exist.').toBeTruthy();
      const newManager = /** @type {{ Id: string, FullName: string }} */ (replacement);
      assignRoundTrip = {
        store,
        originalId: original.Id,
        originalName: original.FullName.trim(),
        newId: newManager.Id,
        newName: newManager.FullName.trim(),
        restored: false,
      };
      if (skippedStores.length) console.log(`AM-10: skipped ${skippedStores.join('; ')}`);
      console.log(`AM-10: "${store}" currently "${rowManager}"; reassigning to "${assignRoundTrip.newName}".`);

      // 1) Reassign to a different manager and verify.
      await assignManagerInDialog(page, dialog, newManager);
      const reassignedRow = await filterToStore(page, store);
      await expect.poll(async () => cellText(reassignedRow, COL.manager), { message: 'Row should show the new manager.' }).toBe(assignRoundTrip.newName);
      const afterReassign = await readAssignedManager(page, store);
      expect(afterReassign.assigned?.Id, 'Store should now be assigned to the new manager.').toBe(newManager.Id);

      // 2) Assign back to the original manager and verify the restore.
      await restoreOriginalManager(page);
      const restoredRow = await filterToStore(page, store);
      await expect.poll(async () => cellText(restoredRow, COL.manager), { message: 'Row should show the original manager again.' }).toBe(assignRoundTrip.originalName);
      console.log(`AM-10 PASSED: "${store}" reassigned to "${assignRoundTrip.newName}" and restored to "${assignRoundTrip.originalName}".`);
      return;
    }

    throw new Error(`No test store could be used for a safe Assign round-trip: ${skippedStores.join('; ')}`);
  });

  test('AM-11: Delegate dialog on the test store shows its fields and closes without delegating', async ({ page }) => {
    const row = await filterToStore(page, DIALOG_STORE);
    const tempManagerBefore = await cellText(row, COL.tempManager);

    const managersPromise = page.waitForResponse((r) => /getAccountManagers/i.test(r.url()), { timeout: 45000 });
    await clickWhenReady(page, row.locator('button').filter({ hasText: /^\s*Delegate\s*$/ }).first());
    const managers = await (await managersPromise).json();
    const dialog = activeDialog(page);
    await expect(dialog, 'Delegate dialog should open.').toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText('Select Temporary Account Manager');
    await expect(dialog).toContainText('Select End date');
    await expect(dialog.locator('mat-datepicker-toggle button, button[aria-label*="calendar" i]').first()).toBeVisible();
    await expect(dialog.locator('button').filter({ hasText: /^\s*Delegate\s*$/ })).toBeVisible();

    // The temporary-manager dropdown lists the assignable managers.
    await clickWhenReady(page, dialog.locator('mat-select').first());
    await expect(page.locator('mat-option').filter({ hasText: managers[0].FullName.trim() }).first()).toBeVisible({ timeout: 15000 });
    await page.locator('.cdk-overlay-transparent-backdrop, .cdk-overlay-backdrop').last().click();
    await expect(page.locator('.cdk-overlay-pane mat-option').first()).toBeHidden({ timeout: 10000 });
    await expect(dialog, 'Closing the dropdown must keep the dialog open.').toBeVisible();

    await closeDialog(page, dialog);
    expect(await cellText(row, COL.tempManager), 'Closing without delegating must not change the row.').toBe(tempManagerBefore);
    console.log('AM-11 PASSED: Delegate dialog verified and closed without delegating.');
  });

  test('AM-12: Bulk Assignment dialog shows its fields and closes without submitting', async ({ page }) => {
    await openAccountsManagement(page);
    await clickWhenReady(page, toolbarButton(page, 'Bulk Assignment'));
    const dialog = activeDialog(page);
    await expect(dialog, 'Bulk Assignment dialog should open.').toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText('Select Account Manager');
    await expect(dialog).toContainText('Select New Account Manager');
    await expect(dialog.locator('mat-select')).toHaveCount(2);
    await expect(dialog.locator('mat-checkbox').filter({ hasText: 'Temporary' })).toBeVisible();
    await expect(dialog.locator('button').filter({ hasText: /^\s*Assign\s*$/ })).toBeVisible();
    await closeDialog(page, dialog);
    console.log('AM-12 PASSED: Bulk Assignment dialog verified and closed without submitting.');
  });
});
