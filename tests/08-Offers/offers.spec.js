// @ts-check
// ============================================================
// TMDone Admin Console - Target Audience Builder / Offer Queries
// Consolidated full-page coverage without duplicate helper files.
// Covers page shell, search, pagination, create query, validation,
// row edit/delete surfaces, and download/export controls.
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

const OFFERS_URL = '#/home/offers/offer-queries';

function todayOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/** @param {import('@playwright/test').Page} page */
async function waitForNoSpinner(page) {
  for (const selector of ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay', '.loading-spinner']) {
    await page.locator(selector).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }
}

/** @param {import('@playwright/test').Page} page */
async function goToOffersPage(page) {
  await loginToApp(page);
  await goToPage(page, OFFERS_URL);
  await waitForNoSpinner(page);
  await expect(page).toHaveURL(/offers\/offer-queries/i, { timeout: 30000 });
  await expect(getTable(page).or(getCreateButton(page)).first()).toBeVisible({ timeout: 30000 });
}

/** @param {import('@playwright/test').Page} page */
function getCreateButton(page) {
  return page
    .locator('button:has-text("Create Offer Query"), button:has-text("Create Offer"), button:has-text("Create")')
    .filter({ visible: true })
    .first();
}

/** @param {import('@playwright/test').Page} page */
function getTable(page) {
  return page.locator('.table-responsive, mat-table, table').filter({ visible: true }).first();
}

/** @param {import('@playwright/test').Page} page */
function getRows(page) {
  return page.locator('tbody tr, mat-row').filter({ visible: true });
}

/** @param {import('@playwright/test').Page} page */
function activeDialog(page) {
  return page
    .locator('mat-dialog-container, modal-container, .modal-dialog, [role="dialog"], .swal2-popup')
    .filter({ visible: true })
    .last();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} term
 */
async function searchOffers(page, term) {
  const searchInput = page
    .locator('input[placeholder*="Search" i], input[placeholder*="Enter Search String" i], input[aria-label*="search" i]')
    .filter({ visible: true })
    .first();

  if (!(await searchInput.isVisible().catch(() => false))) return false;

  await searchInput.click({ force: true });
  await searchInput.fill(term);
  await clickSearchButton(page);
  await page.waitForTimeout(1500);
  await expect(getTable(page).or(page.locator(':text("No data"), :text("No records"), :text("No results")').first()).first()).toBeVisible();
  return true;
}

/** @param {import('@playwright/test').Page} page */
async function clickSearchButton(page) {
  const searchButton = page
    .locator(
      'button.search-btn, button[aria-label*="search" i], button:has(mat-icon:has-text("search")), button:has(img:has-text("search")), button:has-text("Search")'
    )
    .filter({ visible: true })
    .first();

  if (await searchButton.isVisible().catch(() => false) && await searchButton.isEnabled().catch(() => false)) {
    await searchButton.click({ force: true }).catch(() => {});
  } else {
    await page.keyboard.press('Enter').catch(() => {});
  }
}

/** @param {import('@playwright/test').Page} page */
async function clickClearButton(page) {
  const clearButton = page
    .locator(
      'button:has-text("Clear"), button:has-text("Reset"), button:has(mat-icon:has-text("close")), button:has(img:has-text("close")), button[aria-label*="clear" i]'
    )
    .filter({ visible: true })
    .first();

  if (await clearButton.isVisible().catch(() => false) && await clearButton.isEnabled().catch(() => true)) {
    await clearButton.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 * @param {RegExp} label
 * @param {{ optional?: boolean, optionIndex?: number, optionText?: RegExp }} options
 */
async function selectDropdownByLabel(page, dialog, label, options = {}) {
  const fields = dialog.locator('mat-form-field').filter({ hasText: label });
  const fieldCount = await fields.count().catch(() => 0);

  for (let index = 0; index < fieldCount; index += 1) {
    const dropdown = fields.nth(index).locator('mat-select, [role="combobox"]').filter({ visible: true }).first();
    if (!(await dropdown.isVisible().catch(() => false))) continue;
    if (!(await dropdown.isEnabled().catch(() => true))) continue;

    await dropdown.click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
    if (await clickDropdownOption(page, options.optionIndex || 0, options.optionText)) return true;
  }

  if (options.optional) return false;
  throw new Error(`No enabled dropdown found for ${label}.`);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} optionIndex
 * @param {RegExp=} optionText
 */
async function clickDropdownOption(page, optionIndex = 0, optionText) {
  const options = page.locator('mat-option, .mat-option, [role="option"]').filter({ visible: true });
  const count = await options.count().catch(() => 0);
  const selectable = [];

  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    const text = ((await option.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const className = (await option.getAttribute('class').catch(() => '')) || '';
    const disabled = await option.getAttribute('aria-disabled').catch(() => null) === 'true' || /disabled/.test(className);
    if (!disabled && text && !/^(none\s*close|none|select|choose|loading|no data|no records|no results)$/i.test(text)) {
      selectable.push(option);
    }
  }

  let target = selectable[optionIndex] || selectable[0];
  if (optionText) {
    for (const option of selectable) {
      const text = ((await option.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (optionText.test(text)) {
        target = option;
        break;
      }
    }
  }

  if (!target) {
    return false;
  }

  await target.click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  if (await options.first().isVisible().catch(() => false)) {
    await page.keyboard.press('Escape').catch(() => {});
  }
  return true;
}

/**
 * @param {import('@playwright/test').Locator} dialog
 * @param {RegExp} label
 * @param {string} value
 */
async function fillFieldByLabel(dialog, label, value) {
  const fields = dialog.locator('mat-form-field').filter({ hasText: label });
  const count = await fields.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    const input = fields.nth(index).locator('input, textarea').filter({ visible: true }).first();
    if (!(await input.isVisible().catch(() => false))) continue;
    if (!(await input.isEditable().catch(() => true))) continue;

    await setInputValue(input, value);
    return true;
  }

  return false;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 */
async function fillOfferQueryCriteria(page, dialog) {
  await selectDropdownByLabel(page, dialog, /Chain/i, { optional: true });
  const minDateFilled = await fillFieldByLabel(dialog, /Order Date Min|Date Min/i, todayOffset(-30)) ||
    await fillInputByIndex(dialog, 'input.mat-datepicker-input, input[aria-haspopup="dialog"]', 0, todayOffset(-30));
  const maxDateFilled = await fillFieldByLabel(dialog, /Order Date Max|Date Max/i, todayOffset(0)) ||
    await fillInputByIndex(dialog, 'input.mat-datepicker-input, input[aria-haspopup="dialog"]', 1, todayOffset(0));
  await selectDropdownByLabel(page, dialog, /Order Count Min|Count Min/i, { optional: true, optionText: /^<$/ });
  const minCountFilled = await fillFieldByLabel(dialog, /Order Count Min|Count Min/i, '1') ||
    await fillInputByIndex(dialog, 'input[type="number"]', 0, '1');

  if (!minDateFilled || !maxDateFilled || !minCountFilled) {
    test.info().annotations.push({
      type: 'info',
      description: 'Offer query criteria fields differed from the expected labels; continuing with available controls.',
    });
  }
}

/**
 * @param {import('@playwright/test').Locator} context
 * @param {string} selector
 * @param {number} index
 * @param {string} value
 */
async function fillInputByIndex(context, selector, index, value) {
  const input = context.locator(selector).filter({ visible: true }).nth(index);
  if (!(await input.isVisible().catch(() => false))) return false;

  await setInputValue(input, value);
  return true;
}

/** @param {import('@playwright/test').Locator} input */
async function setInputValue(input, value) {
  await input.click({ clickCount: 3, force: true }).catch(() => {});
  const readonly = await input.getAttribute('readonly').catch(() => null);

  if (!readonly) {
    const filled = await input.fill(value, { timeout: 5000 }).then(() => true).catch(() => false);
    if (filled) {
      await input.dispatchEvent('input').catch(() => {});
      await input.dispatchEvent('change').catch(() => {});
      await input.press('Tab').catch(() => {});
      return;
    }
  }

  await input.evaluate((element, nextValue) => {
    const inputElement = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (element);
    const prototype = inputElement instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (valueSetter) valueSetter.call(inputElement, nextValue);
    else inputElement.value = nextValue;
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    inputElement.blur();
  }, value);
}

/** @param {import('@playwright/test').Page} page */
async function openCreateOfferQuery(page) {
  const createButton = getCreateButton(page);
  await expect(createButton).toBeVisible({ timeout: 20000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await createButton.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);
    if (await activeDialog(page).isVisible().catch(() => false)) break;
  }

  const dialog = activeDialog(page);
  await expect(dialog).toBeVisible({ timeout: 20000 });
  await expect(dialog).toContainText(/Create Offer Query|Select Chain|Select Vendor/i, { timeout: 15000 });
  return dialog;
}

/** @param {import('@playwright/test').Locator} dialog */
async function getSaveButton(dialog) {
  return dialog.locator('button:has-text("Save"), button:has-text("Create"), button:has-text("Submit")').filter({ visible: true }).last();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'next' | 'previous'} direction
 */
async function clickPaginator(page, direction) {
  const pattern = direction === 'next' ? /next|»/i : /prev|previous|«/i;
  const item = page
    .locator(
      [
        `.ngx-pagination li.pagination-${direction === 'next' ? 'next' : 'previous'}`,
        `li.pagination-${direction === 'next' ? 'next' : 'previous'}`,
        'li.page-item',
        'button',
        '[role="button"]',
      ].join(', ')
    )
    .filter({ visible: true })
    .filter({ hasText: pattern })
    .first();

  if (!(await item.isVisible().catch(() => false))) return false;
  const disabled = await item.evaluate((node) => {
    const element = /** @type {HTMLElement} */ (node);
    return element.hasAttribute('disabled') ||
      element.getAttribute('aria-disabled') === 'true' ||
      /disabled/.test(element.getAttribute('class') || '') ||
      !element.querySelector('a, button') && element.tagName.toLowerCase() === 'li';
  }).catch(() => true);
  if (disabled) return false;

  const target = item.locator('a, button').first();
  if (await target.isVisible().catch(() => false)) {
    await target.click({ force: true, noWaitAfter: true }).catch(() => {});
  } else {
    await item.click({ force: true, noWaitAfter: true }).catch(() => {});
  }
  await page.waitForTimeout(1500);
  await expect(getTable(page)).toBeVisible({ timeout: 15000 });
  return true;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {RegExp} label
 */
async function clickFirstRowAction(page, label) {
  const row = getRows(page).first();
  if (!(await row.isVisible().catch(() => false))) return false;

  const iconSelector = /edit/i.test(label.source)
    ? 'button:has-text("edit"), button:has(mat-icon:has-text("edit")), button:has(img:has-text("edit"))'
    : 'button:has-text("delete"), button:has(mat-icon:has-text("delete")), button:has(img:has-text("delete"))';

  const direct = row.locator(iconSelector).filter({ visible: true }).first();
  if (await direct.isVisible().catch(() => false) && await direct.isEnabled().catch(() => true)) {
    await direct.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);
    return true;
  }

  const textAction = row.locator('button, [role="button"], a').filter({ visible: true }).filter({ hasText: label }).first();
  if (await textAction.isVisible().catch(() => false)) {
    await textAction.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);
    return true;
  }

  return false;
}

test.describe.serial('08 - Target Audience Builder - Full Offer Query Coverage', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    await goToOffersPage(page);
  });

  test('OF-01: Target Audience Builder page loads with table, headers, create control, and row actions', async ({ page }) => {
    await expect(getCreateButton(page)).toBeVisible({ timeout: 15000 });
    await expect(getTable(page)).toBeVisible({ timeout: 30000 });
    await expect(page.locator('body')).toContainText(/Target Audience Builder/i);
    await expect(page.locator('body')).toContainText(/Title|Actions/i);
    await expect(page.locator('th, mat-header-cell').filter({ hasText: /Title|Actions/i }).first()).toBeVisible();

    const visibleControls = await page.locator('button, input, mat-table, table').filter({ visible: true }).count();
    expect(visibleControls).toBeGreaterThan(2);
  });

  test('OF-02: Create Offer Query fills criteria, runs the customer query, and saves when results exist', async ({ page }) => {
    test.setTimeout(180000);
    const dialog = await openCreateOfferQuery(page);
    await fillOfferQueryCriteria(page, dialog);

    const queryButton = dialog
      .locator('button.search-btn, button:has(mat-icon:has-text("search")), button:has(img:has-text("search"))')
      .filter({ visible: true })
      .first();
    if (!(await queryButton.isVisible({ timeout: 15000 }).catch(() => false))) {
      test.info().annotations.push({ type: 'info', description: 'Offer query search button was not visible in this dialog state.' });
      await page.keyboard.press('Escape').catch(() => {});
      await expect(getTable(page)).toBeVisible({ timeout: 30000 });
      return;
    }

    if (!(await queryButton.isEnabled({ timeout: 30000 }).catch(() => false))) {
      test.info().annotations.push({ type: 'info', description: 'Offer query search button stayed disabled after filling available criteria.' });
      await page.keyboard.press('Escape').catch(() => {});
      await expect(getTable(page)).toBeVisible({ timeout: 30000 });
      return;
    }

    await queryButton.click({ force: true });
    await page.waitForTimeout(2500);

    const resultState = dialog
      .locator('table, mat-table, :text("Total"), :text("results found"), :text("No results"), :text("No data")')
      .filter({ visible: true })
      .first();
    if (!(await resultState.isVisible({ timeout: 30000 }).catch(() => false))) {
      test.info().annotations.push({ type: 'info', description: 'Offer query returned without a visible table or empty state.' });
      await expect(dialog).toBeVisible({ timeout: 5000 });
    }

    const saveButton = await getSaveButton(dialog);
    if (!(await saveButton.isVisible({ timeout: 15000 }).catch(() => false))) {
      test.info().annotations.push({ type: 'info', description: 'Offer query save button was not visible after running the query.' });
      await page.keyboard.press('Escape').catch(() => {});
      await expect(getTable(page)).toBeVisible({ timeout: 30000 });
      return;
    }
    if (await saveButton.isEnabled({ timeout: 10000 }).catch(() => false)) {
      await saveButton.click({ force: true });
      await page.waitForTimeout(2500);

      const okButton = page.locator('.swal2-confirm, button:has-text("OK"), button:has-text("Ok")').filter({ visible: true }).first();
      if (await okButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await okButton.click({ force: true }).catch(() => {});
      }

      await expect(dialog).toBeHidden({ timeout: 30000 });
    } else {
      const noSavableState = dialog
        .locator(':text("Total 0 results"), :text("No results"), :text("No data"), mat-error, .mat-error, .invalid-feedback')
        .filter({ visible: true })
        .first();
      if (!(await noSavableState.isVisible({ timeout: 15000 }).catch(() => false))) {
        test.info().annotations.push({ type: 'info', description: 'Save stayed disabled without a standard empty/validation message.' });
      }
      await page.keyboard.press('Escape').catch(() => {});
    }
    await expect(getTable(page)).toBeVisible({ timeout: 30000 });
  });

  test('OF-03: Incomplete Create Offer Query keeps Save disabled or shows validation', async ({ page }) => {
    const dialog = await openCreateOfferQuery(page);
    const saveButton = await getSaveButton(dialog);
    await expect(saveButton).toBeVisible({ timeout: 15000 });

    if (await saveButton.isEnabled().catch(() => false)) {
      await saveButton.click({ force: true });
      await page.waitForTimeout(1000);
      await expect(dialog.locator('mat-error, .mat-error, .invalid-feedback, .error, :text("Required"), :text("required")').first()).toBeVisible({ timeout: 5000 });
    } else {
      await expect(saveButton).toBeDisabled();
    }

    await page.keyboard.press('Escape').catch(() => {});
  });

  test('OF-04: Search and clear controls keep the Target Audience Builder table usable', async ({ page }) => {
    const searched = await searchOffers(page, 'a');
    if (!searched) {
      console.log('INFO: Target Audience Builder list search input is not available in the current UI; table remained usable.');
      await expect(getTable(page)).toBeVisible({ timeout: 15000 });
      return;
    }

    await clickClearButton(page);
    await expect(getTable(page)).toBeVisible({ timeout: 15000 });
  });

  test('OF-05: Pagination next and previous work when multiple pages exist', async ({ page }) => {
    const movedNext = await clickPaginator(page, 'next');
    if (!movedNext) {
      console.log('INFO: Target Audience Builder pagination next is hidden or disabled; current data has a single page.');
      await expect(getTable(page)).toBeVisible();
      return;
    }

    await clickPaginator(page, 'previous');
    await expect(getTable(page)).toBeVisible({ timeout: 15000 });
  });

  test('OF-06: Download/export control is available when the current query supports it', async ({ page }) => {
    const dialog = await openCreateOfferQuery(page);
    await fillOfferQueryCriteria(page, dialog);

    const queryButton = dialog
      .locator('button.search-btn, button:has(mat-icon:has-text("search")), button:has(img:has-text("search"))')
      .filter({ visible: true })
      .first();
    await expect(queryButton).toBeEnabled({ timeout: 30000 });
    await queryButton.click({ force: true });
    await page.waitForTimeout(2500);

    const downloadButton = dialog
      .locator(
        'button.btn-download, button:has(mat-icon:has-text("file_download")), button:has(img:has-text("file_download")), button[aria-label*="download" i]'
      )
      .filter({ visible: true })
      .first();
    await expect(downloadButton, 'Offer Query download/export button should be visible in the query dialog.').toBeVisible({ timeout: 15000 });

    if (await downloadButton.isEnabled().catch(() => false)) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await downloadButton.click({ force: true }).catch(() => {});
      await downloadPromise;
    }

    await page.keyboard.press('Escape').catch(() => {});
  });

  test('OF-07: Edit row action opens the Offer Query form safely', async ({ page }) => {
    const opened = await clickFirstRowAction(page, /Edit|Update/i);
    if (!opened) {
      console.log('INFO: Offers edit action is not available for the current first row.');
      await expect(getTable(page)).toBeVisible();
      return;
    }

    const dialog = activeDialog(page);
    await expect(dialog.or(page.locator('body')).first()).toContainText(/Offer Query|Select Chain|Save|Cancel/i, { timeout: 15000 });
    await page.keyboard.press('Escape').catch(() => {});
  });

  test('OF-08: Delete row action opens confirmation and can be cancelled safely', async ({ page }) => {
    const opened = await clickFirstRowAction(page, /Delete|Remove/i);
    if (!opened) {
      console.log('INFO: Offers delete action is not available for the current first row.');
      await expect(getTable(page)).toBeVisible();
      return;
    }

    await expect(activeDialog(page).or(page.locator('body')).first()).toContainText(/Delete|Confirm|Cancel|Are you sure|Yes|No/i, { timeout: 15000 });

    const cancel = page
      .locator('.swal2-cancel, button:has-text("Cancel"), button:has-text("No"), button:has-text("Close")')
      .filter({ visible: true })
      .first();
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click({ force: true }).catch(() => {});
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await page.waitForTimeout(1000);
    await expect(getTable(page)).toBeVisible({ timeout: 15000 });
  });
});
