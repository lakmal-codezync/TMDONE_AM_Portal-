// @ts-check
// ============================================================
// TMDone Admin Console - Accounts Management (portfolio view)
// URL: #/home/accounts-management
// Tests: AM-01 -> AM-10
//
// READ-ONLY by design: this page re-assigns real stores to real account
// managers. The Assign / Delegate / Bulk Assignment dialogs are opened and
// closed with "Close" only - they are never confirmed - and every test checks
// that no mutating management API call was sent. Bulk Upload is never used.
// (CRUD-style coverage of this page lives in tests/11-Accounts Management.)
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from '../helpers/loginHelper.js';
import {
  clickWhenReady,
  columnValues,
  expectTotalResults,
  expectXlsxDownload,
  readCurrentPage,
  setMultiSelectOption,
  waitForApi,
  waitForAppIdle,
} from '../helpers/reportHelper.js';

const MODULE_URL = `${CREDENTIALS.baseUrl}/#/home/accounts-management`;
const LIST_API = 'management/list';
const TEST_STORE = 'Cafe Asiana';
const COLUMNS = [
  'Branch Name', 'Delivery Zone', 'Status', 'Assigned Account Manager', 'Assigned Date',
  'Temporary Account Manager', 'Date Range', 'Actions',
];
const TOOLBAR = ['Download Account Managers List', 'Bulk Upload', 'Download', 'Bulk Assignment', 'Search'];

/**
 * Records every non-GET management call other than the list query, so tests can
 * prove that opening/closing dialogs never assigned or delegated anything.
 * @param {import('@playwright/test').Page} page
 */
function trackMutations(page) {
  /** @type {string[]} */
  const calls = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' || !/\/api\/management\//i.test(path)) return;
    if (/\/management\/(list|getAccountsManagementExcelList|getStoreAccountManagersList)$/i.test(path)) return;
    calls.push(`${request.method()} ${path}`);
  });
  return calls;
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function openAccountsManagement(page) {
  await loginToApp(page);
  /** @type {{ managers: any[] }} */
  const lookups = { managers: [] };
  page.on('response', async (response) => {
    if (/looksup\/getAccountManagers/i.test(response.url()) && response.status() === 200) {
      lookups.managers = await response.json().catch(() => lookups.managers);
    }
  });
  const counts = page.waitForResponse((response) => /\/api\/management\/getCounts/i.test(response.url()), { timeout: 90000 });
  const list = waitForApi(page, LIST_API, (body) => body.Page === 1);
  await page.goto(MODULE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await expect(page.getByRole('heading', { name: 'Accounts Management' }).first()).toBeVisible({ timeout: 60000 });
  const countsResponse = await counts;
  expect(countsResponse.status(), 'getCounts should answer 200.').toBe(200);
  const listResponse = await list;
  expect(listResponse.status(), 'management/list should answer 200.').toBe(200);
  const initial = await listResponse.json();
  await expect(page.locator('tbody tr')).toHaveCount(initial.Items.length, { timeout: 60000 });
  await waitForAppIdle(page);
  return { counts: await countsResponse.json(), initial, lookups };
}

/**
 * Clicks Search and returns the list request/payload.
 * @param {import('@playwright/test').Page} page
 * @param {(body: any) => boolean} predicate
 */
async function searchList(page, predicate) {
  const responsePromise = waitForApi(page, LIST_API, predicate);
  await clickWhenReady(page, page.locator('button[mattooltip="Search"]'), 'the Search button');
  return readList(page, await responsePromise);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Response} response
 */
async function readList(page, response) {
  expect(response.status(), 'management/list should answer 200.').toBe(200);
  const request = JSON.parse(response.request().postData() || '{}');
  const payload = await response.json();
  await waitForAppIdle(page);
  return { request, payload };
}

/**
 * The table must show exactly the API page.
 * @param {import('@playwright/test').Page} page
 * @param {any} payload
 */
async function expectListMatches(page, payload) {
  await expectTotalResults(page.locator('body'), payload.TotalItemCount);
  await expect(page.locator('tbody tr'), 'Rendered rows should equal the API page.').toHaveCount(payload.Items.length, { timeout: 30000 });
  await expect
    .poll(() => columnValues(page.locator('body'), 'Branch Name'), { timeout: 30000, message: 'Branch names should equal the API rows.' })
    .toEqual(payload.Items.map((/** @type {any} */ item) => String(item.Name || '').trim()));
}

/**
 * Opens a row action dialog, checks its fields/buttons and closes it without confirming.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} trigger
 * @param {string} triggerName
 * @param {RegExp[]} fieldLabels
 * @param {string} confirmLabel
 */
async function openAndCloseDialog(page, trigger, triggerName, fieldLabels, confirmLabel) {
  await clickWhenReady(page, trigger, `the ${triggerName} button`);
  const dialog = page.locator('mat-dialog-container');
  await expect(dialog, `${triggerName} dialog should open.`).toBeVisible({ timeout: 20000 });
  for (const label of fieldLabels) {
    await expect(dialog.locator('mat-form-field').filter({ hasText: label }), `${triggerName} dialog should have a "${label.source}" field.`).toHaveCount(1);
  }
  await expect(dialog.getByRole('button', { name: confirmLabel, exact: true }), `${triggerName} dialog should offer "${confirmLabel}".`).toBeVisible();
  // Close - never confirm.
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog, `${triggerName} dialog should close.`).toHaveCount(0, { timeout: 15000 });
}

test.describe('Accounts Management (portfolio view, read-only)', () => {
  test.describe.configure({ timeout: 240000 });

  test('AM-01: Page shows the account counters, toolbar and the API list', async ({ page }) => {
    const { counts, initial } = await openAccountsManagement(page);

    // Three counter cards: per Brand, per Branch, Not Assigned (h3 title, h1 number, h4 unit).
    await expect(page.getByRole('heading', { level: 3 }).filter({ hasText: /Accounts|Not Assigned/ })).toHaveText([/Accounts/, /Accounts/, /Not Assigned/]);
    await expect(page.getByRole('heading', { level: 1 }), 'Counters should equal management/getCounts.').toHaveText([
      String(counts.AccountsPerBrand),
      String(counts.AccountsPerBranch),
      String(counts.UnAssigned),
    ]);
    await expect(page.getByRole('heading', { level: 4 }).filter({ hasText: /\(s\)/ })).toHaveText(['BRAND(s)', 'BRANCH(s)', 'BRANCH(s)']);
    await expect(page.getByText('Number of Accounts per Brand')).toHaveCount(1);
    await expect(page.getByText('Number of Accounts per Branch')).toHaveCount(2);

    for (const tooltip of TOOLBAR) {
      await expect(page.locator(`button[mattooltip="${tooltip}"]`), `Toolbar should have "${tooltip}".`).toHaveCount(1);
    }
    const headers = (await page.locator('thead th').allInnerTexts()).map((text) => text.trim());
    expect(headers, 'Accounts table should show its documented columns.').toEqual(COLUMNS);
    await expectListMatches(page, initial);
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow.getByRole('button', { name: 'Assign', exact: true })).toBeVisible();
    await expect(firstRow.getByRole('button', { name: 'Delegate', exact: true })).toBeVisible();
  });

  test('AM-02: Not Assigned card lists only branches without an account manager', async ({ page }) => {
    await openAccountsManagement(page);
    const responsePromise = waitForApi(page, LIST_API, (body) => body.Page === 1 && body.IsNotAssignedOnly === true);
    await clickWhenReady(page, page.getByRole('heading', { name: /Not Assigned/ }).first(), 'the Not Assigned card');
    const { payload } = await readList(page, await responsePromise);

    expect(payload.TotalItemCount, 'Not Assigned filter should return branches.').toBeGreaterThan(0);
    for (const item of payload.Items) {
      expect(item.AccountManager ?? null, `${item.Name} should have no account manager.`).toBeNull();
    }
    await expectListMatches(page, payload);
    const managers = await columnValues(page.locator('body'), 'Assigned Account Manager');
    expect(managers.every((text) => text === '-' || text === ''), `Assigned Account Manager column should be empty (got ${[...new Set(managers)].join(', ')}).`).toBe(true);
  });

  test('AM-03: Store filter narrows the list to the test store', async ({ page }) => {
    await openAccountsManagement(page);
    await setMultiSelectOption(page, page.locator('mat-select[formcontrolname="storeArr"]'), TEST_STORE, true);
    const { request, payload } = await searchList(page, (body) => body.Page === 1 && (body.StoreIds ?? []).length === 1);

    expect(request.StoreIds, 'Exactly one store id should be sent.').toHaveLength(1);
    expect(payload.TotalItemCount, `"${TEST_STORE}" should be listed.`).toBeGreaterThan(0);
    for (const item of payload.Items) expect(String(item.Name).trim()).toBe(TEST_STORE);
    await expectListMatches(page, payload);
  });

  test('AM-04: Account Manager filter lists only that manager\'s branches', async ({ page }) => {
    const { initial, lookups } = await openAccountsManagement(page);
    await expect.poll(() => lookups.managers.length, { timeout: 60000, message: 'Account manager lookup should load.' }).toBeGreaterThan(0);
    const listed = new Set(initial.Items.map((/** @type {any} */ item) => String(item.AccountManager || '').trim()));
    const manager = lookups.managers.find((/** @type {any} */ m) => listed.has(String(m.Name || m.FullName || '').trim()));
    expect(manager, 'A manager from the lookup should own a branch on page 1.').toBeTruthy();
    const name = String(manager.Name || manager.FullName).trim();

    const select = page.locator('mat-form-field').filter({ hasText: 'Select Account Manager' }).locator('mat-select');
    await clickWhenReady(page, select, 'the Account Manager dropdown');
    const panel = page.locator('.mat-select-panel');
    await expect(panel).toBeVisible({ timeout: 15000 });
    const option = panel.getByRole('option', { name: name, exact: true });
    await expect(option, `Dropdown should list "${name}" once.`).toHaveCount(1, { timeout: 30000 });
    // Single select: picking an option closes the panel and reloads the list.
    const responsePromise = waitForApi(page, LIST_API, (body) => body.Page === 1 && body.AccountManagerId === manager.Id);
    await option.click();
    const { payload } = await readList(page, await responsePromise);
    await expect(select).toContainText(name);

    expect(payload.TotalItemCount, `"${name}" owns at least one branch.`).toBeGreaterThan(0);
    for (const item of payload.Items) expect(String(item.AccountManager || '').trim(), `${item.Name} manager`).toBe(name);
    await expectListMatches(page, payload);
    const managers = await columnValues(page.locator('body'), 'Assigned Account Manager');
    expect(managers.every((text) => text === name), `Every row should be managed by ${name}.`).toBe(true);
  });

  test('AM-05: Next and Previous pagination buttons move between result pages', async ({ page }) => {
    const { initial } = await openAccountsManagement(page);
    const body = page.locator('body');
    expect(await readCurrentPage(body)).toBe(1);
    await expect(page.locator('li.pagination-previous')).toHaveClass(/disabled/);
    expect(initial.PageCount, 'The full account list spans several pages.').toBeGreaterThan(1);

    const page2 = waitForApi(page, LIST_API, (requestBody) => requestBody.Page === 2);
    await clickWhenReady(page, page.locator('li.pagination-next a'), 'the Next page link');
    const second = await readList(page, await page2);
    await expect.poll(() => readCurrentPage(body)).toBe(2);
    await expectListMatches(page, second.payload);
    expect(second.payload.Items[0].Id, 'Page 2 should show other branches.').not.toBe(initial.Items[0].Id);

    const page1 = waitForApi(page, LIST_API, (requestBody) => requestBody.Page === 1);
    await clickWhenReady(page, page.locator('li.pagination-previous a'), 'the Previous page link');
    const first = await readList(page, await page1);
    await expect.poll(() => readCurrentPage(body)).toBe(1);
    await expectListMatches(page, first.payload);
  });

  test('AM-06: Download exports the filtered accounts list as .xlsx', async ({ page }) => {
    await openAccountsManagement(page);
    await setMultiSelectOption(page, page.locator('mat-select[formcontrolname="storeArr"]'), TEST_STORE, true);
    const exportRequest = page.waitForRequest((request) => /\/api\/management\/getAccountsManagementExcelList$/i.test(new URL(request.url()).pathname), {
      timeout: 60000,
    });
    const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
    await clickWhenReady(page, page.locator('button[mattooltip="Download"]'), 'the Download button');
    const sent = JSON.parse((await exportRequest).postData() || '{}');
    expect(sent.StoreIds, 'Export should use the selected store filter.').toHaveLength(1);
    await expectXlsxDownload(await downloadPromise, /^TMDONE_Accounts_Management_.+\.xlsx$/);
  });

  test('AM-07: Download Account Managers List exports an .xlsx', async ({ page }) => {
    await openAccountsManagement(page);
    const exportRequest = page.waitForRequest((request) => /\/api\/management\/getStoreAccountManagersList$/i.test(new URL(request.url()).pathname), {
      timeout: 60000,
    });
    const downloadPromise = page.waitForEvent('download', { timeout: 180000 });
    await clickWhenReady(page, page.locator('button[mattooltip="Download Account Managers List"]'), 'the Download Account Managers List button');
    await exportRequest;
    await expectXlsxDownload(await downloadPromise, /^TMDONE_Accounts_Managers_.+\.xlsx$/);
  });

  test('AM-08: Assign dialog opens with an account manager picker and closes without assigning', async ({ page }) => {
    const mutations = trackMutations(page);
    await openAccountsManagement(page);
    const firstRow = page.locator('tbody tr').first();
    await openAndCloseDialog(page, firstRow.getByRole('button', { name: 'Assign', exact: true }), 'Assign', [/Select Account Manager/], 'Assign');
    expect(mutations, 'Closing the Assign dialog must not send any assignment.').toEqual([]);
  });

  test('AM-09: Delegate dialog opens with temporary manager and end date and closes without delegating', async ({ page }) => {
    const mutations = trackMutations(page);
    await openAccountsManagement(page);
    const firstRow = page.locator('tbody tr').first();
    await openAndCloseDialog(
      page,
      firstRow.getByRole('button', { name: 'Delegate', exact: true }),
      'Delegate',
      [/Select Temporary Account Manager/, /Select End date/],
      'Delegate'
    );
    expect(mutations, 'Closing the Delegate dialog must not send any delegation.').toEqual([]);
  });

  test('AM-10: Bulk Assignment dialog opens with its fields and closes without assigning', async ({ page }) => {
    const mutations = trackMutations(page);
    await openAccountsManagement(page);
    await clickWhenReady(page, page.locator('button[mattooltip="Bulk Assignment"]'), 'the Bulk Assignment button');
    const dialog = page.locator('mat-dialog-container');
    await expect(dialog, 'Bulk Assignment dialog should open.').toBeVisible({ timeout: 20000 });
    await expect(dialog.locator('mat-form-field').filter({ hasText: /^\s*Select Account Manager/ })).toHaveCount(1);
    await expect(dialog.locator('mat-form-field').filter({ hasText: /Select New Account Manager/ })).toHaveCount(1);
    await expect(dialog.getByRole('checkbox', { name: 'Temporary' }), 'Temporary is off by default.').not.toBeChecked();
    await expect(dialog.getByRole('button', { name: 'Assign', exact: true }), 'Assign stays disabled until both managers are picked.').toBeDisabled();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog, 'Bulk Assignment dialog should close.').toHaveCount(0, { timeout: 15000 });
    expect(mutations, 'Closing Bulk Assignment must not send anything.').toEqual([]);
  });
});
