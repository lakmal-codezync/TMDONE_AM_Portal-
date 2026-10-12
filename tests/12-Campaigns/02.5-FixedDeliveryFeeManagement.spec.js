// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 02.5 - Campaign View -> Fixed Delivery Fee Management
// URL: #/home/campaigns/fixDeliveryFee/list?campaignId=...
// ------------------------------------------------------------
// Works only inside a campaign this file creates itself (unique run-stamped
// name, Colombo zone, test stores). Fixed delivery fees get server-generated
// codes (FHD-YYYY-XXXX); the create call returns no id, so the test takes the
// code that is new in its own (otherwise empty) campaign. afterAll deletes
// leftovers and then the campaign.
//
// Environment note: an ALL-target fee for the default operational hours
// (All Days 07:00 AM - 03:00 AM) is rejected with 400 "Fixed delivery is
// existing for the given time range and operational hours" because other
// campaigns already cover that window. The lifecycle therefore uses a STORE
// fee for the test store Food House, and the ALL variant uses a narrow
// Sunday 01:00-02:00 AM window - both are accepted by the server.
// ============================================================

import { test, expect } from '@playwright/test';
import * as H from './helpers/campaignHelpers.js';

const RUN_STAMP = Date.now().toString().slice(-7);
const CAMPAIGN_NAME = `Auto Campaign FDF ${RUN_STAMP}`;
const START_DATE = H.addDays(new Date(), 20);
const END_DATE = H.addDays(new Date(), 27);
const LIST_API = /api\/campaignFixedDeliveryFee\/getAllCampaignFixedDeliveryFee/;
const SECTION = {
  section: 'Fixed Delivery',
  heading: /Fixed Delivery Fee Management/,
  listApi: LIST_API,
  deleteApi: /api\/campaignFixedDeliveryFee\/delete\//,
  deletedText: 'Fixed Delivery Fee has been deleted.',
};
const MOV = '3';
const AMOUNT = '0.5';
const EDITED_AMOUNT = '0.75';
const [FOOD_HOUSE, CAFE_ASIANA] = H.TEST_STORES;

/** @type {string[]} */
const createdCodes = [];
const state = { mainCode: '' };

/** @param {import('@playwright/test').Page} page */
async function openFixedDeliveryPage(page) {
  await H.gotoCampaignSection(page, CAMPAIGN_NAME, SECTION.section, SECTION.heading);
  await expect(H.sectionHeading(page)).toHaveText(/Campaigns\s*-\s*Fixed Delivery Fee Management/);
}

/**
 * Creates a fixed delivery fee and returns its server-generated code.
 * @param {import('@playwright/test').Page} page
 * @param {{ type: 'ALL' | 'STORE', stores?: string[], sundayNight?: boolean }} spec
 */
async function createFixedDeliveryFee(page, spec) {
  const before = await H.searchSection(page, '', LIST_API);
  const known = new Set(before.Items.map((/** @type {{Code: string}} */ i) => i.Code));
  const dialog = await H.openSectionCreateDialog(page, 'Create Fixed Delivery Fee', /Create Fixed Delivery Fee/);
  if (spec.type !== 'ALL') await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="FixedDeliveryFeeType"]'), spec.type);
  await expect(dialog.locator('mat-select[formcontrolname="FixedDeliveryFeeType"]')).toContainText(spec.type);
  await dialog.locator('input[formcontrolname="MinOrderValue"]').fill(MOV);
  await dialog.locator('input[formcontrolname="FixedDeliveryAmount"]').fill(AMOUNT);
  await H.fillDialogDates(page, dialog, START_DATE, END_DATE);
  if (spec.sundayNight) {
    await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="OperationalDay"]'), 'Sunday');
    await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="StartTime"]'), '01:00 AM');
    await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="EndTime"]'), '02:00 AM');
  }
  if (spec.stores) {
    await expect(dialog).toContainText(/\(1 of 2 Steps\)/);
    const storesCall = H.waitForApi(page, /api\/campaignFixedDeliveryFee\/getStoresForFixedDeliveryFee/);
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Next\s*$/ }));
    const stores = await (await storesCall).json();
    expect(stores.All.map((/** @type {{Name: string}} */ s) => s.Name).sort()).toEqual([...H.TEST_STORES].sort());
    await expect(dialog).toContainText(/\(2 of 2 Steps\)/, { timeout: 20000 });
    await H.addToDualList(page, dialog, spec.stores);
  }
  const create = dialog.getByRole('button', { name: /^\s*Create Fixed Delivery Fee\s*$/ });
  await expect(create).toBeEnabled({ timeout: 10000 });
  const createCall = H.waitForApi(page, /api\/campaignFixedDeliveryFee\/create/);
  const listCall = H.waitForApi(page, LIST_API, { timeout: 90000 });
  await H.realClick(page, create);
  const response = await createCall;
  const text = await response.text();
  expect(response.status(), `campaignFixedDeliveryFee/create failed: ${text}`).toBe(200);
  expect(text).toContain('SUCCESS');
  const list = await (await listCall).json();
  const fresh = list.Items.filter((/** @type {{Code: string}} */ i) => !known.has(i.Code));
  expect(fresh, 'exactly one new fixed delivery fee is listed').toHaveLength(1);
  const code = /** @type {string} */ (fresh[0].Code);
  createdCodes.push(code);
  expect(code).toMatch(/^FHD-\d{4}-[A-Z0-9]{4}$/);
  const body = JSON.parse(response.request().postData() || '{}');
  expect(body.Type).toBe(spec.type);
  expect(body.MinOrderValue).toBe(Number(MOV));
  expect(body.FixedDeliveryAmount).toBe(Number(AMOUNT));
  expect(body.StartDate).toBe(H.formatApiDate(START_DATE));
  expect(body.EndDate).toBe(H.formatApiDate(END_DATE));
  expect((body.TargetInfo || []).map((/** @type {{Name: string}} */ t) => t.Name)).toEqual(spec.stores || []);
  expect(body.OperationalDetails).toEqual([
    spec.sundayNight
      ? { StartTime: '01:00 AM', EndTime: '02:00 AM', OperationalDay: 'Sunday' }
      : { StartTime: '07:00 AM', EndTime: '03:00 AM', OperationalDay: 'All Days' },
  ]);
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await H.waitForSpinner(page);
  return code;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} code
 */
async function findFeeRow(page, code) {
  const result = await H.searchSection(page, code, LIST_API);
  expect(result.Items.filter((/** @type {{Code: string}} */ i) => i.Code === code)).toHaveLength(1);
  const row = H.sectionRow(page, code);
  await expect(row).toHaveCount(1, { timeout: 20000 });
  return row;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} code
 */
async function deleteFee(page, code) {
  const row = await findFeeRow(page, code);
  await H.deleteSectionRow(page, row, SECTION.deleteApi, SECTION.deletedText);
  const after = await H.searchSection(page, code, LIST_API);
  expect(after.Items.filter((/** @type {{Code: string}} */ i) => i.Code === code)).toHaveLength(0);
  await expect(H.sectionRow(page, code)).toHaveCount(0);
  createdCodes.splice(createdCodes.indexOf(code), 1);
}

test.describe.serial('02.5 - Campaign View Fixed Delivery Fee Management', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300000);
    await H.createCampaignInFreshPage(browser, CAMPAIGN_NAME);
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(600000);
    await H.deleteSectionRowsIfPresent(browser, CAMPAIGN_NAME, SECTION, [...createdCodes]);
    await H.deleteCampaignIfPresent(browser, CAMPAIGN_NAME);
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000);
    await openFixedDeliveryPage(page);
  });

  test('FDF-00: Fixed Delivery Fee Management page shows toolbar, filters, table and pagination', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create Fixed Delivery Fee', exact: true })).toBeVisible();
    await expect(H.sectionSearchInput(page)).toBeVisible();
    await expect(page.locator('mat-form-field').filter({ hasText: 'Search By' }).locator('mat-select')).toContainText('Code');
    await expect(page.locator('button[mattooltip="Search"]')).toBeVisible();
    await expect(page.locator('button[mattooltip="Clear"]')).toBeVisible();
    await expect(page.locator('span[mattooltip="Analytics"]')).toBeVisible();
    await expect(page.locator('thead th')).toHaveText(['Code', 'Start Date', 'End Date', 'Target Type', 'Is Active', 'Actions'].map((t) => H.exactText(t)));
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.getByText('Total 0 results found')).toBeVisible();
    await expect(page.locator('pagination-controls, .ngx-pagination').first()).toContainText(/Prev[\s\S]*1[\s\S]*Next/);
    const targetFilter = page.locator('mat-form-field').filter({ hasText: 'Fixed Delivery Target Type' }).locator('mat-select');
    await H.realClick(page, targetFilter);
    const panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
    await expect(panel.locator('mat-option')).toHaveText([H.exactText('ALL'), H.exactText('STORE')]);
    await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } });
    await expect(panel).toBeHidden();
  });

  test('FDF-01: Create Fixed Delivery Fee dialog validates input and closes without saving', async ({ page }) => {
    const createCalls = [];
    page.on('request', (r) => { if (/api\/campaignFixedDeliveryFee\/create/.test(r.url())) createCalls.push(r.url()); });
    const dialog = await H.openSectionCreateDialog(page, 'Create Fixed Delivery Fee', /Create Fixed Delivery Fee/);
    await expect(dialog).toContainText(/\(1 of 1 Step\)/);
    const create = dialog.getByRole('button', { name: /^\s*Create Fixed Delivery Fee\s*$/ });
    await expect(create).toBeDisabled();
    await expect(dialog.locator('mat-select[formcontrolname="FixedDeliveryFeeType"]')).toContainText('ALL');
    await expect(dialog.locator('input[formcontrolname="MinOrderValue"]')).toHaveValue('0');
    await expect(dialog.locator('input[formcontrolname="FixedDeliveryAmount"]')).toHaveValue('');
    await expect(dialog.locator('mat-select[formcontrolname="OperationalDay"]')).toContainText('All Days');
    await expect(dialog.locator('mat-select[formcontrolname="StartTime"]')).toContainText('07:00 AM');
    await expect(dialog.locator('mat-select[formcontrolname="EndTime"]')).toContainText('03:00 AM');
    await expect(dialog).toContainText('Assign New Bearer Party Break Down');
    await dialog.locator('input[formcontrolname="FixedDeliveryAmount"]').fill(AMOUNT);
    await expect(create, 'dates are still required').toBeDisabled();
    await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="FixedDeliveryFeeType"]'), 'STORE');
    await expect(dialog).toContainText(/\(1 of 2 Steps\)/);
    await expect(dialog.getByRole('button', { name: /^\s*Next\s*$/ })).toBeDisabled();
    await H.closeDialogWithX(page, dialog);
    expect(createCalls, 'Closing the dialog must not create a fee').toHaveLength(0);
  });

  test('FDF-02: Create a STORE fixed delivery fee for Food House', async ({ page }) => {
    state.mainCode = await createFixedDeliveryFee(page, { type: 'STORE', stores: ['Food House'] });
    const row = await findFeeRow(page, state.mainCode);
    await expect(row.locator('td')).toHaveText([state.mainCode, H.formatDDMMYYYY(START_DATE), H.formatDDMMYYYY(END_DATE), 'Store', 'True', /more_horiz/].map((t) => (typeof t === 'string' ? H.exactText(t) : t)));
  });

  test('FDF-03: Search, Target Type filter, Clear and the card view work on the created fee', async ({ page }) => {
    expect(state.mainCode, 'FDF-02 must have created the fee').toBeTruthy();
    await findFeeRow(page, state.mainCode);
    await H.clearSectionFilters(page, LIST_API);
    const targetFilter = page.locator('mat-form-field').filter({ hasText: 'Fixed Delivery Target Type' }).locator('mat-select');
    let json = await H.applySectionFilter(page, targetFilter, 'ALL', LIST_API, '"TargetType":"ALL"');
    expect(json.Items.some((/** @type {{Code: string}} */ i) => i.Code === state.mainCode), 'ALL filter must exclude the STORE fee').toBe(false);
    await expect(H.sectionRow(page, state.mainCode)).toHaveCount(0);
    json = await H.applySectionFilter(page, targetFilter, 'STORE', LIST_API, '"TargetType":"STORE"');
    expect(json.Items.map((/** @type {{Code: string}} */ i) => i.Code)).toContain(state.mainCode);
    await expect(H.sectionRow(page, state.mainCode)).toHaveCount(1);
    json = await H.clearSectionFilters(page, LIST_API);
    expect(json.Items.map((/** @type {{Code: string}} */ i) => i.Code)).toContain(state.mainCode);
    await H.checkSectionGridView(page, state.mainCode);
  });

  test('FDF-04: Row menu lists actions and Manage Fixed Delivery Fee shows the record details', async ({ page }) => {
    const row = await findFeeRow(page, state.mainCode);
    const panel = await H.openRowMenu(page, row);
    expect(await H.menuLabels(panel)).toEqual(['Analytics', 'Edit', 'Set Stores', 'Manage Fixed Delivery Fee', 'Delete']);
    await H.clickMenuItem(page, panel, 'Manage Fixed Delivery Fee');
    await page.waitForURL(/#\/home\/campaigns\/fixDeliveryFee\/fixDeliveryView/, { timeout: 30000 });
    await H.waitForSpinner(page);
    await expect(page.getByText(state.mainCode, { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(`${H.formatDDMMYYYY(START_DATE)} - ${H.formatDDMMYYYY(END_DATE)}`, { exact: true })).toBeVisible();
    await expect(page.getByText('TARGET TYPE', { exact: true })).toBeVisible();
    await expect(page.getByText('STORE', { exact: true })).toBeVisible();
  });

  test('FDF-05: Set Stores page shows Food House selected and Cancel returns without saving', async ({ page }) => {
    const setCalls = [];
    page.on('request', (r) => { if (/campaignFixedDeliveryFee\/.*[Ss]tore/.test(r.url()) && !/getStores/.test(r.url())) setCalls.push(r.url()); });
    const row = await findFeeRow(page, state.mainCode);
    const panel = await H.openRowMenu(page, row);
    await H.clickMenuItem(page, panel, 'Set Stores');
    await expect(page.locator('h4, h3').filter({ hasText: 'Set Stores - Fixed Delivery Fee' }).first()).toBeVisible({ timeout: 30000 });
    await H.waitForSpinner(page);
    const lists = page.locator('dual-list .listbox');
    await expect(lists.nth(1).locator('li').filter({ hasText: H.exactText('Food House') })).toHaveCount(1, { timeout: 20000 });
    await expect(lists.nth(0).locator('li').filter({ hasText: H.exactText('Cafe Asiana - Market Place') })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^\s*Set Stores\s*$/ })).toBeVisible();
    await H.realClick(page, page.getByRole('button', { name: /^\s*Cancel\s*$/ }));
    await expect(H.sectionHeading(page)).toHaveText(/Fixed Delivery Fee Management/, { timeout: 30000 });
    expect(setCalls, 'Cancel must not save store changes').toHaveLength(0);
  });

  test('FDF-06: Analytics shows the fixed delivery fee order summary', async ({ page }) => {
    const row = await findFeeRow(page, state.mainCode);
    const panel = await H.openRowMenu(page, row);
    const lookup = H.waitForApi(page, /api\/campaign\/getCampaignTypeLookup/, { body: (b) => /"Type":"FIXED/.test(b) });
    await H.clickMenuItem(page, panel, 'Analytics');
    const items = await (await lookup).json();
    expect(items.map((/** @type {{Name: string}} */ i) => i.Name)).toContain(state.mainCode);
    await expect(page.getByText(/Order Summary/).first()).toBeVisible({ timeout: 30000 });
    for (const metric of ['Total Orders Count', 'Customers Count', 'Gross Total']) {
      await expect(page.getByText(metric, { exact: true }).first(), metric).toBeVisible();
    }
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('FDF-07: Edit the fixed delivery fee amount', async ({ page }) => {
    const row = await findFeeRow(page, state.mainCode);
    const panel = await H.openRowMenu(page, row);
    await H.clickMenuItem(page, panel, 'Edit');
    const dialog = H.campaignDialog(page).filter({ hasText: /Edit Fixed Delivery Fee/ });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog.locator('mat-select[formcontrolname="FixedDeliveryFeeType"]')).toContainText('STORE');
    await expect(dialog.locator('input[formcontrolname="FixedDeliveryAmount"]')).toHaveValue(AMOUNT);
    await expect(dialog.locator('input[formcontrolname="MinOrderValue"]')).toHaveValue(MOV);
    await expect(dialog.locator('input[formcontrolname="StartDate"]')).toHaveValue(H.formatDDMMYYYY(START_DATE));
    await expect(dialog.locator('input[formcontrolname="EndDate"]')).toHaveValue(H.formatDDMMYYYY(END_DATE));
    await dialog.locator('input[formcontrolname="FixedDeliveryAmount"]').fill(EDITED_AMOUNT);
    const submit = dialog.locator('button').filter({ hasText: /^\s*(Edit Fixed Delivery Fee|Update|Next)\s*$/ }).last();
    if (/Next/.test(await submit.innerText())) {
      await H.realClick(page, submit);
      const selected = dialog.locator('dual-list .listbox').nth(1);
      await expect(selected.locator('li').filter({ hasText: H.exactText('Food House') })).toHaveCount(1, { timeout: 20000 });
    }
    const edit = H.waitForApi(page, /api\/campaignFixedDeliveryFee\/(edit|update)/i);
    await H.realClick(page, dialog.locator('button').filter({ hasText: /^\s*(Edit Fixed Delivery Fee|Update)\s*$/ }).last());
    const response = await edit;
    const text = await response.text();
    expect(response.status(), `fixed delivery fee edit failed: ${text}`).toBe(200);
    expect(text).toContain('SUCCESS');
    const body = JSON.parse(response.request().postData() || '{}');
    expect(body.FixedDeliveryAmount).toBe(Number(EDITED_AMOUNT));
    expect(body.Type).toBe('STORE');
    await expect(dialog).toBeHidden({ timeout: 20000 });

    const again = await H.openRowMenu(page, await findFeeRow(page, state.mainCode));
    await H.clickMenuItem(page, again, 'Edit');
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog.locator('input[formcontrolname="FixedDeliveryAmount"]')).toHaveValue(EDITED_AMOUNT);
    await H.closeDialogWithX(page, dialog);
  });

  test('FDF-08: Delete the STORE fixed delivery fee (cancel first, then confirm)', async ({ page }) => {
    const row = await findFeeRow(page, state.mainCode);
    await H.cancelSectionRowDelete(page, row, SECTION.deleteApi);
    await deleteFee(page, state.mainCode);
  });

  test('FDF-09: Create, verify and delete an ALL fixed delivery fee for a Sunday 01:00-02:00 AM window', async ({ page }) => {
    const code = await createFixedDeliveryFee(page, { type: 'ALL', sundayNight: true });
    const row = await findFeeRow(page, code);
    await expect(row.locator('td').nth(3)).toHaveText('All');
    await expect(row.locator('td').nth(4)).toHaveText('True');
    const panel = await H.openRowMenu(page, row);
    expect(await H.menuLabels(panel)).toEqual(['Analytics', 'Edit', 'Manage Fixed Delivery Fee', 'Delete']);
    await H.closeMenu(page);
    await deleteFee(page, code);
  });

  test(`FDF-10: STORE fee: Set Stores adds ${CAFE_ASIANA}, Manage Store deactivates and re-activates it, then delete`, async ({ page }) => {
    test.setTimeout(480000);
    const code = await createFixedDeliveryFee(page, { type: 'STORE', stores: [FOOD_HOUSE] });
    let panel = await H.openRowMenu(page, await findFeeRow(page, code));
    await H.clickMenuItem(page, panel, 'Set Stores');
    const body = await H.addStoreOnSetStoresPage(page, { heading: 'Set Stores - Fixed Delivery Fee', saveApi: /api\/campaignFixedDeliveryFee\/setFixedDeliveryFeeStores/ }, CAFE_ASIANA, [...H.TEST_STORES]);
    expect(body.FixedDeliveryFeeId, 'the stores are saved for this fee').toBeTruthy();
    // Saving returns to the Fixed Delivery Fee list.
    await expect(H.sectionHeading(page)).toHaveText(/Fixed Delivery Fee Management/, { timeout: 30000 });
    await H.closeStrayEmptyModal(page);
    panel = await H.openRowMenu(page, await findFeeRow(page, code));
    await H.clickMenuItem(page, panel, 'Manage Fixed Delivery Fee');
    await page.waitForURL(/#\/home\/campaigns\/fixDeliveryFee\/fixDeliveryView/, { timeout: 30000 });
    await H.waitForSpinner(page);
    await expect(page.getByText(code, { exact: true })).toBeVisible({ timeout: 30000 });
    await H.checkAppliedStoresDialog(page, {
      summaryApi: /api\/campaignFixedDeliveryFee\/fixedDeliveryFeeAppliedStoreSummary/,
      statusApi: /api\/campaignFixedDeliveryFee\/changeFixedDeliveryFeeAppliedStoreStatus/,
    }, [...H.TEST_STORES], CAFE_ASIANA);
    await openFixedDeliveryPage(page);
    await deleteFee(page, code);
  });
});
