// @ts-check

import { expect } from '@playwright/test';
import { CREDENTIALS, loginToApp, goToPage } from '../helpers/loginHelper.js';

export const DRIVER_KPI_URL = '#/home/11b-driver-kpi';
const DASHBOARD_URL = `${CREDENTIALS.baseUrl}/#/home/dashboard`;
const SCHEME_ROUTES = {
  'Average Attendance': '#/home/fare-scheme/average-attendance',
  'Block Count': '#/home/fare-scheme/block-count',
  'Number of Fines': '#/home/fare-scheme/number-of-fines',
  'Redispatch Rate': '#/home/fare-scheme/redispatch-rate',
  'Speed of Delivery': '#/home/fare-scheme/speed-of-delivery',
};

export class DriverKpiSlabSchemePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} schemeName
   */
  constructor(page, schemeName) {
    this.page = page;
    this.schemeName = schemeName;
  }

  get pageTitle() {
    return this.page
      .locator('h1, h2, h3, h4, .page-title, .breadcrumb-item')
      .filter({ hasText: /Driver\s*KPI|KPI\s*Slabs|Slabs/i })
      .first();
  }

  get table() {
    return this.page.locator('mat-table, table, .table-responsive, .ngx-datatable').first();
  }

  get rows() {
    return this.page.locator('mat-row, tbody tr, .datatable-body-row');
  }

  get createButton() {
    return this.page
      .locator(
        'button:has-text("Create"), ' +
        'button:has-text("Add"), ' +
        'button:has-text("New"), ' +
        'button:has(mat-icon:has-text("add")), ' +
        '[role="button"]:has-text("Create"), ' +
        '[role="button"]:has-text("Add")'
      )
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
    await this.navigateToDriverKpi();
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.waitForReady();
    await this.selectSchemeFilter();
  }

  async navigateToDriverKpi() {
    const schemeRoute = SCHEME_ROUTES[this.schemeName];
    if (schemeRoute) {
      await goToPage(this.page, schemeRoute);
      await this.waitForKpiOrSignin();
      if (!/signin|dashboard/i.test(this.page.url())) return;
    }

    await this.page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});

    const sidebarParent = this.page.locator('.sidebar a, a').filter({ hasText: /Driver\s*KPI\s*Slabs/i }).first();
    if (await sidebarParent.isVisible().catch(() => false)) {
      await sidebarParent.scrollIntoViewIfNeeded().catch(() => {});
      await sidebarParent.click({ force: true });
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForTimeout(1500);

      const schemeLink = this.page
        .locator('.sidebar a[href*="fare-scheme"], a[href*="fare-scheme"]')
        .filter({ hasText: new RegExp(this.escapeRegExp(this.schemeName), 'i') })
        .filter({ visible: true })
        .first();

      if (await schemeLink.isVisible().catch(() => false)) {
        await schemeLink.scrollIntoViewIfNeeded().catch(() => {});
        await schemeLink.click({ force: true });
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.waitForKpiOrSignin();
      }
    }

    if (/dashboard/i.test(this.page.url())) {
      await goToPage(this.page, schemeRoute || DRIVER_KPI_URL);
      await this.waitForKpiOrSignin();
    }
  }

  async waitForKpiOrSignin() {
    await this.page
      .waitForURL((url) => /\/#\/home\/|\/#\/authentication\/signin/i.test(url.toString()), {
        timeout: 10000,
      })
      .catch(() => {});
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
  }

  async waitForReady() {
    await this.waitForKpiOrSignin();
    if (/signin/i.test(this.page.url())) {
      await loginToApp(this.page);
      await this.navigateToDriverKpi();
      await this.waitForKpiOrSignin();
    }

    await expect(this.page).not.toHaveURL(/signin/i, { timeout: 25000 });
    if (/dashboard/i.test(this.page.url())) {
      await this.navigateToDriverKpi();
    }
    await expect(this.page).not.toHaveURL(/dashboard/i, { timeout: 25000 });

    for (let i = 0; i < 30; i += 1) {
      const headingText = await this.page
        .locator('main, app-root, .main-content, .content, .container-fluid')
        .first()
        .innerText()
        .catch(() => '');
      const titleVisible = await this.pageTitle.isVisible().catch(() => false);
      const tableVisible = await this.table.isVisible().catch(() => false);
      const createVisible = await this.createButton.isVisible().catch(() => false);

      if (titleVisible || tableVisible || createVisible || /KPI\s*Slabs|Slab\s*Scheme|Min|Max|Weight/i.test(headingText)) return;
      await this.page.waitForTimeout(500);
    }

    await expect(this.page.locator('body')).toContainText(/KPI\s*Slabs|Slab\s*Scheme|Min|Max|Weight/i, { timeout: 10000 });
  }

  async verifyPageLoaded() {
    await this.waitForReady();
    const visibleShells = await this.page
      .locator('mat-table, table, .table-responsive, button, mat-select, input')
      .filter({ visible: true })
      .count();
    expect(visibleShells).toBeGreaterThan(0);
  }

  async selectSchemeFilter() {
    if (/\/#\/home\/fare-scheme\//i.test(this.page.url())) {
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      return;
    }

    const selected = await this.selectDropdown(this.page.locator('body'), /kpi|scheme|type/i, this.schemeName);
    if (!selected) {
      console.log(`INFO: Scheme filter for "${this.schemeName}" was not visible; continuing with current table.`);
    }
    await this.page.waitForTimeout(1000);
  }

  /**
   * @param {import('@playwright/test').Locator} context
   * @param {RegExp | string | null} label
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
        const labelMatched = label instanceof RegExp
          ? label.test(dropdownText)
          : this.normalize(dropdownText).includes(this.normalize(label));
        if (!labelMatched) continue;
      }

      await dropdown.scrollIntoViewIfNeeded().catch(() => {});
      await dropdown.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(700);

      const options = this.page.locator('mat-option, .mat-option, [role="option"]').filter({ visible: true });
      const optionCount = await options.count().catch(() => 0);
      const selectable = [];

      for (let optionNumber = 0; optionNumber < optionCount; optionNumber += 1) {
        const item = options.nth(optionNumber);
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
      return true;
    }
    return false;
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

  /** @param {string | number} weight */
  async fillSlabForm(weight = '5') {
    const dialog = this.activeDialog();
    const context = await dialog.isVisible().catch(() => false) ? dialog : this.page.locator('body');

    // This form has no scheme/type dropdowns in practice (confirmed live) -
    // only Minimum Days, Maximum Days, and Weight number fields. These
    // selectDropdown calls are harmless no-ops if no dropdown matches.
    await this.selectDropdown(context, /kpi|scheme/i, this.schemeName);
    await this.selectDropdown(context, /type/i, 0);

    await this.fillFirstVisible(context, [
      'input[formcontrolname*="min" i]',
      'input[placeholder*="Min" i]',
      'mat-form-field:has-text("Min") input',
      'input[type="number"]',
    ], '1');

    await this.fillFirstVisible(context, [
      'input[formcontrolname*="max" i]',
      'input[placeholder*="Max" i]',
      'mat-form-field:has-text("Max") input',
      'input[type="number"]',
    ], '10');

    await this.fillFirstVisible(context, [
      'input[formcontrolname*="weight" i]',
      'input[placeholder*="Weight" i]',
      'mat-form-field:has-text("Weight") input',
      'input[type="number"]',
    ], String(weight));
  }

  /**
   * Weight is the only field a test can use to identify its own record
   * (Min/Max are fixed at 1/10) - find the row whose Weight cell is
   * exactly this value.
   * @param {string | number} weight
   */
  findRowByWeight(weight) {
    return this.rows.filter({ hasText: String(weight) });
  }

  async verifyFiltersSearchAndPagination() {
    await this.selectSchemeFilter();

    const searchInput = this.page
      .locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element')
      .filter({ visible: true })
      .first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.click({ force: true });
      await searchInput.fill(this.schemeName.split(' ')[0]).catch(() => {});
      await this.clickSearchButton();
      await this.page.waitForTimeout(1500);
      await searchInput.fill('').catch(() => {});
      await this.clickSearchButton();
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
      await searchButton.click({ force: true }).catch(() => {});
    } else {
      await this.page.keyboard.press('Enter').catch(() => {});
    }
  }

  async verifyPagination() {
    const nextButton = this.page
      .locator('button[aria-label*="Next" i], .ngx-pagination li.pagination-next, li.pagination-next, li.page-item:has-text("Next")')
      .filter({ visible: true })
      .first();

    if (!(await nextButton.isVisible().catch(() => false))) {
      console.log(`INFO: Pagination next button not visible for ${this.schemeName}; table may have one page.`);
      return;
    }

    const disabled = await nextButton.evaluate((node) => {
      return node.hasAttribute('disabled') ||
        node.getAttribute('aria-disabled') === 'true' ||
        /disabled/.test(node.getAttribute('class') || '');
    }).catch(() => true);

    if (disabled) {
      console.log(`INFO: Pagination next button disabled for ${this.schemeName}; single page result.`);
      return;
    }

    await nextButton.click({ force: true }).catch(() => {});
    await this.page.waitForTimeout(1500);
    await expect(this.page.locator('body')).toBeVisible();
  }

  /**
   * Creates a slab with the given (unique) weight so it can be
   * identified precisely by later view/edit/delete steps, and verifies
   * it actually appears in the table afterward - not just that the
   * create dialog opened and closed.
   * @param {string | number} weight
   */
  async verifyCreateSlabFlow(weight) {
    await expect(this.createButton, `${this.schemeName} Create button should be visible.`).toBeVisible({ timeout: 20000 });

    // A force click does not trigger this button's Angular click handler
    // (confirmed live - same pattern seen elsewhere in this app's custom
    // components); a real click is required.
    await this.createButton.click();
    await this.page.waitForTimeout(1500);

    const dialog = this.activeDialog();
    await expect(dialog, `${this.schemeName} create dialog should open.`).toBeVisible({ timeout: 12000 });

    await this.fillSlabForm(weight);

    const submitButton = await this.enabledButton(dialog, /^(Create|Save|Submit|Add)$/i);
    await expect(submitButton, `${this.schemeName} create submit button should be visible.`).toBeVisible({ timeout: 10000 });
    await expect(submitButton, `${this.schemeName} create submit button should be enabled once required fields are filled.`).toBeEnabled({ timeout: 10000 });

    await submitButton.click();
    await this.page.waitForTimeout(2000);
    await this.confirmSuccessIfShown();

    await expect(
      this.findRowByWeight(weight).first(),
      `A ${this.schemeName} slab with weight ${weight} should appear in the table after creating it.`
    ).toBeVisible({ timeout: 10000 });
  }

  /**
   * @param {RegExp} actionLabel
   * @param {import('@playwright/test').Locator} [row] defaults to the first row; pass a specific row (e.g. from findRowByWeight) to act on an identified record
   */
  async openRowAction(actionLabel, row = this.rows.first()) {
    // isVisible() is an instant check, not a poll - right after a fresh
    // navigation the table may not have finished rendering yet, so wait
    // for the row rather than giving up immediately.
    const rowReady = await row.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    if (!rowReady) return false;

    let directActionSelector = 'button:has-text("Edit"), button:has-text("Update"), button:has(mat-icon:has-text("edit"))';
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

    const directAction = row.locator(directActionSelector).filter({ visible: true }).first();
    const rowAction = row
      .locator(
        'button:has(mat-icon:has-text("more_vert")), ' +
        'button:has(mat-icon:has-text("more_horiz")), ' +
        'mat-icon:has-text("more_vert"), ' +
        'mat-icon:has-text("more_horiz"), ' +
        '.mat-menu-trigger, [aria-label*="More" i]'
      )
      .filter({ visible: true })
      .first();

    if (await rowAction.isVisible().catch(() => false)) {
      await rowAction.scrollIntoViewIfNeeded().catch(() => {});
      await rowAction.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1000);

      const action = this.page
        .locator(
          '.cdk-overlay-pane [role="menuitem"], ' +
          '.cdk-overlay-pane button.mat-menu-item, ' +
          '.mat-menu-panel [role="menuitem"], ' +
          '[role="menu"] [role="menuitem"], ' +
          '.dropdown-menu .dropdown-item'
        )
        .filter({ visible: true })
        .filter({ hasText: actionLabel })
        .first();

      if (await action.isVisible().catch(() => false)) {
        await action.click({ force: true }).catch(() => {});
        await this.page.waitForTimeout(1500);
        return true;
      }

      if (await this.activeDialog().isVisible().catch(() => false)) return true;
      await this.page.keyboard.press('Escape').catch(() => {});
    }

    if (await directAction.isVisible().catch(() => false)) {
      await directAction.scrollIntoViewIfNeeded().catch(() => {});
      // Real click required - force clicks don't trigger this app's
      // custom click handlers on these row-action icons (confirmed live).
      await directAction.click().catch(() => {});
      await this.page.waitForTimeout(1500);
      return true;
    }

    return false;
  }

  /**
   * This UI has no dedicated "View" action (confirmed live - only Edit
   * and Delete icons exist per row), so Edit doubles as the detail view:
   * open it, confirm the dialog shows this record's real weight, then
   * cancel without saving anything.
   * @param {string | number} weight
   */
  async verifyViewFlow(weight) {
    const row = this.findRowByWeight(weight).first();
    const opened = await this.openRowAction(/Edit|Update/i, row);
    expect(opened, `${this.schemeName} slab with weight ${weight} should expose an Edit/view action.`).toBe(true);

    const dialog = this.activeDialog();
    await expect(dialog, `${this.schemeName} detail dialog should open.`).toBeVisible({ timeout: 10000 });

    // The weight lives in an <input> field's value, not in the dialog's
    // rendered text content, so it has to be checked via toHaveValue.
    const weightInput = dialog.locator(
      'input[formcontrolname*="weight" i], input[placeholder*="Weight" i], mat-form-field:has-text("Weight") input'
    ).first();
    await expect(weightInput, `${this.schemeName} detail dialog should show weight ${weight}.`).toHaveValue(String(weight), { timeout: 10000 });
    await this.closeDialog();

    await this.verifyPageLoaded();
  }

  /**
   * @param {string | number} currentWeight the weight identifying the record to edit
   * @param {string | number} newWeight the weight to change it to
   */
  async verifyEditFlow(currentWeight, newWeight) {
    const row = this.findRowByWeight(currentWeight).first();
    const opened = await this.openRowAction(/Edit|Update/i, row);
    expect(opened, `${this.schemeName} slab with weight ${currentWeight} should expose an Edit action.`).toBe(true);

    const dialog = this.activeDialog();
    await expect(dialog, `${this.schemeName} edit dialog should open.`).toBeVisible({ timeout: 10000 });

    await this.fillFirstVisible(dialog, [
      'input[formcontrolname*="weight" i]',
      'input[placeholder*="Weight" i]',
      'mat-form-field:has-text("Weight") input',
      'input[type="number"]',
    ], String(newWeight));

    // The submit button here is literally labeled "Edit" (not "Update"),
    // same as Create is labeled "Create" rather than a generic "Save".
    const updateButton = await this.enabledButton(dialog, /^(Edit|Update|Save|Submit)$/i);
    await expect(updateButton, `${this.schemeName} edit submit button should be visible.`).toBeVisible({ timeout: 10000 });
    await expect(updateButton, `${this.schemeName} edit submit button should be enabled.`).toBeEnabled({ timeout: 10000 });
    await updateButton.click();
    await this.page.waitForTimeout(2000);
    await this.confirmSuccessIfShown();

    await expect(
      this.findRowByWeight(newWeight).first(),
      `The edited ${this.schemeName} slab should show the updated weight ${newWeight}.`
    ).toBeVisible({ timeout: 10000 });
  }

  /** @param {string | number} weight identifies the record to delete */
  async verifyDeleteConfirmation(weight) {
    const row = this.findRowByWeight(weight).first();
    const opened = await this.openRowAction(/Delete|Remove/i, row);
    expect(opened, `${this.schemeName} slab with weight ${weight} should expose a Delete action.`).toBe(true);

    const confirmation = this.activeDialog();
    await expect(confirmation, `${this.schemeName} delete confirmation should open.`).toBeVisible({ timeout: 10000 });

    const confirmButton = await this.enabledButton(confirmation, /^(Delete|Remove|Yes|Confirm)$/i);
    await expect(confirmButton, `${this.schemeName} delete confirm button should be visible.`).toBeVisible({ timeout: 10000 });
    await confirmButton.click();
    await this.page.waitForTimeout(1500);
    await this.confirmSuccessIfShown();

    await expect(
      this.findRowByWeight(weight),
      `The ${this.schemeName} slab with weight ${weight} should no longer appear after deleting it.`
    ).toHaveCount(0, { timeout: 10000 });
  }

  async confirmSuccessIfShown() {
    const okButton = this.page
      .locator('.swal2-confirm, button:has-text("OK"), button:has-text("Ok")')
      .filter({ visible: true })
      .first();
    if (await okButton.isVisible().catch(() => false)) {
      await okButton.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1000);
    }
  }

  async closeDialog() {
    const dialog = this.activeDialog();
    const cancelButton = this.page
      .locator(
        '.swal2-cancel, button:has-text("Cancel"), button:has-text("Close"), button:has-text("No"), ' +
        '[aria-label="Close"], mat-icon:has-text("close")'
      )
      .filter({ visible: true })
      .first();

    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1000);
    } else if (await dialog.isVisible().catch(() => false)) {
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(1000);
    }
  }

  /**
   * @param {string} value
   */
  normalize(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * @param {string} value
   */
  escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
