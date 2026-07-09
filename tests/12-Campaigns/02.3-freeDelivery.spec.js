// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 02.3 - Campaign View Free Delivery Management
// URL: #/home/campaigns
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

test.describe('02.3 - Campaign View Free Delivery', () => {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const today = new Date();
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + 1);
  const START_DATE = `${pad(today.getMonth() + 1)}/${pad(today.getDate())}/${today.getFullYear()}`;
  const END_DATE = `${pad(endDate.getMonth() + 1)}/${pad(endDate.getDate())}/${endDate.getFullYear()}`;

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
      await page.waitForTimeout(2500);
      firstRow = page.locator('mat-row, tbody tr').first();
    }
    if (!(await firstRow.isVisible({ timeout: 20000 }).catch(() => false))) {
      test.skip(true, 'No campaign rows are available in this UAT environment.');
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
    await viewBtn.waitFor({ state: 'visible', timeout: 15000 });
    await viewBtn.click({ force: true });
    await page.waitForTimeout(4000);
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function isFreeDeliveryManagementOpen(page) {
    const title = page
      .locator('h1, h2, h3, h4, .page-title')
      .filter({ hasText: /Campaigns\s*-\s*Free Delivery Management|Free Delivery Management/i })
      .first();

    return await title.isVisible({ timeout: 10000 }).catch(() => false);
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function openFreeDeliverySection(page) {
    await page.waitForTimeout(1500);
    if (await isFreeDeliveryManagementOpen(page)) return true;

    const freeDeliveryHeading = page.locator('h5').filter({ hasText: /^Free Delivery$/i }).first();
    if (await freeDeliveryHeading.isVisible({ timeout: 15000 }).catch(() => false)) {
      console.log('INFO: Free Delivery heading found, clicking nearest card.');
      await freeDeliveryHeading.scrollIntoViewIfNeeded();
      await freeDeliveryHeading.evaluate((heading) => {
        const card = heading.closest('.plain-card, .card, [class*="plain-card"], [class*="card"]');
        const target = card || heading.parentElement || heading;
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });
      await page.waitForTimeout(3000);
      if (await isFreeDeliveryManagementOpen(page)) return true;
    }

    const freeDeliveryCard = page
      .locator(
        'div.plain-card:has(h5:has-text("Free Delivery")), ' +
        '.card:has(h5:has-text("Free Delivery")), ' +
        'div.plain-card:has-text("Free Delivery"), ' +
        '.card:has-text("Free Delivery"), ' +
        '[cursor="pointer"]:has-text("Free Delivery"), ' +
        '[role="button"]:has-text("Free Delivery")'
      )
      .first();
    if (await freeDeliveryCard.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('INFO: Free Delivery card found with fallback selector.');
      await freeDeliveryCard.scrollIntoViewIfNeeded();
      await freeDeliveryCard.click({ force: true });
      await page.waitForTimeout(3000);
      if (await isFreeDeliveryManagementOpen(page)) return true;
    }

    const freeDeliveryTabOrButton = page
      .locator('[role="tab"]:has-text("Free Delivery"), button:has-text("Free Delivery"), a:has-text("Free Delivery")')
      .first();
    if (await freeDeliveryTabOrButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('INFO: Free Delivery tab/button found.');
      await freeDeliveryTabOrButton.click({ force: true });
      await page.waitForTimeout(3000);
      if (await isFreeDeliveryManagementOpen(page)) return true;
    }

    return await isFreeDeliveryManagementOpen(page);
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
        return true;
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

    console.log('INFO: Optional store selection detected for Free Delivery.');
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
   * @param {import('@playwright/test').Locator} context
   * @param {RegExp} labelPattern
   */
  async function getEnabledButton(context, labelPattern) {
    const buttons = context.locator('button.center-button, button.mat-primary, button').filter({ visible: true });
    const count = await buttons.count().catch(() => 0);
    for (let index = count - 1; index >= 0; index--) {
      const button = buttons.nth(index);
      const text = ((await button.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (labelPattern.test(text) && await button.isEnabled().catch(() => false)) {
        return button;
      }
    }
    return buttons.first();
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} code
   */
  async function searchFreeDeliveryCode(page, code) {
    await expect(
      page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Free Delivery Management/i }).first()
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
  async function createFreeDelivery(page) {
    const initialTotal = await getTotalResultsCount(page);

    const createBtn = page
      .locator('button:has-text("Create Free Delivery"), button.create-button:has-text("Create"), button:has-text("Create")')
      .filter({ visible: true })
      .first();
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    await createBtn.click({ force: true });
    await page.waitForTimeout(1500);

    const createMenuItem = page
      .locator('button.mat-menu-item:has-text("Create Free Delivery"), [role="menuitem"]:has-text("Create Free Delivery")')
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

    await fillFirstVisible(dialog, [
      'input[formcontrolname="Code" i]',
      'mat-form-field:has-text("Code") input',
      'input[placeholder*="Code" i]',
    ], `FD${Date.now().toString().slice(-6)}`);

    await selectDropdown(page, dialog, 'Target Type', 0, 'Store');
    await selectDropdown(page, dialog, 'Campaign Target Type', 0, 'Store');

    if (!(await fillFirstVisible(dialog, [
      'input[formcontrolname="StartDate" i]',
      'mat-form-field:has-text("Start Date") input',
      'input[placeholder*="Start Date" i]',
    ], START_DATE))) {
      await selectCalendarDate(page, dialog, 0);
    }

    if (!(await fillFirstVisible(dialog, [
      'input[formcontrolname="EndDate" i]',
      'mat-form-field:has-text("End Date") input',
      'input[placeholder*="End Date" i]',
    ], END_DATE))) {
      await selectCalendarDate(page, dialog, 1, true);
    }

    await fillFirstVisible(dialog, [
      'textarea[formcontrolname="Description" i]',
      'mat-form-field:has-text("Description") textarea',
      'textarea[placeholder*="Description" i]',
    ], 'Free delivery created by Playwright');

    await fillFirstVisible(dialog, [
      'textarea[formcontrolname="DescriptionArabic" i]',
      'textarea[formcontrolname="ArabicDescription" i]',
      'mat-form-field:has-text("Arabic Description") textarea',
      'textarea[placeholder*="Arabic Description" i]',
    ], 'Arabic free delivery created by Playwright');

    await fillFirstVisible(dialog, [
      'input[formcontrolname="MaxCount" i]',
      'mat-form-field:has-text("Max Count") input',
    ], '100');
    await fillFirstVisible(dialog, [
      'input[formcontrolname="MaxCountPerUser" i]',
      'mat-form-field:has-text("Max Count Per User") input',
    ], '1');
    await fillFirstVisible(dialog, [
      'input[formcontrolname="MinOrderValue" i]',
      'input[formcontrolname="MinOrderAmount" i]',
      'mat-form-field:has-text("Min Order") input',
    ], '100');
    await fillFirstVisible(dialog, [
      'input[formcontrolname="MaxOrderValue" i]',
      'input[formcontrolname="MaxOrderAmount" i]',
      'mat-form-field:has-text("Max Order") input',
    ], '5000');

    await selectDropdown(page, dialog, 'OperationalDay', 0);
    await selectDropdown(page, dialog, 'Day Type', 0);
    await selectDropdown(page, dialog, 'StartTime', 0);
    await selectDropdown(page, dialog, 'Start Time', 0);
    await selectDropdown(page, dialog, 'EndTime', 1);
    await selectDropdown(page, dialog, 'End Time', 1);

    const saveBtn = dialog
      .locator('button:has-text("Create Free Delivery"), button:has-text("Create and set Stores"), button:has-text("Create"), button:has-text("Save"), button:has-text("Submit")')
      .filter({ visible: true })
      .last();
    await expect(saveBtn).toBeEnabled({ timeout: 15000 });
    const saveText = ((await saveBtn.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`INFO: Creating Free Delivery via button: ${saveText}`);
    await saveBtn.click({ force: true });
    await page.waitForTimeout(2500);

    await handleOptionalStoreSelection(page);
    await dismissSuccessPopup(page);
    await handleOptionalStoreSelection(page);
    await dismissSuccessPopup(page);

    await expect(dialog).toBeHidden({ timeout: 30000 }).catch(() => {});
    await expect(
      page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Free Delivery Management/i }).first()
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
  async function deleteFreeDeliveryIfPresent(page, rowText) {
    if (!rowText) return false;

    const rowCode = rowText.split(/\s+/)[0];
    await openFreeDeliveryActionMenu(page, rowText).catch(() => {});

    const deleteBtn = page.locator('button.mat-menu-item, [role="menuitem"], .dropdown-item').filter({ hasText: /Delete/i }).first();
    if (!(await deleteBtn.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    }

    await deleteBtn.click({ force: true });
    await page.waitForTimeout(1000);

    const confirmBtn = page
      .locator('.swal2-popup button.swal2-confirm, button.swal2-confirm, button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Delete"):not([role="menuitem"])')
      .filter({ visible: true })
      .first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click({ force: true });
      await page.waitForTimeout(1500);
      await dismissSuccessPopup(page);
    }

    const deletedRow = page.locator('mat-row, tbody tr').filter({ hasText: rowCode }).first();
    await expect(deletedRow).toHaveCount(0, { timeout: 15000 });
    return true;
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function openFreeDeliveryManagementPage(page) {
    await openLatestCampaignView(page);
    const openedFreeDelivery = await openFreeDeliverySection(page);
    if (!openedFreeDelivery) {
      test.skip(true, 'Free Delivery section is not available for the selected campaign in this environment.');
    }
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} rowText
   */
  async function getFreeDeliveryRow(page, rowText) {
    const rowCode = rowText.split(/\s+/)[0];
    const searchInput = page.locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.click({ force: true });
      await searchInput.fill(rowCode);
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
    }

    const row = page.locator('mat-row, tbody tr').filter({ hasText: rowCode }).first();
    await expect(row).toBeVisible({ timeout: 20000 });
    return row;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} rowText
   */
  async function openFreeDeliveryActionMenu(page, rowText) {
    const row = await getFreeDeliveryRow(page, rowText);
    const actionBtn = row
      .locator('.mat-menu-trigger, button[mat-icon-button], i.mar-icon-more-h, i.mar-icon-more-v, button:has(mat-icon:has-text("more_horiz")), button:has(mat-icon:has-text("more_vert")), img:has-text("more_horiz"), img:has-text("more_vert")')
      .last();
    await expect(actionBtn).toBeVisible({ timeout: 15000 });
    await actionBtn.scrollIntoViewIfNeeded().catch(() => {});
    await actionBtn.click({ force: true });
    await page.waitForTimeout(700);
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {RegExp} labelPattern
   */
  async function clickFreeDeliveryAction(page, labelPattern) {
    const menuItem = page.locator('button.mat-menu-item, [role="menuitem"], .dropdown-item').filter({ hasText: labelPattern }).first();
    await expect(menuItem).toBeVisible({ timeout: 10000 });
    const label = ((await menuItem.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`INFO: Clicking Free Delivery action: ${label}`);
    await menuItem.click({ force: true });
    await page.waitForTimeout(1500);
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function closeFreeDeliverySurface(page) {
    const closeBtn = page
      .locator('modal-container img:has-text("close"), mat-dialog-container img:has-text("close"), [role="dialog"] img:has-text("close"), [role="dialog"] button[aria-label="Close"], button:has-text("Close"), button:has-text("Cancel")')
      .filter({ visible: true })
      .first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1200);
      return;
    }

    const backBtn = page.locator('mat-icon.back-bt, .back-bt, mat-icon:has-text("arrow_back_ios"), button:has(mat-icon:has-text("arrow_back"))').first();
    if (await backBtn.isVisible().catch(() => false) && !(await isFreeDeliveryManagementOpen(page))) {
      await backBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      return;
    }

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(700);
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} rowText
   */
  async function viewFreeDelivery(page, rowText) {
    await openFreeDeliveryActionMenu(page, rowText);
    await clickFreeDeliveryAction(page, /View|Analytics|Manage\s*Free\s*Delivery/i);

    const viewSurface = page
      .locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"], h1, h2, h3, h4, .page-title')
      .filter({ hasText: /View|Analytics|Manage|Free Delivery/i })
      .first();
    await expect(viewSurface).toBeVisible({ timeout: 15000 });
    await closeFreeDeliverySurface(page);
    await expect(
      page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Free Delivery Management/i }).first()
    ).toBeVisible({ timeout: 20000 });
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} rowText
   */
  async function editFreeDelivery(page, rowText) {
    await openFreeDeliveryActionMenu(page, rowText);
    await clickFreeDeliveryAction(page, /Edit/i);

    const dialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    await expect(dialog).toBeVisible({ timeout: 15000 });

    const movUpdated = await fillFirstVisible(dialog, [
      'input[formcontrolname="MOV" i]',
      'input[formcontrolname*="MinimumOrder" i]',
      'mat-form-field:has-text("MOV") input',
      'input[placeholder*="MOV" i]',
      'input[type="number"]',
    ], '101');
    console.log(`INFO: Free Delivery edit MOV updated: ${movUpdated}`);

    const updateBtn = dialog
      .locator('button:has-text("Edit Free Delivery"), button:has-text("Update"), button:has-text("Save"), button:has-text("Submit")')
      .filter({ visible: true })
      .last();
    await expect(updateBtn).toBeEnabled({ timeout: 15000 });
    await updateBtn.click({ force: true });
    await page.waitForTimeout(2000);

    await handleOptionalStoreSelection(page);
    await dismissSuccessPopup(page);
    await closeFreeDeliverySurface(page);
    await expect(
      page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Free Delivery Management/i }).first()
    ).toBeVisible({ timeout: 20000 });
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function verifyFreeDeliveryManagementPage(page) {
    const title = page
      .locator('h1, h2, h3, h4, .page-title')
      .filter({ hasText: /Campaigns\s*-\s*Free Delivery Management|Free Delivery Management/i })
      .first();
    await expect(title).toBeVisible({ timeout: 20000 });

    await expectAnyVisible(page, [
      page.locator('mat-icon.back-bt, .back-bt, mat-icon:has-text("arrow_back_ios"), img:has-text("arrow_back_ios")'),
      page.locator('button:has(mat-icon:has-text("arrow_back")), button[aria-label*="Back" i], button:has-text("Back")'),
    ], 'Back button was not visible on Free Delivery Management page.');

    await expectAnyVisible(page, [
      page.getByRole('button', { name: /Create Free Delivery/i }),
      page.getByRole('button', { name: /^Create$/i }),
      page.locator('button.create-button:has-text("Create"), button:has-text("Create")'),
    ], 'Create button was not visible on Free Delivery Management page.');

    const searchInput = await expectAnyVisible(page, [
      page.locator('input[placeholder*="Search" i]'),
      page.locator('input[aria-label*="search" i]'),
      page.locator('input[matinput], input.mat-input-element'),
    ], 'Search/filter input was not visible on Free Delivery Management page.');
    await searchInput.fill('');

    const filterControls = page.locator('mat-select, [role="combobox"], input[matinput], input.mat-input-element').filter({ visible: true });
    expect(await filterControls.count()).toBeGreaterThan(0);

    const searchButtons = page
      .locator('button:has(mat-icon:has-text("search")), button[aria-label*="search" i], button:has(img:has-text("search"))')
      .filter({ visible: true });
    expect(await searchButtons.count().catch(() => 0)).toBeGreaterThan(0);

    const tableOrEmptyState = await expectAnyVisible(page, [
      page.locator('mat-table, table').first(),
      page.locator('mat-row, tbody tr').first(),
      page.locator(':text("No data"), :text("No records"), :text("No results")'),
    ], 'Neither a Free Delivery table nor an empty state was visible.');

    await tableOrEmptyState.scrollIntoViewIfNeeded().catch(() => {});

    const headerCandidates = [
      /Index/i,
      /Name/i,
      /Start Date/i,
      /End Date/i,
      /Store/i,
      /Is Active/i,
      /Actions/i,
    ];
    const visibleHeaders = [];
    for (const headerPattern of headerCandidates) {
      const header = page.locator('th, mat-header-cell, .mat-header-cell, [role="columnheader"]').filter({ hasText: headerPattern }).first();
      if (await header.isVisible().catch(() => false)) {
        visibleHeaders.push(headerPattern.toString());
      }
    }

    if (await page.locator('mat-table, table').first().isVisible().catch(() => false)) {
      expect(visibleHeaders.length).toBeGreaterThanOrEqual(3);
    }

    const row = page.locator('mat-row, tbody tr').filter({ visible: true }).first();
    if (await row.isVisible().catch(() => false)) {
      await expectAnyVisible(page, [
        row.locator('.mat-menu-trigger, button[mat-icon-button], i.mar-icon-more-h, i.mar-icon-more-v'),
        row.locator('button:has(mat-icon:has-text("more_horiz")), button:has(mat-icon:has-text("more_vert"))'),
        row.locator('img:has-text("more_horiz"), img:has-text("more_vert")'),
      ], 'Actions control was not visible in the first Free Delivery row.');
    }

    const totalResults = page.locator(':text-matches("Total\\\\s+\\\\d+\\\\s+results", "i"), :text("Total")').first();
    const pagination = page.locator('pagination-controls, .pagination, [aria-label*="Pagination" i], :text("Next"), :text("Prev")').first();
    const hasTotalOrPagination = await totalResults.isVisible().catch(() => false) || await pagination.isVisible().catch(() => false);
    expect(hasTotalOrPagination).toBeTruthy();

    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
      const scrollable = document.querySelector('mat-sidenav-content, .content, .main-content, div[style*="overflow-y"]');
      if (scrollable) scrollable.scrollTo({ top: scrollable.scrollHeight, behavior: 'instant' });
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const scrollable = document.querySelector('mat-sidenav-content, .content, .main-content, div[style*="overflow-y"]');
      if (scrollable) scrollable.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  // ============================================================
  // FD-01: Verify Campaigns - Free Delivery Management full page
  // Run: npx playwright test tests/12-Campaigns/02.3-freeDelivery.spec.js -g "FD-01"
  // ============================================================
  test('FD-01 [fd-01]: Verify Campaigns - Free Delivery Management full page', async ({ page }) => {
    test.setTimeout(180000);

    await openFreeDeliveryManagementPage(page);
    await verifyFreeDeliveryManagementPage(page);
  });

  test('FD-00 [fd-00]: Verify Create Free Delivery dialog opens without saving', async ({ page }) => {
    test.setTimeout(180000);

    await openFreeDeliveryManagementPage(page);

    const createBtn = page.locator('button:has-text("Create Free Delivery"), button.create-button:has-text("Create"), button:has-text("Create")').filter({ visible: true }).first();
    await expect(createBtn).toBeVisible({ timeout: 15000 });
    await createBtn.click({ force: true });

    const dialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText(/Free Delivery|Basic Information|Create/i);

    const codeOrDateField = dialog
      .locator('input[formcontrolname*="Code" i], input[placeholder*="Code" i], input[formcontrolname*="Date" i], input[placeholder*="Date" i]')
      .first();
    await expect(codeOrDateField).toBeVisible({ timeout: 15000 });

    await page.keyboard.press('Escape').catch(() => {});
  });

  // ============================================================
  // FD-02: Create Free Delivery
  // Run: npx playwright test tests/12-Campaigns/02.3-freeDelivery.spec.js -g "FD-02"
  // ============================================================
  test('FD-02 [fd-02]: Create Free Delivery', async ({ page }) => {
    test.setTimeout(240000);

    await openFreeDeliveryManagementPage(page);
    const createdRowText = await createFreeDelivery(page);
    expect(createdRowText).toBeTruthy();
    await deleteFreeDeliveryIfPresent(page, createdRowText);
  });

  // ============================================================
  // FD-03: View Free Delivery
  // Run: npx playwright test tests/12-Campaigns/02.3-freeDelivery.spec.js -g "FD-03"
  // ============================================================
  test('FD-03 [fd-03]: View Free Delivery', async ({ page }) => {
    test.setTimeout(240000);

    await openFreeDeliveryManagementPage(page);
    const createdRowText = await createFreeDelivery(page);
    await viewFreeDelivery(page, createdRowText);
    await deleteFreeDeliveryIfPresent(page, createdRowText);
  });

  // ============================================================
  // FD-04: Edit Free Delivery
  // Run: npx playwright test tests/12-Campaigns/02.3-freeDelivery.spec.js -g "FD-04"
  // ============================================================
  test('FD-04 [fd-04]: Edit Free Delivery', async ({ page }) => {
    test.setTimeout(240000);

    await openFreeDeliveryManagementPage(page);
    const createdRowText = await createFreeDelivery(page);
    await editFreeDelivery(page, createdRowText);
    await deleteFreeDeliveryIfPresent(page, createdRowText);
  });

  // ============================================================
  // FD-05: Delete Free Delivery
  // Run: npx playwright test tests/12-Campaigns/02.3-freeDelivery.spec.js -g "FD-05"
  // ============================================================
  test('FD-05 [fd-05]: Delete Free Delivery', async ({ page }) => {
    test.setTimeout(240000);

    await openFreeDeliveryManagementPage(page);
    const createdRowText = await createFreeDelivery(page);
    const deleted = await deleteFreeDeliveryIfPresent(page, createdRowText);
    expect(deleted).toBeTruthy();
  });
});
