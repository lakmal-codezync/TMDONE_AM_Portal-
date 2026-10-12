// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns lane: campaign promo code helpers
// ------------------------------------------------------------
// Shared by 02.1-promo-code and 02-manage-campaign. Promo codes are always
// created inside a campaign the spec created itself, with a unique run-stamped
// code, and are located by that code (never rows.first()).
// This is a plain module (not a spec), so importing it is safe.
// ============================================================

import { expect } from '@playwright/test';
import * as H from './campaignHelpers.js';

export const PROMO_LIST_API = /api\/promocode\/getAllCampaignPromoCode/;

export const PROMO_SECTION = {
  section: 'Promo Code',
  heading: /Promo Code Management/,
  listApi: PROMO_LIST_API,
  deleteApi: /api\/promocode\/delete/i,
  deletedText: /deleted/i,
};

/**
 * @param {import('@playwright/test').Locator} dialog
 * @param {string} formControl
 */
export function slideToggle(dialog, formControl) {
  return dialog.locator(`mat-slide-toggle[formcontrolname="${formControl}"]`);
}

/**
 * Turns a mat-slide-toggle on with a real click and verifies its state.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} toggle
 */
export async function realToggle(page, toggle) {
  await expect(toggle).toBeVisible({ timeout: 10000 });
  if (/mat-checked/.test((await toggle.getAttribute('class')) || '')) return;
  await H.realClick(page, toggle.locator('label').first());
  await expect(toggle).toHaveClass(/mat-checked/, { timeout: 5000 });
}

/**
 * @typedef {{ code: string, discountType: string, value: string, max?: string, description: string, toggles?: string[],
 *   start: Date, end: Date, created?: string[] }} PromoSpec
 */

/**
 * Creates a promo code through the real "Create Promo Code" dialog of the
 * Promo Code Management page and verifies the add API call. The code is pushed
 * to `spec.created` (for the afterAll safety net) as soon as the add call is sent.
 * @param {import('@playwright/test').Page} page
 * @param {PromoSpec} spec
 */
export async function createPromo(page, spec) {
  const dialog = await H.openSectionCreateDialog(page, 'Create Promo', /Create Promo Code/);
  await dialog.locator('input[formcontrolname="Code"]').fill(spec.code);
  await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="DiscountType"]'), spec.discountType);
  await H.fillDialogDates(page, dialog, spec.start, spec.end);
  await dialog.locator('input[formcontrolname="DiscountValue"]').fill(spec.value);
  if (spec.max) await dialog.locator('input[formcontrolname="DiscountMaxAmount"]').fill(spec.max);
  await dialog.locator('textarea[formcontrolname="Description"]').fill(spec.description);
  await dialog.locator('textarea[formcontrolname="DescriptionArabic"]').fill('رمز ترويجي تجريبي');
  for (const formControl of spec.toggles || []) {
    await realToggle(page, slideToggle(dialog, formControl));
  }
  const firstTimeOnly = (spec.toggles || []).includes('IsFirstTimeOnly');
  if (firstTimeOnly) {
    // "Is First Time Only" locks the per-user / order-count limits at 0.
    for (const fc of ['MaxCountPerUser', 'MaxOrderCount', 'MinOrderCount']) {
      await expect(dialog.locator(`input[formcontrolname="${fc}"]`), `${fc} is locked for first-time-only codes`).toHaveAttribute('readonly', /.*/);
      await expect(dialog.locator(`input[formcontrolname="${fc}"]`)).toHaveValue('0');
    }
  }
  await dialog.locator('input[formcontrolname="MaxCount"]').fill('100');
  if (!firstTimeOnly) await dialog.locator('input[formcontrolname="MaxCountPerUser"]').fill('1');
  // Voucher variants reveal Target Type (Store) and required title fields, and the
  // submit button becomes "Create and set Stores" (a store picker follows).
  const isVoucher = (spec.toggles || []).some((t) => /Voucher/.test(t));
  if (isVoucher) {
    await expect(dialog.locator('mat-select[formcontrolname="TargetType"]')).toContainText('Store');
    const titles = { Title: 'QA Voucher', TitleArabic: 'قسيمة', SubTitle: 'QA Voucher subtitle', SubTitleArabic: 'قسيمة فرعية' };
    for (const [formControl, value] of Object.entries(titles)) {
      await dialog.locator(`input[formcontrolname="${formControl}"]`).fill(value);
    }
  }

  const create = dialog.getByRole('button', { name: isVoucher ? /^\s*Create and set Stores\s*$/ : /^\s*Create\s*$/ });
  await expect(create, 'Create should be enabled once the required fields are filled').toBeEnabled({ timeout: 10000 });
  const addCall = H.waitForApi(page, /api\/promocode\/add/);
  await H.realClick(page, create);
  const response = await addCall;
  const responseText = await response.text();
  expect(response.status(), `promocode/add failed: ${responseText}`).toBe(200);
  const body = JSON.parse(response.request().postData() || '{}');
  if (body.Code && spec.created) spec.created.push(body.Code);
  expect(responseText).toContain('SUCCESS');
  expect(body.Code).toBe(spec.code);
  expect(body.DiscountType).toBe(spec.discountType.toUpperCase());
  expect(body.DiscountValue).toBe(Number(spec.value));
  expect(body.StartDate).toBe(H.formatApiDate(spec.start));
  expect(body.EndDate).toBe(H.formatApiDate(spec.end));
  expect(body.Description).toBe(spec.description);
  expect(body.MaxCount).toBe(100);
  expect(body.MaxCountPerUser).toBe(firstTimeOnly ? 0 : 1);
  if (isVoucher) {
    expect(body.TargetType).toBe('STORE');
    expect(body.Title).toBe('QA Voucher');
    // Store picker: "Manage Promo Code Stores ( stores are required )".
    const stores = H.campaignDialog(page).filter({ hasText: 'Manage Promo Code Stores' });
    await expect(stores).toBeVisible({ timeout: 20000 });
    const save = stores.getByRole('button', { name: /^\s*Save\s*$/ });
    await expect(save, 'Save requires at least one store').toBeDisabled();
    await H.addToDualList(page, stores, ['Food House']);
    const setStores = H.waitForApi(page, /api\/promocode\/setPromoCodeStores/);
    await H.realClick(page, save);
    const storesResponse = await setStores;
    expect(await storesResponse.text()).toContain('SUCCESS');
    const storesBody = JSON.parse(storesResponse.request().postData() || '{}');
    expect(storesBody.SelectedStoreInfos.map((/** @type {{Name: string}} */ s) => s.Name)).toEqual(['Food House']);
    await expect(stores).toBeHidden({ timeout: 20000 });
  }
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await H.waitForSpinner(page);
  return body;
}

/**
 * Searches the promo list for `code` and returns its single row.
 * @param {import('@playwright/test').Page} page
 * @param {string} code
 */
export async function findPromoRow(page, code) {
  const result = await H.searchSection(page, code, PROMO_LIST_API);
  expect(result.Items.filter((/** @type {{Code: string}} */ p) => p.Code === code), `promo ${code} should be returned by the list API`).toHaveLength(1);
  const row = H.sectionRow(page, code);
  await expect(row).toHaveCount(1, { timeout: 20000 });
  return row;
}

/**
 * Deletes promo code `code` (row menu -> Delete -> confirm), verifies it is gone
 * and removes it from `created`.
 * @param {import('@playwright/test').Page} page
 * @param {string} code
 * @param {string[]} [created]
 */
export async function deletePromo(page, code, created) {
  const row = await findPromoRow(page, code);
  await H.deleteSectionRow(page, row, PROMO_SECTION.deleteApi, PROMO_SECTION.deletedText);
  const after = await H.searchSection(page, code, PROMO_LIST_API);
  expect(after.Items.filter((/** @type {{Code: string}} */ p) => p.Code === code)).toHaveLength(0);
  await expect(H.sectionRow(page, code)).toHaveCount(0);
  if (created && created.includes(code)) created.splice(created.indexOf(code), 1);
}
