// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 02.4 - Campaign View -> Store Pinning
// URL: #/home/campaigns/store-spinnings/list?campaignId=...
// ------------------------------------------------------------
// Works only inside a campaign this file creates itself (unique run-stamped
// name, Colombo zone, test stores). The pinning pins the test store Food House
// in the Colombo zone; it has a unique run-stamped name and is located by that
// name. afterAll deletes leftovers and then the campaign.
// ============================================================

import { test, expect } from '@playwright/test';
import * as H from './helpers/campaignHelpers.js';

const RUN_STAMP = Date.now().toString().slice(-7);
const CAMPAIGN_NAME = `Auto Campaign SP ${RUN_STAMP}`;
const PIN_NAME = `QA Pin ${RUN_STAMP}`;
const EDITED_PIN_NAME = `QA Pin ${RUN_STAMP} Edited`;
const START_DATE = new Date();
const END_DATE = H.addDays(new Date(), 5);
const LIST_API = /api\/campaignStorePinnings\/list/;
const ZONE_CHECK_PIN_NAME = `QA Pin ${RUN_STAMP} Zone`;
const CARD_CHECK_PIN_NAME = `QA Pin ${RUN_STAMP} Card`;
const CHECKS_CAMPAIGN_NAME = `Auto Campaign SPC ${RUN_STAMP}`;
const SECTION = {
  section: 'Store Pinning',
  heading: /Store Pinning/,
  listApi: LIST_API,
  deleteApi: /api\/campaignStorePinnings\/(delete|remove)/i,
  deletedText: 'Store Pinning has been deleted.',
};

/** @param {import('@playwright/test').Page} page */
async function openPinningPage(page) {
  await H.gotoCampaignSection(page, CAMPAIGN_NAME, SECTION.section, SECTION.heading);
  await expect(H.sectionHeading(page)).toHaveText(/Campaigns\s*-\s*Store Pinning/);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function findPinRow(page, name) {
  const result = await H.searchSection(page, name, LIST_API);
  expect(result.Items.filter((/** @type {{Name: string}} */ i) => i.Name === name), `pinning "${name}" should be returned by the list API`).toHaveLength(1);
  const row = H.sectionRow(page, name);
  await expect(row).toHaveCount(1, { timeout: 20000 });
  return row;
}

/** Row date cell format: "12/10/2026 12:00: AM". @param {Date} date */
function pinDate(date) {
  return `${H.formatDDMMYYYY(date)} 12:00: AM`;
}

/** Date range shown on a pinning card: "12/10/2026 12:00: AM - 17/10/2026 12:00: AM". */
function cardDateRange() {
  return new RegExp(`${H.escapeRegex(pinDate(START_DATE))}\\s*-\\s*${H.escapeRegex(pinDate(END_DATE))}`);
}

/**
 * Creates a Store Pinning of Food House in the Colombo zone through the real
 * three-step dialog and verifies the add API call.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function createPin(page, name) {
    const dialog = await H.openSectionCreateDialog(page, 'Create Store Pinning', /Create Store Pinning/);
    await dialog.locator('input[formcontrolname="Name"]').fill(name);
    await H.fillDialogDates(page, dialog, START_DATE, END_DATE);
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Next\s*$/ }));
    await expect(dialog).toContainText(/\(2 of 3 Steps\)/, { timeout: 20000 });
    await expect(dialog).toContainText('Store Selection');
    const next = dialog.getByRole('button', { name: /^\s*Next\s*$/ });
    await expect(next, 'a store must be selected').toBeDisabled();
    await H.addToDualList(page, dialog, ['Food House']);
    const availability = H.waitForApi(page, /api\/campaignStorePinnings\/validatePinnedStoreAvailability/);
    await H.realClick(page, next);
    const availabilityBody = JSON.parse((await availability).request().postData() || '{}');
    expect(availabilityBody.StoreIds).toHaveLength(1);
    await expect(dialog).toContainText(/\(3 of 3 Steps\)/, { timeout: 20000 });
    await expect(dialog).toContainText('Pinning Type Selection');
    await expect(dialog).toContainText(/1\.\s*Food House/);
    const create = dialog.getByRole('button', { name: /^\s*Create\s*$/ });
    await expect(create).toBeDisabled();
    await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="Type"]'), 'Zone');
    await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="AreaZoneId"]'), H.TEST_ZONE);
    await expect(create).toBeEnabled({ timeout: 10000 });

    const addCall = H.waitForApi(page, /api\/campaignStorePinnings\/add/);
    await H.realClick(page, create);
    const response = await addCall;
    const text = await response.text();
    expect(response.status(), `campaignStorePinnings/add failed: ${text}`).toBe(200);
    expect(text).toContain('SUCCESS');
    const body = JSON.parse(response.request().postData() || '{}');
    expect(body.Name).toBe(name);
    expect(body.IsActive).toBe(true);
    expect(body.Stores).toHaveLength(1);
    expect(body.Stores[0].Type).toBe('ZONE');
    expect(body.Stores[0].SelectedZones).toHaveLength(1);
    expect(body.StartDate).toBe(`${H.formatApiDate(START_DATE).replace(/\//g, '-')} 00:00:00`);
    expect(body.EndDate).toBe(`${H.formatApiDate(END_DATE).replace(/\//g, '-')} 00:00:00`);
    await expect(dialog).toBeHidden({ timeout: 20000 });
}

test.describe.serial('02.4 - Campaign View Store Pinning', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300000);
    await H.createCampaignInFreshPage(browser, CAMPAIGN_NAME);
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(600000);
    await H.deleteSectionRowsIfPresent(browser, CAMPAIGN_NAME, SECTION, [PIN_NAME, EDITED_PIN_NAME]);
    await H.deleteCampaignIfPresent(browser, CAMPAIGN_NAME);
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000);
    await openPinningPage(page);
  });

  test('SP-00: Store Pinning page shows toolbar, store filter and an empty table', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create Store Pinning', exact: true })).toBeVisible();
    await expect(H.sectionSearchInput(page)).toBeVisible();
    await expect(page.locator('button[mattooltip="Search"]')).toBeVisible();
    await expect(page.locator('button[mattooltip="Clear"]')).toBeVisible();
    await expect(page.locator('thead th')).toHaveText(['Name', 'Start Date Time', 'End Date Time', 'Is Active', 'Actions'].map((t) => H.exactText(t)));
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.getByText('Total 0 results found')).toBeVisible();
    // The store filter offers exactly the campaign's stores.
    await H.realClick(page, page.locator('mat-select[formcontrolname="StoreId"]'));
    const panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
    await expect(panel.locator('mat-option').filter({ hasText: /\S/ })).toHaveText([...H.TEST_STORES].sort().map((t) => H.exactText(t)));
    await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } });
    await expect(panel).toBeHidden();
  });

  test('SP-01: Create Store Pinning dialog starts at Basic Information and closes without saving', async ({ page }) => {
    const addCalls = [];
    page.on('request', (r) => { if (/api\/campaignStorePinnings\/add/.test(r.url())) addCalls.push(r.url()); });
    const dialog = await H.openSectionCreateDialog(page, 'Create Store Pinning', /Create Store Pinning/);
    await expect(dialog).toContainText(/\(1 of 3 Steps\)/);
    await expect(dialog).toContainText('Basic Information');
    const next = dialog.getByRole('button', { name: /^\s*Next\s*$/ });
    await expect(next).toBeDisabled();
    await expect(dialog.locator('input[formcontrolname="StartTime"]')).toHaveValue('12:00 AM');
    await expect(dialog.locator('input[formcontrolname="EndTime"]')).toHaveValue('12:00 AM');
    await expect(dialog.locator('mat-select[formcontrolname="OperationalDay"]')).toContainText('All Days');
    await dialog.locator('input[formcontrolname="Name"]').fill(PIN_NAME);
    await expect(next, 'dates are still required').toBeDisabled();
    await H.closeDialogWithX(page, dialog);
    expect(addCalls, 'Closing the dialog must not create a pinning').toHaveLength(0);
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('SP-02: Create a Store Pinning for Food House in the Colombo zone and show it as a card', async ({ page }) => {
    await createPin(page, PIN_NAME);
    const row = await findPinRow(page, PIN_NAME);
    await expect(row.locator('td').nth(1)).toHaveText(pinDate(START_DATE));
    await expect(row.locator('td').nth(2)).toHaveText(pinDate(END_DATE));
    await expect(row.locator('td').nth(3).locator('mat-slide-toggle')).toHaveClass(/mat-checked/);
    // The (searched) pinning is shown as a card; the card carries no name (see SP-08), so
    // it is identified by its date range.
    await H.checkSectionGridView(page, PIN_NAME, cardDateRange());
  });

  test('SP-03: Edit dialog shows the saved pinning across its three steps', async ({ page }) => {
    const row = await findPinRow(page, PIN_NAME);
    const panel = await H.openRowMenu(page, row);
    expect(await H.menuLabels(panel)).toEqual(['Edit', 'Delete']);
    await H.clickMenuItem(page, panel, 'Edit');
    const dialog = H.campaignDialog(page).filter({ hasText: 'Edit Store Pinning' });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog.locator('input[formcontrolname="Name"]')).toHaveValue(PIN_NAME);
    await expect(dialog.locator('input[formcontrolname="StartDate"]')).toHaveValue(H.formatDDMMYYYY(START_DATE));
    await expect(dialog.locator('input[formcontrolname="EndDate"]')).toHaveValue(H.formatDDMMYYYY(END_DATE));
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Next\s*$/ }));
    await expect(dialog).toContainText(/\(2 of 3 Steps\)/, { timeout: 20000 });
    await expect(dialog.locator('dual-list .listbox').nth(1).locator('li').filter({ hasText: H.exactText('Food House') })).toHaveCount(1, { timeout: 20000 });
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Next\s*$/ }));
    await expect(dialog).toContainText(/\(3 of 3 Steps\)/, { timeout: 20000 });
    await expect(dialog).toContainText(/1\.\s*Food House/);
    await expect(dialog.locator('mat-select[formcontrolname="Type"]')).toContainText('Zone');
    // The saved zone is checked separately in SP-07 (known defect).
    await H.closeDialogWithX(page, dialog);
  });

  test('SP-04: Edit the pinning name', async ({ page }) => {
    const row = await findPinRow(page, PIN_NAME);
    const panel = await H.openRowMenu(page, row);
    await H.clickMenuItem(page, panel, 'Edit');
    const dialog = H.campaignDialog(page).filter({ hasText: 'Edit Store Pinning' });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    const nameInput = dialog.locator('input[formcontrolname="Name"]');
    // Wait until the saved record is loaded into the form before editing it.
    await expect(nameInput).toHaveValue(PIN_NAME, { timeout: 20000 });
    await expect(dialog.locator('input[formcontrolname="EndDate"]')).toHaveValue(H.formatDDMMYYYY(END_DATE));
    await nameInput.fill(EDITED_PIN_NAME);
    await nameInput.blur();
    await expect(nameInput).toHaveValue(EDITED_PIN_NAME);
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Next\s*$/ }));
    await expect(dialog).toContainText(/\(2 of 3 Steps\)/, { timeout: 20000 });
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Next\s*$/ }));
    await expect(dialog).toContainText(/\(3 of 3 Steps\)/, { timeout: 20000 });
    // The edit form does not restore the saved zone (SP-07), so pick it again.
    await H.chooseMatOption(page, dialog.locator('mat-select[formcontrolname="AreaZoneId"]'), H.TEST_ZONE);
    const submit = dialog.locator('button').filter({ hasText: /^\s*(Update|Edit|Save|Edit Store Pinning)\s*$/ }).last();
    await expect(submit).toBeEnabled({ timeout: 10000 });
    const update = H.waitForApi(page, /api\/campaignStorePinnings\/(update|edit)/i);
    await H.realClick(page, submit);
    const response = await update;
    const text = await response.text();
    expect(response.status(), `store pinning update failed: ${text}`).toBe(200);
    expect(text).toContain('SUCCESS');
    const body = JSON.parse(response.request().postData() || '{}');
    expect(body.Name).toBe(EDITED_PIN_NAME);
    expect(body.Stores).toHaveLength(1);
    expect(body.Stores[0].Type).toBe('ZONE');
    expect(body.Stores[0].SelectedZones).toHaveLength(1);
    await expect(dialog).toBeHidden({ timeout: 20000 });
    await findPinRow(page, EDITED_PIN_NAME);
    const old = await H.searchSection(page, PIN_NAME, LIST_API);
    expect(old.Items.filter((/** @type {{Name: string}} */ i) => i.Name === PIN_NAME)).toHaveLength(0);
  });

  test('SP-05: Delete the pinning (cancel first, then confirm)', async ({ page }) => {
    const row = await findPinRow(page, EDITED_PIN_NAME);
    await H.cancelSectionRowDelete(page, row, SECTION.deleteApi);
    await H.deleteSectionRow(page, row, SECTION.deleteApi, SECTION.deletedText);
    const after = await H.searchSection(page, EDITED_PIN_NAME, LIST_API);
    expect(after.Items.filter((/** @type {{Name: string}} */ i) => i.Name === EDITED_PIN_NAME)).toHaveLength(0);
    await expect(H.sectionRow(page, EDITED_PIN_NAME)).toHaveCount(0);
  });
});

// Checks of known defects live in their own (non-serial) group with their own
// campaign, so that a failure here never blocks the lifecycle above or each other.
test.describe('02.4 - Store Pinning filter and edit-form checks', () => {
  // Known product defects fail deterministically; a retry would only create (and
  // clean up) one more campaign.
  test.describe.configure({ retries: 0 });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300000);
    await H.createCampaignInFreshPage(browser, CHECKS_CAMPAIGN_NAME);
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(600000);
    await H.deleteSectionRowsIfPresent(browser, CHECKS_CAMPAIGN_NAME, SECTION, [ZONE_CHECK_PIN_NAME, CARD_CHECK_PIN_NAME]);
    await H.deleteCampaignIfPresent(browser, CHECKS_CAMPAIGN_NAME);
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000);
    await H.gotoCampaignSection(page, CHECKS_CAMPAIGN_NAME, SECTION.section, SECTION.heading);
  });

  test('SP-06: Store filter keeps the selected store and sends it to the list API', async ({ page }) => {
    const storeFilter = page.locator('mat-select[formcontrolname="StoreId"]');
    await H.chooseMatOption(page, storeFilter, 'Food House');
    const request = H.waitForApi(page, LIST_API);
    await H.realClick(page, page.locator('button[mattooltip="Search"]').first());
    const response = await request;
    const body = JSON.parse(response.request().postData() || '{}');
    // Known defect (2026-10-12): after picking a store the select shows nothing and
    // campaignStorePinnings/list is sent WITHOUT a StoreId, so the filter is ignored.
    expect(body.StoreId, `Store filter is not applied: campaignStorePinnings/list was sent without a StoreId (${response.request().postData()})`).toBeTruthy();
    await expect(storeFilter, 'the selected store should stay shown in the filter').toContainText('Food House');
  });

  test('SP-07: Edit dialog restores the saved pinning zone', async ({ page }) => {
    await createPin(page, ZONE_CHECK_PIN_NAME);
    const row = await findPinRow(page, ZONE_CHECK_PIN_NAME);
    const panel = await H.openRowMenu(page, row);
    await H.clickMenuItem(page, panel, 'Edit');
    const dialog = H.campaignDialog(page).filter({ hasText: 'Edit Store Pinning' });
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Next\s*$/ }));
    await expect(dialog).toContainText(/\(2 of 3 Steps\)/, { timeout: 20000 });
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Next\s*$/ }));
    await expect(dialog).toContainText(/\(3 of 3 Steps\)/, { timeout: 20000 });
    const zoneSelect = dialog.locator('mat-select[formcontrolname="AreaZoneId"]');
    const zoneText = ((await zoneSelect.innerText()) || '').replace(/\s+/g, ' ').trim();
    await H.closeDialogWithX(page, dialog);
    await H.deleteSectionRow(page, await findPinRow(page, ZONE_CHECK_PIN_NAME), SECTION.deleteApi, SECTION.deletedText);
    // Known defect (2026-10-12): the zone select of the Edit dialog shows "Select Select"
    // and no option is selected, although the pinning was saved with the Colombo zone.
    expect(zoneText, `Edit Store Pinning step 3 does not restore the saved zone "${H.TEST_ZONE}" (select shows "${zoneText}")`).toContain(H.TEST_ZONE);
  });

  test('SP-08: Card view shows the pinning name and its pinning type', async ({ page }) => {
    await createPin(page, CARD_CHECK_PIN_NAME);
    const json = await H.searchSection(page, CARD_CHECK_PIN_NAME, LIST_API);
    expect(json.Items.map((/** @type {{Name: string}} */ i) => i.Name)).toEqual([CARD_CHECK_PIN_NAME]);
    await expect(H.sectionRow(page, CARD_CHECK_PIN_NAME)).toHaveCount(1, { timeout: 20000 });
    const toggle = page.locator('mat-icon[mattooltip="Change View"]').first();
    await H.realClick(page, toggle);
    await expect(page.locator('tbody tr')).toHaveCount(0, { timeout: 15000 });
    const card = page.locator('div').filter({ hasText: cardDateRange() }).filter({ hasText: 'Is Active' }).last();
    await expect(card, 'the searched pinning is shown as a card').toBeVisible({ timeout: 15000 });
    const cardText = ((await card.innerText()) || '').replace(/\s+/g, ' ').trim();
    await H.realClick(page, toggle);
    await H.deleteSectionRow(page, await findPinRow(page, CARD_CHECK_PIN_NAME), SECTION.deleteApi, SECTION.deletedText);
    // Known defect (2026-10-12): the card shows dates, status and "Is Active" but no name, and its
    // "Type" label is empty although the pinning was saved with type ZONE.
    expect(cardText, `the pinning card does not show the pinning name (card text: "${cardText}")`).toContain(CARD_CHECK_PIN_NAME);
    expect(cardText, `the pinning card shows an empty Type (card text: "${cardText}")`).toMatch(/Type\s*Zone/i);
  });
});
