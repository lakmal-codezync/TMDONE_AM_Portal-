// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 04 - Deal Offers campaign: a deals campaign with the main deal-offer variants
// URLs: #/home/campaigns, #/home/campaigns/offer/list?campaignId=...
// ------------------------------------------------------------
// Intent (kept from the original spec): create a "Deal offers new" campaign and
// create every main deal-offer variant under it - percentage, static (no min
// order / max discount), amount, and the Store / Category / Item target types -
// and prove each one is saved and searchable.
//
// Test data policy (changed from the original, which reused a fixed campaign in
// Colombo + Panadura with all stores and left every offer behind):
//  * the campaign is this run's own "Auto Campaign Deal offers new <stamp>",
//    Colombo zone only, test stores Food House + Cafe Asiana - Market Place;
//  * every offer targets Food House and has a run-stamped name;
//  * DEAL-08 deletes all offers and DEAL-09 the campaign; afterAll deletes
//    whatever is left if a step failed. Nothing is left behind.
// The Item variant uses order type "Both": the item lookup
// (looksup/getOfferItemsByStoreId) returns no items for "Delivery" for the test
// stores, so an item cannot be chosen for a delivery-only offer.
// ============================================================

import { test, expect } from '@playwright/test';
import * as H from './helpers/campaignHelpers.js';
import * as O from './helpers/offerHelpers.js';

const RUN_STAMP = Date.now().toString().slice(-7);
const CAMPAIGN_NAME = `Auto Campaign Deal offers new ${RUN_STAMP}`;
const CAMPAIGN_BUDGET = '100';
const CAMPAIGN_DESCRIPTION = 'Deal offers campaign created by Playwright for offer coverage';
const START_DATE = new Date();
const END_DATE = H.addDays(START_DATE, 7);

/**
 * @typedef {{ id: string, title: string, spec: Omit<O.OfferSpec, 'name'>, expected: Record<string, unknown>,
 *   columns: { offerType: string, orderType: string, target: string } }} DealVariant
 */
/** @type {DealVariant[]} */
const VARIANTS = [
  {
    id: 'DEAL-01', title: 'Deal Percentage Offer',
    spec: { discountValue: '10', discountMaxAmount: '100', minOrderAmount: '100' },
    expected: { Type: 'STORE', DiscountType: 'PERCENTAGE', DiscountValue: 10, DiscountMaxAmount: 100, MinOrderAmount: 100 },
    columns: { offerType: 'Basic', orderType: 'Delivery', target: 'Store' },
  },
  {
    id: 'DEAL-02', title: 'Deal Static Offer',
    spec: { targetType: 'Store', discountValue: '10', minOrderAmount: '0', discountMaxAmount: '0' },
    expected: { Type: 'STORE', DiscountType: 'PERCENTAGE', DiscountValue: 10, DiscountMaxAmount: 0, MinOrderAmount: 0 },
    columns: { offerType: 'Basic', orderType: 'Delivery', target: 'Store' },
  },
  {
    id: 'DEAL-03', title: 'Deal Amount Offer',
    spec: { discountType: 'Amount', discountValue: '15', minOrderAmount: '100' },
    expected: { Type: 'STORE', DiscountType: 'AMOUNT', DiscountValue: 15, MinOrderAmount: 100 },
    columns: { offerType: 'Basic', orderType: 'Delivery', target: 'Store' },
  },
  {
    id: 'DEAL-04', title: 'Deal Store Target Offer',
    spec: { targetType: 'Store', discountValue: '10', discountMaxAmount: '100', minOrderAmount: '100' },
    expected: { Type: 'STORE', DiscountType: 'PERCENTAGE', DiscountValue: 10, DiscountMaxAmount: 100, MinOrderAmount: 100 },
    columns: { offerType: 'Basic', orderType: 'Delivery', target: 'Store' },
  },
  {
    id: 'DEAL-05', title: 'Deal Category Target Offer',
    spec: { targetType: 'Category', discountValue: '10', discountMaxAmount: '100', minOrderAmount: '100' },
    expected: { Type: 'CATEGORY', DiscountType: 'PERCENTAGE', DiscountValue: 10, DiscountMaxAmount: 100, MinOrderAmount: 100 },
    columns: { offerType: 'Basic', orderType: 'Delivery', target: 'Category' },
  },
  {
    id: 'DEAL-06', title: 'Deal Item Target Offer',
    spec: { targetType: 'Item', orderType: 'Both', discountValue: '10', discountMaxAmount: '100', minOrderAmount: '100' },
    expected: { Type: 'ITEM', OrderType: 'BOTH', DiscountType: 'PERCENTAGE', DiscountValue: 10, DiscountMaxAmount: 100, MinOrderAmount: 100 },
    columns: { offerType: 'Basic', orderType: 'Both', target: 'Item' },
  },
];

const offerName = (/** @type {DealVariant} */ v) => `${v.title} ${RUN_STAMP}`;

/** Offers this run may have created (for the afterAll safety net). @type {Set<string>} */
const createdOffers = new Set();

/** @param {import('@playwright/test').Page} page */
async function openOffers(page) {
  await H.gotoCampaignSection(page, CAMPAIGN_NAME, O.OFFER_SECTION.section, O.OFFER_SECTION.heading);
  await expect(H.sectionHeading(page)).toHaveText(/Campaigns\s*-\s*Offer Management/);
}

test.describe.serial('04 - Deal Offers campaign', () => {
  test.afterAll(async ({ browser }) => {
    test.setTimeout(720000);
    await H.deleteSectionRowsIfPresent(browser, CAMPAIGN_NAME, O.OFFER_SECTION, [...createdOffers], 420000);
    await H.deleteCampaignIfPresent(browser, CAMPAIGN_NAME);
  });

  test('DEAL-00: Create the deal offers campaign (Colombo, test stores)', async ({ page }) => {
    test.setTimeout(300000);
    await H.openCampaignsList(page);
    const body = await H.createCampaign(page, { name: CAMPAIGN_NAME, budget: CAMPAIGN_BUDGET, description: CAMPAIGN_DESCRIPTION });
    expect(String(body.Budget)).toBe(CAMPAIGN_BUDGET);
    expect(body.Description).toBe(CAMPAIGN_DESCRIPTION);
    const row = await H.findCampaignRow(page, CAMPAIGN_NAME);
    await expect(row.locator('td').nth(4)).toHaveText('STORE');
    await expect(row.locator('td').nth(5)).toHaveText(CAMPAIGN_BUDGET);
    await expect(row.locator('td').nth(7)).toHaveText('APPROVED');
  });

  for (const variant of VARIANTS) {
    test(`${variant.id}: Create the "${variant.title}" for Food House and find it in the offer list`, async ({ page }) => {
      test.setTimeout(420000);
      await openOffers(page);
      const name = offerName(variant);
      createdOffers.add(name);
      const { body, chosen } = await O.createCampaignOffer(page, { name, stores: ['Food House'], start: START_DATE, end: END_DATE, ...variant.spec });
      for (const [key, value] of Object.entries(variant.expected)) {
        expect(body[key], `${key} in the campaignOffer/add payload`).toBe(value);
      }
      if (variant.expected.Type === 'CATEGORY') expect(body.Categories, `category "${chosen[0]}" is sent`).toHaveLength(1);
      if (variant.expected.Type === 'ITEM') expect(body.Items, `item "${chosen[0]}" is sent`).toHaveLength(1);
      const row = await O.findOfferRow(page, name);
      await expect(row.locator('td').nth(5)).toHaveText(variant.columns.offerType);
      await expect(row.locator('td').nth(6)).toHaveText(variant.columns.orderType);
      await expect(row.locator('td').nth(7)).toHaveText(variant.columns.target);
      await expect(row.locator('td').nth(8)).toHaveText('True');
    });
  }

  test('DEAL-07: All deal offers are listed together and counted on the campaign view', async ({ page }) => {
    test.setTimeout(300000);
    await openOffers(page);
    const json = await H.searchSection(page, RUN_STAMP, O.OFFER_LIST_API);
    const names = VARIANTS.map(offerName);
    expect(json.Items.map((/** @type {{Name: string}} */ i) => i.Name).sort(), 'the list API returns exactly the deal offers of this run').toEqual([...names].sort());
    for (const name of names) await expect(H.sectionRow(page, name, 2), name).toHaveCount(1);
    await H.realClick(page, page.locator('mat-icon').filter({ hasText: /^\s*arrow_back_ios\s*$/ }).first());
    await expect(H.campaignViewHeader(page, CAMPAIGN_NAME)).toBeVisible({ timeout: 30000 });
    await expect.poll(() => H.sectionCount(page, 'Offers'), { message: 'Offers card counts the deal offers', timeout: 30000 }).toBe(VARIANTS.length);
  });

  test('DEAL-08: Delete every deal offer', async ({ page }) => {
    test.setTimeout(600000);
    await openOffers(page);
    for (const variant of VARIANTS) {
      const name = offerName(variant);
      await O.deleteCampaignOffer(page, name);
      createdOffers.delete(name);
    }
    const json = await H.searchSection(page, RUN_STAMP, O.OFFER_LIST_API);
    expect(json.Items, 'no deal offer of this run is left').toHaveLength(0);
  });

  test('DEAL-09: Delete the deal offers campaign', async ({ page }) => {
    test.setTimeout(300000);
    await H.openCampaignsList(page);
    await H.deleteCampaign(page, CAMPAIGN_NAME);
  });
});
