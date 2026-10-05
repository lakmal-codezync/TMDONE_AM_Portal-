// @ts-check
// ============================================================
// TMDone Admin Console - Smart Boost Campaigns
// Full feature coverage: page shell, filters, and a real
// create -> view -> top-up -> terminate lifecycle on a campaign
// this suite creates itself (never on pre-existing campaigns).
// URL: #/home/smart-boost-campaign/list
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

const SMART_BOOST_URL = '#/home/smart-boost-campaign/list';
// Server-side limits (GET /api/smartBoost/getCpcAndMinimumChargeConfigurableValues):
// CpcValue 0.15 (applied automatically), MinimumChargeValue 25 (minimum budget).
const BOOST_BUDGET = '25';
const TOP_UP_AMOUNT = '5';
// Approved test stores, in order of preference. Eat Fresh Store had no campaigns when
// this was written, so it is tried first.
const TEST_STORE_CANDIDATES = ['Eat Fresh Store', 'Food House', 'Cafe Asiana'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const TERMINATE_DESCRIPTION = 'Automated Playwright test cleanup - terminating a campaign created by the test suite.';

// Table column order: Campaign Code, Store, CPC Value, Total Budget, Remaining Budget,
// Start Date, Pending Termination Request, Status, Actions.
const COL = { code: 0, store: 1, cpc: 2, total: 3, remaining: 4, startDate: 5, pendingTermination: 6, status: 7 };

// Set by SB-03 and used by every later lifecycle test (and the afterAll cleanup), so all
// state-changing actions target only the campaign this run created.
let createdCampaignCode = '';
let createdCampaignStore = '';
let createdCampaignTerminated = false;

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

  /** @param {string} code */
  rowForCode(code) {
    return this.rows.filter({ hasText: code }).first();
  }

  /**
   * @param {import('@playwright/test').Locator} row
   * @param {number} index
   */
  async cellText(row, index) {
    return ((await row.locator('td, mat-cell').nth(index).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  async campaignCodes() {
    await this.rows.first().or(this.emptyState).waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    const count = await this.rows.count();
    const codes = [];
    for (let index = 0; index < count; index += 1) {
      codes.push(await this.cellText(this.rows.nth(index), COL.code));
    }
    return codes.filter(Boolean);
  }

  /** @param {import('@playwright/test').Locator} row */
  rowActionControl(row) {
    return row
      .locator(
        '.mat-menu-trigger, [aria-haspopup="true"], button[mat-icon-button], ' +
        'button:has(mat-icon:has-text("more_vert")), button:has(mat-icon:has-text("more_horiz")), ' +
        'mat-icon:has-text("more_vert"), mat-icon:has-text("more_horiz"), ' +
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

  /**
   * The page's loading spinner can cycle in and out, intercepting a single click attempt,
   * so wait for it and retry instead of relying on one long actionability wait.
   * @param {import('@playwright/test').Locator} locator
   */
  async clickWhenReady(locator) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await this.waitForNoSpinner();
      const clicked = await locator.click({ timeout: 8000 }).then(() => true).catch(() => false);
      if (clicked) return;
      await this.page.waitForTimeout(600);
    }
    await locator.click();
  }

  /**
   * Closes a mat-select panel left open (multi-select panels stay open after an option
   * is clicked) by clicking its transparent backdrop, which otherwise intercepts every
   * later click on the page. Escape isn't used because inside a dialog it closes the
   * whole dialog, not just the panel.
   */
  async closeOpenSelectPanel() {
    const backdrop = this.page.locator('.cdk-overlay-transparent-backdrop.cdk-overlay-backdrop-showing').last();
    if (await backdrop.isVisible().catch(() => false)) {
      await backdrop.click().catch(() => {});
      await backdrop.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
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
      await expect(this.rows.first()).toContainText(/ACTIVE|INACTIVE|TERMINATED|PENDING|ENDED/i);
      await expect(this.rowActionControl(this.rows.first())).toBeVisible({ timeout: 10000 });
    }
  }

  async verifyFiltersSearchClearAndPagination() {
    await this.selectDropdown(this.page.locator('body'), /Status/i, { optional: true });
    await this.selectDropdown(this.page.locator('body'), /^Store$/i, { optional: true });
    await this.closeOpenSelectPanel();

    const searchInput = this.page
      .locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element')
      .filter({ visible: true })
      .first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    await this.clickWhenReady(searchInput);
    await searchInput.fill('a');
    await this.clickSearchButton();
    await this.page.waitForTimeout(1500);
    await expect(this.table.or(this.emptyState).first()).toBeVisible();

    await this.clickClearButton();
    await this.verifyPagination();
  }

  /**
   * Picks the first approved test store available in the Create dialog's store dropdown.
   * The dropdown filters a large client-side list as you type, so it needs real keystrokes.
   * Escape must never be pressed here: inside this dialog it closes the whole dialog, not
   * just the dropdown panel - so the panel is closed via its transparent backdrop instead.
   * @param {import('@playwright/test').Locator} dialog
   */
  async selectTestStore(dialog) {
    const select = dialog.locator('mat-select[formcontrolname="storeId"]');
    const panel = this.page.locator('.mat-select-panel').filter({ visible: true }).last();

    for (const store of TEST_STORE_CANDIDATES) {
      await this.closeOpenSelectPanel();
      await select.click();
      await expect(panel, 'Store dropdown panel should open.').toBeVisible({ timeout: 10000 });

      const search = panel.locator('input[aria-label="dropdown search"]').first();
      // The search box sits inside an aria-disabled mat-option wrapper, so Playwright's
      // actionability check reports it as disabled; force is only used to focus it.
      await search.click({ force: true });
      await search.pressSequentially(store, { delay: 40 });

      const option = panel
        .locator('mat-option')
        .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(store)}\\s*$`, 'i') })
        .first();
      if (await option.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)) {
        await option.click();
        await expect(select, `Store dropdown should show "${store}" after selecting it.`).toContainText(store, { timeout: 5000 });
        return store;
      }
      console.log(`INFO: Test store "${store}" is not selectable in the Smart Boost store dropdown; trying the next one.`);
    }

    await this.closeOpenSelectPanel();
    return '';
  }

  /**
   * The start date input is read-only, so it has to be set through the calendar picker.
   * @param {import('@playwright/test').Locator} dialog
   * @param {Date} date
   */
  async pickStartDate(dialog, date) {
    const input = dialog.locator('input[formcontrolname="startDate"]');
    const toggle = dialog.locator('mat-datepicker-toggle button').first();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
    } else {
      await input.click();
    }

    const calendar = this.page.locator('mat-calendar').filter({ visible: true }).last();
    await expect(calendar, 'Start date calendar should open.').toBeVisible({ timeout: 10000 });

    const monthPrefix = MONTHS[date.getMonth()];
    const year = String(date.getFullYear());
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const label = ((await calendar.locator('.mat-calendar-period-button').innerText().catch(() => '')) || '').trim().toUpperCase();
      if (label.startsWith(monthPrefix) && label.endsWith(year)) break;
      await calendar.locator('button[aria-label="Next month"]').click();
      await this.page.waitForTimeout(200);
    }

    await calendar
      .locator('.mat-calendar-body-cell:not(.mat-calendar-body-disabled)')
      .filter({ hasText: new RegExp(`^\\s*${date.getDate()}\\s*$`) })
      .first()
      .click();
    await expect(input, 'Start date should be set from the calendar.').not.toHaveValue('', { timeout: 5000 });
  }

  /**
   * Creates a campaign on an approved test store and returns its auto-generated code.
   * Start date is tomorrow, so the campaign never starts running (or spending budget)
   * during the test.
   */
  async createTestCampaign() {
    const codesBefore = new Set(await this.campaignCodes());

    const storeListLoaded = this.page
      .waitForResponse((response) => /getStoreList/i.test(response.url()), { timeout: 60000 })
      .catch(() => null);
    await this.clickWhenReady(this.createButton);

    const dialog = this.activeDialog();
    await expect(dialog, 'Create Smart Boost dialog should open.').toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText(/Add Smart Boost Campaign|Smart Boost/i);
    await storeListLoaded;
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    const store = await this.selectTestStore(dialog);
    expect(store, `One of the approved test stores (${TEST_STORE_CANDIDATES.join(', ')}) should be selectable.`).toBeTruthy();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await this.pickStartDate(dialog, tomorrow);

    const budgetInput = dialog.locator('input[formcontrolname="initialBudget"]');
    await budgetInput.fill(BOOST_BUDGET);
    await expect(budgetInput).toHaveValue(BOOST_BUDGET);

    // CPC is not editable: the input is disabled and populated from the server's CpcValue.

    const create = dialog.getByRole('button', { name: /^Create$/i }).first();
    await expect(create, 'Create should be enabled once store, start date and budget are set.').toBeEnabled({ timeout: 10000 });
    await create.click();
    await this.acknowledgeFeedback();
    await expect(dialog, 'Create dialog should close after a successful create.').toBeHidden({ timeout: 20000 });

    await this.goto();
    const newCodes = (await this.campaignCodes()).filter((code) => !codesBefore.has(code));
    expect(newCodes, `Exactly one new Smart Boost campaign should appear for "${store}".`).toHaveLength(1);

    const code = newCodes[0];
    const row = this.rowForCode(code);
    expect(await this.cellText(row, COL.store), 'The new campaign should belong to the selected test store.').toBe(store);
    expect(Number(await this.cellText(row, COL.total)), 'The new campaign total budget should match what was entered.').toBe(Number(BOOST_BUDGET));
    return { code, store };
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
      await this.clickWhenReady(exportButton).catch(() => {});
      await downloadPromise;
    }
  }

  /** @param {string} code */
  async verifyRowActionMenu(code) {
    const opened = await this.openRowMenu(this.rowForCode(code));
    expect(opened, `Campaign ${code} should open its row action menu.`).toBe(true);

    const menuItems = this.rowActionMenuItems();
    await expect(menuItems.first()).toBeVisible({ timeout: 10000 });
    expect(await menuItems.count()).toBeGreaterThan(0);

    await this.page.keyboard.press('Escape').catch(() => {});
  }

  /**
   * @param {RegExp} actionLabel
   * @param {string | RegExp | readonly (string | RegExp)[]} expectedText
   * @param {string} code
   */
  async verifyNavigationAction(actionLabel, expectedText, code) {
    const opened = await this.openRowAction(actionLabel, this.rowForCode(code));
    expect(opened, `Campaign ${code} should expose the ${actionLabel} action.`).toBe(true);
    await this.waitForNoSpinner();
    await this.page.waitForTimeout(1200);
    await expect(this.page.locator('body')).toContainText(expectedText, { timeout: 15000 });
    await this.closeDialog();
    await this.goto();
  }

  /** @param {string} code */
  async verifyTopUpFlow(code) {
    const row = this.rowForCode(code);
    await expect(row, `Campaign ${code} should be listed before topping up.`).toBeVisible({ timeout: 30000 });
    const totalBefore = Number(await this.cellText(row, COL.total));

    const opened = await this.openRowAction(/Top\s*-?\s*Up/i, row);
    expect(opened, `Campaign ${code} should expose the Top-Up Budget action.`).toBe(true);

    const dialog = this.activeDialog();
    await expect(dialog, 'Top-Up dialog should open.').toBeVisible({ timeout: 15000 });
    const amount = dialog.locator('input[formcontrolname="topUpAmount"]');
    await amount.fill(TOP_UP_AMOUNT);
    await expect(amount).toHaveValue(TOP_UP_AMOUNT);

    const confirm = dialog.getByRole('button', { name: /Confirm Top\s*-?\s*Up/i });
    await expect(confirm, 'Confirm Top-Up should be enabled once an amount is entered.').toBeEnabled({ timeout: 10000 });
    await confirm.click();
    await this.acknowledgeFeedback();
    await expect(dialog, 'Top-Up dialog should close after confirming.').toBeHidden({ timeout: 20000 });

    await this.goto();
    const expectedTotal = (totalBefore + Number(TOP_UP_AMOUNT)).toFixed(3);
    await expect(
      this.rowForCode(code).locator('td, mat-cell').nth(COL.total),
      `Campaign ${code} total budget should increase by ${TOP_UP_AMOUNT} after topping up.`
    ).toHaveText(expectedTotal, { timeout: 15000 });
  }

  /**
   * Terminates the given campaign through the UI. Used by SB-08 and by the afterAll
   * cleanup, and only ever called with a campaign code this suite created.
   * @param {string} code
   */
  async terminateCampaign(code) {
    const row = this.rowForCode(code);
    await expect(row, `Campaign ${code} should be listed before terminating it.`).toBeVisible({ timeout: 30000 });

    const opened = await this.openRowAction(/Terminate/i, row);
    expect(opened, `Campaign ${code} should expose the Terminate action.`).toBe(true);

    const dialog = this.activeDialog();
    await expect(dialog, 'Terminate dialog should open.').toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText(/Terminate Campaign/i);

    const reason = dialog.locator('mat-select[formcontrolname="terminateReason"]');
    await reason.click();
    const reasonPanel = this.page.locator('.mat-select-panel').filter({ visible: true }).last();
    await expect(reasonPanel, 'Terminate reason options should open.').toBeVisible({ timeout: 10000 });
    await reasonPanel.locator('mat-option:not(.mat-option-disabled)').filter({ hasText: /\S/ }).first().click();
    await reasonPanel.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    await dialog.locator('textarea[formcontrolname="terminateDescription"]').fill(TERMINATE_DESCRIPTION);

    const confirm = dialog.getByRole('button', { name: /Confirm Terminate/i });
    await expect(confirm, 'Confirm Terminate should be enabled once a reason is selected.').toBeEnabled({ timeout: 10000 });
    await confirm.click();
    await this.acknowledgeFeedback();
    await expect(dialog, 'Terminate dialog should close after confirming.').toBeHidden({ timeout: 20000 });
  }

  /** @param {string} code */
  async verifyTerminateFlow(code) {
    await this.terminateCampaign(code);
    createdCampaignTerminated = true;

    await this.goto();
    const row = this.rowForCode(code);
    await expect(row, `Campaign ${code} should still be listed after terminating it.`).toBeVisible({ timeout: 30000 });
    const status = await this.cellText(row, COL.status);
    const pendingTermination = await this.cellText(row, COL.pendingTermination);
    console.log(`INFO: Campaign ${code} after terminate - status "${status}", pending termination request "${pendingTermination}".`);
    expect(
      /TERMINATED|ENDED|CANCELL?ED|INACTIVE/i.test(status) || /^yes$/i.test(pendingTermination),
      `Campaign ${code} should be terminated (or have a pending termination request) after confirming Terminate.`
    ).toBe(true);
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
      await this.clickWhenReady(dropdown).catch(() => {});
      await this.page.waitForTimeout(700);

      if (options.searchText) {
        const overlaySearch = this.page
          .locator('.cdk-overlay-pane input, .mat-select-panel input')
          .filter({ visible: true })
          .first();
        if (await overlaySearch.isVisible().catch(() => false)) {
          await overlaySearch.pressSequentially(options.searchText, { delay: 40 }).catch(() => {});
          await this.page.waitForTimeout(1000);
        }
      }

      const selected = await this.clickFirstUsableOption();
      await this.closeOpenSelectPanel();
      if (selected) return true;
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
          await option.click().catch(() => {});
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
        'button:has(img:has-text("search")), button:has-text("Search")'
      )
      .filter({ visible: true })
      .first();

    if (await button.isVisible().catch(() => false)) {
      await this.clickWhenReady(button).catch(() => {});
    } else {
      await this.page.keyboard.press('Enter').catch(() => {});
    }
  }

  async clickClearButton() {
    const button = this.page
      .locator(
        'button[aria-label*="clear" i], button:has(mat-icon:has-text("close")), button:has(mat-icon:has-text("clear")), ' +
        'button:has(img:has-text("close")), button:has(img:has-text("clear")), button:has-text("Clear")'
      )
      .filter({ visible: true })
      .first();

    if (await button.isVisible().catch(() => false)) {
      await this.clickWhenReady(button).catch(() => {});
      await this.page.waitForTimeout(1000);
    }
  }

  async verifyPagination() {
    const next = this.page
      .locator('li.pagination-next, [aria-label*="Next" i], .pagination li:has-text("Next")')
      .filter({ visible: true })
      .first();

    if (!(await next.isVisible().catch(() => false))) return;
    if (await this.isDisabled(next)) return;

    await this.clickWhenReady(next).catch(() => {});
    await this.page.waitForTimeout(1500);
    await expect(this.table.or(this.rows.first()).first()).toBeVisible({ timeout: 15000 });
  }

  /** @param {import('@playwright/test').Locator} row */
  async openRowMenu(row) {
    if (!(await row.isVisible({ timeout: 30000 }).catch(() => false))) return false;

    const control = this.rowActionControl(row);
    await expect(control).toBeVisible({ timeout: 10000 });
    await control.scrollIntoViewIfNeeded().catch(() => {});
    await this.clickWhenReady(control);
    await this.page.waitForTimeout(1000);

    return (await this.rowActionMenuItems().count().catch(() => 0)) > 0;
  }

  /**
   * @param {RegExp} actionLabel
   * @param {import('@playwright/test').Locator} row
   */
  async openRowAction(actionLabel, row) {
    if (!(await this.openRowMenu(row))) return false;

    const action = this.rowActionMenuItems().filter({ hasText: actionLabel }).first();
    if (!(await action.isVisible().catch(() => false)) || await this.isDisabled(action)) {
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }

    await action.click();
    await this.page.waitForTimeout(1500);
    return true;
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
      await close.click().catch(() => {});
    } else {
      await this.page.keyboard.press('Escape').catch(() => {});
    }

    await this.page.waitForTimeout(1000);
  }

  async acknowledgeFeedback() {
    const confirm = this.page.locator('.swal2-confirm, button:has-text("OK"), button:has-text("Ok")').filter({ visible: true }).first();
    if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirm.click().catch(() => {});
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
}

test.describe.serial('13 - Smart Boost Campaign', () => {
  /** @type {SmartBoostCampaignsPage} */
  let smartBoost;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    smartBoost = new SmartBoostCampaignsPage(page);
    await smartBoost.goto();
  });

  // Safety net: if a later lifecycle test fails, still terminate the campaign this run
  // created, so no live ad campaign is left behind on a shared test store.
  test.afterAll(async ({ browser }) => {
    if (!createdCampaignCode || createdCampaignTerminated) return;
    test.setTimeout(240000);
    const page = await browser.newPage();
    try {
      const cleanup = new SmartBoostCampaignsPage(page);
      await cleanup.goto();
      await cleanup.terminateCampaign(createdCampaignCode);
      createdCampaignTerminated = true;
      console.log(`INFO: Cleanup terminated test campaign ${createdCampaignCode} (${createdCampaignStore}).`);
    } catch (error) {
      console.log(`WARNING: Could not terminate test campaign ${createdCampaignCode} (${createdCampaignStore}) during cleanup: ${error instanceof Error ? error.message : error}`);
    } finally {
      await page.close();
    }
  });

  test('SB-01 [sb-01]: Verify Smart Boost Campaign page shell and table', async () => {
    await smartBoost.verifyPageLoaded();
    await smartBoost.verifyListColumnsAndRows();
  });

  test('SB-02 [sb-02]: Verify filters, search, clear, and pagination', async () => {
    await smartBoost.verifyFiltersSearchClearAndPagination();
  });

  test('SB-03 [sb-03]: Create a campaign on a test store and confirm it appears in the list', async () => {
    test.setTimeout(300000);
    const { code, store } = await smartBoost.createTestCampaign();
    createdCampaignCode = code;
    createdCampaignStore = store;
    console.log(`INFO: Created Smart Boost test campaign ${code} on ${store}.`);
  });

  test('SB-04 [sb-04]: Verify export availability and the created campaign row action menu', async () => {
    await smartBoost.verifyExportAvailability();
    await smartBoost.verifyRowActionMenu(createdCampaignCode);
  });

  test('SB-05 [sb-05]: View the created campaign via Manage Campaign', async () => {
    await smartBoost.verifyNavigationAction(/Manage Campaign|Manage/i, /Manage Campaign|Smart Boost|Campaign|Budget/i, createdCampaignCode);
  });

  test('SB-06 [sb-06]: View the created campaign Dashboard', async () => {
    await smartBoost.verifyNavigationAction(/Dashboard/i, /Dashboard|Smart Boost|Campaign|Budget|Orders/i, createdCampaignCode);
  });

  test('SB-07 [sb-07]: Top up the created campaign budget and confirm the new total', async () => {
    await smartBoost.verifyTopUpFlow(createdCampaignCode);
  });

  test('SB-08 [sb-08]: Terminate the created campaign and confirm it is ended', async () => {
    await smartBoost.verifyTerminateFlow(createdCampaignCode);
  });
});
