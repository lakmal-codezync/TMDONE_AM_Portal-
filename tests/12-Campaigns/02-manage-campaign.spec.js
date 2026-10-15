// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 02 - Manage Campaign (row menu, campaign view, Manage Stores, Set Stores,
//      Order Summary analytics/exports, Order List, Global Filter navigation)
// URLs: #/home/campaigns, #/home/campaigns/campaign-view?campaignId=...,
//       #/home/campaigns/store-view?campaignId=..., #/home/campaigns/campaignGlobalFilter
// ------------------------------------------------------------
// A-Z lifecycle on a campaign this file creates itself (unique run-stamped
// name, Colombo zone, test stores Food House + Cafe Asiana - Market Place):
// create (beforeAll) -> view -> update (store active flag, campaign stores) ->
// delete (last step). Its only child record, a run-stamped promo code used for
// the Global Filter checks, is deleted by its own step. afterAll removes the
// promo code and the campaign if any step failed. Nothing outside the test
// campaign is changed.
// ============================================================

import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import * as H from './helpers/campaignHelpers.js';
import * as P from './helpers/promoHelpers.js';
import { frontendIssue } from '../helpers/knownIssues.js';

const RUN_STAMP = Date.now().toString().slice(-7);
const CAMPAIGN_NAME = `Auto Campaign MC ${RUN_STAMP}`;
const DEFECT_CAMPAIGN_NAME = `Auto Campaign MCD ${RUN_STAMP}`;
// Promo codes are limited to 10 characters: 4-letter prefix + 6 base-36 chars.
const PROMO_CODE = `QMGC${Date.now().toString(36).slice(-6).toUpperCase()}`;
const START_DATE = new Date();
const END_DATE = H.addMonths(START_DATE, 1);
const [FOOD_HOUSE, CAFE_ASIANA] = H.TEST_STORES;
const STATS_APIS = ['getCampaignStatsCounters', 'getCampaignDailyGrossTotalChart', 'getCampaignDailyCustomerCountChart', 'getCampaignDailyOrderCountChart'];
const GF_API = /api\/campaign\/global-filter/;

/** Promo codes this run may have created (for the afterAll safety net). @type {string[]} */
const createdPromos = [];

/**
 * Opens the campaign view of `name` and returns what the page loaded: the campaign
 * id (from the URL), the section counters, the order-summary counters request and
 * response, and the campaign stores (name -> store id).
 * @param {import('@playwright/test').Page} page
 * @param {string} [name]
 */
async function openView(page, name = CAMPAIGN_NAME) {
  const counts = H.waitForApi(page, /api\/campaign\/getCampaignSummaryCount/);
  const stats = H.waitForApi(page, /api\/campaign\/getCampaignStatsCounters/);
  const stores = H.waitForApi(page, /api\/campaign\/campaignStoreSummary/);
  await H.openCampaignView(page, name);
  const id = (page.url().match(/campaignId=([0-9a-f]{24})/) || [])[1];
  expect(id, 'the campaign view URL carries the campaign id').toBeTruthy();
  const statsResponse = await stats;
  const storeJson = await (await stores).json();
  /** @type {Record<string, string>} */
  const storeIds = {};
  for (const s of storeJson.Items) storeIds[s.StoreName] = s.StoreId;
  return {
    id,
    counts: await (await counts).json(),
    statsBody: JSON.parse(statsResponse.request().postData() || '{}'),
    stats: await statsResponse.json(),
    stores: storeJson,
    storeIds,
  };
}

/**
 * The order-summary counter card showing `label`.
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
function metricValue(page, label) {
  return page.locator('.count-card').filter({ has: page.getByText(label, { exact: true }) }).locator('p.purple-txt');
}

/**
 * Asserts the order-summary title and counters for a Type filter value: "All"
 * shows six counters (incl. free / fixed delivery applied), "Promo" and "Offer"
 * show the four order counters - each with the value of the
 * getCampaignStatsCounters response.
 * @param {import('@playwright/test').Page} page
 * @param {any} stats
 * @param {'ALL' | 'PROMO' | 'OFFER'} [type]
 */
async function expectMetrics(page, stats, type = 'ALL') {
  const title = { ALL: 'Campaign Order Summary', PROMO: 'Promo - Order Summary', OFFER: 'Offer - Order Summary' }[type];
  await expect(page.locator('h4').filter({ hasText: H.exactText(title) }), `summary title for ${type}`).toBeVisible({ timeout: 15000 });
  /** @type {[string, number, number][]} */
  const metrics = [
    ['Total Orders Count', stats.TotalOrderCount, 0],
    ['Total Discount', stats.TotalDiscount, 3],
    ["How much you've got (GMV)", stats.TotalGrossTotal, 3],
    ['Customers Count', stats.TotalCustomerCount, 0],
  ];
  const deliveryMetrics = ['Total Free Delivery Applied', 'Total Fixed Delivery Applied'];
  if (type === 'ALL') {
    metrics.push([deliveryMetrics[0], stats.TotalFreeDeliveryApplied, 3], [deliveryMetrics[1], stats.TotalFixedDeliveryApplied, 3]);
  } else {
    for (const label of deliveryMetrics) await expect(page.getByText(label, { exact: true }), `${label} is not shown for ${type}`).toHaveCount(0);
  }
  for (const [label, value, decimals] of metrics) {
    await expect(metricValue(page, label), `${label} = ${value}`).toHaveText(H.exactText(value.toFixed(decimals)));
  }
}

/**
 * Starts waiting for the four order-summary APIs whose request body matches.
 * @param {import('@playwright/test').Page} page
 * @param {(body: string) => boolean} match
 */
function waitForStats(page, match) {
  return Promise.all(STATS_APIS.map((api) => H.waitForApi(page, new RegExp(`api/campaign/${api}`), { body: match })));
}

/**
 * Opens the Manage Stores dialog of the campaign view.
 * @param {import('@playwright/test').Page} page
 */
async function openManageStores(page) {
  const dialog = H.campaignDialog(page).filter({ hasText: 'Manage Stores' });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await H.realClick(page, page.getByRole('button', { name: /Manage Stores/ }));
    if (await dialog.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) break;
  }
  await expect(dialog, 'Manage Stores dialog should open').toBeVisible();
  await H.waitForSpinner(page);
  return dialog;
}

/**
 * Row of a store in the Manage Stores dialog.
 * @param {import('@playwright/test').Locator} dialog
 * @param {string} store
 */
function storeRow(dialog, store) {
  return dialog.locator('tbody tr').filter({ has: dialog.page().locator('td:nth-child(1)', { hasText: H.exactText(store) }) });
}

/**
 * Opens the Set Stores page of the campaign from its row menu.
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
async function openSetStores(page, id) {
  const panel = await H.openCampaignMenu(page, CAMPAIGN_NAME);
  await H.clickMenuItem(page, panel, 'Set Stores');
  await page.waitForURL(new RegExp(`#/home/campaigns/store-view\\?campaignId=${id}`), { timeout: 30000 });
  await H.waitForSpinner(page);
  await expect(page.locator('h4, h3').filter({ hasText: 'Set Stores - Campaigns' }).first()).toBeVisible({ timeout: 30000 });
  const lists = page.locator('dual-list .listbox');
  await expect(lists.nth(1).locator('li').first()).toBeVisible({ timeout: 30000 });
  return lists;
}

/**
 * Saves the Set Stores page and verifies the setCampaignStore call.
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @param {string[]} expected  store names that must be sent
 */
async function saveSetStores(page, id, expected) {
  const save = H.waitForApi(page, /api\/campaign\/setCampaignStore/);
  await H.realClick(page, page.getByRole('button', { name: /^\s*Set Stores\s*$/ }));
  const response = await save;
  const text = await response.text();
  expect(response.status(), `setCampaignStore failed: ${text}`).toBe(200);
  expect(text).toContain('SUCCESS');
  const body = JSON.parse(response.request().postData() || '{}');
  expect(body.CampaignId).toBe(id);
  expect(body.SelectedTargetInfos.map((/** @type {{Name: string}} */ s) => s.Name).sort()).toEqual([...expected].sort());
  await expect(H.campaignsHeading(page), 'saving returns to the Campaigns list').toBeVisible({ timeout: 30000 });
}

/**
 * Opens the Global Filter page, switches to promo codes and searches `code`.
 * @param {import('@playwright/test').Page} page
 * @param {string} code
 */
async function globalFilterPromo(page, code) {
  const loaded = H.waitForApi(page, GF_API);
  await H.realClick(page, page.getByRole('button', { name: /Global Filter/ }));
  await page.waitForURL(/#\/home\/campaigns\/campaignGlobalFilter/, { timeout: 30000 });
  await loaded;
  await H.waitForSpinner(page);
  await H.chooseMatOption(page, page.locator('mat-select[formcontrolname="Type"]'), 'Promo');
  await page.locator('mat-form-field').filter({ hasText: 'Search by Code' }).locator('input').fill(code);
  const search = H.waitForApi(page, GF_API, { body: (b) => b.includes('"Type":"PROMO"') && b.includes(`"SearchText":"${code}"`) });
  await H.realClick(page, page.locator('button').filter({ has: page.locator('mat-icon', { hasText: /^\s*search\s*$/ }) }).first());
  const json = await (await search).json();
  await H.waitForSpinner(page);
  return json;
}

test.describe.serial('02 - Manage Campaign', () => {
  const state = { id: '', code: '' };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300000);
    await H.createCampaignInFreshPage(browser, CAMPAIGN_NAME);
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(540000);
    await H.deleteSectionRowsIfPresent(browser, CAMPAIGN_NAME, P.PROMO_SECTION, [...createdPromos]);
    await H.deleteCampaignIfPresent(browser, CAMPAIGN_NAME);
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000);
    await H.openCampaignsList(page);
  });

  test('Step 0: The created campaign is listed with its values and its row menu offers View / Set Stores / Edit / Delete', async ({ page }) => {
    const json = await H.searchCampaigns(page, CAMPAIGN_NAME);
    const item = json.Items.find((/** @type {{Name: string}} */ c) => c.Name === CAMPAIGN_NAME);
    expect(item, 'getCampignList returns the test campaign').toBeTruthy();
    state.id = item.Id;
    state.code = item.Code;
    expect(item.Status).toBe('APPROVED');
    expect(item.CampaignTargetType).toBe('STORE');
    expect(item.BearerParty).toBe('TMDONE');
    expect((item.Zones || []).map((/** @type {{Name: string}} */ z) => z.Name)).toEqual([H.TEST_ZONE]);
    const row = H.campaignRow(page, CAMPAIGN_NAME);
    await expect(row).toHaveCount(1);
    await expect(row.locator('td')).toHaveText([item.Code, CAMPAIGN_NAME, H.formatDDMMYYYY(START_DATE), H.formatDDMMYYYY(END_DATE), 'STORE', '50', 'TMDONE', 'APPROVED', /more_horiz/]
      .map((t) => (typeof t === 'string' ? H.exactText(t) : t)));
    const panel = await H.openCampaignMenu(page, CAMPAIGN_NAME);
    expect(await H.menuLabels(panel)).toEqual(['View', 'Set Stores', 'Edit', 'Delete']);
    await H.closeMenu(page);
  });

  test('Step 1: View shows the campaign header, empty section counters and the order summary of the API', async ({ page }) => {
    const view = await openView(page);
    state.id = view.id;
    const code = state.code || (await page.locator('h1').first().innerText()).match(/\(\s*(TMC\d+)\s*\)/)?.[1] || '';
    await expect(H.campaignViewHeader(page, CAMPAIGN_NAME)).toHaveText(new RegExp(
      `${H.escapeRegex(CAMPAIGN_NAME)}\\s*\\(\\s*${code}\\s*\\)\\s*${H.formatDDMMYYYY(START_DATE)}\\s*-\\s*${H.formatDDMMYYYY(END_DATE)}\\s*APPROVED`));
    await expect(page.getByRole('button', { name: /Manage Stores/ })).toBeVisible();
    for (const [section, key] of [['Promo Code', 'PromoCodeCount'], ['Offers', 'OfferCount'], ['Free Delivery', 'FreeDeliveryCount'], ['Fixed Delivery', 'FixedDeliveryCount'], ['Store Pinning', 'StorePinningCount']]) {
      expect(view.counts[key], `${key} of a new campaign`).toBe(0);
      expect(await H.sectionCount(page, section), `${section} card`).toBe(0);
    }
    await expect(page.getByText('Campaign Order Summary', { exact: true })).toBeVisible();
    expect(view.statsBody.CampaignId).toBe(view.id);
    expect(view.statsBody.CampaignType).toBe('ALL');
    expect(view.statsBody.StoreIds).toEqual([]);
    expect(view.stats.TotalOrderCount, 'a new campaign has no orders').toBe(0);
    await expectMetrics(page, view.stats);
    await expect(page.locator('input[formcontrolname="StartDate"]')).toHaveValue(H.formatDDMMYYYY(START_DATE));
    await expect(page.locator('input[formcontrolname="EndDate"]')).toHaveValue(H.formatDDMMYYYY(END_DATE));
    await expect(page.locator('mat-select[formcontrolname="CampaignType"]')).toContainText('All');
    for (const chart of ['Gross Total', 'Customers', 'Order Count']) await expect(page.getByText(chart, { exact: true }).first(), `${chart} chart`).toBeVisible();
    expect(view.stores.Items.map((/** @type {{StoreName: string}} */ s) => s.StoreName).sort()).toEqual([...H.TEST_STORES].sort());

    // The back arrow returns to the Campaigns list.
    await H.realClick(page, page.locator('mat-icon').filter({ hasText: /^\s*arrow_back_ios\s*$/ }).first());
    await expect(H.campaignsHeading(page)).toBeVisible({ timeout: 30000 });
  });

  test('Step 2: Order Summary Type and Stores filters are sent to every summary API', async ({ page }) => {
    const view = await openView(page);
    const type = page.locator('mat-select[formcontrolname="CampaignType"]');
    const stores = page.locator('mat-select[formcontrolname="StoreIds"]');
    await H.realClick(page, type);
    let panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
    await expect(panel.locator('mat-option')).toHaveText(['Free Delivery', 'Fixed Delivery', 'Promo', 'Offer', 'All'].map((t) => H.exactText(t)));
    await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } });
    await expect(panel).toBeHidden();
    await H.realClick(page, stores);
    panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
    await expect(panel.locator('mat-option').filter({ hasText: /\S/ })).toHaveText([...H.TEST_STORES].sort().map((t) => H.exactText(t)));
    await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } });
    await expect(panel).toBeHidden();

    await H.chooseMatOption(page, type, 'Promo');
    await H.chooseMatOption(page, stores, FOOD_HOUSE);
    await expect(stores).toContainText(FOOD_HOUSE);
    let calls = waitForStats(page, (b) => b.includes('"CampaignType":"PROMO"'));
    await H.realClick(page, page.locator('button[mattooltip="Search"]').first());
    let responses = await calls;
    for (const response of responses) {
      const body = JSON.parse(response.request().postData() || '{}');
      expect(body.CampaignId, response.url()).toBe(view.id);
      expect(body.StoreIds, `${response.url()} is filtered by ${FOOD_HOUSE}`).toEqual([view.storeIds[FOOD_HOUSE]]);
    }
    await H.waitForSpinner(page);
    await expectMetrics(page, await responses[0].json(), 'PROMO');

    await H.chooseMatOption(page, type, 'Offer');
    calls = waitForStats(page, (b) => b.includes('"CampaignType":"OFFER"'));
    await H.realClick(page, page.locator('button[mattooltip="Search"]').first());
    responses = await calls;
    for (const response of responses) expect(JSON.parse(response.request().postData() || '{}').CampaignId).toBe(view.id);
    await H.waitForSpinner(page);
    await expectMetrics(page, await responses[0].json(), 'OFFER');
  });

  test('Step 3: Chart downloads export Gross Total, Customers and Order Count as PNG images', async ({ page }) => {
    await openView(page);
    const buttons = page.locator('button[mattooltip="Download"]');
    await expect(buttons).toHaveCount(3);
    for (const [index, fileName] of /** @type {[number, string][]} */ ([[0, 'gross_total.png'], [1, 'customers.png'], [2, 'orderCount.png']])) {
      const download = page.waitForEvent('download', { timeout: 30000 });
      await H.realClick(page, buttons.nth(index));
      const file = await download;
      expect(file.suggestedFilename()).toBe(fileName);
      const bytes = fs.readFileSync(/** @type {string} */ (await file.path()));
      expect(bytes.length, `${fileName} is not empty`).toBeGreaterThan(100);
      expect([...bytes.subarray(0, 4)], `${fileName} is a PNG image`).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });

  test('Step 4: Order List dialog searches the campaign orders and exports them to Excel', async ({ page }) => {
    const view = await openView(page);
    const listed = H.waitForApi(page, /api\/campaign\/getCampaignStatsList/);
    await H.realClick(page, page.locator('button[mattooltip="Order List"]').first());
    const listResponse = await listed;
    const listBody = JSON.parse(listResponse.request().postData() || '{}');
    const json = await listResponse.json();
    expect(listBody.CampaignId).toBe(view.id);
    expect(listBody.CampaignType).toBe('ALL');
    expect(listBody.SearchBy).toBe('ORDERNO');
    const dialog = H.campaignDialog(page).filter({ hasText: 'Order List' });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await H.waitForSpinner(page);
    await expect(dialog.locator('thead th')).toHaveText(['Order No', 'Order Date', 'Store Name', 'Customer Name', 'Customer Phone Number', 'Total Discount', 'Gross Total'].map((t) => H.exactText(t)));
    await expect(dialog.locator('tbody tr')).toHaveCount(json.Items.length);
    await expect(dialog.getByText(`Total ${json.TotalItemCount} results found`)).toBeVisible();
    expect(json.TotalItemCount, 'a new campaign has no orders').toBe(0);

    const searchBy = H.fieldSelect(dialog, 'Search By');
    await expect(searchBy).toContainText('Order No');
    const input = dialog.locator('mat-form-field').filter({ hasText: 'Enter Search String' }).locator('input');
    await input.fill('12345');
    let search = H.waitForApi(page, /api\/campaign\/getCampaignStatsList/, { body: (b) => b.includes('"SearchString":"12345"') });
    await H.realClick(page, dialog.locator('button[mattooltip="Search"]'));
    let body = JSON.parse((await search).request().postData() || '{}');
    expect(body.SearchBy).toBe('ORDERNO');
    expect(body.CampaignId).toBe(view.id);

    await H.chooseMatOption(page, searchBy, 'Store Name');
    await input.fill(FOOD_HOUSE);
    search = H.waitForApi(page, /api\/campaign\/getCampaignStatsList/, { body: (b) => b.includes(`"SearchString":"${FOOD_HOUSE}"`) });
    await H.realClick(page, dialog.locator('button[mattooltip="Search"]'));
    const storeSearch = await search;
    body = JSON.parse(storeSearch.request().postData() || '{}');
    expect(body.SearchBy, 'Store Name search is not sent as an order-number search').not.toBe('ORDERNO');
    await H.waitForSpinner(page);
    await expect(dialog.locator('tbody tr')).toHaveCount((await storeSearch.json()).Items.length);

    // Excel export of the (filtered) order list.
    const excel = H.waitForApi(page, /api\/campaign\/getCampaignStatsExcelDownload/);
    const download = page.waitForEvent('download', { timeout: 60000 });
    await H.realClick(page, dialog.locator('button[mattooltip="Download"]'));
    const excelResponse = await excel;
    expect(excelResponse.status()).toBe(200);
    expect(JSON.parse(excelResponse.request().postData() || '{}').CampaignId).toBe(view.id);
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^Campaign_Order_Summary_.*\.xlsx$/);
    const bytes = fs.readFileSync(/** @type {string} */ (await file.path()));
    expect(bytes.subarray(0, 2).toString(), 'the export is an xlsx (zip) file').toBe('PK');

    const cleared = H.waitForApi(page, /api\/campaign\/getCampaignStatsList/, { body: (b) => b.includes('"SearchString":""') });
    await H.realClick(page, dialog.locator('button[mattooltip="Clear"]'));
    await cleared;
    await expect(input).toHaveValue('');
    await H.closeDialogWithX(page, dialog);
  });

  test('Step 5: Manage Stores dialog lists the campaign stores and searches them by name', async ({ page }) => {
    const view = await openView(page);
    const dialog = await openManageStores(page);
    await expect(dialog.locator('thead th')).toHaveText(['Store Name', 'Added Date', 'Is Active'].map((t) => H.exactText(t)));
    await expect(H.fieldSelect(dialog, 'Search By')).toContainText('Name');
    for (const store of H.TEST_STORES) {
      const row = storeRow(dialog, store);
      await expect(row, `${store} is a campaign store`).toHaveCount(1);
      await expect(row.locator('td').nth(1)).toHaveText(H.formatDDMMYYYY(new Date()));
      await expect(row.locator('mat-slide-toggle')).toHaveClass(/mat-checked/);
    }
    expect(view.stores.Items.every((/** @type {{IsActive: boolean}} */ s) => s.IsActive)).toBe(true);
    await expect(dialog.getByText(`Total ${H.TEST_STORES.length} results found`)).toBeVisible();

    const input = dialog.locator('mat-form-field').filter({ hasText: 'Enter Search String' }).locator('input');
    await input.fill('Food');
    const search = H.waitForApi(page, /api\/campaign\/campaignStoreSummary/, { body: (b) => b.includes('"SearchString":"Food"') });
    await H.realClick(page, dialog.locator('button[mattooltip="Search"]'));
    const found = await (await search).json();
    expect(found.Items.map((/** @type {{StoreName: string}} */ s) => s.StoreName)).toEqual([FOOD_HOUSE]);
    await expect(dialog.locator('tbody tr')).toHaveCount(1, { timeout: 15000 });
    await expect(storeRow(dialog, FOOD_HOUSE)).toHaveCount(1);

    const clear = H.waitForApi(page, /api\/campaign\/campaignStoreSummary/, { body: (b) => b.includes('"SearchString":""') });
    await H.realClick(page, dialog.locator('button[mattooltip="Clear"]'));
    const all = await (await clear).json();
    expect(all.Items).toHaveLength(H.TEST_STORES.length);
    await expect(dialog.locator('tbody tr')).toHaveCount(H.TEST_STORES.length, { timeout: 15000 });
    await expect(input).toHaveValue('');
    await H.closeDialogWithX(page, dialog);
  });

  test(`Step 6: Manage Stores deactivates "${CAFE_ASIANA}" and activates it again`, async ({ page }) => {
    const view = await openView(page);
    const storeId = view.storeIds[CAFE_ASIANA];
    expect(storeId, `${CAFE_ASIANA} is a campaign store`).toBeTruthy();
    for (const active of [false, true]) {
      const dialog = await openManageStores(page);
      const toggle = storeRow(dialog, CAFE_ASIANA).locator('mat-slide-toggle');
      await expect(toggle).toHaveClass(active ? /^(?!.*mat-checked)/ : /mat-checked/);
      const change = H.waitForApi(page, new RegExp(`api/campaign/changeCampaignStoreActiveStatus\\?campaignId=${view.id}&storeId=${storeId}&status=${active}`));
      const refreshed = H.waitForApi(page, /api\/campaign\/campaignStoreSummary/);
      await H.realClick(page, toggle.locator('label').first());
      const response = await change;
      expect(response.status()).toBe(200);
      expect(await response.text()).toContain('SUCCESS');
      const list = await (await refreshed).json();
      const item = list.Items.find((/** @type {{StoreName: string}} */ s) => s.StoreName === CAFE_ASIANA);
      expect(item.IsActive, `${CAFE_ASIANA} IsActive after the toggle`).toBe(active);
      expect(list.Items.find((/** @type {{StoreName: string}} */ s) => s.StoreName === FOOD_HOUSE).IsActive, `${FOOD_HOUSE} is not touched`).toBe(true);
      await expect(toggle).toHaveClass(active ? /mat-checked/ : /^(?!.*mat-checked)/);
      await H.closeDialogWithX(page, dialog);
      // The change is persisted: re-opening the dialog shows the saved state.
      const again = await openManageStores(page);
      await expect(storeRow(again, CAFE_ASIANA).locator('mat-slide-toggle')).toHaveClass(active ? /mat-checked/ : /^(?!.*mat-checked)/, { timeout: 15000 });
      await H.closeDialogWithX(page, again);
    }
  });

  test('Step 7: Set Stores page shows the campaign stores as selected and Cancel saves nothing', async ({ page }) => {
    const json = await H.searchCampaigns(page, CAMPAIGN_NAME);
    const id = json.Items.find((/** @type {{Name: string}} */ c) => c.Name === CAMPAIGN_NAME).Id;
    const saves = [];
    page.on('request', (r) => { if (/api\/campaign\/setCampaignStore/.test(r.url())) saves.push(r.url()); });
    const lists = await openSetStores(page, id);
    for (const store of H.TEST_STORES) {
      await expect(lists.nth(1).locator('li').filter({ hasText: H.exactText(store) }), `${store} is selected`).toHaveCount(1);
      await expect(lists.nth(0).locator('li').filter({ hasText: H.exactText(store) }), `${store} is not offered again`).toHaveCount(0);
    }
    await expect(lists.nth(0).locator('li').first(), 'other Colombo stores are offered').toBeVisible();
    await H.realClick(page, page.getByRole('button', { name: /^\s*Cancel\s*$/ }));
    await expect(H.campaignsHeading(page)).toBeVisible({ timeout: 30000 });
    expect(saves, 'Cancel must not save the stores').toHaveLength(0);
  });

  test(`Step 8: Set Stores removes "${CAFE_ASIANA}" from the campaign and adds it back`, async ({ page }) => {
    const json = await H.searchCampaigns(page, CAMPAIGN_NAME);
    const id = json.Items.find((/** @type {{Name: string}} */ c) => c.Name === CAMPAIGN_NAME).Id;
    let lists = await openSetStores(page, id);
    await H.removeFromDualList(page, page.locator('body'), [CAFE_ASIANA]);
    await expect(lists.nth(0).locator('li').filter({ hasText: H.exactText(CAFE_ASIANA) })).toHaveCount(1);
    await saveSetStores(page, id, [FOOD_HOUSE]);
    let view = await openView(page);
    expect(view.stores.Items.map((/** @type {{StoreName: string}} */ s) => s.StoreName), 'only Food House is left').toEqual([FOOD_HOUSE]);

    await H.openCampaignsList(page);
    lists = await openSetStores(page, id);
    await expect(lists.nth(1).locator('li').filter({ hasText: H.exactText(CAFE_ASIANA) })).toHaveCount(0);
    await H.addToDualList(page, page.locator('body'), [CAFE_ASIANA]);
    await saveSetStores(page, id, [...H.TEST_STORES]);
    view = await openView(page);
    expect(view.stores.Items.map((/** @type {{StoreName: string}} */ s) => s.StoreName).sort(), 'both test stores are campaign stores again').toEqual([...H.TEST_STORES].sort());
  });

  test('Step 9: Global Filter finds the campaign promo code and navigates to the campaign and to the promo code', async ({ page }) => {
    test.setTimeout(480000);
    await H.gotoCampaignSection(page, CAMPAIGN_NAME, P.PROMO_SECTION.section, P.PROMO_SECTION.heading);
    const id = (page.url().match(/campaignId=([0-9a-f]{24})/) || [])[1];
    await P.createPromo(page, {
      code: PROMO_CODE, discountType: 'Amount', value: '1', description: `Global filter promo by Playwright ${RUN_STAMP}`,
      start: START_DATE, end: H.addDays(START_DATE, 5), created: createdPromos,
    });

    await H.openCampaignsList(page);
    let json = await globalFilterPromo(page, PROMO_CODE);
    expect(json.Items, 'exactly the test promo code is found').toHaveLength(1);
    expect(json.Items[0].Code).toBe(PROMO_CODE);
    expect(json.Items[0].CampaignInfo.CampaignName).toBe(CAMPAIGN_NAME);
    expect(json.Items[0].CampaignInfo.CampaignId).toBe(id);
    const row = page.locator('tbody tr').filter({ has: page.locator('td:nth-child(1)', { hasText: H.exactText(PROMO_CODE) }) });
    await expect(row).toHaveCount(1, { timeout: 20000 });
    await expect(row).toContainText(json.Items[0].CampaignInfo.Code);
    await expect(row).toContainText(CAMPAIGN_NAME);
    await H.realClick(page, row.locator('button[mattooltip="Navigate To Campaign"]'));
    await page.waitForURL(new RegExp(`#/home/campaigns/campaign-view\\?campaignId=${id}`), { timeout: 30000 });
    await expect(H.campaignViewHeader(page, CAMPAIGN_NAME)).toBeVisible({ timeout: 30000 });
    expect(await H.sectionCount(page, 'Promo Code'), 'the campaign now has one promo code').toBe(1);

    await H.openCampaignsList(page);
    json = await globalFilterPromo(page, PROMO_CODE);
    expect(json.Items).toHaveLength(1);
    const promoList = H.waitForApi(page, P.PROMO_LIST_API, { body: (b) => b.includes(`"SearchString":"${PROMO_CODE}"`) });
    await H.realClick(page, row.locator('button[mattooltip="Navigate To Promo Code"]'));
    await page.waitForURL(new RegExp(`#/home/campaigns/promo-code\\?campaignId=${id}&searchString=${PROMO_CODE}`), { timeout: 30000 });
    expect((await (await promoList).json()).Items.map((/** @type {{Code: string}} */ p) => p.Code)).toEqual([PROMO_CODE]);
    await expect(H.sectionHeading(page)).toHaveText(/Promo Code Management/, { timeout: 30000 });
    await expect(H.sectionRow(page, PROMO_CODE)).toHaveCount(1, { timeout: 20000 });

    await P.deletePromo(page, PROMO_CODE, createdPromos);
    await H.openCampaignsList(page);
    json = await globalFilterPromo(page, PROMO_CODE);
    expect(json.Items, 'the deleted promo code is no longer found').toHaveLength(0);
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('Step 10: Delete the campaign', async ({ page }) => {
    await H.deleteCampaign(page, CAMPAIGN_NAME);
  });
});

// Checks of known defects live in their own group with their own campaign, so
// that a failure here never blocks the lifecycle above.
test.describe('02 - Manage Campaign known-defect checks', () => {
  // A known product defect fails deterministically; a retry would only create
  // (and clean up) one more campaign.
  test.describe.configure({ retries: 0 });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300000);
    await H.createCampaignInFreshPage(browser, DEFECT_CAMPAIGN_NAME);
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(300000);
    await H.deleteCampaignIfPresent(browser, DEFECT_CAMPAIGN_NAME);
  });

  test('Step 11: Order Summary Clear also removes the Stores filter from the summary APIs', {
    annotation: frontendIssue('Campaign view > Order Summary: "Clear" empties the Stores select, but getCampaignStatsCounters and the chart APIs are still sent with the previously chosen StoreIds, so the numbers stay filtered. First seen 2026-10-12.'),
  }, async ({ page }) => {
    test.setTimeout(300000);
    await H.openCampaignsList(page);
    const view = await openView(page, DEFECT_CAMPAIGN_NAME);
    const stores = page.locator('mat-select[formcontrolname="StoreIds"]');
    await H.chooseMatOption(page, stores, FOOD_HOUSE);
    const filtered = waitForStats(page, (b) => b.includes(`"StoreIds":["${view.storeIds[FOOD_HOUSE]}"]`));
    await H.realClick(page, page.locator('button[mattooltip="Search"]').first());
    await filtered;
    await H.waitForSpinner(page);

    const cleared = H.waitForApi(page, /api\/campaign\/getCampaignStatsCounters/);
    await H.realClick(page, page.locator('button[mattooltip="Clear"]').first());
    const body = JSON.parse((await cleared).request().postData() || '{}');
    await expect(page.locator('mat-select[formcontrolname="CampaignType"]')).toContainText('All');
    await expect(stores, 'Clear empties the Stores select').toHaveText(/^\s*$/);
    expect(body.CampaignType).toBe('ALL');
    // Known defect (2026-10-12): the select is emptied but the summary APIs are
    // still sent with the previously chosen store, so the numbers stay filtered.
    expect(body.StoreIds, `Order Summary "Clear" empties the Stores select but getCampaignStatsCounters is still sent with StoreIds ${JSON.stringify(body.StoreIds)}`).toEqual([]);
  });
});
