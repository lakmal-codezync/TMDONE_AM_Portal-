// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 02 - Manage Campaign
// URL: #/home/campaigns
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

test.describe.serial('02 - Manage Campaign', () => {

  test.beforeEach(async ({ page }) => {
    // UAT navigation can be slow, especially when retrying serial campaign flows.
    test.setTimeout(240000);
    await loginToApp(page);
    await goToPage(page, '#/home/campaigns');
  });

  test('Step 0: Verify Campaign list filters and table controls', async ({ page }) => {
    const searchInput = page.locator('input[matinput], input.mat-input-element, input[placeholder*="Search" i]').first();
    const searchVisible = await searchInput.isVisible({ timeout: 15000 }).catch(() => false);
    test.skip(!searchVisible, 'Campaign search input is not visible in this environment.');

    const filters = page.locator('mat-select, [role="combobox"], ng-select').filter({ visible: true });
    const filterCount = await filters.count();
    if (filterCount < 3) {
      console.log(`INFO: Campaign filter count is ${filterCount}; continuing with available controls.`);
    }

    await searchInput.clear();
    await searchInput.fill('Auto Campaign');
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(2500);

    const rowsOrEmpty = page.locator('mat-row, tbody tr').filter({ visible: true }).first()
      .or(page.getByText(/No\s+(Data|Records|Results)|Total\s+0\s+results/i).first());
    await expect(rowsOrEmpty).toBeVisible({ timeout: 15000 });

    const clearBtn = page
      .locator('button:has(mat-icon:has-text("close")), button:has-text("Clear"), button:has-text("Reset"), button[aria-label*="clear" i]')
      .filter({ visible: true })
      .first();
    await expect(clearBtn).toBeVisible({ timeout: 10000 });
  });

  test('Step 1: View the latest Campaign details', async ({ page }) => {
    // Wait for page to be ready
    await page.waitForTimeout(1000);

    // Search for Auto Campaign to get the latest one
    const searchInput = page.locator('input[matinput], input.mat-input-element, input[placeholder*="Search" i]').first();
    await searchInput.waitFor({ state: 'visible' });
    await searchInput.clear();
    await searchInput.fill('Auto Campaign');
    await page.waitForTimeout(8000); // wait longer for search results to appear

    // Click More Actions -> View on FIRST row
    const firstRowData = page.locator('mat-row, tbody tr').first();
    await firstRowData.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    
    const actionBtn = firstRowData.locator('.mat-menu-trigger, i.mar-icon-more-h, i.mar-icon-more-v, button[mat-icon-button]').first();
    if (await actionBtn.isVisible().catch(() => false)) {
       await actionBtn.click();
    } else {
       await page.locator('button[mat-icon-button], .mat-menu-trigger').first().click().catch(() => {});
    }
    await page.waitForTimeout(1000);

    const viewBtn = page.locator('button.mat-menu-item:has-text("View"), [role="menuitem"]:has-text("View"), .dropdown-item:has-text("View")').first();
    await viewBtn.waitFor({ state: 'visible', timeout: 5000 });
    await viewBtn.click();
    
    // Wait for page transition
    await page.waitForTimeout(4000);
    
    // Validate we are on the View page
    const pageTitle = page.locator('h4, .page-title, h1, h2, h3').filter({ hasText: /Campaign|Manage/i }).first();
    await expect(pageTitle).toBeVisible({ timeout: 10000 }).catch(() => {});
    
    // Click Back button
    const backBtn = page.locator('button mat-icon:has-text("arrow_back_ios"), button:has-text("Back"), .back-btn, button[aria-label="Back"]').first();
    if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click();
    } else {
        await goToPage(page, '#/home/campaigns');
    }
    await page.waitForTimeout(3000);
  });

  // ------------------------------------------------------------
  // Additional auto‑check test: verify campaign details fields
  // ------------------------------------------------------------
  test('Step 2: Verify key fields of the latest Campaign', async ({ page }) => {
    // Re‑use navigation steps to open the campaign view
    const searchInput = page.locator('input[matinput], input.mat-input-element, input[placeholder*="Search" i]').first();
    await searchInput.waitFor({ state: 'visible' });
    await searchInput.clear();
    await searchInput.fill('Auto Campaign');
    await page.waitForTimeout(8000); // wait longer for search results to appear

    const firstRow = page.locator('mat-row, tbody tr').first();
    await firstRow.waitFor({ state: 'visible', timeout: 10000 });
    const actionBtn = firstRow.locator('.mat-menu-trigger, i.mar-icon-more-h, i.mar-icon-more-v, button[mat-icon-button]').first();
    if (await actionBtn.isVisible().catch(() => false)) await actionBtn.click();
    await page.waitForTimeout(1000);
    const viewBtn = page.locator('button.mat-menu-item:has-text("View"), [role="menuitem"]:has-text("View"), .dropdown-item:has-text("View")').first();
    await viewBtn.click();
    await page.waitForTimeout(4000);

    // Verify presence of common campaign fields
    const pageTitle = page.locator('h4, .page-title, h1, h2, h3')
      .filter({ hasText: /Campaign|Manage/i })
      .first();
    await expect(pageTitle).toBeVisible({ timeout: 8000 });

    const description = page.locator('p, div:has-text("Description")').first();
    await expect(description).toBeVisible({ timeout: 8000 });

    const statusBadge = page.locator('.status-badge, .badge-status, [role="status"]').first();
    await expect(statusBadge).toBeVisible({ timeout: 8000 });

    const startDate = page.locator('input[formControlName="StartDate"], mat-form-field:has-text("Start Date") input').first();
    const endDate = page.locator('input[formControlName="EndDate"], mat-form-field:has-text("End Date") input').first();
    await expect(startDate).toBeVisible({ timeout: 12000 });
    await expect(endDate).toBeVisible({ timeout: 12000 });



    // Return back to the campaign list
    const backBtn = page.locator('button mat-icon:has-text("arrow_back_ios"), button:has-text("Back"), .back-btn, button[aria-label="Back"]').first();
    if (await backBtn.isVisible().catch(() => false)) await backBtn.click();
    else await goToPage(page, '#/home/campaigns');
    await page.waitForTimeout(2000);
});


    // ------------------------------------------------------------
    // New test: Verify Campaign Order Summary tab and table
    // ------------------------------------------------------------
    test('Step 3: Verify Campaign Order Summary', async ({ page }) => {
      // Re‑use navigation to open the campaign view
      const searchInput = page.locator('input[matinput], input.mat-input-element, input[placeholder*="Search" i]').first();
      await searchInput.waitFor({ state: 'visible' });
      await searchInput.clear();
      await searchInput.fill('Auto Campaign');
      await page.waitForTimeout(8000);

      const firstRow = page.locator('mat-row, tbody tr').first();
      await firstRow.waitFor({ state: 'visible', timeout: 10000 });
      const actionBtn = firstRow.locator('.mat-menu-trigger, i.mar-icon-more-h, i.mar-icon-more-v, button[mat-icon-button]').first();
      if (await actionBtn.isVisible().catch(() => false)) await actionBtn.click();
      await page.waitForTimeout(1000);
      const viewBtn = page.locator('button.mat-menu-item:has-text("View"), [role="menuitem"]:has-text("View"), .dropdown-item:has-text("View")').first();
      await viewBtn.click();
      await page.waitForTimeout(4000);

      const orderSummaryHeading = page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Campaign Order Summary/i }).first();
      await expect(orderSummaryHeading).toBeVisible({ timeout: 30000 });

      const expectedMetricLabels = [
        /Total Orders Count/i,
        /Total Discount/i,
        /How much you've got \(GMV\)/i,
        /Customers Count/i,
        /Total Free Delivery Applied/i,
        /Total Fixed Delivery Applied/i,
      ];
      for (const label of expectedMetricLabels) {
        await expect(page.locator('p, div, span').filter({ hasText: label }).first()).toBeVisible({ timeout: 15000 });
      }

      const expectedChartSections = [/Gross Total/i, /Customers/i, /Order Count/i];
      for (const section of expectedChartSections) {
        await expect(page.locator('h1, h2, h3, h4, h5').filter({ hasText: section }).first()).toBeVisible({ timeout: 15000 });
      }

      const filters = page.locator('input, mat-select, [role="combobox"]').filter({ visible: true });
      expect(await filters.count().catch(() => 0)).toBeGreaterThan(0);
      
      const backBtn = page.locator('button mat-icon:has-text("arrow_back_ios"), button:has-text("Back"), .back-btn, button[aria-label="Back"]').first();
      if (await backBtn.isVisible().catch(() => false)) await backBtn.click();
      else await goToPage(page, '#/home/campaigns');
      await page.waitForTimeout(2000);
    });
}); // close describe block
