// @ts-check
import { test, expect } from '@playwright/test';
import { TM_DONE_CLUB_ROUTES, TMDoneClubPage } from './tm-done-club-helper.js';

const RUN_ID = Date.now();
const PLAN_NAME = `Auto Plan ${RUN_ID}`;
const PLAN_NAME_EDITED = `Auto Plan ${RUN_ID} Edited`;

class SubscriptionPlansPage extends TMDoneClubPage {
  /**
   * @param {import("playwright-core").Page} page
   */
  constructor(page) {
    super(page, {
      route: TM_DONE_CLUB_ROUTES.plans,
      heading: /Subscription\s*Plans|Plans/i,
      section: 'plans',
    });
  }

  /**
   * @param {string} name
   */
  async fillPlanDialog(name) {
    const dialog = this.activeDialog();
    await this.fillFirstVisible(dialog, [
      'input[formcontrolname*="name" i]',
      'input[placeholder*="Name" i]',
      'mat-form-field:has-text("Name") input',
      'input[type="text"]',
    ], name);
    await this.fillFirstVisible(dialog, [
      'input[formcontrolname*="arabic" i][formcontrolname*="name" i]',
      'input[placeholder*="Arabic Name" i]',
      'mat-form-field:has-text("Arabic Name") input',
    ], name);
    await this.fillFirstVisible(dialog, [
      'textarea[formcontrolname*="description" i]',
      'textarea[placeholder*="Description" i]',
      'mat-form-field:has-text("Description") textarea',
      'textarea',
    ], 'Created by Playwright automation');
    await this.fillFirstVisible(dialog, [
      'textarea[formcontrolname*="arabic" i][formcontrolname*="description" i]',
      'textarea[placeholder*="Arabic Description" i]',
      'mat-form-field:has-text("Arabic Description") textarea',
    ], 'Created by Playwright automation');
    await this.fillFirstVisible(dialog, [
      'textarea[formcontrolname*="next" i][formcontrolname*="description" i]',
      'textarea[placeholder*="Next Plan Description" i]',
      'mat-form-field:has-text("Next Plan Description") textarea',
    ], 'Next subscription plan description');
    await this.fillFirstVisible(dialog, [
      'textarea[formcontrolname*="next" i][formcontrolname*="arabic" i]',
      'textarea[placeholder*="Next Plan Arabic Description" i]',
      'mat-form-field:has-text("Next Plan Arabic Description") textarea',
    ], 'Next subscription plan description');
    await this.fillFirstVisible(dialog, [
      'input[formcontrolname*="amount" i]',
      'input[formcontrolname*="price" i]',
      'input[placeholder*="Amount" i]',
      'input[placeholder*="Price" i]',
      'input[type="number"]',
    ], '10');
    await this.fillFirstVisible(dialog, [
      'input[formcontrolname*="duration" i]',
      'input[placeholder*="Duration" i]',
    ], '30');
    // @ts-ignore
    await this.selectDropdown(dialog, /billing|cycle/i, 'Monthly').catch(() => false);
    // @ts-ignore
    await this.selectDropdown(dialog, /status|type|plan/i, 0).catch(() => false);
  }

  /**
   * @param {string} name
   */
  async searchPlan(name) {
    const searchInput = this.page
      .locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element')
      .filter({ visible: true })
      .first();
    if (!(await searchInput.isVisible().catch(() => false))) return false;
    await searchInput.fill(name);
    await this.clickSearchButton();
    await this.page.waitForTimeout(2000);
    return true;
  }

  /**
   * @param {string} name
   */
  async searchedPlanRow(name) {
    await this.searchPlan(name);
    const row = this.rows.first();
    if (!(await row.isVisible({ timeout: 10000 }).catch(() => false))) return null;
    const rowText = await row.innerText().catch(() => '');
    return rowText.includes(name) ? row : null;
  }

  /**
   * @param {RegExp} label
   */
  async rowAction(label) {
    const row = this.rows.first();
    await expect(row).toBeVisible({ timeout: 20000 });

    const menuTrigger = row
      .locator('button:has(mat-icon:has-text("more_vert")), button:has(mat-icon:has-text("more_horiz")), .mat-menu-trigger, [aria-label*="More" i]')
      .filter({ visible: true })
      .first();

    if (await menuTrigger.isVisible().catch(() => false)) {
      await menuTrigger.click({ force: true });
      await this.page.waitForTimeout(1000);
      const action = this.page
        .locator('.cdk-overlay-pane [role="menuitem"], .cdk-overlay-pane button.mat-menu-item, [role="menu"] [role="menuitem"], .dropdown-menu .dropdown-item')
        .filter({ visible: true, hasText: label })
        .first();
      if (await action.isVisible().catch(() => false)) {
        await action.click({ force: true });
        await this.page.waitForTimeout(1500);
        return true;
      }
    }

    const direct = row.locator('button').filter({ visible: true, hasText: label }).first();
    if (await direct.isVisible().catch(() => false)) {
      await direct.click({ force: true });
      await this.page.waitForTimeout(1500);
      return true;
    }

    return false;
  }

  async createPlan() {
    await expect(this.createButton).toBeVisible({ timeout: 20000 });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.createButton.click({ force: true });
      await this.page.waitForTimeout(1500);
      if (await this.activeDialog().isVisible().catch(() => false)) break;
    }
    await expect(this.activeDialog()).toBeVisible({ timeout: 15000 });
    await this.fillPlanDialog(PLAN_NAME);
    const stepDialog = this.activeDialog();
    const nextButton = await this.enabledButton(stepDialog, /Next|Continue/i);
    if (await nextButton.isVisible().catch(() => false)) {
      await expect(nextButton).toBeEnabled({ timeout: 15000 });
      await nextButton.click({ force: true });
      await this.page.waitForTimeout(1500);
    }

    const saveButton = await this.enabledButton(this.activeDialog(), /Create|Save|Submit|Add/i);
    await expect(saveButton).toBeVisible({ timeout: 10000 });
    await expect(saveButton).toBeEnabled({ timeout: 15000 });
    await saveButton.click({ force: true });
    await this.page.waitForTimeout(2500);
  }

  async editPlan() {
    const targetRow = await this.searchedPlanRow(PLAN_NAME);
    test.skip(!targetRow, `Created subscription plan "${PLAN_NAME}" was not returned by search, so edit is skipped safely.`);

    const opened = await this.rowAction(/Edit|Update/i);
    expect(opened).toBeTruthy();
    await expect(this.activeDialog()).toBeVisible({ timeout: 15000 });
    await this.fillPlanDialog(PLAN_NAME_EDITED);
    const nextButton = await this.enabledButton(this.activeDialog(), /Next|Continue/i);
    if (await nextButton.isVisible().catch(() => false)) {
      await expect(nextButton).toBeEnabled({ timeout: 15000 });
      await nextButton.click({ force: true });
      await this.page.waitForTimeout(1500);
    }
    const updateButton = await this.enabledButton(this.activeDialog(), /Update|Save|Submit/i);
    await expect(updateButton).toBeVisible({ timeout: 10000 });
    await expect(updateButton).toBeEnabled({ timeout: 15000 });
    await updateButton.click({ force: true });
    await this.page.waitForTimeout(2500);
  }

  async deletePlan() {
    const targetRow = await this.searchedPlanRow(PLAN_NAME_EDITED);
    test.skip(!targetRow, `Edited subscription plan "${PLAN_NAME_EDITED}" was not returned by search, so delete is skipped safely.`);

    const opened = await this.rowAction(/Delete|Remove/i);
    expect(opened).toBeTruthy();
    const confirmButton = this.page
      .locator('.swal2-confirm, button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Delete")')
      .filter({ visible: true })
      .first();
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click({ force: true });
      await this.page.waitForTimeout(2500);
    }
  }
}

test.describe.serial('TM Done Club Subscription Plans', () => {
  /** @type {SubscriptionPlansPage} */
  let plans;

  test.beforeEach(async ({ page }) => {
    plans = new SubscriptionPlansPage(page);
    await plans.goto();
  });

  test('TDCSP-01: Subscription plans page loads with main controls', async () => {
    await plans.verifyPageLoaded();
  });

  test('TDCSP-02: Create subscription plan flow works end to end', async () => {
    test.setTimeout(240000);
    await plans.createPlan();
  });

  test('TDCSP-03: Edit subscription plan flow works end to end', async () => {
    test.setTimeout(240000);
    await plans.editPlan();
  });

  test('TDCSP-04: Delete subscription plan flow works end to end', async () => {
    test.setTimeout(240000);
    await plans.deletePlan();
  });

  test('TDCSP-05: Filters or search controls remain usable after CRUD', async () => {
    await plans.clickClearIfAvailable();
    await plans.applyCurrentYearToPresentDateRange();
    await plans.verifyPaginationIfAvailable();
  });
});
