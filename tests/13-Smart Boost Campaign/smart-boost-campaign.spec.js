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
let createdCampaignTerminateReason = '';
let createdCampaignStartDate = '';
// Set the moment SB-03 clicks Create: lets the afterAll find the campaign again if SB-03
// failed before its code was known (e.g. the confirmation step or the list reload failed).
/** @type {Set<string> | null} */
let codesBeforeCreate = null;

/** @param {Date} date dd/mm/yyyy, the format this app displays dates in */
function formatDate(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

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

  get searchInput() {
    return this.page.locator('input[formcontrolname="searchTerm"]').filter({ visible: true }).first();
  }

  get statusFilter() {
    return this.page.locator('mat-select[formcontrolname="status"]').filter({ visible: true }).first();
  }

  get storeFilter() {
    return this.page.locator('mat-select[formcontrolname="storeIds"]').filter({ visible: true }).first();
  }

  get searchButton() {
    return this.page.locator('button[mattooltip="Search"]').filter({ visible: true }).first();
  }

  get clearFiltersButton() {
    return this.page.locator('button[mattooltip="Clear Filters"]').filter({ visible: true }).first();
  }

  /**
   * Clicks the toolbar Search button (filters only apply through it) and returns the
   * payload of the list request it triggered.
   * @returns {Promise<Record<string, any>>}
   */
  async applyListFilters() {
    const listResponse = this.page.waitForResponse(
      (response) => /\/api\/smartBoost\/list/i.test(response.url()) && response.request().method() === 'POST',
      { timeout: 30000 }
    );
    await this.clickWhenReady(this.searchButton);
    const response = await listResponse;
    expect(response.ok(), `Smart Boost list request should succeed (HTTP ${response.status()}).`).toBe(true);
    await this.waitForNoSpinner();
    await this.page.waitForTimeout(800);
    return response.request().postDataJSON() || {};
  }

  /** @param {string} text */
  async searchByText(text) {
    await this.clickWhenReady(this.searchInput);
    await this.searchInput.fill(text);
    await expect(this.searchInput).toHaveValue(text);
    const payload = await this.applyListFilters();
    expect(payload.SearchString, 'The search text should be sent with the list request.').toBe(text);
    return payload;
  }

  /**
   * Picks exactly these options in the multi-select Status filter.
   * @param {string[]} statuses
   */
  async setStatusFilter(statuses) {
    await this.closeOpenSelectPanel();
    await this.clickWhenReady(this.statusFilter);
    const panel = this.page.locator('.mat-select-panel').filter({ visible: true }).last();
    await expect(panel, 'Status filter options should open.').toBeVisible({ timeout: 10000 });
    const options = panel.locator('mat-option');
    const count = await options.count();
    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index);
      const label = ((await option.innerText()) || '').trim();
      const selected = (await option.getAttribute('aria-selected')) === 'true';
      if (selected !== statuses.includes(label)) await option.click();
    }
    await this.closeOpenSelectPanel();
    for (const status of statuses) await expect(this.statusFilter).toContainText(status);
  }

  /** @param {number} column */
  async columnValues(column) {
    const count = await this.rows.count();
    const values = [];
    for (let index = 0; index < count; index += 1) {
      values.push(await this.cellText(this.rows.nth(index), column));
    }
    return values;
  }

  async clearListFilters() {
    const listResponse = this.page.waitForResponse(
      (response) => /\/api\/smartBoost\/list/i.test(response.url()) && response.request().method() === 'POST',
      { timeout: 30000 }
    );
    await this.clickWhenReady(this.clearFiltersButton);
    const payload = (await listResponse).request().postDataJSON() || {};
    await this.waitForNoSpinner();
    await expect(this.searchInput, 'Clear Filters should empty the search box.').toHaveValue('');
    await expect(this.statusFilter, 'Clear Filters should reset the Status filter.').not.toContainText(/DRAFT|ACTIVE|EXHAUSTED|ENDED/);
    expect(payload.SearchString || '', 'Clear Filters should reload the list without a search text.').toBe('');
    expect(payload.Status || [], 'Clear Filters should reload the list without a status filter.').toEqual([]);
  }

  async verifyStatusFilterSearchAndClear() {
    const statusOptions = this.page.locator('.mat-select-panel mat-option');
    await this.clickWhenReady(this.statusFilter);
    await expect(statusOptions.first()).toBeVisible({ timeout: 10000 });
    expect((await statusOptions.allInnerTexts()).map((text) => text.trim()), 'Status filter options').toEqual(['DRAFT', 'ACTIVE', 'EXHAUSTED', 'ENDED']);
    await this.closeOpenSelectPanel();

    await this.setStatusFilter(['ENDED']);
    const payload = await this.applyListFilters();
    expect(payload.Status, 'The chosen status should be sent with the list request.').toEqual(['ENDED']);
    await expect(this.rows.first(), 'Ended campaigns should be listed (every test run leaves one).').toBeVisible({ timeout: 15000 });
    const statuses = await this.columnValues(COL.status);
    expect(statuses.every((status) => status === 'ENDED'), `Only ENDED campaigns should be listed, got ${JSON.stringify([...new Set(statuses)])}.`).toBe(true);

    const code = await this.cellText(this.rows.first(), COL.code);
    await this.searchByText(code);
    await expect(this.rows, `Searching for campaign code ${code} should return exactly that campaign.`).toHaveCount(1, { timeout: 15000 });
    expect(await this.cellText(this.rows.first(), COL.code)).toBe(code);

    await this.clearListFilters();
    await expect(this.rows.first()).toBeVisible({ timeout: 15000 });
    expect(await this.rows.count(), 'Clearing the filters should list more than the single searched campaign.').toBeGreaterThan(1);
  }

  /**
   * The created campaign must be found by its code and by its status, and must disappear
   * under a status filter it does not match.
   * @param {string} code
   * @param {string} store
   */
  async verifyCreatedCampaignFilters(code, store) {
    await this.setStatusFilter(['ENDED']);
    await this.searchByText(code);
    await expect(this.rowForCode(code), `Ended campaign ${code} should match Status = ENDED.`).toBeVisible({ timeout: 15000 });
    await expect(this.rows).toHaveCount(1);
    expect(await this.cellText(this.rows.first(), COL.store)).toBe(store);

    await this.setStatusFilter(['ACTIVE']);
    const payload = await this.applyListFilters();
    expect(payload.Status).toEqual(['ACTIVE']);
    expect(payload.SearchString).toBe(code);
    await expect(this.rows, `Ended campaign ${code} must not match Status = ACTIVE.`).toHaveCount(0, { timeout: 15000 });

    await this.clearListFilters();
    await expect(this.rowForCode(code), `Campaign ${code} should be listed again after clearing the filters.`).toBeVisible({ timeout: 15000 });
  }

  /**
   * List Store filter (multi-select with a search box over every store): only the chosen
   * store's campaigns are listed, including the campaign this run created, and Clear
   * Filters removes the store filter again.
   * @param {string} store
   * @param {string} code
   */
  async verifyListStoreFilter(store, code) {
    await this.closeOpenSelectPanel();
    await this.clickWhenReady(this.storeFilter);
    const panel = this.page.locator('.mat-select-panel').filter({ visible: true }).last();
    await expect(panel, 'Store filter options should open.').toBeVisible({ timeout: 10000 });
    const search = panel.locator('input[aria-label="dropdown search"]').first();
    // The search box sits inside an aria-disabled option wrapper; force only focuses it.
    await search.click({ force: true });
    await search.pressSequentially(store, { delay: 40 });
    const option = panel.locator('mat-option').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(store)}\\s*$`, 'i') }).first();
    await expect(option, `Store filter should offer "${store}" (store options load from an API).`).toBeVisible({ timeout: 45000 });
    await option.click();
    await this.closeOpenSelectPanel();
    await expect(this.storeFilter).toContainText(store);

    const payload = await this.applyListFilters();
    expect(payload.StoreIds, 'Exactly the chosen store should be sent with the list request.').toHaveLength(1);
    await expect(this.rows.first(), `${store} campaigns should be listed.`).toBeVisible({ timeout: 15000 });
    const stores = await this.columnValues(COL.store);
    expect(stores.every((value) => value === store), `Only ${store} campaigns should be listed, got ${JSON.stringify([...new Set(stores)])}.`).toBe(true);
    await expect(this.rowForCode(code), `Test campaign ${code} should be among ${store}'s campaigns.`).toBeVisible();

    const listResponse = this.page.waitForResponse(
      (response) => /\/api\/smartBoost\/list/i.test(response.url()) && response.request().method() === 'POST',
      { timeout: 30000 }
    );
    await this.clickWhenReady(this.clearFiltersButton);
    const cleared = (await listResponse).request().postDataJSON() || {};
    expect(cleared.StoreIds || [], 'Clear Filters should reload the list without a store filter.').toEqual([]);
    await expect(this.storeFilter, 'Clear Filters should reset the Store filter.').not.toContainText(store);
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
    await expect(input, 'Start date should be the day picked in the calendar.').toHaveValue(formatDate(date), { timeout: 5000 });
  }

  /**
   * Creates a campaign on an approved test store and returns its auto-generated code.
   * Start date is tomorrow, so the campaign never starts running (or spending budget)
   * during the test.
   * @param {(info: { code: string, store: string, startDate: string, codesBefore: Set<string> }) => void} onCreated
   *   Called right before Create is clicked (code '') and again as soon as the new code is known.
   */
  async createTestCampaign(onCreated = () => {}) {
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

    const startDate = formatDate(tomorrow);
    const create = dialog.getByRole('button', { name: /^Create$/i }).first();
    await expect(create, 'Create should be enabled once store, start date and budget are set.').toBeEnabled({ timeout: 10000 });
    // From the moment Create is clicked the campaign may exist on the live store, so record
    // what is needed to find it again before any further check can fail.
    onCreated({ code: '', store, startDate, codesBefore });
    await create.click();
    await this.acknowledgeFeedback();
    await expect(dialog, 'Create dialog should close after a successful create.').toBeHidden({ timeout: 20000 });

    await this.goto();
    const newCodes = await this.findNewCampaignCodes(codesBefore, store, startDate);
    // Record the code as soon as it is known (and unambiguous), before the remaining
    // assertions run, so the afterAll safety net can terminate it if one of them fails.
    if (newCodes.length === 1) onCreated({ code: newCodes[0], store, startDate, codesBefore });
    expect(newCodes, `Exactly one new Smart Boost campaign starting ${startDate} should appear for "${store}".`).toHaveLength(1);

    const code = newCodes[0];
    const row = this.rowForCode(code);
    expect(await this.cellText(row, COL.store), 'The new campaign should belong to the selected test store.').toBe(store);
    expect(Number(await this.cellText(row, COL.total)), 'The new campaign total budget should match what was entered.').toBe(Number(BOOST_BUDGET));
    expect(await this.cellText(row, COL.startDate), 'The new campaign should start tomorrow.').toBe(startDate);
    return { code, store, startDate };
  }

  /**
   * Codes listed now that were not listed before, narrowed to the given store and start
   * date, so a campaign someone else creates at the same moment is never mistaken for ours.
   * @param {Set<string>} codesBefore
   * @param {string} store
   * @param {string} startDate dd/mm/yyyy
   */
  async findNewCampaignCodes(codesBefore, store, startDate) {
    const fresh = (await this.campaignCodes()).filter((code) => !codesBefore.has(code));
    const matching = [];
    for (const code of fresh) {
      const row = this.rowForCode(code);
      if ((await this.cellText(row, COL.store)) === store && (await this.cellText(row, COL.startDate)) === startDate) {
        matching.push(code);
      }
    }
    if (fresh.length !== matching.length) {
      console.log(`INFO: New campaigns ${JSON.stringify(fresh)} narrowed to ${JSON.stringify(matching)} by store "${store}" and start date ${startDate}.`);
    }
    return matching;
  }

  /**
   * Opens the created campaign's row menu and checks the actions a not-yet-started campaign
   * offers, then closes the menu without choosing anything.
   * @param {string} code
   */
  async verifyRowActionMenu(code) {
    const opened = await this.openRowMenu(this.rowForCode(code));
    expect(opened, `Campaign ${code} should open its row action menu.`).toBe(true);

    const menuItems = this.rowActionMenuItems();
    await expect(menuItems.first()).toBeVisible({ timeout: 10000 });
    const labels = (await menuItems.allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
    console.log(`INFO: Campaign ${code} row actions: ${JSON.stringify(labels)}`);
    for (const expected of [/Manage Campaign/i, /Dashboard/i, /Top\s*-?\s*Up/i, /Terminate/i]) {
      expect(labels.some((label) => expected.test(label)), `Row actions ${JSON.stringify(labels)} should include ${expected}.`).toBe(true);
    }

    // No dialog is open here, so Escape only closes the menu.
    await this.page.keyboard.press('Escape');
    await expect(menuItems.first()).toBeHidden({ timeout: 5000 });
  }

  /** The Manage Campaign dialog (div.modal-dialog) of the given campaign. */
  manageDialog() {
    return this.page
      .locator('mat-dialog-container, [role="dialog"], .modal-dialog')
      .filter({ hasText: /Manage\s*Campaign/i })
      .filter({ visible: true })
      .last();
  }

  /** @param {string} code */
  async openManageCampaign(code) {
    const opened = await this.openRowAction(/Manage Campaign/i, this.rowForCode(code));
    expect(opened, `Campaign ${code} should expose the Manage Campaign action.`).toBe(true);
    const dialog = this.manageDialog();
    await expect(dialog, 'Manage Campaign dialog should open.').toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText(code);
    return dialog;
  }

  /**
   * @param {import('@playwright/test').Locator} dialog
   * @param {RegExp} tab
   */
  async openManageTab(dialog, tab) {
    await dialog.locator('button.tab-btn').filter({ hasText: tab }).first().click();
    await expect(dialog.locator('button.tab-btn.active')).toContainText(tab, { timeout: 10000 });
    await this.waitForNoSpinner();
  }

  /** @param {import('@playwright/test').Locator} dialog */
  async closeManageDialog(dialog) {
    await dialog.locator('button, mat-icon, span').filter({ hasText: /^\s*close\s*$/ }).first().click();
    await expect(dialog, 'Manage Campaign dialog should close.').toBeHidden({ timeout: 10000 });
  }

  /**
   * View: the Manage Campaign dialog shows this campaign's read-only details.
   * @param {string} code
   * @param {string} store
   * @param {string} startDate dd/mm/yyyy
   */
  async verifyManageCampaignDetails(code, store, startDate) {
    const dialog = await this.openManageCampaign(code);
    await expect(dialog).toContainText(/PENDING|ACTIVE|DRAFT/);
    for (const tab of [/Campaign Details/, /Status Actions/, /Terminate History/, /Topup History/]) {
      await expect(dialog.locator('button.tab-btn').filter({ hasText: tab }), `Manage Campaign should have the ${tab} tab.`).toBeVisible();
    }
    await this.openManageTab(dialog, /Campaign Details/);
    await expect(dialog.locator('input[formcontrolname="code"]')).toHaveValue(code);
    await expect(dialog.locator('input[formcontrolname="storeId"]')).toHaveValue(store);
    await expect(dialog.locator('input[formcontrolname="initialBudget"]')).toHaveValue(BOOST_BUDGET);
    await expect(dialog.locator('input[formcontrolname="cpcAmount"]')).toHaveValue('0.15');
    await expect(dialog.locator('input[formcontrolname="startDate"]')).toHaveValue(startDate);
    await expect(dialog.locator('input[formcontrolname="code"]'), 'Campaign details are read-only.').toBeDisabled();
    await this.closeManageDialog(dialog);
  }

  /**
   * View: the campaign Dashboard page shows this campaign's header and KPI cards.
   * @param {string} code
   * @param {string} store
   */
  async verifyCampaignDashboard(code, store) {
    const opened = await this.openRowAction(/Dashboard/i, this.rowForCode(code));
    expect(opened, `Campaign ${code} should expose the Dashboard action.`).toBe(true);
    await expect(this.page, 'Dashboard should open on its own route.').toHaveURL(/smart-boost-campaign\/dashboard\/[0-9a-f]{24}/i, { timeout: 30000 });
    await this.waitForNoSpinner();
    const content = this.page.locator('section.content, .content').first();
    await expect(content).toContainText(code, { timeout: 30000 });
    await expect(content).toContainText(store);
    // Card labels are upper-cased only by CSS, so match them case-insensitively.
    const cards = ['Total Clicks', 'Total Spend', 'Remaining Budget', 'CPC Value', 'Active Campaign Days', 'ROI', 'Order Count', 'Average Order Value', 'Click to Order Rate', 'Clicks Over Time'];
    for (const card of cards) {
      await expect(content, `Dashboard should show "${card}".`).toContainText(new RegExp(escapeRegExp(card), 'i'));
    }
    await expect(content, 'Dashboard should show the untouched 25 OMR budget.').toContainText(/Remaining Budget\s*25\.000/i);
    await expect(content, 'Dashboard should show the 0.15 CPC.').toContainText(/CPC Value\s*0\.150/i);
    await expect(content, 'A campaign that has not started has no clicks yet.').toContainText(/Total Clicks\s*0(?!\d)/i);

    await this.clickWhenReady(this.page.locator('button').filter({ hasText: /^\s*arrow_back\s*$/ }).first());
    await expect(this.page, 'Back arrow should return to the campaign list.').toHaveURL(/smart-boost-campaign\/list/i, { timeout: 30000 });
  }

  /** @param {string} code */
  async verifyTopUpHistory(code) {
    const dialog = await this.openManageCampaign(code);
    await this.openManageTab(dialog, /Topup History/);
    const historyRow = dialog.locator('tbody tr, mat-row').filter({ hasText: /\d/ }).first();
    await expect(historyRow, `Topup History of ${code} should list the top-up made by SB-07.`).toBeVisible({ timeout: 20000 });
    // Columns: Amount, Topped-up By, Date (cells have no separating whitespace in textContent).
    await expect(historyRow.locator('td, mat-cell').first(), `The top-up amount should be ${TOP_UP_AMOUNT}.`)
      .toHaveText(new RegExp(`^\\s*${TOP_UP_AMOUNT}(\\.0+)?\\s*$`));
    await expect(historyRow, 'The top-up should be dated today.').toContainText(formatDate(new Date()));
    await this.closeManageDialog(dialog);
  }

  /**
   * @param {string} code
   * @param {string} reason
   */
  async verifyTerminateHistory(code, reason) {
    const dialog = await this.openManageCampaign(code);
    await expect(dialog).toContainText('ENDED');
    await this.openManageTab(dialog, /Terminate History/);
    const historyRow = dialog.locator('tbody tr, mat-row').filter({ hasText: reason }).first();
    await expect(historyRow, `Terminate History of ${code} should record the "${reason}" termination.`).toBeVisible({ timeout: 20000 });
    const now = new Date();
    const today = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    await expect(historyRow).toContainText(today);
    await this.closeManageDialog(dialog);
  }

  async openAnalytics() {
    await this.clickWhenReady(this.page.locator('button').filter({ hasText: /Analytics/ }).filter({ visible: true }).first());
    await expect(this.page, 'Analytics should open on its own route.').toHaveURL(/smart-boost-campaign\/analytics/i, { timeout: 30000 });
    await expect(this.page.locator('h1, h2, h3, h4').filter({ hasText: /Smart Boost Analytics/i }).first()).toBeVisible({ timeout: 45000 });
    await this.waitForNoSpinner();
  }

  /** @param {RegExp} tab */
  async openAnalyticsTab(tab) {
    await this.clickWhenReady(this.page.locator('[role="tab"]').filter({ hasText: tab }).first());
    await expect(this.page.locator('[role="tab"][aria-selected="true"]')).toContainText(tab, { timeout: 10000 });
    await this.waitForNoSpinner();
    return this.page.locator('.mat-tab-body-active');
  }

  async verifyAnalyticsOverview() {
    const content = this.page.locator('section.content, .content').first();
    await expect(content).toContainText('Report Filters');
    // Card labels are upper-cased only by CSS, so match them case-insensitively.
    for (const card of ['Total Clicks', 'Budget', 'Total Spend', 'Remaining Budget', 'CPC Value', 'Active Campaign Days', 'ROI', 'Order Count', 'Revenue', 'Clicks Over Time']) {
      await expect(content, `Analytics should show "${card}".`).toContainText(new RegExp(escapeRegExp(card), 'i'), { timeout: 20000 });
    }
    const now = new Date();
    await expect(this.page.locator('input[formcontrolname="month"]'), 'The cycle month defaults to the current month.')
      .toHaveValue(`01/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`);

    const tabs = {
      Campaigns: ['CAMPAIGN CODE', 'STORE', 'CPC VALUE (OMR)', 'TOTAL BUDGET (OMR)', 'REMAINING BUDGET (OMR)', 'START DATE', 'STATUS'],
      'Termination History': ['CAMPAIGN', 'STORE', 'REASON', 'REQUESTED BY', 'REQUESTED DATE', 'APPROVED BY', 'APPROVED DATE', 'STATUS'],
      'Cycle History': ['CAMPAIGN', 'STORE', 'EVENT TYPE', 'CYCLE', 'BUDGET', 'SPEND', 'REMAINING', 'EVENT DATE', 'NOTES'],
      'Budget Status': ['CAMPAIGN', 'STORE', 'EVENT TYPE', 'CPC AMOUNT', 'REMAINING BUDGET', 'TOP-UP AMOUNT', 'BUDGET BEFORE', 'BUDGET AFTER', 'EVENT DATE', 'NOTES'],
      Orders: ['ORDER NUMBER', 'CUSTOMER', 'STORE', 'INVOICE NO', 'DATE/TIME', 'PAYMENT TYPE', 'DELIVERY FEE', 'AMOUNT', 'STATUS'],
    };
    for (const [tab, headers] of Object.entries(tabs)) {
      const body = await this.openAnalyticsTab(new RegExp(`^\\s*${escapeRegExp(tab)}\\s*$`));
      const actual = (await body.locator('th').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim().toUpperCase());
      expect(actual, `Analytics "${tab}" tab columns`).toEqual(headers);
    }

    await this.clickWhenReady(this.page.locator('button[mattooltip="Back to Campaign List"]'));
    await expect(this.page, 'Back to Campaign List should return to the list.').toHaveURL(/smart-boost-campaign\/list/i, { timeout: 30000 });
  }

  /**
   * Analytics store filter: only that store's campaigns are listed for the cycle, including
   * the campaign this run created (its start date falls in the current cycle month).
   * @param {string} store
   * @param {string} code
   */
  async verifyAnalyticsStoreFilter(store, code) {
    const select = this.page.locator('mat-select[formcontrolname="storeId"]');
    await this.clickWhenReady(select);
    const panel = this.page.locator('.mat-select-panel').filter({ visible: true }).last();
    await expect(panel, 'Analytics store dropdown should open.').toBeVisible({ timeout: 10000 });
    const search = panel.locator('input[aria-label="dropdown search"]').first();
    // The search box sits inside an aria-disabled option wrapper; force only focuses it.
    await search.click({ force: true });
    await search.pressSequentially(store, { delay: 40 });
    const option = panel.locator('mat-option').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(store)}\\s*$`, 'i') }).first();
    await expect(option).toBeVisible({ timeout: 20000 });
    await option.click();
    await this.closeOpenSelectPanel();
    await expect(select).toContainText(store);

    const filtered = this.page.waitForResponse(
      (response) => /\/api\/smartBoost\/getActiveOrTerminatedCpcList$/i.test(response.url().split('?')[0]) && response.request().method() === 'POST',
      { timeout: 30000 }
    );
    const filterSearch = this.page.locator('button[mattooltip="Search"]').filter({ visible: true }).first();
    await expect(filterSearch, 'Search becomes enabled once a filter is chosen.').toBeEnabled({ timeout: 10000 });
    await this.clickWhenReady(filterSearch);
    const response = await filtered;
    expect(response.request().postDataJSON()?.StoreId, 'The chosen store should be sent with the analytics request.').toBeTruthy();
    await this.waitForNoSpinner();

    const body = await this.openAnalyticsTab(/^\s*Campaigns\s*$/);
    const rows = body.locator('tbody tr').filter({ hasText: /\d/ });
    await expect(rows.first(), `Analytics should list ${store}'s campaigns.`).toBeVisible({ timeout: 20000 });
    const stores = await rows.locator('td:nth-child(2)').allInnerTexts();
    expect(stores.every((value) => value.trim() === store), `Only ${store} campaigns should be listed, got ${JSON.stringify([...new Set(stores)])}.`).toBe(true);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getMonth() === new Date().getMonth()) {
      await expect(rows.filter({ hasText: code }), `Test campaign ${code} should be in this cycle's ${store} campaigns.`).toHaveCount(1);
    } else {
      console.log(`INFO: Test campaign ${code} starts next month, so it is not part of the current analytics cycle.`);
    }
  }

  async verifyAnalyticsDownloads() {
    const overview = this.page.waitForEvent('download', { timeout: 60000 });
    await this.clickWhenReady(this.page.locator('button[mattooltip="Download Overview Excel"]'));
    const overviewFile = (await overview).suggestedFilename();
    expect(overviewFile, 'Download Overview Excel should save the cycle overview workbook.').toMatch(/^Smart_Boost_Cycle_Overview_.*\.xlsx$/i);

    const body = await this.openAnalyticsTab(/^\s*Campaigns\s*$/);
    const campaigns = this.page.waitForEvent('download', { timeout: 60000 });
    await this.clickWhenReady(body.locator('button[mattooltip="Download Excel"]').first());
    const campaignsFile = (await campaigns).suggestedFilename();
    expect(campaignsFile, 'The Campaigns tab Download Excel should save the campaigns workbook.').toMatch(/^Smart_Boost_Campaigns_.*\.xlsx$/i);
  }

  /**
   * Create dialog validation: the budget must be at least the server minimum (25), and
   * Draft/Create stay disabled until the form is valid. Closed without saving anything.
   */
  async verifyCreateDialogValidation() {
    const createRequests = /** @type {string[]} */ ([]);
    /** @param {import('@playwright/test').Request} request */
    const onRequest = (request) => {
      if (request.method() !== 'GET' && /smartBoost\/(create|add|draft|save)/i.test(request.url())) createRequests.push(request.url());
    };
    this.page.on('request', onRequest);
    try {
      await this.clickWhenReady(this.createButton);
      const dialog = this.page
        .locator('mat-dialog-container, [role="dialog"], .modal-dialog')
        .filter({ hasText: /Add\s*Smart\s*Boost\s*Campaign/i })
        .filter({ visible: true })
        .last();
      await expect(dialog, 'Add Smart Boost Campaign dialog should open.').toBeVisible({ timeout: 15000 });
      for (const label of [/Store \*/, /Start Date \*/, /Budget \*/, /CPC Amount \*/]) await expect(dialog).toContainText(label);
      const draft = dialog.getByRole('button', { name: /^Draft$/i });
      const create = dialog.getByRole('button', { name: /^Create$/i });
      await expect(create, 'Create is disabled on an empty form.').toBeDisabled();
      await expect(draft, 'Draft is disabled on an empty form.').toBeDisabled();
      await expect(dialog.locator('input[formcontrolname="cpcAmount"]'), 'CPC comes from the server config and is not editable.').toBeDisabled();
      await expect(dialog.locator('input[formcontrolname="cpcAmount"]')).toHaveValue(/^0\.15/);

      const budget = dialog.locator('input[formcontrolname="initialBudget"]');
      await budget.fill('10');
      await budget.blur();
      await expect(dialog, 'A budget below the minimum must be rejected.').toContainText('Budget must be greater than or equal to 25');
      await expect(create).toBeDisabled();

      await budget.fill(BOOST_BUDGET);
      await budget.blur();
      await expect(dialog).not.toContainText('Budget must be greater than or equal to 25');
      await expect(create, 'Create stays disabled while store and start date are missing.').toBeDisabled();

      await dialog.locator('button, mat-icon, span').filter({ hasText: /^\s*close\s*$/ }).first().click();
      await expect(dialog, 'The dialog should close without saving.').toBeHidden({ timeout: 10000 });
      expect(createRequests, 'Closing the dialog must not create a campaign.').toHaveLength(0);
    } finally {
      this.page.off('request', onRequest);
    }
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
    const reasonOption = reasonPanel.locator('mat-option:not(.mat-option-disabled)').filter({ hasText: /\S/ }).first();
    const reasonText = ((await reasonOption.innerText()) || '').replace(/\s+/g, ' ').trim();
    await reasonOption.click();
    await expect(reason).toContainText(reasonText);
    await reasonPanel.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    await dialog.locator('textarea[formcontrolname="terminateDescription"]').fill(TERMINATE_DESCRIPTION);

    const confirm = dialog.getByRole('button', { name: /Confirm Terminate/i });
    await expect(confirm, 'Confirm Terminate should be enabled once a reason is selected.').toBeEnabled({ timeout: 10000 });
    await confirm.click();
    await this.acknowledgeFeedback();
    await expect(dialog, 'Terminate dialog should close after confirming.').toBeHidden({ timeout: 20000 });
    return reasonText;
  }

  /** @param {string} code */
  async verifyTerminateFlow(code) {
    createdCampaignTerminateReason = await this.terminateCampaign(code);
    createdCampaignTerminated = true;

    await this.goto();
    const row = this.rowForCode(code);
    await expect(row, `Campaign ${code} should still be listed after terminating it.`).toBeVisible({ timeout: 30000 });
    const status = await this.cellText(row, COL.status);
    const pendingTermination = await this.cellText(row, COL.pendingTermination);
    console.log(`INFO: Campaign ${code} after terminate - status "${status}", pending termination request "${pendingTermination}".`);
    // A campaign that has not started yet is ended immediately (no approval step).
    expect(status, `Campaign ${code} should be ENDED after confirming Terminate.`).toBe('ENDED');
  }

  /** @param {import('@playwright/test').Locator} row */
  async openRowMenu(row) {
    // isVisible() does not wait, and the list renders a moment after the page shell.
    if (!(await row.waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false))) return false;

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
    if (!(await action.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) || await this.isDisabled(action)) {
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }

    await action.click();
    await this.page.waitForTimeout(1500);
    return true;
  }

  async acknowledgeFeedback() {
    const confirm = this.page.locator('.swal2-confirm, button:has-text("OK"), button:has-text("Ok")').filter({ visible: true }).first();
    if (await confirm.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
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
    if (createdCampaignTerminated || (!createdCampaignCode && !codesBeforeCreate)) return;
    test.setTimeout(240000);
    const page = await browser.newPage();
    try {
      const cleanup = new SmartBoostCampaignsPage(page);
      await cleanup.goto();
      if (!createdCampaignCode) {
        // SB-03 clicked Create but failed before learning the code: look for a campaign that
        // was not listed before, on the same test store with the same start date. Only an
        // unambiguous single match is terminated - never anything that might be someone else's.
        const candidates = await cleanup.findNewCampaignCodes(codesBeforeCreate, createdCampaignStore, createdCampaignStartDate);
        if (candidates.length !== 1) {
          console.log(`${candidates.length ? 'WARNING' : 'INFO'}: SB-03 cleanup found ${candidates.length} new campaign(s) on ${createdCampaignStore} starting ${createdCampaignStartDate} ${JSON.stringify(candidates)}; ${candidates.length ? 'not terminating an ambiguous match - check manually' : 'nothing was saved'}.`);
          return;
        }
        createdCampaignCode = candidates[0];
      }
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

  test('SB-02 [sb-02]: Status filter, search by campaign code and Clear Filters', async () => {
    await smartBoost.verifyStatusFilterSearchAndClear();
  });

  test('SB-09 [sb-09]: Create dialog enforces the minimum budget and required fields', async () => {
    await smartBoost.verifyCreateDialogValidation();
  });

  test('SB-03 [sb-03]: Create a campaign on a test store and confirm it appears in the list', async () => {
    test.setTimeout(300000);
    const { code, store } = await smartBoost.createTestCampaign((info) => {
      createdCampaignStore = info.store;
      createdCampaignStartDate = info.startDate;
      codesBeforeCreate = info.codesBefore;
      if (info.code) createdCampaignCode = info.code;
    });
    console.log(`INFO: Created Smart Boost test campaign ${code} on ${store}.`);
  });

  test('SB-04 [sb-04]: The created campaign row menu offers Manage, Dashboard, Top-Up and Terminate', async () => {
    expect(createdCampaignCode, 'SB-03 must have created the test campaign.').toBeTruthy();
    await smartBoost.verifyRowActionMenu(createdCampaignCode);
  });

  test('SB-05 [sb-05]: View the created campaign details via Manage Campaign', async () => {
    expect(createdCampaignCode, 'SB-03 must have created the test campaign.').toBeTruthy();
    await smartBoost.verifyManageCampaignDetails(createdCampaignCode, createdCampaignStore, createdCampaignStartDate);
  });

  test('SB-06 [sb-06]: View the created campaign Dashboard', async () => {
    expect(createdCampaignCode, 'SB-03 must have created the test campaign.').toBeTruthy();
    await smartBoost.verifyCampaignDashboard(createdCampaignCode, createdCampaignStore);
  });

  test('SB-07 [sb-07]: Top up the created campaign budget and confirm the new total', async () => {
    expect(createdCampaignCode, 'SB-03 must have created the test campaign.').toBeTruthy();
    await smartBoost.verifyTopUpFlow(createdCampaignCode);
  });

  test('SB-10 [sb-10]: Manage Campaign Topup History records the top-up', async () => {
    expect(createdCampaignCode, 'SB-03 must have created the test campaign.').toBeTruthy();
    await smartBoost.verifyTopUpHistory(createdCampaignCode);
  });

  test('SB-08 [sb-08]: Terminate the created campaign and confirm it is ended', async () => {
    expect(createdCampaignCode, 'SB-03 must have created the test campaign.').toBeTruthy();
    await smartBoost.verifyTerminateFlow(createdCampaignCode);
  });

  test('SB-11 [sb-11]: Manage Campaign Terminate History records the termination', async () => {
    expect(createdCampaignTerminated, 'SB-08 must have terminated the test campaign.').toBe(true);
    await smartBoost.verifyTerminateHistory(createdCampaignCode, createdCampaignTerminateReason);
  });

  test('SB-12 [sb-12]: Status filter and code search find the ended test campaign', async () => {
    expect(createdCampaignTerminated, 'SB-08 must have terminated the test campaign.').toBe(true);
    await smartBoost.verifyCreatedCampaignFilters(createdCampaignCode, createdCampaignStore);
  });

  test('SB-16 [sb-16]: Store filter lists only the test store campaigns and Clear Filters resets it', async () => {
    expect(createdCampaignCode, 'SB-03 must have created the test campaign.').toBeTruthy();
    await smartBoost.verifyListStoreFilter(createdCampaignStore, createdCampaignCode);
  });

  test('SB-13 [sb-13]: Analytics page shows the cycle overview and every report tab', async () => {
    await smartBoost.openAnalytics();
    await smartBoost.verifyAnalyticsOverview();
  });

  test('SB-14 [sb-14]: Analytics store filter lists only the test store campaigns', async () => {
    expect(createdCampaignCode, 'SB-03 must have created the test campaign.').toBeTruthy();
    await smartBoost.openAnalytics();
    await smartBoost.verifyAnalyticsStoreFilter(createdCampaignStore, createdCampaignCode);
  });

  test('SB-15 [sb-15]: Analytics Excel downloads', async () => {
    await smartBoost.openAnalytics();
    await smartBoost.verifyAnalyticsDownloads();
  });
});
