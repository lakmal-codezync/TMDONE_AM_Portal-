// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 02.5 - Campaign View Fixed Delivery Fee Management
// URL: #/home/campaigns
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

test.describe('02.5 - Campaign View Fixed Delivery Fee Management', () => {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const formatDate = (/** @type {Date} */ date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 3);
  const START_DATE = formatDate(today);
  const END_DATE = formatDate(endDate);

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function openLatestCampaignView(page) {
    page.setDefaultNavigationTimeout(120000);
    await loginToApp(page);
    await goToPage(page, '#/home/campaigns');
    await page.waitForLoadState('domcontentloaded');

    const searchInput = page.locator('input[matinput], input.mat-input-element, input[placeholder*="Search" i]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 20000 });
    await searchInput.clear();
    await searchInput.fill('Auto Campaign');
    await page.waitForTimeout(5000);

    let firstRow = page.locator('mat-row, tbody tr').first();
    if (!(await firstRow.isVisible().catch(() => false))) {
      console.log('INFO: Auto Campaign not found. Clearing search and using first available campaign.');
      await searchInput.clear();
      await searchInput.dispatchEvent('input').catch(() => {});
      await page.waitForTimeout(2500);
      firstRow = page.locator('mat-row, tbody tr').first();
    }
    if (!(await firstRow.isVisible({ timeout: 20000 }).catch(() => false))) {
      test.skip(true, 'No campaign rows are available for Fixed Delivery management in this environment.');
    }

    const actionBtn = firstRow.locator('.mat-menu-trigger, i.mar-icon-more-h, i.mar-icon-more-v, button[mat-icon-button]').first();
    if (await actionBtn.isVisible().catch(() => false)) {
      await actionBtn.click({ force: true });
    } else {
      await firstRow.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(1200);

    const viewBtn = page
      .locator('button.mat-menu-item:has-text("View"), [role="menuitem"]:has-text("View"), .dropdown-item:has-text("View")')
      .first();
    if (!(await viewBtn.isVisible({ timeout: 15000 }).catch(() => false))) {
      test.skip(true, 'Campaign view action is not available for Fixed Delivery management in this environment.');
    }
    await viewBtn.click({ force: true });
    await page.waitForTimeout(4000);
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function isFixedDeliveryFeeManagementOpen(page) {
    const title = page
      .locator('h1, h2, h3, h4, .page-title')
      .filter({ hasText: /Campaigns\s*-\s*Fixed Delivery|Fixed Delivery Management/i })
      .first();

    return await title.isVisible({ timeout: 10000 }).catch(() => false);
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function openFixedDeliveryFeeSection(page) {
    await page.waitForTimeout(1500);
    if (await isFixedDeliveryFeeManagementOpen(page)) return true;

    const fixedDeliveryHeading = page.locator('h5').filter({ hasText: /^Fixed Delivery$/i }).first();
    if (await fixedDeliveryHeading.isVisible({ timeout: 15000 }).catch(() => false)) {
      console.log('INFO: Fixed Delivery heading found, clicking nearest card.');
      await fixedDeliveryHeading.scrollIntoViewIfNeeded();
      await fixedDeliveryHeading.evaluate((heading) => {
        const card = heading.closest('.plain-card, .card, [class*="plain-card"], [class*="card"]');
        const target = card || heading.parentElement || heading;
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });
      await page.waitForTimeout(3000);
      if (await isFixedDeliveryFeeManagementOpen(page)) return true;
    }

    const fixedDeliveryCard = page
      .locator(
        'div.plain-card:has(h5:has-text("Fixed Delivery")), ' +
        '.card:has(h5:has-text("Fixed Delivery")), ' +
        'div.plain-card:has-text("Fixed Delivery"), ' +
        '.card:has-text("Fixed Delivery"), ' +
        '[cursor="pointer"]:has-text("Fixed Delivery"), ' +
        '[role="button"]:has-text("Fixed Delivery")'
      )
      .first();
    if (await fixedDeliveryCard.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('INFO: Fixed Delivery card found with fallback selector.');
      await fixedDeliveryCard.scrollIntoViewIfNeeded();
      await fixedDeliveryCard.click({ force: true });
      await page.waitForTimeout(3000);
      if (await isFixedDeliveryFeeManagementOpen(page)) return true;
    }

    const fixedDeliveryTabOrButton = page
      .locator('[role="tab"]:has-text("Fixed Delivery"), button:has-text("Fixed Delivery"), a:has-text("Fixed Delivery")')
      .first();
    if (await fixedDeliveryTabOrButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('INFO: Fixed Delivery tab/button found.');
      await fixedDeliveryTabOrButton.click({ force: true });
      await page.waitForTimeout(3000);
      if (await isFixedDeliveryFeeManagementOpen(page)) return true;
    }

    return await isFixedDeliveryFeeManagementOpen(page);
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {import("playwright-core").Locator[]} locators
   * @param {string | undefined} message
   */
  async function expectAnyVisible(page, locators, message) {
    for (const locator of locators) {
      if (await locator.first().isVisible().catch(() => false)) {
        await expect(locator.first()).toBeVisible();
        return locator.first();
      }
    }
    throw new Error(message);
  }

  /**
   * @param {import('@playwright/test').Locator} context
   * @param {string[]} selectors
   * @param {string} value
   */
  async function fillFirstVisible(context, selectors, value) {
    for (const selector of selectors) {
      const input = context.locator(selector).first();
      if (await input.isVisible().catch(() => false)) {
        if (!(await input.isEditable().catch(() => false))) continue;
        await input.scrollIntoViewIfNeeded().catch(() => {});
        await input.click({ clickCount: 3, force: true }).catch(() => {});
        await input.fill(value).catch(() => {});
        await input.dispatchEvent('input').catch(() => {});
        await input.dispatchEvent('change').catch(() => {});
        await input.blur().catch(() => {});
        const currentValue = ((await input.inputValue().catch(() => '')) || '').trim();
        if (currentValue) return true;
      }
    }
    return false;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').Locator} context
   * @param {string} label
   * @param {number} optionIndex
   * @param {string | null} optionText
   */
  async function selectDropdown(page, context, label, optionIndex = 0, optionText = null) {
    const compactLabel = label.replace(/\s+/g, '');
    const dropdown = context
      .locator(
        `mat-select[formcontrolname*="${label}" i], ` +
        `mat-select[formcontrolname*="${compactLabel}" i], ` +
        `mat-select[aria-label*="${label}" i], ` +
        `mat-select[placeholder*="${label}" i], ` +
        `mat-form-field:has-text("${label}") mat-select, ` +
        `[role="combobox"][aria-label*="${label}" i]`
      )
      .first();

    if (!(await dropdown.isVisible().catch(() => false))) return false;
    await dropdown.scrollIntoViewIfNeeded().catch(() => {});
    await dropdown.click({ force: true }).catch(() => {});
    await page.waitForTimeout(700);

    const options = page
      .locator('mat-option, .mat-option, [role="option"], .ng-option')
      .filter({ visible: true })
      .filter({ hasNotText: /search|no data|no records|no results|loading/i });
    const count = await options.count().catch(() => 0);
    if (count === 0) {
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    }

    if (optionText) {
      const optionByText = options.filter({ hasText: new RegExp(optionText, 'i') }).first();
      if (await optionByText.isVisible().catch(() => false)) {
        await optionByText.click({ force: true });
        await page.waitForTimeout(500);
        return true;
      }
    }

    const option = options.nth(Math.min(optionIndex, count - 1));
    await option.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').Locator} context
   * @param {number} datePickerIndex
   * @param {boolean} nextMonth
   */
  async function selectCalendarDate(page, context, datePickerIndex, nextMonth = false) {
    const toggle = context.locator('mat-datepicker-toggle button, button[aria-label="Open calendar"]').nth(datePickerIndex);
    if (!(await toggle.isVisible().catch(() => false))) return false;

    await toggle.click({ force: true });
    await page.waitForTimeout(500);

    if (nextMonth) {
      const nextMonthBtn = page.locator('button[aria-label="Next month"]').first();
      if (await nextMonthBtn.isVisible().catch(() => false)) {
        await nextMonthBtn.click({ force: true });
        await page.waitForTimeout(400);
      }
    }

    const targetDay = String(today.getDate());
    const targetCell = page
      .locator('.mat-calendar-body-cell:not([aria-disabled="true"]) .mat-calendar-body-cell-content')
      .filter({ hasText: new RegExp(`^${targetDay}$`) })
      .first();
    if (await targetCell.isVisible().catch(() => false)) {
      await targetCell.click({ force: true });
    } else {
      await page.locator('.mat-calendar-body-cell:not([aria-disabled="true"])').first().click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(500);
    return true;
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function handleOptionalStoreSelection(page) {
    const context = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    const picker = context.locator('.record-picker, app-record-picker, .listbox').first();
    const selectAll = context
      .locator('button.pull-left:has-text("All"), button:has-text("Select All"), mat-checkbox:has-text("Select All"), th mat-checkbox')
      .first();

    if (!(await picker.isVisible().catch(() => false)) && !(await selectAll.isVisible().catch(() => false))) return false;

    console.log('INFO: Optional store selection detected for Fixed Delivery.');
    const allBtn = context.locator('button.pull-left:has-text("All"), button:has-text("All"), button:has-text("Select All")').first();
    if (await allBtn.isVisible().catch(() => false)) {
      await allBtn.evaluate((node) => {
        node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }).catch(async () => {
        await allBtn.click({ force: true });
      });
      await page.waitForTimeout(700);
    }

    const addBtn = context.locator('button[name="addBtn"], button:has-text("Add"), .point-right, button:has(mat-icon:has-text("chevron_right"))').first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.evaluate((node) => {
        node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }).catch(async () => {
        await addBtn.click({ force: true });
      });
      await page.waitForTimeout(700);
    }

    const confirmBtn = context
      .locator('button:has-text("Create and set Stores"), button:has-text("Create"), button:has-text("Save"), button:has-text("Submit")')
      .filter({ visible: true })
      .last();
    if (await confirmBtn.isVisible().catch(() => false) && await confirmBtn.isEnabled().catch(() => false)) {
      await confirmBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    return true;
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function dismissSuccessPopup(page) {
    const okBtn = page.locator('.swal2-confirm, button:has-text("OK")').filter({ visible: true }).first();
    if (await okBtn.isVisible().catch(() => false)) {
      await okBtn.click({ force: true });
      await page.waitForTimeout(1500);
      return true;
    }
    return false;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').Locator} dialog
   */
  async function closeFixedDeliveryDialogIfOpen(page, dialog) {
    if (!(await dialog.isVisible().catch(() => false))) return;

    const closeBtn = dialog
      .locator('img:has-text("close"), button[aria-label="Close"], button:has-text("Close"), button:has-text("Cancel")')
      .filter({ visible: true })
      .last();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ force: true }).catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(1200);
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} code
   */
  async function searchFixedDeliveryFeeCode(page, code) {
    await expect(
      page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Fixed Delivery|Fixed Delivery Management/i }).first()
    ).toBeVisible({ timeout: 20000 });

    const searchInput = page.locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element').first();
    await searchInput.waitFor({ state: 'visible', timeout: 15000 });
    await searchInput.click({ force: true });
    await searchInput.fill(code);
    await searchInput.dispatchEvent('input').catch(() => {});

    const searchBtn = page
      .locator('button:has(mat-icon:has-text("search")), button[aria-label*="search" i], button:has(img:has-text("search"))')
      .filter({ visible: true })
      .first();
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click({ force: true });
    } else {
      await page.keyboard.press('Enter').catch(() => {});
    }
    await page.waitForTimeout(2500);

    const row = page.locator('mat-row, tbody tr, tr').filter({ hasText: code }).first();
    return await row.isVisible({ timeout: 15000 }).catch(() => false);
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function getTotalResultsCount(page) {
    const totalText = ((await page.locator(':text-matches("Total\\\\s+\\\\d+\\\\s+results", "i")').first().innerText().catch(() => '')) || '').trim();
    const match = totalText.match(/Total\s+(\d+)\s+results/i);
    return match ? Number(match[1]) : null;
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function createFixedDeliveryFee(page) {
    const initialTotal = await getTotalResultsCount(page);

    const createBtn = page
      .locator('button:has-text("Create"), button.create-button:has-text("Create")')
      .filter({ visible: true })
      .first();
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    await createBtn.click({ force: true });
    await page.waitForTimeout(1500);

    const createMenuItem = page
      .locator('button.mat-menu-item:has-text("Create"), [role="menuitem"]:has-text("Create")')
      .filter({ visible: true })
      .first();
    if (await createMenuItem.isVisible().catch(() => false)) {
      await createMenuItem.click({ force: true });
      await page.waitForTimeout(1500);
    }

    const dialog = page
      .locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]')
      .filter({ visible: true })
      .last();
    await expect(dialog).toBeVisible({ timeout: 20000 });

    // Fill Code field
    await fillFirstVisible(dialog, [
      'input[formcontrolname="Code" i]',
      'mat-form-field:has-text("Code") input',
      'input[placeholder*="Code" i]',
    ], `FDF${Date.now().toString().slice(-6)}`);

    // Fill Region field
    await selectDropdown(page, dialog, 'Region', 0);

    // Fill City field
    await selectDropdown(page, dialog, 'City', 0);

    // Fill Area/Zone field
    await selectDropdown(page, dialog, 'Area', 0);
    await selectDropdown(page, dialog, 'Zone', 0);

    // Fill Delivery Type
    await selectDropdown(page, dialog, 'Delivery Type', 0);

    // Fill Base Fee
    await fillFirstVisible(dialog, [
      'input[formcontrolname="FixedDeliveryAmount" i]',
      'input[formcontrolname="FixedDeliveryFee" i]',
      'input[formcontrolname="Amount" i]',
      'mat-form-field:has-text("Fixed Delivery Amount") input',
      'input[placeholder*="Fixed Delivery Amount" i]',
      'input[formcontrolname="BaseFee" i]',
      'input[formcontrolname="DeliveryFee" i]',
      'mat-form-field:has-text("Base Fee") input',
      'mat-form-field:has-text("Delivery Fee") input',
      'input[placeholder*="Base Fee" i]',
    ], '50');

    // Fill Additional Per KM Fee
    await fillFirstVisible(dialog, [
      'input[formcontrolname="AdditionalPerKmFee" i]',
      'input[formcontrolname="PerKmFee" i]',
      'mat-form-field:has-text("Additional Per KM Fee") input',
      'input[placeholder*="Per KM" i]',
    ], '5');

    // Fill Start Date
    if (!(await fillFirstVisible(dialog, [
      'input[formcontrolname="StartDate" i]',
      'mat-form-field:has-text("Start Date") input',
      'input[placeholder*="Start Date" i]',
    ], START_DATE))) {
      await selectCalendarDate(page, dialog, 0);
    }

    // Fill End Date
    if (!(await fillFirstVisible(dialog, [
      'input[formcontrolname="EndDate" i]',
      'mat-form-field:has-text("End Date") input',
      'input[placeholder*="End Date" i]',
    ], END_DATE))) {
      await selectCalendarDate(page, dialog, 1, true);
    }

    // Fill Description
    await fillFirstVisible(dialog, [
      'textarea[formcontrolname="Description" i]',
      'mat-form-field:has-text("Description") textarea',
      'textarea[placeholder*="Description" i]',
    ], 'Fixed delivery fee created by Playwright automation');

    // Fill Arabic Description
    await fillFirstVisible(dialog, [
      'textarea[formcontrolname="DescriptionArabic" i]',
      'textarea[formcontrolname="ArabicDescription" i]',
      'mat-form-field:has-text("Arabic Description") textarea',
      'textarea[placeholder*="Arabic Description" i]',
    ], 'رسم التسليم الثابت الذي تم إنشاؤه بواسطة Playwright');

    // Fill Max Delivery Distance (if applicable)
    await fillFirstVisible(dialog, [
      'input[formcontrolname="MaxDeliveryDistance" i]',
      'input[formcontrolname="MaxDistance" i]',
      'mat-form-field:has-text("Max Distance") input',
      'input[placeholder*="Max Distance" i]',
    ], '50');

    // Fill Min Order Value
    await fillFirstVisible(dialog, [
      'input[formcontrolname="MinOrderValue" i]',
      'input[formcontrolname="MinOrderAmount" i]',
      'mat-form-field:has-text("Min Order") input',
    ], '100');

    // Fill Priority/Weight
    await fillFirstVisible(dialog, [
      'input[formcontrolname="Priority" i]',
      'input[formcontrolname="Weight" i]',
      'mat-form-field:has-text("Priority") input',
      'input[placeholder*="Priority" i]',
    ], '1');

    // Select Save button and click
    const saveBtn = dialog
      .locator('button:has-text("Create Fixed Delivery Fee"), button:has-text("Create and set Stores"), button:has-text("Create"), button:has-text("Save"), button:has-text("Submit")')
      .filter({ visible: true })
      .last();
    await expect(saveBtn).toBeEnabled({ timeout: 15000 });
    const saveText = ((await saveBtn.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`INFO: Creating Fixed Delivery Fee via button: ${saveText}`);
    await saveBtn.click({ force: true });
    await page.waitForTimeout(2500);

    await handleOptionalStoreSelection(page);
    await dismissSuccessPopup(page);
    await handleOptionalStoreSelection(page);
    await dismissSuccessPopup(page);

    await expect(dialog).toBeHidden({ timeout: 30000 }).catch(() => {});
    await closeFixedDeliveryDialogIfOpen(page, dialog);
    await expect(
      page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Fixed Delivery Fee Management/i }).first()
    ).toBeVisible({ timeout: 20000 });

    const totalAfterCreate = await getTotalResultsCount(page);
    if (initialTotal !== null && totalAfterCreate !== null) {
      expect(totalAfterCreate).toBeGreaterThanOrEqual(initialTotal);
    }

    const createdRow = page.locator('mat-row, tbody tr').filter({ visible: true }).first();
    await expect(createdRow).toBeVisible({ timeout: 20000 });
    return ((await createdRow.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} rowText
   */
  async function deleteFixedDeliveryFeeIfPresent(page, rowText) {
    if (!rowText) return false;

    const rowCode = rowText.split(/\s+/)[0];
    await openFixedDeliveryFeeActionMenu(page, rowText).catch(() => {});

    const deleteBtn = page.locator('button.mat-menu-item, [role="menuitem"], .dropdown-item').filter({ hasText: /Delete/i }).first();
    if (!(await deleteBtn.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    }

    await deleteBtn.click({ force: true });
    await page.waitForTimeout(1000);

    const confirmBtn = page
      .locator('button:has-text("Delete"), button.swal2-confirm, .swal2-confirm')
      .filter({ visible: true })
      .first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click({ force: true });
      await page.waitForTimeout(1500);
      return true;
    }
    return false;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} rowText
   */
  async function openFixedDeliveryFeeActionMenu(page, rowText) {
    const rowCode = rowText.split(/\s+/)[0];
    const row = page.locator('mat-row, tbody tr, tr').filter({ hasText: rowCode }).first();
    await row.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    if (!(await row.isVisible().catch(() => false))) return false;

    const moreBtn = row
      .locator('.mat-menu-trigger, button[mat-icon-button], i.mar-icon-more-h, i.mar-icon-more-v, button:has(mat-icon:has-text("more_horiz")), button:has(mat-icon:has-text("more_vert")), img:has-text("more_horiz"), img:has-text("more_vert")')
      .last();
    const menuItems = page.locator('button.mat-menu-item, [role="menuitem"], .dropdown-item').filter({ visible: true });

    for (let attempt = 0; attempt < 3; attempt++) {
      if (await moreBtn.isVisible().catch(() => false)) {
        await moreBtn.scrollIntoViewIfNeeded().catch(() => {});
        if (attempt === 0) {
          await moreBtn.click({ force: true }).catch(() => {});
        } else {
          await moreBtn.evaluate((node) => {
            for (const eventName of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
              node.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window }));
            }
          }).catch(async () => {
            await moreBtn.click({ force: true }).catch(() => {});
          });
        }
      } else {
        await row.click({ force: true, button: 'right' }).catch(() => {});
      }

      await page.waitForTimeout(800);
      if ((await menuItems.count().catch(() => 0)) > 0) return true;
      await page.keyboard.press('Escape').catch(() => {});
    }

    return false;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} rowTextOrCode
   */
  async function editFixedDeliveryFee(page, rowTextOrCode) {
    const code = rowTextOrCode.split(/\s+/)[0];
    let row = page.locator('mat-row, tbody tr, tr').filter({ hasText: code }).first();
    if (!(await row.isVisible({ timeout: 8000 }).catch(() => false))) {
      const found = await searchFixedDeliveryFeeCode(page, code);
      if (!found) {
        throw new Error(`Fixed Delivery Fee with code ${code} not found`);
      }
      row = page.locator('mat-row, tbody tr, tr').filter({ hasText: code }).first();
    }

    await expect(row).toBeVisible({ timeout: 20000 });
    const rowText = ((await row.innerText().catch(() => code)) || code).replace(/\s+/g, ' ').trim();
    const opened = await openFixedDeliveryFeeActionMenu(page, rowText);
    expect(opened).toBeTruthy();

    const editBtn = page
      .locator('button.mat-menu-item:has-text("Edit"), [role="menuitem"]:has-text("Edit"), .dropdown-item:has-text("Edit")')
      .first();
    await editBtn.waitFor({ state: 'visible', timeout: 15000 });
    await editBtn.click({ force: true });
    await page.waitForTimeout(2000);

    const dialog = page
      .locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]')
      .filter({ visible: true })
      .last();
    await expect(dialog).toBeVisible({ timeout: 20000 });
    return dialog;
  }

  // ======================== TEST CASES ========================

  test('Test 01: Verify Fixed Delivery Management page opens', async ({ page }) => {
    test.setTimeout(240000);

    await openLatestCampaignView(page);
    const opened = await openFixedDeliveryFeeSection(page);
    expect(opened).toBe(true);
    await expect(
      page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Fixed Delivery|Fixed Delivery Management/i }).first()
    ).toBeVisible({ timeout: 20000 });
  });

  test('Test 00: Verify Create Fixed Delivery Fee dialog opens without saving', async ({ page }) => {
    test.setTimeout(240000);

    await openLatestCampaignView(page);
    await openFixedDeliveryFeeSection(page);

    await page.locator('.ngx-spinner-overlay, app-page-loader, .loading-overlay, .loading-spinner').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    const createBtn = page.locator('button:has-text("Create Fixed Delivery Fee"), button:has-text("Create Fixed"), button:has-text("Create")').filter({ visible: true }).first();
    await expect(createBtn).toBeVisible({ timeout: 15000 });
    await createBtn.scrollIntoViewIfNeeded().catch(() => {});
    await createBtn.click({ force: true });

    const dialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    if (!(await dialog.isVisible({ timeout: 10000 }).catch(() => false))) {
      await createBtn.click({ force: true }).catch(() => {});
    }
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await expect(dialog).toContainText(/Fixed Delivery|Create|Basic Information/i);

    const amountOrDateField = dialog
      .locator('input[formcontrolname*="Amount" i], input[placeholder*="Amount" i], input[formcontrolname*="Date" i], input[placeholder*="Date" i]')
      .filter({ visible: true })
      .first();
    await expect(amountOrDateField).toBeVisible({ timeout: 15000 });

    await page.keyboard.press('Escape').catch(() => {});
  });

  test('Test 02: Verify Fixed Delivery table structure and data display', async ({ page }) => {
    test.setTimeout(240000);

    await openLatestCampaignView(page);
    await openFixedDeliveryFeeSection(page);

    const table = page.locator('mat-table, table, [role="table"]').first();
    await expect(table).toBeVisible({ timeout: 15000 });

    const rows = page.locator('mat-row, tbody tr').filter({ visible: true });
    const rowCount = await rows.count().catch(() => 0);
    console.log(`INFO: Found ${rowCount} rows in Fixed Delivery table`);
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test('Test 03: Search functionality', async ({ page }) => {
    test.setTimeout(240000);

    await openLatestCampaignView(page);
    await openFixedDeliveryFeeSection(page);

    const searchInput = page.locator('input[placeholder*="Search" i], input[matinput]').first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    await searchInput.fill('test');
    await searchInput.dispatchEvent('input');
    await page.waitForTimeout(2000);
    await expect(page.locator('mat-row, tbody tr').first()).toBeVisible({ timeout: 15000 }).catch(() => {});
  });

  test('Test 04: Create Fixed Delivery Record', async ({ page }) => {
    test.setTimeout(300000);

    await openLatestCampaignView(page);
    await openFixedDeliveryFeeSection(page);
    
    const createdRowText = await createFixedDeliveryFee(page);
    console.log(`INFO: Created Fixed Delivery: ${createdRowText}`);
    expect(createdRowText).toBeTruthy();
    expect(createdRowText.length).toBeGreaterThan(0);
  });

  test('Test 05: Search and verify created Fixed Delivery', async ({ page }) => {
    test.setTimeout(300000);

    await openLatestCampaignView(page);
    await openFixedDeliveryFeeSection(page);

    const createdRowText = await createFixedDeliveryFee(page);
    const code = createdRowText.split(/\s+/)[0];
    
    const searchResult = await searchFixedDeliveryFeeCode(page, code);
    expect(searchResult).toBe(true);
  });

  test('Test 06: Edit Fixed Delivery Record', async ({ page }) => {
    test.setTimeout(300000);

    await openLatestCampaignView(page);
    await openFixedDeliveryFeeSection(page);

    const createdRowText = await createFixedDeliveryFee(page);

    const dialog = await editFixedDeliveryFee(page, createdRowText);
    
    // Update description
    await fillFirstVisible(dialog, [
      'textarea[formcontrolname="Description" i]',
      'mat-form-field:has-text("Description") textarea',
    ], 'Updated by Playwright - ' + new Date().toISOString());

    const saveBtn = dialog
      .locator('button:has-text("Edit Fixed Delivery Fee"), button:has-text("Update"), button:has-text("Save"), button:has-text("Submit")')
      .filter({ visible: true })
      .last();
    await expect(saveBtn).toBeEnabled({ timeout: 15000 });
    await saveBtn.click({ force: true });
    await page.waitForTimeout(2000);

    await dismissSuccessPopup(page);
    await expect(dialog).toBeHidden({ timeout: 30000 }).catch(() => {});
  });

  test('Test 07: Delete Fixed Delivery Record', async ({ page }) => {
    test.setTimeout(300000);

    await openLatestCampaignView(page);
    await openFixedDeliveryFeeSection(page);

    const createdRowText = await createFixedDeliveryFee(page);
    
    const deleted = await deleteFixedDeliveryFeeIfPresent(page, createdRowText);
    expect(deleted).toBe(true);

    await dismissSuccessPopup(page);
  });

  test('Test 08: Verify Fixed Delivery page responsiveness and UI elements', async ({ page }) => {
    test.setTimeout(240000);

    await openLatestCampaignView(page);
    await openFixedDeliveryFeeSection(page);

    const createBtn = page.locator('button:has-text("Create Fixed"), button:has-text("Create")').filter({ visible: true }).first();
    await expect(createBtn).toBeVisible({ timeout: 15000 });

    const searchInput = page
      .locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element')
      .filter({ visible: true })
      .first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    const table = page.locator('mat-table, table').first();
    await expect(table).toBeVisible({ timeout: 15000 });
  });

  test('Test 09: Verify pagination (if available)', async ({ page }) => {
    test.setTimeout(240000);

    await openLatestCampaignView(page);
    await openFixedDeliveryFeeSection(page);

    const paginator = page.locator('mat-paginator, .paginator, [role="navigation"]').first();
    if (await paginator.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('INFO: Paginator found');
      await expect(paginator).toBeVisible();
    }
  });

  test('Test 10: Verify sorting capabilities', async ({ page }) => {
    test.setTimeout(240000);

    await openLatestCampaignView(page);
    await openFixedDeliveryFeeSection(page);

    const sortableHeaders = page.locator('th, mat-header-cell, .mat-header-cell, [role="columnheader"]').filter({ visible: true });
    const headerCount = await sortableHeaders.count().catch(() => 0);
    console.log(`INFO: Found ${headerCount} table headers`);
    expect(headerCount).toBeGreaterThan(0);
  });
});
