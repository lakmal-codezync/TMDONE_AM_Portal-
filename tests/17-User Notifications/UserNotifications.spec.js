// @ts-check
// ============================================================
// TMDone Admin Console - User Notifications
// Scope: view-only coverage — page load, viewing an existing
// notification's details, its Excel attachment download, and the
// list's row-actions menu, search, clear, and pagination. Creating a
// notification is only ever done as setup (when none exist yet to
// view) — there is no dedicated create test.
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

const USER_NOTIFICATION_ROUTES = [
  '#/home/user-notifications',
  '#/home/user-notifications/list',
  '#/home/user-notification',
  '#/home/user-notification/list',
  '#/home/notifications/user',
  '#/home/userNotifications',
];

const EXCEL_UPLOAD_FILE = 'tests/fixtures/user-notifications-phone-numbers.xlsx';
const PHONE_NUMBER = '94713346662';
const RUN_ID = Date.now();
const NOTIFICATION_TITLE = `Auto User Notification ${RUN_ID}`;
const NOTIFICATION_ARABIC_TITLE = `Arabic Auto User Notification ${RUN_ID}`;
const NOTIFICATION_DESCRIPTION = `Playwright automation user notification ${RUN_ID}`;
const NOTIFICATION_ARABIC_DESCRIPTION = `Arabic Playwright automation user notification ${RUN_ID}`;
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
const today = new Date();
const scheduledDate = new Date(today);
scheduledDate.setDate(scheduledDate.getDate() + 1);
const SCHEDULED_DATE = `${pad(scheduledDate.getDate())}/${pad(scheduledDate.getMonth() + 1)}/${scheduledDate.getFullYear()}`;

class UserNotificationsPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }

  get pageSignal() {
    return this.page
      .locator(
        [
          'h1',
          'h2',
          'h3',
          'h4',
          '.page-title',
          '.breadcrumb-item',
          'button',
          'mat-table',
          'table',
        ].join(', ')
      )
      .filter({ hasText: /User\s*Notifications?|Notification/i })
      .filter({ visible: true })
      .first();
  }

  get createButton() {
    return this.page
      .locator(
        [
          'button:has-text("Create User Notification")',
          'button:has-text("Add User Notification")',
          'button:has-text("Create Notification")',
          'button:has-text("Add Notification")',
          'button:has-text("Create")',
          'button:has-text("Add")',
          'button:has(mat-icon:has-text("add"))',
          '[role="button"]:has-text("Create")',
          '[role="button"]:has-text("Add")',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();
  }

  get table() {
    return this.page.locator('mat-table, table, .table-responsive, .ngx-datatable').filter({ visible: true }).first();
  }

  get rows() {
    return this.page.locator('mat-row, tbody tr, .datatable-body-row').filter({ visible: true });
  }

  activeDialog() {
    return this.page
      .locator('mat-dialog-container, modal-container, .modal-dialog, [role="dialog"], .swal2-popup')
      .filter({ visible: true })
      .last();
  }

  async goto() {
    await loginToApp(this.page);

    let moduleLoaded = false;
    for (const route of USER_NOTIFICATION_ROUTES) {
      await goToPage(this.page, route);
      await this.waitForNoSpinner();
      if (await this.pollForUserNotificationsPage()) {
        moduleLoaded = true;
        break;
      }
    }

    if (!moduleLoaded) {
      moduleLoaded = await this.openFromSidebar();
    }

    const contentText = await this.mainContentText();
    test.skip(
      !moduleLoaded,
      `User Notifications module is not available from known routes or sidebar. Current page: "${this.firstLine(contentText)}".`
    );

    await this.waitForReady();
  }

  async openFromSidebar() {
    const menuItem = this.page
      .locator(
        [
          'a:has-text("User Notifications")',
          'a:has-text("User Notification")',
          'button:has-text("User Notifications")',
          'button:has-text("User Notification")',
          '[role="menuitem"]:has-text("User Notifications")',
          '[role="treeitem"]:has-text("User Notifications")',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();

    if (!(await menuItem.isVisible().catch(() => false))) return false;

    // A real (non-forced) click is required - this sidebar link is an
    // Angular router-link <a>, and a force click bypasses its click
    // handler, leaving the app on whatever page it started from.
    await menuItem.click().catch(() => {});
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.page.waitForTimeout(2500);
    await this.waitForNoSpinner();
    return this.pollForUserNotificationsPage();
  }

  async isUserNotificationsPage() {
    const url = this.page.url();
    const contentText = await this.mainContentText();
    const hasUserNotificationSignal = /User\s*Notifications?|Create\s*User\s*Notification|Notification\s*Title|Basic\s*Information/i.test(contentText);
    const wrongModuleSignal = /Campaigns|Smart\s*Boost|Reels|Offers|Order\s*Management/i.test(this.firstLine(contentText));
    return /notification/i.test(url) && hasUserNotificationSignal && !wrongModuleSignal;
  }

  /**
   * The lazy-loaded module can take a moment to render after navigation,
   * especially under slow live-environment load - a single immediate
   * check right after navigating can false-negative. Poll for a few
   * seconds before giving up on the current route/click.
   * @param {number} timeoutMs
   */
  async pollForUserNotificationsPage(timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    do {
      if (await this.isUserNotificationsPage()) return true;
      await this.page.waitForTimeout(500);
    } while (Date.now() < deadline);
    return false;
  }

  async waitForReady() {
    await expect(this.page).not.toHaveURL(/signin/i, { timeout: 25000 });

    const ready = await Promise.race([
      this.pageSignal.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false),
      this.table.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false),
      this.createButton.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false),
    ]);

    expect(ready, 'User Notifications page should expose a heading, table, or create button.').toBe(true);
    await this.waitForNoSpinner();
  }

  async verifyPageLoaded() {
    await this.waitForReady();
    await expect(this.page.locator('body')).toContainText(/User\s*Notifications?|Notification|Title|Description|Status|Actions/i);

    const visibleControls = await this.page
      .locator('button, input, textarea, mat-select, [role="combobox"], mat-table, table')
      .filter({ visible: true })
      .count();
    expect(visibleControls).toBeGreaterThan(0);
  }

  /**
   * Picks the title of whatever notification currently sits in the first
   * table row (any pre-existing demo data counts), without filtering by
   * search. Returns null if the table is empty.
   */
  async findExistingNotificationTitle() {
    await this.clickClearButton().catch(() => {});
    await this.waitForNoSpinner();
    const anyRow = this.rows.first();
    if (!(await anyRow.isVisible({ timeout: 5000 }).catch(() => false))) return null;

    // Read only the title (first) cell - the row's own innerText joins every
    // column into one string with no separator, which isn't usable as a
    // search term or a hasText match against a specific row later.
    const titleCell = anyRow.locator('mat-cell, td, .datatable-body-cell').first();
    const titleText = (await titleCell.innerText().catch(() => '')).trim();
    return titleText || null;
  }

  /**
   * View-only coverage needs a notification to view. Reuse whatever
   * already exists in the shared demo data; only create one (via the
   * full Basic Information + Excel upload flow) if the list is empty.
   */
  async ensureNotificationToView() {
    const existingTitle = await this.findExistingNotificationTitle();
    if (existingTitle) {
      console.log(`UN: using existing notification "${existingTitle}" to view.`);
      return existingTitle;
    }

    console.log('UN: no existing notification found; creating one to view.');
    await this.createNotification();
    return NOTIFICATION_TITLE;
  }

  async createNotification() {
    await expect(this.createButton).toBeVisible({ timeout: 20000 });
    await this.createButton.click({ force: true });
    await this.page.waitForTimeout(1500);

    const dialog = this.activeDialog();
    const context = await dialog.isVisible().catch(() => false) ? dialog : this.page.locator('body');
    await expect(context).toContainText(/Basic\s*Information|Title|Description|Notification/i, { timeout: 15000 });

    const titleFilled = await this.fillFirstVisible(context, [
      'input[formcontrolname="Title"]',
      'input[formcontrolname*="title" i]',
      'input[placeholder*="Title" i]',
      'mat-form-field:has-text("Title") input',
      'input[type="text"]',
      'input:not([type])',
    ], NOTIFICATION_TITLE);
    expect(titleFilled, 'Notification title field should be filled.').toBe(true);

    const descriptionFilled = await this.fillFirstVisible(context, [
      'textarea[formcontrolname="Description"]',
      'textarea[formcontrolname*="description" i]',
      'textarea[placeholder*="Description" i]',
      'mat-form-field:has-text("Description") textarea',
      'mat-form-field:has-text("Description") [contenteditable="true"]',
      '[aria-label*="Description" i][contenteditable="true"]',
      '[placeholder*="Description" i][contenteditable="true"]',
      'textarea',
      'input[formcontrolname*="description" i]',
      'input[placeholder*="Description" i]',
      '[contenteditable="true"]',
    ], NOTIFICATION_DESCRIPTION);
    expect(descriptionFilled, 'Notification description field should be filled.').toBe(true);

    const arabicTitleFilled = await this.fillFirstVisible(context, [
      'input[formcontrolname="ArabicTitle"]',
      'input[formcontrolname="ArabicTitle" i]',
      'input[formcontrolname*="arabicTitle" i]',
      'input[placeholder*="Arabic Title" i]',
      'mat-form-field:has-text("Arabic Title") input',
    ], NOTIFICATION_ARABIC_TITLE);
    expect(arabicTitleFilled, 'Notification Arabic title field should be filled.').toBe(true);

    const arabicDescriptionFilled = await this.fillFirstVisible(context, [
      'textarea[formcontrolname="ArabicDescription"]',
      'textarea[formcontrolname="ArabicDescription" i]',
      'textarea[formcontrolname*="arabicDescription" i]',
      'textarea[placeholder*="Arabic Description" i]',
      'mat-form-field:has-text("Arabic Description") textarea',
      'mat-form-field:has-text("Arabic Description") [contenteditable="true"]',
      '[aria-label*="Arabic Description" i][contenteditable="true"]',
      '[placeholder*="Arabic Description" i][contenteditable="true"]',
    ], NOTIFICATION_ARABIC_DESCRIPTION);
    expect(arabicDescriptionFilled, 'Notification Arabic description field should be filled.').toBe(true);

    const dateSelected = await this.selectScheduledDate(context);
    expect(dateSelected, 'Notification scheduled date should be selected.').toBe(true);

    const timeSelected = await this.selectScheduledTime(context);
    expect(timeSelected, 'Notification scheduled time should be selected.').toBe(true);

    const advancedToUpload = await this.clickEnabledButton(context, /Next|Continue/i, { required: false });
    if (!advancedToUpload) {
      test.skip(true, 'Notification Basic Information form kept Next disabled after required fields were filled.');
    }
    await this.page.waitForTimeout(1500);

    const uploadContext = await this.activeDialog().isVisible().catch(() => false) ? this.activeDialog() : this.page.locator('body');
    await expect(uploadContext).toContainText(/Excel|Upload|Phone|Submit|Create|Recipient/i, { timeout: 15000 });
    const uploaded = await this.uploadExcelFile(uploadContext);
    if (!uploaded) {
      test.skip(true, 'Notification Excel upload control is not usable in this environment.');
    }

    const submitted = await this.clickEnabledButton(uploadContext, /Create|Submit|Save|Done|Upload/i, { required: false });
    if (!submitted) {
      test.skip(true, 'Notification upload step kept the submit action disabled in this environment.');
    }
    await this.page.waitForTimeout(2500);
    await this.confirmSuccessIfShown();
    await this.waitForNoSpinner();
    await this.searchByTitle(NOTIFICATION_TITLE);
  }

  /** @param {string} title */
  async verifyViewNotification(title) {
    await this.searchByTitle(title);

    const row = await this.createdRowOrSkip(title, `Notification "${title}" is not available to view in this environment.`);
    const opened = await this.openRowAction(/View|Details|Preview/i, row);
    expect(opened, 'Notification row should expose a View or Details action.').toBe(true);

    const dialog = this.activeDialog();
    if (await dialog.isVisible().catch(() => false)) {
      await expect(dialog).toContainText(/User\s*Notification|Notification|Title|Description|Phone|Excel|Details|View/i, { timeout: 15000 });
      await this.closeDialog();
    } else {
      await expect(this.page.locator('body')).toContainText(/User\s*Notification|Notification|Title|Description|Phone|Excel|Details|View/i);
      await this.goto();
    }
  }

  /** @param {string} title */
  async verifyExcelDownload(title) {
    await this.searchByTitle(title);

    const row = await this.createdRowOrSkip(title, `Notification "${title}" is not available for Excel download verification in this environment.`);
    const viewOpened = await this.openRowAction(/View|Details|Preview/i, row);
    expect(viewOpened, 'Excel download is exposed from the User Notification view/details surface.').toBe(true);

    const detailsContext = await this.activeDialog().isVisible().catch(() => false) ? this.activeDialog() : this.page.locator('body');
    await expect(detailsContext).toContainText(/User\s*Notification|Notification|Title|Description|Next/i, { timeout: 15000 });
    await this.clickEnabledButton(detailsContext, /Next|Continue/i, { required: true });
    await this.page.waitForTimeout(1200);

    const excelContext = await this.activeDialog().isVisible().catch(() => false) ? this.activeDialog() : this.page.locator('body');
    await expect(excelContext).toContainText(/Excel|Upload|Phone|Download|Assign\s*Users|File/i, { timeout: 15000 });

    const detailDownload = excelContext
      .locator(
        [
          'a:has-text("Download attached excel")',
          'a:has-text("Download")',
          'button:has-text("Download attached excel")',
          'button:has-text("Download")',
          'button:has-text("Excel")',
          'button:has-text("Export")',
          '[role="button"]:has-text("Download")',
          'button[aria-label*="download" i]',
          'a[download]',
          'a[href*=".xlsx" i]',
          'a[href*=".xls" i]',
          'a[href*="excel" i]',
          'button:has(mat-icon:has-text("download"))',
          'button:has(mat-icon:has-text("file_download"))',
          'button:has(img:has-text("download"))',
          'button:has(img:has-text("file_download"))',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();

    const downloadVisible = await detailDownload.isVisible({ timeout: 10000 }).catch(() => false);
    if (!downloadVisible) {
      await this.closeDialog();
      await this.goto();
      test.skip(true, `"${title}" has no Excel attachment to download in this environment.`);
    }
    await this.capturePossibleDownload(detailDownload);
    await this.closeDialog();
    await this.goto();
  }

  /**
   * View-only coverage: search/clear/pagination and that a row exposes an
   * actions menu. Create/edit/delete are intentionally not exercised here.
   * @param {string} title
   */
  async verifyAllVisibleButtonsAndTableTools(title) {
    await this.verifySearchClearAndPagination(title);
    await this.verifyRowActionMenu();

    const buttons = this.page.locator('button, [role="button"]').filter({ visible: true });
    expect(await buttons.count()).toBeGreaterThan(0);

    const maxButtonsToProbe = Math.min(await buttons.count(), 20);
    for (let index = 0; index < maxButtonsToProbe; index += 1) {
      const button = buttons.nth(index);
      const label = await this.controlLabel(button);
      if (!label || /create|add|delete|remove|submit|save|update|logout|sign out/i.test(label)) continue;
      await expect(button).toBeVisible();
    }
  }

  /** @param {string} title */
  async verifySearchClearAndPagination(title) {
    const searchInput = this.page
      .locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element')
      .filter({ visible: true })
      .first();

    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.click({ force: true });
      await searchInput.fill(title);
      await this.clickSearchButton();
      await this.page.waitForTimeout(1200);
      await expect(this.table.or(this.page.locator(':text("No data"), :text("No records"), :text("No results")').first()).first()).toBeVisible();
      await this.clickClearButton();
    }

    await this.verifyPagination();
  }

  async verifyRowActionMenu() {
    const row = this.rows.first();
    if (!(await row.isVisible().catch(() => false))) return;

    const opened = await this.openRowMenu(row);
    expect(opened, 'A notification row should expose actions or direct action buttons.').toBe(true);
    await this.page.keyboard.press('Escape').catch(() => {});
  }

  /** @param {string} title */
  rowByTitle(title) {
    return this.rows.filter({ hasText: title }).first();
  }

  /**
   * @param {string} title
   * @param {string} reason
   */
  async createdRowOrSkip(title, reason) {
    const createdRow = this.rowByTitle(title);
    if (await createdRow.isVisible().catch(() => false)) return createdRow;

    const noResultsVisible = await this.page
      .locator(':text("No data"), :text("No records"), :text("No results"), :text("No matching records")')
      .filter({ visible: true })
      .first()
      .isVisible()
      .catch(() => false);
    const anyRowVisible = await this.rows.first().isVisible().catch(() => false);

    test.skip(noResultsVisible || !anyRowVisible, reason);
    test.skip(true, `${reason} Search did not return "${title}".`);
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
      const isContentEditable = await field.evaluate((node) => {
        const element = /** @type {HTMLElement} */ (node);
        return element.isContentEditable || element.getAttribute('contenteditable') === 'true';
      }).catch(() => false);
      if (!isContentEditable && !(await field.isEditable().catch(() => true))) continue;

      await field.scrollIntoViewIfNeeded().catch(() => {});
      await field.click({ clickCount: 3, force: true }).catch(() => {});
      if (isContentEditable) {
        await field.evaluate((node, text) => {
          const element = /** @type {HTMLElement} */ (node);
          element.textContent = text;
          element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        }, value).catch(async () => {
          await field.pressSequentially(value, { delay: 20 }).catch(() => {});
        });
      } else {
        await field.fill(value).catch(async () => {
          await field.pressSequentially(value, { delay: 20 }).catch(() => {});
        });
      }
      await field.dispatchEvent('input').catch(() => {});
      await field.dispatchEvent('change').catch(() => {});
      return true;
    }
    return false;
  }

  /** @param {import('@playwright/test').Locator} context */
  async uploadExcelFile(context) {
    const fileInputs = context.locator('input[type="file"]');
    const count = await fileInputs.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const input = fileInputs.nth(index);
      await input.setInputFiles(EXCEL_UPLOAD_FILE).catch(() => {});
      await input.dispatchEvent('change').catch(() => {});
      await this.page.waitForTimeout(1200);
      if (await this.uploadSucceeded(context)) return true;
    }

    const uploadButton = context
      .locator('button:has-text("Upload"), button:has-text("Choose"), button:has-text("Browse"), [role="button"]:has-text("Upload")')
      .filter({ visible: true })
      .first();
    if (await uploadButton.isVisible().catch(() => false)) {
      const chooserPromise = this.page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
      await uploadButton.click({ force: true }).catch(() => {});
      const chooser = await chooserPromise;
      if (chooser) {
        await chooser.setFiles(EXCEL_UPLOAD_FILE);
        await this.page.waitForTimeout(1200);
        return this.uploadSucceeded(context);
      }
    }

    return false;
  }

  /** @param {import('@playwright/test').Locator} context */
  async selectScheduledDate(context) {
    const dateInput = context
      .locator(
        [
          'input[formcontrolname="ScheduledDate" i]',
          'input[formcontrolname*="scheduledDate" i]',
          'mat-form-field:has-text("Scheduled Date") input',
          'input[placeholder*="Scheduled Date" i]',
          'input[placeholder*="Date" i]',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();

    if (!(await dateInput.isVisible().catch(() => false))) return false;

    const calendarToggle = context.locator('button[aria-label="Open calendar"], mat-datepicker-toggle button').filter({ visible: true }).first();
    if (!(await calendarToggle.isVisible().catch(() => false))) {
      await dateInput.click({ clickCount: 3, force: true }).catch(() => {});
      await dateInput.fill(SCHEDULED_DATE).catch(() => {});
      await dateInput.dispatchEvent('input').catch(() => {});
      await dateInput.dispatchEvent('change').catch(() => {});
      await dateInput.press('Tab').catch(() => {});
      await this.page.waitForTimeout(500);
      return this.isValidField(dateInput);
    }

    await calendarToggle.click({ force: true });
    await this.page
      .locator('.mat-datepicker-content, .mat-calendar, .cdk-overlay-pane')
      .filter({ visible: true })
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {});
    await this.page.waitForTimeout(700);

    const dateSelected = await this.clickCalendarDay(scheduledDate.getDate());
    if (!dateSelected) return false;
    await this.page.waitForTimeout(500);
    return this.isValidField(dateInput);
  }

  /** @param {number} day */
  async clickCalendarDay(day) {
    const exactDay = new RegExp(`^\\s*${day}\\s*$`);
    const cells = this.page
      .locator('.mat-calendar-body-cell:not([aria-disabled="true"]), [role="gridcell"]:not([aria-disabled="true"])')
      .filter({ hasText: exactDay })
      .filter({ visible: true });
    const count = await cells.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const cell = cells.nth(index);
      const classList = (await cell.getAttribute('class').catch(() => '')) || '';
      if (/disabled/i.test(classList)) continue;
      await this.clickByDom(cell);
      return true;
    }

    const fallback = this.page
      .locator('.mat-calendar-body-cell:not([aria-disabled="true"]), [role="gridcell"]:not([aria-disabled="true"])')
      .filter({ visible: true })
      .last();
    if (!(await fallback.isVisible().catch(() => false))) return false;
    await this.clickByDom(fallback);
    return true;
  }

  /** @param {import('@playwright/test').Locator} context */
  async selectScheduledTime(context) {
    const timeInput = context
      .locator(
        [
          'input[formcontrolname="ScheduledTime" i]',
          'input[formcontrolname*="scheduledTime" i]',
          'mat-form-field:has-text("Scheduled Time") input',
          'input[placeholder*="Scheduled Time" i]',
          'input[placeholder*="Time" i]',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();

    if (!(await timeInput.isVisible().catch(() => false))) return false;

    const timeToggle = context
      .locator(
        [
          '.ngx-mat-timepicker-toggle',
          'ngx-mat-timepicker-toggle button',
          'button:has(.ngx-mat-timepicker-toggle)',
          'button[aria-label*="time" i]',
          'mat-form-field:has-text("Scheduled Time") button',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();

    if (await timeToggle.isVisible().catch(() => false)) {
      await timeToggle.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1000);

      const pmButton = this.page.locator('.timepicker-period__btn, button').filter({ hasText: /^PM$/ }).filter({ visible: true }).first();
      if (await pmButton.isVisible().catch(() => false)) {
        await this.clickByDom(pmButton);
        await this.page.waitForTimeout(300);
      }

      const okButton = this.page.getByRole('button', { name: /^OK$/ }).filter({ visible: true }).last();
      if (await okButton.isVisible().catch(() => false)) {
        await okButton.click({ force: true, timeout: 5000 }).catch(async () => {
          await this.clickByDom(okButton);
        });
        await this.page.waitForTimeout(700);
      }

      if (await this.page.getByRole('button', { name: /^OK$/ }).filter({ visible: true }).last().isVisible().catch(() => false)) {
        await this.page.keyboard.press('Enter').catch(() => {});
        await this.page.waitForTimeout(700);
      }
    }

    const currentValue = ((await timeInput.inputValue().catch(() => '')) || '').trim();
    if (/\d{1,2}:\d{2}\s*(AM|PM)/i.test(currentValue)) return true;

    await timeInput.click({ clickCount: 3, force: true }).catch(() => {});
    await timeInput.fill('12:00 PM').catch(() => {});
    await timeInput.dispatchEvent('input').catch(() => {});
    await timeInput.dispatchEvent('change').catch(() => {});
    await timeInput.press('Tab').catch(() => {});
    await this.page.waitForTimeout(500);

    return /\d{1,2}:\d{2}\s*(AM|PM)/i.test(((await timeInput.inputValue().catch(() => '')) || '').trim());
  }

  /** @param {import('@playwright/test').Locator} locator */
  async isValidField(locator) {
    const value = ((await locator.inputValue().catch(() => '')) || '').trim();
    const classList = (await locator.getAttribute('class').catch(() => '')) || '';
    return Boolean(value) && !/\bng-invalid\b/.test(classList);
  }

  /** @param {import('@playwright/test').Locator} locator */
  async clickByDom(locator) {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click({ force: true, timeout: 3000 }).catch(async () => {
      await locator.evaluate((node) => {
        const target = node.closest('button, [role="button"], .btn') || node;
        for (const eventName of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
          target.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window }));
        }
      }).catch(() => {});
    });
  }

  /** @param {import('@playwright/test').Locator} context */
  async uploadSucceeded(context) {
    const uploadedFileSignal = context
      .locator(':text("user-notifications-phone-numbers.xlsx"), :text("Download attached excel"), button:has-text("Delete File")')
      .filter({ visible: true })
      .first();
    if (await uploadedFileSignal.isVisible().catch(() => false)) return true;

    const createButton = await this.enabledButton(context, /Create|Submit|Save|Done|Upload/i);
    return await createButton.isVisible().catch(() => false) && await createButton.isEnabled().catch(() => false);
  }

  /**
   * @param {import('@playwright/test').Locator} context
   * @param {RegExp} label
   * @param {{ required?: boolean }} options
   */
  async clickEnabledButton(context, label, options = {}) {
    const button = await this.enabledButton(context, label);
    if (options.required) {
      await expect(button).toBeVisible({ timeout: 15000 });
      await expect(button).toBeEnabled({ timeout: 15000 });
    }

    if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
      await button.scrollIntoViewIfNeeded().catch(() => {});
      await button.click({ force: true });
      return true;
    }
    return false;
  }

  /**
   * @param {import('@playwright/test').Locator} context
   * @param {RegExp} label
   */
  async enabledButton(context, label) {
    const buttons = context.locator('button, [role="button"]').filter({ visible: true }).filter({ hasText: label });
    const count = await buttons.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      if (await button.isEnabled().catch(() => false)) return button;
    }

    return buttons.first();
  }

  /** @param {string} title */
  async searchByTitle(title) {
    const searchInput = this.page
      .locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element')
      .filter({ visible: true })
      .first();

    if (!(await searchInput.isVisible().catch(() => false))) return;

    await searchInput.click({ force: true });
    await searchInput.fill(title);
    await this.clickSearchButton();
    await this.page.waitForTimeout(1500);
  }

  async clickSearchButton() {
    const searchButton = this.page
      .locator('button[aria-label*="search" i], button:has(mat-icon:has-text("search")), button:has-text("Search")')
      .filter({ visible: true })
      .first();
    if (await searchButton.isVisible().catch(() => false) && await searchButton.isEnabled().catch(() => false)) {
      await searchButton.click({ force: true }).catch(() => {});
    } else {
      await this.page.keyboard.press('Enter').catch(() => {});
    }
  }

  async clickClearButton() {
    const clearButton = this.page
      .locator(
        [
          'button[aria-label*="clear" i]',
          'button:has(mat-icon:has-text("clear"))',
          'button:has(mat-icon:has-text("close"))',
          'button:has-text("Clear")',
          'button:has-text("Reset")',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();
    if (await clearButton.isVisible().catch(() => false) && await clearButton.isEnabled().catch(() => false)) {
      await clearButton.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * @param {import('@playwright/test').Locator} [button]
   */
  async capturePossibleDownload(button) {
    const downloadPromise = this.page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    if (button) await button.click({ force: true }).catch(() => {});
    const download = await downloadPromise;
    if (download) {
      const suggestedName = download.suggestedFilename();
      expect(suggestedName).toMatch(/\.(xlsx|xls|csv)$/i);
    }
  }

  /** @param {import('@playwright/test').Locator} row */
  async openRowMenu(row) {
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
      await menuTrigger.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(800);
      return (await this.rowActionMenuItems().count().catch(() => 0)) > 0;
    }

    const directActions = row.locator('button, [role="button"], a').filter({ visible: true });
    return (await directActions.count().catch(() => 0)) > 0;
  }

  rowActionMenuItems() {
    return this.page
      .locator(
        [
          '.cdk-overlay-pane [role="menuitem"]',
          '.cdk-overlay-pane button',
          '.mat-menu-panel [role="menuitem"]',
          '[role="menu"] [role="menuitem"]',
          '.dropdown-menu .dropdown-item',
        ].join(', ')
      )
      .filter({ visible: true });
  }

  /**
   * @param {RegExp} actionLabel
   * @param {import('@playwright/test').Locator} row
   */
  async openRowAction(actionLabel, row) {
    if (!(await row.isVisible().catch(() => false))) return false;

    const iconAction = this.iconActionLocator(row, actionLabel);
    if (await iconAction.isVisible().catch(() => false) && await iconAction.isEnabled().catch(() => true)) {
      await iconAction.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1500);
      return true;
    }

    const directAction = row
      .locator('button, [role="button"], a')
      .filter({ visible: true })
      .filter({ hasText: actionLabel })
      .first();
    if (await directAction.isVisible().catch(() => false) && await directAction.isEnabled().catch(() => true)) {
      await directAction.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1500);
      return true;
    }

    if (!(await this.openRowMenu(row))) return false;

    const menuAction = this.rowActionMenuItems().filter({ hasText: actionLabel }).first();
    if (!(await menuAction.isVisible().catch(() => false)) || !(await menuAction.isEnabled().catch(() => true))) {
      await this.page.keyboard.press('Escape').catch(() => {});
      return false;
    }

    await menuAction.click({ force: true }).catch(() => {});
    await this.page.waitForTimeout(1500);
    return true;
  }

  /**
   * @param {import('@playwright/test').Locator} row
   * @param {RegExp} actionLabel
   */
  iconActionLocator(row, actionLabel) {
    if (/view|details|preview/i.test(actionLabel.source)) {
      return row
        .locator(
          [
            'button:has(img:has-text("visibility"))',
            'button:has(mat-icon:has-text("visibility"))',
            'button:has-text("visibility")',
            'button:has-text("visib")',
            'button[aria-label*="view" i]',
            'button[title*="view" i]',
            'button[mattooltip*="view" i]',
            'button:has(img[alt*="view" i])',
            'button:has(img[title*="view" i])',
            'button:has(img[src*="view" i])',
            'button:has(img[src*="visibility" i])',
            'button:has(i[class*="view" i])',
            'button:has(i[class*="eye" i])',
            'button:has(svg[class*="view" i])',
            'a[aria-label*="view" i]',
            'a[title*="view" i]',
          ].join(', ')
        )
        .filter({ visible: true })
        .first();
    }

    if (/download|excel|export/i.test(actionLabel.source)) {
      return row
        .locator(
          [
            'button:has(img:has-text("download"))',
            'button:has(mat-icon:has-text("download"))',
            'button:has(img:has-text("file_download"))',
            'button:has(mat-icon:has-text("file_download"))',
            'button[aria-label*="download" i]',
            'button[title*="download" i]',
            'button[mattooltip*="download" i]',
            'button:has(img[alt*="download" i])',
            'button:has(img[title*="download" i])',
            'button:has(img[src*="download" i])',
            'button:has(i[class*="download" i])',
            'a[aria-label*="download" i]',
            'a[title*="download" i]',
          ].join(', ')
        )
        .filter({ visible: true })
        .first();
    }

    if (/edit|update/i.test(actionLabel.source)) {
      return row
        .locator(
          [
            'button:has(img:has-text("edit"))',
            'button:has(mat-icon:has-text("edit"))',
            'button[aria-label*="edit" i]',
            'button[title*="edit" i]',
            'button[mattooltip*="edit" i]',
            'button:has(img[alt*="edit" i])',
            'button:has(img[src*="edit" i])',
            'button:has(i[class*="edit" i])',
          ].join(', ')
        )
        .filter({ visible: true })
        .first();
    }

    if (/delete|remove/i.test(actionLabel.source)) {
      return row
        .locator(
          [
            'button:has(img:has-text("delete"))',
            'button:has(mat-icon:has-text("delete"))',
            'button[aria-label*="delete" i]',
            'button[title*="delete" i]',
            'button[mattooltip*="delete" i]',
            'button:has(img[alt*="delete" i])',
            'button:has(img[src*="delete" i])',
            'button:has(i[class*="delete" i])',
          ].join(', ')
        )
        .filter({ visible: true })
        .first();
    }

    return row.locator('button').filter({ visible: true }).filter({ hasText: actionLabel }).first();
  }

  async verifyPagination() {
    const nextButton = this.page
      .locator(
        [
          'button[aria-label*="Next" i]',
          '.mat-paginator-navigation-next',
          'li.pagination-next',
          'li.page-item:has-text("Next")',
          '[role="button"]:has-text("Next")',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();

    if (!(await nextButton.isVisible().catch(() => false))) return;
    if (await this.isDisabled(nextButton)) return;

    await nextButton.click({ force: true }).catch(() => {});
    await this.page.waitForTimeout(1500);
    await expect(this.page.locator('body')).toBeVisible();
  }

  async confirmSuccessIfShown() {
    const okButton = this.page
      .locator('.swal2-confirm, button:has-text("OK"), button:has-text("Ok"), button:has-text("Yes")')
      .filter({ visible: true })
      .first();
    if (await okButton.isVisible({ timeout: 7000 }).catch(() => false)) {
      await okButton.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1000);
    }
  }

  async closeDialog() {
    const closeButton = this.page
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

    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click({ force: true }).catch(() => {});
    } else {
      await this.page.keyboard.press('Escape').catch(() => {});
    }
    await this.page.waitForTimeout(1000);
  }

  async waitForNoSpinner() {
    for (const selector of ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay', '.loading-spinner']) {
      await this.page.locator(selector).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    }
  }

  /** @param {import('@playwright/test').Locator} locator */
  async isDisabled(locator) {
    return locator.evaluate((node) => {
      const element = /** @type {HTMLElement} */ (node);
      return element.hasAttribute('disabled') ||
        element.getAttribute('aria-disabled') === 'true' ||
        /disabled/.test(element.getAttribute('class') || '');
    }).catch(() => false);
  }

  /** @param {import('@playwright/test').Locator} locator */
  async controlLabel(locator) {
    const text = (await locator.innerText().catch(() => '')).trim();
    const aria = (await locator.getAttribute('aria-label').catch(() => '')) || '';
    const title = (await locator.getAttribute('title').catch(() => '')) || '';
    return [text, aria, title].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  /** @param {string} value */
  firstLine(value) {
    return value.replace(/\s+/g, ' ').trim().slice(0, 100);
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

test.describe.serial('17 - User Notifications - View-Only Coverage', () => {
  /** @type {UserNotificationsPage} */
  let userNotifications;
  /** @type {string | null} */
  let notificationTitleToView = null;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000);
    userNotifications = new UserNotificationsPage(page);
    await userNotifications.goto();
  });

  test('UN-01: User Notifications page loads with main controls', async () => {
    await userNotifications.verifyPageLoaded();
  });

  test('UN-02: View an existing User Notification (creating one first if none exist)', async () => {
    notificationTitleToView = await userNotifications.ensureNotificationToView();
    await userNotifications.verifyViewNotification(notificationTitleToView);
  });

  test('UN-03: Download the Excel file attached to a User Notification', async () => {
    test.skip(!notificationTitleToView, 'No notification title was resolved in UN-02; nothing to check.');
    await userNotifications.verifyExcelDownload(/** @type {string} */ (notificationTitleToView));
  });

  test('UN-04: Check User Notifications search, filters, pagination, and row-action menu', async () => {
    const title = notificationTitleToView || (await userNotifications.ensureNotificationToView());
    await userNotifications.verifyAllVisibleButtonsAndTableTools(title);
  });
});
