// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 02.3 - Campaign View -> Free Delivery Management
// URL: #/home/campaigns/free-delivery?campaignId=...
// ------------------------------------------------------------
// Works only inside a campaign this file creates itself (unique run-stamped
// name, Colombo zone, test stores). Free deliveries get server-generated codes
// (FD-YYYY-XXXX); the test reads the code of the record it created from the
// list API (matched by the id returned by the create call) and always works on
// that row. afterAll deletes leftovers and then the campaign.
//
// Known product defect handled by H.closeStrayEmptyModal: this page opens an
// EMPTY modal on load (summary APIs are called with id=undefined -> 400).
// ============================================================

import { test, expect } from '@playwright/test';
import * as H from './helpers/campaignHelpers.js';

const RUN_STAMP = Date.now().toString().slice(-7);
const CAMPAIGN_NAME = `Auto Campaign FD ${RUN_STAMP}`;
const START_DATE = new Date();
const END_DATE = H.addDays(new Date(), 5);
const LIST_API = /api\/campaignFreeDelivery\/getAllCampaignFreeDelivery/;
const SECTION = {
  section: 'Free Delivery',
  heading: /Free Delivery Management/,
  listApi: LIST_API,
  deleteApi: /api\/campaignFreeDelivery\/delete\//,
  deletedText: 'Free Delivery has been deleted.',
};
const MOV = '3';
const EDITED_MOV = '4';
const [FOOD_HOUSE, CAFE_ASIANA] = H.TEST_STORES;

/** Codes of free deliveries this run created (filled from the list API). */
/** @type {string[]} */
const createdCodes = [];
const state = { mainCode: '' };

/** @param {import('@playwright/test').Page} page */
async function openFreeDeliveryPage(page) {
  await H.gotoCampaignSection(page, CAMPAIGN_NAME, SECTION.section, SECTION.heading);
  await expect(H.sectionHeading(page)).toHaveText(/Campaigns\s*-\s*Free Delivery Management/);
}

/**
 * Creates a free delivery and returns its server-generated code.
 * @param {import('@playwright/test').Page} page
 * @param {{ type: 'ALL' | 'STORE', stores?: string[] }} spec
 */
async function createFreeDelivery(page, spec) {
  const dialog = await H.openSectionCreateDialog(page, 'Create Free Delivery', /Create Free Delivery/);
  if (spec.type !== 'ALL') await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="FreeDeliveryType"]'), spec.type);
  await expect(dialog.locator('mat-select[formcontrolname="FreeDeliveryType"]')).toContainText(spec.type);
  await dialog.locator('input[formcontrolname="MinOrderValue"]').fill(MOV);
  await H.fillDialogDates(page, dialog, START_DATE, END_DATE);
  if (spec.stores) {
    await expect(dialog).toContainText(/\(1 of 2 Steps\)/);
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Next\s*$/ }));
    await expect(dialog).toContainText(/\(2 of 2 Steps\)/, { timeout: 20000 });
    await H.addToDualList(page, dialog, spec.stores);
  }
  const create = dialog.getByRole('button', { name: /^\s*Create Free Delivery\s*$/ });
  await expect(create).toBeEnabled({ timeout: 10000 });
  const createCall = H.waitForApi(page, /api\/campaignFreeDelivery\/create/);
  const listCall = H.waitForApi(page, LIST_API, { timeout: 90000 });
  await H.realClick(page, create);
  const response = await createCall;
  const text = await response.text();
  expect(response.status(), `campaignFreeDelivery/create failed: ${text}`).toBe(200);
  const id = JSON.parse(text).FreeDeliveryId;
  expect(id, 'create returns the new FreeDeliveryId').toBeTruthy();
  const list = await (await listCall).json();
  const item = list.Items.find((/** @type {{Id: string}} */ i) => i.Id === id);
  expect(item, 'the created free delivery is listed').toBeTruthy();
  createdCodes.push(item.Code);
  const body = JSON.parse(response.request().postData() || '{}');
  expect(body.Type).toBe(spec.type);
  expect(body.MinOrderValue).toBe(Number(MOV));
  expect(body.StartDate).toBe(H.formatApiDate(START_DATE));
  expect(body.EndDate).toBe(H.formatApiDate(END_DATE));
  expect((body.TargetInfo || []).map((/** @type {{Name: string}} */ t) => t.Name)).toEqual(spec.stores || []);
  expect(item.Code).toMatch(/^FD-\d{4}-[A-Z0-9]{4}$/);
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await H.waitForSpinner(page);
  return /** @type {string} */ (item.Code);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} code
 */
async function findFreeDeliveryRow(page, code) {
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
async function deleteFreeDelivery(page, code) {
  const row = await findFreeDeliveryRow(page, code);
  await H.deleteSectionRow(page, row, SECTION.deleteApi, SECTION.deletedText);
  const after = await H.searchSection(page, code, LIST_API);
  expect(after.Items.filter((/** @type {{Code: string}} */ i) => i.Code === code)).toHaveLength(0);
  await expect(H.sectionRow(page, code)).toHaveCount(0);
  createdCodes.splice(createdCodes.indexOf(code), 1);
}

test.describe.serial('02.3 - Campaign View Free Delivery', () => {
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
    await openFreeDeliveryPage(page);
  });

  test('FD-00: Free Delivery Management page shows toolbar, filters and an empty table', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create Free Delivery', exact: true })).toBeVisible();
    await expect(H.sectionSearchInput(page)).toBeVisible();
    await expect(page.locator('mat-form-field').filter({ hasText: 'Search By' }).locator('mat-select')).toContainText('Code');
    await expect(page.locator('button[mattooltip="Search"]')).toBeVisible();
    await expect(page.locator('button[mattooltip="Clear"]')).toBeVisible();
    await expect(page.locator('span[mattooltip="Analytics"]')).toBeVisible();
    await expect(page.locator('thead th')).toHaveText(['Code', 'Start Date', 'End Date', 'Target Type', 'Is Active', 'Actions'].map((t) => H.exactText(t)));
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.getByText('Total 0 results found')).toBeVisible();
    const targetFilter = page.locator('mat-form-field').filter({ hasText: 'Campaign Target Type' }).locator('mat-select');
    await H.realClick(page, targetFilter);
    const panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
    await expect(panel.locator('mat-option')).toHaveText(['All', 'Area', 'Chain', 'Geo Fence', 'Store', 'User', 'Zone'].map((t) => H.exactText(t)));
    await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } });
    await expect(panel).toBeHidden();
  });

  test('FD-01: Create Free Delivery dialog validates input, switches to 2 steps for STORE and closes without saving', async ({ page }) => {
    const createCalls = [];
    page.on('request', (r) => { if (/api\/campaignFreeDelivery\/create/.test(r.url())) createCalls.push(r.url()); });
    const dialog = await H.openSectionCreateDialog(page, 'Create Free Delivery', /Create Free Delivery/);
    await expect(dialog).toContainText(/\(1 of 1 Step\)/);
    await expect(dialog.getByRole('button', { name: /^\s*Create Free Delivery\s*$/ })).toBeDisabled();
    await expect(dialog.locator('input[formcontrolname="MinOrderValue"]')).toHaveValue('0');
    await expect(dialog.locator('mat-select[formcontrolname="OperationalDay"]')).toContainText('All Days');
    await expect(dialog.locator('mat-slide-toggle[formcontrolname="IsSlabsOverriden"]')).toBeVisible();
    await expect(dialog.locator('mat-slide-toggle[formcontrolname="IsSlabsOverriden"]')).not.toHaveClass(/mat-checked/);
    await expect(dialog).toContainText('Assign New Bearer Party Break Down');
    await H.realClick(page, dialog.locator('mat-select[formcontrolname="FreeDeliveryType"]'));
    const panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
    await expect(panel.locator('mat-option')).toHaveText(['ALL', 'AREA', 'GEOFENCE', 'STORE', 'USER', 'ZONE'].map((t) => H.exactText(t)));
    await panel.locator('mat-option').filter({ hasText: H.exactText('STORE') }).click();
    await expect(dialog).toContainText(/\(1 of 2 Steps\)/);
    await expect(dialog.getByRole('button', { name: /^\s*Next\s*$/ })).toBeDisabled();
    await H.closeDialogWithX(page, dialog);
    expect(createCalls, 'Closing the dialog must not create a free delivery').toHaveLength(0);
  });

  test('FD-02: Create an ALL free delivery', async ({ page }) => {
    state.mainCode = await createFreeDelivery(page, { type: 'ALL' });
    const row = await findFreeDeliveryRow(page, state.mainCode);
    await expect(row.locator('td')).toHaveText([state.mainCode, H.formatDDMMYYYY(START_DATE), H.formatDDMMYYYY(END_DATE), 'All', 'True', /more_horiz/].map((t) => (typeof t === 'string' ? H.exactText(t) : t)));
  });

  test('FD-03: Target Type filter, Clear and the card view work on the created free delivery', async ({ page }) => {
    expect(state.mainCode, 'FD-02 must have created the free delivery').toBeTruthy();
    const targetFilter = page.locator('mat-form-field').filter({ hasText: 'Campaign Target Type' }).locator('mat-select');
    let json = await H.applySectionFilter(page, targetFilter, 'Store', LIST_API, '"TargetType":"STORE"');
    expect(json.Items.some((/** @type {{Code: string}} */ i) => i.Code === state.mainCode), 'Store filter must exclude the ALL free delivery').toBe(false);
    await expect(H.sectionRow(page, state.mainCode)).toHaveCount(0);
    json = await H.applySectionFilter(page, targetFilter, 'All', LIST_API, '"TargetType":"ALL"');
    expect(json.Items.map((/** @type {{Code: string}} */ i) => i.Code)).toContain(state.mainCode);
    await expect(H.sectionRow(page, state.mainCode)).toHaveCount(1);
    json = await H.clearSectionFilters(page, LIST_API);
    expect(json.Items.map((/** @type {{Code: string}} */ i) => i.Code)).toContain(state.mainCode);
    await H.checkSectionGridView(page, state.mainCode);
  });

  test('FD-04: Row menu lists actions and Manage Free Delivery shows the record details', async ({ page }) => {
    const row = await findFreeDeliveryRow(page, state.mainCode);
    const panel = await H.openRowMenu(page, row);
    expect(await H.menuLabels(panel)).toEqual(['Analytics', 'Edit', 'Manage Free Delivery', 'Delete']);
    await H.clickMenuItem(page, panel, 'Manage Free Delivery');
    await page.waitForURL(/#\/home\/campaigns\/free-delivery-view\?campaignId=.+&freeDeliveryId=/, { timeout: 30000 });
    await H.waitForSpinner(page);
    await expect(page.getByText(state.mainCode, { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(`${H.formatDDMMYYYY(START_DATE)} - ${H.formatDDMMYYYY(END_DATE)}`, { exact: true })).toBeVisible();
    await expect(page.getByText('TARGET TYPE', { exact: true })).toBeVisible();
    await expect(page.getByText('ALL', { exact: true })).toBeVisible();
    await expect(page.getByText('DAY TYPES', { exact: true })).toBeVisible();
    await expect(page.getByText('All Days', { exact: true })).toBeVisible();
  });

  test('FD-05: Analytics shows the free delivery order summary', async ({ page }) => {
    const row = await findFreeDeliveryRow(page, state.mainCode);
    const panel = await H.openRowMenu(page, row);
    const lookup = H.waitForApi(page, /api\/campaign\/getCampaignTypeLookup/, { body: (b) => b.includes('"Type":"FREE_DELIVERY"') });
    await H.clickMenuItem(page, panel, 'Analytics');
    const items = await (await lookup).json();
    expect(items.map((/** @type {{Name: string}} */ i) => i.Name)).toContain(state.mainCode);
    await expect(page.getByText('Free Delivery - Order Summary', { exact: true })).toBeVisible({ timeout: 30000 });
    for (const metric of ['Total Orders Count', "How much you've got (GMV)", 'Customers Count', 'Total Free Delivery Applied', 'Gross Total']) {
      await expect(page.getByText(metric, { exact: true }).first(), metric).toBeVisible();
    }
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('FD-06: Edit the free delivery (MOV)', async ({ page }) => {
    const row = await findFreeDeliveryRow(page, state.mainCode);
    const panel = await H.openRowMenu(page, row);
    await H.clickMenuItem(page, panel, 'Edit');
    const dialog = H.campaignDialog(page).filter({ hasText: 'Edit Free Delivery' });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog.locator('input[formcontrolname="Code"]')).toHaveValue(state.mainCode);
    await expect(dialog.locator('mat-select[formcontrolname="FreeDeliveryType"]')).toContainText('ALL');
    await expect(dialog.locator('input[formcontrolname="MinOrderValue"]')).toHaveValue(MOV);
    await expect(dialog.locator('input[formcontrolname="StartDate"]')).toHaveValue(H.formatDDMMYYYY(START_DATE));
    await expect(dialog.locator('input[formcontrolname="EndDate"]')).toHaveValue(H.formatDDMMYYYY(END_DATE));
    await dialog.locator('input[formcontrolname="MinOrderValue"]').fill(EDITED_MOV);
    const edit = H.waitForApi(page, /api\/campaignFreeDelivery\/edit/);
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Edit Free Delivery\s*$/ }));
    const response = await edit;
    const text = await response.text();
    expect(response.status(), `campaignFreeDelivery/edit failed: ${text}`).toBe(200);
    expect(text).toContain('SUCCESS');
    const body = JSON.parse(response.request().postData() || '{}');
    expect(body.MinOrderValue).toBe(Number(EDITED_MOV));
    expect(body.Type).toBe('ALL');
    await expect(dialog).toBeHidden({ timeout: 20000 });

    const again = await H.openRowMenu(page, await findFreeDeliveryRow(page, state.mainCode));
    await H.clickMenuItem(page, again, 'Edit');
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog.locator('input[formcontrolname="MinOrderValue"]')).toHaveValue(EDITED_MOV);
    await H.closeDialogWithX(page, dialog);
  });

  test('FD-07: Delete the free delivery (cancel first, then confirm)', async ({ page }) => {
    const row = await findFreeDeliveryRow(page, state.mainCode);
    await H.cancelSectionRowDelete(page, row, SECTION.deleteApi);
    await deleteFreeDelivery(page, state.mainCode);
  });

  test(`FD-08: STORE free delivery for Food House: create, Set Stores adds ${CAFE_ASIANA}, Manage Store deactivates and re-activates it, delete`, async ({ page }) => {
    test.setTimeout(480000);
    const code = await createFreeDelivery(page, { type: 'STORE', stores: [FOOD_HOUSE] });
    let row = await findFreeDeliveryRow(page, code);
    await expect(row.locator('td').nth(3)).toHaveText('Store');
    await expect(row.locator('td').nth(4)).toHaveText('True');
    let panel = await H.openRowMenu(page, row);
    expect(await H.menuLabels(panel), 'a STORE free delivery also offers Set Stores').toEqual(['Analytics', 'Edit', 'Set Stores', 'Manage Free Delivery', 'Delete']);
    await H.clickMenuItem(page, panel, 'Set Stores');
    await page.waitForURL(/#\/home\/campaigns\/free-delivery-type-view/, { timeout: 30000 });
    const body = await H.addStoreOnSetStoresPage(page, { heading: 'Set Stores - Free Delivery', saveApi: /api\/campaignFreeDelivery\/setFreeDeliveryStores/ }, CAFE_ASIANA, [...H.TEST_STORES]);
    expect(body.FreeDeliveryId, 'the stores are saved for this free delivery').toBeTruthy();
    // Saving returns to the Free Delivery list.
    await expect(H.sectionHeading(page)).toHaveText(/Free Delivery Management/, { timeout: 30000 });
    await H.closeStrayEmptyModal(page);
    row = await findFreeDeliveryRow(page, code);
    panel = await H.openRowMenu(page, row);
    await H.clickMenuItem(page, panel, 'Manage Free Delivery');
    await page.waitForURL(/#\/home\/campaigns\/free-delivery-view\?campaignId=.+&freeDeliveryId=/, { timeout: 30000 });
    await H.waitForSpinner(page);
    await expect(page.getByText(code, { exact: true })).toBeVisible({ timeout: 30000 });
    await H.checkAppliedStoresDialog(page, {
      summaryApi: /api\/campaignFreeDelivery\/freeDeliveryAppliedStoreSummary/,
      statusApi: /api\/campaignFreeDelivery\/changeFreeDeliveryAppliedStoreStatus/,
    }, [...H.TEST_STORES], CAFE_ASIANA);
    await openFreeDeliveryPage(page);
    await deleteFreeDelivery(page, code);
  });

  test('FD-09: Free Delivery page opens without failing summary calls or an empty dialog', async ({ page }) => {
    // Re-open the page from the campaign view while recording failed API calls
    // (beforeEach already closed the stray dialog of its own page load).
    /** @type {string[]} */
    const failed = [];
    page.on('response', (r) => { if (H.API_HOST.test(r.url()) && r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(/.*\/api\//, '')}`); });
    await H.openCampaignsList(page);
    await H.openCampaignView(page, CAMPAIGN_NAME);
    await H.openSection(page, SECTION.section, SECTION.heading);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    const emptyDialogs = await page.locator('modal-container').filter({ hasNot: page.locator('.modal-content > *') }).count();
    // Known defect (2026-10-12): the page calls campaign/getCampaignBearerPartySummary?campaignId=undefined
    // and campaignFreeDelivery/freeDeliverySummary?freeDeliveryId=undefined (both 400) and leaves an
    // empty modal over the page that blocks every click until Escape is pressed.
    expect(failed, `Free Delivery page load sends failing API calls: ${failed.join(' | ')}`).toEqual([]);
    expect(emptyDialogs, 'an empty modal dialog is left open over the Free Delivery page').toBe(0);
  });
});
