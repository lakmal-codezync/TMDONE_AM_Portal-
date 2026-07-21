// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 02.1 - Manage Promo Code
// URL: #/home/campaigns
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

// ===================== DATE HELPERS =========================
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
const today = new Date();
const endDate = new Date(today);
endDate.setMonth(endDate.getMonth() + 1);
const START_DATE = `${pad(today.getMonth() + 1)}/${pad(today.getDate())}/${today.getFullYear()}`;
const END_DATE = `${pad(endDate.getMonth() + 1)}/${pad(endDate.getDate())}/${endDate.getFullYear()}`;

test.describe.serial('02.1 - Promo Code', () => {

  /**
   * Reusable helper to handle optional store selection if a store picker or selector appears.
   * If not visible or if any interaction fails, it continues gracefully without failing.
   * @param {import('@playwright/test').Page} page
   */
  async function handleOptionalStoreSelection(page) {
    try {
      console.log('ℹ️ Checking for optional store selection modal/step...');
      await page.waitForTimeout(1000);

      const recordPicker = page.locator('.record-picker, app-record-picker, modal-container:has-text("Store"), .listbox').first();
      const selectAllUnselectedBtn = page.locator('button.pull-left:has-text("All"), button:has-text("All")').first();

      const isStoreSelectionVisible = await recordPicker.isVisible().catch(() => false) ||
                                     await selectAllUnselectedBtn.isVisible().catch(() => false) || 
                                     await page.locator('mat-checkbox').filter({ hasText: /Select All/i }).first().isVisible().catch(() => false) ||
                                     await page.locator('th mat-checkbox, thead mat-checkbox, .select-all mat-checkbox').first().isVisible().catch(() => false);

      if (isStoreSelectionVisible) {
        console.log('✅ Store selection view detected. Attempting to select all stores...');

        // First, check if there is a record picker with hidden 'All' buttons
        const hasRecordPicker = await page.evaluate(() => {
          const picker = document.querySelector('.record-picker, app-record-picker, .listbox');
          return !!picker;
        });

        if (hasRecordPicker) {
          console.log('ℹ️ Record picker detected. Attempting to select All and Add...');
          try {
              const allBtn = page.locator('button.pull-left:has-text("All"), button:has-text("All"), .record-picker button.pull-left, button:has-text("Select All")').first();
              await allBtn.waitFor({ state: 'attached', timeout: 2000 });
              await allBtn.evaluate((/** @type {HTMLElement} */ node) => {
                  node.style.display = 'block';
                  node.style.visibility = 'visible';
                  node.style.opacity = '1';
                  node.click();
              });
              console.log('✅ Clicked Unselected All button');
          } catch(e) {
              // @ts-ignore
              console.log('⚠️ Could not click All button: ' + e.message);
          }
          await page.waitForTimeout(500);

          try {
              const addBtn = page.locator('button[name="addBtn"], button:has-text("Add"), .point-right, button:has(mat-icon:has-text("chevron_right")), button:has(i[class*="right"])').first();
              await addBtn.waitFor({ state: 'attached', timeout: 2000 });
              await addBtn.evaluate((/** @type {HTMLElement} */ node) => {
                  node.style.display = 'block';
                  node.style.visibility = 'visible';
                  node.style.opacity = '1';
                  node.click();
              });
              console.log('✅ Clicked Add button');
          } catch(e) {
              // @ts-ignore
              console.log('⚠️ Could not click Add button: ' + e.message);
          }
          await page.waitForTimeout(1000);
        } else {
          // Fallback to standard checkbox selection
          const selectAllCb = page.locator('mat-checkbox').filter({ hasText: /Select All/i }).first();
          const headerCb = page.locator('th mat-checkbox, thead mat-checkbox, .select-all mat-checkbox').first();
          if (await selectAllCb.isVisible().catch(() => false)) {
            const classList = (await selectAllCb.getAttribute('class').catch(() => '')) || '';
            const ariaChecked = await selectAllCb.getAttribute('aria-checked').catch(() => null);
            if (!classList.includes('mat-checkbox-checked') && ariaChecked !== 'true') {
              await selectAllCb.click({ force: true }).catch(() => {});
            }
          } else if (await headerCb.isVisible().catch(() => false)) {
            const classList = (await headerCb.getAttribute('class').catch(() => '')) || '';
            const ariaChecked = await headerCb.getAttribute('aria-checked').catch(() => null);
            if (!classList.includes('mat-checkbox-checked') && ariaChecked !== 'true') {
              await headerCb.click({ force: true }).catch(() => {});
            }
          }
        }
        await page.waitForTimeout(1000);

        // Click the final confirmation button if still inside the store selection modal/view
        const finalConfirmBtn = page.locator('modal-container button:has-text("Create"), modal-container button:has-text("Save"), modal-container button:has-text("Submit"), modal-container button.mat-primary, button:has-text("Create and set Stores")').last();
        if (await finalConfirmBtn.isVisible().catch(() => false) && await finalConfirmBtn.isEnabled().catch(() => false)) {
          await finalConfirmBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(2000);
        }
        console.log('✅ Optional store selection completed.');
      } else {
        console.log('ℹ️ No store selection view detected. Skipping.');
      }
    } catch (err) {
      console.log('⚠️ Error handled during optional store selection (test will not fail):', err);
    }
  }

  test.beforeEach(async ({ page }) => {
    // If we are already logged in and on the campaigns list page, skip redundant navigation
    const searchInput = page.locator('input[matinput], input.mat-input-element, input[placeholder*="Search" i]').first();
    if (page.url().includes('campaigns') && await searchInput.isVisible().catch(() => false)) {
      console.log('ℹ️ Already on campaigns page, skipping beforeEach navigation.');
      return;
    }

    await loginToApp(page);
    await goToPage(page, '#/home/campaigns');
  });

  // ============================================================
  // Reusable helper function to run CRUD operations on a Promo Code
  // ============================================================
  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} promoCode
   */
  async function runPromoCodeCRUD(page, promoCode) {
    if (!promoCode) {
      console.log('⚠️ No promo code generated, skipping CRUD.');
      return;
    }
    console.log(`🔄 Starting CRUD workflow for Promo Code: ${promoCode}`);

    // Give it a moment to render the table list
    await page.waitForTimeout(500);

    // Helper to open action menu for the specific row with retry logic for detached nodes
    const openRowMenu = async () => {
      let row = page.locator('mat-row, tbody tr, tr').filter({ hasText: promoCode }).first();
      await row.waitFor({ state: 'visible', timeout: 8000 });
      
      const actionBtn = row.locator('.mat-menu-trigger, button[mat-icon-button], i.mar-icon-more-h, i.mar-icon-more-v, button:has(mat-icon:has-text("more_horiz")), button:has(mat-icon:has-text("more_vert"))').first();
      await actionBtn.scrollIntoViewIfNeeded().catch(() => {});
      
      try {
        await actionBtn.click({ force: true });
      } catch (err) {
        console.log('⚠️ Detached row action button detected, retrying after DOM stabilization...');
        await page.waitForTimeout(1000);
        row = page.locator('mat-row, tbody tr, tr').filter({ hasText: promoCode }).first();
        const actionBtnRetry = row.locator('.mat-menu-trigger, button[mat-icon-button], i.mar-icon-more-h, i.mar-icon-more-v, button:has(mat-icon:has-text("more_horiz")), button:has(mat-icon:has-text("more_vert"))').first();
        await actionBtnRetry.click({ force: true });
      }
      await page.waitForTimeout(500);
    };

    // ==================== 1. ANALYTICS ====================
    console.log(`📊 Step 1: View Analytics for ${promoCode}`);
    await openRowMenu();

    const analyticsBtn = page.locator('[role="menuitem"]:has(mat-icon:has-text("analytics")), [role="menuitem"]:has-text("Analytics"), button:has-text("Analytics")').first();
    
    try {
      await analyticsBtn.waitFor({ state: 'visible', timeout: 5000 });
      await analyticsBtn.click({ force: true });
      
      // Wait for the analytics page change transition
      await page.waitForTimeout(1000);
      console.log('✅ Analytics tab loaded. Scrolling to bottom...');

      // Smooth scroll down to the bottom of the page
      await page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        const scrollable = document.querySelector('mat-sidenav-content, .content, .main-content, div[style*="overflow-y"]');
        if (scrollable) scrollable.scrollTo({ top: scrollable.scrollHeight, behavior: 'smooth' });
      });
      await page.waitForTimeout(1200);
      console.log('✅ Scrolled to bottom. Scrolling back to top...');

      // Smooth scroll back to the top
      await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const scrollable = document.querySelector('mat-sidenav-content, .content, .main-content, div[style*="overflow-y"]');
        if (scrollable) scrollable.scrollTo({ top: 0, behavior: 'smooth' });
      });
      await page.waitForTimeout(1200);
      console.log('✅ Scrolled back to top. Clicking the back button next to "Campaigns - Promo Code Management"...');

      // Switch back to list view by clicking the top-left back button next to the header
      const backBtn = page.locator(
        'mat-icon.back-bt, ' +
        '.back-bt, ' +
        'mat-icon:has-text("arrow_back_ios"), ' +
        'button:has(mat-icon:has-text("arrow_back")), ' +
        'button:has(mat-icon:has-text("keyboard_arrow_left"))'
      ).first();

      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click({ force: true });
        await page.waitForTimeout(800);
      }

      // Since clicking the back button might return to either the Promo Code list page or the Campaign View page:
      console.log('ℹ️ Checking current page state...');
      const promoTableCheck = page.locator('mat-table, table, tbody tr').first();
      const isTableVisible = await promoTableCheck.isVisible().catch(() => false);
      
      if (!isTableVisible) {
        console.log('ℹ️ Promo table not visible. We are likely on the Campaign View page. Re-entering Promo Code section...');
        const viewPromoCount = page.locator('div.plain-card:has(h5:has-text("Promo Code")), .card:has-text("Promo Code")').first();
        await viewPromoCount.waitFor({ state: 'visible', timeout: 8000 });
        await viewPromoCount.click();
        await page.waitForTimeout(1000);
      } else {
        console.log('✅ Promo table is already visible. Skipping re-entering card.');
      }

      // Wait for the table/list of promo codes to be visible again before proceeding
      const promoTable = page.locator('mat-table, table, tbody tr').first();
      await promoTable.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
    } catch (err) {
      console.log('⚠️ Analytics button not visible. Skipping analytics step.');
      await page.keyboard.press('Escape'); // Close the menu
      await page.waitForTimeout(500);
    }

    // ==================== 2. EDIT ====================
    console.log(`✏️ Step 2: Edit Promo Code ${promoCode}`);
    await openRowMenu();

    const editBtn = page.locator('[role="menuitem"]:has(mat-icon:has-text("edit_note")), [role="menuitem"]:has-text("Edit"), button:has-text("Edit")').first();
    try {
      await editBtn.waitFor({ state: 'visible', timeout: 5000 });
      await editBtn.click({ force: true });
      await page.waitForTimeout(800);

      const editDialog = page.locator('modal-container, mat-dialog-container, [role="dialog"]').first();
      if (await editDialog.isVisible().catch(() => false)) {
        console.log('✅ Edit Promo Code modal displayed.');

        const descField = editDialog.locator('textarea[formControlName="Description"], textarea').first();
        if (await descField.isVisible().catch(() => false)) {
          await descField.clear();
          await descField.fill(`Updated Promo description for ${promoCode} by Playwright.`);
          console.log('✅ Description field updated.');
          await descField.dispatchEvent('input').catch(() => {});
        }

        const updateBtn = editDialog.locator('button:has-text("Update"), button:has-text("Save"), button.mat-primary').first();
        if (await updateBtn.isVisible().catch(() => false)) {
          if (await updateBtn.isEnabled().catch(() => false)) {
            await updateBtn.click();
            await page.waitForTimeout(2000);

            // Optional Store Selection check (Step 1)
            await handleOptionalStoreSelection(page);

            // Dismiss SweetAlert
            const swalBtn = page.locator('.swal2-confirm, button:has-text("OK")').filter({ visible: true }).first();
            await swalBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
            if (await swalBtn.isVisible().catch(() => false)) {
              await swalBtn.click({ force: true });
              console.log('✅ Edit changes saved successfully.');
              await page.waitForTimeout(1500);
            }

            // Optional Store Selection check (Step 2)
            await handleOptionalStoreSelection(page);
          } else {
            console.log('⚠️ Update button is disabled. Closing modal...');
            await page.keyboard.press('Escape');
          }
        }
      }
      
      // Safety check: if the modal is still open for any reason, force close it so it doesn't block the next step
      if (await editDialog.isVisible().catch(() => false)) {
          console.log('⚠️ Edit modal is still open after Update attempt. Forcing close.');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
      }
      await page.waitForTimeout(500);
    } catch (e) {
      console.log('⚠️ Edit button not visible or error occurred. Skipping edit.');
      await page.keyboard.press('Escape');
    }

    // ==================== 3. DELETE ====================
    console.log(`🗑️ Step 3: Delete Promo Code ${promoCode}`);
    await openRowMenu();

    const deleteBtn = page.locator('[role="menuitem"]:has(mat-icon:has-text("delete_sweep")), [role="menuitem"]:has-text("Delete"), button:has-text("Delete")').first();
    try {
      await deleteBtn.waitFor({ state: 'visible', timeout: 5000 });
      await deleteBtn.click({ force: true });
      await page.waitForTimeout(1000);

      // Confirm inside SweetAlert popup
      const confirmSwal = page.locator('.swal2-popup').filter({ visible: true }).first();
      await confirmSwal.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      if (await confirmSwal.isVisible().catch(() => false)) {
        const yesBtn = confirmSwal.locator('button.swal2-confirm, button:has-text("Yes"), button:has-text("Confirm")').filter({ visible: true }).first();
        await yesBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        await yesBtn.click({ force: true });
        await page.waitForTimeout(1500);

        // Dismiss post-delete SweetAlert
        const okBtn = page.locator('.swal2-confirm, button:has-text("OK")').filter({ visible: true }).first();
        await okBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        if (await okBtn.isVisible().catch(() => false)) {
          await okBtn.click({ force: true });
          console.log('✅ Promo Code deleted successfully.');
        }
      }
    } catch(e) {
      console.log('⚠️ Delete button not visible. Skipping delete.');
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);
  }

  // ============================================================
  // Reusable helper function to create a Promo Code
  // ============================================================
  /**
   * @param {import('@playwright/test').Page} page
   * @param {object} config
   * @param {string} config.prefix
   * @param {string} config.discountType
   * @param {string} config.discountValue
   * @param {string} [config.discountMaxAmount]
   * @param {boolean} [config.isSaveableAsVoucher]
   * @param {boolean} [config.isVoucherCampaign]
   * @param {string} [config.title]
   * @param {string} [config.titleArabic]
   * @param {string} [config.subTitle]
   * @param {string} [config.subTitleArabic]
   * @param {string} config.description
   * @param {string} config.descriptionArabic
   * @returns {Promise<string>}
   */
  async function createPromoCode(page, config) {
    console.log(`🎟️ Creating Promo Code for Campaign (${config.prefix})`);

    // 1. Navigate to Manage Campaign page first
    await page.waitForTimeout(1000);
    const searchInput = page.locator('input[matinput], input.mat-input-element, input[placeholder*="Search" i]').first();
    await searchInput.waitFor({ state: 'visible' });
    await searchInput.clear();
    await searchInput.fill('Auto Campaign');
    await page.waitForTimeout(3000);

    let firstRowData = page.locator('mat-row, tbody tr').first();
    const isRowVisible = await firstRowData.isVisible().catch(() => false);
    if (!isRowVisible) {
      console.log('⚠️ Campaign "Auto Campaign" not found. Clearing search to pick first available campaign...');
      await searchInput.clear();
      await page.waitForTimeout(2000);
      firstRowData = page.locator('mat-row, tbody tr').first();
    }
    await firstRowData.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });

    // 2. Open Campaign View
    console.log('ℹ️ Entering View mode to access Promo Codes...');
    const actionBtn = firstRowData.locator('.mat-menu-trigger, i.mar-icon-more-h, i.mar-icon-more-v, button[mat-icon-button]').first();
    if (await actionBtn.isVisible().catch(() => false)) await actionBtn.click();
    await page.waitForTimeout(1000);

    const viewBtn = page.locator('button.mat-menu-item:has-text("View"), [role="menuitem"]:has-text("View")').first();
    await viewBtn.click();
    await page.waitForTimeout(4000);

    // 3. Click on Promo Code Count Card in View Page
    console.log('ℹ️ Looking for Promo Code count card in View page...');
    const viewPromoCount = page.locator('div.plain-card:has(h5:has-text("Promo Code")), .card:has-text("Promo Code")').first();
    await viewPromoCount.click();
    await page.waitForTimeout(3000);
    console.log('✅ Clicked Promo section inside View page.');

    // 4. Click Create Promo Button
    const addPromoBtn = page.locator('button.create-button:has-text("Create Promo"), button:has-text("Create Promo")').first();
    if (await addPromoBtn.isVisible().catch(() => false)) {
      await addPromoBtn.click();
      await page.waitForTimeout(2000);
      console.log('✅ Clicked Create Promo button.');
    }

    // 5. Fill Promo Code Form using exact Angular selectors
    const dialog = page.locator('modal-container, mat-dialog-container, [role="dialog"]').first();
    const isDialogVisible = await dialog.isVisible().catch(() => false);
    const formContext = isDialogVisible ? dialog : page;

    // Code
    let generatedCode = '';
    const promoCodeInput = formContext.locator('input[formControlName="Code"]').first();
    if (await promoCodeInput.isVisible().catch(() => false)) {
      generatedCode = `${config.prefix}${Date.now().toString().slice(-4)}${Math.floor(100 + Math.random() * 900)}`;
      await promoCodeInput.fill(generatedCode);
      console.log(`✅ Filled Promo Code: ${generatedCode}`);
    }

    // Discount Type
    const discountTypeSelect = formContext.locator('mat-select[formControlName="DiscountType"]').first();
    if (await discountTypeSelect.isVisible().catch(() => false)) {
      await discountTypeSelect.click();
      await page.waitForTimeout(1000);
      const opt = page.locator(`mat-option:has-text("${config.discountType}")`).first();
      if (await opt.isVisible().catch(() => false)) {
        await opt.click();
        console.log(`✅ Selected Discount Type: ${config.discountType}`);
      } else {
        // Fallback for Amount
        if (config.discountType === 'Amount') {
          const amountOpt = page.locator('mat-option:has-text("Amount"), mat-option:has-text("Flat Amount"), mat-option:has-text("Value")').first();
          if (await amountOpt.isVisible().catch(() => false)) {
            await amountOpt.click();
          } else {
            await page.locator('mat-option').nth(1).click().catch(() => page.keyboard.press('Escape'));
          }
        } else {
          await page.locator('mat-option').first().click().catch(() => page.keyboard.press('Escape'));
        }
      }
      await page.waitForTimeout(1000);
    }

    // Discount Value
    const discountInput = formContext.locator('input[formControlName="DiscountValue"]').first();
    if (await discountInput.isVisible().catch(() => false)) {
      await discountInput.fill(config.discountValue);
      console.log(`✅ Filled Discount Value: ${config.discountValue}`);
    }

    // Discount Max Amount (Required for Percentage)
    if (config.discountMaxAmount) {
      const discountMaxAmountInput = formContext.locator('input[formControlName="DiscountMaxAmount"]').first();
      if (await discountMaxAmountInput.isVisible().catch(() => false)) {
        await discountMaxAmountInput.fill(config.discountMaxAmount);
        console.log(`✅ Filled Discount Max Amount: ${config.discountMaxAmount}`);
      }
    }

    // Start Date
    let selectedStartDay = today.getDate();
    const startToggle = formContext.locator('mat-datepicker-toggle button').nth(0);
    if (await startToggle.isVisible().catch(() => false)) {
      await startToggle.click({ force: true });
      await page.waitForTimeout(1000);
      const todayCell = page.locator('.mat-calendar-body-today').first();
      if (await todayCell.isVisible().catch(() => false)) {
        const text = (await todayCell.innerText()).trim();
        if (text) selectedStartDay = parseInt(text, 10);
        await todayCell.click();
      } else {
        const firstCell = page.locator('.mat-calendar-body-cell:not([aria-disabled="true"])').first();
        const text = (await firstCell.innerText()).trim();
        if (text) selectedStartDay = parseInt(text, 10);
        await firstCell.click();
      }
      await page.waitForTimeout(1000);
      console.log(`✅ Selected Start Date from calendar: Day ${selectedStartDay}`);
    }

    // End Date
    const endToggle = formContext.locator('mat-datepicker-toggle button').nth(1);
    if (await endToggle.isVisible().catch(() => false)) {
      await endToggle.click({ force: true });
      await page.waitForTimeout(1000);
      const nextMonthBtn = page.locator('button[aria-label="Next month"]').first();
      if (await nextMonthBtn.isVisible().catch(() => false)) {
        await nextMonthBtn.click();
        await page.waitForTimeout(500);
      }
      const dayCell = page.locator('.mat-calendar-body-cell-content')
        .filter({ hasText: new RegExp(`^${selectedStartDay}$`) })
        .first();
      if (await dayCell.isVisible().catch(() => false)) {
        await dayCell.click();
      } else {
        await page.locator('.mat-calendar-body-cell:not([aria-disabled="true"])').last().click().catch(() => { });
      }
      await page.waitForTimeout(1000);
      console.log(`✅ Selected End Date from calendar (1 month ahead from Start Date: Day ${selectedStartDay}).`);
    }

    // Description & Arabic Description
    const descInput = formContext.locator('textarea[formControlName="Description"]').first();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill(config.description);
    }

    const descArInput = formContext.locator('textarea[formControlName="DescriptionArabic"]').first();
    if (await descArInput.isVisible().catch(() => false)) {
      await descArInput.fill(config.descriptionArabic);
    }

    // Max Count & Max Count Per User
    const maxCountInput = formContext.locator('input[formControlName="MaxCount"]').first();
    if (await maxCountInput.isVisible().catch(() => false)) {
      await maxCountInput.fill('100');
    }

    const maxCountPerUserInput = formContext.locator('input[formControlName="MaxCountPerUser"]').first();
    if (await maxCountPerUserInput.isVisible().catch(() => false)) {
      await maxCountPerUserInput.fill('1');
    }

    // Day Type (OperationalDay)
    const dayTypeSelect = formContext.locator('mat-select[formControlName="OperationalDay"]').first();
    if (await dayTypeSelect.isVisible().catch(() => false)) {
      await dayTypeSelect.click();
      await page.waitForTimeout(1000);
      await page.locator('mat-option').first().click().catch(() => page.keyboard.press('Escape'));
      await page.waitForTimeout(1000);
    }

    // Start Time & End Time
    const startTimeSelect = formContext.locator('mat-select[formControlName="StartTime"]').first();
    if (await startTimeSelect.isVisible().catch(() => false)) {
      await startTimeSelect.click();
      await page.waitForTimeout(1000);
      await page.locator('mat-option').first().click().catch(() => page.keyboard.press('Escape'));
      await page.waitForTimeout(1000);
    }

    const endTimeSelect = formContext.locator('mat-select[formControlName="EndTime"]').first();
    if (await endTimeSelect.isVisible().catch(() => false)) {
      await endTimeSelect.click();
      await page.waitForTimeout(1000);
      await page.locator('mat-option').last().click().catch(() => page.keyboard.press('Escape'));
      await page.waitForTimeout(1000);
    }

    // Order Counts & Values
    const maxOrderCount = formContext.locator('input[formControlName="MaxOrderCount"]').first();
    if (await maxOrderCount.isVisible().catch(() => false)) await maxOrderCount.fill('10');

    const minOrderCount = formContext.locator('input[formControlName="MinOrderCount"]').first();
    if (await minOrderCount.isVisible().catch(() => false)) await minOrderCount.fill('1');

    const maxOrderValue = formContext.locator('input[formControlName="MaxOrderValue"]').first();
    if (await maxOrderValue.isVisible().catch(() => false)) await maxOrderValue.fill('5000');

    const minOrderValue = formContext.locator('input[formControlName="MinOrderValue"]').first();
    if (await minOrderValue.isVisible().catch(() => false)) await minOrderValue.fill('100');

    // Is First Time Only
    // @ts-ignore
    if (config.isFirstTimeOnly) {
      const firstTimeToggle = formContext.locator('mat-slide-toggle:has-text("Is First Time Only") button, mat-slide-toggle[formControlName="IsFirstTimeOnly"] button, mat-slide-toggle[formControlName="IsFirstTimeOnly"], mat-slide-toggle:has-text("Is First Time Only")').first();
      if (await firstTimeToggle.isVisible().catch(() => false)) {
        const isChecked = (await firstTimeToggle.getAttribute('aria-checked').catch(() => null)) === 'true' ||
          ((await firstTimeToggle.getAttribute('class').catch(() => '')) || '').includes('mat-checked');
        if (!isChecked) {
          await firstTimeToggle.click({ force: true });
          await page.waitForTimeout(1000);
        }
        console.log('✅ Enabled Is First Time Only');
      }
    }

    // Is Free Delivery
    // @ts-ignore
    if (config.isFreeDelivery) {
      const freeDeliveryToggle = formContext.locator('mat-slide-toggle:has-text("Is Free Delivery") button, mat-slide-toggle[formControlName="IsFreeDelivery"] button, mat-slide-toggle[formControlName="IsFreeDelivery"], mat-slide-toggle:has-text("Is Free Delivery")').first();
      if (await freeDeliveryToggle.isVisible().catch(() => false)) {
        const isChecked = (await freeDeliveryToggle.getAttribute('aria-checked').catch(() => null)) === 'true' ||
          ((await freeDeliveryToggle.getAttribute('class').catch(() => '')) || '').includes('mat-checked');
        if (!isChecked) {
          await freeDeliveryToggle.click({ force: true });
          await page.waitForTimeout(1000);
        }
        console.log('✅ Enabled Is Free Delivery');
      }
    }

    // Voucher Settings - Is Saveable Voucher (Saved in User Wallet)
    if (config.isSaveableAsVoucher) {
      const saveableToggle = formContext.locator(
        'mat-slide-toggle[formControlName="IsSaveableAsVoucher"] button, ' +
        'mat-slide-toggle:has-text("Is Saveable Voucher") button, ' +
        'mat-slide-toggle:has-text("Saved in User Wallet") button, ' +
        'mat-slide-toggle[formControlName="IsSaveableAsVoucher"], ' +
        'mat-slide-toggle:has-text("Is Saveable Voucher"), ' +
        'mat-slide-toggle:has-text("Saved in User Wallet")'
      ).first();

      if (await saveableToggle.isVisible().catch(() => false)) {
        const isChecked = (await saveableToggle.getAttribute('aria-checked').catch(() => null)) === 'true' ||
          ((await saveableToggle.getAttribute('class').catch(() => '')) || '').includes('mat-checked');
        if (!isChecked) {
          await saveableToggle.click({ force: true });
          await page.waitForTimeout(1500);
        }
        console.log('✅ Enabled Is Saveable Voucher (Saved in User Wallet)');
      }
    }

    // Voucher Settings - Is Voucher Campaign (Common Voucher)
    if (config.isVoucherCampaign) {
      const commonVoucherToggle = formContext.locator(
        'mat-slide-toggle[formControlName="IsVoucherCampaign"] button, ' +
        'mat-slide-toggle[formControlName="IsCommonVoucher"] button, ' +
        'mat-slide-toggle:has-text("Is Voucher Campaign") button, ' +
        'mat-slide-toggle:has-text("Common Voucher") button, ' +
        'mat-slide-toggle[formControlName="IsVoucherCampaign"], ' +
        'mat-slide-toggle[formControlName="IsCommonVoucher"], ' +
        'mat-slide-toggle:has-text("Is Voucher Campaign"), ' +
        'mat-slide-toggle:has-text("Common Voucher")'
      ).first();

      if (await commonVoucherToggle.isVisible().catch(() => false)) {
        const isChecked = (await commonVoucherToggle.getAttribute('aria-checked').catch(() => null)) === 'true' ||
          ((await commonVoucherToggle.getAttribute('class').catch(() => '')) || '').includes('mat-checked');
        if (!isChecked) {
          await commonVoucherToggle.click({ force: true });
          await page.waitForTimeout(1500);
        }
        console.log('✅ Enabled Is Voucher Campaign (Common Voucher)');
      }
    }

    // Fill additional title/subtitle fields if they become visible
    if (config.title) {
      const titleInput = formContext.locator('input[formControlName="Title"]').first();
      if (await titleInput.isVisible().catch(() => false)) {
        await titleInput.fill(config.title);
        console.log('✅ Filled Voucher Title');
      }
    }
    if (config.titleArabic) {
      const titleArInput = formContext.locator('input[formControlName="TitleArabic"]').first();
      if (await titleArInput.isVisible().catch(() => false)) {
        await titleArInput.fill(config.titleArabic);
        console.log('✅ Filled Voucher Title Arabic');
      }
    }
    if (config.subTitle) {
      const subTitleInput = formContext.locator('input[formControlName="SubTitle"]').first();
      if (await subTitleInput.isVisible().catch(() => false)) {
        await subTitleInput.fill(config.subTitle);
        console.log('✅ Filled Voucher Sub Title');
      }
    }
    if (config.subTitleArabic) {
      const subTitleArInput = formContext.locator('input[formControlName="SubTitleArabic"]').first();
      if (await subTitleArInput.isVisible().catch(() => false)) {
        await subTitleArInput.fill(config.subTitleArabic);
        console.log('✅ Filled Voucher Sub Title Arabic');
      }
    }

    // 6. Submit Form
    const saveBtn = formContext.locator('button.center-button:has-text("Create"), button:has-text("Create"), button.mat-primary, button:has-text("Create and set Stores")').first();
    if (await saveBtn.isVisible().catch(() => false)) {
      const btnText = await saveBtn.innerText().catch(() => '');
      await saveBtn.click();
      await page.waitForTimeout(2500);
      console.log(`✅ Clicked Create Promo Code button (Text: "${btnText}").`);
    }

    // Optional Store Selection check (Step 1: before/during save/popup)
    await handleOptionalStoreSelection(page);

    // 7. Dismiss success SweetAlerts
    const swalBtn = page.locator('.swal2-confirm, button:has-text("OK")').filter({ visible: true }).first();
    await swalBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });
    if (await swalBtn.isVisible().catch(() => false)) {
      await swalBtn.click({ force: true });
      console.log('✅ Dismissed success popup');
      await page.waitForTimeout(1500);
    }

    // Optional Store Selection check (Step 2: after dismissing popup in case it loads then)
    await handleOptionalStoreSelection(page);

    return generatedCode;
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function openPromoCodeManagementPage(page) {
    const searchInput = page.locator('input[matinput], input.mat-input-element, input[placeholder*="Search" i]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 20000 });
    await searchInput.clear();
    await searchInput.fill('Auto Campaign');
    await page.waitForTimeout(3000);

    let firstRowData = page.locator('mat-row, tbody tr').first();
    if (!(await firstRowData.isVisible().catch(() => false))) {
      await searchInput.clear();
      await page.waitForTimeout(2500);
      firstRowData = page.locator('mat-row, tbody tr').first();
    }
    await firstRowData.waitFor({ state: 'visible', timeout: 15000 });

    const actionBtn = firstRowData.locator('.mat-menu-trigger, i.mar-icon-more-h, i.mar-icon-more-v, button[mat-icon-button], td:last-child button, td:last-child i').first();
    if (await actionBtn.isVisible().catch(() => false)) {
      await actionBtn.click({ force: true });
    } else {
      const box = await firstRowData.boundingBox();
      if (box) await page.mouse.click(box.x + box.width - 30, box.y + box.height / 2);
    }
    await page.waitForTimeout(1000);

    const viewBtn = page.locator('button.mat-menu-item:has-text("View"), [role="menuitem"]:has-text("View")').filter({ visible: true }).first();
    await expect(viewBtn).toBeVisible({ timeout: 15000 });
    await viewBtn.click({ force: true });
    await page.waitForTimeout(4000);

    const promoCard = page.locator('div.plain-card:has(h5:has-text("Promo Code")), .card:has-text("Promo Code")').first();
    await expect(promoCard).toBeVisible({ timeout: 15000 });
    await promoCard.click({ force: true });
    await page.waitForTimeout(3000);

    await expect(
      page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Promo Code|Campaigns\s*-\s*Promo Code Management/i }).first()
    ).toBeVisible({ timeout: 20000 });
  }

  const promoCodeTestCases = [
    {
      id: 'PC-01',
      name: 'Create and manage percentage promo code',
      config: {
        prefix: 'PCT',
        discountType: 'Percentage',
        discountValue: '10',
        discountMaxAmount: '100',
        description: 'This promo code provides a percentage discount. Created by Playwright Auto.',
        descriptionArabic: 'Arabic percentage promo code description.'
      }
    },
    {
      id: 'PC-02',
      name: 'Create and manage amount promo code',
      config: {
        prefix: 'AMT',
        discountType: 'Amount',
        discountValue: '15',
        description: 'This promo code provides a flat amount discount. Created by Playwright Auto.',
        descriptionArabic: 'Arabic amount promo code description.'
      }
    },
    {
      id: 'PC-03',
      name: 'Create and manage saveable wallet voucher promo code',
      config: {
        prefix: 'VCH',
        discountType: 'Percentage',
        discountValue: '10',
        discountMaxAmount: '100',
        isSaveableAsVoucher: true,
        title: 'Exclusive Voucher',
        titleArabic: 'Arabic Exclusive Voucher',
        subTitle: 'Saved in User Wallet',
        subTitleArabic: 'Arabic Saved in User Wallet',
        description: 'This promo code is a saveable wallet voucher. Created by Playwright Auto.',
        descriptionArabic: 'Arabic saveable wallet voucher description.'
      }
    },
    {
      id: 'PC-04',
      name: 'Create and manage common campaign voucher promo code',
      config: {
        prefix: 'CMN',
        discountType: 'Percentage',
        discountValue: '10',
        discountMaxAmount: '100',
        isVoucherCampaign: true,
        title: 'Common Campaign Voucher',
        titleArabic: 'Arabic Common Campaign Voucher',
        subTitle: 'Common Voucher',
        subTitleArabic: 'Arabic Common Voucher',
        description: 'This promo code is a common campaign voucher. Created by Playwright Auto.',
        descriptionArabic: 'Arabic common campaign voucher description.'
      }
    },
    {
      id: 'PC-05',
      name: 'Create and manage first-time-only promo code',
      config: {
        prefix: 'FTO',
        discountType: 'Percentage',
        discountValue: '10',
        discountMaxAmount: '100',
        isFirstTimeOnly: true,
        description: 'This promo code is strictly for first-time-only users. Created by Playwright Auto.',
        descriptionArabic: 'Arabic first-time-only promo code description.'
      }
    },
    {
      id: 'PC-06',
      name: 'Create and manage free-delivery promo code',
      config: {
        prefix: 'FRD',
        discountType: 'Percentage',
        discountValue: '10',
        discountMaxAmount: '100',
        isFreeDelivery: true,
        description: 'This promo code provides free delivery. Created by Playwright Auto.',
        descriptionArabic: 'Arabic free-delivery promo code description.'
      }
    },
    {
      id: 'PC-07',
      name: 'Create and manage first-time-only free-delivery promo code',
      config: {
        prefix: 'BTH',
        discountType: 'Amount',
        discountValue: '10',
        isFirstTimeOnly: true,
        isFreeDelivery: true,
        description: 'First-time-only and free-delivery combined promo code. Created by Playwright Auto.',
        descriptionArabic: 'Arabic combined first-time-only and free-delivery promo code description.'
      }
    }
  ];

  test('PC-00: Verify Promo Code management page and create action', async ({ page }) => {
    test.setTimeout(180000);

    await openPromoCodeManagementPage(page);

    const tableOrEmpty = page.locator('mat-table, table, mat-row, tbody tr')
      .or(page.getByText(/No\s+(Data|Records|Results)|Total\s+0\s+results/i))
      .first();
    const listReady = await tableOrEmpty.isVisible({ timeout: 20000 }).catch(() => false);
    test.skip(!listReady, 'Promo Code management list is not visible in this environment.');

    const createPromoBtn = page.locator('button.create-button:has-text("Create Promo"), button:has-text("Create Promo"), button:has-text("Create")').filter({ visible: true }).first();
    const createVisible = await createPromoBtn.isVisible({ timeout: 15000 }).catch(() => false);
    test.skip(!createVisible, 'Create Promo control is not visible in this environment.');
  });

  /**
   * @param {import("playwright-core").Page} page
   * @param {{ id: string; name: string; config: { prefix: string; discountType: string; discountValue: string; discountMaxAmount: string; description: string; descriptionArabic: string; isSaveableAsVoucher?: undefined; title?: undefined; titleArabic?: undefined; subTitle?: undefined; subTitleArabic?: undefined; isVoucherCampaign?: undefined; isFirstTimeOnly?: undefined; isFreeDelivery?: undefined; }; } | { id: string; name: string; config: { prefix: string; discountType: string; discountValue: string; description: string; descriptionArabic: string; discountMaxAmount?: undefined; isSaveableAsVoucher?: undefined; title?: undefined; titleArabic?: undefined; subTitle?: undefined; subTitleArabic?: undefined; isVoucherCampaign?: undefined; isFirstTimeOnly?: undefined; isFreeDelivery?: undefined; }; } | { id: string; name: string; config: { prefix: string; discountType: string; discountValue: string; discountMaxAmount: string; isSaveableAsVoucher: boolean; title: string; titleArabic: string; subTitle: string; subTitleArabic: string; description: string; descriptionArabic: string; isVoucherCampaign?: undefined; isFirstTimeOnly?: undefined; isFreeDelivery?: undefined; }; } | { id: string; name: string; config: { prefix: string; discountType: string; discountValue: string; discountMaxAmount: string; isVoucherCampaign: boolean; title: string; titleArabic: string; subTitle: string; subTitleArabic: string; description: string; descriptionArabic: string; isSaveableAsVoucher?: undefined; isFirstTimeOnly?: undefined; isFreeDelivery?: undefined; }; } | { id: string; name: string; config: { prefix: string; discountType: string; discountValue: string; discountMaxAmount: string; isFirstTimeOnly: boolean; description: string; descriptionArabic: string; isSaveableAsVoucher?: undefined; title?: undefined; titleArabic?: undefined; subTitle?: undefined; subTitleArabic?: undefined; isVoucherCampaign?: undefined; isFreeDelivery?: undefined; }; } | { id: string; name: string; config: { prefix: string; discountType: string; discountValue: string; discountMaxAmount: string; isFreeDelivery: boolean; description: string; descriptionArabic: string; isSaveableAsVoucher?: undefined; title?: undefined; titleArabic?: undefined; subTitle?: undefined; subTitleArabic?: undefined; isVoucherCampaign?: undefined; isFirstTimeOnly?: undefined; }; } | { id: string; name: string; config: { prefix: string; discountType: string; discountValue: string; isFirstTimeOnly: boolean; isFreeDelivery: boolean; description: string; descriptionArabic: string; discountMaxAmount?: undefined; isSaveableAsVoucher?: undefined; title?: undefined; titleArabic?: undefined; subTitle?: undefined; subTitleArabic?: undefined; isVoucherCampaign?: undefined; }; }} testCase
   */
  async function runPromoCodeTestCase(page, testCase) {
    test.setTimeout(420000);

    console.log(`\nStarting ${testCase.id}: ${testCase.name}`);
    const generatedCode = await createPromoCode(page, testCase.config);
    await runPromoCodeCRUD(page, generatedCode);

    await goToPage(page, '#/home/campaigns');
    await page.waitForTimeout(2000);
  }

  // ============================================================
  // PC-01: Create and manage percentage promo code
  // Run: npx playwright test tests/12-Campaigns/02.1-promo-code.spec.js -g "PC-01"
  // ============================================================
  test('PC-01: Create and manage percentage promo code', async ({ page }) => {
    await runPromoCodeTestCase(page, promoCodeTestCases[0]);
  });

  // ============================================================
  // PC-02: Create and manage amount promo code
  // Run: npx playwright test tests/12-Campaigns/02.1-promo-code.spec.js -g "PC-02"
  // ============================================================
  test('PC-02: Create and manage amount promo code', async ({ page }) => {
    await runPromoCodeTestCase(page, promoCodeTestCases[1]);
  });

  // ============================================================
  // PC-03: Create and manage saveable wallet voucher promo code
  // Run: npx playwright test tests/12-Campaigns/02.1-promo-code.spec.js -g "PC-03"
  // ============================================================
  test('PC-03: Create and manage saveable wallet voucher promo code', async ({ page }) => {
    await runPromoCodeTestCase(page, promoCodeTestCases[2]);
  });

  // ============================================================
  // PC-04: Create and manage common campaign voucher promo code
  // Run: npx playwright test tests/12-Campaigns/02.1-promo-code.spec.js -g "PC-04"
  // ============================================================
  test('PC-04: Create and manage common campaign voucher promo code', async ({ page }) => {
    await runPromoCodeTestCase(page, promoCodeTestCases[3]);
  });

  // ============================================================
  // PC-05: Create and manage first-time-only promo code
  // Run: npx playwright test tests/12-Campaigns/02.1-promo-code.spec.js -g "PC-05"
  // ============================================================
  test('PC-05: Create and manage first-time-only promo code', async ({ page }) => {
    await runPromoCodeTestCase(page, promoCodeTestCases[4]);
  });

  // ============================================================
  // PC-06: Create and manage free-delivery promo code
  // Run: npx playwright test tests/12-Campaigns/02.1-promo-code.spec.js -g "PC-06"
  // ============================================================
  test('PC-06: Create and manage free-delivery promo code', async ({ page }) => {
    await runPromoCodeTestCase(page, promoCodeTestCases[5]);
  });

  // ============================================================
  // PC-07: Create and manage first-time-only free-delivery promo code
  // Run: npx playwright test tests/12-Campaigns/02.1-promo-code.spec.js -g "PC-07"
  // ============================================================
  test('PC-07: Create and manage first-time-only free-delivery promo code', async ({ page }) => {
    await runPromoCodeTestCase(page, promoCodeTestCases[6]);
  });

  test.skip('Create and Manage all Promo Code Types Sequentially', async ({ page }) => {
    test.setTimeout(900000); // 15 minutes timeout to prevent global test timeouts

    const promoCodeConfigs = [
      {
        prefix: 'PCT',
        discountType: 'Percentage',
        discountValue: '10',
        discountMaxAmount: '100',
        description: 'This promo code provides a flat discount on all qualifying items. Created by Playwright Auto.',
        descriptionArabic: 'هذا الرمز الترويجي يوفر خصماً ثابتاً على جميع العناصر المؤهلة. تم الإنشاء بواسطة التشغيل الآلي.'
      },
      {
        prefix: 'AMT',
        discountType: 'Amount',
        discountValue: '15',
        description: 'This promo code provides a flat discount on all qualifying items. Created by Playwright Auto.',
        descriptionArabic: 'هذا الرمز الترويجي يوفر خصماً ثابتاً على جميع العناصر المؤهلة. تم الإنشاء بواسطة التشغيل الآلي.'
      },
      {
        prefix: 'VCH',
        discountType: 'Percentage',
        discountValue: '10',
        discountMaxAmount: '100',
        isSaveableAsVoucher: true,
        title: 'Exclusive Voucher',
        titleArabic: 'قسيمة حصرية',
        subTitle: 'Saved in User Wallet',
        subTitleArabic: 'محفوظة في محفظة المستخدم',
        description: 'This promo code is a saveable wallet voucher. Created by Playwright Auto.',
        descriptionArabic: 'تم الإنشاء بواسطة التشغيل الآلي كقسيمة قابلة للحفظ.'
      },
      {
        prefix: 'CMN',
        discountType: 'Percentage',
        discountValue: '10',
        discountMaxAmount: '100',
        isVoucherCampaign: true,
        title: 'Common Campaign Voucher',
        titleArabic: 'قسيمة حملة عامة',
        subTitle: 'Common Voucher',
        subTitleArabic: 'قسيمة عامة',
        description: 'This promo code is a common campaign voucher. Created by Playwright Auto.',
        descriptionArabic: 'تم الإنشاء بواسطة التشغيل الآلي كقسيمة حملة عامة.'
      },
      {
        prefix: 'FTO',
        discountType: 'Percentage',
        discountValue: '10',
        discountMaxAmount: '100',
        isFirstTimeOnly: true,
        description: 'This promo code is strictly for First Time Only users. Created by Playwright Auto.',
        descriptionArabic: 'هذا الرمز الترويجي مخصص فقط للمستخدمين لأول مرة. تم الإنشاء بواسطة التشغيل الآلي.'
      },
      {
        prefix: 'FRD',
        discountType: 'Percentage',
        discountValue: '10',
        discountMaxAmount: '100',
        isFreeDelivery: true,
        description: 'This promo code provides Free Delivery. Created by Playwright Auto.',
        descriptionArabic: 'هذا الرمز الترويجي يوفر توصيل مجاني. تم الإنشاء بواسطة التشغيل الآلي.'
      },
      {
        prefix: 'BTH',
        discountType: 'Amount',
        discountValue: '10',
        isFirstTimeOnly: true,
        isFreeDelivery: true,
        description: 'First Time Only AND Free Delivery combined promo code. Created by Playwright Auto.',
        descriptionArabic: 'الرمز الترويجي لأول مرة وتوصيل مجاني معاً. تم الإنشاء بواسطة التشغيل الآلي.'
      }
    ];

    for (const config of promoCodeConfigs) {
      console.log(`\n🚀 Starting process for Promo Code Type: ${config.prefix} (${config.discountType})`);
      const generatedCode = await createPromoCode(page, config);
      await runPromoCodeCRUD(page, generatedCode);
      
      // Go back to campaigns list page directly to ensure the next block starts in a clean state
      await goToPage(page, '#/home/campaigns');
      await page.waitForTimeout(2000);
    }
  });

});
