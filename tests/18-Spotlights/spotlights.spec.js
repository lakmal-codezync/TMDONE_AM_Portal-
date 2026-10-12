// @ts-check
// ============================================================
// TMDone Admin Console - Spotlights
// URL: #/home/spotlight/list (list) and #/home/spotlight/new (create)
//
// Full A-Z lifecycle on TEST-OWNED spotlights only (run-stamped titles):
//   Tile:     create -> view (list row + persisted edit form) -> edit -> delete
//   Carousel: create -> view -> update -> delete
// Both target the Colombo test zone and curate the user's test stores that
// the Curated list offers for Colombo (Food House and Cafe Asiana - Market
// Place; "Cafe Asiana" itself is in SQU ZONE and Eat Fresh Store is not
// offered by the Curated list for Colombo). An afterAll safety net deletes any
// spotlight carrying this run's stamp if a later step failed.
// The list filters (status, display type, target type, zones, clear) are
// verified against the real rows they return.
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from '../helpers/loginHelper.js';
import path from 'node:path';

const SPOTLIGHT_LIST_URL = `${CREDENTIALS.baseUrl}/#/home/spotlight/list`;
const SPOTLIGHT_NEW_URL = `${CREDENTIALS.baseUrl}/#/home/spotlight/new`;
const ZONE_NAME = 'Colombo';
const TEST_STORES = ['Food House', 'Cafe Asiana - Market Place'];
const RUN_STAMP = Date.now();
const SPOTLIGHT_TITLE = `QA Auto Spotlight ${RUN_STAMP}`;
const SPOTLIGHT_TITLE_EDITED = `QA Auto Spotlight ${RUN_STAMP} Edited`;
const CAROUSEL_TITLE = `QA Auto Carousel ${RUN_STAMP}`;
const CAROUSEL_TITLE_EDITED = `QA Auto Carousel ${RUN_STAMP} Edited`;
const SUBTITLE_EN = 'Automated QA test subtitle';
const SUBTITLE_EN_EDITED = `Automated QA subtitle edited ${RUN_STAMP}`;
const TITLE_AR = 'سبوت لايت اختبار الأتمتة';
const HOME_INDEX = '99';
const IMAGE_EN_PATH = path.resolve('tests/fixtures/offer-image.png');
const IMAGE_AR_PATH = path.resolve('tests/fixtures/offer-image-ar.png');

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const START_DATE = new Date();
const END_DATE = new Date(START_DATE);
END_DATE.setDate(END_DATE.getDate() + 7);

/** @param {Date} date */
const formatDate = (date) =>
  `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

/** Spotlight API calls that change data (create / update / delete). */
const isSpotlightWrite = (/** @type {import('@playwright/test').Response} */ response) =>
  /\/api\/spotlights?\//i.test(response.url()) &&
  // The list itself is fetched with POST .../spotlights/list - never a write.
  !/\/(list|search|get[^/]*)(\?|$)/i.test(response.url()) &&
  !['GET', 'OPTIONS'].includes(response.request().method());

/** @param {import('@playwright/test').Page} page */
async function waitForNoSpinner(page) {
  for (const selector of ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay', '.loading-spinner']) {
    await page.locator(selector).first().waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  }
}

/**
 * Real click that survives the cycling loader overlay: wait for it to hide,
 * then click with a short timeout, retrying a few times.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 */
async function clickWhenReady(page, locator, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await waitForNoSpinner(page);
    try {
      await locator.click({ timeout: 8000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(800);
    }
  }
  throw lastError;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} labelText
 */
function fieldByLabel(page, labelText) {
  return page.locator('mat-form-field').filter({ hasText: labelText }).first().locator('input, textarea').first();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} labelText
 * @param {string} value
 */
async function fillByLabel(page, labelText, value) {
  const input = fieldByLabel(page, labelText);
  await expect(input, `"${labelText}" field should be visible.`).toBeVisible({ timeout: 15000 });
  await input.fill(value);
  await expect(input).toHaveValue(value);
}

/**
 * Step 1 Display type is a pair of segment buttons ("grid_view Tile" /
 * "view_carousel Carousel"); the selected one carries the "active" class.
 * @param {import('@playwright/test').Page} page
 * @param {'Tile' | 'Carousel'} displayType
 */
async function selectDisplayType(page, displayType) {
  const button = page.locator('button.segment-btn').filter({ hasText: displayType }).first();
  await expect(button, `"${displayType}" display type button should be visible.`).toBeVisible({ timeout: 15000 });
  await clickWhenReady(page, button);
  await expect(button, `"${displayType}" should become the active display type.`).toHaveClass(/active/, { timeout: 5000 });
}

/**
 * Step 2 image slots are rendered in EN, AR, EN, AR order (Tile image EN/AR,
 * Header image EN/AR). Each pick opens a crop dialog that must be applied.
 * EN slots get offer-image.png, AR slots get offer-image-ar.png.
 * @param {import('@playwright/test').Page} page
 */
async function uploadStepTwoImages(page) {
  const fileInputs = page.locator('input[type="file"][accept*="image"]');
  await expect(fileInputs.first(), 'Spotlight image upload slots should be rendered.').toBeAttached({ timeout: 20000 });
  const slotCount = await fileInputs.count();
  expect(slotCount, 'At least the EN/AR header image slots should exist.').toBeGreaterThanOrEqual(2);

  for (let index = 0; index < slotCount; index += 1) {
    const imagePath = index % 2 === 0 ? IMAGE_EN_PATH : IMAGE_AR_PATH;
    await fileInputs.nth(index).setInputFiles(imagePath);

    const applyButton = page.locator('button').filter({ hasText: /^\s*Apply\s*$/ }).filter({ visible: true }).first();
    await expect(applyButton, `Crop dialog for image slot ${index + 1} should offer Apply.`).toBeVisible({ timeout: 15000 });
    await clickWhenReady(page, applyButton);
    await expect(applyButton, `Crop dialog for image slot ${index + 1} should close after Apply.`).toBeHidden({ timeout: 15000 });
  }
  console.log(`Spotlight image uploads applied: ${slotCount} (EN=offer-image.png, AR=offer-image-ar.png)`);
}

/**
 * Picks an exact date in a mat-datepicker (navigating months when needed)
 * and verifies the input really holds that date.
 * @param {import('@playwright/test').Page} page
 * @param {'Start date' | 'End date'} label
 * @param {Date} date
 */
async function pickCalendarDate(page, label, date) {
  const field = page.locator('mat-form-field').filter({ hasText: label }).first();
  const input = field.locator('input').first();
  const toggle = field.locator('mat-datepicker-toggle button').first();
  await expect(toggle, `${label} calendar toggle should be visible.`).toBeVisible({ timeout: 15000 });

  const calendar = page.locator('mat-calendar').first();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await clickWhenReady(page, toggle);
    if (await calendar.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) break;
  }
  await expect(calendar, `${label} calendar should open.`).toBeVisible({ timeout: 5000 });

  const targetPeriod = new RegExp(`^${MONTHS[date.getMonth()]}[A-Z]*\\s+${date.getFullYear()}$`);
  for (let step = 0; step < 24; step += 1) {
    const period = ((await page.locator('.mat-calendar-period-button').first().innerText()) || '').trim().toUpperCase();
    if (targetPeriod.test(period)) break;
    const next = page.locator('button.mat-calendar-next-button').first();
    await expect(next, `${label}: "Next month" must be enabled to reach ${formatDate(date)} (calendar at ${period}).`).toBeEnabled();
    await next.click();
  }

  const day = page
    .locator('.mat-calendar-body-cell:not(.mat-calendar-body-disabled)')
    .filter({ hasText: new RegExp(`^\\s*${date.getDate()}\\s*$`) })
    .first();
  await expect(day, `${label}: day ${date.getDate()} should be selectable.`).toBeVisible({ timeout: 5000 });
  await day.click();
  await expect(input, `${label} should hold the picked date.`).toHaveValue(formatDate(date), { timeout: 5000 });
}

/**
 * Targeting's Area/Zone picker is an angular2-dual-listbox. Its Add button
 * only enables after a REAL click on an item in the source list.
 * @param {import('@playwright/test').Page} page
 * @param {string} zoneName
 */
async function selectZone(page, zoneName) {
  const zoneToggle = page.locator('button.segment-btn').filter({ hasText: /^\s*Zone\s*$/ }).first();
  await expect(zoneToggle, 'Zone toggle should be visible in Targeting.').toBeVisible({ timeout: 15000 });
  await clickWhenReady(page, zoneToggle);
  await expect(zoneToggle).toHaveClass(/active/, { timeout: 5000 });

  const zoneRow = page.locator('li').filter({ hasText: new RegExp(`^\\s*${zoneName}\\s*$`) }).first();
  await expect(zoneRow, `"${zoneName}" should be listed under Available Zones.`).toBeVisible({ timeout: 15000 });

  const addButton = page.locator('button[name="addBtn"]').first();
  await zoneRow.click();
  await expect(addButton, `Add button should enable once "${zoneName}" is clicked.`).toBeEnabled({ timeout: 5000 });
  await addButton.click();

  const badge = page.locator('.enhanced-dual-list-badge').first();
  await expect(badge, `Selected-zones badge should show "${zoneName}" added.`).toHaveText(/1 selected/, { timeout: 5000 });
}

/**
 * A Curated store tile: a button.store-tile holding the store name (EN/AR)
 * and a mat-checkbox.store-tile-check with no label text of its own.
 * @param {import('@playwright/test').Page} page
 * @param {string} storeName
 */
function curatedStoreTile(page, storeName) {
  // The tile text is "<EN name><AR name>" with no separator (e.g. "Food HouseFood House"),
  // so there is no word boundary after the name; the lookahead keeps "Food House - Al Khoudh" out.
  const escaped = storeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.locator('button.store-tile').filter({ hasText: new RegExp(`^\\s*${escaped}(?!\\s*-)`) }).first();
}

/**
 * Step 5 "Curated" store selection: tick the user's test stores.
 * @param {import('@playwright/test').Page} page
 */
async function selectCuratedTestStores(page) {
  const curatedTab = page.locator('button.criteria-tab').filter({ hasText: 'Curated' }).first();
  await expect(curatedTab, 'Store selection should offer the Curated tab.').toBeVisible({ timeout: 15000 });
  await clickWhenReady(page, curatedTab);
  await expect(curatedTab).toHaveClass(/active/, { timeout: 5000 });

  for (const storeName of TEST_STORES) {
    const storeTile = curatedStoreTile(page, storeName);
    await expect(storeTile, `Curated list should offer test store "${storeName}" for ${ZONE_NAME}.`).toBeVisible({ timeout: 20000 });
    await clickWhenReady(page, storeTile);
    await expect(storeTile.locator('mat-checkbox.store-tile-check'), `"${storeName}" should be ticked.`).toHaveClass(/mat-checkbox-checked/, {
      timeout: 5000,
    });
  }
  await expect(
    page.getByText(new RegExp(`^\\s*${TEST_STORES.length} selected\\s*$`)).first(),
    'Curated selection count should match the number of test stores.'
  ).toBeVisible();
}

/**
 * Carousel-only: "Featured items" requires a minimum number of items,
 * surfaced as "Select N more items to reach the minimum of N".
 * @param {import('@playwright/test').Page} page
 */
async function selectFeaturedItems(page) {
  const minimumPrompt = page.getByText(/Select \d+ more items? to reach the minimum/i).first();
  await expect(minimumPrompt, 'Carousel should ask for a minimum number of featured items.').toBeVisible({ timeout: 20000 });

  const promptText = await minimumPrompt.innerText();
  const needed = parseInt((promptText.match(/Select (\d+) more/i) || [])[1] || '0', 10);
  expect(needed, `Could not read the featured-item minimum from "${promptText}".`).toBeGreaterThan(0);

  const checkboxes = page.locator('mat-checkbox.featured-item-tile-check');
  await expect(checkboxes.first(), 'Featured items from the curated test stores should be listed.').toBeVisible({ timeout: 20000 });
  const available = await checkboxes.count();
  expect(available, `The curated test stores offer ${available} featured items but ${needed} are required.`).toBeGreaterThanOrEqual(needed);

  for (let index = 0; index < needed; index += 1) {
    await checkboxes.nth(index).click();
  }
  await expect(minimumPrompt, 'Featured items minimum should be satisfied.').toBeHidden({ timeout: 10000 });
}

/**
 * Landing page "Top deals" widget makes the backend reject the save unless a
 * deal is configured - disable it (it is optional) instead of picking deals.
 * @param {import('@playwright/test').Page} page
 */
async function disableTopDealsWidget(page) {
  const topDealsCard = page.locator('.widget-card').filter({ has: page.locator('.widget-type-label', { hasText: 'Top deals' }) }).first();
  const topDealsToggle = topDealsCard.locator('mat-slide-toggle').first();
  if (!(await topDealsToggle.isVisible().catch(() => false))) return;
  if (/mat-checked/.test((await topDealsToggle.getAttribute('class')) || '')) {
    await topDealsToggle.locator('label').click();
    await expect(topDealsToggle).not.toHaveClass(/mat-checked/, { timeout: 5000 });
  }
}

/**
 * Saves the wizard as a draft and returns the backend response.
 * @param {import('@playwright/test').Page} page
 * @param {RegExp} urlPattern
 */
async function saveDraft(page, urlPattern) {
  const saveDraftButton = page.locator('button').filter({ hasText: /^\s*Save draft\s*$/ }).filter({ visible: true }).first();
  await expect(saveDraftButton, 'Save draft should be enabled once required fields are filled.').toBeEnabled({ timeout: 20000 });

  const responsePromise = page.waitForResponse((response) => isSpotlightWrite(response) && urlPattern.test(response.url()), {
    timeout: 45000,
  });
  await clickWhenReady(page, saveDraftButton);
  const response = await responsePromise;
  const body = await response.text().catch(() => '');
  console.log(`Spotlight save: ${response.request().method()} ${response.url()} -> ${response.status()} ${body.slice(0, 200)}`);
  expect(response.status(), `Spotlight save should succeed (got ${response.status()}: ${body.slice(0, 300)}).`).toBe(200);
  await waitForNoSpinner(page);
  return response;
}

/**
 * Runs the New Spotlight wizard (Basics -> Appearance -> Schedule ->
 * Targeting -> Store selection -> Landing widgets [-> Featured items]) and
 * saves it as a draft.
 * @param {import('@playwright/test').Page} page
 * @param {{ title: string, displayType: 'Tile' | 'Carousel' }} options
 */
async function createSpotlight(page, { title, displayType }) {
  await page.goto(SPOTLIGHT_NEW_URL, { waitUntil: 'domcontentloaded' });
  await waitForNoSpinner(page);
  await expect(page).toHaveURL(/spotlight\/new/i, { timeout: 30000 });
  await expect(fieldByLabel(page, 'Title EN'), 'New Spotlight form should render.').toBeVisible({ timeout: 30000 });

  // Step 1: Basics
  await selectDisplayType(page, displayType);
  await fillByLabel(page, 'Title EN', title);
  await fillByLabel(page, 'Title AR', TITLE_AR);
  await fillByLabel(page, 'Subtitle EN', SUBTITLE_EN);
  await fillByLabel(page, 'Subtitle AR', 'العنوان الفرعي للاختبار الآلي');
  await fillByLabel(page, 'Spotlight index on home', HOME_INDEX);

  // Step 2: Appearance - required EN/AR images
  await uploadStepTwoImages(page);

  // Step 3: Schedule
  await pickCalendarDate(page, 'Start date', START_DATE);
  await pickCalendarDate(page, 'End date', END_DATE);

  // Step 4: Targeting - Zone = Colombo
  await selectZone(page, ZONE_NAME);

  // Step 5: Store selection - Curated test stores
  await selectCuratedTestStores(page);

  // Step 6: Landing page widgets
  await disableTopDealsWidget(page);

  // Carousel only: Featured items
  if (displayType === 'Carousel') {
    await selectFeaturedItems(page);
  }

  await saveDraft(page, /create/i);
}

/** @param {import('@playwright/test').Page} page */
function dataRows(page) {
  return page.locator('tbody tr').filter({ has: page.locator('button:has(mat-icon:has-text("more_horiz"))') });
}

/** @param {import('@playwright/test').Page} page */
async function gotoList(page) {
  await page.goto(SPOTLIGHT_LIST_URL, { waitUntil: 'domcontentloaded' });
  await waitForNoSpinner(page);
  await expect(page).toHaveURL(/spotlight\/list/i, { timeout: 30000 });
  await expect(page.locator('mat-select[formcontrolname="status"]'), 'Spotlights Filters panel should render.').toBeVisible({ timeout: 30000 });
}

/** @param {import('@playwright/test').Page} page */
async function clickListSearch(page) {
  await clickWhenReady(page, page.locator('button[mattooltip="Search"]').filter({ visible: true }).first());
  await waitForNoSpinner(page);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} term
 */
async function searchList(page, term) {
  await gotoList(page);
  const searchInput = page.locator('input[formcontrolname="searchTerm"]').first();
  await expect(searchInput).toBeVisible({ timeout: 15000 });
  await searchInput.fill(term);
  await clickListSearch(page);
}

/**
 * Searches the list for a unique title and returns the row (or null when the
 * search settles without it).
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 */
async function findSpotlightRow(page, title) {
  await searchList(page, title);
  const row = dataRows(page).filter({ has: page.locator('td', { hasText: new RegExp(`^\\s*${title}\\s*$`) }) }).first();
  const found = await row.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  return found ? row : null;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} row
 * @param {RegExp} actionText
 */
async function openRowAction(page, row, actionText) {
  const menuButton = row.locator('button:has(mat-icon:has-text("more_horiz"))').first();
  await expect(menuButton, 'Spotlight row should expose a row-actions menu.').toBeVisible({ timeout: 10000 });
  await clickWhenReady(page, menuButton);

  const menuItem = page.locator('.mat-menu-panel button, [role="menuitem"]').filter({ hasText: actionText }).first();
  await expect(menuItem, `Row-actions menu should expose "${actionText}".`).toBeVisible({ timeout: 10000 });
  await clickWhenReady(page, menuItem);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 */
async function openEditForm(page, title) {
  const row = await findSpotlightRow(page, title);
  expect(row, `"${title}" should be listed before it can be opened.`).not.toBeNull();
  await openRowAction(page, /** @type {import('@playwright/test').Locator} */ (row), /Edit/i);
  await expect(page).not.toHaveURL(/spotlight\/list/i, { timeout: 30000 });
  await waitForNoSpinner(page);
  await expect(fieldByLabel(page, 'Title EN'), 'Edit form should load the spotlight title.').toHaveValue(title, { timeout: 30000 });
  console.log(`Opened edit form for "${title}": ${page.url()}`);
}

/**
 * Verifies the persisted wizard values in the edit form.
 * @param {import('@playwright/test').Page} page
 * @param {{ title: string, displayType: 'Tile' | 'Carousel', subtitle: string }} expected
 */
async function verifyEditFormValues(page, expected) {
  await expect(fieldByLabel(page, 'Title EN')).toHaveValue(expected.title);
  await expect(fieldByLabel(page, 'Title AR')).toHaveValue(TITLE_AR);
  await expect(fieldByLabel(page, 'Subtitle EN')).toHaveValue(expected.subtitle);
  await expect(page.locator('input[formcontrolname="homeIndex"]')).toHaveValue(HOME_INDEX);
  await expect(page.locator('button.segment-btn').filter({ hasText: expected.displayType }).first()).toHaveClass(/active/);
  await expect(page.locator('input[formcontrolname="startDate"]')).toHaveValue(formatDate(START_DATE));
  await expect(page.locator('input[formcontrolname="endDate"]')).toHaveValue(formatDate(END_DATE));
  await expect(page.locator('button.segment-btn').filter({ hasText: /^\s*Zone\s*$/ }).first()).toHaveClass(/active/);
  await expect(page.locator('.enhanced-dual-list-badge').first()).toHaveText(/1 selected/, { timeout: 15000 });
  await expect(page.locator('button.criteria-tab').filter({ hasText: 'Curated' }).first()).toHaveClass(/active/, { timeout: 15000 });
  // Persisted curated stores are shown as selected chips ("<name>" + "Remove <name>")
  // above the tile grid (the grid itself is paginated and may not show them).
  await expect(page.getByText(new RegExp(`^\\s*${TEST_STORES.length} selected\\s*$`)).first()).toBeVisible({ timeout: 20000 });
  for (const storeName of TEST_STORES) {
    await expect(
      page.getByRole('button', { name: `Remove ${storeName}`, exact: true }),
      `Curated test store "${storeName}" should still be selected.`
    ).toBeVisible({ timeout: 20000 });
  }
}

/**
 * Edits the title and subtitle of an existing test spotlight and saves.
 * @param {import('@playwright/test').Page} page
 * @param {string} currentTitle
 * @param {string} newTitle
 */
async function editSpotlight(page, currentTitle, newTitle) {
  await openEditForm(page, currentTitle);
  await fillByLabel(page, 'Title EN', newTitle);
  await fillByLabel(page, 'Subtitle EN', SUBTITLE_EN_EDITED);
  await saveDraft(page, /update|edit|spotlights?\/[0-9a-f]{24}/i);
}

/**
 * Deletes a test spotlight via its row menu and confirmation dialog.
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 */
async function deleteSpotlight(page, title) {
  const row = await findSpotlightRow(page, title);
  if (!row) return false;
  await expect(row, 'Only a run-stamped test spotlight may be deleted.').toContainText(String(RUN_STAMP));

  await openRowAction(page, row, /Delete/i);
  const dialog = page.locator('mat-dialog-container, .swal2-popup').filter({ visible: true }).last();
  await expect(dialog, 'Delete should ask for confirmation.').toBeVisible({ timeout: 10000 });
  const confirmButton = dialog.locator('.swal2-confirm, button').filter({ hasText: /^\s*(Delete|Yes.*|Confirm|OK)\s*$/i }).first();
  await expect(confirmButton, 'Delete confirmation should expose a confirm button.').toBeVisible({ timeout: 10000 });

  // The app deletes with GET /api/spotlights/delete?id=<id>.
  const responsePromise = page.waitForResponse(
    (response) => /\/api\/spotlights?\/delete\b/i.test(response.url()) && response.request().method() !== 'OPTIONS',
    { timeout: 30000 }
  );
  await clickWhenReady(page, confirmButton);
  const response = await responsePromise;
  console.log(`Spotlight delete: ${response.request().method()} ${response.url()} -> ${response.status()}`);
  expect(response.status(), 'Spotlight delete request should succeed.').toBe(200);
  await waitForNoSpinner(page);
  return true;
}

/**
 * Selects a filter option by its mat-select formcontrolname.
 * @param {import('@playwright/test').Page} page
 * @param {string} controlName
 * @param {RegExp} optionText
 */
async function selectFilter(page, controlName, optionText) {
  const select = page.locator(`mat-select[formcontrolname="${controlName}"]`).first();
  await clickWhenReady(page, select);
  const option = page.locator('mat-option').filter({ hasText: optionText }).first();
  await expect(option, `Filter "${controlName}" should offer ${optionText}.`).toBeVisible({ timeout: 10000 });
  await option.click();
  // Close the panel if it stays open (multi-select); no dialog is open here.
  if (await page.locator('.cdk-overlay-pane mat-option').first().isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('.cdk-overlay-pane mat-option').first()).toBeHidden({ timeout: 5000 });
}

/**
 * Asserts the list settles on at least one row and every row matches.
 * @param {import('@playwright/test').Page} page
 * @param {RegExp} rowPattern
 * @param {string} description
 */
async function expectAllRowsMatch(page, rowPattern, description) {
  await expect
    .poll(
      async () => {
        const texts = await dataRows(page).allInnerTexts();
        return texts.length > 0 && texts.every((text) => rowPattern.test(text.replace(/\s+/g, ' ')));
      },
      { message: `Every listed spotlight should match ${description}.`, timeout: 30000 }
    )
    .toBe(true);
}

const createdTitles = new Set();

test.describe.serial('18 - Spotlights - View, Create, Edit, Delete', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(300000);
    await loginToApp(page);
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(300000);
    if (createdTitles.size === 0) return;
    const page = await browser.newPage();
    try {
      await loginToApp(page);
      for (const title of [SPOTLIGHT_TITLE_EDITED, SPOTLIGHT_TITLE, CAROUSEL_TITLE_EDITED, CAROUSEL_TITLE]) {
        if (await deleteSpotlight(page, title).catch(() => false)) {
          console.log(`afterAll safety net: deleted leftover spotlight "${title}".`);
          if (await findSpotlightRow(page, title).catch(() => null)) {
            console.log(`WARNING: afterAll could not remove "${title}" - delete it manually.`);
          }
        }
      }
    } finally {
      await page.close();
    }
  });

  test('SPOT-01: Spotlights list page loads with filters and create control', async ({ page }) => {
    await gotoList(page);
    await expect(page.locator('h1, h2, h3, h4').filter({ hasText: /^\s*Spotlights\s*$/ }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'New Spotlight' }).first()).toBeVisible({ timeout: 15000 });
    for (const control of ['status', 'displayType', 'targetType', 'zoneIds', 'areaIds']) {
      await expect(page.locator(`mat-select[formcontrolname="${control}"]`), `Filter "${control}" should be present.`).toBeVisible();
    }
    await expect(page.locator('input[formcontrolname="searchTerm"]')).toBeVisible();
    await expect(page.locator('input[formcontrolname="startDate"]')).toBeVisible();
    await expect(page.locator('button[mattooltip="Search"]').first()).toBeVisible();
    await expect(page.locator('button[mattooltip="Clear Filters"]').first()).toBeVisible();

    const headers = (await page.locator('thead th').allInnerTexts()).map((h) => h.trim().toUpperCase());
    for (const expected of ['CODE', 'TITLE (EN)', 'DISPLAY TYPE', 'TARGET', 'HOME INDEX', 'START DATE', 'END DATE', 'EXPIRY', 'STATUS', 'IS ACTIVE', 'ACTIONS']) {
      expect(headers, `Spotlights table should have a "${expected}" column.`).toContain(expected);
    }
    await expect(dataRows(page).first(), 'Spotlights list should render rows.').toBeVisible({ timeout: 20000 });
    console.log('SPOT-01 PASSED: Spotlights list page loaded with filters, search, create and table columns.');
  });

  test('SPOT-02: Create a Tile spotlight targeting the Colombo zone and test stores', async ({ page }) => {
    createdTitles.add(SPOTLIGHT_TITLE);
    await createSpotlight(page, { title: SPOTLIGHT_TITLE, displayType: 'Tile' });

    const row = await findSpotlightRow(page, SPOTLIGHT_TITLE);
    expect(row, `"${SPOTLIGHT_TITLE}" should appear in the Spotlights list after saving.`).not.toBeNull();
    console.log(`SPOT-02 PASSED: Created Tile spotlight "${SPOTLIGHT_TITLE}" targeting ${ZONE_NAME}.`);
  });

  test('SPOT-13: View the created Tile spotlight (list row, code search and persisted form)', async ({ page }) => {
    const row = await findSpotlightRow(page, SPOTLIGHT_TITLE);
    expect(row, `"${SPOTLIGHT_TITLE}" must exist (created in SPOT-02).`).not.toBeNull();
    const createdRow = /** @type {import('@playwright/test').Locator} */ (row);
    await expect(createdRow).toContainText('Tile');
    await expect(createdRow).toContainText(`Zone ${ZONE_NAME}`);
    await expect(createdRow).toContainText(HOME_INDEX);
    await expect(createdRow).toContainText(formatDate(START_DATE));
    await expect(createdRow).toContainText(formatDate(END_DATE));
    await expect(createdRow).toContainText('DRAFT');

    const code = ((await createdRow.locator('td').first().innerText()) || '').trim();
    expect(code, 'Created spotlight should get an SPTLT code.').toMatch(/^SPTLT-\d+$/);
    await searchList(page, code);
    await expect.poll(async () => dataRows(page).count(), { message: `Searching code ${code} should return exactly one row.` }).toBe(1);
    await expect(dataRows(page).first()).toContainText(SPOTLIGHT_TITLE);

    await openEditForm(page, SPOTLIGHT_TITLE);
    await verifyEditFormValues(page, { title: SPOTLIGHT_TITLE, displayType: 'Tile', subtitle: SUBTITLE_EN });
    console.log(`SPOT-13 PASSED: "${SPOTLIGHT_TITLE}" (${code}) shows its persisted values.`);
  });

  test('SPOT-15: Status and Display type filters combined with search find the DRAFT test spotlight', async ({ page }) => {
    await gotoList(page);
    await page.locator('input[formcontrolname="searchTerm"]').fill(SPOTLIGHT_TITLE);
    await selectFilter(page, 'status', /^\s*DRAFT\s*$/);
    await selectFilter(page, 'displayType', /Tile/);
    await clickListSearch(page);
    await expectAllRowsMatch(page, /\bDRAFT\b/, 'status DRAFT');
    await expectAllRowsMatch(page, /grid_view Tile/, 'display type Tile');
    await expect(dataRows(page).filter({ hasText: SPOTLIGHT_TITLE }), 'The DRAFT Tile test spotlight should match.').toHaveCount(1, { timeout: 20000 });

    // Same search with only PUBLISH must exclude the unpublished test spotlight. Status is a
    // multi-select and the filters survive navigation, so reset them with Clear Filters first.
    await clickWhenReady(page, page.locator('button[mattooltip="Clear Filters"]').first());
    await waitForNoSpinner(page);
    await expect(page.locator('mat-select[formcontrolname="status"]')).not.toContainText('DRAFT', { timeout: 10000 });
    await page.locator('input[formcontrolname="searchTerm"]').fill(SPOTLIGHT_TITLE);
    await selectFilter(page, 'status', /^\s*PUBLISH\s*$/);
    await clickListSearch(page);
    await expect(page.getByRole('heading', { name: 'No spotlights found' }), 'PUBLISH + test title should return nothing.').toBeVisible({ timeout: 20000 });
    await expect(dataRows(page).filter({ hasText: SPOTLIGHT_TITLE })).toHaveCount(0);
    console.log('SPOT-15 PASSED: DRAFT/Tile filters include and PUBLISH excludes the test spotlight.');
  });

  test('SPOT-16: Row actions menu of the test spotlight offers Edit and Delete', async ({ page }) => {
    const row = await findSpotlightRow(page, SPOTLIGHT_TITLE);
    expect(row, `"${SPOTLIGHT_TITLE}" must exist (created in SPOT-02).`).not.toBeNull();
    await clickWhenReady(page, /** @type {import('@playwright/test').Locator} */ (row).locator('button:has(mat-icon:has-text("more_horiz"))').first());
    const items = page.locator('.mat-menu-panel button');
    await expect(items.first()).toBeVisible({ timeout: 10000 });
    const labels = (await items.allInnerTexts()).map((t) => t.replace(/^[a-z_]+(?=[A-Z])/, '').trim());
    expect(labels).toEqual(['Edit', 'Delete']);
    // Close without choosing (no dialog is open, so Escape is safe).
    await page.keyboard.press('Escape');
    await expect(page.locator('.mat-menu-panel')).toHaveCount(0, { timeout: 5000 });
    console.log('SPOT-16 PASSED: Row actions menu offers Edit and Delete.');
  });

  test('SPOT-03: Edit the created Tile spotlight', async ({ page }) => {
    createdTitles.add(SPOTLIGHT_TITLE_EDITED);
    await editSpotlight(page, SPOTLIGHT_TITLE, SPOTLIGHT_TITLE_EDITED);

    const editedRow = await findSpotlightRow(page, SPOTLIGHT_TITLE_EDITED);
    expect(editedRow, `"${SPOTLIGHT_TITLE_EDITED}" should appear in the list after editing.`).not.toBeNull();
    expect(await findSpotlightRow(page, SPOTLIGHT_TITLE), 'The old title should no longer be listed.').toBeNull();

    await openEditForm(page, SPOTLIGHT_TITLE_EDITED);
    await expect(fieldByLabel(page, 'Subtitle EN'), 'Edited subtitle should be persisted.').toHaveValue(SUBTITLE_EN_EDITED);
    console.log(`SPOT-03 PASSED: Edited spotlight to "${SPOTLIGHT_TITLE_EDITED}".`);
  });

  test('SPOT-04: Delete the Tile spotlight created by this test run', async ({ page }) => {
    const deleted = await deleteSpotlight(page, SPOTLIGHT_TITLE_EDITED);
    expect(deleted, `"${SPOTLIGHT_TITLE_EDITED}" must exist to be deleted.`).toBe(true);
    expect(await findSpotlightRow(page, SPOTLIGHT_TITLE_EDITED), 'Deleted spotlight should no longer be listed.').toBeNull();
    createdTitles.delete(SPOTLIGHT_TITLE);
    createdTitles.delete(SPOTLIGHT_TITLE_EDITED);
    console.log('SPOT-04 PASSED: Test Tile spotlight deleted.');
  });

  test('SPOT-09: Create a Carousel spotlight targeting the Colombo zone and test stores', async ({ page }) => {
    createdTitles.add(CAROUSEL_TITLE);
    await createSpotlight(page, { title: CAROUSEL_TITLE, displayType: 'Carousel' });

    const row = await findSpotlightRow(page, CAROUSEL_TITLE);
    expect(row, `"${CAROUSEL_TITLE}" should appear in the Spotlights list after saving.`).not.toBeNull();
    console.log(`SPOT-09 PASSED: Created Carousel spotlight "${CAROUSEL_TITLE}" targeting ${ZONE_NAME}.`);
  });

  test('SPOT-10: View the created Carousel spotlight and its persisted values', async ({ page }) => {
    const row = await findSpotlightRow(page, CAROUSEL_TITLE);
    expect(row, `"${CAROUSEL_TITLE}" must exist (created in SPOT-09).`).not.toBeNull();
    const createdRow = /** @type {import('@playwright/test').Locator} */ (row);
    await expect(createdRow).toContainText('Carousel');
    await expect(createdRow).toContainText(`Zone ${ZONE_NAME}`);
    await expect(createdRow).toContainText('DRAFT');

    await openEditForm(page, CAROUSEL_TITLE);
    await verifyEditFormValues(page, { title: CAROUSEL_TITLE, displayType: 'Carousel', subtitle: SUBTITLE_EN });
    console.log(`SPOT-10 PASSED: "${CAROUSEL_TITLE}" confirms Carousel display type, ${ZONE_NAME} targeting and curated test stores.`);
  });

  test('SPOT-11: Update the created Carousel spotlight', async ({ page }) => {
    createdTitles.add(CAROUSEL_TITLE_EDITED);
    await editSpotlight(page, CAROUSEL_TITLE, CAROUSEL_TITLE_EDITED);

    const editedRow = await findSpotlightRow(page, CAROUSEL_TITLE_EDITED);
    expect(editedRow, `"${CAROUSEL_TITLE_EDITED}" should appear in the list after updating.`).not.toBeNull();
    await expect(/** @type {import('@playwright/test').Locator} */ (editedRow)).toContainText('Carousel');
    console.log(`SPOT-11 PASSED: Updated Carousel spotlight to "${CAROUSEL_TITLE_EDITED}".`);
  });

  test('SPOT-12: Delete the Carousel spotlight created by this test run', async ({ page }) => {
    const deleted = await deleteSpotlight(page, CAROUSEL_TITLE_EDITED);
    expect(deleted, `"${CAROUSEL_TITLE_EDITED}" must exist to be deleted.`).toBe(true);
    expect(await findSpotlightRow(page, CAROUSEL_TITLE_EDITED), 'Deleted spotlight should no longer be listed.').toBeNull();
    createdTitles.delete(CAROUSEL_TITLE);
    createdTitles.delete(CAROUSEL_TITLE_EDITED);
    console.log('SPOT-12 PASSED: Carousel test spotlight deleted.');
  });

  test('SPOT-05: Status filter returns only spotlights with that status', async ({ page }) => {
    await gotoList(page);
    await selectFilter(page, 'status', /^\s*PUBLISH\s*$/);
    await clickListSearch(page);
    await expectAllRowsMatch(page, /\bPUBLISH\b/, 'status PUBLISH');
    console.log('SPOT-05 PASSED: Status filter returns only PUBLISH spotlights.');
  });

  test('SPOT-06: Display type filter returns only spotlights of that type', async ({ page }) => {
    await gotoList(page);
    await selectFilter(page, 'displayType', /Carousel/);
    await clickListSearch(page);
    await expectAllRowsMatch(page, /view_carousel Carousel/, 'display type Carousel');
    console.log('SPOT-06 PASSED: Display type filter returns only Carousel spotlights.');
  });

  test('SPOT-07: Zones filter returns only spotlights targeting that zone', async ({ page }) => {
    await gotoList(page);
    await selectFilter(page, 'zoneIds', new RegExp(`^\\s*${ZONE_NAME}\\s*$`));
    await clickListSearch(page);
    await expectAllRowsMatch(page, new RegExp(ZONE_NAME), `zone ${ZONE_NAME}`);
    console.log(`SPOT-07 PASSED: Zones filter returns only ${ZONE_NAME} spotlights.`);
  });

  test('SPOT-14: Target type filter returns only spotlights with that target type', async ({ page }) => {
    await gotoList(page);
    await selectFilter(page, 'targetType', /^\s*Zone\s*$/);
    await clickListSearch(page);
    await expectAllRowsMatch(page, /\bZone\b/, 'target type Zone');
    console.log('SPOT-14 PASSED: Target type filter returns only Zone-targeted spotlights.');
  });

  test('SPOT-08: Clear Filters resets the filters and restores the full list', async ({ page }) => {
    await gotoList(page);
    await expect(dataRows(page).first()).toBeVisible({ timeout: 20000 });
    const unfilteredCount = await dataRows(page).count();
    const unfilteredTexts = await dataRows(page).allInnerTexts();
    const draftExists = unfilteredTexts.some((text) => /\bDRAFT\b/.test(text));

    await selectFilter(page, 'status', /^\s*PUBLISH\s*$/);
    await clickListSearch(page);
    await expectAllRowsMatch(page, /\bPUBLISH\b/, 'status PUBLISH');
    if (draftExists) {
      expect(await dataRows(page).count(), 'Filtering by PUBLISH should hide the DRAFT spotlights.').toBeLessThan(unfilteredCount);
    }

    await clickWhenReady(page, page.locator('button[mattooltip="Clear Filters"]').first());
    await waitForNoSpinner(page);
    await expect(page.locator('mat-select[formcontrolname="status"]'), 'Status filter should be cleared.').not.toContainText('PUBLISH', {
      timeout: 10000,
    });
    await expect.poll(async () => dataRows(page).count(), { message: 'Clearing filters should restore the full list.', timeout: 30000 }).toBe(unfilteredCount);
    console.log(`SPOT-08 PASSED: Clear Filters restored all ${unfilteredCount} spotlights.`);
  });
});
