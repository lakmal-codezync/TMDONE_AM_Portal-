// @ts-check
// ============================================================
// TMDone Admin Console - TM Done Club - Subscription Plans
// Scope: view-only coverage - page load, search/clear, date
// range filter, and pagination. Create/edit/delete flows are
// intentionally not tested here.
// ============================================================

import { test, expect } from '@playwright/test';
import { TM_DONE_CLUB_ROUTES, TMDoneClubPage } from './tm-done-club-helper.js';

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
}

test.describe.serial('TM Done Club Subscription Plans - View-Only Coverage', () => {
  /** @type {SubscriptionPlansPage} */
  let plans;

  test.beforeEach(async ({ page }) => {
    plans = new SubscriptionPlansPage(page);
    await plans.goto();
  });

  test('TDCSP-01: Subscription plans page loads with main controls', async () => {
    await plans.verifyPageLoaded();
  });

  test('TDCSP-02: Search and clear keep the subscription plans list usable', async () => {
    const searched = await plans.searchPlan('a');
    if (!searched) {
      console.log('INFO: Subscription plans search input is not available in the current UI.');
    }
    await plans.clickClearIfAvailable();
    await plans.verifyResultsOrEmptyState();
  });

  test('TDCSP-03: Date range filter and pagination remain usable', async () => {
    await plans.applyCurrentYearToPresentDateRange();
    await plans.clickSearchButton();
    await plans.verifyResultsOrEmptyState();
    await plans.verifyPaginationIfAvailable();
  });
});
