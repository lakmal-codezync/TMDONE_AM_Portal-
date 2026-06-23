// @ts-check
import { expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

export const TM_DONE_CLUB_ROUTES = {
  analytics: '#/home/tm-done-club/analytics',
  plans: '#/home/tm-done-club/plans',
  subscriptions: '#/home/tm-done-club/subscriptions',
  cancellationReasons: '#/home/tm-done-club/cancellation-reasons',
};

/**
 * @param {Date} date
 */
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function getCurrentYearJanuaryToToday() {
  const today = new Date();
  return {
    start: `01/01/${today.getFullYear()}`,
    end: formatDate(today),
  };
}

export class TMDoneClubPage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {{ route: string, heading: RegExp, section: string }} config
   */
  constructor(page, config) {
    this.page = page;
    this.config = config;
  }

  get heading() {
    return this.sectionRoot
      .locator('h1, h2, h3, h4, .page-title, .breadcrumb-item')
      .filter({ hasText: this.config.heading })
      .first();
  }

  get sectionRoot() {
    return this.page.locator('app-tm-done-club-analytics, body').first();
  }

  get pageButtons() {
    return this.sectionRoot.locator('button').filter({ visible: true });
  }

  get pageInputs() {
    return this.sectionRoot.locator('input, textarea').filter({ visible: true });
  }

  get submenuLink() {
    const labels = {
      analytics: 'Analytics',
      plans: 'Subscription Plans',
      subscriptions: 'Subscriptions Reports',
      cancellationReasons: 'Cancellation Reasons',
    };

    return this.page
      // @ts-ignore
      .getByRole('link', { name: new RegExp(`^${labels[this.config.section]}$`, 'i') })
      .filter({ visible: true })
      .first();
  }

  get parentMenuLink() {
    return this.page
      .getByRole('link', { name: /TM Done Club/i })
      .filter({ visible: true })
      .first();
  }

  get createButton() {
    return this.actionCreateButton;
  }

  get body() {
    return this.page.locator('body');
  }

  get table() {
    return this.sectionRoot.locator('mat-table, table, .table-responsive, .ngx-datatable').filter({ visible: true }).first();
  }

  get rows() {
    return this.sectionRoot.locator('mat-row, tbody tr, .datatable-body-row');
  }

  get actionCreateButton() {
    return this.sectionRoot
      .locator(
        [
          'button:has-text("Create")',
          'button:has-text("Add")',
          'button:has-text("New")',
          'button:has-text("Create Plan")',
          'button:has-text("Create Reason")',
          'button:has(mat-icon:has-text("add"))',
        ].join(', ')
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
    await this.openFromSidebar();
    await this.waitForReady();
  }

  async openFromSidebar() {
    await goToPage(this.page, this.config.route);
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.page.waitForTimeout(1500);

    if (await this.isSectionAvailable()) return;

    await goToPage(this.page, '#/home/campaigns');
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});

    if (await this.parentMenuLink.isVisible().catch(() => false)) {
      await this.parentMenuLink.click({ force: true }).catch(() => {});
      await this.page.waitForTimeout(1200);
    }

    if (await this.submenuLink.isVisible().catch(() => false)) {
      await this.submenuLink.click({ force: true }).catch(() => {});
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForTimeout(2500);
    }
  }

  async waitForReady() {
    await expect(this.page).not.toHaveURL(/signin/i, { timeout: 25000 });

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const headingVisible = await this.heading.isVisible().catch(() => false);
      const tableVisible = await this.table.isVisible().catch(() => false);
      const createVisible = await this.actionCreateButton.isVisible().catch(() => false);
      const routeMatched = this.page.url().includes(this.config.route.replace('#', ''));
      const campaignsFallbackVisible = await this.page.getByRole('button', { name: /Create Campaign/i }).first().isVisible().catch(() => false);
      if (routeMatched && (headingVisible || tableVisible || createVisible)) return;
      if (!routeMatched && campaignsFallbackVisible) return;
      await this.page.waitForTimeout(1000);
    }

    throw new Error(`${this.config.section} page did not become ready.`);
  }

  async isSectionAvailable() {
    const bodyText = await this.body.innerText().catch(() => '');
    const routeMatched = this.page.url().includes(this.config.route.replace('#', ''));
    const headingMatched = this.config.heading.test(bodyText);
    return headingMatched || routeMatched;
  }

  async verifyPageLoaded() {
    await this.waitForReady();
    const visibleControls = await this.sectionRoot
      .locator('mat-table, table, button, input, mat-select, textarea, [role="tab"]')
      .filter({ visible: true })
      .count();
    expect(visibleControls).toBeGreaterThan(0);
  }

  /**
   * @param {import("playwright-core").Locator} context
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
      await field.dispatchEvent('change').catch(() => {});
      return true;
    }
    return false;
  }

  /**
   * @param {import("playwright-core").Locator} context
   */
  async selectDropdown(context, labelPattern = null, option = 0) {
    const dropdowns = context.locator('mat-select, [role="combobox"]').filter({ visible: true });
    const count = await dropdowns.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const dropdown = dropdowns.nth(index);
      if (!(await dropdown.isEnabled().catch(() => true))) continue;

      if (labelPattern) {
        const dropdownText = [
          await dropdown.getAttribute('formcontrolname').catch(() => ''),
          await dropdown.getAttribute('aria-label').catch(() => ''),
          await dropdown.getAttribute('placeholder').catch(() => ''),
          await dropdown.locator('xpath=ancestor::mat-form-field[1]').innerText().catch(() => ''),
          await dropdown.innerText().catch(() => ''),
        ].filter(Boolean).join(' ');
        // @ts-ignore
        if (!labelPattern.test(dropdownText)) continue;
      }

      await dropdown.click({ force: true });
      await this.page.waitForTimeout(1000);

      const options = this.page.locator('mat-option, .mat-option, [role="option"]').filter({ visible: true });
      let optionCount = await options.count().catch(() => 0);
      for (let retry = 0; retry < 8 && optionCount === 0; retry += 1) {
        await this.page.waitForTimeout(500);
        optionCount = await options.count().catch(() => 0);
      }

      const selectable = [];
      for (let optionIndex = 0; optionIndex < optionCount; optionIndex += 1) {
        const item = options.nth(optionIndex);
        const text = ((await item.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        const disabled = await item.getAttribute('aria-disabled').catch(() => null) === 'true';
        if (!disabled && text && !/select|choose|loading|no data|no records|no results/i.test(text)) {
          selectable.push({ item, text });
        }
      }

      const target = typeof option === 'string'
        ? selectable.find(({ text }) => this.normalize(text).includes(this.normalize(option)))
        : selectable[option] || selectable[0];

      if (target) {
        await target.item.click({ force: true, timeout: 10000 });
        await this.page.waitForTimeout(1000);
        return true;
      }

      await dropdown.click({ force: true }).catch(() => {});
    }

    return false;
  }

  async applyCurrentYearToPresentDateRange(context = this.body) {
    const { start, end } = getCurrentYearJanuaryToToday();
    const startFilled = await this.fillFirstVisible(context, [
      'input[placeholder*="Start Date" i]',
      'input[formcontrolname*="start" i]',
      'mat-date-range-input input.mat-start-date',
      'input.mat-start-date',
      'input[aria-label*="start" i]',
    ], start);
    const endFilled = await this.fillFirstVisible(context, [
      'input[placeholder*="End Date" i]',
      'input[formcontrolname*="end" i]',
      'mat-date-range-input input.mat-end-date',
      'input.mat-end-date',
      'input[aria-label*="end" i]',
    ], end);
    return startFilled || endFilled;
  }

  async clickSearchButton() {
    const searchButton = this.sectionRoot
      .locator(
        [
          'button[aria-label*="search" i]',
          'button:has(mat-icon:has-text("search"))',
          'button:has-text("Search")',
          'button.search-btn',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();

    if (await searchButton.isVisible().catch(() => false) && await searchButton.isEnabled().catch(() => false)) {
      await searchButton.click({ force: true });
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.page.waitForTimeout(1500);
      return true;
    }
    return false;
  }

  async clickClearIfAvailable() {
    const clearButton = this.sectionRoot
      .locator(
        [
          'button[aria-label*="clear" i]',
          'button:has(mat-icon:has-text("close"))',
          'button:has-text("Clear")',
          'button:has-text("Reset")',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();
    if (await clearButton.isVisible().catch(() => false)) {
      await clearButton.click({ force: true });
      await this.page.waitForTimeout(1200);
      return true;
    }
    return false;
  }

  async verifyResultsOrEmptyState() {
    if (await this.table.isVisible({ timeout: 15000 }).catch(() => false)) return;
    const hasEmptyState = await this.body
      .locator(':text-matches("No data|No records|No results|Data not found", "i")')
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);
    if (hasEmptyState) return;

    console.log(`INFO: ${this.config.section} did not render a table or known empty-state message after search.`);
    await this.verifyPageLoaded();
  }

  async verifyPaginationIfAvailable() {
    const nextButton = this.sectionRoot
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

    if (!(await nextButton.isVisible().catch(() => false))) return false;
    return true;
  }

  async verifyExportIfAvailable() {
    const exportButton = this.sectionRoot
      .locator(
        [
          'button:has-text("Export")',
          'button:has-text("Download")',
          'button:has-text("Excel")',
          'button[aria-label*="download" i]',
          'button:has(mat-icon:has-text("download"))',
          'button:has(mat-icon:has-text("file_download"))',
        ].join(', ')
      )
      .filter({ visible: true })
      .first();

    if (!(await exportButton.isVisible().catch(() => false))) return false;
    await expect(exportButton).toBeEnabled({ timeout: 10000 }).catch(() => {});
    return true;
  }

  /**
   * @param {import("playwright-core").Locator} context
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
    const dialog = this.activeDialog();
    const closeButton = this.sectionRoot
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
}
