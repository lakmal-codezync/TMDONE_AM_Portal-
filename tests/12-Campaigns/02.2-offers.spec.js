// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 02.2 - Campaign View -> Offer Management (campaign offers)
// URL: #/home/campaigns/offer/list?campaignId=...
// ------------------------------------------------------------
// NOTE: this is the campaign's own offer section, not the standalone (view-only)
// Offers page of tests/08-Offers.
// Works only inside a campaign this file creates itself (unique run-stamped
// name, Colombo zone, test stores). Every offer targets the test store Food
// House, has a unique run-stamped name and is deleted by its own test; afterAll
// deletes leftovers and then the campaign.
// ============================================================

import { test, expect } from '@playwright/test';
import * as H from './helpers/campaignHelpers.js';
import * as O from './helpers/offerHelpers.js';

const RUN_STAMP = Date.now().toString().slice(-7);
const CAMPAIGN_NAME = `Auto Campaign COF ${RUN_STAMP}`;
const START_DATE = new Date();
const END_DATE = H.addDays(new Date(), 5);
const MAIN_OFFER = `QA Offer Pct ${RUN_STAMP}`;
const EDITED_VALUE = '15';

/** Names of offers this run may have created (for the afterAll safety net). */
const createdOffers = new Set();
const [FOOD_HOUSE, CAFE_ASIANA] = H.TEST_STORES;
const state = { foodHouseId: '' };

/**
 * @param {import('@playwright/test').Page} page
 * @param {O.OfferSpec} spec
 */
async function createOffer(page, spec) {
  createdOffers.add(spec.name);
  return O.createCampaignOffer(page, { start: START_DATE, end: END_DATE, ...spec });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function deleteOffer(page, name) {
  await O.deleteCampaignOffer(page, name);
  createdOffers.delete(name);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 */
async function openOfferAction(page, label) {
  const panel = await H.openRowMenu(page, await O.findOfferRow(page, MAIN_OFFER));
  await H.clickMenuItem(page, panel, label);
}

test.describe.serial('02.2 - Campaign View Offers', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300000);
    await H.createCampaignInFreshPage(browser, CAMPAIGN_NAME);
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(600000);
    await H.deleteSectionRowsIfPresent(browser, CAMPAIGN_NAME, O.OFFER_SECTION, [...createdOffers]);
    await H.deleteCampaignIfPresent(browser, CAMPAIGN_NAME);
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(420000);
    await H.gotoCampaignSection(page, CAMPAIGN_NAME, O.OFFER_SECTION.section, O.OFFER_SECTION.heading);
    await expect(H.sectionHeading(page)).toHaveText(/Campaigns\s*-\s*Offer Management/);
  });

  test('COF-00: Offer Management page shows toolbar, filters, create menu and an empty table', async ({ page }) => {
    await expect(H.sectionSearchInput(page)).toBeVisible();
    await expect(page.locator('button[mattooltip="Search"]')).toBeVisible();
    await expect(page.locator('button[mattooltip="Clear"]')).toBeVisible();
    await expect(page.locator('span[mattooltip="Analytics"]')).toBeVisible();
    await expect(page.locator('thead th')).toHaveText(['Index', 'Name', 'Arabic Name', 'Start Date', 'End Date', 'Offer Type', 'Order Type', 'Target Type', 'Is Active', 'Actions'].map((t) => H.exactText(t)));
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.getByText('Total 0 results found')).toBeVisible();
    for (const [formControl, options] of /** @type {[string, string[]][]} */ ([
      ['OrderType', ['Delivery', 'Pickup', 'Both']],
      ['Type', ['Store', 'Category', 'Item', 'Chain']],
      ['StoreId', [...H.TEST_STORES].sort()],
    ])) {
      await H.realClick(page, page.locator(`mat-select[formcontrolname="${formControl}"]`));
      const panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
      await expect(panel.locator('mat-option').filter({ hasText: /\S/ }), `${formControl} filter options`).toHaveText(options.map((t) => H.exactText(t)));
      await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } });
      await expect(panel).toBeHidden();
    }
    await H.realClick(page, page.getByRole('button', { name: 'Create', exact: true }));
    const menu = page.locator('.mat-menu-panel').filter({ visible: true }).last();
    await expect(menu.locator('button')).toHaveText([/Create Campaign Offer/, /Create Highlighted Offer/]);
    await H.closeMenu(page);
  });

  test('COF-01: Create Campaign Offer dialog validates step 1 and closes without saving', async ({ page }) => {
    const addCalls = [];
    page.on('request', (r) => { if (/api\/campaignOffer\/add/.test(r.url())) addCalls.push(r.url()); });
    const dialog = await H.openSectionCreateDialog(page, 'Create', /Create Campaign Offer/, 'Create Campaign Offer');
    await expect(dialog).toContainText(/\(1 of 4 Steps\)/);
    const next = dialog.getByRole('button', { name: /^\s*Next\s*$/ });
    await expect(next).toBeDisabled();
    await expect(dialog.locator('mat-select[formcontrolname="OfferType"]')).toContainText('Basic');
    await expect(dialog.locator('mat-select[formcontrolname="DiscountType"]')).toContainText('Percentage');
    for (const [formControl, options] of /** @type {[string, string[]][]} */ ([
      ['OfferType', ['Basic', 'Target Audience']],
      ['OrderType', ['Delivery', 'Pickup', 'Both']],
      ['TargetType', ['Store', 'Category', 'Item']],
      ['DiscountType', ['Percentage', 'Amount']],
    ])) {
      await H.realClick(page, dialog.locator(`mat-select[formcontrolname="${formControl}"]`));
      const panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
      await expect(panel.locator('mat-option'), `${formControl} options`).toHaveText(options.map((t) => H.exactText(t)));
      await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } });
      await expect(panel).toBeHidden();
    }
    await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="OrderType"]'), 'Delivery');
    await expect(dialog.getByText('Target Type is Required')).toBeVisible();
    await dialog.locator('input[formcontrolname="Name"]').fill(MAIN_OFFER);
    await expect(next, 'Next stays disabled until all required fields are filled').toBeDisabled();
    await H.closeDialogWithX(page, dialog);
    expect(addCalls, 'Closing the dialog must not create an offer').toHaveLength(0);
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('COF-02: Create a percentage Store offer for Food House', async ({ page }) => {
    const { body } = await createOffer(page, { name: MAIN_OFFER, discountValue: '10', minOrderAmount: '2', discountMaxAmount: '3' });
    state.foodHouseId = body.StoreIds[0];
    expect(body.DiscountType).toBe('PERCENTAGE');
    expect(body.DiscountValue).toBe(10);
    expect(body.OfferStatuses).toEqual([expect.objectContaining({ IsActive: true })]);
    const row = await O.findOfferRow(page, MAIN_OFFER);
    await expect(row.locator('td').nth(1)).toHaveText(MAIN_OFFER);
    await expect(row.locator('td').nth(2)).toHaveText('عرض تجريبي');
    await expect(row.locator('td').nth(3)).toHaveText(H.formatDDMMYYYY(START_DATE));
    await expect(row.locator('td').nth(4)).toHaveText(H.formatDDMMYYYY(END_DATE));
    await expect(row.locator('td').nth(5)).toHaveText('Basic');
    await expect(row.locator('td').nth(6)).toHaveText('Delivery');
    await expect(row.locator('td').nth(7)).toHaveText('Store');
    await expect(row.locator('td').nth(8)).toHaveText('True');
  });

  test('COF-03: Order Type / Target Type / Store filters, Clear and the card view work on the created offer', async ({ page }) => {
    await O.findOfferRow(page, MAIN_OFFER);
    await H.clearSectionFilters(page, O.OFFER_LIST_API);
    const orderType = page.locator('mat-select[formcontrolname="OrderType"]');
    const targetType = page.locator('mat-select[formcontrolname="Type"]');
    let json = await H.applySectionFilter(page, orderType, 'Pickup', O.OFFER_LIST_API, '"OrderType":"PICKUP"');
    expect(json.Items.some((/** @type {{Name: string}} */ i) => i.Name === MAIN_OFFER), 'Pickup filter excludes the delivery offer').toBe(false);
    json = await H.applySectionFilter(page, orderType, 'Delivery', O.OFFER_LIST_API, '"OrderType":"DELIVERY"');
    expect(json.Items.map((/** @type {{Name: string}} */ i) => i.Name)).toContain(MAIN_OFFER);
    json = await H.applySectionFilter(page, targetType, 'Category', O.OFFER_LIST_API, '"Type":"CATEGORY"');
    expect(json.Items.some((/** @type {{Name: string}} */ i) => i.Name === MAIN_OFFER), 'Category filter excludes the store offer').toBe(false);
    await expect(H.sectionRow(page, MAIN_OFFER, 2)).toHaveCount(0);
    json = await H.applySectionFilter(page, targetType, 'Store', O.OFFER_LIST_API, '"Type":"STORE"');
    expect(json.Items.map((/** @type {{Name: string}} */ i) => i.Name)).toContain(MAIN_OFFER);
    await expect(H.sectionRow(page, MAIN_OFFER, 2)).toHaveCount(1);
    json = await H.clearSectionFilters(page, O.OFFER_LIST_API);
    expect(json.Items.map((/** @type {{Name: string}} */ i) => i.Name)).toContain(MAIN_OFFER);

    // Store filter: the Food House offer is listed for Food House only.
    expect(state.foodHouseId, 'COF-02 must have created the offer').toBeTruthy();
    const storeFilter = page.locator('mat-select[formcontrolname="StoreId"]');
    json = await H.applySectionFilter(page, storeFilter, CAFE_ASIANA, O.OFFER_LIST_API, new RegExp(`"StoreId":"(?!${state.foodHouseId})[0-9a-f]{24}"`));
    expect(json.Items.some((/** @type {{Name: string}} */ i) => i.Name === MAIN_OFFER), `${CAFE_ASIANA} filter excludes the Food House offer`).toBe(false);
    await expect(H.sectionRow(page, MAIN_OFFER, 2)).toHaveCount(0);
    json = await H.applySectionFilter(page, storeFilter, FOOD_HOUSE, O.OFFER_LIST_API, `"StoreId":"${state.foodHouseId}"`);
    expect(json.Items.map((/** @type {{Name: string}} */ i) => i.Name)).toContain(MAIN_OFFER);
    await expect(H.sectionRow(page, MAIN_OFFER, 2)).toHaveCount(1);
    await expect(storeFilter).toContainText(FOOD_HOUSE);
    await H.checkSectionGridView(page, MAIN_OFFER);
  });

  test('COF-04: Row menu lists actions and View shows the offer details', async ({ page }) => {
    const panel = await H.openRowMenu(page, await O.findOfferRow(page, MAIN_OFFER));
    expect(await H.menuLabels(panel)).toEqual(['Analytics', 'Edit', 'Set Stores', 'Manage Stores', 'View', 'Delete']);
    await H.clickMenuItem(page, panel, 'View');
    await page.waitForURL(/#\/home\/campaigns\/offer\/view/, { timeout: 30000 });
    await H.waitForSpinner(page);
    await expect(page.getByText(MAIN_OFFER, { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
    await expect(page.getByText(`${H.formatDDMMYYYY(START_DATE)} - ${H.formatDDMMYYYY(END_DATE)}`, { exact: true })).toBeVisible();
    for (const [label, value] of [['OFFER TYPE', 'BASIC'], ['ORDER TYPE', 'DELIVERY'], ['TARGET TYPE', 'STORE'], ['DISCOUNT TYPE', 'PERCENTAGE'], ['DISCOUNT VALUE', '10']]) {
      await expect(page.getByText(label, { exact: true }), label).toBeVisible();
      await expect(page.getByText(value, { exact: true }).first(), `${label} = ${value}`).toBeVisible();
    }
    await expect(page.getByText('OFFER ENGLISH IMAGE', { exact: true })).toBeVisible();
    await expect(page.getByText('OFFER ARABIC IMAGE', { exact: true })).toBeVisible();
  });

  test('COF-05: Manage Stores lists Food House and Set Stores shows it selected (Cancel, nothing saved)', async ({ page }) => {
    const infos = H.waitForApi(page, /api\/campaignOffer\/getCampaignOfferStoreInfos/);
    await openOfferAction(page, 'Manage Stores');
    await page.waitForURL(/#\/home\/campaigns\/offer\/manage-store/, { timeout: 30000 });
    const json = await (await infos).json();
    expect(json.Items.map((/** @type {{StoreName: string, IsActive: boolean}} */ i) => [i.StoreName, i.IsActive])).toEqual([['Food House', true]]);
    await expect(page.locator('h4').filter({ hasText: 'Manage Stores' }).first()).toBeVisible();
    await expect(page.locator('thead th')).toHaveText([H.exactText('Store Name'), H.exactText('Is Active')]);
    const storeRow = H.sectionRow(page, 'Food House');
    await expect(storeRow).toHaveCount(1);
    await expect(storeRow.locator('td').nth(1)).toHaveText('True');
    await expect(storeRow.locator('button[mattooltip="Edit"]')).toBeVisible();

    await H.gotoCampaignSection(page, CAMPAIGN_NAME, O.OFFER_SECTION.section, O.OFFER_SECTION.heading);
    const saves = [];
    page.on('request', (r) => { if (/api\/campaignOffer\/(setStores|setOfferStores|updateStores)/i.test(r.url())) saves.push(r.url()); });
    await openOfferAction(page, 'Set Stores');
    await page.waitForURL(/#\/home\/campaigns\/offer\/set-store/, { timeout: 30000 });
    await expect(page.locator('h4, h3').filter({ hasText: 'Set Stores - Offer Management' }).first()).toBeVisible({ timeout: 30000 });
    const lists = page.locator('dual-list .listbox');
    await expect(lists.nth(1).locator('li').filter({ hasText: H.exactText('Food House') })).toHaveCount(1, { timeout: 20000 });
    await expect(lists.nth(0).locator('li').filter({ hasText: H.exactText('Cafe Asiana - Market Place') })).toHaveCount(1);
    await H.realClick(page, page.getByRole('button', { name: /^\s*Cancel\s*$/ }));
    await expect(H.sectionHeading(page)).toHaveText(/Offer Management/, { timeout: 30000 });
    expect(saves, 'Cancel must not save stores').toHaveLength(0);
  });

  test('COF-06: Analytics shows the offer order summary', async ({ page }) => {
    const lookup = H.waitForApi(page, /api\/campaign\/getCampaignTypeLookup/, { body: (b) => b.includes('"Type":"OFFER"') });
    await openOfferAction(page, 'Analytics');
    const items = await (await lookup).json();
    expect(items.map((/** @type {{Name: string}} */ i) => i.Name)).toContain(MAIN_OFFER);
    await expect(page.getByText('Offer - Order Summary', { exact: true })).toBeVisible({ timeout: 30000 });
    for (const metric of ['Total Orders Count', 'Total Discount', "How much you've got (GMV)", 'Customers Count', 'Gross Total']) {
      await expect(page.getByText(metric, { exact: true }).first(), metric).toBeVisible();
    }
  });

  test('COF-07: Edit the offer discount value', async ({ page }) => {
    await openOfferAction(page, 'Edit');
    const dialog = H.campaignDialog(page).filter({ hasText: 'Edit Campaign Offer' });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog).toContainText(/\(1 of 2 Steps\)/);
    await expect(dialog.locator('input[formcontrolname="Name"]')).toHaveValue(MAIN_OFFER, { timeout: 20000 });
    await expect(dialog.locator('mat-select[formcontrolname="TargetType"]')).toContainText('Store');
    await expect(dialog.locator('input[formcontrolname="StartDate"]')).toHaveValue(H.formatDDMMYYYY(START_DATE));
    await expect(dialog.locator('input[formcontrolname="EndDate"]')).toHaveValue(H.formatDDMMYYYY(END_DATE));
    await expect(dialog.locator('input[formcontrolname="DiscountValue"]')).toHaveValue('10');
    await dialog.locator('input[formcontrolname="DiscountValue"]').fill(EDITED_VALUE);
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Next\s*$/ }));
    await expect(dialog).toContainText(/\(2 of 2 Steps\)/, { timeout: 20000 });
    const submit = dialog.locator('button').filter({ hasText: /^\s*(Update|Edit|Save|Edit Campaign Offer)\s*$/ }).last();
    await expect(submit).toBeEnabled({ timeout: 20000 });
    const update = H.waitForApi(page, /api\/campaignOffer\/(update|edit)/i);
    await H.realClick(page, submit);
    const response = await update;
    const text = await response.text();
    expect(response.status(), `campaign offer update failed: ${text}`).toBe(200);
    expect(text).toContain('SUCCESS');
    const body = JSON.parse(response.request().postData() || '{}');
    expect(body.Name).toBe(MAIN_OFFER);
    expect(body.DiscountValue).toBe(Number(EDITED_VALUE));
    await expect(dialog).toBeHidden({ timeout: 20000 });

    await H.gotoCampaignSection(page, CAMPAIGN_NAME, O.OFFER_SECTION.section, O.OFFER_SECTION.heading);
    await openOfferAction(page, 'View');
    await page.waitForURL(/#\/home\/campaigns\/offer\/view/, { timeout: 30000 });
    await expect(page.getByText('DISCOUNT VALUE', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(EDITED_VALUE, { exact: true }).first()).toBeVisible();
  });

  test('COF-08: Delete the offer (cancel first, then confirm)', async ({ page }) => {
    await H.cancelSectionRowDelete(page, await O.findOfferRow(page, MAIN_OFFER), O.OFFER_SECTION.deleteApi);
    await deleteOffer(page, MAIN_OFFER);
  });

  test('COF-09: Create, verify and delete an Amount Store offer', async ({ page }) => {
    const name = `QA Offer Amt ${RUN_STAMP}`;
    const { body } = await createOffer(page, { name, discountType: 'Amount', discountValue: '1', minOrderAmount: '5' });
    expect(body.DiscountType).toBe('AMOUNT');
    expect(body.DiscountValue).toBe(1);
    const row = await O.findOfferRow(page, name);
    await expect(row.locator('td').nth(7)).toHaveText('Store');
    await deleteOffer(page, name);
  });

  test('COF-10: Create, verify and delete a Category offer for a Food House category', async ({ page }) => {
    const name = `QA Offer Cat ${RUN_STAMP}`;
    const { body, chosen } = await createOffer(page, { name, targetType: 'Category' });
    expect(chosen).toHaveLength(1);
    expect(body.Categories, `category "${chosen[0]}" is sent`).toHaveLength(1);
    const row = await O.findOfferRow(page, name);
    await expect(row.locator('td').nth(7)).toHaveText('Category');
    await deleteOffer(page, name);
  });

  test('COF-11: Create, verify and delete an Item offer for a Food House item', async ({ page }) => {
    const name = `QA Offer Item ${RUN_STAMP}`;
    const { body, chosen } = await createOffer(page, { name, targetType: 'Item', orderType: 'Both' });
    expect(chosen).toHaveLength(1);
    expect(body.Items, `item "${chosen[0]}" is sent`).toHaveLength(1);
    const row = await O.findOfferRow(page, name);
    await expect(row.locator('td').nth(6)).toHaveText('Both');
    await expect(row.locator('td').nth(7)).toHaveText('Item');
    await deleteOffer(page, name);
  });

  test('COF-12: Create, verify, view and delete a Highlighted item offer for Food House', async ({ page }) => {
    const name = `QA Offer HL ${RUN_STAMP}`;
    createdOffers.add(name);
    const { item } = await O.createHighlightedOffer(page, { name, store: FOOD_HOUSE, start: START_DATE, end: END_DATE });
    expect(item, 'an item was picked').toBeTruthy();
    const row = await O.findOfferRow(page, name);
    await expect(row.locator('td').nth(5)).toHaveText('Highlighted');
    await expect(row.locator('td').nth(6)).toHaveText('Both');
    await expect(row.locator('td').nth(7)).toHaveText('Item');
    await expect(row.locator('td').nth(8)).toHaveText('True');
    const panel = await H.openRowMenu(page, row);
    expect(await H.menuLabels(panel), 'highlighted offers have no store actions').toEqual(['Analytics', 'Edit', 'View', 'Delete']);
    await H.clickMenuItem(page, panel, 'View');
    await page.waitForURL(/#\/home\/campaigns\/offer\/view/, { timeout: 30000 });
    await H.waitForSpinner(page);
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 30000 });
    for (const [label, value] of [['OFFER TYPE', 'HIGHLIGHTED'], ['ORDER TYPE', 'BOTH'], ['TARGET TYPE', 'ITEM']]) {
      await expect(page.getByText(label, { exact: true }), label).toBeVisible();
      await expect(page.getByText(value, { exact: true }).first(), `${label} = ${value}`).toBeVisible();
    }
    await H.gotoCampaignSection(page, CAMPAIGN_NAME, O.OFFER_SECTION.section, O.OFFER_SECTION.heading);
    await deleteOffer(page, name);
  });

  test(`COF-13: Set Stores adds ${CAFE_ASIANA} to an offer and Manage Stores activates it there`, async ({ page }) => {
    const name = `QA Offer Stores ${RUN_STAMP}`;
    const { body } = await createOffer(page, { name });
    const foodHouseId = body.StoreIds[0];
    const listed = await H.searchSection(page, name, O.OFFER_LIST_API);
    const offerId = listed.Items.find((/** @type {{Name: string}} */ i) => i.Name === name).Id;

    const panel = await H.openRowMenu(page, await O.findOfferRow(page, name));
    await H.clickMenuItem(page, panel, 'Set Stores');
    await page.waitForURL(/#\/home\/campaigns\/offer\/set-store/, { timeout: 30000 });
    await expect(page.locator('h4, h3').filter({ hasText: 'Set Stores - Offer Management' }).first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('dual-list .listbox').nth(1).locator('li').filter({ hasText: H.exactText(FOOD_HOUSE) })).toHaveCount(1, { timeout: 20000 });
    await H.addToDualList(page, page.locator('body'), [CAFE_ASIANA]);
    const save = H.waitForApi(page, /api\/campaignOffer\/setStoresForCampaignOffer/);
    const infos = H.waitForApi(page, /api\/campaignOffer\/getCampaignOfferStoreInfos/, { timeout: 90000 });
    await H.realClick(page, page.getByRole('button', { name: /^\s*Set Stores\s*$/ }));
    const saved = await save;
    expect(await saved.text()).toContain('SUCCESS');
    const saveBody = JSON.parse(saved.request().postData() || '{}');
    expect(saveBody.CampaignOfferId).toBe(offerId);
    expect(saveBody.StoreIds).toHaveLength(2);
    expect(saveBody.StoreIds).toContain(foodHouseId);
    // Saving lands on Manage Stores; the added store starts inactive.
    await page.waitForURL(/#\/home\/campaigns\/offer\/manage-store/, { timeout: 30000 });
    const status = (/** @type {any} */ list) => Object.fromEntries(list.Items.map((/** @type {{StoreName: string, IsActive: boolean}} */ i) => [i.StoreName, i.IsActive]));
    expect(status(await (await infos).json())).toEqual({ [FOOD_HOUSE]: true, [CAFE_ASIANA]: false });
    const cafeRow = H.sectionRow(page, CAFE_ASIANA);
    await expect(cafeRow.locator('td').nth(1)).toHaveText('False', { timeout: 20000 });

    await H.realClick(page, cafeRow.locator('button[mattooltip="Edit"]'));
    const dialog = H.campaignDialog(page).filter({ hasText: CAFE_ASIANA });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog).toContainText(name);
    const isActive = dialog.locator('mat-slide-toggle[formcontrolname="IsActive"]');
    await expect(isActive).not.toHaveClass(/mat-checked/, { timeout: 15000 });
    await expect(dialog.locator('mat-slide-toggle[formcontrolname="IsIncludeAddOns"]')).toBeVisible();
    await expect(dialog.locator('mat-slide-toggle[formcontrolname="IsPrimary"]')).toBeVisible();
    await H.realClick(page, isActive.locator('label').first());
    await expect(isActive).toHaveClass(/mat-checked/);
    const edit = H.waitForApi(page, /api\/campaignOffer\/editSingleStoreOffer/);
    const refreshed = H.waitForApi(page, /api\/campaignOffer\/getCampaignOfferStoreInfos/);
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Update\s*$/ }));
    const edited = await edit;
    expect(await edited.text()).toContain('SUCCESS');
    const editBody = JSON.parse(edited.request().postData() || '{}');
    expect(editBody.CampaignOfferId).toBe(offerId);
    expect(editBody.IsActive).toBe(true);
    expect(editBody.StoreId).not.toBe(foodHouseId);
    await expect(dialog).toBeHidden({ timeout: 20000 });
    expect(status(await (await refreshed).json())).toEqual({ [FOOD_HOUSE]: true, [CAFE_ASIANA]: true });
    await expect(cafeRow.locator('td').nth(1)).toHaveText('True', { timeout: 20000 });

    await H.gotoCampaignSection(page, CAMPAIGN_NAME, O.OFFER_SECTION.section, O.OFFER_SECTION.heading);
    await deleteOffer(page, name);
  });
});
