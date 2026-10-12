// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// Campaigns list page and Campaign Global Filter (READ-ONLY)
// URLs: #/home/campaigns, #/home/campaigns/campaignGlobalFilter
// ------------------------------------------------------------
// This file never creates, edits or deletes anything and never opens an action
// menu of a campaign it does not own. Every check is proven on both the list
// API (request body + response) and the rendered grid: filters must send the
// chosen value and every returned/rendered campaign must match it.
// Reference values (a campaign name/code, a global-filter code) are read from
// the API response; test-owned "Auto Campaign ..." records of parallel runs are
// skipped as references because they may disappear at any time.
// Row actions on own data (View, Set Stores, Edit, Delete, Global Filter
// navigation) are covered by 01, 02-manage-campaign and 03.
// ============================================================

import { test, expect } from '@playwright/test';
import * as H from './helpers/campaignHelpers.js';

const LIST_API = /api\/campaign\/getCampignList/;
const GF_API = /api\/campaign\/global-filter/;
const LIST_COLUMNS = ['Code', 'Campaign Name', 'Start Date', 'End Date', 'Campaign Target Type', 'Budget (OMR)', 'Bearer Party', 'Status', 'Actions'];
const GF_COLUMNS = ['Code', 'Target Type', 'Target Name', 'Start Date', 'End Date', 'Campaign Code', 'Campaign Name', 'Campaign Target Type', 'Actions'];
/** Names created by test runs (ours or other lanes) - never used as stable references. */
const VOLATILE = /^(Auto Campaign|QA |DBG|Deal )/i;

/** @typedef {{ Id: string, Code: string, Name: string, Status: string, CampaignTargetType: string, Zones: { Id: string, Name: string }[] | null }} CampaignItem */

/**
 * Picks a stable reference campaign from a list response: not test-created and
 * with a name that is safe to use as a server-side (regex) search term.
 * @param {{ Items: CampaignItem[] }} json
 */
function stableCampaign(json) {
  const item = json.Items.find((c) => !VOLATILE.test(c.Name) && !/[()[\]{}*+?.\\^$|]/.test(c.Name) && c.Name.trim().length >= 4);
  expect(item, 'the first list page should contain a non-test campaign to use as a search reference').toBeTruthy();
  return /** @type {CampaignItem} */ (item);
}

/**
 * Cell texts of column `n` (1-based) of the rendered grid.
 * @param {import('@playwright/test').Page} page
 * @param {number} n
 */
async function columnTexts(page, n) {
  return (await page.locator(`tbody tr td:nth-child(${n})`).allInnerTexts()).map((t) => t.trim());
}

/**
 * Opens a mat-select and returns its option texts, then closes it again.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} select
 */
async function optionTexts(page, select) {
  await H.realClick(page, select);
  const panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
  await panel.waitFor({ state: 'visible', timeout: 15000 });
  const texts = (await panel.locator('mat-option').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } });
  await expect(panel).toBeHidden({ timeout: 5000 });
  return texts;
}

/**
 * Asserts that the grid renders exactly the campaigns of a list response.
 * @param {import('@playwright/test').Page} page
 * @param {{ Items: CampaignItem[], TotalItemCount: number }} json
 */
async function expectGridShows(page, json) {
  await expect(page.locator('tbody tr')).toHaveCount(json.Items.length, { timeout: 30000 });
  expect(await columnTexts(page, 1), 'grid codes = API codes (same order)').toEqual(json.Items.map((c) => c.Code));
  await expect(page.getByText(`Total ${json.TotalItemCount} results found`)).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
async function openGlobalFilter(page) {
  const loaded = H.waitForApi(page, GF_API);
  await H.realClick(page, page.getByRole('button', { name: /Global Filter/ }));
  await page.waitForURL(/#\/home\/campaigns\/campaignGlobalFilter/, { timeout: 30000 });
  const response = await loaded;
  await H.waitForSpinner(page);
  await expect(page.locator('h4, h3').filter({ hasText: 'Campaign Global Filter' }).first()).toBeVisible({ timeout: 30000 });
  return { body: JSON.parse(response.request().postData() || '{}'), json: await response.json() };
}

/**
 * Picks a Global Filter option and runs the search (the page only queries on the
 * search button); returns the request body and the response of that search.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} select
 * @param {string} option
 * @param {(body: string) => boolean} match
 */
async function globalFilterPick(page, select, option, match) {
  await H.chooseMatOption(page, select, option);
  await expect(select).toContainText(option);
  return globalFilterSearch(page, match);
}

/**
 * Clicks the toolbar search button of the Global Filter page and returns the API call.
 * @param {import('@playwright/test').Page} page
 * @param {(body: string) => boolean} match
 */
async function globalFilterSearch(page, match) {
  const call = H.waitForApi(page, GF_API, { body: match });
  await H.realClick(page, page.locator('button').filter({ has: page.locator('mat-icon', { hasText: /^\s*search\s*$/ }) }).first());
  const response = await call;
  await H.waitForSpinner(page);
  return { body: JSON.parse(response.request().postData() || '{}'), json: await response.json() };
}

test.describe.serial('12 - Campaigns list and Global Filter (read-only)', () => {
  /** @type {any} */
  let initial = null;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    initial = await H.openCampaignsList(page);
    expect(initial, 'the initial getCampignList response should be observed').toBeTruthy();
  });

  test('CAM-01: Campaign list shows its toolbar, columns, API rows and pagination', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Create Campaign/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Global Filter/ })).toBeVisible();
    await expect(H.campaignSearchInput(page)).toHaveValue('');
    await expect(H.fieldSelect(page, 'Search By')).toContainText('Name');
    for (const label of ['Select a Zone', 'Status', 'Campaign Target Type']) {
      await expect(H.fieldSelect(page, label), `${label} filter`).toBeVisible();
    }
    await expect(page.locator('button[mattooltip="Search"]')).toBeVisible();
    await expect(page.locator('button[mattooltip="Clear"]')).toBeVisible();
    await expect(page.locator('thead th')).toHaveText(LIST_COLUMNS.map((t) => H.exactText(t)));
    expect(initial.PageNumber).toBe(1);
    expect(initial.Items.length).toBe(Math.min(initial.PageSize, initial.TotalItemCount));
    await expectGridShows(page, initial);
    const pager = page.locator('pagination-controls').first();
    await expect(pager).toContainText(/Prev/);
    await expect(pager).toContainText(/Next/);
    if (initial.PageCount > 1) await expect(pager).toContainText(String(initial.PageCount));

    // The Create Campaign dialog opens and closes again without creating anything.
    const addCalls = [];
    page.on('request', (r) => { if (/api\/campaign\/addCampaign/.test(r.url())) addCalls.push(r.url()); });
    const dialog = await H.openCreateCampaignDialog(page);
    await H.closeDialogWithX(page, dialog);
    expect(addCalls, 'closing the dialog must not create a campaign').toHaveLength(0);
  });

  test('CAM-02: Search by Name returns only matching campaigns', async ({ page }) => {
    const ref = stableCampaign(initial);
    const json = await H.searchCampaigns(page, ref.Name);
    expect(json.Items.map((/** @type {CampaignItem} */ c) => c.Id), `search "${ref.Name}" should return the reference campaign`).toContain(ref.Id);
    for (const item of json.Items) expect(item.Name.toLowerCase(), 'every result matches the search').toContain(ref.Name.toLowerCase());
    await expectGridShows(page, json);
    for (const name of await columnTexts(page, 2)) expect(name.toLowerCase()).toContain(ref.Name.toLowerCase());
    await expect(page.locator('tbody tr').filter({ has: page.locator('td:nth-child(1)', { hasText: H.exactText(ref.Code) }) })).toHaveCount(1);
  });

  test('CAM-03: Search By Code finds exactly the campaign with that code', async ({ page }) => {
    const ref = stableCampaign(initial);
    expect(await optionTexts(page, H.fieldSelect(page, 'Search By'))).toEqual(['Code', 'Name']);
    await H.chooseMatOption(page, H.fieldSelect(page, 'Search By'), 'Code');
    await H.campaignSearchInput(page).fill(ref.Code);
    const call = H.waitForApi(page, LIST_API, { body: (b) => b.includes(`"SearchString":"${ref.Code}"`) });
    await H.realClick(page, page.locator('button[mattooltip="Search"]').first());
    const response = await call;
    expect(JSON.parse(response.request().postData() || '{}').SearchBy).toBe('Code');
    const json = await response.json();
    await H.waitForSpinner(page);
    expect(json.Items.map((/** @type {CampaignItem} */ c) => c.Code)).toEqual([ref.Code]);
    await expectGridShows(page, json);
    await expect(page.locator('tbody tr td:nth-child(2)')).toHaveText(ref.Name);
  });

  test('CAM-04: Status filter offers the four statuses and returns only campaigns with the chosen status', async ({ page }) => {
    const status = H.fieldSelect(page, 'Status');
    expect(await optionTexts(page, status)).toEqual(['Approved', 'Pending', 'Rejected', 'Draft']);
    let json = await H.applySectionFilter(page, status, 'Approved', LIST_API, '"Status":"APPROVED"');
    expect(json.Items.length, 'the demo data has approved campaigns').toBeGreaterThan(0);
    expect(new Set(json.Items.map((/** @type {CampaignItem} */ c) => c.Status))).toEqual(new Set(['APPROVED']));
    await expectGridShows(page, json);
    expect(new Set(await columnTexts(page, 8))).toEqual(new Set(['APPROVED']));
    json = await H.applySectionFilter(page, status, 'Pending', LIST_API, '"Status":"PENDING"');
    for (const item of json.Items) expect(item.Status).toBe('PENDING');
    await expectGridShows(page, json);
  });

  test('CAM-05: Campaign Target Type filter returns only campaigns of the chosen target type', async ({ page }) => {
    const target = H.fieldSelect(page, 'Campaign Target Type');
    expect(await optionTexts(page, target)).toEqual(['All', 'Store', 'Chain']);
    for (const [option, value] of [['Store', 'STORE'], ['Chain', 'CHAIN'], ['All', 'ALL']]) {
      const json = await H.applySectionFilter(page, target, option, LIST_API, `"CampaignTargetType":"${value}"`);
      expect(json.Items.length, `the demo data has ${value} campaigns`).toBeGreaterThan(0);
      expect(new Set(json.Items.map((/** @type {CampaignItem} */ c) => c.CampaignTargetType)), `${option} filter`).toEqual(new Set([value]));
      await expectGridShows(page, json);
      expect(new Set(await columnTexts(page, 5))).toEqual(new Set([value]));
    }
  });

  test(`CAM-06: Zone filter (${H.TEST_ZONE}) returns only campaigns of that zone`, async ({ page }) => {
    const zone = H.fieldSelect(page, 'Select a Zone');
    const options = await optionTexts(page, zone);
    expect(options, `the zone filter offers ${H.TEST_ZONE}`).toContain(H.TEST_ZONE);
    const json = await H.applySectionFilter(page, zone, H.TEST_ZONE, LIST_API, /"ZoneId":"[0-9a-f]{24}"/);
    expect(json.Items.length, `the demo data has ${H.TEST_ZONE} campaigns`).toBeGreaterThan(0);
    const zoneIds = new Set();
    for (const item of json.Items) {
      const match = (item.Zones || []).find((/** @type {{Name: string}} */ z) => z.Name === H.TEST_ZONE);
      expect(match, `"${item.Name}" (${item.Code}) should be a ${H.TEST_ZONE} campaign`).toBeTruthy();
      zoneIds.add(match.Id);
    }
    expect(zoneIds.size).toBe(1);
    await expectGridShows(page, json);
  });

  test('CAM-07: Clear resets the search and every filter and reloads the unfiltered list', async ({ page }) => {
    const ref = stableCampaign(initial);
    await H.applySectionFilter(page, H.fieldSelect(page, 'Status'), 'Approved', LIST_API, '"Status":"APPROVED"');
    await H.applySectionFilter(page, H.fieldSelect(page, 'Campaign Target Type'), 'Store', LIST_API, '"CampaignTargetType":"STORE"');
    await H.campaignSearchInput(page).fill(ref.Name);
    const cleared = H.waitForApi(page, LIST_API, { body: (b) => b.includes('"SearchString":""') && b.includes('"Status":""') && b.includes('"CampaignTargetType":""') });
    await H.realClick(page, page.locator('button[mattooltip="Clear"]').first());
    const response = await cleared;
    const body = JSON.parse(response.request().postData() || '{}');
    expect(body.ZoneId).toBe('');
    expect(body.Page).toBe(1);
    await H.waitForSpinner(page);
    await expect(H.campaignSearchInput(page)).toHaveValue('');
    for (const label of ['Status', 'Campaign Target Type', 'Select a Zone']) {
      await expect(H.fieldSelect(page, label), `${label} is cleared`).toHaveText(/^\s*$/);
    }
    await expectGridShows(page, await response.json());
  });

  test('CAM-08: Grid view shows the campaigns as cards and the list view comes back', async ({ page }) => {
    const toGrid = page.locator('span.set-grid-icon').filter({ has: page.locator('mat-icon', { hasText: /^\s*dns\s*$/ }) });
    // The grid view reloads the list; use that response (campaigns of parallel runs come and go).
    const reload = H.waitForApi(page, LIST_API, { timeout: 20000 }).then((r) => r.json()).catch(() => null);
    await H.realClick(page, toGrid);
    await expect(page.locator('thead th')).toHaveCount(0, { timeout: 20000 });
    const shown = (await reload) || initial;
    await H.waitForSpinner(page);
    const first = shown.Items[0];
    const card = page.locator('div').filter({ hasText: first.Code }).filter({ hasText: 'BEARER PARTY' }).filter({ hasText: 'ALLOCATED BUDGET' }).last();
    await expect(card, `the card of ${first.Code} is shown`).toBeVisible({ timeout: 20000 });
    await expect(card).toContainText(first.Name);
    await expect(card).toContainText(first.Status);
    await expect(page.getByText('BEARER PARTY', { exact: true }), 'one card per campaign of the page').toHaveCount(shown.Items.length);
    const toList = page.locator('span.set-grid-icon').filter({ has: page.locator('mat-icon', { hasText: /^\s*grid_view\s*$/ }) });
    await H.realClick(page, toList);
    await expect(page.locator('thead th')).toHaveText(LIST_COLUMNS.map((t) => H.exactText(t)), { timeout: 20000 });
  });

  test('CAM-09: Pagination loads the next page and goes back to the first one', async ({ page }) => {
    expect(initial.TotalItemCount, 'more than one page of campaigns is needed').toBeGreaterThan(initial.PageSize);
    const next = H.waitForApi(page, LIST_API, { body: (b) => b.includes('"Page":2') });
    await H.realClick(page, page.locator('pagination-controls a').filter({ hasText: /Next/ }).first());
    const second = await (await next).json();
    await H.waitForSpinner(page);
    expect(second.PageNumber).toBe(2);
    await expectGridShows(page, second);
    expect(second.Items.map((/** @type {CampaignItem} */ c) => c.Id)).not.toContain(initial.Items[0].Id);
    await expect(page.locator('pagination-controls li.current')).toContainText('2');
    const prev = H.waitForApi(page, LIST_API, { body: (b) => b.includes('"Page":1') });
    await H.realClick(page, page.locator('pagination-controls a').filter({ hasText: /Prev/ }).first());
    const first = await (await prev).json();
    await H.waitForSpinner(page);
    expect(first.PageNumber).toBe(1);
    await expectGridShows(page, first);
    await expect(page.locator('pagination-controls li.current')).toContainText('1');
  });

  test('CAM-10: Global Filter page shows its filters and the free-delivery results of the API', async ({ page }) => {
    const { body, json } = await openGlobalFilter(page);
    expect(body.Type).toBe('FREE_DELIVERY');
    expect(body.Page).toBe(1);
    expect(body.StartDate).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    expect(body.EndDate).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    await expect(page.locator('mat-select[formcontrolname="Type"]')).toContainText('Free Delivery');
    expect(await optionTexts(page, page.locator('mat-select[formcontrolname="Type"]'))).toEqual(['Free Delivery', 'Promo', 'Offer']);
    expect(await optionTexts(page, page.locator('mat-select[formcontrolname="SearchBy"]'))).toEqual(['Store', 'Zone']);
    await expect(page.locator('mat-form-field').filter({ hasText: 'Search by Code' }).locator('input')).toHaveValue('');
    await expect(page.locator('thead th')).toHaveText(GF_COLUMNS.map((t) => H.exactText(t)));
    await expect(page.locator('tbody tr')).toHaveCount(json.Items.length, { timeout: 30000 });
    expect(await columnTexts(page, 1)).toEqual(json.Items.map((/** @type {{Code: string}} */ i) => i.Code));
    if (json.Items.length) {
      await expect(page.locator('tbody tr').first().locator('button[mattooltip="Navigate To Campaign"]')).toBeVisible();
      await expect(page.locator('tbody tr').first().locator('button[mattooltip="Navigate To Free Delivery"]')).toBeVisible();
    }
    // Back arrow returns to the Campaigns list.
    await H.realClick(page, page.locator('mat-icon').filter({ hasText: /^\s*arrow_back_ios\s*$/ }).first());
    await expect(H.campaignsHeading(page)).toBeVisible({ timeout: 30000 });
  });

  test('CAM-11: Global Filter type switch and code search return only matching records', async ({ page }) => {
    await openGlobalFilter(page);
    const type = page.locator('mat-select[formcontrolname="Type"]');
    const { json: promo } = await globalFilterPick(page, type, 'Promo', (b) => b.includes('"Type":"PROMO"'));
    expect(promo.Items.length, 'the demo data has promo codes').toBeGreaterThan(0);
    await expect(page.locator('tbody tr')).toHaveCount(promo.Items.length, { timeout: 30000 });
    const ref = promo.Items.find((/** @type {{Code: string}} */ i) => /^[A-Za-z0-9]{4,}$/.test(i.Code) && !/^(Q|DBG)/.test(i.Code)) || promo.Items[0];
    const codeInput = page.locator('mat-form-field').filter({ hasText: 'Search by Code' }).locator('input');
    await codeInput.fill(ref.Code);
    const { body, json } = await globalFilterSearch(page, (b) => b.includes(`"SearchText":"${ref.Code}"`));
    expect(body.Type).toBe('PROMO');
    expect(json.Items.map((/** @type {{Code: string}} */ i) => i.Code)).toContain(ref.Code);
    for (const item of json.Items) expect(item.Code.toLowerCase()).toContain(ref.Code.toLowerCase());
    await expect(page.locator('tbody tr')).toHaveCount(json.Items.length, { timeout: 30000 });
    const row = page.locator('tbody tr').filter({ has: page.locator('td:nth-child(1)', { hasText: H.exactText(ref.Code) }) });
    await expect(row.first()).toContainText(ref.CampaignInfo.Code);
    await expect(row.first().locator('button[mattooltip="Navigate To Promo Code"]')).toBeVisible();

    await codeInput.fill('');
    const { json: offer } = await globalFilterPick(page, type, 'Offer', (b) => b.includes('"Type":"OFFER"') && b.includes('"SearchText":""'));
    expect(offer.Items.length, 'the demo data has offers').toBeGreaterThan(0);
    await expect(page.locator('tbody tr')).toHaveCount(offer.Items.length, { timeout: 30000 });

    const cleared = H.waitForApi(page, GF_API, { body: (b) => b.includes('"SearchText":""') });
    await H.realClick(page, page.locator('button[mattooltip="Clear"]').first());
    await cleared;
    await H.waitForSpinner(page);
    await expect(codeInput).toHaveValue('');
  });

  test(`CAM-12: Global Filter Search By Store / Zone sends the chosen store (Food House) and zone (${H.TEST_ZONE})`, async ({ page }) => {
    await openGlobalFilter(page);
    const store = page.locator('mat-select[formcontrolname="StoreId"]');
    let request = await globalFilterPick(page, store, 'Food House', (b) => /"StoreId":"[0-9a-f]{24}"/.test(b));
    expect(request.body.StoreId).toMatch(/^[0-9a-f]{24}$/);
    expect(request.body.ZoneId).toBe('');
    await expect(page.locator('tbody tr')).toHaveCount(request.json.Items.length, { timeout: 30000 });

    await H.chooseMatOption(page, page.locator('mat-select[formcontrolname="SearchBy"]'), 'Zone');
    const zone = page.locator('mat-select[formcontrolname="ZoneId"]');
    await expect(zone).toBeVisible({ timeout: 10000 });
    request = await globalFilterPick(page, zone, H.TEST_ZONE, (b) => /"ZoneId":"[0-9a-f]{24}"/.test(b));
    expect(request.body.ZoneId).toMatch(/^[0-9a-f]{24}$/);
    await expect(page.locator('tbody tr')).toHaveCount(request.json.Items.length, { timeout: 30000 });
    await expect(zone).toContainText(H.TEST_ZONE);
  });
});
