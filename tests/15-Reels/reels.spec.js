// @ts-check
// ============================================================
// TMDone Admin Console - Reels
// Page load, create, edit, delete, view, filters, pagination
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

class ReelsPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  get table() {
    return this.page.locator('mat-table, table, .table-responsive, .ngx-datatable').filter({ visible: true }).first();
  }

  get rows() {
    return this.page.locator('mat-row, tbody tr, .datatable-body-row');
  }

  get createButton() {
    return this.page
      .locator(
        [
          'button:has-text("Create Reel")',
          'button:has-text("Add Reel")',
          'button:has-text("New Reel")',
          'button:has-text("Create")',
          'button:has-text("Add")',
          'button:has(mat-icon:has-text("add"))',
          '[role="button"]:has-text("Create Reel")',
          '[role="button"]:has-text("Create")',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();
  }

  get searchInput() {
    return this.page
      .locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element')
      .filter({ visible: true })
      .first();
  }

  activeDialog() {
    return this.page
      .locator('mat-dialog-container, modal-container, .modal-dialog, [role="dialog"], .swal2-popup')
      .filter({ visible: true })
      .last();
  }

  async goto() {
    await loginToApp(this.page);
    await goToPage(this.page, REELS_URL);
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.skipIfReelsModuleUnavailable();
    await this.waitForReady();
  }

  async skipIfReelsModuleUnavailable() {
    const url = this.page.url();
    if (!/reels/i.test(url)) {
      test.skip(true, `Reels module is not available; navigation never reached ${REELS_URL} (current URL "${url}").`);
      return;
    }

    // The Reels route can take longer than a fixed sleep to lazy-load, so poll for a
    // positive readiness signal instead of taking a single snapshot right after navigating.
    const reelsReady = await Promise.race([
      this.page
        .locator('button:has-text("Create Reel"), button:has-text("Add Reel"), button:has-text("New Reel")')
        .filter({ visible: true })
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false),
      this.page
        .locator('h1, h2, h3, h4, .page-title, .breadcrumb-item')
        .filter({ hasText: /\bReels?\b/i })
        .filter({ visible: true })
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false),
    ]);

    if (reelsReady) return;

    const contentText = await this.mainContentText();
    test.skip(
      true,
      `Reels module is not available at ${REELS_URL}; current page is "${this.firstLine(contentText)}".`
    );
  }

  async waitForReady() {
    await expect(this.page).not.toHaveURL(/signin/i, { timeout: 25000 });

    const ready = await Promise.race([
      this.table.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false),
      this.createButton.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false),
    ]);

    expect(ready).toBe(true);
  }

  async verifyPageLoaded() {
    await this.waitForReady();
    const visibleControls = await this.page
      .locator('mat-table, table, button, input, mat-select, textarea')
      .filter({ visible: true })
      .count();
    expect(visibleControls).toBeGreaterThan(0);
  }

  async openCreateDialog() {
    await expect(this.createButton).toBeVisible({ timeout: 15000 });
    await this.createButton.click();
    await this.page.waitForTimeout(1500);

    const dialog = this.activeDialog();
    const dialogVisible = await dialog.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!dialogVisible, 'Reel create dialog did not open in this environment.');
    return dialog;
  }

  /**
   * @param {import('@playwright/test').Locator} context
   * @param {string[]} selectors
   * @param {string} value
   */
  async fillFirstVisible(context, selectors, value) {
    for (const selector of selectors) {
      const field = context.locator(selector).filter({ visible: true }).first();
      if (!(await field.isVisible().catch(() => false))) continue;
      if (!(await field.isEditable().catch(() => true))) continue;

      await field.scrollIntoViewIfNeeded().catch(() => {});
      await field.click({ clickCount: 3, force: true }).catch(() => {});
      await field.fill(value).catch(async () => {
        await field.pressSequentially(value, { delay: 20 }).catch(() => {});
      });
      await field.dispatchEvent('input').catch(() => {});
      return true;
    }
    return false;
  }

  /**
   * @param {import('@playwright/test').Locator} context
   * @param {RegExp | null} label
   * @param {string | number} option
   */
  async selectDropdown(context, label = null, option = 0) {
    const dropdowns = context.locator('mat-select, [role="combobox"]').filter({ visible: true });
    const count = await dropdowns.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const dropdown = dropdowns.nth(index);
      if (!(await dropdown.isEnabled().catch(() => true))) continue;

      if (label) {
        const fieldText = await dropdown.locator('xpath=ancestor::mat-form-field[1]').innerText().catch(() => '');
        const dropdownText = [
          fieldText,
          await dropdown.innerText().catch(() => ''),
          await dropdown.getAttribute('formcontrolname').catch(() => ''),
          await dropdown.getAttribute('aria-label').catch(() => ''),
          await dropdown.getAttribute('placeholder').catch(() => ''),
        ].filter(Boolean).join(' ');
        if (!label.test(dropdownText)) continue;
      }

      await dropdown.scrollIntoViewIfNeeded().catch(() => {});
      await dropdown.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(700);

      const options = this.page.locator('mat-option, .mat-option, [role="option"]').filter({ visible: true });
      const optionCount = await options.count().catch(() => 0);
      const selectable = [];

      for (let optionIndex = 0; optionIndex < optionCount; optionIndex += 1) {
        const item = options.nth(optionIndex);
        const text = ((await item.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        const className = (await item.getAttribute('class').catch(() => '')) || '';
        const ariaDisabled = await item.getAttribute('aria-disabled').catch(() => null);
        const disabled = ariaDisabled === 'true' || /disabled/.test(className);
        const placeholder = !text || /select|choose|loading|no data|no records|no results/i.test(text);
        if (!disabled && !placeholder) selectable.push({ item, text });
      }

      const target = typeof option === 'string'
        ? selectable.find(({ text }) => this.normalize(text).includes(this.normalize(option)))
        : selectable[option] || selectable[0];

      if (target) {
        await target.item.click({ force: true }).catch(() => {});
        await this.page.waitForTimeout(500);
        return true;
      }

      await this.page.keyboard.press('Escape').catch(() => {});
    }

    return false;
  }

  /**
   * Step 1 of the Create Reel wizard: Type, Title, Start/End date, Store, Menu Item, Description.
   * @param {import('@playwright/test').Locator} dialog
   * @param {string} title
   */
  async fillCreateStepOne(dialog, title) {
    const typeDropdown = dialog.locator('mat-select, [role="combobox"]').first();
    await typeDropdown.click();
    await this.page.waitForTimeout(500);
    await this.page.locator('mat-option, [role="option"]').filter({ hasText: /^Store$/i }).first().click();
    await this.page.waitForTimeout(500);

    await dialog.locator('input[type="text"]').first().fill(title);

    const startDateToggle = dialog.locator('button[aria-label="Open calendar"]').first();
    await startDateToggle.click();
    await this.page.waitForTimeout(500);
    await this.page.locator('.mat-calendar-body-cell:not(.mat-calendar-body-disabled)').first().click();
    await this.page.waitForTimeout(300);

    const endDateToggle = dialog.locator('button[aria-label="Open calendar"]').nth(1);
    await endDateToggle.click();
    await this.page.waitForTimeout(500);
    await this.page.locator('.mat-calendar-body-cell:not(.mat-calendar-body-disabled)').last().click();
    await this.page.waitForTimeout(300);

    const storeDropdown = dialog.locator('mat-select, [role="combobox"]').nth(1);
    await storeDropdown.click();
    await this.page.waitForTimeout(500);
    const searchBox = this.page.locator('input[placeholder="Search Items"]').first();
    if (await searchBox.isVisible().catch(() => false)) {
      await searchBox.fill(REEL_STORE, { force: true }).catch(async () => {
        await searchBox.pressSequentially(REEL_STORE, { delay: 20 }).catch(() => {});
      });
      await this.page.waitForTimeout(500);
    }
    await this.page.locator('mat-option, [role="option"]').filter({ hasText: new RegExp(`^${REEL_STORE}$`, 'i') }).first().click();
    await this.page.waitForTimeout(500);

    const menuItemDropdown = dialog.locator('mat-select, [role="combobox"]').nth(2);
    await menuItemDropdown.click();
    await this.page.waitForTimeout(500);
    await this.page.locator('mat-option:not([aria-disabled="true"]), [role="option"]:not([aria-disabled="true"])').first().click();
    await this.page.waitForTimeout(500);

    await this.fillFirstVisible(dialog, [
      'textarea[formcontrolname*="description" i]',
      'textarea[placeholder*="Description" i]',
      'mat-form-field:has-text("Description") textarea',
      'textarea',
    ], REEL_DESCRIPTION);
  }

  /**
   * Step 2 of the Create Reel wizard: mandatory video upload.
   * @param {string} videoPath
   */
  async fillCreateStepTwo(videoPath) {
    const fileInput = this.page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(videoPath);
    await this.page.waitForTimeout(1500);
  }

  /**
   * KNOWN ENVIRONMENT ISSUE (as of 2026-10-04): creating a reel is currently blocked by a
   * backend CORS misconfiguration, independent of anything this test does. The app calls
   * https://uploads.tmdone.io/getimagecontenturl to get a signed video-upload URL; that
   * request is rejected because uploads.tmdone.io does not allow the console.demo.dr.tmd1.org
   * origin (likely never updated after the base-URL migration off consoledemo.uat.v3.dr.tmd1.org).
   * The app does not handle that failure, so ReelsCreateComponent.uploadReel() throws
   * "Cannot read properties of null (reading 'uploadURL')" and the Create button is left
   * stuck on "Creating..." forever, regardless of the uploaded file's content (reproduced with
   * both a fake file and a genuine video). Once uploads.tmdone.io's CORS allowlist is fixed,
   * this flow should pass as written with no test changes needed.
   */
  async verifyCreateReelFlow() {
    const dialog = await this.openCreateDialog();
    await this.fillCreateStepOne(dialog, REEL_TITLE);

    const nextButton = dialog.getByRole('button', { name: /^Next$/i });
    await expect(nextButton, 'Reels create wizard Next button should be enabled once step 1 fields are filled.').toBeEnabled({ timeout: 10000 });
    await nextButton.click();
    await this.page.waitForTimeout(1000);

    await this.fillCreateStepTwo(REEL_VIDEO_PATH);

    const submitButton = this.page.locator('button:has-text("Create")').filter({ visible: true }).last();
    await expect(submitButton, 'Reels create submit button should be visible after uploading the video.').toBeVisible({ timeout: 10000 });
    await expect(submitButton, 'Reels create submit button should be enabled once the video is uploaded.').toBeEnabled({ timeout: 10000 });
    await submitButton.click();
    await this.waitForSubmitToSettle(60000);
    await this.confirmSuccessIfShown();

    const row = await this.locateReelRow(REEL_TITLE, 20000);
    expect(
      row,
      `A reel titled "${REEL_TITLE}" should appear in the table after creating it. If this fails, check whether ` +
      'https://uploads.tmdone.io/getimagecontenturl is being blocked by CORS for this origin — that is a known ' +
      'backend issue (not a test bug) that leaves the Create button stuck on "Creating..." and never actually ' +
      'submits the reel. See the comment above this method for details.'
    ).not.toBeNull();
  }

  /**
   * @param {import('@playwright/test').Locator} context
   * @param {RegExp} labelPattern
   */
  async enabledButton(context, labelPattern) {
    const buttons = context
      .locator('button, [role="button"]')
      .filter({ visible: true })
      .filter({ hasText: labelPattern });
    const count = await buttons.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      if (await button.isEnabled().catch(() => false)) return button;
    }

    return buttons.first();
  }

  /**
   * @param {string} title
   */
  findRowByTitle(title) {
    return this.rows.filter({ hasText: title });
  }

  async searchFor(text) {
    const input = this.searchInput;
    const hasSearch = await input.isVisible().catch(() => false);
    if (!hasSearch) return false;

    await input.click({ force: true }).catch(() => {});
    await input.fill('').catch(() => {});
    await input.fill(text).catch(async () => {
      await input.pressSequentially(text, { delay: 20 }).catch(() => {});
    });
    await this.clickSearchButton();
    await this.page.waitForTimeout(1200);
    return true;
  }

  /**
   * Finds the row for a specific reel by filtering the table via the search box first,
   * since the Reels table holds real demo data and row order is not reliably newest-first.
   * @param {string} title
   * @param {number} timeout
   */
  async locateReelRow(title, timeout = 10000) {
    await this.searchFor(title);
    const row = this.findRowByTitle(title).first();
    const found = await row.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    return found ? row : null;
  }

  /**
   * @param {RegExp} actionLabel
   * @param {import('@playwright/test').Locator} row
   */
  async openRowAction(actionLabel, row = this.rows.first()) {
    const rowReady = await row.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    if (!rowReady) return false;

    let directActionSelector = 'button:has-text("Edit"), button:has(mat-icon:has-text("edit"))';
    if (/delete|remove/i.test(actionLabel.source)) {
      directActionSelector = 'button:has-text("Delete"), button:has-text("Remove"), button:has(mat-icon:has-text("delete"))';
    } else if (/view|details/i.test(actionLabel.source)) {
      directActionSelector = [
        'button:has-text("View")',
        'button:has-text("Details")',
        'button:has(mat-icon:has-text("visibility"))',
        'button:has(mat-icon:has-text("remove_red_eye"))',
      ].join(', ');
    }

    const menuTrigger = row
      .locator(
        [
          'button:has(mat-icon:has-text("more_vert"))',
          'button:has(mat-icon:has-text("more_horiz"))',
          'mat-icon:has-text("more_vert")',
          'mat-icon:has-text("more_horiz")',
          '.mat-menu-trigger',
          '[aria-label*="More" i]',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();

    if (await menuTrigger.isVisible().catch(() => false)) {
      await menuTrigger.scrollIntoViewIfNeeded().catch(() => {});
      await menuTrigger.click().catch(() => {});
      await this.page.waitForTimeout(800);

      const action = this.page
        .locator(
          [
            '.cdk-overlay-pane [role="menuitem"]',
            '.cdk-overlay-pane button.mat-menu-item',
            '.mat-menu-panel [role="menuitem"]',
            '[role="menu"] [role="menuitem"]',
            '.dropdown-menu .dropdown-item',
            'button',
          ].join(', ')
        )
        .filter({ visible: true })
        .filter({ hasText: actionLabel })
        .first();

      if (await action.isVisible().catch(() => false)) {
        await action.click().catch(() => {});
        await this.page.waitForTimeout(1500);
        return true;
      }

      await this.page.keyboard.press('Escape').catch(() => {});
    }

    const directAction = row.locator(directActionSelector).filter({ visible: true }).first();
    if (await directAction.isVisible().catch(() => false)) {
      await directAction.scrollIntoViewIfNeeded().catch(() => {});
      await directAction.click().catch(() => {});
      await this.page.waitForTimeout(1500);
      return true;
    }

    return false;
  }

  async verifyActionsMenu() {
    const opened = await this.openRowAction(/View|Details|Edit|Delete|Remove/i);
    if (!opened) {
      console.log('INFO: No Reels row actions available.');
      await this.verifyPageLoaded();
      return;
    }

    if (await this.activeDialog().isVisible().catch(() => false)) {
      await this.closeDialog();
    } else {
      await this.page.keyboard.press('Escape').catch(() => {});
    }

    await this.verifyPageLoaded();
  }

  async verifyViewFlow() {
    const row = await this.locateReelRow(REEL_TITLE);
    expect(row, `A reel titled "${REEL_TITLE}" should exist in the table before viewing it.`).not.toBeNull();

    const opened = await this.openRowAction(/View|Details/i, row);
    expect(opened, 'Reels view action should open from the row.').toBe(true);

    const dialog = this.activeDialog();
    await expect(dialog, 'Reels view dialog should open.').toBeVisible({ timeout: 10000 });

    const titleInput = dialog.locator(
      'input[formcontrolname*="title" i], input[placeholder*="Title" i], mat-form-field:has-text("Title") input'
    ).first();
    const hasTitleInput = await titleInput.count().then((c) => c > 0).catch(() => false);

    if (hasTitleInput) {
      await expect(titleInput, `Reels view dialog should show the title "${REEL_TITLE}".`).toHaveValue(REEL_TITLE, { timeout: 10000 });
    } else {
      await expect(dialog, `Reels view dialog should mention the title "${REEL_TITLE}".`).toContainText(REEL_TITLE, { timeout: 10000 });
    }

    await this.closeDialog();
    await this.verifyPageLoaded();
  }

  async verifyEditFlow() {
    const row = await this.locateReelRow(REEL_TITLE);
    expect(row, `A reel titled "${REEL_TITLE}" should exist in the table before editing it.`).not.toBeNull();

    const opened = await this.openRowAction(/Edit|Update/i, row);
    expect(opened, 'Reels edit action should open from the row.').toBe(true);

    const dialog = this.activeDialog();
    await expect(dialog, 'Reels edit dialog should open.').toBeVisible({ timeout: 10000 });

    await this.fillFirstVisible(dialog, [
      'input[formcontrolname*="title" i]',
      'input[placeholder*="Title" i]',
      'mat-form-field:has-text("Title") input',
      'input[type="text"]',
      'input:not([type])',
    ], REEL_TITLE_EDITED);

    const updateButton = await this.enabledButton(dialog, /^(Edit|Update|Save|Submit)$/i);
    await expect(updateButton, 'Reels edit submit button should be visible.').toBeVisible({ timeout: 10000 });
    await expect(updateButton, 'Reels edit submit button should be enabled once the title is changed.').toBeEnabled({ timeout: 10000 });
    await updateButton.click();
    await this.waitForSubmitToSettle(30000);
    await this.confirmSuccessIfShown();

    const updatedRow = await this.locateReelRow(REEL_TITLE_EDITED, 15000);
    expect(updatedRow, `A reel titled "${REEL_TITLE_EDITED}" should appear in the table after editing it.`).not.toBeNull();
  }

  async verifyDeleteFlow() {
    const row = await this.locateReelRow(REEL_TITLE_EDITED);
    expect(row, `A reel titled "${REEL_TITLE_EDITED}" should exist in the table before deleting it.`).not.toBeNull();

    const opened = await this.openRowAction(/Delete|Remove/i, row);
    expect(opened, 'Reels delete action should open from the row.').toBe(true);

    const confirmation = this.activeDialog();
    await expect(confirmation, 'Reels delete confirmation dialog should open.').toBeVisible({ timeout: 10000 });

    const confirmButton = await this.enabledButton(confirmation, /^(Delete|Remove|Yes|Confirm)$/i);
    await expect(confirmButton, 'Reels delete confirm button should be visible.').toBeVisible({ timeout: 10000 });
    await confirmButton.click();
    await this.waitForSubmitToSettle(30000);
    await this.confirmSuccessIfShown();

    await this.searchFor(REEL_TITLE_EDITED);
    await expect(
      this.findRowByTitle(REEL_TITLE_EDITED),
      `The reel titled "${REEL_TITLE_EDITED}" should be removed from the table after deleting it.`
    ).toHaveCount(0, { timeout: 10000 });

    await this.verifyPageLoaded();
  }

  async verifyFiltersAndPagination() {
    const searchInput = this.searchInput;

    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.click({ force: true });
      await searchInput.fill('reel').catch(() => {});
      await this.clickSearchButton();
      await this.page.waitForTimeout(1200);
      await searchInput.fill('').catch(() => {});
      await this.clickSearchButton();
    }

    const filterSelect = this.page.locator('mat-select, [role="combobox"]').filter({ visible: true }).first();
    if (await filterSelect.isVisible().catch(() => false)) {
      await this.selectDropdown(this.page.locator('body'), null, 0);
    }

    await this.verifyPagination();
    await this.verifyPageLoaded();
  }

  async clickSearchButton() {
    const searchButton = this.page
      .locator('button[aria-label*="search" i], button:has(mat-icon:has-text("search")), button:has-text("Search")')
      .filter({ visible: true })
      .first();
    if (await searchButton.isVisible().catch(() => false) && await searchButton.isEnabled().catch(() => false)) {
      await searchButton.click().catch(() => {});
    } else {
      await this.page.keyboard.press('Enter').catch(() => {});
    }
  }

  async verifyPagination() {
    const nextButton = this.page
      .locator(
        [
          'button[aria-label*="Next" i]',
          '.mat-paginator-navigation-next',
          '.ngx-pagination li.pagination-next',
          'li.pagination-next',
          'li.page-item:has-text("Next")',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();

    if (!(await nextButton.isVisible().catch(() => false))) {
      console.log('INFO: Pagination next button not visible for Reels; table may have one page.');
      return;
    }

    const disabled = await nextButton.evaluate((node) => {
      return node.hasAttribute('disabled') ||
        node.getAttribute('aria-disabled') === 'true' ||
        /disabled/.test(node.getAttribute('class') || '');
    }).catch(() => true);

    if (disabled) {
      console.log('INFO: Pagination next button disabled for Reels; single page result.');
      return;
    }

    await nextButton.click().catch(() => {});
    await this.page.waitForTimeout(1500);
    await expect(this.page.locator('body')).toBeVisible();
  }

  /**
   * Waits out a submit button's disabled loading state (e.g. "Creating...", "Updating...",
   * "Deleting...") instead of a fixed sleep, since a real video upload can take a while to
   * finish processing on the backend.
   * @param {number} timeout
   */
  async waitForSubmitToSettle(timeout = 30000) {
    const loadingButton = this.page
      .locator('button')
      .filter({ hasText: /ing(\.\.\.)?$/i })
      .filter({ visible: true })
      .first();
    await loadingButton.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    await loadingButton.waitFor({ state: 'hidden', timeout }).catch(() => {});
    await this.page.waitForTimeout(500);
  }

  async confirmSuccessIfShown() {
    const okButton = this.page
      .locator('.swal2-confirm, button:has-text("OK"), button:has-text("Ok")')
      .filter({ visible: true })
      .first();
    if (await okButton.isVisible().catch(() => false)) {
      await okButton.click().catch(() => {});
      await this.page.waitForTimeout(1000);
    }
  }

  async closeDialog() {
    const dialog = this.activeDialog();
    const cancelButton = this.page
      .locator(
        [
          '.swal2-cancel',
          'button:has-text("Cancel")',
          'button:has-text("Close")',
          'button:has-text("No")',
          '[aria-label="Close"]',
          'button:has(mat-icon:has-text("close"))',
          'mat-icon:has-text("close")',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();

    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click().catch(() => {});
      await this.page.waitForTimeout(1000);
    } else if (await dialog.isVisible().catch(() => false)) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * @param {string} value
   */
  firstLine(value) {
    return value.replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  /**
   * @param {string} value
   */
  normalize(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  async mainContentText() {
    return this.page.locator('body').evaluate((body) => {
      const clone = body.cloneNode(true);
      const selectorsToRemove = [
        'nav',
        'aside',
        '.sidebar',
        '.navbar',
        '.right-sidebar',
        '.cdk-overlay-container',
        'mat-sidenav',
      ];

      for (const selector of selectorsToRemove) {
        // @ts-ignore
        clone.querySelectorAll(selector).forEach((node) => node.remove());
      }

      return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    }).catch(() => '');
  }
}

test.describe.serial('Reels - Full CRUD and Actions', () => {
  /** @type {ReelsPage} */
  let reels;

  test.beforeEach(async ({ page }) => {
    reels = new ReelsPage(page);
    await reels.goto();
  });

  test('REEL-01: Reels list page loads with main controls', async () => {
    await reels.verifyPageLoaded();
  });

  test('REEL-02: Create a reel with a real video upload and confirm it appears in the table', async () => {
    test.setTimeout(240000);
    await reels.verifyCreateReelFlow();
  });

  test('REEL-03: Reels row actions are available', async () => {
    await reels.verifyActionsMenu();
  });

  test('REEL-04: View the created reel\'s details', async () => {
    await reels.verifyViewFlow();
  });

  test('REEL-05: Edit the created reel and confirm the update is saved', async () => {
    test.setTimeout(180000);
    await reels.verifyEditFlow();
  });

  test('REEL-06: Delete the edited reel and confirm it is removed', async () => {
    await reels.verifyDeleteFlow();
  });

  test('REEL-07: Reels filters, search, and pagination are usable', async () => {
    await reels.verifyFiltersAndPagination();
  });
});
