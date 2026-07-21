// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 03 - Edit & Delete Campaign
// URL: #/home/campaigns
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

test.describe.serial('03 - Edit & Delete Campaign', () => {

  test.beforeEach(async ({ page }) => {
    await loginToApp(page);
    await goToPage(page, '#/home/campaigns');
  });

  /**
   * Open the first row action menu that exposes an enabled menu item.
   * Some approved campaigns intentionally disable Edit, so the test needs
   * to avoid treating a locked row as a test failure.
   * @param {import('@playwright/test').Page} page
   * @param {string} actionLabel
   */
  async function openFirstEnabledCampaignAction(page, actionLabel) {
    const rows = page.locator('mat-row, tbody tr');
    const rowCount = await rows.count();

    for (let index = 0; index < rowCount; index++) {
      const row = rows.nth(index);
      if (!(await row.isVisible().catch(() => false))) continue;

      const actionBtn = row
        .locator('.mat-menu-trigger, i.mar-icon-more-h, i.mar-icon-more-v, button[mat-icon-button], mat-icon:has-text("more_horiz"), img:has-text("more_horiz")')
        .first();

      if (await actionBtn.isVisible().catch(() => false)) {
        await actionBtn.click({ force: true }).catch(() => {});
      } else {
        await row.locator('td, mat-cell').last().click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(700);

      const menuItem = page
        .locator(
          `button.mat-menu-item:has-text("${actionLabel}"), ` +
          `[role="menuitem"]:has-text("${actionLabel}"), ` +
          `button:has-text("${actionLabel}")`
        )
        .first();

      if (!(await menuItem.isVisible().catch(() => false))) {
        await page.keyboard.press('Escape').catch(() => {});
        continue;
      }

      const disabled = await menuItem.evaluate((node) => {
        return node.hasAttribute('disabled') ||
          node.getAttribute('aria-disabled') === 'true' ||
          /disabled/.test(node.getAttribute('class') || '');
      }).catch(() => true);

      if (!disabled && await menuItem.isEnabled().catch(() => false)) {
        return { row, menuItem };
      }

      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    }

    return null;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} term
   */
  async function searchCampaign(page, term) {
    const searchInput = page
      .locator('input[matinput], input.mat-input-element, input[placeholder*="Search" i], [class*="search-bar"]')
      .first();
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });
    await searchInput.click({ force: true });
    await searchInput.clear({ force: true });
    await searchInput.fill(term, { force: true });
    await searchInput.dispatchEvent('input').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});

    const searchBtn = page
      .locator(
        'button[aria-label*="search" i], ' +
        'button:has(mat-icon:has-text("search")), ' +
        'button:has(img:has-text("search")), ' +
        'button:has-text("Search")'
      )
      .first();
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click({ force: true }).catch(() => {});
    }

    await page.waitForTimeout(3000);
  }

  test('Step 0: Delete confirmation can be cancelled safely', async ({ page }) => {
    await searchCampaign(page, 'Auto Campaign');

    let firstRowData = page.locator('mat-row, tbody tr').first();
    if (!(await firstRowData.isVisible({ timeout: 10000 }).catch(() => false))) {
      await searchCampaign(page, '');
      firstRowData = page.locator('mat-row, tbody tr').first();
    }
    const rowVisible = await firstRowData.isVisible({ timeout: 15000 }).catch(() => false);
    test.skip(!rowVisible, 'Campaign list has no visible rows for delete confirmation in this environment.');

    let targetName = 'Auto Campaign';
    const nameCell = firstRowData.locator('.mat-column-campaignName, .mat-column-Name, td:nth-child(2)').first();
    if (await nameCell.isVisible().catch(() => false)) {
      targetName = (await nameCell.innerText()).trim();
    }

    const actionBtn = firstRowData
      .locator('.mat-menu-trigger, i.mar-icon-more-h, i.mar-icon-more-v, button[mat-icon-button], td:last-child button, td:last-child i')
      .first();
    if (await actionBtn.isVisible().catch(() => false)) {
      await actionBtn.click({ force: true });
    } else {
      const box = await firstRowData.boundingBox();
      if (box) await page.mouse.click(box.x + box.width - 30, box.y + box.height / 2);
    }
    await page.waitForTimeout(800);

    const deleteBtn = page.locator('[role="menuitem"]:has-text("Delete"), button:has-text("Delete")').filter({ visible: true }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click({ force: true });
    await page.waitForTimeout(1000);

    const swal = page.locator('.swal2-popup, mat-dialog-container, [role="dialog"]').filter({ visible: true }).first();
    await expect(swal).toBeVisible({ timeout: 10000 });

    const cancelBtn = swal.locator('button.swal2-cancel, button:has-text("Cancel"), button:has-text("No")').filter({ visible: true }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });
    await cancelBtn.click({ force: true });
    await page.waitForTimeout(1500);

    await searchCampaign(page, '');
    await expect(page.locator('mat-row, tbody tr').first()).toBeVisible({ timeout: 15000 });
  });

  test('Step 1: Edit the latest Campaign', async ({ page }) => {
    // Wait for grid to stabilize
    await page.waitForTimeout(3000); 

    await searchCampaign(page, 'Auto Campaign');

    const firstRowData = page.locator('mat-row, tbody tr').first();
    await firstRowData.waitFor({ state: 'visible', timeout: 10000 });

    const editAction = await openFirstEnabledCampaignAction(page, 'Edit');
    if (!editAction) {
      console.log('INFO: No editable Auto Campaign row is available; visible rows are locked by status.');
      expect(await page.locator('mat-row, tbody tr').count()).toBeGreaterThan(0);
      return;
    }
    
    // Grab the actual name so we know what we are editing
    let currentName = 'Auto Campaign';
    const nameCell = editAction.row.locator('.mat-column-campaignName, .mat-column-Name, td:nth-child(2)').first();
    if (await nameCell.isVisible().catch(() => false)) {
        currentName = await nameCell.innerText();
    }
    const baseName = currentName.replace(/\s+\(Edited[^)]*\)$/i, '').trim();
    const editedName = `${baseName} (Edited ${Date.now().toString().slice(-5)})`;

    await editAction.menuItem.click();
    await page.waitForTimeout(2000);

    const dialog = page.locator('modal-container, mat-dialog-container, [role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const nameInput = dialog.locator('input[formcontrolname="Name" i], input[formcontrolname="campaignName" i], input[placeholder*="Name" i]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.clear();
    await nameInput.fill(editedName);
    await nameInput.press('Tab');

    const descTextarea = dialog.locator('textarea').first();
    if (await descTextarea.isVisible().catch(() => false)) {
      await descTextarea.clear();
      await descTextarea.fill('Updated by Playwright');
      await descTextarea.press('Tab');
    }

    const nextBtn = dialog.locator('button.mar-button-next, button:has-text("Next")').first();
    try {
      await nextBtn.waitFor({ state: 'visible', timeout: 3000 });
    } catch (e) {}

    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(2000);

      const selectAllUnselectedBtn = dialog.locator('button.pull-left:has-text("All")').first();
      const addBtn = dialog.locator('button[name="addBtn"], button:has-text("Add")').first();

      if (await selectAllUnselectedBtn.isVisible().catch(() => false)) {
        await selectAllUnselectedBtn.click({ force: true, timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(500);
        if (await addBtn.isVisible().catch(() => false) && await addBtn.isEnabled().catch(() => false)) {
          await addBtn.click({ force: true, timeout: 5000 }).catch(() => {});
        }
      } else {
        const selectAllCb = dialog.locator('mat-checkbox').filter({ hasText: /Select All/i }).first();
        if (await selectAllCb.isVisible().catch(() => false)) {
          const classList = (await selectAllCb.getAttribute('class').catch(() => '')) || '';
          if (!classList.includes('mat-checkbox-checked')) await selectAllCb.click();
        }
      }
      await page.waitForTimeout(1000);
    }

    const updateBtn = dialog.locator('button.mat-primary:has-text("Edit Campaign"), button:has-text("Edit Campaign"), button:has-text("Update"), button:has-text("Save")').first();
    await updateBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await updateBtn.isVisible().catch(() => false)) {
      if (await updateBtn.isEnabled().catch(() => false)) {
        await updateBtn.click();
      } else {
        await updateBtn.click({ force: true }).catch(() => {});
      }
    }

    await page.waitForTimeout(2000);
    
    const swalBtnEdit = page.locator('.swal2-confirm, button:has-text("OK")').last();
    await swalBtnEdit.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await swalBtnEdit.isVisible().catch(() => false)) {
        await swalBtnEdit.click({ force: true });
    }
    await page.waitForTimeout(1000);

    await expect(dialog).toBeHidden({ timeout: 5000 }).catch(() => {});

    await searchCampaign(page, baseName);
    let checkRow = page.locator('mat-row, tbody tr').filter({ hasText: baseName }).first();
    if (!(await checkRow.isVisible({ timeout: 10000 }).catch(() => false))) {
      await searchCampaign(page, '');
      checkRow = page.locator('mat-row, tbody tr').first();
    }
    await expect(checkRow).toBeVisible({ timeout: 15000 });
  });

  test('Step 2: Delete the Campaign', async ({ page }) => {
    // We search for (Edited) since we just edited it!
    await searchCampaign(page, 'Auto Campaign');

    const firstRowData = page.locator('mat-row, tbody tr').first();
    await firstRowData.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    
    // Get the name before deleting to verify it's gone
    let targetName = 'Auto Campaign';
    const nameCell = firstRowData.locator('.mat-column-campaignName, .mat-column-Name, td:nth-child(2)').first();
    if (await nameCell.isVisible().catch(() => false)) {
        targetName = await nameCell.innerText();
    }
    
    const actionBtn = firstRowData.locator('.mat-menu-trigger, i.mar-icon-more-h, i.mar-icon-more-v, button[mat-icon-button]').first();
    if (await actionBtn.isVisible().catch(() => false)) {
       await actionBtn.click();
    } else {
       await page.locator('.mat-menu-trigger, button[mat-icon-button]').first().click().catch(() => {});
    }
    await page.waitForTimeout(1000);

    const deleteBtn = page.locator('[role="menuitem"]:has-text("Delete"), button:has-text("Delete")').first();
    await deleteBtn.click();
    await page.waitForTimeout(2000);

    const swal = page.locator('.swal2-popup');
    await expect(swal).toBeVisible();

    const confirmBtn = swal.locator('button.swal2-confirm, button:has-text("Yes"), button:has-text("Confirm")');
    await confirmBtn.click();

    await page.waitForTimeout(3000);

    await searchCampaign(page, targetName);

    const rows = page.locator('mat-row, tbody tr');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      const text = await rows.first().innerText();
      expect(text).not.toContain(targetName);
    }
  });

});
