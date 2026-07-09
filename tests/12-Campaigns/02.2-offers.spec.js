// @ts-check
import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

const OFFER_IMAGE_PATHS = [
  'tests/fixtures/offer-image.png',
  'tests/fixtures/offer-image-ar.png',
];
const TARGET_STORE_NAME = 'Cafe Asiana';

test.describe.serial('02.2 - Campaign View Offers', () => {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const today = new Date();
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + 1);
  const START_DATE = `${pad(today.getMonth() + 1)}/${pad(today.getDate())}/${today.getFullYear()}`;
  const END_DATE = `${pad(endDate.getMonth() + 1)}/${pad(endDate.getDate())}/${endDate.getFullYear()}`;

  /**
   * @param {import("playwright-core").Page} page
   */
  async function openLatestCampaignView(page) {
    const searchInput = page.locator('input[matinput], input.mat-input-element, input[placeholder*="Search" i]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 20000 });
    await searchInput.fill('Auto Campaign');
    await page.waitForTimeout(6000);

    let firstRow = page.locator('mat-row, tbody tr').first();
    if (!(await firstRow.isVisible({ timeout: 15000 }).catch(() => false))) {
      console.log('INFO: Auto Campaign not found. Clearing search and using first available campaign.');
      await searchInput.clear();
      await searchInput.dispatchEvent('input').catch(() => {});
      await page.waitForTimeout(3000);
      firstRow = page.locator('mat-row, tbody tr').first();
    }

    if (!(await firstRow.isVisible({ timeout: 15000 }).catch(() => false))) {
      test.skip(true, 'No campaign rows are available in this UAT environment.');
    }

    const actionBtn = firstRow.locator('.mat-menu-trigger, i.mar-icon-more-h, i.mar-icon-more-v, button[mat-icon-button]').first();
    if (await actionBtn.isVisible().catch(() => false)) {
      await actionBtn.click({ force: true });
    } else {
      await firstRow.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(1200);

    const viewBtn = page.locator('button.mat-menu-item:has-text("View"), [role="menuitem"]:has-text("View"), .dropdown-item:has-text("View")').first();
    await viewBtn.waitFor({ state: 'visible', timeout: 15000 });
    await viewBtn.click({ force: true });
    await page.waitForTimeout(4000);
  }

  /**
   * @param {import("playwright-core").Page} page
   */
  async function isOfferManagementOpen(page) {
    const offerManagementTitle = page
      .locator('h1, h2, h3, h4, .page-title')
      .filter({ hasText: /Campaigns\s*-\s*Offer Management|Offer Management/i })
      .first();

    return await offerManagementTitle.isVisible({ timeout: 10000 }).catch(() => false);
  }

  /**
   * @param {import("playwright-core").Page} page
   */
  async function getCreateCampaignOfferButton(page) {
    if (!(await isOfferManagementOpen(page))) return null;

    const exactCreateCampaignOffer = page.getByRole('button', { name: /^Create Campaign Offer$/ }).first();
    if (await exactCreateCampaignOffer.isVisible().catch(() => false)) return exactCreateCampaignOffer;

    const offerCreateButtons = [
      page.getByRole('button', { name: /^Create Offer$/ }).first(),
      page.getByRole('button', { name: /^Add Offer$/ }).first(),
      page.getByRole('button', { name: /^Create$/ }).first(),
      page.locator('button.create-button:has-text("Create")').first(),
    ];

    for (const button of offerCreateButtons) {
      if (await button.isVisible().catch(() => false)) return button;
    }

    return null;
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {import("playwright-core").Locator} context
   * @param {string} label
   */
  async function selectDropdown(page, context, label, optionIndex = 0, optionText = null) {
    const compactLabel = label.replace(/\s+/g, '');
    const selector =
      `mat-select[formcontrolname*="${label}" i], ` +
      `mat-select[formcontrolname*="${compactLabel}" i], ` +
      `mat-select[aria-label*="${label}" i], ` +
      `mat-select[placeholder*="${label}" i], ` +
      `mat-form-field:has-text("${label}") mat-select`;

    const dropdown = context.locator(selector).first();
    if (!(await dropdown.isVisible().catch(() => false))) return false;
    await dropdown.scrollIntoViewIfNeeded().catch(() => {});
    await dropdown.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);

    const overlayOptions = page.locator('mat-option, .mat-option, .cdk-overlay-pane mat-option');
    const count = await overlayOptions.count().catch(() => 0);
    if (count === 0) {
      const localOptions = dropdown.locator('mat-option, .mat-option');
      if (await localOptions.nth(optionIndex).isVisible().catch(() => false)) {
        await localOptions.nth(optionIndex).click({ force: true }).catch(() => {});
        return true;
      }
      return false;
    }

    if (optionText) {
      const optionByText = overlayOptions.filter({ hasText: new RegExp(optionText, 'i') }).first();
      if (await optionByText.isVisible().catch(() => false)) {
        await optionByText.click({ force: true }).catch(() => {});
        await page.waitForTimeout(500);
        return true;
      }
    }

    const selectableOptions = [];
    for (let i = 0; i < count; i++) {
      const option = overlayOptions.nth(i);
      if (!(await option.isVisible().catch(() => false))) continue;

      const text = ((await option.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      const ariaDisabled = await option.getAttribute('aria-disabled').catch(() => null);
      const classList = (await option.getAttribute('class').catch(() => '')) || '';
      const disabled = ariaDisabled === 'true' || /disabled/.test(classList);
      const placeholder = !text || /^(select|please select|choose|loading|no data|no records|no results)/i.test(text);

      if (!disabled && !placeholder) selectableOptions.push(option);
    }

    const selectable = selectableOptions[optionIndex] || selectableOptions[0];
    if (selectable) {
      await selectable.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      return true;
    }

    for (let i = 0; i < count; i++) {
      if (await overlayOptions.nth(i).isVisible().catch(() => false)) {
        await overlayOptions.nth(i).click({ force: true }).catch(() => {});
        await page.waitForTimeout(500);
        return true;
      }
    }

    return false;
  }

  /**
   * @param {import("playwright-core").Locator} context
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
        await input.fill(String(value)).catch(() => {});
        await input.dispatchEvent('input').catch(() => {});
        await input.dispatchEvent('change').catch(() => {});
        await input.blur().catch(() => {});
        return true;
      }
    }
    return false;
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {import("playwright-core").Locator} context
   * @param {number} datePickerIndex
   */
  async function selectCalendarDate(page, context, datePickerIndex, nextMonth = false) {
    const dateInput = context
      .locator(
        'input[formcontrolname*="Date" i], ' +
        'mat-form-field:has-text("Date") input, ' +
        'input[placeholder*="Date" i]'
      )
      .nth(datePickerIndex);

    if (!(await dateInput.isVisible().catch(() => false))) return false;

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
   * @param {import("playwright-core").Page} page
   */
  async function handleOptionalStoreSelection(page) {
    const context = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    const picker = context.locator('.record-picker, app-record-picker, .listbox').first();
    const selectAll = context
      .locator('button.pull-left:has-text("All"), button:has-text("Select All"), mat-checkbox:has-text("Select All"), th mat-checkbox')
      .first();

    if (!(await picker.isVisible().catch(() => false)) && !(await selectAll.isVisible().catch(() => false))) return false;

    console.log('INFO: Optional store selection detected.');
    const storeSearch = context.locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element').first();
    if (await storeSearch.isVisible().catch(() => false) && await storeSearch.isEditable().catch(() => false)) {
      await storeSearch.click({ force: true }).catch(() => {});
      await storeSearch.fill(TARGET_STORE_NAME).catch(() => {});
      await storeSearch.dispatchEvent('input').catch(() => {});
      await page.waitForTimeout(1000);
    }

    const targetStore = context.getByText(new RegExp(`^${TARGET_STORE_NAME}$`, 'i')).first();
    if (await targetStore.isVisible().catch(() => false)) {
      console.log(`INFO: Selecting store: ${TARGET_STORE_NAME}`);
      await targetStore.scrollIntoViewIfNeeded().catch(() => {});
      await targetStore.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
    } else {
      console.log(`WARNING: Target store "${TARGET_STORE_NAME}" was not found in store selection.`);
      return false;
    }

    const addBtn = context
      .locator('button[name="addBtn"], button:has-text("Add"), button:has(mat-icon:has-text("chevron_right")), .point-right, :text("Add")')
      .filter({ visible: true })
      .first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.evaluate((node) => {
        const target = node.closest('button, [role="button"], .btn, div') || node;
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }).catch(async () => {
        await addBtn.click({ force: true });
      });
      await page.waitForTimeout(700);
    }

    const confirmBtn = await getEnabledDialogButton(context, /^(Create and set Stores|Create|Save|Submit|Next)$/);
    if (await confirmBtn.isVisible().catch(() => false) && await confirmBtn.isEnabled().catch(() => false)) {
      await confirmBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    return true;
  }

  /**
   * @param {import("playwright-core").Page} page
   */
  async function getFirstSelectableTargetOption(page) {
    const options = page
      .locator('mat-option, .mat-option, [role="option"], .ng-option, .dropdown-item')
      .filter({ visible: true })
      .filter({ hasNotText: /close|search|add|remove|select all|no data|no records|no results|loading/i });
    const count = await options.count().catch(() => 0);

    for (let index = 0; index < count; index++) {
      const option = options.nth(index);
      const optionText = ((await option.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (!optionText || /close|search|add|remove|select all|no data|no records|no results|loading/i.test(optionText)) continue;
      return option;
    }

    return null;
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {import("playwright-core").Locator} select
   */
  async function deactivateTargetEntityRow(page, select) {
    const deactivated = await select.evaluate((el) => {
      let row = el.parentElement;
      for (let depth = 0; row && depth < 8; depth++) {
        const text = row.textContent || '';
        if (/Is Active/i.test(text) && /Choose\s+(Category|Item)/i.test(text)) {
          const toggle = row.querySelector('mat-slide-toggle.mat-checked, mat-slide-toggle[aria-checked="true"], mat-slide-toggle');
          const target = toggle?.querySelector('button, input, label, .mat-slide-toggle-thumb-container') || toggle;
          if (target) {
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return true;
          }
        }
        row = row.parentElement;
      }
      return false;
    }).catch(() => false);

    if (deactivated) {
      console.log('INFO: Deactivated target entity row with no selectable categories/items.');
      await page.waitForTimeout(500);
    }

    return deactivated;
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {import("playwright-core").Locator} dialog
   */
  async function deactivateInvalidTargetEntityRows(page, dialog) {
    const deactivatedCount = await dialog.evaluate((root) => {
      let count = 0;
      const rows = Array.from(root.querySelectorAll('div, li, tr')).filter((el) => {
        const text = el.textContent || '';
        return /Please Select (Categories|Items)/i.test(text) && /Is Active/i.test(text);
      });

      for (const row of rows) {
        const toggle = row.querySelector('mat-slide-toggle.mat-checked, mat-slide-toggle[aria-checked="true"], mat-slide-toggle');
        const target = toggle?.querySelector('button, input, label, .mat-slide-toggle-thumb-container') || toggle;
        if (target) {
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          count++;
        }
      }

      return count;
    }).catch(() => 0);

    if (deactivatedCount > 0) {
      console.log(`INFO: Deactivated ${deactivatedCount} invalid target entity row(s).`);
      await page.waitForTimeout(700);
    }

    const box = await dialog.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.click(box.x + 40, box.y + 40).catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {import("playwright-core").Locator} dialog
   */
  async function confirmTargetEntitySelection(page, dialog) {
    const activeDialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    const context = await activeDialog.isVisible().catch(() => false) ? activeDialog : dialog;

    const addBtn = context
      .locator('button[name="addBtn"], button:has-text("Add"), button:has(mat-icon:has-text("chevron_right")), .point-right')
      .filter({ visible: true })
      .first();
    if (await addBtn.isVisible().catch(() => false) && await addBtn.isEnabled().catch(() => false)) {
      await addBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(700);
    }

    const confirmBtn = await getEnabledDialogButton(context, /^(Create and set Stores|Create|Save|Submit|Next|Add)$/);
    if (await confirmBtn.isVisible().catch(() => false) && await confirmBtn.isEnabled().catch(() => false)) {
      const buttonText = ((await confirmBtn.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      console.log(`INFO: Confirming target entity selection via: ${buttonText}`);
      await confirmBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {import("playwright-core").Locator} dialog
   */
  async function handleTargetEntitySelections(page, dialog) {
    let roleComboboxes = dialog.locator('mat-select, [role="combobox"]').filter({ hasText: /Choose\s+(Category|Item)/i });
    const roleComboboxCount = await roleComboboxes.count().catch(() => 0);
    if (roleComboboxCount > 0) {
      console.log(`INFO: Target entity role controls found: ${roleComboboxCount}`);
      let selectedAnyRole = false;

      for (let index = 0; index < roleComboboxCount; index++) {
        const select = roleComboboxes.nth(index);
        if (!(await select.isVisible().catch(() => false))) continue;

        const currentText = ((await select.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (currentText && !/choose\s+(category|item)/i.test(currentText)) continue;

        await select.scrollIntoViewIfNeeded().catch(() => {});
        await select.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1000);

        const option = await getFirstSelectableTargetOption(page);
        if (option && await option.isVisible().catch(() => false)) {
          const optionText = ((await option.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
          await option.click({ force: true }).catch(() => {});
          console.log(`INFO: Selected target entity: ${optionText}`);
          selectedAnyRole = true;
          await page.waitForTimeout(500);
        } else {
          if (await deactivateTargetEntityRow(page, select)) continue;
          if (selectedAnyRole) break;
          await page.keyboard.press('Escape').catch(() => {});
        }
      }

      if (selectedAnyRole) {
        await deactivateInvalidTargetEntityRows(page, dialog);
        return true;
      }
    }

    const domSelectCount = await page.evaluate(() => {
      const matches = Array.from(document.querySelectorAll('mat-select, [role="combobox"], .mat-select-trigger'))
        .filter((el) => {
          const ownText = el.textContent || '';
          const parentText = el.closest('mat-form-field, .mat-form-field, div')?.textContent || '';
          return /Choose\s+(Category|Item)/i.test(`${ownText} ${parentText}`);
        });
      return matches.length;
    }).catch(() => 0);

    if (domSelectCount > 0) {
      console.log(`INFO: Target entity DOM controls found: ${domSelectCount}`);
      let selectedAnyDom = false;
      for (let index = 0; index < domSelectCount; index++) {
        await page.evaluate((targetIndex) => {
          const matches = Array.from(document.querySelectorAll('mat-select, [role="combobox"], .mat-select-trigger'))
            .filter((el) => {
              const ownText = el.textContent || '';
              const parentText = el.closest('mat-form-field, .mat-form-field, div')?.textContent || '';
              return /Choose\s+(Category|Item)/i.test(`${ownText} ${parentText}`);
            });
          const el = matches[targetIndex];
          if (!el) return;
          const target = el.closest('mat-select, [role="combobox"], .mat-select-trigger') || el;
          target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }, index).catch(() => {});
        await page.waitForTimeout(700);

        const option = await getFirstSelectableTargetOption(page);
        if (option && await option.isVisible().catch(() => false)) {
          const optionText = ((await option.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
          await option.click({ force: true }).catch(() => {});
          console.log(`INFO: Selected target entity: ${optionText}`);
          selectedAnyDom = true;
          await page.waitForTimeout(500);
        } else {
          const deactivated = await page.evaluate((targetIndex) => {
            const matches = Array.from(document.querySelectorAll('mat-select, [role="combobox"], .mat-select-trigger'))
              .filter((el) => {
                const ownText = el.textContent || '';
                const parentText = el.closest('mat-form-field, .mat-form-field, div')?.textContent || '';
                return /Choose\s+(Category|Item)/i.test(`${ownText} ${parentText}`);
              });
            const el = matches[targetIndex];
            if (!el) return false;

            let row = el.parentElement;
            for (let depth = 0; row && depth < 8; depth++) {
              const text = row.textContent || '';
              if (/Is Active/i.test(text) && /Choose\s+(Category|Item)/i.test(text)) {
                const toggle = row.querySelector('mat-slide-toggle.mat-checked, mat-slide-toggle[aria-checked="true"], mat-slide-toggle');
                const target = toggle?.querySelector('button, input, label, .mat-slide-toggle-thumb-container') || toggle;
                if (target) {
                  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                  return true;
                }
              }
              row = row.parentElement;
            }
            return false;
          }, index).catch(() => false);
          if (deactivated) {
            console.log('INFO: Deactivated target entity row with no selectable categories/items.');
            await page.waitForTimeout(500);
            continue;
          }
          if (selectedAnyDom) break;
          await page.keyboard.press('Escape').catch(() => {});
        }
      }
      if (selectedAnyDom) {
        await deactivateInvalidTargetEntityRows(page, dialog);
        return true;
      }
    }

    const targetLabels = page.getByText(/Choose\s+(Category|Item)/i);
    const targetSelects = page.locator('[role="combobox"], mat-select').filter({ hasText: /Choose\s+(Category|Item)/i });
    const targetFields = page.locator('mat-form-field, .mat-form-field, div').filter({ hasText: /Choose\s+(Category|Item)/i });
    const count = Math.max(
      await targetLabels.count().catch(() => 0),
      await targetSelects.count().catch(() => 0),
      await targetFields.count().catch(() => 0)
    );
    if (count > 0) console.log(`INFO: Target entity controls found: ${count}`);
    if (count === 0) return false;

    let selectedAny = false;
    for (let index = 0; index < count; index++) {
      let select = targetSelects.nth(index);
      if (!(await select.isVisible().catch(() => false))) {
        select = targetFields.nth(index).locator('[role="combobox"], mat-select').first();
      }
      const label = targetLabels.nth(index);
      if (!(await select.isVisible().catch(() => false)) && !(await label.isVisible().catch(() => false))) continue;

      const currentText = ((await select.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (currentText && !/choose\s+(category|item)/i.test(currentText)) continue;

      if (await select.isVisible().catch(() => false)) {
        await select.scrollIntoViewIfNeeded().catch(() => {});
        await select.click({ force: true }).catch(() => {});
      } else {
        await label.scrollIntoViewIfNeeded().catch(() => {});
        await label.click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(700);

      const option = await getFirstSelectableTargetOption(page);
      if (option && await option.isVisible().catch(() => false)) {
        const optionText = ((await option.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        await option.click({ force: true }).catch(() => {});
        console.log(`INFO: Selected target entity: ${optionText}`);
        selectedAny = true;
        await page.waitForTimeout(500);
      } else {
        if (await deactivateTargetEntityRow(page, select)) continue;
        if (selectedAny) break;
        await page.keyboard.press('Escape').catch(() => {});
      }
    }

    if (selectedAny) {
      await deactivateInvalidTargetEntityRows(page, dialog);
    }

    return selectedAny;
  }

  /**
   * @param {import("playwright-core").Locator} dialog
   * @param {RegExp} labelPattern
   */
  async function getEnabledDialogButton(dialog, labelPattern) {
    const buttons = dialog.locator('button.center-button, button.mat-primary, button');
    const count = await buttons.count().catch(() => 0);

    for (let index = count - 1; index >= 0; index--) {
      const button = buttons.nth(index);
      const text = ((await button.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      if (
        labelPattern.test(text) &&
        await button.isVisible().catch(() => false) &&
        await button.isEnabled().catch(() => false)
      ) {
        return button;
      }
    }

    return buttons.first();
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   */
  async function completeRemainingOfferSteps(page, title) {
    for (let step = 0; step < 12; step++) {
      const dialog = page.locator('mat-dialog-container, modal-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
      if (!(await dialog.isVisible().catch(() => false))) {
        await page.locator('mat-dialog-container, modal-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last()
          .waitFor({ state: 'visible', timeout: 15000 })
          .catch(() => {});
        if (await page.locator('mat-dialog-container, modal-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last().isVisible().catch(() => false)) {
          continue;
        }
        if (await isOfferManagementOpen(page)) {
          return await verifyOfferSearch(page, title);
        }
        return await page.locator('mat-row, tbody tr, tr').filter({ hasText: title }).first().isVisible().catch(() => false);
      }

      if (await page.locator('mat-row, tbody tr, tr').filter({ hasText: title }).first().isVisible().catch(() => false)) {
        await page.keyboard.press('Escape').catch(() => {});
        return true;
      }

      if (await handleOptionalStoreSelection(page)) {
        await page.waitForTimeout(2500);
        continue;
      }

      if (await handleTargetEntitySelections(page, dialog)) {
        await page.waitForTimeout(1000);
      }

      const fileInputs = dialog.locator('input[type="file"]');
      const fileInputCount = await fileInputs.count().catch(() => 0);
      if (fileInputCount > 0) {
        console.log(`INFO: Found ${fileInputCount} offer image file input(s).`);
        for (let index = 0; index < 2; index++) {
          const remainingInputs = dialog.locator('input[type="file"]');
          const remainingCount = await remainingInputs.count().catch(() => 0);
          console.log(`INFO: Uploading offer image ${index + 1}; remaining inputs: ${remainingCount}`);
          if (remainingCount <= index) break;

          await remainingInputs.nth(index).setInputFiles(OFFER_IMAGE_PATHS[index]);
          const photoEditor = page
            .locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]')
            .filter({ hasText: /Photo Editor/i })
            .last();
          await photoEditor.waitFor({ state: 'visible', timeout: 10000 });
          if (await photoEditor.isVisible().catch(() => false)) {
            const applyBtn = photoEditor.getByRole('button', { name: /^Apply$/ }).first();
            await applyBtn.click({ force: true });
            await photoEditor.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
            console.log(`INFO: Applied offer image ${index + 1}.`);
          }
          await page.waitForTimeout(1000);
        }
        await page.waitForTimeout(1500);
        continue;
      }

      const successBtn = page.locator('.swal2-confirm, button:has-text("OK")').filter({ visible: true }).first();
      if (await successBtn.isVisible().catch(() => false)) {
        await successBtn.click({ force: true });
        await page.waitForTimeout(1500);
        if (await page.locator('mat-row, tbody tr, tr').filter({ hasText: title }).first().isVisible().catch(() => false)) {
          return true;
        }
        continue;
      }

      const finalBtn = await getEnabledDialogButton(dialog, /^(Create and set Stores|Create|Save|Submit|Next)$/);
      if (await finalBtn.isVisible().catch(() => false)) {
        if (await finalBtn.isEnabled().catch(() => false)) {
          const buttonText = (await finalBtn.innerText().catch(() => '')).trim();
          console.log(`INFO: Clicking campaign offer wizard button: ${buttonText}`);
          await finalBtn.click({ force: true });
          await page.waitForTimeout(4000);
          const okBtn = page.locator('.swal2-confirm, button:has-text("OK")').filter({ visible: true }).first();
          if (await okBtn.isVisible().catch(() => false)) {
            await okBtn.click({ force: true });
            await page.waitForTimeout(1500);
          }
          if (await page.locator('mat-row, tbody tr, tr').filter({ hasText: title }).first().isVisible().catch(() => false)) {
            return true;
          }
          continue;
        }

        if (await page.locator('mat-row, tbody tr, tr').filter({ hasText: title }).first().isVisible().catch(() => false)) {
          await page.keyboard.press('Escape').catch(() => {});
          return true;
        }
      }

      const nextBtn = await getEnabledDialogButton(dialog, /^Next$/);
      if (await nextBtn.isVisible().catch(() => false) && await nextBtn.isEnabled().catch(() => false)) {
        await nextBtn.click({ force: true });
        await page.waitForTimeout(2000);
        continue;
      }

      break;
    }

    if (await isOfferManagementOpen(page)) {
      return await verifyOfferSearch(page, title);
    }
    return await page.locator('mat-row, tbody tr, tr').filter({ hasText: title }).first().isVisible().catch(() => false);
  }

  /**
   * @param {import("playwright-core").Page} page
   */
  async function openOffersSection(page) {
    await page.waitForTimeout(1500);

    const waitForOffersList = async () => {
      await page
        .locator('h1, h2, h3, h4, .page-title')
        .filter({ hasText: /Campaigns\s*-\s*Offer Management|Offer Management/i })
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })
        .catch(() => {});

      return (await isOfferManagementOpen(page)) && !!(await getCreateCampaignOfferButton(page));
    };

    if (await waitForOffersList()) return true;

    const offersHeading = page.locator('h5').filter({ hasText: /^Offers$/ }).first();
    if (await offersHeading.isVisible({ timeout: 15000 }).catch(() => false)) {
      console.log('✅ Offers heading found, clicking nearest card...');
      await offersHeading.scrollIntoViewIfNeeded();
      await offersHeading.evaluate((/** @type {{ closest: (arg0: string) => any; parentElement: any; }} */ heading) => {
        const card = heading.closest('.plain-card, .card, [class*="plain-card"], [class*="card"]');
        const target = card || heading.parentElement || heading;
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });
      await page.waitForTimeout(2500);
      if (await waitForOffersList()) return true;
    }

    const offersCardAlt = page.locator(
      'div.plain-card:has(h5:has-text("Offers")), .card:has(h5:has-text("Offers")), div.plain-card:has-text("Offer"), .card:has-text("Offer"), [cursor="pointer"]:has-text("Offers")'
    ).first();
    if (await offersCardAlt.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('✅ Offers card found (alternative selector), scrolling and clicking...');
      await offersCardAlt.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await offersCardAlt.click({ force: true });
      await page.waitForTimeout(2500);
      if (await waitForOffersList()) return true;
    }

    const offersTab = page.locator('[role="tab"]:has-text("Offers"), [role="tab"]:has-text("Offer")').first();
    if (await offersTab.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('✅ Offers tab found, clicking...');
      await offersTab.click({ force: true });
      await page.waitForTimeout(2500);
      if (await waitForOffersList()) return true;
    }

    const offersBtn = page.locator('button:has-text("Offers")').first();
    if (await offersBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('✅ Offers button found, clicking...');
      await offersBtn.click({ force: true });
      await page.waitForTimeout(2500);
      if (await waitForOffersList()) return true;
    }

    if (await waitForOffersList()) return true;

    console.log('⚠️ Offers section not found with any selector');
    return false;
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   */
  async function createOfferInView(page, title, options = {}) {
    const {
      // @ts-ignore
      minOrderValue = '100',
      // @ts-ignore
      maxOrderValue = '5000',
      // @ts-ignore
      minOrderCount = '1',
      // @ts-ignore
      maxOrderCount = '10',
      // @ts-ignore
      maxCount = '100',
      // @ts-ignore
      maxCountPerUser = '1',
      // @ts-ignore
      discountMaxAmount = '100',
      // @ts-ignore
      discountValue = '10',
      // @ts-ignore
      selectTargetTypeIndex = 0,
      // @ts-ignore
      targetTypeText = null,
      // @ts-ignore
      selectOrderTypeIndex = 0,
      // @ts-ignore
      selectDiscountTypeIndex = 0,
      // @ts-ignore
      discountTypeText = null,
      // @ts-ignore
      operationalDayIndex = 0,
      // @ts-ignore
      dayTypeIndex = 0,
      // @ts-ignore
      startTimeIndex = 0,
      // @ts-ignore
      endTimeIndex = 1,
    } = options;

    await page.waitForTimeout(1500);

    const createOfferBtn = await getCreateCampaignOfferButton(page);
    
    if (!createOfferBtn) {
      console.log('WARNING: Offer Management Create button not found');
      return false;
    }

    await createOfferBtn.scrollIntoViewIfNeeded();
    await createOfferBtn.click({ force: true });
    await page.waitForTimeout(800);

    const createCampaignOfferMenuItem = page
      .locator(
        'button.mat-menu-item:has-text("Create Campaign Offer"), ' +
        '[role="menuitem"]:has-text("Create Campaign Offer"), ' +
        '.mat-menu-item:has-text("Create Campaign Offer")'
      )
      .last();
    await createCampaignOfferMenuItem.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await createCampaignOfferMenuItem.isVisible().catch(() => false)) {
      await createCampaignOfferMenuItem.click({ force: true });
      await page.waitForTimeout(1000);
    } else if (await page.locator('mat-dialog-container, .modal-dialog, [role="dialog"]').first().isVisible().catch(() => false)) {
      // form may have opened directly
    } else {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
    }

    await page.waitForTimeout(2500);

    const dialog = page
      .locator('mat-dialog-container, .modal-dialog, [role="dialog"]')
      .filter({ hasText: /Create Campaign Offer/i })
      .first();
    if (!(await dialog.isVisible({ timeout: 15000 }).catch(() => false))) {
      console.log('WARNING: Dialog did not appear');
      return false;
    }

    const formTitle = dialog.locator('h1, h2, h3, h4, h5, h6').filter({ hasText: /Create Campaign Offer/i }).first();
    await expect(formTitle).toBeVisible({ timeout: 15000 });

    await selectDropdown(page, dialog, 'Order Type', selectOrderTypeIndex);
    await selectDropdown(page, dialog, 'Target Type', selectTargetTypeIndex, targetTypeText);
    await page.waitForTimeout(1000);

    await fillFirstVisible(dialog, [
      'input[formcontrolname="Name" i]',
      'input[formcontrolname="Title" i]',
      'mat-form-field:has-text("Name") input',
      'input[placeholder*="Name" i]',
    ], title);

    await fillFirstVisible(dialog, [
      'input[formcontrolname="ArabicName" i]',
      'input[formcontrolname="NameArabic" i]',
      'input[formcontrolname="TitleArabic" i]',
      'mat-form-field:has-text("Arabic Name") input',
      'input[placeholder*="Arabic Name" i]',
    ], `Arabic ${title}`);

    await fillFirstVisible(dialog, [
      'textarea[formcontrolname="Description" i]',
      'mat-form-field:has-text("Description") textarea',
      'textarea[placeholder*="Description" i]',
    ], 'Offer created through campaign view automation');

    await fillFirstVisible(dialog, [
      'textarea[formcontrolname="DescriptionArabic" i]',
      'textarea[formcontrolname="ArabicDescription" i]',
      'mat-form-field:has-text("Arabic Description") textarea',
      'textarea[placeholder*="Arabic Description" i]',
    ], 'Arabic offer created through campaign view automation');

    await selectDropdown(page, dialog, 'Discount Type', selectDiscountTypeIndex, discountTypeText);
    await fillFirstVisible(dialog, [
      'input[formcontrolname="DiscountValue" i]',
      'mat-form-field:has-text("Discount Value") input',
      'input[placeholder*="Discount Value" i]',
    ], discountValue);
    await fillFirstVisible(dialog, [
      'input[formcontrolname="DiscountMaxAmount" i]',
      'mat-form-field:has-text("Discount Max Amount") input',
      'mat-form-field:has-text("Discount Max") input',
      'input[placeholder*="Discount Max" i]',
    ], discountMaxAmount);

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
      'input[formcontrolname="MaxCount" i]',
      'mat-form-field:has-text("Max Count") input',
    ], maxCount);
    await fillFirstVisible(dialog, [
      'input[formcontrolname="MaxCountPerUser" i]',
      'mat-form-field:has-text("Max Count Per User") input',
    ], maxCountPerUser);
    await fillFirstVisible(dialog, [
      'input[formcontrolname="MinOrderCount" i]',
      'mat-form-field:has-text("Min Order Count") input',
    ], minOrderCount);
    await fillFirstVisible(dialog, [
      'input[formcontrolname="MaxOrderCount" i]',
      'mat-form-field:has-text("Max Order Count") input',
    ], maxOrderCount);
    await fillFirstVisible(dialog, [
      'input[formcontrolname="MinOrderValue" i]',
      'input[formcontrolname="MinOrderAmount" i]',
      'mat-form-field:has-text("Min Order Amount") input',
      'mat-form-field:has-text("Min Order Value") input',
    ], minOrderValue);
    await fillFirstVisible(dialog, [
      'input[formcontrolname="MaxOrderValue" i]',
      'input[formcontrolname="MaxOrderAmount" i]',
      'mat-form-field:has-text("Max Order Amount") input',
      'mat-form-field:has-text("Max Order Value") input',
    ], maxOrderValue);

    await selectDropdown(page, dialog, 'OperationalDay', operationalDayIndex);
    await selectDropdown(page, dialog, 'Day Type', dayTypeIndex);
    await selectDropdown(page, dialog, 'StartTime', startTimeIndex);
    await selectDropdown(page, dialog, 'Start Time', startTimeIndex);
    await selectDropdown(page, dialog, 'EndTime', endTimeIndex);
    await selectDropdown(page, dialog, 'End Time', endTimeIndex);

    const saveBtn = await getEnabledDialogButton(dialog, /^(Create|Save|Submit|Next)$/);
    await saveBtn.waitFor({ state: 'visible', timeout: 15000 });
    await expect(saveBtn).toBeEnabled({ timeout: 15000 });
    await saveBtn.click({ force: true });
    await page.waitForTimeout(2500);

    const completed = await completeRemainingOfferSteps(page, title);
    if (!completed) {
      console.log(`WARNING: Campaign offer "${title}" was not confirmed in the table.`);
      return false;
    }

    if (await dialog.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await dialog.locator('img:has-text("close"), button:has-text("Close"), [aria-label="Close"]').first().click({ force: true }).catch(() => {});
    }

    if (await page.locator('mat-row, tbody tr, tr').filter({ hasText: title }).first().isVisible().catch(() => false)) {
      return true;
    }

    await expect(dialog).toBeHidden({ timeout: 20000 });
    return true;
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   */
  async function createStaticOfferInView(page, title) {
    return await createOfferInView(page, title, {
      targetTypeText: 'Store',
      minOrderValue: '0',
      discountMaxAmount: '0',
    });
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   */
  async function createAmountOfferInView(page, title) {
    return await createOfferInView(page, title, {
      discountTypeText: 'Amount',
      selectDiscountTypeIndex: 1,
      discountValue: '15',
      discountMaxAmount: '0',
      minOrderValue: '100',
    });
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   * @param {string} targetTypeText
   */
  async function createTargetTypeOfferInView(page, title, targetTypeText) {
    const targetTypeIndexByText = {
      Store: 0,
      Category: 1,
      Item: 2,
    };
    return await createOfferInView(page, title, {
      targetTypeText,
      // @ts-ignore
      selectTargetTypeIndex: targetTypeIndexByText[targetTypeText] ?? 0,
      discountValue: '10',
      discountMaxAmount: '100',
      minOrderValue: '100',
    });
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} term
   */
  async function verifyOfferSearch(page, term) {
    await page.waitForTimeout(2000);
    const searchInput = page.locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element').first();
    if (!(await searchInput.isVisible().catch(() => false))) {
      console.log('⚠️ Search input not found');
      return false;
    }

    await searchInput.click({ force: true });
    await searchInput.fill(term);
    await page.waitForTimeout(1500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);

    const resultRow = page.locator('mat-row, tbody tr, tr').filter({ hasText: term }).first();
    if (await resultRow.isVisible().catch(() => false)) {
      console.log('✅ Search result found');
      return true;
    }

    const searchBtn = page.locator('button:has(mat-icon:has-text("search")), button:has-text("Search"), button[aria-label*="search" i]').first();
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click({ force: true });
      await page.waitForTimeout(2000);
      if (await resultRow.isVisible().catch(() => false)) {
        console.log('✅ Search result found after button click');
        return true;
      }
    }

    console.log('⚠️ Search result not found for term:', term);
    return false;
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   */
  async function searchAndGetOfferRow(page, title) {
    const found = await verifyOfferSearch(page, title);
    expect(found).toBeTruthy();

    const row = page.locator('mat-row, tbody tr, tr').filter({ hasText: title }).first();
    await row.waitFor({ state: 'visible', timeout: 15000 });
    return row;
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   */
  async function openOfferActionMenu(page, title) {
    const row = await searchAndGetOfferRow(page, title);
    const actionCell = row.locator('td, mat-cell, .mat-cell, [role="cell"]').last();
    const actionBtn = actionCell
      .locator('.mat-menu-trigger, button[mat-icon-button], button, i.mar-icon-more-h, i.mar-icon-more-v, mat-icon, img')
      .last();

    await actionBtn.scrollIntoViewIfNeeded().catch(() => {});
    await actionBtn.waitFor({ state: 'visible', timeout: 10000 });
    await actionBtn.evaluate((node) => {
      const target = node.closest('button, [role="button"], .mat-menu-trigger') || node;
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }).catch(async () => {
      await actionBtn.click({ force: true });
    });
    await page.waitForTimeout(700);

    const menu = page.locator('.mat-menu-panel, [role="menu"], .cdk-overlay-pane, .dropdown-menu').filter({ visible: true }).first();
    await menu.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {RegExp} labelPattern
   */
  async function clickOfferAction(page, labelPattern) {
    const menuItem = page
      .locator('button.mat-menu-item, [role="menuitem"], .dropdown-item, li, a')
      .filter({ hasText: labelPattern })
      .first();

    await menuItem.waitFor({ state: 'visible', timeout: 10000 });
    const label = ((await menuItem.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`INFO: Clicking offer action: ${label || labelPattern}`);
    await menuItem.click({ force: true });
    await page.waitForTimeout(1500);
  }

  /**
   * @param {import("playwright-core").Page} page
   */
  async function dismissSuccessPopup(page) {
    const okBtn = page.locator('.swal2-confirm, button:has-text("OK")').filter({ visible: true }).first();
    if (await okBtn.isVisible().catch(() => false)) {
      await okBtn.click({ force: true });
      await page.waitForTimeout(1000);
      return true;
    }
    return false;
  }

  /**
   * @param {import("playwright-core").Page} page
   */
  async function closeOfferActionSurface(page) {
    await dismissSuccessPopup(page);

    const visibleDialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    if (await visibleDialog.isVisible().catch(() => false)) {
      await visibleDialog.evaluate((dialog) => {
        const elements = Array.from(dialog.querySelectorAll('button, img, mat-icon, [role="button"]'));
        const closeEl = elements.find((el) => {
          const text = `${el.textContent || ''} ${el.getAttribute('alt') || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('class') || ''}`.toLowerCase();
          return text.includes('close');
        }) || elements[0];
        if (closeEl) {
          const target = closeEl.closest('button, [role="button"], [class*="close"], .cursor-pointer') || closeEl.parentElement || closeEl;
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }
      }).catch(async () => {
        await page.keyboard.press('Escape').catch(() => {});
      });
      await page.waitForTimeout(1200);
    }

    const pageCancelBtn = page
      .locator('button:has-text("Cancel"), button:has-text("Back")')
      .filter({ visible: true })
      .last();
    const fullPageStoreHeading = page
      .locator('h1, h2, h3, h4, .page-title')
      .filter({ hasText: /Set Stores|Manage Stores|Offer Management/i })
      .first();
    if (await fullPageStoreHeading.isVisible().catch(() => false) && await pageCancelBtn.isVisible().catch(() => false)) {
      await pageCancelBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    const stillOnStorePage = page
      .locator('h1, h2, h3, h4, .page-title')
      .filter({ hasText: /Set Stores|Manage Stores/i })
      .first();
    if (await stillOnStorePage.isVisible().catch(() => false)) {
      const storeBackBtn = page.locator('mat-icon.back-bt, .back-bt, mat-icon:has-text("arrow_back_ios"), img:has-text("arrow_back_ios")').first();
      if (await storeBackBtn.isVisible().catch(() => false)) {
        await storeBackBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    }

    const closeBtn = page
      .locator(
        'modal-container img:has-text("close"), mat-dialog-container img:has-text("close"), ' +
        'modal-container button:has-text("Close"), mat-dialog-container button:has-text("Close"), ' +
        '[role="dialog"] button[aria-label="Close"], [role="dialog"] img:has-text("close")'
      )
      .filter({ visible: true })
      .first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1200);
      return;
    }

    const backBtn = page.locator('mat-icon.back-bt, .back-bt, mat-icon:has-text("arrow_back_ios"), button:has(mat-icon:has-text("arrow_back"))').first();
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      return;
    }

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(700);
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   */
  async function editCreatedOffer(page, title) {
    await openOfferActionMenu(page, title);
    await clickOfferAction(page, /Edit/i);

    const dialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    if (await dialog.isVisible().catch(() => false)) {
      await fillFirstVisible(dialog, [
        'textarea[formcontrolname="Description" i]',
        'mat-form-field:has-text("Description") textarea',
        'textarea[placeholder*="Description" i]',
      ], `Edited campaign offer ${title}`);

      const nextBtn = dialog.locator('button:has-text("Next"), button:has-text("Update"), button:has-text("Save")').filter({ visible: true }).last();
      if (await nextBtn.isVisible().catch(() => false) && await nextBtn.isEnabled().catch(() => false)) {
        const buttonText = ((await nextBtn.innerText().catch(() => '')) || '').trim();
        console.log(`INFO: Saving edited offer data via: ${buttonText}`);
        await nextBtn.click({ force: true });
        await page.waitForTimeout(2000);

        const secondStepDialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
        const updateBtn = secondStepDialog.locator('button:has-text("Update"), button:has-text("Save"), button:has-text("Submit")').filter({ visible: true }).last();
        if (await updateBtn.isVisible().catch(() => false) && await updateBtn.isEnabled().catch(() => false)) {
          console.log('INFO: Clicking final edit Update button.');
          await updateBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(2000);
        }
        await dismissSuccessPopup(page);
      }
    }

    await closeOfferActionSurface(page);
    await ensureCampaignOfferManagementPage(page);
    await searchAndGetOfferRow(page, title);
  }

  /**
   * @param {import("playwright-core").Page} page
   */
  async function returnFromOfferSubPage(page) {
    if (page.url().includes('/offer/set-store') || page.url().includes('/offer/manage-store')) {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
    } else {
      await closeOfferActionSurface(page);
    }
    if (!(await isOfferManagementOpen(page))) {
      await closeOfferActionSurface(page);
    }
  }

  /**
   * @param {import("playwright-core").Page} page
   */
  async function ensureCampaignOfferManagementPage(page) {
    const searchInput = page.locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element').first();
    if ((await isOfferManagementOpen(page)) && await searchInput.isVisible().catch(() => false)) {
      return;
    }

    await goToPage(page, '#/home/campaigns');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await openLatestCampaignView(page);
    const openedOffers = await openOffersSection(page);
    if (!openedOffers) {
      test.skip(true, 'Campaign Offer section is not available for the selected campaign in this environment.');
    }
  }

  /**
   * @param {import("playwright-core").Page} page
   */
  async function saveSetStoresPage(page) {
    const saveBtn = page.locator('button:has-text("Set Stores"), button:has-text("Save"), button:has-text("Update")').filter({ visible: true }).last();
    if (await saveBtn.isVisible().catch(() => false) && await saveBtn.isEnabled().catch(() => false)) {
      await saveBtn.click({ force: true });
      await page.waitForTimeout(2000);
      await dismissSuccessPopup(page);
      return true;
    }
    return false;
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   */
  async function removeFirstStoreFromSetStores(page, title) {
    await openOfferActionMenu(page, title);
    await clickOfferAction(page, /Set\s*Stores?/i);
    await page.waitForTimeout(2000);

    const selectedStore = page
      .locator('.selected-stores li, .selected-stores mat-list-option, app-record-picker li, .listbox li, ul li, mat-list-option')
      .filter({ visible: true })
      .last();

    await selectedStore.waitFor({ state: 'visible', timeout: 15000 });
    const storeName = ((await selectedStore.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`INFO: Removing first selected store from Set Stores: ${storeName}`);
    await selectedStore.scrollIntoViewIfNeeded().catch(() => {});
    await selectedStore.click({ force: true });
    const box = await selectedStore.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
    }
    await selectedStore.evaluate((node) => {
      node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }).catch(() => {});
    await page.waitForTimeout(700);

    const removeBtn = page.locator('button:has-text("Remove"), button[name="removeBtn"], button:has(mat-icon:has-text("chevron_left"))').filter({ visible: true }).first();
    await expect(removeBtn).toBeEnabled({ timeout: 10000 });
    await removeBtn.click({ force: true });
    await page.waitForTimeout(1000);

    await saveSetStoresPage(page);
    await returnFromOfferSubPage(page);
    await ensureCampaignOfferManagementPage(page);
    await searchAndGetOfferRow(page, title);
  }

  /**
   * @param {import("playwright-core").Locator} context
   */
  async function setIsActiveFalse(context) {
    const slideToggle = context.locator('mat-slide-toggle:has-text("Is Active"), mat-slide-toggle[formcontrolname*="Active" i], mat-slide-toggle').first();
    if (await slideToggle.isVisible().catch(() => false)) {
      const isChecked = (await slideToggle.getAttribute('aria-checked').catch(() => null)) === 'true' ||
        ((await slideToggle.getAttribute('class').catch(() => '')) || '').includes('mat-checked');
      if (isChecked) {
        await slideToggle.click({ force: true });
        await context.page().waitForTimeout(700);
      }
      return true;
    }

    const checkbox = context.locator('mat-checkbox:has-text("Is Active"), mat-checkbox[formcontrolname*="Active" i], input[type="checkbox"]').first();
    if (await checkbox.isVisible().catch(() => false)) {
      const isChecked = (await checkbox.getAttribute('aria-checked').catch(() => null)) === 'true' ||
        await checkbox.locator('input[type="checkbox"]').first().isChecked().catch(() => false);
      if (isChecked) {
        await checkbox.click({ force: true });
        await context.page().waitForTimeout(700);
      }
      return true;
    }

    return false;
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   */
  async function deactivateFirstStoreFromManageStores(page, title) {
    await openOfferActionMenu(page, title);
    await clickOfferAction(page, /Manage\s*Stores?/i);
    await page.waitForTimeout(2500);

    const firstRow = page.locator('mat-row, tbody tr, tr').filter({ hasText: /True|False/i }).first();
    await firstRow.waitFor({ state: 'visible', timeout: 20000 });

    const inlineChanged = await setIsActiveFalse(firstRow);
    if (!inlineChanged) {
      const editBtn = firstRow
        .locator('button:has-text("Edit"), [role="button"]:has-text("Edit"), button:has(img), mat-icon:has-text("edit"), img:has-text("edit"), .mat-menu-trigger, button[mat-icon-button], button')
        .last();
      await editBtn.click({ force: true });
      await page.waitForTimeout(1000);

      const editMenuItem = page.locator('button.mat-menu-item, [role="menuitem"], .dropdown-item').filter({ hasText: /Edit/i }).first();
      if (await editMenuItem.isVisible().catch(() => false)) {
        await editMenuItem.click({ force: true });
        await page.waitForTimeout(1000);
      }

      const dialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
      await expect(dialog).toBeVisible({ timeout: 15000 });
      const changed = await setIsActiveFalse(dialog);
      expect(changed).toBeTruthy();

      const saveBtn = await getEnabledDialogButton(dialog, /^(Update|Save|Submit)$/);
      await expect(saveBtn).toBeEnabled({ timeout: 10000 });
      await saveBtn.click({ force: true });
      await page.waitForTimeout(2000);
      await dismissSuccessPopup(page);
      await closeOfferActionSurface(page);
    } else {
      const saveBtn = page.locator('button:has-text("Update"), button:has-text("Save"), button:has-text("Submit")').filter({ visible: true }).last();
      if (await saveBtn.isVisible().catch(() => false) && await saveBtn.isEnabled().catch(() => false)) {
        await saveBtn.click({ force: true });
        await page.waitForTimeout(2000);
        await dismissSuccessPopup(page);
      }
    }

    await returnFromOfferSubPage(page);
    await ensureCampaignOfferManagementPage(page);
    await searchAndGetOfferRow(page, title);
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   */
  async function viewCreatedOffer(page, title) {
    await openOfferActionMenu(page, title);
    await clickOfferAction(page, /View/i);
    await page.waitForTimeout(2000);
    await closeOfferActionSurface(page);
    const searchInput = page.locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element').first();
    if (page.url().includes('/offer/view') || !(await searchInput.isVisible().catch(() => false))) {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
    if (!(await searchInput.isVisible().catch(() => false))) {
      const backBtn = page.locator('mat-icon.back-bt, .back-bt, mat-icon:has-text("arrow_back_ios"), img:has-text("arrow_back_ios")').first();
      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2500);
      } else {
        await closeOfferActionSurface(page);
      }
    }
    await searchAndGetOfferRow(page, title);
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   */
  async function deleteCreatedOffer(page, title) {
    await openOfferActionMenu(page, title);
    await clickOfferAction(page, /Delete/i);

    const confirmBtn = page
      .locator(
        '.swal2-popup button.swal2-confirm, ' +
        'button.swal2-confirm, ' +
        'mat-dialog-container button:has-text("Yes"), ' +
        'button:has-text("Confirm"), ' +
        'button:has-text("Delete"):not([role="menuitem"])'
      )
      .filter({ visible: true })
      .first();

    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click({ force: true });
      await page.waitForTimeout(2000);
    } else {
      await page.keyboard.press('Enter').catch(() => {});
      await page.waitForTimeout(1500);
    }

    await dismissSuccessPopup(page);
    await page.waitForTimeout(1500);

    const searchInput = page.locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.click({ force: true });
      await searchInput.fill(title);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);
    }

    const deletedRow = page.locator('mat-row, tbody tr, tr').filter({ hasText: title }).first();
    await expect(deletedRow).toHaveCount(0, { timeout: 15000 });
  }

  /**
   * @param {import("playwright-core").Page} page
   * @param {string} title
   */
  async function runCreatedOfferActions(page, title) {
    await editCreatedOffer(page, title);
    await removeFirstStoreFromSetStores(page, title);
    await deactivateFirstStoreFromManageStores(page, title);
    await viewCreatedOffer(page, title);
    await deleteCreatedOffer(page, title);
  }

  /**
   * @param {import("playwright-core").Page} page
   */
  async function openCampaignOffersPage(page) {
    await loginToApp(page);
    await goToPage(page, '#/home/campaigns');
    await page.waitForLoadState('domcontentloaded');
    await openLatestCampaignView(page);

    const openedOffers = await openOffersSection(page);
    if (!openedOffers) {
      test.skip(true, 'Campaign Offer section is not available for the selected campaign in this environment.');
    }
  }

  test('COF-00: Verify Campaign Offer management page and create action', async ({ page }) => {
    test.setTimeout(180000);

    await openCampaignOffersPage(page);

    const tableOrEmpty = page.locator('mat-table, table, mat-row, tbody tr')
      .or(page.getByText(/No\s+(Data|Records|Results)|Total\s+0\s+results/i))
      .first();
    await expect(tableOrEmpty).toBeVisible({ timeout: 20000 });

    const createButton = await getCreateCampaignOfferButton(page);
    expect(createButton).not.toBeNull();
    // @ts-ignore
    await expect(createButton).toBeVisible({ timeout: 15000 });
  });

  // ============================================================
  // COF-01: Create Percentage Campaign Offer
  // Run: npx playwright test tests/12-Campaigns/02.2-offers.spec.js -g "COF-01"
  // ============================================================
  test('COF-01: Create percentage campaign offer from Campaign View Offers', async ({ page }) => {
    test.setTimeout(420000);

    await openCampaignOffersPage(page);

    const offerTitle = `Campaign Offer ${Date.now().toString().slice(-5)}`;
    const created = await createOfferInView(page, offerTitle);
    expect(created).toBeTruthy();

    const found = await verifyOfferSearch(page, offerTitle);
    expect(found).toBeTruthy();

    await runCreatedOfferActions(page, offerTitle);
  });

  // ============================================================
  // COF-02: Create Static Campaign Offer
  // Run: npx playwright test tests/12-Campaigns/02.2-offers.spec.js -g "COF-02"
  // ============================================================
  test('COF-02: Create static campaign offer from Campaign View Offers', async ({ page }) => {
    test.setTimeout(420000);

    await openCampaignOffersPage(page);

    const offerTitle = `Static Campaign Offer ${Date.now().toString().slice(-5)}`;
    const created = await createStaticOfferInView(page, offerTitle);
    expect(created).toBeTruthy();

    const found = await verifyOfferSearch(page, offerTitle);
    expect(found).toBeTruthy();

    await runCreatedOfferActions(page, offerTitle);
  });

  // ============================================================
  // COF-03: Create Amount Discount Campaign Offer
  // Run: npx playwright test tests/12-Campaigns/02.2-offers.spec.js -g "COF-03"
  // ============================================================
  test('COF-03: Create amount discount campaign offer from Campaign View Offers', async ({ page }) => {
    test.setTimeout(420000);

    await openCampaignOffersPage(page);

    const offerTitle = `Amount Campaign Offer ${Date.now().toString().slice(-5)}`;
    const created = await createAmountOfferInView(page, offerTitle);
    expect(created).toBeTruthy();

    const found = await verifyOfferSearch(page, offerTitle);
    expect(found).toBeTruthy();

    await runCreatedOfferActions(page, offerTitle);
  });

  // ============================================================
  // COF-04: Create Store Target Type Campaign Offer
  // Run: npx playwright test tests/12-Campaigns/02.2-offers.spec.js -g "COF-04"
  // ============================================================
  test('COF-04: Create store target type campaign offer from Campaign View Offers', async ({ page }) => {
    test.setTimeout(420000);

    await openCampaignOffersPage(page);

    const offerTitle = `Store Target Offer ${Date.now().toString().slice(-5)}`;
    const created = await createTargetTypeOfferInView(page, offerTitle, 'Store');
    expect(created).toBeTruthy();

    const found = await verifyOfferSearch(page, offerTitle);
    expect(found).toBeTruthy();

    await runCreatedOfferActions(page, offerTitle);
  });

  // ============================================================
  // COF-05: Create Category Target Type Campaign Offer
  // Run: npx playwright test tests/12-Campaigns/02.2-offers.spec.js -g "COF-05"
  // ============================================================
  test('COF-05: Create category target type campaign offer from Campaign View Offers', async ({ page }) => {
    test.setTimeout(420000);

    await openCampaignOffersPage(page);

    const offerTitle = `Category Target Offer ${Date.now().toString().slice(-5)}`;
    const created = await createTargetTypeOfferInView(page, offerTitle, 'Category');
    expect(created).toBeTruthy();

    const found = await verifyOfferSearch(page, offerTitle);
    expect(found).toBeTruthy();

    await runCreatedOfferActions(page, offerTitle);
  });

  // ============================================================
  // COF-06: Create Item Target Type Campaign Offer
  // Run: npx playwright test tests/12-Campaigns/02.2-offers.spec.js -g "COF-06"
  // ============================================================
  test('COF-06: Create item target type campaign offer from Campaign View Offers', async ({ page }) => {
    test.setTimeout(420000);

    await openCampaignOffersPage(page);

    const offerTitle = `Item Target Offer ${Date.now().toString().slice(-5)}`;
    const created = await createTargetTypeOfferInView(page, offerTitle, 'Item');
    expect(created).toBeTruthy();

    const found = await verifyOfferSearch(page, offerTitle);
    expect(found).toBeTruthy();

    await runCreatedOfferActions(page, offerTitle);
  });

});
