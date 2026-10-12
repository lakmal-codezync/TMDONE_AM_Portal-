// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 02.1 - Campaign View -> Promo Code Management
// URL: #/home/campaigns/promo-code?campaignId=...
// ------------------------------------------------------------
// Works only inside a campaign this file creates itself (unique run-stamped
// name, Colombo zone, test stores). Every promo code gets a unique run-stamped
// code and is deleted by its own test; afterAll deletes any leftover promo code
// and then the campaign.
// ============================================================

import { test, expect } from '@playwright/test';
import * as H from './helpers/campaignHelpers.js';
import * as P from './helpers/promoHelpers.js';

const RUN_STAMP = Date.now().toString().slice(-7);
const CAMPAIGN_NAME = `Auto Campaign PC ${RUN_STAMP}`;
// Promo codes are limited to 10 characters by the form: 4-letter prefix + 6 base-36 chars.
const CODE_STAMP = Date.now().toString(36).slice(-6).toUpperCase();
const START_DATE = new Date();
const END_DATE = H.addDays(new Date(), 10);
const LIST_API = P.PROMO_LIST_API;
const SECTION = P.PROMO_SECTION;

/** @type {string[]} */
const createdCodes = [];

const MAIN = {
  code: `QPCT${CODE_STAMP}`,
  discountType: 'Percentage',
  value: '10',
  max: '3',
  description: `Percentage promo created by Playwright ${RUN_STAMP}`,
};
const EDITED_VALUE = '15';
const EDITED_DESCRIPTION = `Percentage promo edited by Playwright ${RUN_STAMP}`;

/**
 * @typedef {{ id: string, title: string, code: string, discountType: 'Percentage' | 'Amount', value: string, max?: string,
 *   description: string, toggles?: string[], expected: Record<string, unknown>, freeDeliveryColumn: 'True' | 'False',
 *   manageStores?: 'view' | 'add' }} PromoVariant
 */
/** @type {PromoVariant[]} */
const VARIANTS = [
  { id: 'PC-08', title: 'amount promo code', code: `QAMT${CODE_STAMP}`, discountType: 'Amount', value: '2', description: 'Amount promo by Playwright', expected: { DiscountType: 'AMOUNT', DiscountValue: 2 }, freeDeliveryColumn: 'False' },
  { id: 'PC-09', title: 'saveable wallet voucher promo code', code: `QVCH${CODE_STAMP}`, discountType: 'Percentage', value: '10', max: '3', description: 'Saveable voucher by Playwright', toggles: ['IsSaveableAsVoucher'], expected: { IsSaveableAsVoucher: true }, freeDeliveryColumn: 'False', manageStores: 'view' },
  { id: 'PC-10', title: 'common campaign voucher promo code', code: `QCMN${CODE_STAMP}`, discountType: 'Percentage', value: '10', max: '3', description: 'Common voucher by Playwright', toggles: ['IsVoucherCampaign'], expected: { IsVoucherCampaign: true }, freeDeliveryColumn: 'False', manageStores: 'add' },
  { id: 'PC-11', title: 'first-time-only promo code', code: `QFTO${CODE_STAMP}`, discountType: 'Percentage', value: '10', max: '3', description: 'First time only by Playwright', toggles: ['IsFirstTimeOnly'], expected: { IsFirstTimeOnly: true }, freeDeliveryColumn: 'False' },
  { id: 'PC-12', title: 'free-delivery promo code', code: `QFDL${CODE_STAMP}`, discountType: 'Percentage', value: '10', max: '3', description: 'Free delivery promo by Playwright', toggles: ['IsFreeDelivery'], expected: { IsFreeDelivery: true }, freeDeliveryColumn: 'True' },
  { id: 'PC-13', title: 'first-time-only free-delivery promo code', code: `QFTF${CODE_STAMP}`, discountType: 'Amount', value: '1', description: 'First time + free delivery by Playwright', toggles: ['IsFirstTimeOnly', 'IsFreeDelivery'], expected: { IsFirstTimeOnly: true, IsFreeDelivery: true }, freeDeliveryColumn: 'True' },
];

/** @param {import('@playwright/test').Page} page */
async function openPromoPage(page) {
  await H.gotoCampaignSection(page, CAMPAIGN_NAME, SECTION.section, SECTION.heading);
  await expect(H.sectionHeading(page)).toHaveText(/Campaigns\s*-\s*Promo Code Management/);
}

/**
 * Creates a promo code in the test campaign (dates of this file) and records it
 * for the afterAll safety net.
 * @param {import('@playwright/test').Page} page
 * @param {{ code: string, discountType: string, value: string, max?: string, description: string, toggles?: string[] }} spec
 */
function createPromo(page, spec) {
  return P.createPromo(page, { ...spec, start: START_DATE, end: END_DATE, created: createdCodes });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} code
 */
function deletePromo(page, code) {
  return P.deletePromo(page, code, createdCodes);
}

const findPromoRow = P.findPromoRow;
const slideToggle = P.slideToggle;
const [FOOD_HOUSE, CAFE_ASIANA] = H.TEST_STORES;

/**
 * Opens "Manage Stores" of a voucher promo code (only voucher codes have stores):
 * it shows the stores picked at creation (Food House). With mode 'view' the
 * dialog is closed without saving; with 'add' Cafe Asiana is added and saved,
 * and re-opening the dialog shows both test stores assigned.
 * @param {import('@playwright/test').Page} page
 * @param {string} code
 * @param {'view' | 'add'} mode
 */
async function managePromoStores(page, code, mode) {
  /** @type {string[]} */
  const saves = [];
  const listener = (/** @type {import('@playwright/test').Request} */ r) => { if (/api\/promocode\/setPromoCodeStores/.test(r.url())) saves.push(r.url()); };
  page.on('request', listener);
  const open = async () => {
    const panel = await H.openRowMenu(page, await findPromoRow(page, code));
    const stores = H.waitForApi(page, /api\/promocode\/getUnassignedStores/);
    await H.clickMenuItem(page, panel, 'Manage Stores');
    const json = await (await stores).json();
    const dialog = H.campaignDialog(page).filter({ hasText: 'Manage Promo Code Stores' });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    const offered = json.All.map((/** @type {{Name: string}} */ s) => s.Name);
    // Only campaign stores can be offered. (Once, under parallel load, the lookup
    // briefly left Cafe Asiana out; the add path below requires it explicitly.)
    for (const name of offered) expect(H.TEST_STORES, `"${name}" is a campaign store`).toContain(name);
    expect(offered, 'the store picked at creation is offered').toContain(FOOD_HOUSE);
    return { dialog, offered, assigned: json.Assigned.map((/** @type {{Name: string}} */ s) => s.Name).sort() };
  };
  let { dialog, offered, assigned } = await open();
  expect(assigned, 'the store picked at creation is assigned').toEqual([FOOD_HOUSE]);
  const lists = dialog.locator('dual-list .listbox');
  await expect(lists.nth(1).locator('li').filter({ hasText: H.exactText(FOOD_HOUSE) })).toHaveCount(1, { timeout: 20000 });
  await expect(lists.nth(1).locator('li')).toHaveCount(1);
  if (mode === 'view') {
    await H.closeDialogWithX(page, dialog);
    page.off('request', listener);
    expect(saves, 'closing Manage Stores must not save').toHaveLength(0);
    return;
  }
  page.off('request', listener);
  expect(offered, `${CAFE_ASIANA} must be offered to add it`).toContain(CAFE_ASIANA);
  await expect(lists.nth(0).locator('li').filter({ hasText: H.exactText(CAFE_ASIANA) })).toHaveCount(1);
  await H.addToDualList(page, dialog, [CAFE_ASIANA]);
  const save = H.waitForApi(page, /api\/promocode\/setPromoCodeStores/);
  await H.realClick(page, dialog.getByRole('button', { name: /^\s*Save\s*$/ }));
  const response = await save;
  expect(await response.text()).toContain('SUCCESS');
  const body = JSON.parse(response.request().postData() || '{}');
  expect(body.SelectedStoreInfos.map((/** @type {{Name: string}} */ s) => s.Name).sort()).toEqual([...H.TEST_STORES].sort());
  await expect(dialog).toBeHidden({ timeout: 20000 });
  ({ dialog, offered, assigned } = await open());
  expect(assigned, 'both test stores are assigned after saving').toEqual([...H.TEST_STORES].sort());
  await H.closeDialogWithX(page, dialog);
}

test.describe.serial('02.1 - Promo Code', () => {
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
    await openPromoPage(page);
  });

  test('PC-00: Promo Code Management page shows toolbar, filters and an empty table for a new campaign', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create Promo', exact: true })).toBeVisible();
    await expect(H.sectionSearchInput(page)).toBeVisible();
    await expect(page.locator('mat-form-field').filter({ hasText: 'Search By' }).locator('mat-select')).toContainText('Code');
    await expect(page.locator('button[mattooltip="Search"]')).toBeVisible();
    await expect(page.locator('button[mattooltip="Clear"]')).toBeVisible();
    await expect(page.locator('span[mattooltip="Analytics"]')).toBeVisible();
    await expect(page.locator('thead th')).toHaveText(['Code', 'Start Date', 'End Date', 'Discount Type', 'Is Free Delivery', 'Status', 'Actions'].map((t) => H.exactText(t)));
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.getByText('Total 0 results found')).toBeVisible();

    // Discount Type filter offers exactly Percentage / Amount.
    const discountFilter = page.locator('mat-form-field').filter({ hasText: 'Discount Type' }).locator('mat-select');
    await H.realClick(page, discountFilter);
    const panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
    await expect(panel.locator('mat-option')).toHaveText([/Percentage/, /Amount/]);
    await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } });
    await expect(panel).toBeHidden();

    // Back arrow returns to the campaign view.
    await H.realClick(page, page.locator('mat-icon').filter({ hasText: /^\s*arrow_back_ios\s*$/ }).first());
    await expect(H.campaignViewHeader(page, CAMPAIGN_NAME)).toBeVisible({ timeout: 30000 });
  });

  test('PC-01: Create Promo dialog validates required fields and closes without saving', async ({ page }) => {
    const addCalls = [];
    page.on('request', (r) => { if (/api\/promocode\/add/.test(r.url())) addCalls.push(r.url()); });
    const dialog = await H.openSectionCreateDialog(page, 'Create Promo', /Create Promo Code/);
    const create = dialog.getByRole('button', { name: /^\s*Create\s*$/ });
    await expect(create).toBeDisabled();
    for (const fc of ['Code', 'StartDate', 'EndDate', 'DiscountValue', 'MaxCount', 'MaxCountPerUser', 'MaxOrderCount', 'MinOrderCount', 'MaxOrderValue', 'MinOrderValue']) {
      await expect(dialog.locator(`input[formcontrolname="${fc}"]`), `${fc} field`).toBeVisible();
    }
    for (const fc of ['IsFirstTimeOnly', 'IsFreeDelivery', 'IsSaveableAsVoucher', 'IsVoucherCampaign']) {
      await expect(slideToggle(dialog, fc), `${fc} toggle`).toBeVisible();
      await expect(slideToggle(dialog, fc)).not.toHaveClass(/mat-checked/);
    }
    await expect(dialog.locator('mat-select[formcontrolname="OperationalDay"]')).toContainText('All Days');
    // Percentage makes Discount Max Amount required.
    await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="DiscountType"]'), 'Percentage');
    await expect(dialog.locator('input[formcontrolname="DiscountMaxAmount"]')).toBeVisible();
    await expect(dialog.getByText('Discount Max Amount Required')).toBeVisible();
    await dialog.locator('input[formcontrolname="Code"]').fill(`QPCV${CODE_STAMP}`);
    await expect(create, 'Create stays disabled without dates / values').toBeDisabled();
    await H.closeDialogWithX(page, dialog);
    expect(addCalls, 'Closing the dialog must not create a promo code').toHaveLength(0);
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('PC-02: Create a percentage promo code', async ({ page }) => {
    const body = await createPromo(page, MAIN);
    expect(body.DiscountMaxAmount).toBe(Number(MAIN.max));
    expect(body.IsFreeDelivery).toBe(false);
    expect(body.IsFirstTimeOnly).toBe(false);
    const row = await findPromoRow(page, MAIN.code);
    await expect(row.locator('td')).toHaveText([MAIN.code, H.formatDDMMYYYY(START_DATE), H.formatDDMMYYYY(END_DATE), 'Percentage', 'False', 'ACTIVE', /more_horiz/].map((t) => (typeof t === 'string' ? H.exactText(t) : t)));
  });

  test('PC-03: Search, Discount Type filter and Clear work on the created promo code', async ({ page }) => {
    await findPromoRow(page, MAIN.code);
    const discountFilter = page.locator('mat-form-field').filter({ hasText: 'Discount Type' }).locator('mat-select');
    let response = H.waitForApi(page, LIST_API, { body: (b) => b.includes('"DiscountType":"AMOUNT"') });
    await H.chooseMatOption(page, discountFilter, 'Amount');
    let json = await (await response).json();
    expect(json.Items, 'Amount filter must exclude the percentage promo').toHaveLength(0);
    await expect(H.sectionRow(page, MAIN.code)).toHaveCount(0);
    response = H.waitForApi(page, LIST_API, { body: (b) => b.includes('"DiscountType":"PERCENTAGE"') });
    await H.chooseMatOption(page, discountFilter, 'Percentage');
    json = await (await response).json();
    expect(json.Items.map((/** @type {{Code: string}} */ p) => p.Code)).toEqual([MAIN.code]);
    await expect(H.sectionRow(page, MAIN.code)).toHaveCount(1);
    json = await H.clearSectionFilters(page, LIST_API);
    await expect(H.sectionSearchInput(page)).toHaveValue('');
    expect(json.Items.some((/** @type {{Code: string}} */ p) => p.Code === MAIN.code)).toBe(true);
  });

  test('PC-04: Row menu offers Analytics / Edit / Delete and Analytics opens the promo order summary', async ({ page }) => {
    const row = await findPromoRow(page, MAIN.code);
    const panel = await H.openRowMenu(page, row);
    expect(await H.menuLabels(panel)).toEqual(['Analytics', 'Edit', 'Delete']);
    const lookup = H.waitForApi(page, /api\/campaign\/getCampaignTypeLookup/, { body: (b) => b.includes('"Type":"PROMO"') });
    await H.clickMenuItem(page, panel, 'Analytics');
    const items = await (await lookup).json();
    expect(items.map((/** @type {{Name: string}} */ i) => i.Name)).toContain(MAIN.code);
    await expect(page.getByText('Promo - Order Summary')).toBeVisible({ timeout: 30000 });
    for (const metric of ['Total Orders Count', 'Total Discount', "How much you've got (GMV)", 'Customers Count']) {
      await expect(page.getByText(metric, { exact: true }).first(), metric).toBeVisible();
    }
    await expect(page.locator('button[mattooltip="Order List"]')).toBeVisible();
  });

  test('PC-05: Grid view shows the promo code as a card and the table view comes back', async ({ page }) => {
    await findPromoRow(page, MAIN.code);
    await H.realClick(page, page.locator('span[mattooltip="List View"]').first());
    await expect(page.locator('tbody tr')).toHaveCount(0, { timeout: 15000 });
    const card = page.locator('.card, mat-card, div').filter({ has: page.getByText(MAIN.code, { exact: true }) }).filter({ hasText: 'DISCOUNT TYPE' }).last();
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText('ACTIVE');
    await expect(card).toContainText(`${H.formatDDMMYYYY(START_DATE)} - ${H.formatDDMMYYYY(END_DATE)}`);
    await expect(card).toContainText(/Percentage/);
    await expect(card).toContainText(/IS FREE DELIVERY\s*False/i);
    // ... and the Grid View toggle brings the table back.
    await H.realClick(page, page.locator('span[mattooltip="Grid View"]').first());
    await expect(H.sectionRow(page, MAIN.code)).toHaveCount(1, { timeout: 15000 });
  });

  test('PC-06: Edit the promo code (description and discount value)', async ({ page }) => {
    const row = await findPromoRow(page, MAIN.code);
    const panel = await H.openRowMenu(page, row);
    await H.clickMenuItem(page, panel, 'Edit');
    const dialog = H.campaignDialog(page).filter({ hasText: 'Edit Promo Code' });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog.locator('input[formcontrolname="Code"]')).toHaveValue(MAIN.code);
    await expect(dialog.locator('mat-select[formcontrolname="DiscountType"]')).toContainText('Percentage');
    await expect(dialog.locator('input[formcontrolname="StartDate"]')).toHaveValue(H.formatDDMMYYYY(START_DATE));
    await expect(dialog.locator('input[formcontrolname="EndDate"]')).toHaveValue(H.formatDDMMYYYY(END_DATE));
    await expect(dialog.locator('input[formcontrolname="DiscountValue"]')).toHaveValue(MAIN.value);
    await expect(dialog.locator('input[formcontrolname="DiscountMaxAmount"]')).toHaveValue(MAIN.max);
    await expect(dialog.locator('textarea[formcontrolname="Description"]')).toHaveValue(MAIN.description);

    await dialog.locator('input[formcontrolname="DiscountValue"]').fill(EDITED_VALUE);
    await dialog.locator('textarea[formcontrolname="Description"]').fill(EDITED_DESCRIPTION);
    const update = H.waitForApi(page, /api\/promocode\/update/);
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Update\s*$/ }));
    const response = await update;
    const text = await response.text();
    expect(response.status(), `promocode/update failed: ${text}`).toBe(200);
    expect(text).toContain('SUCCESS');
    const body = JSON.parse(response.request().postData() || '{}');
    expect(body.Code).toBe(MAIN.code);
    expect(body.DiscountValue).toBe(Number(EDITED_VALUE));
    expect(body.Description).toBe(EDITED_DESCRIPTION);
    await expect(dialog).toBeHidden({ timeout: 20000 });

    // Re-open the edit dialog: the saved values are shown, then close without saving.
    const again = await H.openRowMenu(page, await findPromoRow(page, MAIN.code));
    await H.clickMenuItem(page, again, 'Edit');
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog.locator('input[formcontrolname="DiscountValue"]')).toHaveValue(EDITED_VALUE);
    await expect(dialog.locator('textarea[formcontrolname="Description"]')).toHaveValue(EDITED_DESCRIPTION);
    await H.closeDialogWithX(page, dialog);
  });

  test('PC-07: Delete the percentage promo code (cancel first, then confirm)', async ({ page }) => {
    const row = await findPromoRow(page, MAIN.code);
    await H.cancelSectionRowDelete(page, row, SECTION.deleteApi);
    await deletePromo(page, MAIN.code);
  });

  for (const variant of VARIANTS) {
    test(`${variant.id}: Create, verify${variant.manageStores ? ` (${variant.manageStores === 'add' ? 'add a store via' : 'open'} Manage Stores)` : ''} and delete a ${variant.title}`, async ({ page }) => {
      const body = await createPromo(page, variant);
      for (const [key, value] of Object.entries(variant.expected)) {
        expect(body[key], `${key} in promocode/add payload`).toBe(value);
      }
      const row = await findPromoRow(page, variant.code);
      await expect(row.locator('td').nth(3)).toHaveText(variant.discountType);
      await expect(row.locator('td').nth(4)).toHaveText(variant.freeDeliveryColumn);
      await expect(row.locator('td').nth(5)).toHaveText('ACTIVE');
      const panel = await H.openRowMenu(page, row);
      const voucher = (variant.toggles || []).some((t) => /Voucher/.test(t));
      expect(await H.menuLabels(panel)).toEqual(voucher ? ['Analytics', 'Manage Stores', 'Edit', 'Delete'] : ['Analytics', 'Edit', 'Delete']);
      await H.closeMenu(page);
      if (variant.manageStores) await managePromoStores(page, variant.code, variant.manageStores);
      await deletePromo(page, variant.code);
    });
  }
});
