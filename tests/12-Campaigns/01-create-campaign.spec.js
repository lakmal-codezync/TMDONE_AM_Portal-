// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 01 - Create Campaign
// URL: #/home/campaigns
// ------------------------------------------------------------
// A-Z lifecycle on a test-owned campaign: required-field validation ->
// create (2-step dialog, Colombo zone, test stores) -> verify in the list ->
// delete. The campaign is located by its unique run-stamped name only and is
// removed again by the afterAll safety net if any step fails.
// ============================================================

import { test, expect } from '@playwright/test';
import * as H from './helpers/campaignHelpers.js';

const CAMPAIGN_NAME = `Auto Campaign ${Date.now()}`;
const CAMPAIGN_BUDGET = '50';
const CAMPAIGN_DESCRIPTION = 'Full CRUD test campaign created by Playwright';
const START_DATE = new Date();
const END_DATE = H.addMonths(START_DATE, 1);

test.describe.serial('01 - Create Campaign', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    await H.openCampaignsList(page);
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(300000);
    await H.deleteCampaignIfPresent(browser, CAMPAIGN_NAME);
  });

  test('Step 0: Validate required fields on Create Campaign dialog', async ({ page }) => {
    const addCalls = [];
    page.on('request', (request) => {
      if (/api\/campaign\/addCampaign/.test(request.url())) addCalls.push(request.url());
    });

    const dialog = await H.openCreateCampaignDialog(page);
    const nameInput = dialog.locator('input[formcontrolname="Name"]');
    const next = dialog.getByRole('button', { name: /^\s*Next\s*$/ });

    // Every field of step 1 is present.
    for (const control of ['input[formcontrolname="Name"]', 'mat-select[formcontrolname="CampaignTargetType"]',
      'input[formcontrolname="Budget"]', 'input[formcontrolname="StartDate"]', 'input[formcontrolname="EndDate"]',
      'mat-select[formcontrolname="Zones"]', 'textarea[formcontrolname="Description"]', 'mat-select[formcontrolname="BearerParty"]']) {
      await expect(dialog.locator(control), `${control} should be on step 1`).toBeVisible();
    }
    await expect(dialog.locator('mat-select[formcontrolname="BearerParty"]')).toContainText('Tmdone');

    // Empty form: Next is disabled and touching Name shows its required error.
    await expect(next).toBeDisabled();
    await nameInput.click();
    await dialog.locator('textarea[formcontrolname="Description"]').click();
    await expect(dialog.locator('mat-error').filter({ hasText: 'Name is required' })).toBeVisible();

    // A name alone is not enough (target type and dates are also required).
    await nameInput.fill(`${CAMPAIGN_NAME} (not saved)`);
    await expect(dialog.locator('mat-error').filter({ hasText: 'Name is required' })).toHaveCount(0);
    await expect(next).toBeDisabled();

    // Closing the dialog discards it without any create call.
    await H.realClick(page, dialog.locator('mat-icon').filter({ hasText: /^close$/ }).first());
    await expect(dialog).toBeHidden({ timeout: 10000 });
    expect(addCalls, 'Closing the dialog must not create a campaign').toHaveLength(0);
  });

  test('Step 1: Create a new Campaign (2-step flow)', async ({ page }) => {
    const body = await H.createCampaign(page, {
      name: CAMPAIGN_NAME,
      budget: CAMPAIGN_BUDGET,
      description: CAMPAIGN_DESCRIPTION,
      startDate: START_DATE,
      endDate: END_DATE,
    });
    const ymd = (/** @type {Date} */ d) => H.formatDDMMYYYY(d).split('/').reverse().join('/');
    expect(body.Description).toBe(CAMPAIGN_DESCRIPTION);
    expect(String(body.Budget)).toBe(CAMPAIGN_BUDGET);
    expect(body.StartDate).toBe(ymd(START_DATE));
    expect(body.EndDate).toBe(ymd(END_DATE));
    expect(body.BearerParty).toBe('TMDONE');
  });

  test('Step 2: Verify created Campaign exists in list', async ({ page }) => {
    const result = await H.searchCampaigns(page, CAMPAIGN_NAME);
    const item = result.Items.find((/** @type {{Name: string}} */ c) => c.Name === CAMPAIGN_NAME);
    expect(item, 'getCampignList should return the created campaign').toBeTruthy();

    const row = H.campaignRow(page, CAMPAIGN_NAME);
    await expect(row).toHaveCount(1);
    const cells = row.locator('td');
    await expect(cells.nth(0)).toHaveText(/^\s*TMC\d+\s*$/);
    await expect(cells.nth(2)).toHaveText(H.formatDDMMYYYY(START_DATE));
    await expect(cells.nth(3)).toHaveText(H.formatDDMMYYYY(END_DATE));
    await expect(cells.nth(4)).toHaveText('STORE');
    await expect(cells.nth(5)).toHaveText(CAMPAIGN_BUDGET);
    await expect(cells.nth(6)).toHaveText('TMDONE');
    await expect(cells.nth(7)).toHaveText('APPROVED');
  });

  test('Step 3: Delete the created Campaign', async ({ page }) => {
    await H.deleteCampaign(page, CAMPAIGN_NAME);
  });
});
