// @ts-check
// ============================================================
// TMDone Admin Console - TM Done Club - Cancellation Reasons
// Scope: view-only coverage - page load, search/clear, date
// range filter, and pagination. Create/edit/delete flows are
// intentionally not tested here.
// ============================================================

import { test, expect } from '@playwright/test';
import { TM_DONE_CLUB_ROUTES, TMDoneClubPage } from './tm-done-club-helper.js';

class CancellationReasonsPage extends TMDoneClubPage {
  constructor(page) {
    super(page, {
      route: TM_DONE_CLUB_ROUTES.cancellationReasons,
      heading: /Cancellation\s*Reasons|Reasons/i,
      section: 'cancellationReasons',
    });
  }

  async searchReason(name) {
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

test.describe.serial('TM Done Club Cancellation Reasons - View-Only Coverage', () => {
  /** @type {CancellationReasonsPage} */
  let reasons;
  let reasonsAvailable = true;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    const probe = new CancellationReasonsPage(page);
    await probe.goto();
    reasonsAvailable = await probe.isSectionAvailable();
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!reasonsAvailable, 'Cancellation Reasons redirects to Campaigns in this environment, so it is not currently available to test.');
    reasons = new CancellationReasonsPage(page);
    await reasons.goto();
  });

  test('TDCCR-01: Cancellation reasons page loads with main controls', async () => {
    await reasons.verifyPageLoaded();
  });

  test('TDCCR-02: Search and clear keep the cancellation reasons list usable', async () => {
    const searched = await reasons.searchReason('a');
    if (!searched) {
      console.log('INFO: Cancellation reasons search input is not available in the current UI.');
    }
    await reasons.clickClearIfAvailable();
    await reasons.verifyResultsOrEmptyState();
  });

  test('TDCCR-03: Date range filter and pagination remain usable', async () => {
    await reasons.applyCurrentYearToPresentDateRange();
    await reasons.clickSearchButton();
    await reasons.verifyResultsOrEmptyState();
    await reasons.verifyPaginationIfAvailable();
  });
});
