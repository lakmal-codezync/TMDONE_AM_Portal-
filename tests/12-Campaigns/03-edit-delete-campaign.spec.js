// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 03 - Edit & Delete Campaign
// URL: #/home/campaigns
// ------------------------------------------------------------
// Works only on a campaign this file creates itself (unique run-stamped name):
// cancel-delete -> edit (name, budget, description; stores kept) -> verify ->
// delete -> verify gone. afterAll removes the campaign (original or edited
// name) if any step fails.
// ============================================================

import { test, expect } from '@playwright/test';
import * as H from './helpers/campaignHelpers.js';

const RUN_STAMP = Date.now();
const CAMPAIGN_NAME = `Auto Campaign ED ${RUN_STAMP}`;
const EDITED_NAME = `${CAMPAIGN_NAME} Edited`;
const EDITED_BUDGET = '75';
const EDITED_DESCRIPTION = `Updated by Playwright - ${RUN_STAMP}`;

test.describe.serial('03 - Edit & Delete Campaign', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300000);
    await H.createCampaignInFreshPage(browser, CAMPAIGN_NAME);
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(300000);
    await H.deleteCampaignIfPresent(browser, CAMPAIGN_NAME);
    await H.deleteCampaignIfPresent(browser, EDITED_NAME);
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    await H.openCampaignsList(page);
  });

  test('Step 0: Delete confirmation can be cancelled safely', async ({ page }) => {
    const deleteCalls = [];
    page.on('request', (request) => {
      if (/api\/campaign\/delete\//.test(request.url())) deleteCalls.push(request.url());
    });

    const panel = await H.openCampaignMenu(page, CAMPAIGN_NAME);
    await H.clickMenuItem(page, panel, 'Delete');
    const popup = H.swalPopup(page);
    await expect(popup).toContainText('Are you sure?', { timeout: 15000 });
    const cancel = popup.locator('button.swal2-cancel');
    await expect(cancel).toBeVisible();
    await H.realClick(page, cancel);
    await expect(popup).toBeHidden({ timeout: 10000 });

    expect(deleteCalls, 'Cancelling must not call the delete API').toHaveLength(0);
    await H.findCampaignRow(page, CAMPAIGN_NAME);
  });

  test('Step 1: Edit the Campaign', async ({ page }) => {
    const panel = await H.openCampaignMenu(page, CAMPAIGN_NAME);
    await H.clickMenuItem(page, panel, 'Edit');
    const dialog = H.campaignDialog(page);
    await expect(dialog).toContainText(/Edit Campaign\s*\(1 of 2 Steps\)/, { timeout: 20000 });

    // Step 1 is prefilled with the values the campaign was created with.
    const nameInput = dialog.locator('input[formcontrolname="Name"]');
    await expect(nameInput).toHaveValue(CAMPAIGN_NAME);
    await expect(dialog.locator('input[formcontrolname="Budget"]')).toHaveValue('50');
    await expect(dialog.locator('input[formcontrolname="StartDate"]')).toHaveValue(H.formatDDMMYYYY(new Date()));
    await expect(dialog.locator('mat-select[formcontrolname="CampaignTargetType"]')).toContainText('Store');
    await expect(dialog.locator('mat-select[formcontrolname="Zones"]')).toContainText(H.TEST_ZONE);

    await nameInput.fill(EDITED_NAME);
    await dialog.locator('input[formcontrolname="Budget"]').fill(EDITED_BUDGET);
    await dialog.locator('textarea[formcontrolname="Description"]').fill(EDITED_DESCRIPTION);

    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Next\s*$/ }));
    await expect(dialog).toContainText(/Edit Campaign\s*\(2 of 2 Steps\)/, { timeout: 20000 });
    const selected = dialog.locator('dual-list .listbox').nth(1);
    for (const store of H.TEST_STORES) {
      await expect(selected.locator('li').filter({ hasText: H.exactText(store) }), `${store} should still be selected`).toHaveCount(1, { timeout: 20000 });
    }

    const updateCall = H.waitForApi(page, /api\/campaign\/(update|edit)/i);
    await H.realClick(page, dialog.getByRole('button', { name: /^\s*Edit Campaign\s*$/ }));
    const response = await updateCall;
    const responseText = await response.text();
    expect(response.status(), `campaign update failed: ${responseText}`).toBe(200);
    const body = JSON.parse(response.request().postData() || '{}');
    expect(body.Name).toBe(EDITED_NAME);
    expect(String(body.Budget)).toBe(EDITED_BUDGET);
    expect(body.Description).toBe(EDITED_DESCRIPTION);
    expect(responseText).toContain('SUCCESS');
    await H.expectSuccessSwal(page, 'Campaign Edited Successfully');
    await expect(dialog).toBeHidden({ timeout: 20000 });

    // The list now shows the edited values and the old name is gone.
    const row = await H.findCampaignRow(page, EDITED_NAME);
    await expect(row.locator('td').nth(5)).toHaveText(EDITED_BUDGET);
    const old = await H.searchCampaigns(page, CAMPAIGN_NAME);
    expect(old.Items.filter((/** @type {{Name: string}} */ c) => c.Name === CAMPAIGN_NAME)).toHaveLength(0);
  });

  test('Step 2: Delete the Campaign', async ({ page }) => {
    await H.deleteCampaign(page, EDITED_NAME);
  });
});
