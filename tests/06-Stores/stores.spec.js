// @ts-check
// ============================================================
// TMDone Admin Console - Manage Stores Full Script
// URL: #/home/stores
// Scope: Stores list, search, store/status/zone filters, clear, export,
// pagination, View Store details panel, Edit Status (busy) dialog,
// Suspend dialog, and a real Suspend -> Unsuspend round trip on the
// approved test store "Food House" (Colombo zone).
//
// Safety: this account has no Create Store permission (ST-09 keeps its
// soft skip by user decision). The only state change made anywhere in
// this file is ST-14, which suspends Food House and ALWAYS restores it
// (Unsuspend with a reason). An afterAll safety net restores it again if
// the test died between the two steps. Every other dialog is opened,
// inspected and closed with Cancel.
// ============================================================

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { loginToApp, CREDENTIALS } from '../helpers/loginHelper.js';
import { backendIssue, frontendIssue } from '../helpers/knownIssues.js';

const STORES_URL = `${CREDENTIALS.baseUrl}/#/home/stores`;
const TARGET_STORE_NAME = 'Food House';
const TEST_ZONE = 'Colombo';
const COLOMBO_TEST_STORES = ['Food House', 'Cafe Asiana - Market Place'];

const EXPECTED_HEADERS = [
  'Branch English Name',
  'Branch Arabic Name',
  'Delivery Zone',
  'Sector',
  'VAT Type',
  'Municipality Tax',
  'Tourism Tax',
  'Commission %',
  'Contact Expiration Date',
  'Delivery Fee',
  'Rating',
  'Business Chain',
  'Suspend Status',
  'Status',
  'Actions',
];

// Column positions inside a store row (0-based).
const COL = { name: 0, zone: 2, suspend: 12, status: 14 };

const SPINNERS = ['.ngx-spinner-overlay', 'app-page-loader'];

// Set by ST-14 while Food House is suspended by this run; read by the
// afterAll safety net so the shared store is never left suspended.
let foodHouseSuspendedByThisRun = false;

test.describe('06-Stores - Manage Stores Full Script', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    await goToStoresPage(page);
  });

  test.afterAll(async ({ browser }) => {
    if (!foodHouseSuspendedByThisRun) return;
    test.setTimeout(480000);
    const page = await browser.newPage();
    try {
      await goToStoresPage(page);
      const row = await findStoreRow(page, TARGET_STORE_NAME);
      if (await row.locator('button.btn-unsuspend').isVisible().catch(() => false)) {
        await unsuspendStore(page, row, 'Safety-net restore after an interrupted automated suspend test.');
      }
      foodHouseSuspendedByThisRun = false;
    } finally {
      await page.close().catch(() => {});
    }
  });

  test('ST-01: Stores page loads with table, columns, counters and controls', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Manage Stores' }).first()).toBeVisible();
    await expect(getSearchInput(page)).toBeVisible();
    for (const name of [/Select a store/, /Select Status/, /Select a zone/]) {
      await expect(page.getByRole('combobox', { name })).toBeVisible();
    }
    for (const tip of ['Search', 'Clear', 'Download']) {
      await expect(toolbarButton(page, tip)).toBeVisible();
    }

    const headers = (await page.locator('thead th').allInnerTexts()).map((h) => h.trim()).filter(Boolean);
    expect(headers, 'Stores table should show all store columns in order.').toEqual(EXPECTED_HEADERS);

    expect(await waitForRows(page), 'Stores table should list stores.').toBeGreaterThan(0);
    expect(await getTotalResults(page), 'Total results label should report the store count.').toBeGreaterThan(0);

    // Status counter cards (Live / Busy / Suspended) show numeric values.
    for (const label of ['Live', 'Busy', 'Suspended']) {
      const card = page.getByRole('heading', { name: label, exact: true }).first();
      await expect(card, `${label} counter card should be visible.`).toBeVisible();
    }
    const counters = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .map((h) => h.textContent?.trim() || '')
      .filter((text) => /^\d+$/.test(text)));
    expect(counters.length, 'Live, Busy and Suspended counters should show numbers.').toBeGreaterThanOrEqual(3);
  });

  test('ST-02: Search text filters stores by Food House', async ({ page }) => {
    await searchStore(page, TARGET_STORE_NAME);

    const names = await getColumnTexts(page, COL.name);
    expect(names.length, 'Search should return at least one store.').toBeGreaterThan(0);
    for (const name of names) {
      expect(name.toLowerCase(), 'Every result should match the search text.').toContain(TARGET_STORE_NAME.toLowerCase());
    }
    await expect(getStoreRow(page, TARGET_STORE_NAME)).toHaveCount(1);
    expect(await getTotalResults(page)).toBe(names.length);
  });

  test('ST-03: Store dropdown selects Food House and filters to that store only', async ({ page }) => {
    const storeSelect = page.getByRole('combobox', { name: /Select a store/ });
    await pickFromSearchableSelect(page, storeSelect, TARGET_STORE_NAME);
    await expect(storeSelect).toContainText(TARGET_STORE_NAME);

    await clickToolbar(page, 'Search');
    await expect.poll(async () => getColumnTexts(page, COL.name), {
      message: 'Store filter should return only Food House.',
      timeout: 45000,
    }).toEqual([TARGET_STORE_NAME]);
    expect(await getTotalResults(page)).toBe(1);
  });

  test('ST-04: Status dropdown filters Live, Busy, Suspended and Unsuspended stores', async ({ page }) => {
    const allTotal = await getTotalResults(page);
    expect(allTotal).toBeGreaterThan(0);
    /** @type {Record<string, number>} */
    const totals = {};

    for (const status of ['Live', 'Busy', 'Suspended', 'Unsuspended']) {
      await selectOption(page, page.getByRole('combobox', { name: /Select Status/ }), status);
      // Wait for the filtered list request itself so the rows read below
      // belong to this filter, not to the previous one.
      const listResponse = page.waitForResponse((r) => r.url().includes('/api/store/list')
        && r.request().method() === 'POST'
        && (r.request().postData() || '').includes('"Page":1'), { timeout: 60000 });
      await clickToolbar(page, 'Search');
      const response = await listResponse;
      const apiTotal = Number((await response.json()).TotalItemCount);
      expect(Number.isInteger(apiTotal), `"${status}" list API should return a TotalItemCount.`).toBe(true);

      if (status === 'Busy') {
        expect(JSON.parse(response.request().postData() || '{}').Status, 'Busy filter should request Status BUSY.').toBe('BUSY');
        await expect.poll(async () => getTotalOrZero(page), {
          message: 'Busy results label should match the API total.',
          timeout: 30000,
        }).toBe(apiTotal);
        if (apiTotal === 0) {
          // An empty Busy list is only valid when no store is busy at all.
          await expect(page.locator('tbody tr'), 'Empty Busy result renders no rows.').toHaveCount(0);
          expect((await getCounterValues(page)).Busy, 'Busy counter should also read 0 when the Busy filter is empty.').toBe(0);
        } else {
          await expect.poll(async () => {
            const state = await getRowStates(page);
            return state.rows > 0 && state.suspended === 0 && state.statuses.every((s) => /Busy/i.test(s));
          }, { message: 'Every Busy-filter row should show a Busy status and not be suspended.', timeout: 60000 }).toBe(true);
        }
        totals[status] = apiTotal;
        expect(await page.locator('tbody tr').count()).toBe(Math.min(totals[status], 50));
        continue;
      }

      await expect.poll(async () => {
        const state = await getRowStates(page);
        if (status === 'Suspended') return state.rows > 0 && state.suspended === state.rows;
        if (status === 'Live') return state.rows > 0 && state.suspended === 0 && state.statuses.every((s) => s === 'Online');
        return state.rows > 0 && state.suspended === 0; // Unsuspended
      }, { message: `Rows should match the "${status}" status filter.`, timeout: 60000 }).toBe(true);

      totals[status] = await getTotalResults(page);
      expect(totals[status], `"${status}" results label should match the API total.`).toBe(apiTotal);
      expect(await page.locator('tbody tr').count()).toBe(Math.min(totals[status], 50));
    }

    expect(totals.Suspended + totals.Unsuspended, 'Suspended + Unsuspended should equal all stores.').toBe(allTotal);
    expect(totals.Live, 'Live stores are a subset of unsuspended stores.').toBeLessThanOrEqual(totals.Unsuspended);
  });

  test('ST-05: Zone dropdown filters stores to the Colombo test zone', async ({ page }) => {
    const allTotal = await getTotalResults(page);
    await selectOption(page, page.getByRole('combobox', { name: /Select a zone/ }), TEST_ZONE);
    await clickToolbar(page, 'Search');

    await expect.poll(async () => {
      const zones = await getColumnTexts(page, COL.zone);
      return zones.length > 0 && zones.every((zone) => zone.includes(TEST_ZONE));
    }, { message: 'Every listed store should belong to the Colombo zone.', timeout: 45000 }).toBe(true);

    const total = await getTotalResults(page);
    expect(total).toBeLessThan(allTotal);
    const names = await getColumnTexts(page, COL.name);
    for (const store of COLOMBO_TEST_STORES) {
      expect(names, `${store} is a Colombo test store and should be listed.`).toContain(store);
    }
  });

  test('ST-06: Combined search, status and zone filters apply together and Clear resets them', async ({ page }) => {
    const allTotal = await getTotalResults(page);

    await getSearchInput(page).fill('Food');
    await selectOption(page, page.getByRole('combobox', { name: /Select Status/ }), 'Unsuspended');
    await selectOption(page, page.getByRole('combobox', { name: /Select a zone/ }), TEST_ZONE);
    await clickToolbar(page, 'Search');

    await expect.poll(async () => {
      const state = await getRowStates(page);
      const names = await getColumnTexts(page, COL.name);
      const zones = await getColumnTexts(page, COL.zone);
      return state.rows > 0 &&
        state.suspended === 0 &&
        names.every((n) => /food/i.test(n)) &&
        zones.every((z) => z.includes(TEST_ZONE));
    }, { message: 'Rows should satisfy search + status + zone together.', timeout: 45000 }).toBe(true);
    expect(await getColumnTexts(page, COL.name)).toContain(TARGET_STORE_NAME);

    await clickToolbar(page, 'Clear');
    await expect(getSearchInput(page)).toHaveValue('');
    await expect(page.getByRole('combobox', { name: /Select Status/ })).toContainText('All');
    await expect(page.getByRole('combobox', { name: /Select a zone/ })).not.toContainText(TEST_ZONE);
    await expect.poll(async () => getTotalResults(page), {
      message: 'Clear should restore the full store list.',
      timeout: 45000,
    }).toBe(allTotal);
  });

  test('ST-07: Download exports the stores list as an Excel file', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
    await clickToolbar(page, 'Download');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^TMDONE_Store_Management_.*\.xlsx$/i);
    expect(await download.failure()).toBeNull();
    const filePath = await download.path();
    expect(fs.statSync(filePath).size, 'Exported file should not be empty.').toBeGreaterThan(0);
  });

  test('ST-08: Pagination next, previous and page-number navigation change the listed stores', async ({ page }) => {
    await expect(activePage(page)).toContainText('1', { timeout: 30000 });
    const page1First = await getFirstStoreName(page);

    await clickPagination(page, page.locator('.ngx-pagination li.pagination-next a'));
    await expect(activePage(page)).toContainText('2', { timeout: 30000 });
    await expect.poll(async () => getFirstStoreName(page), { timeout: 30000 }).not.toBe(page1First);
    const page2First = await getFirstStoreName(page);

    await clickPagination(page, page.locator('.ngx-pagination li.pagination-previous a'));
    await expect(activePage(page)).toContainText('1', { timeout: 30000 });
    await expect.poll(async () => getFirstStoreName(page), { timeout: 30000 }).toBe(page1First);

    await clickPagination(page, page.locator('.ngx-pagination li a').filter({ hasText: /^\s*page\s*3\s*$|^\s*3\s*$/ }).first());
    await expect(activePage(page)).toContainText('3', { timeout: 30000 });
    await expect.poll(async () => getFirstStoreName(page), { timeout: 30000 }).not.toBe(page2First);
  });

  test('ST-09: Create Store form opens and closes safely', async ({ page }) => {
    const createButton = page.locator([
      'button:has-text("Create")',
      'button:has-text("Add")',
      'button:has-text("New")',
      'button[mattooltip*="Add Store" i]',
    ].join(', ')).first();

    if (!(await createButton.isVisible().catch(() => false))) {
      // User decision: this account has no Create Store permission, so the
      // test records that and soft-skips instead of failing.
      test.info().annotations.push({ type: 'info', description: 'Create/Add Store button not visible (no Create Store permission for this account).' });
      return;
    }

    await clickWhenReady(page, createButton);
    const form = page.locator('mat-dialog-container, modal-container, form').first();
    await expect(form, 'Create Store form should open.').toBeVisible({ timeout: 30000 });
    await clickWhenReady(page, page.getByRole('button', { name: /^(Cancel|Close)$/ }).first());
  });

  test('ST-10: View Store opens a read-only details panel for Food House and Cancel closes it', async ({ page }) => {
    const row = await findStoreRow(page, TARGET_STORE_NAME);
    const panel = await openViewStore(page, row);

    await expect(panel.getByRole('tab', { name: 'Information' })).toHaveAttribute('aria-selected', 'true');
    const infoInputs = page.getByRole('tabpanel', { name: 'Information' }).locator('input[formcontrolname]');
    expect(await infoInputs.count()).toBeGreaterThan(0);
    for (const input of await infoInputs.all()) {
      expect(await input.evaluate((el) => /** @type {HTMLInputElement} */ (el).readOnly), 'View Store fields must be read-only.').toBe(true);
    }

    await clickWhenReady(page, panel.getByRole('tab', { name: 'Business' }));
    await expect(page.getByRole('tabpanel', { name: 'Business' }).locator('input[formcontrolname="BusinessName"]')).toHaveValue(TARGET_STORE_NAME);

    await clickWhenReady(page, panel.getByRole('button', { name: 'Cancel' }));
    await expect(panel).toBeHidden({ timeout: 15000 });
  });

  test('ST-11: Edit Status opens the store status dialog and Cancel leaves the store unchanged', async ({ page }) => {
    const row = await findStoreRow(page, TARGET_STORE_NAME);
    const statusBefore = (await row.locator('td').nth(COL.status).innerText()).trim();

    await clickWhenReady(page, row.locator('button[mattooltip="Edit Status"]'));
    const dialog = page.locator('mat-dialog-container').filter({ hasText: /Change to Busy/ });
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await expect(dialog).toContainText(/Your Store is (Open|Busy|Closed)/i);
    for (const duration of ['15 Mins', '30 Mins', '1 Hour', '4 Hours']) {
      await expect(dialog.getByText(duration, { exact: true })).toBeVisible();
    }
    const doneButton = dialog.getByRole('button', { name: 'Done' });
    await expect(doneButton, 'Done stays disabled until a duration and reason are chosen.').toBeDisabled();

    // Choose 15 mins + a reason only to prove the form enables; never press Done.
    // The duration labels have no "for" attribute, so the radio itself is clicked.
    const fifteen = dialog.locator('li').filter({ hasText: /^\s*15 Mins\s*$/ }).locator('input[type="radio"]');
    await clickWhenReady(page, fifteen);
    await expect(fifteen).toBeChecked();
    const reasons = await openSelectOptions(page, dialog.locator('mat-select').first());
    expect(reasons).toEqual(expect.arrayContaining(['Store is too crowded', 'Not enough staff', 'Many orders are pending']));
    await clickWhenReady(page, page.getByRole('option', { name: 'Store is too crowded', exact: true }));
    await closeOpenSelectPanel(page);
    await expect(dialog.locator('mat-select').first()).toContainText('Store is too crowded');
    await expect(doneButton).toBeEnabled();
    await expect(dialog.getByRole('button', { name: 'Close Store' }), 'Close Store option is offered (never clicked).').toBeVisible();

    await clickWhenReady(page, dialog.getByRole('button', { name: 'Cancel' }));
    await expect(dialog).toBeHidden({ timeout: 15000 });

    const rowAfter = await findStoreRow(page, TARGET_STORE_NAME);
    await expect(rowAfter.locator('td').nth(COL.status)).toHaveText(statusBefore);
  });

  test('ST-12: Suspend dialog requires a reason and Cancel leaves Food House unsuspended', async ({ page }) => {
    const row = await findStoreRow(page, TARGET_STORE_NAME);
    await expect(row.locator('button.btn-suspend'), 'Food House should start unsuspended.').toBeVisible();

    await clickWhenReady(page, row.locator('button.btn-suspend'));
    const dialog = suspendDialog(page);
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await expect(dialog).toContainText(TARGET_STORE_NAME);
    const suspendButton = dialog.getByRole('button', { name: 'Suspend' });
    await expect(suspendButton, 'Suspend stays disabled until a reason is chosen.').toBeDisabled();

    const reasons = await openSelectOptions(page, dialog.locator('mat-select').first());
    expect(reasons).toEqual(expect.arrayContaining(['Agreement Finished', 'Maintenance', 'Internet Issue', 'Device Issue', 'Other']));
    await clickWhenReady(page, page.getByRole('option', { name: 'Maintenance', exact: true }));
    await closeOpenSelectPanel(page);
    await expect(dialog.locator('mat-select').first()).toContainText('Maintenance');
    await expect(suspendButton).toBeEnabled();

    await clickWhenReady(page, dialog.getByRole('button', { name: 'Cancel' }));
    await expect(dialog).toBeHidden({ timeout: 15000 });
    const rowAfter = await findStoreRow(page, TARGET_STORE_NAME);
    await expect(rowAfter.locator('button.btn-suspend')).toBeVisible();
  });

  test('ST-13: View Food House store details tabs each show their section content', async ({ page }) => {
    const row = await findStoreRow(page, TARGET_STORE_NAME);
    const panel = await openViewStore(page, row);

    /** @type {Array<[string, RegExp[]]>} */
    const tabs = [
      ['Information', [/Name/, /Email/, /Phone Number/, /Account Manager/]],
      ['Business', [/Sector/, /English Name/, /Legal Name/, /Business Reg No/]],
      ['Location', [/Country/, /Region/, /Area/, /Street/]],
      ['Operational Details', [/Day Type/, /Start time/, /End time/]],
      ['Documents', [/Registration Document/, /Agreement Document/]],
      ['Other', [/Minimum Order Value/, /Delivery Fee/, /Delivery Radius in km/]],
      ['Configurations', [/Allow Order Scheduling/, /Allow Order Tracking/, /Store Layout/]],
    ];

    for (const [tabName, labels] of tabs) {
      const tab = panel.getByRole('tab', { name: tabName, exact: true });
      await clickWhenReady(page, tab);
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      const tabPanel = page.getByRole('tabpanel', { name: tabName, exact: true });
      for (const label of labels) {
        await expect(tabPanel, `${tabName} tab should show ${label}.`).toContainText(label, { timeout: 15000 });
      }
      if (tabName === 'Location') {
        await expect.poll(async () => tabPanel.evaluate((el) => `${el.textContent} ${[...el.querySelectorAll('input')]
          .map((i) => /** @type {HTMLInputElement} */ (i).value).join(' ')}`), {
          message: 'Food House location details should mention the Colombo zone.',
          timeout: 15000,
        }).toContain(TEST_ZONE);
      }
    }

    await clickWhenReady(page, panel.getByRole('button', { name: 'Cancel' }));
    await expect(panel).toBeHidden({ timeout: 15000 });
  });

  test('ST-14: Suspend Food House with a reason, then restore it with Unsuspend', async ({ page }) => {
    test.setTimeout(360000);
    let row = await findStoreRow(page, TARGET_STORE_NAME);
    const suspendButton = row.locator('button.btn-suspend');

    if (!(await suspendButton.isVisible().catch(() => false))) {
      throw new Error(
        `${TARGET_STORE_NAME} was already suspended before this test ran (someone else suspended it); ` +
        'refusing to change a state this run did not create.'
      );
    }
    const originalStatus = (await row.locator('td').nth(COL.status).innerText()).trim();

    // 1) Suspend with a reason.
    await clickWhenReady(page, suspendButton);
    const dialog = suspendDialog(page);
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await openSelectOptions(page, dialog.locator('mat-select').first());
    await clickWhenReady(page, page.getByRole('option', { name: 'Maintenance', exact: true }));
    await closeOpenSelectPanel(page);
    await expect(dialog.locator('mat-select').first()).toContainText('Maintenance');
    const confirm = dialog.getByRole('button', { name: 'Suspend' });
    await expect(confirm).toBeEnabled();
    foodHouseSuspendedByThisRun = true;
    await clickWhenReady(page, confirm);
    await expect(dialog).toBeHidden({ timeout: 30000 });

    try {
      // 2) Verify the suspension really happened (fresh search, not cached UI).
      await expect.poll(async () => {
        row = await findStoreRow(page, TARGET_STORE_NAME);
        return row.locator('button.btn-unsuspend').isVisible();
      }, { message: `${TARGET_STORE_NAME} should show Unsuspend after being suspended.`, timeout: 60000 }).toBe(true);
      await expect(row.locator('td').nth(COL.status)).toHaveText(/Offline/);

      // Unsuspend dialog Cancel path: the store must stay suspended.
      await clickWhenReady(page, row.locator('button.btn-unsuspend'));
      const unsuspend = page.locator('mat-dialog-container').filter({ hasText: /Unsuspend Reason/ });
      await expect(unsuspend).toBeVisible({ timeout: 30000 });
      await expect(unsuspend).toContainText(TARGET_STORE_NAME);
      await expect(unsuspend.getByRole('button', { name: 'Unsuspend', exact: true })).toBeDisabled();
      await clickWhenReady(page, unsuspend.getByRole('button', { name: 'Cancel' }));
      await expect(unsuspend).toBeHidden({ timeout: 15000 });
      row = await findStoreRow(page, TARGET_STORE_NAME);
      await expect(row.locator('button.btn-unsuspend'), 'Cancel on Unsuspend keeps the store suspended.').toBeVisible();
    } finally {
      // 3) Always restore.
      row = await findStoreRow(page, TARGET_STORE_NAME);
      if (await row.locator('button.btn-unsuspend').isVisible().catch(() => false)) {
        await unsuspendStore(page, row, 'Restoring store to its original open state after automated test.');
      }
    }

    // 4) Verify the restore really happened.
    await expect.poll(async () => {
      row = await findStoreRow(page, TARGET_STORE_NAME);
      return row.locator('button.btn-suspend').isVisible();
    }, { message: `${TARGET_STORE_NAME} should show Suspend again after Unsuspend.`, timeout: 60000 }).toBe(true);
    foodHouseSuspendedByThisRun = false;
    await expect.poll(async () => {
      row = await findStoreRow(page, TARGET_STORE_NAME);
      return (await row.locator('td').nth(COL.status).innerText()).trim();
    }, { message: `${TARGET_STORE_NAME} status should return to "${originalStatus}".`, timeout: 60000 }).toBe(originalStatus);
  });

  test('ST-15: A new search after paging shows its results from page 1', {
    annotation: frontendIssue('Stores list: a new search made while on page 2 keeps the page number, so "Total N results found" is shown over an empty table. The search should reset pagination to page 1. First seen 2026-10-09.'),
  }, async ({ page }) => {
    await clickPagination(page, page.locator('.ngx-pagination li.pagination-next a'));
    await expect(activePage(page)).toContainText('2', { timeout: 30000 });

    await getSearchInput(page).fill(TARGET_STORE_NAME);
    await clickToolbar(page, 'Search');
    await expect.poll(async () => getTotalResults(page), {
      message: 'The search itself should find the Food House stores.',
      timeout: 45000,
    }).toBeLessThan(10);
    const total = await getTotalResults(page);
    expect(total, 'The search itself should find Food House stores.').toBeGreaterThan(0);
    // Known product bug (observed 2026-10-09): the search keeps the old page
    // number, so "Total 3 results found" is reported over an EMPTY table.
    await expect(
      page.locator('tbody tr'),
      `Search after paging reported ${total} result(s) but the table stays on page 2 and shows none ` +
      '(pagination is not reset to page 1 on a new search).'
    ).toHaveCount(total, { timeout: 30000 });
  });

  test('ST-16: Live, Busy and Suspended counter cards match the Status filter totals', {
    annotation: backendIssue('Stores counters and the Status filter disagree: the Live counter card showed 371 while POST /api/store/list with Status "OPEN" returned 372 on every reload. The extra store "Isso" (Colombo) is listed as Live with an empty Status, so the counter query and the list query count stores differently. First seen 2026-10-12.'),
  }, async ({ page }) => {
    test.setTimeout(420000);
    // Live/Busy change during the day as stores open and close, so the counter
    // is re-read on a fresh page load right before each comparison (up to 3
    // attempts); a mismatch that persists across reloads is a real defect.
    // Observed 2026-10-12: Live counter 371 vs Live filter 372 on every reload.
    // Scanning all Live filter pages found store "Isso" (Colombo) listed as
    // Live with an EMPTY Status cell - the filter (POST /api/store/list
    // Status "OPEN") includes it but the counter does not.
    for (const status of /** @type {const} */ (['Live', 'Busy', 'Suspended'])) {
      /** @type {string[]} */
      const attempts = [];
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        if (attempt > 1) await goToStoresPage(page);
        const counter = (await getCounterValues(page))[status];
        await selectOption(page, page.getByRole('combobox', { name: /Select Status/ }), status);
        await clickToolbar(page, 'Search');
        const total = await expect.poll(async () => getTotalOrZero(page), { timeout: 60000 })
          .toBe(counter).then(() => counter, async () => getTotalOrZero(page));
        attempts.push(`counter ${counter} / filter ${total}`);
        if (total === counter) break;
      }
      expect(attempts[attempts.length - 1], `"${status}" counter card should equal the "${status}" filter total (${attempts.join('; ')}).`)
        .toMatch(/^counter (\d+) \/ filter \1$/);
      const state = await getRowStates(page);
      const total = await getTotalOrZero(page);
      expect(state.rows).toBe(Math.min(total, 50));
      if (status === 'Suspended') expect(state.suspended).toBe(state.rows);
      else expect(state.suspended, `"${status}" rows must not be suspended.`).toBe(0);
      await goToStoresPage(page);
    }
  });
});

// ============================================================
// Helpers
// ============================================================

/** @param {import('@playwright/test').Page} page */
async function goToStoresPage(page) {
  await loginToApp(page);
  await page.goto(STORES_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForSpinners(page);
  await expect(page.getByRole('heading', { name: 'Manage Stores' }).first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('thead th').first()).toBeVisible({ timeout: 60000 });
  await waitForRows(page);
}

/** @param {import('@playwright/test').Page} page */
async function waitForSpinners(page) {
  for (const selector of SPINNERS) {
    await page.locator(selector).first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  }
}

/**
 * Real click with a retry loop: the page loader overlay cycles in and out
 * and intercepts clicks, so wait for it and retry a few times.
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
function getSearchInput(page) {
  return page.getByRole('textbox', { name: 'Search', exact: true });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'Search' | 'Clear' | 'Download'} tooltip
 */
function toolbarButton(page, tooltip) {
  return page.locator(`button[mattooltip="${tooltip}"]`).first();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'Search' | 'Clear' | 'Download'} tooltip
 */
async function clickToolbar(page, tooltip) {
  await clickWhenReady(page, toolbarButton(page, tooltip));
  await page.waitForTimeout(500);
  await waitForSpinners(page);
}

/** @param {import('@playwright/test').Page} page */
async function waitForRows(page) {
  await expect.poll(async () => page.locator('tbody tr').count(), {
    message: 'Stores table should render rows.',
    timeout: 60000,
  }).toBeGreaterThan(0);
  return page.locator('tbody tr').count();
}

/** @param {import('@playwright/test').Page} page */
async function getTotalResults(page) {
  const label = page.getByText(/Total \d+ results found/).first();
  await expect(label).toBeVisible({ timeout: 30000 });
  const text = await label.innerText();
  return Number((text.match(/Total (\d+) results found/) || [])[1]);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} column
 */
async function getColumnTexts(page, column) {
  return page.locator('tbody tr').evaluateAll((rows, index) => rows
    .map((row) => (row.querySelectorAll('td')[index]?.textContent || '').replace(/\s+/g, ' ').trim()), column);
}

/** @param {import('@playwright/test').Page} page */
async function getRowStates(page) {
  return page.locator('tbody tr').evaluateAll((rows, statusIndex) => ({
    rows: rows.length,
    suspended: rows.filter((row) => row.querySelector('button.btn-unsuspend')).length,
    statuses: rows.map((row) => (row.querySelectorAll('td')[statusIndex]?.textContent || '').trim()),
  }), COL.status);
}

/** @param {import('@playwright/test').Page} page */
async function getFirstStoreName(page) {
  return ((await getColumnTexts(page, COL.name))[0]) || '';
}

/** @param {import('@playwright/test').Page} page */
function activePage(page) {
  return page.locator('.ngx-pagination li.current').first();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} link
 */
async function clickPagination(page, link) {
  await clickWhenReady(page, link);
  await waitForSpinners(page);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function searchStore(page, text) {
  const input = getSearchInput(page);
  await expect(input).toBeVisible({ timeout: 30000 });
  await input.fill(text);
  await expect(input).toHaveValue(text);
  await clickToolbar(page, 'Search');
  await expect.poll(async () => {
    const names = await getColumnTexts(page, COL.name);
    return names.length > 0 && names.every((name) => name.toLowerCase().includes(text.toLowerCase()));
  }, { message: `Search for "${text}" should filter the stores table.`, timeout: 45000 }).toBe(true);
}

/**
 * Row whose Branch English Name cell is exactly the store name (avoids
 * "Food House - Al Khoudh" / "New Food House - Barka").
 * @param {import('@playwright/test').Page} page
 * @param {string} storeName
 */
function getStoreRow(page, storeName) {
  return page.locator('tbody tr').filter({
    has: page.locator('td:first-child', { hasText: new RegExp(`^\\s*${escapeRegExp(storeName)}\\s*$`) }),
  });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} storeName
 */
async function findStoreRow(page, storeName) {
  await searchStore(page, storeName);
  const row = getStoreRow(page, storeName);
  await expect(row, `${storeName} should be listed after searching for it.`).toHaveCount(1, { timeout: 30000 });
  return row;
}

/**
 * Opens a mat-select and picks an exact option.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} select
 * @param {string} optionText
 */
async function selectOption(page, select, optionText) {
  await clickWhenReady(page, select);
  const option = page.getByRole('option', { name: optionText, exact: true });
  await clickWhenReady(page, option);
  await closeOpenSelectPanel(page);
  await expect(select).toContainText(optionText);
}

/**
 * Searchable (ngx-mat-select-search) dropdown with a large option list
 * loaded from the API: wait for the options, type real keystrokes, pick the
 * exact option.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} select
 * @param {string} optionText
 */
async function pickFromSearchableSelect(page, select, optionText) {
  await clickWhenReady(page, select);
  await expect.poll(async () => page.locator('mat-option').count(), {
    message: 'Store options should load from the API.',
    timeout: 45000,
  }).toBeGreaterThan(5);
  const searchBox = page.locator('.cdk-overlay-pane input.mat-select-search-input:not(.mat-select-search-hidden)').first();
  await searchBox.click({ force: true }); // focus input inside an aria-disabled wrapper
  await searchBox.pressSequentially(optionText, { delay: 80 });
  const option = page.locator('mat-option').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(optionText)}\\s*$`) }).first();
  await expect(option, `"${optionText}" should be offered after typing it.`).toBeVisible({ timeout: 30000 });
  await clickWhenReady(page, option);
  await closeOpenSelectPanel(page);
}

/**
 * Opens a (dialog) mat-select and waits for its options, which render a
 * moment after the dialog animation. Retries the opening click.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} select
 * @returns {Promise<string[]>} option texts
 */
async function openSelectOptions(page, select) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await clickWhenReady(page, select);
    const opened = await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false);
    if (opened) break;
  }
  await expect(page.getByRole('option').first(), 'Dropdown options should be listed.').toBeVisible({ timeout: 5000 });
  return (await page.getByRole('option').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
}

/**
 * Multi/searchable select panels stay open after picking; their transparent
 * backdrop blocks later clicks. Click it to close (never Escape inside a
 * dialog - that closes the whole dialog).
 * @param {import('@playwright/test').Page} page
 */
async function closeOpenSelectPanel(page) {
  const backdrop = page.locator('.cdk-overlay-transparent-backdrop');
  if (await backdrop.count()) {
    await backdrop.first().click({ timeout: 5000 }).catch(() => {});
  }
  await expect(page.locator('.mat-select-panel')).toHaveCount(0, { timeout: 10000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} row
 */
async function openViewStore(page, row) {
  await clickWhenReady(page, row.locator('button[mattooltip="View Store"]'));
  const panel = page.locator('modal-container').filter({ has: page.getByRole('heading', { name: 'View Store' }) });
  await expect(panel, 'View Store panel should open.').toBeVisible({ timeout: 30000 });
  await expect(panel.getByRole('tablist')).toBeVisible({ timeout: 30000 });
  return panel;
}

/** @param {import('@playwright/test').Page} page */
function suspendDialog(page) {
  return page.locator('mat-dialog-container').filter({ hasText: /Suspend Reason/ });
}

/**
 * Unsuspend dialog: Reason select (Agreement Renewed / Other); "Other"
 * reveals a required Reason Description textarea.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} row
 * @param {string} description
 */
async function unsuspendStore(page, row, description) {
  await clickWhenReady(page, row.locator('button.btn-unsuspend'));
  const dialog = page.locator('mat-dialog-container').filter({ hasText: /Unsuspend Reason/ });
  await expect(dialog, 'Unsuspend dialog should open.').toBeVisible({ timeout: 30000 });
  const confirm = dialog.getByRole('button', { name: 'Unsuspend', exact: true });
  await expect(confirm, 'Unsuspend stays disabled until a reason is chosen.').toBeDisabled();

  const reasons = await openSelectOptions(page, dialog.locator('mat-select').first());
  expect(reasons).toEqual(expect.arrayContaining(['Agreement Renewed', 'Other']));
  await clickWhenReady(page, page.getByRole('option', { name: 'Other', exact: true }));
  await closeOpenSelectPanel(page);
  const descriptionBox = dialog.locator('textarea[formcontrolname="ReasonDescription"]');
  await expect(descriptionBox, '"Other" reveals the Reason Description field.').toBeVisible({ timeout: 15000 });
  await expect(confirm, 'Unsuspend stays disabled until the description is filled.').toBeDisabled();
  await descriptionBox.fill(description);
  await expect(descriptionBox).toHaveValue(description);

  await expect(confirm, 'Unsuspend becomes enabled once reason + description are filled.').toBeEnabled({ timeout: 15000 });
  await clickWhenReady(page, confirm);
  await expect(dialog).toBeHidden({ timeout: 30000 });
  await waitForSpinners(page);
}

/**
 * Live / Busy / Suspended counter cards: each label heading is followed by
 * its numeric value heading.
 * @param {import('@playwright/test').Page} page
 */
async function getCounterValues(page) {
  await expect(page.getByRole('heading', { name: 'Suspended', exact: true }).first()).toBeVisible({ timeout: 30000 });
  /** @type {Record<string, number>} */
  const values = await page.evaluate(() => {
    const texts = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => (h.textContent || '').trim());
    /** @type {Record<string, number>} */
    const out = {};
    for (const label of ['Live', 'Busy', 'Suspended']) {
      const i = texts.indexOf(label);
      const num = texts.slice(i + 1).find((t) => /^\d+$/.test(t));
      out[label] = i >= 0 && num !== undefined ? Number(num) : NaN;
    }
    return out;
  });
  for (const label of ['Live', 'Busy', 'Suspended']) {
    expect(Number.isFinite(values[label]), `${label} counter should show a number.`).toBe(true);
  }
  return values;
}

/**
 * Total from the results label, or 0 when the table is empty and no label
 * is rendered.
 * @param {import('@playwright/test').Page} page
 */
async function getTotalOrZero(page) {
  const label = page.getByText(/Total \d+ results found/).first();
  if (await label.count()) return Number(((await label.innerText()).match(/Total (\d+) results found/) || [])[1]);
  return (await page.locator('tbody tr').count()) === 0 ? 0 : -1;
}

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
