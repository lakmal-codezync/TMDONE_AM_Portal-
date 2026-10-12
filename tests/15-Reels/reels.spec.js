// @ts-check
// ============================================================
// TMDone Admin Console - Reels
// List page (search, type filter, clear, pagination, row actions,
// create-wizard validation) and a full create -> view -> edit ->
// delete lifecycle on a reel this suite creates itself.
// URL: #/home/reels
// ============================================================

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

const REELS_URL = '#/home/reels';
const RUN_ID = Date.now();
const REEL_TITLE = `Auto Reel ${RUN_ID}`;
const REEL_TITLE_EDITED = `Auto Reel ${RUN_ID} Edited`;
const REEL_DESCRIPTION = 'Playwright automation reel created from the Reels spec.';
const REEL_STORE = 'Cafe Asiana';
const REEL_VIDEO_PATH = path.resolve('tests/fixtures/reel-video.mp4');
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Reels table column order.
const EXPECTED_HEADERS = ['Title', 'Type', 'Store', 'Menu Item', 'Views', 'Likes', 'Start Date', 'End Date', 'Is Active', 'Is Featured', 'Actions'];
const COL = { title: 0, type: 1, store: 2, menuItem: 3, startDate: 6, endDate: 7 };

// Lifecycle state shared by the serial CRUD tests and the afterAll safety-net cleanup, so
// every state-changing action targets only the reel this run created.
let createdReelTitle = '';
let createdReelDeleted = false;
let createdReelMenuItem = '';

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {Date} date */
function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

class ReelsPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  get heading() {
    return this.page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /^\s*Reels\s*$/ }).first();
  }

  get createButton() {
    return this.page.locator('button').filter({ hasText: /Create Reel/i }).filter({ visible: true }).first();
  }

  get table() {
    return this.page.locator('table').filter({ visible: true }).first();
  }

  get rows() {
    return this.page.locator('tbody tr').filter({ visible: true });
  }

  get searchInput() {
    return this.page.locator('input[formcontrolname="SearchString"]').filter({ visible: true }).first();
  }

  get typeFilter() {
    // The list toolbar's only mat-select is the Type filter.
    return this.page.locator('mat-select').filter({ visible: true }).first();
  }

  get searchButton() {
    return this.page.locator('button[mattooltip="Search"]').filter({ visible: true }).first();
  }

  get clearButton() {
    return this.page.locator('button[mattooltip="Clear"]').filter({ visible: true }).first();
  }

  get nextPage() {
    return this.page.locator('pagination-controls li.pagination-next, .ngx-pagination li.pagination-next').filter({ visible: true }).first();
  }

  get previousPage() {
    return this.page.locator('pagination-controls li.pagination-previous, .ngx-pagination li.pagination-previous').filter({ visible: true }).first();
  }

  /** The Create/Edit reel wizard is a bootstrap-style modal (div.modal-dialog). */
  wizardDialog() {
    return this.page.locator('.modal-dialog').filter({ hasText: /Reel\s*\(\s*\d\s*of\s*2\s*Steps\s*\)/i }).filter({ visible: true }).last();
  }

  /** @param {import('@playwright/test').Locator} dialog */
  dialogCloseIcon(dialog) {
    return dialog.locator('button, mat-icon, span, i').filter({ hasText: /^\s*close\s*$/ }).first();
  }

  async goto() {
    await loginToApp(this.page);
    const listLoaded = this.waitForListResponse(90000);
    await goToPage(this.page, REELS_URL);
    await expect(this.page, 'Reels route should open.').toHaveURL(/#\/home\/reels/i, { timeout: 30000 });
    await expect(this.heading, 'Reels page heading should be visible.').toBeVisible({ timeout: 45000 });
    await expect(this.createButton, 'Create Reel button should be visible.').toBeVisible({ timeout: 30000 });
    await listLoaded;
    await this.waitForNoSpinner();
    await expect(this.table).toBeVisible({ timeout: 30000 });
  }

  /** @param {number} timeout */
  waitForListResponse(timeout = 30000) {
    return this.page
      .waitForResponse((response) => /\/api\/reels\/list/i.test(response.url()) && response.request().method() === 'POST', { timeout })
      .catch(() => null);
  }

  async waitForNoSpinner() {
    for (const selector of ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay', '.loading-spinner']) {
      await this.page.locator(selector).first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    }
  }

  /**
   * The loading spinner overlay cycles in and out and intercepts single click attempts,
   * so wait for it and retry with short timeouts.
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
   * Clicks the toolbar Search button and returns the list request payload it triggered.
   * @returns {Promise<Record<string, any>>}
   */
  async applyFilters() {
    const listResponse = this.page.waitForResponse(
      (response) => /\/api\/reels\/list/i.test(response.url()) && response.request().method() === 'POST',
      { timeout: 30000 }
    );
    await this.clickWhenReady(this.searchButton);
    const response = await listResponse;
    expect(response.ok(), `Reels list request should succeed (HTTP ${response.status()}).`).toBe(true);
    await this.waitForNoSpinner();
    await this.page.waitForTimeout(800);
    return response.request().postDataJSON() || {};
  }

  /** @param {string} text */
  async searchFor(text) {
    await this.clickWhenReady(this.searchInput);
    await this.searchInput.fill(text);
    await expect(this.searchInput).toHaveValue(text);
    const payload = await this.applyFilters();
    expect(payload.SearchText, 'The search text should be sent with the list request.').toBe(text);
  }

  /**
   * @param {import('@playwright/test').Locator} row
   * @param {number} index
   */
  async cellText(row, index) {
    return ((await row.locator('td').nth(index).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /** @param {number} index */
  async columnValues(index) {
    const count = await this.rows.count();
    const values = [];
    for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
      values.push(await this.cellText(this.rows.nth(rowIndex), index));
    }
    return values;
  }

  /**
   * The row whose Title cell is exactly this title (so "X" never matches "X Edited").
   * @param {string} title
   */
  rowForTitle(title) {
    return this.rows.filter({
      has: this.page.locator('td:nth-child(1)', { hasText: new RegExp(`^\\s*${escapeRegExp(title)}\\s*$`) }),
    });
  }

  /**
   * Filters the table to this exact title via the toolbar search (the table holds real demo
   * data and is not reliably newest-first) and returns the matching row locator.
   * @param {string} title
   */
  async locateReelRow(title) {
    await this.searchFor(title);
    return this.rowForTitle(title);
  }

  /** @param {import('@playwright/test').Locator} row */
  async openRowMenu(row) {
    await expect(row, 'Row should be visible before opening its action menu.').toBeVisible({ timeout: 30000 });
    const trigger = row.locator('.mat-menu-trigger').first();
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await this.clickWhenReady(trigger);
    const menu = this.page.locator('.mat-menu-panel').filter({ visible: true }).last();
    await expect(menu, 'Row action menu should open.').toBeVisible({ timeout: 10000 });
    return menu;
  }

  /**
   * @param {import('@playwright/test').Locator} row
   * @param {RegExp} label
   */
  async clickRowAction(row, label) {
    const menu = await this.openRowMenu(row);
    const item = menu.locator('button[role="menuitem"], button.mat-menu-item').filter({ hasText: label }).first();
    await expect(item, `Row action ${label} should be listed.`).toBeVisible({ timeout: 10000 });
    await item.click();
  }

  /**
   * @param {import('@playwright/test').Locator} trigger the datepicker toggle button
   * @param {Date} date
   */
  async pickDate(trigger, date) {
    await trigger.click();
    const calendar = this.page.locator('mat-calendar').filter({ visible: true }).last();
    await expect(calendar, 'Calendar should open.').toBeVisible({ timeout: 10000 });

    const monthPrefix = MONTHS[date.getMonth()];
    const year = String(date.getFullYear());
    for (let attempt = 0; attempt < 24; attempt += 1) {
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
    await calendar.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  /**
   * Closes a mat-select panel via its transparent backdrop. Escape is never used inside the
   * wizard because it closes the whole dialog.
   */
  async closeOpenSelectPanel() {
    const backdrop = this.page.locator('.cdk-overlay-transparent-backdrop.cdk-overlay-backdrop-showing').last();
    if (await backdrop.isVisible().catch(() => false)) {
      await backdrop.click().catch(() => {});
      await backdrop.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
  }

  async openCreateWizard() {
    await this.clickWhenReady(this.createButton);
    const dialog = this.wizardDialog();
    await expect(dialog, 'Create Reel wizard should open.').toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText(/Create Reel\s*\(1 of 2 Steps\)/i);
    return dialog;
  }

  /**
   * Step 1 of the Create Reel wizard: Type, Title, Start/End date, Store, Menu Item, Description.
   * Returns the menu item that was picked.
   * @param {import('@playwright/test').Locator} dialog
   * @param {string} title
   */
  async fillCreateStepOne(dialog, title) {
    const selects = dialog.locator('mat-select');

    await selects.nth(0).click();
    await this.page.locator('.mat-select-panel mat-option').filter({ hasText: /^\s*Store\s*$/ }).first().click();
    await expect(selects.nth(0), 'Type should be Store.').toContainText('Store');

    const titleInput = dialog.locator('input[formcontrolname="Title"]');
    await expect(titleInput, 'Title becomes editable once a Type is chosen.').toBeEnabled({ timeout: 10000 });
    await titleInput.fill(title);
    await expect(titleInput).toHaveValue(title);

    const today = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    const toggles = dialog.locator('mat-datepicker-toggle button, button[aria-label="Open calendar"]');
    await this.pickDate(toggles.nth(0), today);
    await expect(dialog.locator('input[formcontrolname="StartDate"]'), 'Start date should be today.').toHaveValue(formatDate(today));
    await this.pickDate(toggles.nth(1), endDate);
    await expect(dialog.locator('input[formcontrolname="EndDate"]'), 'End date should be a week from today.').toHaveValue(formatDate(endDate));

    // Store dropdown (appears once Type is Store) with its own "Search Items" box.
    const storeSelect = selects.nth(1);
    await storeSelect.click();
    const storePanel = this.page.locator('.mat-select-panel').filter({ visible: true }).last();
    await expect(storePanel, 'Store dropdown should open.').toBeVisible({ timeout: 10000 });
    const storeSearch = storePanel.locator('input[placeholder="Search Items"]').first();
    // The search box sits in an aria-disabled option wrapper; force is only used to focus it.
    await storeSearch.click({ force: true });
    await storeSearch.pressSequentially(REEL_STORE, { delay: 40 });
    const storeOption = storePanel.locator('mat-option').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(REEL_STORE)}\\s*$`, 'i') }).first();
    await expect(storeOption, `Test store "${REEL_STORE}" should be selectable.`).toBeVisible({ timeout: 20000 });
    await storeOption.click();
    await expect(storeSelect).toContainText(REEL_STORE, { timeout: 5000 });

    // Menu item options are loaded for the chosen store.
    const menuSelect = selects.nth(2);
    await menuSelect.click();
    const menuPanel = this.page.locator('.mat-select-panel').filter({ visible: true }).last();
    const menuOption = menuPanel.locator('mat-option:not(.mat-option-disabled)').filter({ hasText: /\S/ }).first();
    await expect(menuOption, `"${REEL_STORE}" should have menu items to choose from.`).toBeVisible({ timeout: 20000 });
    const menuItem = ((await menuOption.innerText()) || '').replace(/\s+/g, ' ').trim();
    await menuOption.click();
    await this.closeOpenSelectPanel();
    await expect(menuSelect).toContainText(menuItem, { timeout: 5000 });

    const description = dialog.locator('textarea[formcontrolname="Description"], textarea').first();
    await description.fill(REEL_DESCRIPTION);
    await expect(description).toHaveValue(REEL_DESCRIPTION);
    return menuItem;
  }

  /**
   * Creates the run-stamped test reel through the two-step wizard with a real video upload.
   * Network evidence (signed-upload URL, S3 upload, reels/add) is collected so a failure says
   * exactly which backend step broke - e.g. uploads.tmdone.io/getimagecontenturl being blocked
   * by CORS for this origin, which used to leave the Create button stuck on "Creating...".
   */
  async createReel() {
    const evidence = /** @type {string[]} */ ([]);
    /** @param {import('@playwright/test').Response} response */
    const onResponse = (response) => {
      if (/getimagecontenturl|tmd-cdn|\/api\/reels\/add/i.test(response.url())) {
        evidence.push(`${response.status()} ${response.request().method()} ${response.url().split('?')[0]}`);
      }
    };
    /** @param {import('@playwright/test').Request} request */
    const onFailed = (request) => {
      if (/uploads\.tmdone|tmd-cdn|\/api\/reels/i.test(request.url())) {
        evidence.push(`FAILED ${request.method()} ${request.url().split('?')[0]} (${request.failure()?.errorText})`);
      }
    };
    /** @param {import('@playwright/test').ConsoleMessage} message */
    const onConsole = (message) => {
      if (message.type() === 'error') evidence.push(`console error: ${message.text().slice(0, 200)}`);
    };
    this.page.on('response', onResponse);
    this.page.on('requestfailed', onFailed);
    this.page.on('console', onConsole);

    try {
      const dialog = await this.openCreateWizard();
      const menuItem = await this.fillCreateStepOne(dialog, REEL_TITLE);

      const next = dialog.getByRole('button', { name: /^Next$/i });
      await expect(next, 'Next should be enabled once step 1 is complete.').toBeEnabled({ timeout: 10000 });
      await next.click();
      await expect(dialog).toContainText(/Create Reel\s*\(2 of 2 Steps\)/i, { timeout: 10000 });

      const create = dialog.getByRole('button', { name: /^Create$/i });
      await expect(create, 'Create should stay disabled until a video is uploaded.').toBeDisabled();
      await dialog.locator('input[type="file"]').first().setInputFiles(REEL_VIDEO_PATH);
      await expect(create, 'Create should be enabled once the video is attached.').toBeEnabled({ timeout: 15000 });

      const addResponse = this.page
        .waitForResponse((response) => /\/api\/reels\/add/i.test(response.url()), { timeout: 120000 })
        .catch(() => null);
      // Recorded before submitting so the afterAll safety net also searches for (and deletes)
      // the reel if the save lands but the response is lost.
      createdReelTitle = REEL_TITLE;
      await create.click();
      const response = await addResponse;
      const corsBlocked = evidence.some((line) => /getimagecontenturl/i.test(line) && /CORS|ERR_FAILED/i.test(line));
      expect(
        response,
        (corsBlocked
          ? 'ENVIRONMENT BLOCKER: uploads.tmdone.io/getimagecontenturl is blocked by CORS for this origin, so the console never gets a signed upload URL and never calls /api/reels/add. '
          : '') +
          `Creating a reel should call /api/reels/add after uploading the video. Network/console evidence: ${evidence.join(' | ') || 'none'}`
      ).not.toBeNull();
      const body = await response?.text().catch(() => '');
      expect(response?.ok(), `/api/reels/add should succeed. HTTP ${response?.status()}: ${body?.slice(0, 300)}`).toBe(true);

      createdReelTitle = REEL_TITLE;
      createdReelMenuItem = menuItem;
      await this.acknowledgeFeedback();
      await expect(dialog, 'Create Reel wizard should close after a successful create.').toBeHidden({ timeout: 30000 });
      return menuItem;
    } finally {
      this.page.off('response', onResponse);
      this.page.off('requestfailed', onFailed);
      this.page.off('console', onConsole);
    }
  }

  /**
   * Opens the Edit wizard for a reel (the row menu has no separate View action, so the Edit
   * wizard doubles as the detail view).
   * @param {string} title
   */
  async openEditWizard(title) {
    const row = await this.locateReelRow(title);
    await expect(row, `Reel "${title}" should be listed.`).toHaveCount(1, { timeout: 20000 });
    await this.clickRowAction(row, /Edit/i);
    const dialog = this.wizardDialog();
    await expect(dialog, 'Edit Reel wizard should open.').toBeVisible({ timeout: 15000 });
    return dialog;
  }

  /** @param {import('@playwright/test').Locator} dialog */
  async closeWizardWithoutSaving(dialog) {
    await this.closeOpenSelectPanel();
    await this.dialogCloseIcon(dialog).click();
    await expect(dialog, 'Wizard should close without saving.').toBeHidden({ timeout: 10000 });
  }

  /**
   * Edits the test reel's title through the Edit wizard (step 1 -> Next -> submit).
   * @param {string} currentTitle
   * @param {string} newTitle
   */
  async editReelTitle(currentTitle, newTitle) {
    const dialog = await this.openEditWizard(currentTitle);
    const titleInput = dialog.locator('input[formcontrolname="Title"]');
    await expect(titleInput).toHaveValue(currentTitle, { timeout: 15000 });
    await titleInput.fill(newTitle);
    await expect(titleInput).toHaveValue(newTitle);

    const next = dialog.getByRole('button', { name: /^Next$/i });
    if (await next.isVisible().catch(() => false)) {
      await expect(next, 'Next should be enabled in the Edit wizard.').toBeEnabled({ timeout: 10000 });
      await next.click();
      await expect(dialog).toContainText(/\(2 of 2 Steps\)/i, { timeout: 10000 });
    }

    const submit = dialog.getByRole('button', { name: /^(Update|Edit|Save|Submit)$/i }).first();
    await expect(submit, 'Edit wizard submit button should be enabled.').toBeEnabled({ timeout: 15000 });
    const updateResponse = this.page
      .waitForResponse((response) => /\/api\/reels\/(update|edit)/i.test(response.url()) && response.request().method() !== 'GET', { timeout: 90000 })
      .catch(() => null);
    await submit.click();
    const response = await updateResponse;
    expect(response, 'Saving the Edit wizard should call the reels update API.').not.toBeNull();
    const body = await response?.text().catch(() => '');
    expect(response?.ok(), `Reels update should succeed. HTTP ${response?.status()}: ${body?.slice(0, 300)}`).toBe(true);
    createdReelTitle = newTitle;
    await this.acknowledgeFeedback();
    await expect(dialog, 'Edit wizard should close after saving.').toBeHidden({ timeout: 30000 });
  }

  /** @param {string} title only ever a title this suite created */
  async deleteReel(title) {
    const row = await this.locateReelRow(title);
    await expect(row, `Reel "${title}" should be listed before deleting it.`).toHaveCount(1, { timeout: 20000 });
    await this.clickRowAction(row, /Delete/i);

    const confirmation = this.page.locator('.swal2-popup, .modal-dialog, mat-dialog-container').filter({ visible: true }).last();
    await expect(confirmation, 'Delete confirmation should open.').toBeVisible({ timeout: 10000 });
    const confirm = confirmation.getByRole('button', { name: /^(Delete|Yes.*|Confirm|OK)$/i }).first();
    await expect(confirm, 'Delete confirmation button should be visible.').toBeVisible({ timeout: 10000 });

    const deleteResponse = this.page
      .waitForResponse((response) => /\/api\/reels\/(delete|remove)/i.test(response.url()), { timeout: 60000 })
      .catch(() => null);
    await confirm.click();
    const response = await deleteResponse;
    expect(response, 'Confirming delete should call the reels delete API.').not.toBeNull();
    const body = await response?.text().catch(() => '');
    expect(response?.ok(), `Reels delete should succeed. HTTP ${response?.status()}: ${body?.slice(0, 300)}`).toBe(true);
    createdReelDeleted = true;
    await this.acknowledgeFeedback();
  }

  async acknowledgeFeedback() {
    const ok = this.page.locator('.swal2-confirm').filter({ visible: true }).first();
    if (await ok.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await ok.click().catch(() => {});
      await ok.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
  }

  /** @param {string} type the Type filter option label (Store / TMDone) */
  async filterByType(type) {
    await this.clickWhenReady(this.typeFilter);
    const option = this.page.locator('.mat-select-panel mat-option').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(type)}\\s*$`, 'i') }).first();
    await expect(option, `Type filter should offer "${type}".`).toBeVisible({ timeout: 10000 });
    await option.click();
    await this.closeOpenSelectPanel();
    await expect(this.typeFilter).toContainText(type);
    return this.applyFilters();
  }
}

test.describe('Reels - list page', () => {
  /** @type {ReelsPage} */
  let reels;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    reels = new ReelsPage(page);
    await reels.goto();
  });

  test('REEL-01: Reels list page loads with its toolbar, columns and rows', async () => {
    await expect(reels.searchInput).toBeVisible();
    await expect(reels.typeFilter).toBeVisible();
    await expect(reels.searchButton).toBeVisible();
    await expect(reels.clearButton).toBeVisible();
    for (const header of EXPECTED_HEADERS) {
      await expect(reels.table.locator('th').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(header)}\\s*$`, 'i') }).first(), `Column "${header}" should be shown.`).toBeVisible();
    }
    await expect(reels.rows.first(), 'The Reels table should list reels.').toBeVisible({ timeout: 30000 });
    expect(await reels.cellText(reels.rows.first(), COL.title)).not.toBe('');
  });

  test('REEL-03: Reels row action menu offers Edit and Delete', async ({ page }) => {
    // Opens the menu on an existing row but never clicks an item, so no reel is changed.
    const menu = await reels.openRowMenu(reels.rows.first());
    const items = (await menu.locator('button').allInnerTexts()).map((text) => text.replace(/edit_note|delete_sweep/g, '').trim());
    expect(items, 'Row action menu should offer exactly Edit and Delete.').toEqual(['Edit', 'Delete']);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden({ timeout: 5000 });
  });

  test('REEL-07: Search by title filters the table and Clear resets it', async () => {
    const initialCount = await reels.rows.count();
    expect(initialCount, 'The unfiltered table should have rows to search through.').toBeGreaterThan(1);
    const title = await reels.cellText(reels.rows.first(), COL.title);

    await reels.searchFor(title);
    await expect(reels.rows.first()).toBeVisible({ timeout: 15000 });
    const titles = await reels.columnValues(COL.title);
    expect(titles.length, 'Searching should narrow the results.').toBeLessThan(initialCount);
    for (const value of titles) {
      expect(value.toLowerCase(), `Every result should match the search "${title}".`).toContain(title.toLowerCase());
    }

    await reels.searchFor(`No such reel ${RUN_ID}`);
    await expect(reels.rows, 'A search with no matches should show no rows.').toHaveCount(0, { timeout: 15000 });

    const listReloaded = reels.waitForListResponse();
    await reels.clickWhenReady(reels.clearButton);
    const response = await listReloaded;
    expect(response?.request().postDataJSON()?.SearchText, 'Clear should reload the list without a search text.').toBe('');
    await expect(reels.searchInput).toHaveValue('');
    await expect(reels.rows).toHaveCount(initialCount, { timeout: 15000 });
  });

  test('REEL-08: Type filter limits the table to the chosen reel type', async () => {
    const storePayload = await reels.filterByType('Store');
    expect(storePayload.Type, 'The Store type should be sent with the list request.').toMatch(/^store$/i);
    await expect(reels.rows.first(), 'There should be Store reels.').toBeVisible({ timeout: 15000 });
    const storeTypes = await reels.columnValues(COL.type);
    expect(storeTypes.every((type) => /^STORE$/i.test(type)), `All rows should be STORE reels, got ${JSON.stringify([...new Set(storeTypes)])}.`).toBe(true);

    const tmdonePayload = await reels.filterByType('TMDone');
    expect(tmdonePayload.Type, 'The TMDone type should be sent with the list request.').toMatch(/^tmdone$/i);
    const tmdoneTypes = await reels.columnValues(COL.type);
    expect(tmdoneTypes.every((type) => /^TMDONE$/i.test(type)), `Only TMDONE reels should remain, got ${JSON.stringify([...new Set(tmdoneTypes)])}.`).toBe(true);

    await reels.clickWhenReady(reels.clearButton);
    await expect(reels.typeFilter).not.toContainText(/Store|TMDone/, { timeout: 10000 });
  });

  test('REEL-09: Pagination moves to the next page and back', async () => {
    await expect(reels.nextPage, 'The Reels list has more than one page.').toBeVisible({ timeout: 15000 });
    await expect(reels.nextPage).not.toHaveClass(/disabled/);
    const firstPageTitles = await reels.columnValues(COL.title);

    await reels.clickWhenReady(reels.nextPage.locator('a'));
    await expect(reels.page.locator('.ngx-pagination li.current').first()).toContainText('2', { timeout: 15000 });
    await expect(reels.rows.first()).toBeVisible({ timeout: 15000 });
    const secondPageTitles = await reels.columnValues(COL.title);
    expect(secondPageTitles.join('|'), 'Page 2 should show different reels than page 1.').not.toBe(firstPageTitles.join('|'));

    await reels.clickWhenReady(reels.previousPage.locator('a'));
    await expect(reels.page.locator('.ngx-pagination li.current').first()).toContainText('1', { timeout: 15000 });
    await expect.poll(async () => (await reels.columnValues(COL.title)).join('|'), { timeout: 15000 }).toBe(firstPageTitles.join('|'));
  });

  test('REEL-10: Create Reel wizard enforces its required fields and can be closed without saving', async ({ page }) => {
    const addRequests = /** @type {string[]} */ ([]);
    page.on('request', (request) => {
      if (/\/api\/reels\/add/i.test(request.url())) addRequests.push(request.url());
    });

    const dialog = await reels.openCreateWizard();
    await expect(dialog).toContainText(/Type \*/);
    await expect(dialog).toContainText(/Title \*/);
    await expect(dialog).toContainText(/Start Date \*/);
    await expect(dialog).toContainText(/End Date \*/);
    await expect(dialog.locator('input[formcontrolname="Title"]'), 'Title is locked until a Type is chosen.').toBeDisabled();
    const next = dialog.getByRole('button', { name: /^Next$/i });
    await expect(next, 'Next is disabled on an empty form.').toBeDisabled();

    await dialog.locator('mat-select').first().click();
    await page.locator('.mat-select-panel mat-option').filter({ hasText: /^\s*Store\s*$/ }).first().click();
    await expect(dialog.locator('input[formcontrolname="Title"]'), 'Title unlocks once a Type is chosen.').toBeEnabled({ timeout: 10000 });
    await dialog.locator('input[formcontrolname="Title"]').fill(`Unsaved reel ${RUN_ID}`);
    await expect(next, 'Next stays disabled while dates, store and menu item are missing.').toBeDisabled();

    await reels.closeWizardWithoutSaving(dialog);
    expect(addRequests, 'Closing the wizard must not create a reel.').toHaveLength(0);
    await reels.searchFor(`Unsaved reel ${RUN_ID}`);
    await expect(reels.rows).toHaveCount(0, { timeout: 15000 });
  });
});

test.describe.serial('Reels - create, view, edit and delete lifecycle', () => {
  /** @type {ReelsPage} */
  let reels;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    reels = new ReelsPage(page);
    await reels.goto();
  });

  // Safety net: if a later lifecycle step fails, still delete the reel this run created.
  test.afterAll(async ({ browser }) => {
    if (!createdReelTitle || createdReelDeleted) return;
    test.setTimeout(240000);
    const page = await browser.newPage();
    try {
      const cleanup = new ReelsPage(page);
      await cleanup.goto();
      if ((await (await cleanup.locateReelRow(createdReelTitle)).count()) === 0) {
        console.log(`INFO: Test reel "${createdReelTitle}" was never saved - nothing to clean up.`);
        return;
      }
      await cleanup.deleteReel(createdReelTitle);
      console.log(`INFO: Cleanup deleted test reel "${createdReelTitle}".`);
    } catch (error) {
      console.log(`WARNING: Could not delete test reel "${createdReelTitle}" during cleanup: ${error instanceof Error ? error.message : error}`);
    } finally {
      await page.close();
    }
  });

  test('REEL-02: Create a reel with a real video upload and confirm it appears in the table', async () => {
    test.setTimeout(300000);
    const menuItem = await reels.createReel();

    await reels.goto();
    const row = await reels.locateReelRow(REEL_TITLE);
    await expect(row, `Reel "${REEL_TITLE}" should appear in the table after creating it.`).toHaveCount(1, { timeout: 20000 });
    expect(await reels.cellText(row, COL.type)).toMatch(/^STORE$/i);
    expect(await reels.cellText(row, COL.store)).toBe(REEL_STORE);
    expect(await reels.cellText(row, COL.menuItem)).toBe(menuItem);
    expect(await reels.cellText(row, COL.startDate)).toBe(formatDate(new Date()));
  });

  test('REEL-04: View the created reel\'s details in the Edit wizard without saving', async () => {
    expect(createdReelTitle, 'REEL-02 must have created the test reel.').toBe(REEL_TITLE);
    const dialog = await reels.openEditWizard(REEL_TITLE);
    await expect(dialog.locator('input[formcontrolname="Title"]')).toHaveValue(REEL_TITLE, { timeout: 15000 });
    await expect(dialog.locator('textarea').first()).toHaveValue(REEL_DESCRIPTION);
    await expect(dialog.locator('mat-select').nth(1)).toContainText(REEL_STORE);
    if (createdReelMenuItem) await expect(dialog.locator('mat-select').nth(2)).toContainText(createdReelMenuItem);
    await reels.closeWizardWithoutSaving(dialog);

    const row = await reels.locateReelRow(REEL_TITLE);
    await expect(row, 'Viewing must not change the reel.').toHaveCount(1, { timeout: 15000 });
  });

  test('REEL-05: Edit the created reel and confirm the update is saved', async () => {
    test.setTimeout(300000);
    expect(createdReelTitle, 'REEL-02 must have created the test reel.').toBe(REEL_TITLE);
    await reels.editReelTitle(REEL_TITLE, REEL_TITLE_EDITED);

    await reels.goto();
    const row = await reels.locateReelRow(REEL_TITLE_EDITED);
    await expect(row, `Reel should be listed as "${REEL_TITLE_EDITED}" after editing.`).toHaveCount(1, { timeout: 20000 });
    expect(await reels.cellText(row, COL.store)).toBe(REEL_STORE);
    const oldRow = await reels.locateReelRow(REEL_TITLE);
    await expect(oldRow, 'The old title should no longer be listed.').toHaveCount(0, { timeout: 15000 });
  });

  test('REEL-06: Delete the edited reel and confirm it is removed', async () => {
    expect(createdReelTitle, 'REEL-05 must have renamed the test reel.').toBe(REEL_TITLE_EDITED);
    await reels.deleteReel(REEL_TITLE_EDITED);

    await reels.goto();
    const row = await reels.locateReelRow(REEL_TITLE_EDITED);
    await expect(row, 'The deleted reel should no longer be listed.').toHaveCount(0, { timeout: 15000 });
  });
});
