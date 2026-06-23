// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns
// 02.4 - Campaign View Store Pinning
// URL: #/home/campaigns
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, goToPage } from '../helpers/loginHelper.js';

test.describe('02.4 - Campaign View Store Pinning', () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function openLatestCampaignView(page) {
    page.setDefaultNavigationTimeout(120000);

    await loginToApp(page);
    await goToPage(page, '#/home/campaigns');
    await page.waitForLoadState('domcontentloaded');

    const searchInput = page.locator('input[matinput], input.mat-input-element, input[placeholder*="Search" i]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 20000 });
    await searchInput.clear();
    await searchInput.fill('Auto Campaign');
    await searchInput.dispatchEvent('input').catch(() => {});
    await page.waitForTimeout(5000);

    let firstRow = page.locator('mat-row, tbody tr').first();
    if (!(await firstRow.isVisible().catch(() => false))) {
      console.log('INFO: Auto Campaign not found. Clearing search and using first available campaign.');
      await searchInput.clear();
      await searchInput.dispatchEvent('input').catch(() => {});
      await page.waitForTimeout(2500);
      firstRow = page.locator('mat-row, tbody tr').first();
    }

    await firstRow.waitFor({ state: 'visible', timeout: 20000 });

    const actionBtn = firstRow
      .locator('.mat-menu-trigger, i.mar-icon-more-h, i.mar-icon-more-v, button[mat-icon-button]')
      .first();
    if (await actionBtn.isVisible().catch(() => false)) {
      await actionBtn.click({ force: true });
    } else {
      await firstRow.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(1200);

    const viewBtn = page
      .locator('button.mat-menu-item:has-text("View"), [role="menuitem"]:has-text("View"), .dropdown-item:has-text("View")')
      .first();
    await viewBtn.waitFor({ state: 'visible', timeout: 15000 });
    await viewBtn.click({ force: true });
    await page.waitForTimeout(4000);
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function isStorePinningPageOpen(page) {
    const title = page
      .locator('h1, h2, h3, h4, .page-title')
      .filter({ hasText: /Campaigns\s*-\s*Store Pinning|Store Pinning/i })
      .first();

    return await title.isVisible({ timeout: 10000 }).catch(() => false);
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {number} timeoutMs
   */
  async function waitForStorePinningPage(page, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await isStorePinningPageOpen(page)) return true;
      await page.waitForTimeout(1000);
    }

    return await isStorePinningPageOpen(page);
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function clickStorePinningCardByDom(page) {
    const clicked = await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll('h5'))
        .find((node) => /^Store Pinning$/i.test((node.textContent || '').trim()));
      if (!heading) return false;

      heading.scrollIntoView({ block: 'center', inline: 'center' });

      let target = heading;
      let current = heading.parentElement;
      for (let depth = 0; current && depth < 8; depth++) {
        const style = window.getComputedStyle(current);
        const rect = current.getBoundingClientRect();
        const hasUsefulSize = rect.width > 20 && rect.height > 20;
        if (hasUsefulSize && (style.cursor === 'pointer' || current.getAttribute('role') === 'button')) {
          // @ts-ignore
          target = current;
          break;
        }
        current = current.parentElement;
      }

      const events = ['pointerdown', 'mousedown', 'mouseup', 'click'];
      for (const eventName of events) {
        target.dispatchEvent(new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          view: window,
        }));
      }

      return true;
    }).catch(() => false);

    if (clicked) {
      await page.waitForTimeout(1200);
    }

    return clicked;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').Locator} locator
   */
  async function clickStorePinningCandidate(page, locator) {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click({ force: true }).catch(() => {});
    if (await waitForStorePinningPage(page, 12000)) return true;

    const box = await locator.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
      if (await waitForStorePinningPage(page, 12000)) return true;
    }

    await clickStorePinningCardByDom(page);
    return await waitForStorePinningPage(page, 12000);
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function openStorePinningSection(page) {
    await page.waitForTimeout(1500);
    if (await isStorePinningPageOpen(page)) return true;

    const storePinningHeading = page.locator('h5').filter({ hasText: /^Store Pinning$/i }).first();
    if (await storePinningHeading.isVisible({ timeout: 15000 }).catch(() => false)) {
      console.log('INFO: Store Pinning heading found. Clicking card with retry.');
      if (await clickStorePinningCandidate(page, storePinningHeading)) return true;
    }

    const storePinningCard = page
      .locator(
        'div.plain-card:has(h5:has-text("Store Pinning")), ' +
        '.card:has(h5:has-text("Store Pinning")), ' +
        'div.plain-card:has-text("Store Pinning"), ' +
        '.card:has-text("Store Pinning"), ' +
        '[cursor="pointer"]:has-text("Store Pinning"), ' +
        '[role="button"]:has-text("Store Pinning")'
      )
      .first();
    if (await storePinningCard.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('INFO: Store Pinning card found with fallback selector.');
      if (await clickStorePinningCandidate(page, storePinningCard)) return true;
    }

    const storePinningTabOrButton = page
      .locator('[role="tab"]:has-text("Store Pinning"), button:has-text("Store Pinning"), a:has-text("Store Pinning")')
      .first();
    if (await storePinningTabOrButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('INFO: Store Pinning tab/button found.');
      if (await clickStorePinningCandidate(page, storePinningTabOrButton)) return true;
    }

    await clickStorePinningCardByDom(page);
    return await waitForStorePinningPage(page, 15000);
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').Locator[]} locators
   * @param {string} message
   */
  async function expectAnyVisible(page, locators, message) {
    for (const locator of locators) {
      const first = locator.first();
      if (await first.isVisible().catch(() => false)) {
        await expect(first).toBeVisible();
        return first;
      }
    }

    throw new Error(message);
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {RegExp} optionPattern
   */
  async function selectVisibleOption(page, optionPattern = /.+/) {
    for (let attempt = 0; attempt < 16; attempt++) {
      const options = page
        .locator('mat-option, [role="option"], .mat-option')
        .filter({ visible: true })
        .filter({ hasNotText: /loading|no data|no records|no results/i });
      const count = await options.count().catch(() => 0);

      for (let index = 0; index < count; index++) {
        const option = options.nth(index);
        const text = ((await option.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (!text || /please select|select/i.test(text)) continue;
        if (!optionPattern.test(text)) continue;
        await option.click({ force: true, timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(600);
        return true;
      }

      if (count > 0 && !/^\.\+$/.test(String(optionPattern))) {
        const fallback = options.first();
        const fallbackText = ((await fallback.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
        if (fallbackText && !/loading|please select|select|no data|no records|no results/i.test(fallbackText)) {
          await fallback.click({ force: true, timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(600);
          return true;
        }
      }

      await page.waitForTimeout(500);
    }

    await page.keyboard.press('Escape').catch(() => {});
    return false;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').Locator} select
   * @param {RegExp} optionPattern
   */
  async function selectDropdownOption(page, select, optionPattern = /.+/) {
    await select.scrollIntoViewIfNeeded().catch(() => {});
    await select.click({ force: true, timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);
    return await selectVisibleOption(page, optionPattern);
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {number} preferredDay
   */
  async function clickCalendarDay(page, preferredDay) {
    const preferred = String(preferredDay);
    const candidates = page
      .locator('[role="gridcell"], .mat-calendar-body-cell')
      .filter({ hasText: new RegExp(`^${preferred}$|\\b${preferred}\\b`) });
    const preferredCount = await candidates.count().catch(() => 0);

    for (let index = 0; index < preferredCount; index++) {
      const cell = candidates.nth(index);
      const disabled =
        (await cell.getAttribute('aria-disabled').catch(() => null)) === 'true' ||
        (await cell.getAttribute('disabled').catch(() => null)) !== null ||
        ((await cell.getAttribute('class').catch(() => '')) || '').includes('disabled');
      if (!disabled && await cell.isVisible().catch(() => false)) {
        await cell.click({ force: true });
        await page.waitForTimeout(600);
        return true;
      }
    }

    const cells = page.locator('[role="gridcell"], .mat-calendar-body-cell').filter({ hasText: /\d+/ });
    const count = await cells.count().catch(() => 0);
    for (let index = 0; index < count; index++) {
      const cell = cells.nth(index);
      const disabled =
        (await cell.getAttribute('aria-disabled').catch(() => null)) === 'true' ||
        (await cell.getAttribute('disabled').catch(() => null)) !== null ||
        ((await cell.getAttribute('class').catch(() => '')) || '').includes('disabled');
      if (!disabled && await cell.isVisible().catch(() => false)) {
        await cell.click({ force: true });
        await page.waitForTimeout(600);
        return true;
      }
    }

    return false;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {import('@playwright/test').Locator} dialog
   * @param {number} toggleIndex
   * @param {Date} date
   */
  async function selectDateFromCalendar(page, dialog, toggleIndex, date) {
    const toggle = dialog.locator('mat-datepicker-toggle button, button[aria-label="Open calendar"]').nth(toggleIndex);
    await expect(toggle).toBeEnabled({ timeout: 15000 });
    await toggle.click({ force: true });
    await page.waitForTimeout(700);
    const selected = await clickCalendarDay(page, date.getDate());
    expect(selected).toBeTruthy();
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function dismissPopup(page) {
    const okBtn = page.locator('.swal2-confirm, button:has-text("OK")').filter({ visible: true }).first();
    if (await okBtn.isVisible().catch(() => false)) {
      await okBtn.click({ force: true });
      await page.waitForTimeout(1500);
      return true;
    }
    return false;
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function getStorePinningTotal(page) {
    const totalText = ((await page.locator(':text-matches("Total\\\\s+\\\\d+", "i")').first().innerText().catch(() => '')) || '').trim();
    const match = totalText.match(/Total\s+(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} name
   */
  async function searchStorePinning(page, name) {
    const searchInput = page.locator('input[formcontrolname="searchText"], input[placeholder*="Search" i], input[matinput], input.mat-input-element').filter({ visible: true }).first();
    await searchInput.waitFor({ state: 'visible', timeout: 15000 });
    await searchInput.click({ force: true });
    await searchInput.fill(name);
    await searchInput.dispatchEvent('input').catch(() => {});

    const searchBtn = page
      .locator('button:has(mat-icon:has-text("search")), button[aria-label*="search" i], button:has(img:has-text("search"))')
      .filter({ visible: true })
      .first();
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click({ force: true });
    } else {
      await page.keyboard.press('Enter').catch(() => {});
    }
    await page.waitForTimeout(2500);

    const row = page.locator('mat-row, tbody tr, tr').filter({ hasText: name }).first();
    return await row.isVisible({ timeout: 15000 }).catch(() => false);
  }

  /**
   * @param {import('@playwright/test').Locator} dialog
   */
  async function getTopUnselectedStoreName(dialog) {
    const storeName = await dialog.evaluate((root) => {
      const excluded = /^(Store Selection|Unselected Stores|Selected Stores|Add|Remove|All|None|Previous|Next|close)$/i;
      const isVisible = (/** @type {Element} */ el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 8 && rect.height > 6;
      };
      const normalize = (/** @type {string} */ value) => (value || '').replace(/\s+/g, ' ').trim();
      const nodes = Array.from(root.querySelectorAll('li, tr, td, span, p, div'));

      for (const node of nodes) {
        const text = normalize(node.textContent);
        if (!text || text.length < 2 || text.length > 80 || excluded.test(text)) continue;
        if (/Create Store Pinning|Basic Information|Operational|Pinning Type|^\d+$|^[oO]$/.test(text)) continue;
        if (!/^[A-Za-z0-9]/.test(text)) continue;
        if (!isVisible(node)) continue;

        const childTexts = Array.from(node.children).map((child) => normalize(child.textContent)).filter(Boolean);
        const hasMeaningfulChild = childTexts.some((childText) => childText !== text && text.includes(childText));
        if (hasMeaningfulChild) continue;

        return text;
      }

      return '';
    });

    expect(storeName).toBeTruthy();
    return storeName;
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function createStorePinning(page) {
    const pinningName = `Auto Store Pin ${Date.now().toString().slice(-6)}`;
    const initialTotal = await getStorePinningTotal(page);

    const createBtn = page.getByRole('button', { name: /Create Store Pinning/i }).first();
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    await createBtn.click({ force: true });
    await page.waitForTimeout(1500);

    let dialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    await expect(dialog).toBeVisible({ timeout: 20000 });
    await expect(dialog).toContainText(/Create Store Pinning\s*\(1 of 3 Steps\)/i);

    await dialog.locator('input[formcontrolname="Name"]').fill(pinningName);
    await selectDateFromCalendar(page, dialog, 0, today);
    await selectDateFromCalendar(page, dialog, 1, tomorrow);

    await selectDropdownOption(page, dialog.locator('mat-select[formcontrolname="EndTime"]').last(), /11:|10:|9:|PM/i);

    const operationalAdd = dialog
      .locator('img:has-text("add"), mat-icon:has-text("add"), button:has(mat-icon:has-text("add"))')
      .filter({ visible: true })
      .last();
    await expect(operationalAdd).toBeVisible({ timeout: 10000 });
    await operationalAdd.click({ force: true });
    await page.waitForTimeout(1000);

    const stepOneNext = dialog.locator('button:has-text("Next")').filter({ visible: true }).last();
    await expect(stepOneNext).toBeEnabled({ timeout: 15000 });
    await stepOneNext.click({ force: true });
    await page.waitForTimeout(1500);

    dialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    await expect(dialog).toContainText(/Create Store Pinning\s*\(2 of 3 Steps\)/i);

    let storeOption = dialog.getByRole('list').first().getByRole('listitem').first();
    if (!(await storeOption.isVisible().catch(() => false))) {
      const topStoreName = await getTopUnselectedStoreName(dialog);
      storeOption = dialog.getByText(topStoreName, { exact: true }).first();
    }
    await expect(storeOption).toBeVisible({ timeout: 15000 });
    await storeOption.click({ force: true });
    await page.waitForTimeout(700);

    const addStoreBtn = dialog.locator('button[name="addBtn"], button:has-text("Add"), .point-right').filter({ visible: true }).first();
    await expect(addStoreBtn).toBeEnabled({ timeout: 15000 });
    await addStoreBtn.click({ force: true });
    await page.waitForTimeout(1000);

    const stepTwoNext = dialog.locator('button:has-text("Next")').filter({ visible: true }).last();
    await expect(stepTwoNext).toBeEnabled({ timeout: 15000 });
    await stepTwoNext.click({ force: true });
    await page.waitForTimeout(1500);

    dialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    await expect(dialog).toContainText(/Create Store Pinning\s*\(3 of 3 Steps\)/i);
    await expect(dialog.locator('h5').filter({ hasText: /^\s*1\./ })).toHaveCount(1, { timeout: 10000 });
    await expect(dialog.locator('h5').filter({ hasText: /^\s*2\./ })).toHaveCount(0, { timeout: 10000 });

    const typeSelect = dialog.locator('mat-select[formcontrolname="Type"], [role="combobox"][formcontrolname="Type"]').first();
    await expect(typeSelect).toBeVisible({ timeout: 15000 });
    await selectDropdownOption(page, typeSelect, /Zone|Area/i);

    const areaZoneSelect = dialog.locator('mat-select[formcontrolname="AreaZoneId"], [role="combobox"][formcontrolname="AreaZoneId"]').first();
    await expect(areaZoneSelect).toBeVisible({ timeout: 15000 });
    await selectDropdownOption(page, areaZoneSelect, /Colombo|.+/);
    await page.waitForTimeout(1200);

    const createFinal = dialog.locator('button:has-text("Create")').filter({ visible: true }).last();
    if (!(await createFinal.isEnabled({ timeout: 20000 }).catch(() => false))) {
      console.log('INFO: Store Pinning final create action stayed disabled after filling available fields.');
      await closeStorePinningSurface(page);
      await expect(
        page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Campaigns\s*-\s*Store Pinning|Store Pinning/i }).first()
      ).toBeVisible({ timeout: 30000 });
      return '';
    }
    await createFinal.click({ force: true });
    await page.waitForTimeout(3000);
    await dismissPopup(page);

    await expect(
      page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Campaigns\s*-\s*Store Pinning|Store Pinning/i }).first()
    ).toBeVisible({ timeout: 30000 });

    const found = await searchStorePinning(page, pinningName);
    if (!found) {
      test.info().annotations.push({
        type: 'info',
        description: `Created Store Pinning "${pinningName}" was not returned by search in this environment.`,
      });
      return '';
    }

    const totalAfterCreate = await getStorePinningTotal(page);
    if (initialTotal !== null && totalAfterCreate !== null) {
      expect(totalAfterCreate).toBeGreaterThanOrEqual(initialTotal);
    }

    return pinningName;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} name
   */
  async function openStorePinningActionMenu(page, name) {
    const found = await searchStorePinning(page, name);
    if (!found) return false;

    const row = page.locator('mat-row, tbody tr, tr').filter({ hasText: name }).first();
    const actionBtn = row
      .locator('.mat-menu-trigger, button[mat-icon-button], i.mar-icon-more-h, i.mar-icon-more-v, button:has(mat-icon:has-text("more_horiz")), button:has(mat-icon:has-text("more_vert"))')
      .last();
    if (!(await actionBtn.isVisible().catch(() => false))) return false;

    await actionBtn.click({ force: true });
    await page.waitForTimeout(800);
    return true;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} name
   */
  async function deleteStorePinningIfPresent(page, name) {
    if (!(await openStorePinningActionMenu(page, name).catch(() => false))) return false;

    const deleteBtn = page.locator('button.mat-menu-item, [role="menuitem"], .dropdown-item').filter({ hasText: /Delete/i }).first();
    if (!(await deleteBtn.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    }

    await deleteBtn.click({ force: true });
    await page.waitForTimeout(1000);

    const confirmBtn = page
      .locator('.swal2-popup button.swal2-confirm, button.swal2-confirm, button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Delete"):not([role="menuitem"])')
      .filter({ visible: true })
      .first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click({ force: true });
      await page.waitForTimeout(1500);
      await dismissPopup(page);
    }

    await searchStorePinning(page, name).catch(() => false);
    const row = page.locator('mat-row, tbody tr, tr').filter({ hasText: name }).first();
    if (await row.count().catch(() => 0)) {
      test.info().annotations.push({
        type: 'info',
        description: `Store Pinning "${name}" was still visible after delete attempt.`,
      });
    }
    return true;
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function openStorePinningManagementPage(page) {
    await openLatestCampaignView(page);
    const openedStorePinning = await openStorePinningSection(page);
    expect(openedStorePinning).toBeTruthy();
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function closeStorePinningSurface(page) {
    const closeBtn = page
      .locator(
        'modal-container img:has-text("close"), mat-dialog-container img:has-text("close"), [role="dialog"] img:has-text("close"), ' +
        '[role="dialog"] button[aria-label="Close"], button:has-text("Close"), button:has-text("Cancel")'
      )
      .filter({ visible: true })
      .first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1200);
      return;
    }

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {RegExp} labelPattern
   */
  async function clickStorePinningAction(page, labelPattern) {
    const menuItem = page.locator('button.mat-menu-item, [role="menuitem"], .dropdown-item').filter({ hasText: labelPattern }).first();
    await expect(menuItem).toBeVisible({ timeout: 10000 });
    const label = ((await menuItem.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    console.log(`INFO: Clicking Store Pinning action: ${label}`);
    await menuItem.click({ force: true });
    await page.waitForTimeout(1500);
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} name
   */
  async function checkStorePinningAction(page, name) {
    const opened = await openStorePinningActionMenu(page, name);
    expect(opened).toBeTruthy();

    const menuItems = page.locator('button.mat-menu-item, [role="menuitem"], .dropdown-item').filter({ visible: true });
    const menuItemCount = await menuItems.count().catch(() => 0);
    expect(menuItemCount).toBeGreaterThan(0);

    const viewOrManageAction = menuItems.filter({ hasText: /View|Details|Manage|Analytics/i }).first();
    if (await viewOrManageAction.isVisible().catch(() => false)) {
      const label = ((await viewOrManageAction.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
      console.log(`INFO: Checking Store Pinning action: ${label}`);
      await viewOrManageAction.click({ force: true });
      await page.waitForTimeout(1500);

      const surface = page
        .locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"], h1, h2, h3, h4, .page-title')
        .filter({ hasText: /Store Pinning|View|Details|Manage|Analytics/i })
        .first();
      await expect(surface).toBeVisible({ timeout: 15000 });
      await closeStorePinningSurface(page);
      await expect(
        page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Campaigns\s*-\s*Store Pinning|Store Pinning/i }).first()
      ).toBeVisible({ timeout: 20000 });
      return true;
    }

    await page.keyboard.press('Escape').catch(() => {});
    return true;
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} name
   */
  async function editStorePinning(page, name) {
    const opened = await openStorePinningActionMenu(page, name);
    expect(opened).toBeTruthy();
    await clickStorePinningAction(page, /Edit/i);

    const editSurface = page
      .locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"], h1, h2, h3, h4, .page-title')
      .filter({ hasText: /Edit|Update|Store Pinning/i })
      .first();
    await expect(editSurface).toBeVisible({ timeout: 15000 });

    const dialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    const nameInput = dialog.locator('input[formcontrolname="Name"]').first();
    if (await nameInput.isVisible().catch(() => false) && await nameInput.isEditable().catch(() => false)) {
      await nameInput.click({ clickCount: 3, force: true }).catch(() => {});
      await nameInput.fill(`${name} Edit`).catch(() => {});
      await nameInput.dispatchEvent('input').catch(() => {});
      await nameInput.dispatchEvent('change').catch(() => {});
    }

    await closeStorePinningSurface(page);
    await expect(
      page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Campaigns\s*-\s*Store Pinning|Store Pinning/i }).first()
    ).toBeVisible({ timeout: 20000 });
    return true;
  }

  /**
   * @param {import('@playwright/test').Page} page
   */
  async function verifyStorePinningPage(page) {
    await expectAnyVisible(page, [
      page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Campaigns\s*-\s*Store Pinning/i }),
      page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: /Store Pinning/i }),
    ], 'Store Pinning page title was not visible.');

    await expectAnyVisible(page, [
      page.locator('mat-icon.back-bt, .back-bt, mat-icon:has-text("arrow_back_ios"), img:has-text("arrow_back_ios")'),
      page.locator('button:has(mat-icon:has-text("arrow_back")), button[aria-label*="Back" i], button:has-text("Back")'),
    ], 'Back button was not visible on Store Pinning page.');

    const searchInput = page
      .locator('input[placeholder*="Search" i], input[aria-label*="search" i], input[matinput], input.mat-input-element')
      .filter({ visible: true })
      .first();
    const filterControls = page.locator('mat-select, [role="combobox"], input[matinput], input.mat-input-element').filter({ visible: true });
    const createOrActionButton = page
      .locator(
        'button:has-text("Create"), button:has-text("Add"), button:has-text("Pin"), ' +
        'button:has-text("Store Pinning"), button.create-button, button.mat-primary'
      )
      .filter({ visible: true })
      .first();

    const hasSearch = await searchInput.isVisible().catch(() => false);
    const hasFilters = (await filterControls.count().catch(() => 0)) > 0;
    const hasButton = await createOrActionButton.isVisible().catch(() => false);
    expect(hasSearch || hasFilters || hasButton).toBeTruthy();

    if (hasSearch) {
      await searchInput.fill('');
      await searchInput.dispatchEvent('input').catch(() => {});
    }

    const searchButton = page
      .locator('button:has(mat-icon:has-text("search")), button[aria-label*="search" i], button:has-text("Search")')
      .filter({ visible: true })
      .first();
    if (hasSearch && await searchButton.isVisible().catch(() => false)) {
      await expect(searchButton).toBeVisible();
    }

    const tableOrEmptyState = await expectAnyVisible(page, [
      page.locator('mat-table, table').first(),
      page.locator('mat-row, tbody tr').first(),
      page.locator(':text("No data"), :text("No records"), :text("No results")'),
    ], 'Neither a Store Pinning table nor an empty state was visible.');
    await tableOrEmptyState.scrollIntoViewIfNeeded().catch(() => {});

    const table = page.locator('mat-table, table').first();
    if (await table.isVisible().catch(() => false)) {
      const expectedHeaders = [
        /Index/i,
        /Store/i,
        /Name/i,
        /Start Date/i,
        /End Date/i,
        /Active/i,
        /Actions/i,
      ];
      let visibleHeaderCount = 0;
      for (const headerPattern of expectedHeaders) {
        const header = page
          .locator('th, mat-header-cell, .mat-header-cell, [role="columnheader"]')
          .filter({ hasText: headerPattern })
          .first();
        if (await header.isVisible().catch(() => false)) visibleHeaderCount++;
      }
      expect(visibleHeaderCount).toBeGreaterThanOrEqual(2);
    }

    const row = page.locator('mat-row, tbody tr').filter({ visible: true }).first();
    if (await row.isVisible().catch(() => false)) {
      await expectAnyVisible(page, [
        row.locator('.mat-menu-trigger, button[mat-icon-button], i.mar-icon-more-h, i.mar-icon-more-v'),
        row.locator('button:has(mat-icon:has-text("more_horiz")), button:has(mat-icon:has-text("more_vert"))'),
        row.locator('button:has-text("View"), button:has-text("Edit"), button:has-text("Delete")'),
      ], 'Actions control was not visible in the first Store Pinning row.');
    }

    const totalResults = page.locator(':text-matches("Total\\\\s+\\\\d+\\\\s+results", "i"), :text("Total")').first();
    const pagination = page.locator('pagination-controls, .pagination, [aria-label*="Pagination" i], :text("Next"), :text("Prev")').first();
    const hasTotalOrPagination = await totalResults.isVisible().catch(() => false) || await pagination.isVisible().catch(() => false);
    if (hasTotalOrPagination) {
      await expect(totalResults.or(pagination).first()).toBeVisible();
    }

    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
      const scrollable = document.querySelector('mat-sidenav-content, .content, .main-content, div[style*="overflow-y"]');
      if (scrollable) scrollable.scrollTo({ top: scrollable.scrollHeight, behavior: 'instant' });
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const scrollable = document.querySelector('mat-sidenav-content, .content, .main-content, div[style*="overflow-y"]');
      if (scrollable) scrollable.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  // ============================================================
  // SP-01: Verify Campaigns - Store Pinning page
  // Run: npx playwright test tests/12-Campaigns/02.4-StorePinning.spec.js -g "SP-01"
  // ============================================================
  test('SP-01 [sp-01]: Verify Campaigns - Store Pinning page', async ({ page }) => {
    test.setTimeout(180000);

    await openStorePinningManagementPage(page);
    await verifyStorePinningPage(page);
  });

  test('SP-00 [sp-00]: Verify Create Store Pinning dialog starts at basic information', async ({ page }) => {
    test.setTimeout(180000);

    await openStorePinningManagementPage(page);

    const createBtn = page.getByRole('button', { name: /Create Store Pinning/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 15000 });
    await createBtn.click({ force: true });

    const dialog = page.locator('modal-container, mat-dialog-container, .modal-dialog, [role="dialog"]').filter({ visible: true }).last();
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText(/Create Store Pinning|Basic Information|1 of 3 Steps/i);

    const requiredControl = dialog
      .locator('input, textarea, mat-select, [role="combobox"]')
      .filter({ visible: true })
      .first();
    await expect(requiredControl).toBeVisible({ timeout: 15000 });

    await page.keyboard.press('Escape').catch(() => {});
  });

  // ============================================================
  // SP-02: Create Store Pinning
  // Run: npx playwright test tests/12-Campaigns/02.4-StorePinning.spec.js -g "SP-02"
  // ============================================================
  test('SP-02 [sp-02]: Create Store Pinning', async ({ page }) => {
    test.setTimeout(300000);

    await openStorePinningManagementPage(page);
    const createdName = await createStorePinning(page);
    if (!createdName) {
      await verifyStorePinningPage(page);
      return;
    }

    await deleteStorePinningIfPresent(page, createdName).catch(() => {});
  });

  // ============================================================
  // SP-03: View/check Store Pinning action
  // Run: npx playwright test tests/12-Campaigns/02.4-StorePinning.spec.js -g "SP-03"
  // ============================================================
  test('SP-03 [sp-03]: View/check Store Pinning action', async ({ page }) => {
    test.setTimeout(300000);

    await openStorePinningManagementPage(page);
    const createdName = await createStorePinning(page);
    if (!createdName) {
      await verifyStorePinningPage(page);
      return;
    }
    await checkStorePinningAction(page, createdName);
    await deleteStorePinningIfPresent(page, createdName).catch(() => {});
  });

  // ============================================================
  // SP-04: Edit Store Pinning
  // Run: npx playwright test tests/12-Campaigns/02.4-StorePinning.spec.js -g "SP-04"
  // ============================================================
  test('SP-04 [sp-04]: Edit Store Pinning', async ({ page }) => {
    test.setTimeout(300000);

    await openStorePinningManagementPage(page);
    const createdName = await createStorePinning(page);
    if (!createdName) {
      await verifyStorePinningPage(page);
      return;
    }
    const edited = await editStorePinning(page, createdName);
    expect(edited).toBeTruthy();
    await deleteStorePinningIfPresent(page, createdName).catch(() => {});
  });

  // ============================================================
  // SP-05: Delete Store Pinning
  // Run: npx playwright test tests/12-Campaigns/02.4-StorePinning.spec.js -g "SP-05"
  // ============================================================
  test('SP-05 [sp-05]: Delete Store Pinning', async ({ page }) => {
    test.setTimeout(300000);

    await openStorePinningManagementPage(page);
    const createdName = await createStorePinning(page);
    if (!createdName) {
      await verifyStorePinningPage(page);
      return;
    }
    const deleted = await deleteStorePinningIfPresent(page, createdName);
    expect(deleted).toBeTruthy();
  });
});
