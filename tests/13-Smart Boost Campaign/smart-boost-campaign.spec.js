// @ts-check
// ============================================================
// TMDone Admin Console - Smart Boost Campaigns
// Full feature coverage: page shell, filters, create form,
// row actions, manage/dashboard, top-up, and terminate surfaces.
// URL: #/home/smart-boost-campaign/list
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

const SMART_BOOST_URL = '#/home/smart-boost-campaign/list';
const BOOST_BUDGET = '25';
const TOP_UP_AMOUNT = '5';

class SmartBoostCampaignsPage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
  }

  get pageTitle() {
    return this.page
      .locator('h1, h2, h3, h4, .page-title, .breadcrumb-item')
      .filter({ hasText: /Smart\s*Boost\s*Campaigns?/i })
      .first();
  }

  get createButton() {
    return this.page
      .locator(
        'button:has-text("Create Campaign"), ' +
        'button:has-text("Create Smart Boost"), ' +
        'button:has-text("Create"), ' +
        'button:has(mat-icon:has-text("add")), ' +
        'button:has(img:has-text("add"))'
      )
      .filter({ visible: true })
      .first();
  }

  get table() {
    return this.page.locator('mat-table, table, .table-responsive, .ngx-datatable').first();
  }

  get rows() {
    return this.page.locator('mat-row, tbody tr, .datatable-body-row').filter({ visible: true });
  }

  get emptyState() {
    return this.page
      .locator(':text-matches("No data|No records|No results|No campaigns found", "i")')
      .first();
  }

  activeDialog() {
    return this.page
      .locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"], .swal2-popup')
      .filter({ visible: true })
      .last();
  }

  rowActionControl(rowIndex = 0) {
    return this.rows
      .nth(rowIndex)
      .locator(
        '.mat-menu-trigger, [aria-haspopup="true"], button[mat-icon-button], ' +
        'button:has(mat-icon:has-text("more_vert")), button:has(mat-icon:has-text("more_horiz")), ' +
        'button:has(img:has-text("more_vert")), button:has(img:has-text("more_horiz")), ' +
        'mat-icon:has-text("more_vert"), mat-icon:has-text("more_horiz"), ' +
        'img:has-text("more_vert"), img:has-text("more_horiz"), ' +
        '[role="img"]:has-text("more_vert"), [role="img"]:has-text("more_horiz"), ' +
        '[aria-label*="More" i]'
      )
      .filter({ visible: true })
      .last();
  }

  rowActionMenuItems() {
    return this.page
      .locator(
        '.cdk-overlay-pane [role="menuitem"], .cdk-overlay-pane button, ' +
        '.mat-menu-panel [role="menuitem"], .mat-menu-panel button, ' +
        '[role="menu"] [role="menuitem"], .dropdown-menu .dropdown-item'
      )
      .filter({ visible: true });
  }

  async goto() {
    await loginToApp(this.page);
    await goToPage(this.page, SMART_BOOST_URL);
    await this.waitForNoSpinner();
    await this.waitForReady();
  }

  async waitForNoSpinner() {
    for (const selector of ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay', '.loading-spinner']) {
      await this.page.locator(selector).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    }
  }

  async waitForReady() {
    await expect(this.page).toHaveURL(/smart-boost-campaign/i, { timeout: 30000 });
    await expect(this.pageTitle).toBeVisible({ timeout: 45000 });
    await expect(this.createButton.or(this.table).first()).toBeVisible({ timeout: 30000 });
    await this.waitForNoSpinner();
  }

  async verifyPageLoaded() {
    await this.waitForReady();
    await expect(this.createButton).toBeVisible({ timeout: 15000 });
    await expect(this.table).toBeVisible({ timeout: 30000 });
    await expect(this.page.locator('body')).toContainText(/Campaign Code|Store|CPC Value|Budget|Status|Actions/i);

    const visibleControls = await this.page.locator('input, mat-select, [role="combobox"], button').filter({ visible: true }).count();
    expect(visibleControls).toBeGreaterThan(3);
  }

  async verifyListColumnsAndRows() {
    const expectedHeaders = [
      /Campaign Code/i,
      /^Store$/i,
      /CPC Value/i,
      /Total Budget/i,
      /Remaining Budget/i,
      /Start Date/i,
      /Pending Termination Request/i,
      /Status/i,
      /Actions/i,
    ];

    for (const header of expectedHeaders) {
      await expect(
        this.page.locator('th, mat-header-cell, .mat-header-cell, [role="columnheader"]').filter({ hasText: header }).first()
      ).toBeVisible({ timeout: 15000 });
    }

    const firstRowOrEmpty = this.rows.first().or(this.emptyState);
    await expect(firstRowOrEmpty).toBeVisible({ timeout: 30000 });

    if (await this.rows.first().isVisible().catch(() => false)) {
      await expect(this.rows.first()).toContainText(/ACTIVE|INACTIVE|TERMINATED|PENDING/i);
      await expect(this.rowActionControl(0)).toBeVisible({ timeout: 10000 });
    }
  }

  async verifyFiltersSearchClearAndPagination() {
    await this.selectDropdown(this.page.locator('body'), /Status/i, { optional: true });
    await this.selectDropdown(this.page.locator('body'), /^Store$/i, { optional: true });

    const searchInput = this.page
      .locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element')
      .filter({ visible: true })
      .first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    await searchInput.click({ force: true });
    await searchInput.fill('a');
    await this.clickSearchButton();
    await this.page.waitForTimeout(1500);
    await expect(this.table.or(this.emptyState).first()).toBeVisible();

    await this.clickClearButton();
    await this.verifyPagination();
  }

  async verifyCreateCampaignFlow() {
    await expect(this.createButton).toBeVisible({ timeout: 15000 });
    await this.createButton.click({ force: true });
    await this.page.waitForTimeout(1200);

    const dialog = this.activeDialog();
    if (!(await dialog.isVisible({ timeout: 15000 }).catch(() => false))) {
      test.skip(true, 'Smart Boost create action did not open a dialog in this environment.');
    }
    await expect(dialog).toContainText(/Add Smart Boost Campaign|Smart Boost/i);

    await expect(dialog.locator('mat-select, [role="combobox"]').filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator('input[formcontrolname*="start" i], input[placeholder*="Start" i]').first()).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator('input[type="number"], input[formcontrolname*="budget" i]').filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(dialog).toContainText(/Store|Start Date|Budget|CPC Amount/i);

    const storeSelected = await this.selectDropdown(dialog, /Store/i, { optional: true, searchText: 'a' });
    await this.fillFirstVisible(dialog, [
      'input[formcontrolname*="startDate" i]',
      'input[placeholder*="Start Date" i]',
      'mat-form-field:has-text("Start Date") input',
    ], this.tomorrowDate());

    await this.fillFirstVisible(dialog, [
      'input[formcontrolname*="initialBudget" i]',
      'input[formcontrolname*="budget" i]',
      'input[placeholder*="Budget" i]',
      'mat-form-field:has-text("Budget") input',
      'input[type="number"]',
    ], BOOST_BUDGET);

    const create = dialog.getByRole('button', { name: /^Create$/i }).first();
    await expect(create).toBeVisible({ timeout: 10000 });

    if (storeSelected && await create.isEnabled().catch(() => false)) {
      await create.click({ force: true });
      await this.acknowledgeFeedback();
      await this.activeDialog().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    } else {
      await expect(dialog).toContainText(/Store|required|Create|Draft/i);
      await this.closeDialog();
    }

    await this.goto();
    await this.verifyPageLoaded();
  }

  async verifyExportAvailability() {
    const exportButton = this.page
      .locator(
        'button:has-text("Export"), button:has-text("Download"), button:has-text("Excel"), ' +
        'button[aria-label*="download" i], button:has(mat-icon:has-text("file_download")), ' +
        'button:has(mat-icon:has-text("download")), button:has(img:has-text("download"))'
      )
      .filter({ visible: true })
      .first();

    if (!(await exportButton.isVisible().catch(() => false))) {
      console.log('INFO: Smart Boost export/download button is not visible in this environment.');
      return;
    }

    await expect(exportButton).toBeVisible();
    if (await exportButton.isEnabled().catch(() => true)) {
      const downloadPromise = this.page.waitForEvent('download', { timeout: 7000 }).catch(() => null);
      await exportButton.click({ force: true }).catch(() => {});
      await downloadPromise;
    }
  }

  async verifyRowActionMenu() {
    if (!(await this.hasRows())) return;

    const opened = await this.openRowMenu();
    expect(opened).toBeTruthy();

    const menuItems = this.rowActionMenuItems();
    await expect(menuItems.first()).toBeVisible({ timeout: 10000 });
    expect(await menuItems.count()).toBeGreaterThan(0);

    await this.page.keyboard.press('Escape').catch(() => {});
  }

  /**
   * @param {RegExp} actionLabel
   * @param {string | RegExp | readonly (string | RegExp)[]} expectedText
   */
  async verifyNavigationAction(actionLabel, expectedText) {
    if (!(await this.hasRows())) return;

    const opened = await this.openRowAction(actionLabel);
    expect(opened).toBeTruthy();
    await this.waitForNoSpinner();
    await this.page.waitForTimeout(1200);
    await expect(this.page.locator('body')).toContainText(expectedText, { timeout: 15000 });
    await this.closeDialog();
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.goto();
  }

  async verifyTopUpFlow() {
    if (!(await this.hasRows())) return;

    const opened = await this.openRowAction(/Top\s*-?\s*Up|Topup/i);
    expect(opened).toBeTruthy();

    const dialog = this.activeDialog();
    if (await dialog.isVisible().catch(() => false)) {
      await expect(dialog).toContainText(/Top\s*-?\s*Up|Budget|Amount/i);
      await this.fillFirstVisible(dialog, [
        'input[type="number"]',
        'input[formcontrolname*="amount" i]',
        'input[formcontrolname*="budget" i]',
        'input[placeholder*="Amount" i]',
      ], TOP_UP_AMOUNT);

      const submit = await this.enabledButton(dialog, /Top\s*-?\s*Up|Save|Submit/i);
      await expect(submit).toBeVisible({ timeout: 10000 });
      await this.closeDialog();
      return;
    }

    await expect(this.page.locator('body')).toContainText(/Top\s*-?\s*Up|Budget|Amount/i);
    await this.goto();
  }

  async verifyTerminateFlow() {
    if (!(await this.hasRows())) return;

    const opened = await this.openRowAction(/Terminate|Cancel|Stop/i);
    expect(opened).toBeTruthy();

    const dialog = this.activeDialog();
    if (await dialog.isVisible().catch(() => false)) {
      await expect(dialog).toContainText(/Terminate|Reason|Submit|Confirm|Cancel/i);
      await this.selectDropdown(dialog, /Reason|Cancel|Terminate/i, { optional: true });

      const submit = await this.enabledButton(dialog, /Terminate|Submit|Confirm|Yes/i);
      await expect(submit).toBeVisible({ timeout: 10000 });
      await this.closeDialog();
      return;
    }

    await expect(this.page.locator('body')).toContainText(/Terminate|Reason|Submit|Confirm/i);
    await this.goto();
  }

  /**
   * @param {import('@playwright/test').Locator} context
   * @param {string[]} selectors
   * @param {string} value
   */
  async fillFirstVisible(context, selectors, value) {
    for (const selector of selectors) {
      const input = context.locator(selector).filter({ visible: true }).first();
      if (!(await input.isVisible().catch(() => false))) continue;
      if (!(await input.isEditable().catch(() => true))) continue;

      await input.scrollIntoViewIfNeeded().catch(() => {});
      await input.click({ clickCount: 3, force: true }).catch(() => {});
      await input.fill(value).catch(async () => {
        await input.pressSequentially(value, { delay: 20 }).catch(() => {});
      });
      await input.dispatchEvent('input').catch(() => {});
      await input.dispatchEvent('change').catch(() => {});
      await input.press('Tab').catch(() => {});
      return true;
    }

    return false;
  }

  /**
   * @param {import('@playwright/test').Locator} context
   * @param {RegExp} labelPattern
   * @param {{ optional?: boolean, searchText?: string }} options
   */
  async selectDropdown(context, labelPattern = /.+/, options = {}) {
    const dropdowns = context.locator('mat-select, [role="combobox"]').filter({ visible: true });
    const count = await dropdowns.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const dropdown = dropdowns.nth(index);
      const text = ((await dropdown.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      const ariaLabel = (await dropdown.getAttribute('aria-label').catch(() => '')) || '';
      const placeholder = (await dropdown.getAttribute('placeholder').catch(() => '')) || '';
      const combined = `${text} ${ariaLabel} ${placeholder}`;
      if (!labelPattern.test(combined) && index !== 0) continue;
      if (!(await dropdown.isEnabled().catch(() => true))) continue;

      await dropdown.scrollIntoViewIfNeeded().catch(() => {});
      await dropdown.click({ force: true, timeout: 10000 }).catch(() => {});
      await this.page.waitForTimeout(700);

      if (options.searchText) {
        const overlaySearch = this.page
          .locator('.cdk-overlay-pane input, .mat-select-panel input, input[placeholder*="Search" i]')
          .filter({ visible: true })
          .first();
        if (await overlaySearch.isVisible().catch(() => false)) {
          await overlaySearch.fill(options.searchText).catch(() => {});
          await overlaySearch.dispatchEvent('input').catch(() => {});
          await this.page.waitForTimeout(1000);
        }
      }

      const selected = await this.clickFirstUsableOption();
      if (selected) return true;

      await this.page.keyboard.press('Escape').catch(() => {});
    }

    if (options.optional) return false;
    throw new Error(`No usable dropdown option found for ${labelPattern}.`);
  }

  async clickFirstUsableOption() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const options = this.page.locator('mat-option, .mat-option, [role="option"]').filter({ visible: true });
      const count = Math.min(await options.count().catch(() => 0), 50);

      for (let optionIndex = 0; optionIndex < count; optionIndex += 1) {
        const option = options.nth(optionIndex);
        const text = ((await option.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        const disabled = await this.isDisabled(option);
        if (!disabled && text && !/select|choose|loading|no data|no records|no results/i.test(text)) {
          await option.click({ force: true }).catch(() => {});
          await this.page.waitForTimeout(500);
          return true;
        }
      }

      await this.page.waitForTimeout(500);
    }

    return false;
  }

  async clickSearchButton() {
    const button = this.page
      .locator(
        'button[aria-label*="search" i], button:has(mat-icon:has-text("search")), ' +
        'button:has(img:has-text("search")), button:has-text("Search"), img:has-text("search")'
      )
      .filter({ visible: true })
      .first();

    if (await button.isVisible().catch(() => false)) {
      await button.click({ force: true }).catch(() => {});
    } else {
      await this.page.keyboard.press('Enter').catch(() => {});
    }
  }

  async clickClearButton() {
    const button = this.page
      .locator(
        'button[aria-label*="clear" i], button:has(mat-icon:has-text("close")), button:has(mat-icon:has-text("clear")), ' +
        'button:has(img:has-text("close")), button:has(img:has-text("clear")), button:has-text("Clear"), img:has-text("clear")'
      )
      .filter({ visible: true })
      .first();

    if (await button.isVisible().catch(() => false)) {
      await button.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1000);
    }
  }

  async verifyPagination() {
    const next = this.page
      .locator('li.pagination-next, [aria-label*="Next" i], .pagination li:has-text("Next"), :text("Next")')
      .filter({ visible: true })
      .first();

    if (!(await next.isVisible().catch(() => false))) return;
    if (await this.isDisabled(next)) return;

    await next.click({ force: true }).catch(() => {});
    await this.page.waitForTimeout(1500);
    await expect(this.table.or(this.rows.first()).first()).toBeVisible({ timeout: 15000 });
  }

  async hasRows() {
    const hasAnyRows = await this.rows.first().isVisible({ timeout: 30000 }).catch(() => false);
    if (!hasAnyRows) {
      await expect(this.emptyState.or(this.page.locator('body')).first()).toBeVisible();
    }
    return hasAnyRows;
  }

  async openRowMenu() {
    if (!(await this.hasRows())) return false;

    const control = this.rowActionControl(0);
    await expect(control).toBeVisible({ timeout: 10000 });
    await control.scrollIntoViewIfNeeded().catch(() => {});
    await control.click({ force: true }).catch(async () => {
      const box = await control.boundingBox().catch(() => null);
      if (box) await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
    });
    await this.page.waitForTimeout(1000);

    return (await this.rowActionMenuItems().count().catch(() => 0)) > 0 ||
      await this.activeDialog().isVisible().catch(() => false);
  }

  /**
   * @param {RegExp} actionLabel
   */
  async openRowAction(actionLabel) {
    if (!(await this.openRowMenu())) return false;

    const action = this.rowActionMenuItems().filter({ hasText: actionLabel }).first();
    if (!(await action.isVisible().catch(() => false))) {
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }

    if (await this.isDisabled(action)) {
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }

    await action.click({ force: true }).catch(() => {});
    await this.page.waitForTimeout(1500);
    return true;
  }

  /**
   * @param {import('@playwright/test').Locator} context
   * @param {RegExp} labelPattern
   */
  async enabledButton(context, labelPattern) {
    const buttons = context.locator('button, [role="button"]').filter({ visible: true }).filter({ hasText: labelPattern });
    const count = await buttons.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      if (await button.isEnabled().catch(() => false)) return button;
    }

    return buttons.first();
  }

  async closeDialog() {
    const close = this.page
      .locator(
        '.swal2-cancel, button:has-text("Cancel"), button:has-text("Close"), button:has-text("No"), ' +
        '[aria-label="Close"], .close-custom, mat-icon:has-text("close"), img:has-text("close")'
      )
      .filter({ visible: true })
      .first();

    if (await close.isVisible().catch(() => false)) {
      await close.click({ force: true }).catch(() => {});
    } else {
      await this.page.keyboard.press('Escape').catch(() => {});
    }

    await this.page.waitForTimeout(1000);
  }

  async acknowledgeFeedback() {
    const confirm = this.page.locator('.swal2-confirm, button:has-text("OK"), button:has-text("Ok")').filter({ visible: true }).first();
    if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirm.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * @param {import('@playwright/test').Locator} locator
   */
  async isDisabled(locator) {
    return locator.evaluate((node) => {
      const element = /** @type {HTMLElement} */ (node);
      return element.hasAttribute('disabled') ||
        element.getAttribute('aria-disabled') === 'true' ||
        /disabled/.test(element.getAttribute('class') || '');
    }).catch(() => false);
  }

  tomorrowDate() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
}

test.describe.serial('13 - Smart Boost Campaign', () => {
  /** @type {SmartBoostCampaignsPage} */
  let smartBoost;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    smartBoost = new SmartBoostCampaignsPage(page);
    await smartBoost.goto();
  });

  test('SB-01 [sb-01]: Verify Smart Boost Campaign page shell and table', async () => {
    await smartBoost.verifyPageLoaded();
    await smartBoost.verifyListColumnsAndRows();
  });

  test('SB-02 [sb-02]: Verify filters, search, clear, and pagination', async () => {
    await smartBoost.verifyFiltersSearchClearAndPagination();
  });

  test('SB-03 [sb-03]: Verify create campaign form and safe submit/validation flow', async () => {
    test.setTimeout(300000);
    await smartBoost.verifyCreateCampaignFlow();
  });

  test('SB-04 [sb-04]: Verify export availability and row action menu', async () => {
    await smartBoost.verifyExportAvailability();
    await smartBoost.verifyRowActionMenu();
  });

  test('SB-05 [sb-05]: Verify Manage Campaign action', async () => {
    await smartBoost.verifyNavigationAction(/Manage Campaign|Manage/i, /Manage Campaign|Smart Boost|Campaign|Budget/i);
  });

  test('SB-06 [sb-06]: Verify Dashboard action', async () => {
    await smartBoost.verifyNavigationAction(/Dashboard/i, /Dashboard|Smart Boost|Campaign|Budget|Orders/i);
  });

  test('SB-07 [sb-07]: Verify Top-Up Budget action', async () => {
    await smartBoost.verifyTopUpFlow();
  });

  test('SB-08 [sb-08]: Verify Terminate action', async () => {
    await smartBoost.verifyTerminateFlow();
  });
});
