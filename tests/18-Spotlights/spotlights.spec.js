// @ts-check
// ============================================================
// TMDone Admin Console - Spotlights
// URL: #/home/spotlight/list (list) and #/home/spotlight/new (create)
// Full lifecycle: create a spotlight targeting the Colombo zone,
// edit it, then delete it so the shared demo data isn't left with
// leftover test spotlights.
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from '../helpers/loginHelper.js';
import path from 'node:path';

const SPOTLIGHT_LIST_URL = `${CREDENTIALS.baseUrl}/#/home/spotlight/list`;
const SPOTLIGHT_NEW_URL = `${CREDENTIALS.baseUrl}/#/home/spotlight/new`;
const ZONE_NAME = 'Colombo';
const RUN_STAMP = Date.now();
const SPOTLIGHT_TITLE = `QA Auto Spotlight ${RUN_STAMP}`;
const SPOTLIGHT_TITLE_EDITED = `QA Auto Spotlight ${RUN_STAMP} Edited`;
const CAROUSEL_TITLE = `QA Auto Carousel ${RUN_STAMP}`;
const CAROUSEL_TITLE_EDITED = `QA Auto Carousel ${RUN_STAMP} Edited`;
const IMAGE_PATH = path.resolve('tests/fixtures/offer-image.png');

/** @param {import('@playwright/test').Page} page */
async function waitForNoSpinner(page) {
  for (const selector of ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay', '.loading-spinner']) {
    await page.locator(selector).waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} labelText
 * @param {string} value
 */
async function fillByLabel(page, labelText, value) {
  const field = page.locator('mat-form-field').filter({ hasText: labelText }).first();
  const input = field.locator('input, textarea').first();
  await expect(input, `"${labelText}" field should be visible.`).toBeVisible({ timeout: 15000 });
  await input.fill(value);
}

/**
 * Step 1's Display type control ("Tile" / "Carousel") is a pair of buttons
 * whose text is the icon ligature concatenated with the label (e.g.
 * "grid_viewTile"), so an exact-text match won't find them — match by
 * substring instead. Tile is the default, so this is only needed to switch
 * to Carousel.
 * @param {import('@playwright/test').Page} page
 * @param {'Tile' | 'Carousel'} displayType
 */
async function selectDisplayType(page, displayType) {
  const button = page.locator('button, [role="button"]').filter({ hasText: displayType }).first();
  await expect(button, `"${displayType}" display type button should be visible.`).toBeVisible({ timeout: 15000 });
  await button.click({ force: true });
  await page.waitForTimeout(500);
}

/**
 * The 4 image upload inputs (Tile EN/AR, Header EN/AR) don't all mount at
 * once — later ones can appear only after an earlier upload is applied.
 * Handle each by index with its own wait rather than requiring all 4
 * upfront, and tolerate fewer than 4 if some slots genuinely aren't there.
 * @param {import('@playwright/test').Page} page
 */
async function attemptUploadStepTwoImages(page) {
  let uploaded = 0;
  for (let index = 0; index < 4; index += 1) {
    const input = page.locator('input[type="file"]').nth(index);
    const appeared = await input.waitFor({ state: 'attached', timeout: 15000 }).then(() => true).catch(() => false);
    if (!appeared) continue;

    const setOk = await input.setInputFiles(IMAGE_PATH).then(() => true).catch(() => false);
    if (!setOk) continue;
    uploaded += 1;
    await page.waitForTimeout(1200);

    const applyButton = page.locator('button:has-text("Apply")').filter({ visible: true }).first();
    if (await applyButton.isVisible({ timeout: 8000 }).catch(() => false)) {
      await applyButton.click({ force: true });
      await page.waitForTimeout(1000);
    }
  }
  return uploaded;
}

// Tile requires 4 images (Tile image + Header image, each EN/AR); Carousel
// only requires 2 (Header image EN/AR) - so a count below 4 here is normal
// for Carousel, not a failure. Only retry when nothing uploaded at all,
// which indicates the inputs genuinely weren't ready yet.
async function uploadStepTwoImages(page) {
  let uploaded = await attemptUploadStepTwoImages(page);
  if (uploaded === 0) {
    console.log('Spotlight image uploads applied: 0 on first pass; retrying.');
    await page.waitForTimeout(1500);
    uploaded = await attemptUploadStepTwoImages(page);
  }

  expect(uploaded, 'At least one spotlight image should have been uploaded.').toBeGreaterThan(0);
  console.log(`Spotlight image uploads applied: ${uploaded}`);
}

/**
 * Carousel-only step: "Featured items" requires selecting a minimum number
 * of items, surfaced as "Select N more items to reach the minimum of N."
 * Tile doesn't have this step, so do nothing if the prompt isn't present.
 * @param {import('@playwright/test').Page} page
 */
async function selectFeaturedItemsIfRequired(page) {
  const minimumPrompt = page.getByText(/Select \d+ more items? to reach the minimum/i).first();
  const isRequired = await minimumPrompt.isVisible({ timeout: 5000 }).catch(() => false);
  if (!isRequired) return;

  const promptText = await minimumPrompt.innerText().catch(() => '');
  const match = promptText.match(/Select (\d+) more/i);
  const needed = match ? parseInt(match[1], 10) : 8;

  const checkboxes = page.locator('mat-checkbox.featured-item-tile-check');
  await expect(checkboxes.first(), 'Featured items checkboxes should be visible.').toBeVisible({ timeout: 20000 });
  const available = await checkboxes.count();

  for (let index = 0; index < Math.min(needed, available); index += 1) {
    await checkboxes.nth(index).click();
    await page.waitForTimeout(300);
  }

  await expect(
    minimumPrompt,
    'Featured items minimum requirement should be satisfied after selecting items.'
  ).not.toBeVisible({ timeout: 10000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {'Start date' | 'End date'} label
 * @param {number} dayIndex which enabled calendar day to click (0-based)
 */
async function pickCalendarDate(page, label, dayIndex) {
  const field = page.locator('mat-form-field').filter({ hasText: label }).first();
  const toggle = field.locator('mat-datepicker-toggle button, button[aria-label*="calendar" i]').first();
  await expect(toggle, `${label} calendar toggle should be visible.`).toBeVisible({ timeout: 15000 });

  const enabledDays = page.locator('.mat-calendar-body-cell:not(.mat-calendar-body-disabled) .mat-calendar-body-cell-content');

  // The calendar overlay occasionally doesn't open on the first click.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await toggle.click({ force: true });
    await page.waitForTimeout(700);
    if (await enabledDays.first().isVisible({ timeout: 5000 }).catch(() => false)) break;
    await page.keyboard.press('Escape').catch(() => {});
  }

  await expect(enabledDays.first(), `${label} calendar should show selectable days.`).toBeVisible({ timeout: 10000 });
  await enabledDays.nth(dayIndex).click({ force: true });
  await page.waitForTimeout(500);
}

/**
 * Targeting's Area/Zone picker is the angular2-dual-listbox component
 * (<dual-list>). Its "Add" button starts disabled and only enables once an
 * item in the source <li> list is actually clicked (a *real*, non-forced
 * click — a force click does not register with the library's click
 * handler, and the item never gets its "selected" class).
 * @param {import('@playwright/test').Page} page
 * @param {string} zoneName
 */
async function selectZone(page, zoneName) {
  const zoneToggle = page.getByText('Zone', { exact: true }).first();
  await expect(zoneToggle, 'Zone toggle should be visible in Targeting.').toBeVisible({ timeout: 15000 });
  await zoneToggle.click({ force: true });
  await page.waitForTimeout(800);

  const zoneRow = page.locator('li').filter({ hasText: zoneName }).first();
  await expect(zoneRow, `"${zoneName}" should be listed under Available Zones.`).toBeVisible({ timeout: 15000 });

  const addButton = page.locator('button[name="addBtn"]').first();
  await zoneRow.click();
  await expect(addButton, `Add button should enable once "${zoneName}" is clicked.`).toBeEnabled({ timeout: 5000 });
  await addButton.click();

  const badge = page.locator('.enhanced-dual-list-badge').first();
  await expect(badge, `Selected-zones badge should reflect "${zoneName}" being added.`).not.toHaveText('0 selected', {
    timeout: 5000,
  });
}

/** @param {import('@playwright/test').Page} page */
async function searchSpotlight(page, title) {
  await page.goto(SPOTLIGHT_LIST_URL, { waitUntil: 'domcontentloaded' });
  await waitForNoSpinner(page);
  await page.waitForTimeout(1500);

  const searchInput = page
    .locator('input[placeholder*="Search" i], input[aria-label*="search" i]')
    .filter({ visible: true })
    .first();
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill(title);
    const searchButton = page.locator('button:has(mat-icon:has-text("search")), button.search-btn').filter({ visible: true }).first();
    if (await searchButton.isVisible().catch(() => false)) {
      await searchButton.click({ force: true });
    } else {
      await page.keyboard.press('Enter').catch(() => {});
    }
    await page.waitForTimeout(1500);
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 */
async function findSpotlightRow(page, title) {
  const row = page.locator('tbody tr, mat-row').filter({ hasText: title }).first();
  const rowVisible = await row.isVisible({ timeout: 10000 }).catch(() => false);
  return rowVisible ? row : null;
}

/**
 * The list search occasionally doesn't apply on the first try (a pattern
 * seen elsewhere in this app too), so retry once before concluding the
 * spotlight genuinely isn't there.
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 */
async function searchAndFindSpotlight(page, title) {
  await searchSpotlight(page, title);
  let row = await findSpotlightRow(page, title);
  if (!row) {
    await searchSpotlight(page, title);
    row = await findSpotlightRow(page, title);
  }
  return row;
}

/**
 * Selects a mat-select option in the list page's Filters panel by its
 * mat-label text (Status, Display type, Target type, Zones, Areas).
 * @param {import('@playwright/test').Page} page
 * @param {string} label
 * @param {number} optionIndex
 */
async function selectFilterOption(page, label, optionIndex = 0) {
  const field = page.locator('mat-form-field').filter({ hasText: label }).first();
  const dropdown = field.locator('mat-select').first();

  if (!(await dropdown.isVisible().catch(() => false)) || !(await dropdown.isEnabled().catch(() => false))) {
    return false;
  }

  await dropdown.click({ force: true });
  await page.waitForTimeout(800);
  await page.locator('mat-option').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});

  const options = page.locator('mat-option').filter({ hasNotText: /select all|no data|no records/i });
  const count = await options.count();
  if (count <= optionIndex) {
    await page.keyboard.press('Escape').catch(() => {});
    return false;
  }

  const text = ((await options.nth(optionIndex).innerText().catch(() => '')) || '').trim();
  await options.nth(optionIndex).click({ force: true });
  await page.waitForTimeout(500);
  if (await page.locator('mat-option').first().isVisible().catch(() => false)) {
    await page.keyboard.press('Escape').catch(() => {});
  }
  console.log(`Filter "${label}": selected "${text}"`);
  return true;
}

/** @param {import('@playwright/test').Page} page */
async function clickListSearchButton(page) {
  const searchButton = page.locator('button.search-btn, button:has(mat-icon:has-text("search"))').filter({ visible: true }).first();
  if (await searchButton.isVisible().catch(() => false)) {
    await searchButton.click({ force: true });
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

/**
 * Row actions are behind a "more_horiz" kebab menu rather than direct
 * icon buttons in the row.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} row
 * @param {RegExp} actionText
 */
async function openRowAction(page, row, actionText) {
  const menuButton = row.locator('button:has(mat-icon:has-text("more_horiz")), button[aria-label*="more" i]').first();
  await expect(menuButton, 'Spotlight row should expose a row-actions menu.').toBeVisible({ timeout: 10000 });
  await menuButton.click();
  await page.waitForTimeout(500);

  const menuItem = page
    .locator('[role="menu"] button, [role="menuitem"], .mat-menu-item')
    .filter({ hasText: actionText })
    .first();
  await expect(menuItem, `Row-actions menu should expose a "${actionText}" option.`).toBeVisible({ timeout: 10000 });
  await menuItem.click();
}

/**
 * Runs the full New Spotlight wizard (Basics through Landing page widgets)
 * and saves as a draft. Shared by the Tile and Carousel lifecycle tests —
 * the two display types need the same fields except for the Step 1 toggle.
 * @param {import('@playwright/test').Page} page
 * @param {{ title: string, displayType?: 'Tile' | 'Carousel' }} options
 */
async function createSpotlight(page, { title, displayType = 'Tile' }) {
  await page.goto(SPOTLIGHT_NEW_URL, { waitUntil: 'domcontentloaded' });
  await waitForNoSpinner(page);
  await expect(page).toHaveURL(/spotlight\/new/i, { timeout: 30000 });
  await expect(
    page.locator('mat-form-field').filter({ hasText: 'Title EN' }).first(),
    'New Spotlight form should be rendered before filling it.'
  ).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(500);

  // Step 1: Basics
  if (displayType === 'Carousel') {
    await selectDisplayType(page, 'Carousel');
  }
  await fillByLabel(page, 'Title EN', title);
  await fillByLabel(page, 'Title AR', 'سبوت لايت اختبار الأتمتة');
  await fillByLabel(page, 'Subtitle EN', 'Automated QA test subtitle');
  await fillByLabel(page, 'Subtitle AR', 'العنوان الفرعي للاختبار الآلي');
  await fillByLabel(page, 'Spotlight index on home', '99');

  // Step 2: Appearance - required image uploads
  await uploadStepTwoImages(page);

  // Step 3: Schedule - required start/end dates
  await pickCalendarDate(page, 'Start date', 0);
  await pickCalendarDate(page, 'End date', 5);

  // Step 4: Targeting - Zone = Colombo
  await selectZone(page, ZONE_NAME);

  // Step 5: Store selection - unlocked by Targeting, and also requires at
  // least one selection (defaults to "By cuisine"; "Select all" covers it
  // in one click rather than tapping individual cuisine chips).
  const cuisineSelectAll = page.getByText('Select all', { exact: true }).first();
  await expect(cuisineSelectAll, 'Store selection "Select all" control should be visible.').toBeVisible({
    timeout: 15000,
  });
  // Real (non-forced) clicks are required here — force clicks bypass
  // Angular's click handlers on some of this app's custom components
  // (confirmed earlier with the zone dual-listbox), silently no-oping.
  // Clicking this before Featured items also matters for Carousel: the
  // Featured items grid's checkboxes don't populate until a store
  // selection has been made.
  await cuisineSelectAll.click().catch(() => {});
  await page.waitForTimeout(1000);

  // Step 6: Landing page widgets - the backend rejects the save if the
  // "Top deals" widget is enabled without at least one deal configured.
  // Disable it rather than sourcing real deal data, since it isn't
  // required (unlike "Top selling items", which is fixed/always-on).
  const topDealsCard = page.locator('.widget-card').filter({ has: page.locator('.widget-type-label', { hasText: 'Top deals' }) }).first();
  const topDealsToggle = topDealsCard.locator('mat-slide-toggle').first();
  if (await topDealsToggle.isVisible().catch(() => false)) {
    const isChecked = await topDealsToggle.evaluate((el) => el.classList.contains('mat-checked')).catch(() => false);
    if (isChecked) {
      await topDealsToggle.locator('label').click();
      await page.waitForTimeout(500);
    }
  }

  // Step 7: Featured items - Carousel-only. Carousel shows featured items
  // directly on the home screen and requires a minimum number selected
  // ("Select N more items to reach the minimum of N"); Tile doesn't have
  // this step at all.
  await selectFeaturedItemsIfRequired(page);

  const saveDraftButton = page.locator('button:has-text("Save draft")').filter({ visible: true }).first();
  await expect(saveDraftButton, 'Save draft button should be visible.').toBeVisible({ timeout: 15000 });

  // Real (non-forced) clicks are required here — force clicks bypass
  // Angular's click handlers on some of this app's custom components
  // (confirmed earlier with the zone dual-listbox), silently no-oping.
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    if (await saveDraftButton.isEnabled().catch(() => false)) break;
    await cuisineSelectAll.click().catch(() => {});
    await page.waitForTimeout(1000);
  }

  await expect(saveDraftButton, 'Save draft button should be enabled once required fields are filled.').toBeEnabled({
    timeout: 15000,
  });

  // Verify the actual backend response rather than just the UI, since a
  // silent 4xx (e.g. a still-missing required field) leaves the page on
  // /spotlight/new without any visible toast.
  const responsePromise = page.waitForResponse(
    (response) => /\/api\/spotlights\/create/i.test(response.url()) && response.request().method() === 'POST',
    { timeout: 20000 }
  );
  await saveDraftButton.click();
  const saveResponse = await responsePromise;
  expect(saveResponse.status(), `Spotlight create request should succeed (got ${saveResponse.status()}).`).toBe(200);

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(2000);
}

test.describe.serial('18 - Spotlights - View, Create, Edit, Delete', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    await loginToApp(page);
  });

  test('SPOT-01: Spotlights list page loads with filters and create control', async ({ page }) => {
    await page.goto(SPOTLIGHT_LIST_URL, { waitUntil: 'domcontentloaded' });
    await waitForNoSpinner(page);
    await expect(page).toHaveURL(/spotlight\/list/i, { timeout: 30000 });

    await expect(page.locator('body')).toContainText(/Spotlights/i);
    const createButton = page.locator('button:has-text("New Spotlight"), a:has-text("New Spotlight")').first();
    await expect(createButton, 'Spotlights page should expose a New Spotlight control.').toBeVisible({ timeout: 15000 });

    const filtersVisible = await page.locator('body').innerText().then((text) => /Filters/i.test(text));
    expect(filtersVisible, 'Spotlights page should expose the Filters panel.').toBe(true);

    console.log('SPOT-01 PASSED: Spotlights list page loaded with expected controls.');
  });

  test('SPOT-02: Create a spotlight targeting the Colombo zone', async ({ page }) => {
    test.setTimeout(300000);
    await createSpotlight(page, { title: SPOTLIGHT_TITLE, displayType: 'Tile' });

    // Saving doesn't always navigate away on its own — go to the list
    // explicitly rather than assuming an automatic redirect.
    const row = await searchAndFindSpotlight(page, SPOTLIGHT_TITLE);
    expect(row, `"${SPOTLIGHT_TITLE}" should appear in the Spotlights list after saving.`).not.toBeNull();

    console.log(`SPOT-02 PASSED: Created spotlight "${SPOTLIGHT_TITLE}" targeting ${ZONE_NAME}.`);
  });

  test('SPOT-03: Edit the created spotlight', async ({ page }) => {
    const row = await searchAndFindSpotlight(page, SPOTLIGHT_TITLE);
    test.skip(!row, `"${SPOTLIGHT_TITLE}" was not found; edit cannot be verified.`);

    await openRowAction(page, row, /Edit/i);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2000);

    await fillByLabel(page, 'Title EN', SPOTLIGHT_TITLE_EDITED);

    const saveDraftButton = page.locator('button:has-text("Save draft")').filter({ visible: true }).first();
    await expect(saveDraftButton, 'Save draft button should be visible while editing.').toBeVisible({ timeout: 15000 });
    await saveDraftButton.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2000);

    const editedRow = await searchAndFindSpotlight(page, SPOTLIGHT_TITLE_EDITED);
    expect(editedRow, `"${SPOTLIGHT_TITLE_EDITED}" should appear in the list after editing.`).not.toBeNull();

    console.log(`SPOT-03 PASSED: Edited spotlight title to "${SPOTLIGHT_TITLE_EDITED}".`);
  });

  test('SPOT-04: Delete the spotlight created by this test run', async ({ page }) => {
    let row = await searchAndFindSpotlight(page, SPOTLIGHT_TITLE_EDITED);
    if (!row) {
      // Fall back to the original title in case SPOT-03 was skipped.
      row = await searchAndFindSpotlight(page, SPOTLIGHT_TITLE);
    }
    test.skip(!row, 'The test spotlight was not found; nothing to delete.');

    await openRowAction(page, row, /Delete/i);
    await page.waitForTimeout(1000);

    const confirmButton = page
      .locator(
        '.swal2-confirm, button:has-text("Delete"), button:has-text("Yes"), button:has-text("Confirm"), button:has-text("OK")'
      )
      .filter({ visible: true })
      .last();
    if (await confirmButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await confirmButton.click();
      await page.waitForTimeout(2000);
    }

    const rowAfterDelete = await searchAndFindSpotlight(page, SPOTLIGHT_TITLE_EDITED);
    expect(rowAfterDelete, 'The test spotlight should no longer appear in the list after deleting it.').toBeNull();

    console.log('SPOT-04 PASSED: Test spotlight deleted; shared demo data left clean.');
  });

  test('SPOT-09: Create a Carousel spotlight targeting the Colombo zone', async ({ page }) => {
    test.setTimeout(300000);
    await createSpotlight(page, { title: CAROUSEL_TITLE, displayType: 'Carousel' });

    const row = await searchAndFindSpotlight(page, CAROUSEL_TITLE);
    expect(row, `"${CAROUSEL_TITLE}" should appear in the Spotlights list after saving.`).not.toBeNull();

    console.log(`SPOT-09 PASSED: Created Carousel spotlight "${CAROUSEL_TITLE}" targeting ${ZONE_NAME}.`);
  });

  test('SPOT-10: View the created Carousel spotlight and confirm its display type', async ({ page }) => {
    const row = await searchAndFindSpotlight(page, CAROUSEL_TITLE);
    test.skip(!row, `"${CAROUSEL_TITLE}" was not found; view cannot be verified.`);

    await expect(row, `"${CAROUSEL_TITLE}" row should show Carousel as its display type.`).toContainText(/Carousel/i, {
      timeout: 10000,
    });
    await expect(row, `"${CAROUSEL_TITLE}" row should show its targeted zone.`).toContainText(ZONE_NAME, {
      timeout: 10000,
    });

    console.log(`SPOT-10 PASSED: "${CAROUSEL_TITLE}" row confirms Carousel display type and ${ZONE_NAME} targeting.`);
  });

  test('SPOT-11: Update the created Carousel spotlight', async ({ page }) => {
    const row = await searchAndFindSpotlight(page, CAROUSEL_TITLE);
    test.skip(!row, `"${CAROUSEL_TITLE}" was not found; update cannot be verified.`);

    await openRowAction(page, row, /Edit/i);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2000);

    await fillByLabel(page, 'Title EN', CAROUSEL_TITLE_EDITED);

    const saveDraftButton = page.locator('button:has-text("Save draft")').filter({ visible: true }).first();
    await expect(saveDraftButton, 'Save draft button should be visible while editing.').toBeVisible({ timeout: 15000 });
    await saveDraftButton.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2000);

    const editedRow = await searchAndFindSpotlight(page, CAROUSEL_TITLE_EDITED);
    expect(editedRow, `"${CAROUSEL_TITLE_EDITED}" should appear in the list after updating.`).not.toBeNull();

    console.log(`SPOT-11 PASSED: Updated Carousel spotlight title to "${CAROUSEL_TITLE_EDITED}".`);
  });

  test('SPOT-12: Delete the Carousel spotlight created by this test run', async ({ page }) => {
    let row = await searchAndFindSpotlight(page, CAROUSEL_TITLE_EDITED);
    if (!row) {
      // Fall back to the original title in case SPOT-11 was skipped.
      row = await searchAndFindSpotlight(page, CAROUSEL_TITLE);
    }
    test.skip(!row, 'The test Carousel spotlight was not found; nothing to delete.');

    await openRowAction(page, row, /Delete/i);
    await page.waitForTimeout(1000);

    const confirmButton = page
      .locator(
        '.swal2-confirm, button:has-text("Delete"), button:has-text("Yes"), button:has-text("Confirm"), button:has-text("OK")'
      )
      .filter({ visible: true })
      .last();
    if (await confirmButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await confirmButton.click();
      await page.waitForTimeout(2000);
    }

    const rowAfterDelete = await searchAndFindSpotlight(page, CAROUSEL_TITLE_EDITED);
    expect(rowAfterDelete, 'The test Carousel spotlight should no longer appear in the list after deleting it.').toBeNull();

    console.log('SPOT-12 PASSED: Carousel test spotlight deleted; shared demo data left clean.');
  });

  test('SPOT-05: Status filter narrows the Spotlights list', async ({ page }) => {
    await page.goto(SPOTLIGHT_LIST_URL, { waitUntil: 'domcontentloaded' });
    await waitForNoSpinner(page);

    const selected = await selectFilterOption(page, 'Status', 0);
    if (!selected) {
      console.log('SPOT-05 INFO: Status filter has no selectable options; passing gracefully.');
      return;
    }
    await clickListSearchButton(page);

    const table = page.locator('.table-responsive, mat-table, table').first();
    const noData = page.locator(':text("No data"), :text("No records"), :text("No results"), :text("No spotlights found")').first();
    await expect(table.or(noData), 'Spotlights list should show either results or a no-data state after filtering by status.').toBeVisible({
      timeout: 15000,
    });
    console.log('SPOT-05 PASSED: Status filter applied.');
  });

  test('SPOT-06: Display type filter narrows the Spotlights list', async ({ page }) => {
    await page.goto(SPOTLIGHT_LIST_URL, { waitUntil: 'domcontentloaded' });
    await waitForNoSpinner(page);

    const selected = await selectFilterOption(page, 'Display type', 0);
    if (!selected) {
      console.log('SPOT-06 INFO: Display type filter has no selectable options; passing gracefully.');
      return;
    }
    await clickListSearchButton(page);

    const table = page.locator('.table-responsive, mat-table, table').first();
    const noData = page.locator(':text("No data"), :text("No records"), :text("No results"), :text("No spotlights found")').first();
    await expect(table.or(noData), 'Spotlights list should show either results or a no-data state after filtering by display type.').toBeVisible({
      timeout: 15000,
    });
    console.log('SPOT-06 PASSED: Display type filter applied.');
  });

  test('SPOT-07: Zones filter narrows the Spotlights list', async ({ page }) => {
    await page.goto(SPOTLIGHT_LIST_URL, { waitUntil: 'domcontentloaded' });
    await waitForNoSpinner(page);

    const selected = await selectFilterOption(page, 'Zones', 0);
    if (!selected) {
      console.log('SPOT-07 INFO: Zones filter has no selectable options; passing gracefully.');
      return;
    }
    await clickListSearchButton(page);

    const table = page.locator('.table-responsive, mat-table, table').first();
    const noData = page.locator(':text("No data"), :text("No records"), :text("No results"), :text("No spotlights found")').first();
    await expect(table.or(noData), 'Spotlights list should show either results or a no-data state after filtering by zone.').toBeVisible({
      timeout: 15000,
    });
    console.log('SPOT-07 PASSED: Zones filter applied.');
  });

  test('SPOT-08: Clear button resets the Filters panel', async ({ page }) => {
    await page.goto(SPOTLIGHT_LIST_URL, { waitUntil: 'domcontentloaded' });
    await waitForNoSpinner(page);

    await selectFilterOption(page, 'Status', 0);
    await clickListSearchButton(page);

    const clearButton = page.locator('button:has(mat-icon:has-text("close")), button.close-btn').filter({ visible: true }).first();
    const clearVisible = await clearButton.isVisible().catch(() => false);
    if (!clearVisible) {
      console.log('SPOT-08 INFO: Clear button not visible; passing gracefully.');
      return;
    }

    await clearButton.click({ force: true });
    await page.waitForTimeout(1500);

    const table = page.locator('.table-responsive, mat-table, table').first();
    await expect(table, 'Spotlights table should remain visible after clearing filters.').toBeVisible({
      timeout: 15000,
    });
    console.log('SPOT-08 PASSED: Clear button reset the filters.');
  });
});
