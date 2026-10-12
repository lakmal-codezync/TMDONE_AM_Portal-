// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns lane: campaign offer helpers
// ------------------------------------------------------------
// Shared by 02.2-offers and 04-deal-offers-new. Offers are always created
// inside a campaign the spec created itself, with a unique run-stamped name,
// and are located by that name (never rows.first()).
// This is a plain module (not a spec), so importing it is safe.
// ============================================================

import { expect } from '@playwright/test';
import * as H from './campaignHelpers.js';

export const OFFER_LIST_API = /api\/campaignOffer\/list/;

export const OFFER_SECTION = {
  section: 'Offers',
  heading: /Offer Management/,
  listApi: OFFER_LIST_API,
  deleteApi: /api\/campaignOffer\/delete/,
  deletedText: /deleted/i,
  column: 2,
};

/**
 * Picks an option of a (possibly searchable) mat-select: the option named
 * `wanted`, or - without it - the first real option (skipping the search box's
 * "close" entry and empty options). Returns the picked option text.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} select
 * @param {string} [wanted]
 */
export async function pickSelectOption(page, select, wanted) {
  await H.realClick(page, select);
  const panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
  await panel.waitFor({ state: 'visible', timeout: 15000 });
  const options = panel.locator('mat-option').filter({ hasText: /\S/ }).filter({ hasNotText: /^\s*close\s*$/ });
  await expect(options.first(), 'the select should offer at least one option').toBeVisible({ timeout: 30000 });
  const option = wanted ? options.filter({ hasText: H.exactText(wanted) }).first() : options.first();
  const text = ((await option.innerText()) || '').trim();
  await option.click();
  if (await panel.isVisible().catch(() => false)) {
    await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } }).catch(() => {});
    await panel.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
  return text;
}

/**
 * @typedef {{ name: string, arabicName?: string, description?: string, orderType?: 'Delivery' | 'Pickup' | 'Both',
 *   targetType?: 'Store' | 'Category' | 'Item', discountType?: 'Percentage' | 'Amount', discountValue?: string,
 *   minOrderAmount?: string, discountMaxAmount?: string, stores?: string[], start?: Date, end?: Date, choose?: string }} OfferSpec
 */

/**
 * Creates a campaign offer through the real 4-step "Create Campaign Offer"
 * dialog (basic data -> stores -> per-store settings -> EN/AR images) on the
 * Offer Management page of a campaign, and verifies the add API call.
 * @param {import('@playwright/test').Page} page
 * @param {OfferSpec} spec
 * @returns {Promise<{ body: any, chosen: string[] }>} add request body and the chosen categories/items
 */
export async function createCampaignOffer(page, spec) {
  const {
    name,
    arabicName = 'عرض تجريبي',
    description = 'Campaign offer created by Playwright',
    orderType = 'Delivery',
    targetType = 'Store',
    discountType = 'Percentage',
    discountValue = '10',
    minOrderAmount = '2',
    discountMaxAmount = '3',
    stores = ['Food House'],
    start = new Date(),
    end = H.addDays(new Date(), 5),
  } = spec;
  const dialog = await H.openSectionCreateDialog(page, 'Create', /Create Campaign Offer/, 'Create Campaign Offer');
  await expect(dialog).toContainText(/\(1 of 4 Steps\)/);
  await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="OrderType"]'), orderType);
  await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="TargetType"]'), targetType);
  if (discountType !== 'Percentage') await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="DiscountType"]'), discountType);
  await dialog.locator('input[formcontrolname="Name"]').fill(name);
  await dialog.locator('input[formcontrolname="ArabicName"]').fill(arabicName);
  await dialog.locator('textarea[formcontrolname="Description"]').fill(description);
  await dialog.locator('textarea[formcontrolname="ArabicDescription"]').fill('وصف العرض التجريبي');
  await H.fillDialogDates(page, dialog, start, end);
  await dialog.locator('input[formcontrolname="DiscountValue"]').fill(discountValue);
  await dialog.locator('input[formcontrolname="MinOrderAmount"]').fill(minOrderAmount);
  const maxAmount = dialog.locator('input[formcontrolname="DiscountMaxAmount"]');
  if (await maxAmount.isEditable().catch(() => false)) await maxAmount.fill(discountMaxAmount);

  const next = dialog.getByRole('button', { name: /^\s*Next\s*$/ });
  await expect(next, 'step 1 is complete').toBeEnabled({ timeout: 10000 });
  await H.realClick(page, next);
  await expect(dialog).toContainText(/\(2 of 4 Steps\)/, { timeout: 20000 });
  await H.addToDualList(page, dialog, stores);
  await H.realClick(page, next);
  await expect(dialog).toContainText(/\(3 of 4 Steps\)/, { timeout: 20000 });
  for (const store of stores) await expect(dialog).toContainText(new RegExp(`\\d+\\.\\s*${H.escapeRegex(store)}`));
  /** @type {string[]} */
  const chosen = [];
  if (targetType !== 'Store') {
    await expect(dialog).toContainText(targetType === 'Category' ? 'Store Categories' : /Store Items/);
    await expect(next, `a ${targetType.toLowerCase()} must be chosen`).toBeDisabled();
    const selects = dialog.locator('mat-select[formcontrolname="ChooseValue"]');
    await expect(selects).toHaveCount(stores.length, { timeout: 20000 });
    for (let index = 0; index < stores.length; index += 1) chosen.push(await pickSelectOption(page, selects.nth(index), spec.choose));
  } else {
    await expect(dialog).toContainText('Store Offers');
    await expect(dialog.locator('mat-slide-toggle[formcontrolname="IsActive"]').first()).toHaveClass(/mat-checked/);
  }
  await expect(next).toBeEnabled({ timeout: 10000 });
  await H.realClick(page, next);
  await expect(dialog).toContainText(/\(4 of 4 Steps\)/, { timeout: 20000 });
  const create = dialog.getByRole('button', { name: /^\s*Create\s*$/ });
  await expect(create, 'both images are required').toBeDisabled();
  await H.uploadOfferImages(page, dialog);
  await expect(create).toBeEnabled({ timeout: 15000 });
  const addCall = H.waitForApi(page, /api\/campaignOffer\/add/);
  await H.realClick(page, create);
  const response = await addCall;
  const text = await response.text();
  expect(response.status(), `campaignOffer/add failed: ${text}`).toBe(200);
  expect(text).toContain('SUCCESS');
  const body = JSON.parse(response.request().postData() || '{}');
  expect(body.Name).toBe(name);
  expect(body.Type).toBe(targetType.toUpperCase());
  expect(body.OrderType).toBe(orderType.toUpperCase());
  expect(body.StartDate).toBe(H.formatApiDate(start));
  expect(body.EndDate).toBe(H.formatApiDate(end));
  expect(body.ImageUrl).toMatch(/^https:\/\//);
  expect(body.ArabicImageUrl).toMatch(/^https:\/\//);
  expect(body.StoreIds).toHaveLength(stores.length);
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await H.waitForSpinner(page);
  return { body, chosen };
}

/**
 * Creates a Highlighted (item) offer through the real 2-step "Create Highlighted
 * Offer" dialog (basic data with store + item -> EN/AR images) and verifies the
 * add API call.
 * The store list is only filled once an Order Type is chosen, and the item lookup
 * (looksup/getOfferItemsByStoreId) only returns the test stores' items for order
 * type "Both" (it answers ListItems:null for "Delivery"), so the offer uses "Both".
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string, store?: string, start: Date, end: Date }} spec
 * @returns {Promise<{ body: any, item: string }>}
 */
export async function createHighlightedOffer(page, spec) {
  const { name, store = 'Food House', start, end } = spec;
  const dialog = await H.openSectionCreateDialog(page, 'Create', /Create Highlighted Offer/, 'Create Highlighted Offer');
  await expect(dialog).toContainText(/\(1 of 2 Steps\)/);
  await expect(dialog.locator('mat-select[formcontrolname="OfferType"]')).toContainText('Highlighted');
  await expect(dialog.locator('mat-select[formcontrolname="DiscountType"]')).toContainText('Highlighted');
  await expect(dialog.locator('mat-select[formcontrolname="TargetType"]')).toContainText('Item');
  const next = dialog.getByRole('button', { name: /^\s*Next\s*$/ });
  await expect(next, 'step 1 is incomplete').toBeDisabled();
  await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="OrderType"]'), 'Both');
  await dialog.locator('input[formcontrolname="Name"]').fill(name);
  await dialog.locator('input[formcontrolname="ArabicName"]').fill('عرض مميز');
  await dialog.locator('textarea[formcontrolname="Description"]').fill('Highlighted offer created by Playwright');
  await dialog.locator('textarea[formcontrolname="ArabicDescription"]').fill('وصف العرض المميز');
  const storeSelect = dialog.locator('mat-select[formcontrolname="SelectedStore"]');
  await H.realClick(page, storeSelect);
  const panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
  for (const testStore of H.TEST_STORES) {
    await expect(panel.locator('mat-option').filter({ hasText: H.exactText(testStore) }), `${testStore} is offered`).toHaveCount(1, { timeout: 20000 });
  }
  await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } });
  await expect(panel).toBeHidden({ timeout: 5000 });
  const itemsCall = H.waitForApi(page, /api\/looksup\/getOfferItemsByStoreId/, { body: (b) => b.includes('"OrderType":"BOTH"') });
  await pickSelectOption(page, storeSelect, store);
  const items = await (await itemsCall).json();
  expect(items.ListItems?.length, `${store} has items for highlighted offers`).toBeGreaterThan(0);
  const item = await pickSelectOption(page, dialog.locator('mat-select[formcontrolname="ItemSelected"]'));
  const norm = (/** @type {string} */ t) => t.replace(/\s+/g, ' ').trim();
  const itemInfo = items.ListItems.find((/** @type {{Name: string}} */ i) => norm(i.Name) === norm(item));
  expect(itemInfo, `the picked item "${item}" comes from the item lookup`).toBeTruthy();
  await H.fillDialogDates(page, dialog, start, end);
  await expect(next, 'step 1 is complete').toBeEnabled({ timeout: 10000 });
  await H.realClick(page, next);
  await expect(dialog).toContainText(/\(2 of 2 Steps\)/, { timeout: 20000 });
  const create = dialog.getByRole('button', { name: /^\s*Create\s*$/ });
  await expect(create, 'both images are required').toBeDisabled();
  await H.uploadOfferImages(page, dialog);
  await expect(create).toBeEnabled({ timeout: 15000 });
  const addCall = H.waitForApi(page, /api\/campaignOffer\/add/);
  await H.realClick(page, create);
  const response = await addCall;
  const text = await response.text();
  expect(response.status(), `campaignOffer/add failed: ${text}`).toBe(200);
  expect(text).toContain('SUCCESS');
  const body = JSON.parse(response.request().postData() || '{}');
  expect(body.Name).toBe(name);
  expect(body.OfferType).toBe('HIGHLIGHTED');
  expect(body.DiscountType).toBe('HIGHLIGHTED');
  expect(body.Type).toBe('ITEM');
  expect(body.OrderType).toBe('BOTH');
  expect(body.StartDate).toBe(H.formatApiDate(start));
  expect(body.EndDate).toBe(H.formatApiDate(end));
  expect(body.Items).toEqual([{ StoreId: items.StoreId, ItemIds: [itemInfo.Value] }]);
  expect(body.StoreIds).toEqual([items.StoreId]);
  expect(body.ImageUrl).toMatch(/^https:\/\//);
  expect(body.ArabicImageUrl).toMatch(/^https:\/\//);
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await H.waitForSpinner(page);
  return { body, item };
}

/**
 * Searches the offer list for `name` and returns its single row (Name = column 2).
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export async function findOfferRow(page, name) {
  const result = await H.searchSection(page, name, OFFER_LIST_API);
  expect(result.Items.filter((/** @type {{Name: string}} */ i) => i.Name === name), `offer "${name}" should be returned by the list API`).toHaveLength(1);
  const row = H.sectionRow(page, name, 2);
  await expect(row).toHaveCount(1, { timeout: 20000 });
  return row;
}

/**
 * Deletes campaign offer `name` (row menu -> Delete -> confirm) and verifies it is gone.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export async function deleteCampaignOffer(page, name) {
  const row = await findOfferRow(page, name);
  await H.deleteSectionRow(page, row, OFFER_SECTION.deleteApi, OFFER_SECTION.deletedText);
  const after = await H.searchSection(page, name, OFFER_LIST_API);
  expect(after.Items.filter((/** @type {{Name: string}} */ i) => i.Name === name)).toHaveLength(0);
  await expect(H.sectionRow(page, name, 2)).toHaveCount(0);
}
