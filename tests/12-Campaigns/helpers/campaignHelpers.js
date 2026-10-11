// @ts-check
// ============================================================
// TMDone Admin Console - Campaigns lane shared helpers
// ------------------------------------------------------------
// Everything in this folder that creates data on the shared demo
// environment goes through these helpers so that:
//   * every record has a unique run-stamped name/code,
//   * rows are always located by that unique value (never rows.first()),
//   * the test data policy is respected (zone Colombo; test stores Food House and
//     "Cafe Asiana - Market Place" - the only policy stores the Colombo store
//     picker offers: "Cafe Asiana" itself is in SQU ZONE and "Eat Fresh Store"
//     is currently not offered by the campaign store picker),
//   * clean-up deletes exactly the record a test created.
// This is a plain module (not a spec), so importing it is safe.
// ============================================================

import { expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from '../../helpers/loginHelper.js';

export const TEST_ZONE = 'Colombo';
export const TEST_STORES = ['Food House', 'Cafe Asiana - Market Place'];
export const API_HOST = /amportal\.demo\.dr\.tmd1\.org/;

const SPINNERS = '.ngx-spinner-overlay, app-page-loader, .loading-overlay, .loading-spinner';

/** @param {string} value */
export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} value */
export function exactText(value) {
  return new RegExp(`^\\s*${escapeRegex(value)}\\s*$`);
}

/** @param {Date} date */
export function formatDDMMYYYY(date) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Date `months` months after `from` (clamped to the end of the target month).
 * @param {Date} from
 * @param {number} months
 */
export function addMonths(from, months) {
  const result = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(from.getDate(), lastDay));
  return result;
}

/** @param {Date} from @param {number} days */
export function addDays(from, days) {
  const result = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

// ===================== Generic UI primitives =====================

/** @param {import('@playwright/test').Page} page */
export async function waitForSpinner(page) {
  const blockers = page.locator(SPINNERS);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const visible = await blockers
      .evaluateAll((nodes) =>
        nodes.filter((node) => {
          const el = /** @type {HTMLElement} */ (node);
          const style = window.getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
        }).length
      )
      .catch(() => 0);
    if (visible === 0) return;
    await page.waitForTimeout(500);
  }
}

/**
 * Real (non-forced) click that survives the app's cycling loading overlay.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 * @param {{ attempts?: number, timeout?: number }} [options]
 */
export async function realClick(page, locator, options = {}) {
  const { attempts = 5, timeout = 8000 } = options;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await waitForSpinner(page);
    try {
      await locator.click({ timeout });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(600);
    }
  }
  throw lastError;
}

/**
 * The SweetAlert2 popup that is currently shown.
 * @param {import('@playwright/test').Page} page
 */
export function swalPopup(page) {
  return page.locator('.swal2-popup').filter({ visible: true }).last();
}

/**
 * Waits for a SweetAlert popup, returns its text and confirms it with its OK/confirm button.
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout]
 */
export async function readAndConfirmSwal(page, timeout = 20000) {
  const popup = swalPopup(page);
  await popup.waitFor({ state: 'visible', timeout });
  const text = ((await popup.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  await realClick(page, popup.locator('button.swal2-confirm'));
  await popup.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  return text;
}

/**
 * Asserts the success SweetAlert shows `text`, then dismisses it (it may also
 * close by itself, so the OK click is only made while it is still shown).
 * @param {import('@playwright/test').Page} page
 * @param {string | RegExp} text
 */
export async function expectSuccessSwal(page, text) {
  const popup = swalPopup(page);
  await expect(popup).toContainText(text, { timeout: 30000 });
  const ok = popup.locator('button.swal2-confirm');
  for (let attempt = 0; attempt < 5 && (await popup.isVisible().catch(() => false)); attempt += 1) {
    await ok.click({ timeout: 3000 }).catch(() => {});
    await popup.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
  await expect(page.locator('.swal2-popup').filter({ visible: true })).toHaveCount(0, { timeout: 10000 });
}

/**
 * Opens a mat-select and picks the option whose text matches `option` exactly
 * (string) or the regex. Closes multi-select panels by clicking the transparent backdrop
 * corner (Escape would close the surrounding dialog).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} select
 * @param {string | RegExp | (string | RegExp)[]} option
 */
export async function chooseMatOption(page, select, option) {
  const wanted = Array.isArray(option) ? option : [option];
  await realClick(page, select);
  const panel = page.locator('.mat-select-panel').filter({ visible: true }).last();
  await panel.waitFor({ state: 'visible', timeout: 15000 });
  for (const item of wanted) {
    const matcher = typeof item === 'string' ? exactText(item) : item;
    const opt = panel.locator('mat-option').filter({ hasText: matcher }).first();
    await expect(opt, `Option ${String(item)} should be offered`).toBeVisible({ timeout: 20000 });
    const selected = (await opt.getAttribute('aria-selected')) === 'true';
    if (!selected || wanted.length === 1) await opt.click();
    await page.waitForTimeout(300);
  }
  if (await panel.isVisible().catch(() => false)) {
    await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } }).catch(() => {});
    await panel.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}

/**
 * Picks a date in a mat-datepicker via its calendar and verifies the input value.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} toggleButton  the mat-datepicker-toggle button
 * @param {import('@playwright/test').Locator} input           the related (read-only) input
 * @param {Date} date
 */
export async function pickCalendarDate(page, toggleButton, input, date) {
  await realClick(page, toggleButton);
  const calendar = page.locator('mat-calendar').filter({ visible: true }).last();
  await calendar.waitFor({ state: 'visible', timeout: 10000 });
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const target = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  const period = calendar.locator('.mat-calendar-period-button');
  for (let step = 0; step < 36; step += 1) {
    const label = ((await period.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (label === target) break;
    const [labelMonth, labelYear] = label.split(' ');
    const labelIndex = Number(labelYear) * 12 + monthNames.indexOf(labelMonth);
    const targetIndex = date.getFullYear() * 12 + date.getMonth();
    const nav = calendar.locator(targetIndex > labelIndex ? 'button.mat-calendar-next-button' : 'button.mat-calendar-previous-button');
    if (await nav.isDisabled().catch(() => true)) {
      throw new Error(`Calendar cannot navigate to ${target} (stuck at ${label}; navigation button disabled).`);
    }
    await nav.click();
    await page.waitForTimeout(150);
  }
  const cell = calendar
    .locator('.mat-calendar-body-cell:not(.mat-calendar-body-disabled)')
    .filter({ has: page.locator('.mat-calendar-body-cell-content', { hasText: exactText(String(date.getDate())) }) })
    .first();
  await expect(cell, `Day ${date.getDate()} of ${target} should be selectable`).toBeVisible({ timeout: 10000 });
  await cell.click();
  await calendar.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  await expect(input).toHaveValue(formatDDMMYYYY(date), { timeout: 10000 });
}

/**
 * Moves the named entries of an angular-dual-listbox (`dual-list`) from the
 * unselected list to the selected one and verifies the result.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} scope
 * @param {string[]} names
 */
export async function addToDualList(page, scope, names) {
  const lists = scope.locator('dual-list .listbox');
  const source = lists.first();
  const destination = lists.nth(1);
  await expect(source).toBeVisible({ timeout: 20000 });
  for (const name of names) {
    const item = source.locator('li').filter({ hasText: exactText(name) }).first();
    await expect(item, `"${name}" should be available in the Unselected list`).toBeVisible({ timeout: 20000 });
    await item.click();
    await page.waitForTimeout(200);
  }
  const addBtn = scope.locator('button[name="addBtn"]').first();
  await expect(addBtn).toBeEnabled({ timeout: 10000 });
  await addBtn.click();
  for (const name of names) {
    await expect(destination.locator('li').filter({ hasText: exactText(name) })).toHaveCount(1, { timeout: 10000 });
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} scope
 * @param {string[]} names
 */
export async function removeFromDualList(page, scope, names) {
  const destination = scope.locator('dual-list .listbox').nth(1);
  for (const name of names) {
    const item = destination.locator('li').filter({ hasText: exactText(name) }).first();
    await expect(item).toBeVisible({ timeout: 20000 });
    await item.click();
    await page.waitForTimeout(200);
  }
  const removeBtn = scope.locator('button[name="removeBtn"]').first();
  await expect(removeBtn).toBeEnabled({ timeout: 10000 });
  await removeBtn.click();
  for (const name of names) {
    await expect(destination.locator('li').filter({ hasText: exactText(name) })).toHaveCount(0, { timeout: 10000 });
  }
}

/**
 * Waits for the first campaign API response whose URL matches `urlPart`.
 * @param {import('@playwright/test').Page} page
 * @param {RegExp} urlPart
 * @param {{ method?: string, timeout?: number, body?: (body: string) => boolean }} [options]
 */
export function waitForApi(page, urlPart, options = {}) {
  const { method = 'POST', timeout = 60000, body } = options;
  return page.waitForResponse(
    (response) =>
      API_HOST.test(response.url()) &&
      urlPart.test(response.url()) &&
      response.request().method() === method &&
      (!body || body(response.request().postData() || '')),
    { timeout }
  );
}

// ===================== Campaign list =====================

/** @param {import('@playwright/test').Page} page */
export function campaignsHeading(page) {
  return page.locator('h4').filter({ hasText: exactText('Campaigns') }).first();
}

/**
 * Logs in (cached auth) and lands on the Campaigns list with its grid loaded.
 * @param {import('@playwright/test').Page} page
 */
export async function openCampaignsList(page) {
  await loginToApp(page);
  const listLoaded = waitForApi(page, /api\/campaign\/getCampignList/, { timeout: 90000 }).catch(() => null);
  await page.goto(`${CREDENTIALS.baseUrl}/#/home/campaigns`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForSpinner(page);
  // A hash-only navigation right after the cached-auth dashboard load is sometimes
  // swallowed by the router; fall back to the sidebar link.
  if (!(await campaignsHeading(page).isVisible({ timeout: 15000 }).catch(() => false))) {
    await realClick(page, page.locator('a[href="#/home/campaigns"]').first());
  }
  await expect(campaignsHeading(page)).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: /Create Campaign/ })).toBeVisible({ timeout: 30000 });
  await listLoaded;
  await waitForSpinner(page);
}

/** @param {import('@playwright/test').Page} page */
export function campaignSearchInput(page) {
  return page.locator('mat-form-field').filter({ hasText: 'Enter Search String' }).locator('input').first();
}

/**
 * The list search is matched as a regular expression on the server, so a name with
 * regex metacharacters (e.g. parentheses) finds nothing. Search by the part of the
 * name before the first metacharacter; rows are still matched on the exact name.
 * @param {string} name
 */
export function searchTermFor(name) {
  return name.split(/[()[\]{}*+?.\^$|]/)[0].trim();
}

/**
 * Applies the list search (toolbar Search button) and waits for the API result.
 * @param {import('@playwright/test').Page} page
 * @param {string} term
 * @returns {Promise<any>} parsed getCampignList response body
 */
export async function searchCampaigns(page, term) {
  term = searchTermFor(term);
  const input = campaignSearchInput(page);
  await expect(input).toBeVisible({ timeout: 30000 });
  await input.fill(term);
  const response = waitForApi(page, /api\/campaign\/getCampignList/, {
    body: (b) => b.includes(`"SearchString":${JSON.stringify(term)}`),
  });
  await realClick(page, page.locator('button[mattooltip="Search"]').first());
  const result = await (await response).json();
  await waitForSpinner(page);
  return result;
}

/**
 * The list row whose Campaign Name cell equals `name` exactly.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export function campaignRow(page, name) {
  return page.locator('tbody tr').filter({ has: page.locator('td:nth-child(2)', { hasText: exactText(name) }) });
}

/**
 * Searches the list for `name` and returns its (single) row.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export async function findCampaignRow(page, name) {
  await searchCampaigns(page, name);
  const row = campaignRow(page, name);
  await expect(row, `Campaign "${name}" should be listed exactly once`).toHaveCount(1, { timeout: 30000 });
  return row;
}

/**
 * Opens the row action menu of campaign `name` and returns the visible menu panel.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export async function openCampaignMenu(page, name) {
  const row = await findCampaignRow(page, name);
  const panel = page.locator('.mat-menu-panel').filter({ visible: true }).last();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await realClick(page, row.locator('.mat-menu-trigger').first());
    if (await panel.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) return panel;
  }
  await expect(panel, `Action menu of "${name}" should open`).toBeVisible();
  return panel;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} panel
 * @param {string} label
 */
export async function clickMenuItem(page, panel, label) {
  const item = panel.getByRole('menuitem', { name: new RegExp(`${escapeRegex(label)}\\s*$`) }).first();
  await expect(item, `Menu item "${label}" should be enabled`).toBeEnabled({ timeout: 10000 });
  await realClick(page, item);
}

/** @param {import('@playwright/test').Page} page */
export function campaignDialog(page) {
  return page.locator('modal-container').filter({ visible: true }).last();
}

/**
 * Opens the Create Campaign dialog (re-clicking if the first click is swallowed
 * while the list is still settling).
 * @param {import('@playwright/test').Page} page
 */
export async function openCreateCampaignDialog(page) {
  const button = page.getByRole('button', { name: /Create Campaign/ }).first();
  const dialog = campaignDialog(page);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await realClick(page, button);
    if (await dialog.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)) break;
  }
  await expect(dialog, 'Create Campaign dialog should open').toBeVisible({ timeout: 10000 });
  await expect(dialog).toContainText(/Create Campaign\s*\(1 of 2 Steps\)/);
  return dialog;
}

/**
 * Creates a STORE-targeted campaign through the real two-step dialog and verifies
 * the addCampaign API call and the resulting list row.
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string, budget?: string, description?: string, zones?: string[], stores?: string[], startDate?: Date, endDate?: Date }} spec
 */
export async function createCampaign(page, spec) {
  const {
    name,
    budget = '50',
    description = 'Created by Playwright (campaigns suite)',
    zones = [TEST_ZONE],
    stores = TEST_STORES,
    startDate = new Date(),
    endDate = addMonths(new Date(), 1),
  } = spec;

  const dialog = await openCreateCampaignDialog(page);
  await dialog.locator('input[formcontrolname="Name"]').fill(name);
  await chooseMatOption(page, dialog.locator('mat-select[formcontrolname="CampaignTargetType"]'), 'Store');
  await dialog.locator('input[formcontrolname="Budget"]').fill(budget);
  await pickCalendarDate(page, dialog.locator('mat-datepicker-toggle button').nth(0), dialog.locator('input[formcontrolname="StartDate"]'), startDate);
  await pickCalendarDate(page, dialog.locator('mat-datepicker-toggle button').nth(1), dialog.locator('input[formcontrolname="EndDate"]'), endDate);
  const zoneSelect = dialog.locator('mat-select[formcontrolname="Zones"]');
  await expect(zoneSelect).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });
  await chooseMatOption(page, zoneSelect, zones);
  for (const zone of zones) await expect(zoneSelect).toContainText(zone);
  await expect(dialog.locator('mat-select[formcontrolname="BearerParty"]')).toContainText('Tmdone');
  await dialog.locator('textarea[formcontrolname="Description"]').fill(description);

  const next = dialog.getByRole('button', { name: /^\s*Next\s*$/ });
  await expect(next).toBeEnabled({ timeout: 10000 });
  await realClick(page, next);
  await expect(dialog).toContainText(/Create Campaign\s*\(2 of 2 Steps\)/, { timeout: 20000 });
  await addToDualList(page, dialog, stores);

  const addCall = waitForApi(page, /api\/campaign\/addCampaign/);
  await realClick(page, dialog.getByRole('button', { name: /^\s*Create Campaign\s*$/ }));
  const response = await addCall;
  const requestBody = JSON.parse(response.request().postData() || '{}');
  const responseText = await response.text();
  expect(response.status(), `addCampaign failed: ${responseText}`).toBe(200);
  expect(responseText).toContain('SUCCESS');
  expect(requestBody.Name).toBe(name);
  expect(requestBody.CampaignTargetType).toBe('STORE');
  expect((requestBody.TargetInfo || []).map((/** @type {{Name: string}} */ t) => t.Name).sort()).toEqual([...stores].sort());
  await expect(dialog).toBeHidden({ timeout: 20000 });
  await waitForSpinner(page);
  return requestBody;
}

/**
 * Deletes campaign `name` through the row menu, confirming the SweetAlert, and
 * verifies it is gone from the list.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export async function deleteCampaign(page, name) {
  const panel = await openCampaignMenu(page, name);
  await clickMenuItem(page, panel, 'Delete');
  const popup = swalPopup(page);
  await expect(popup).toContainText('Are you sure?', { timeout: 15000 });
  const deleteCall = waitForApi(page, /api\/campaign\/delete\//);
  await realClick(page, popup.locator('button.swal2-confirm'));
  const response = await deleteCall;
  expect(response.status(), `campaign delete failed: ${await response.text()}`).toBe(200);
  expect(await readAndConfirmSwal(page)).toContain('Campaign has been deleted');
  const result = await searchCampaigns(page, name);
  expect(result.Items.filter((/** @type {{Name: string}} */ c) => c.Name === name)).toHaveLength(0);
  await expect(campaignRow(page, name)).toHaveCount(0);
}

/**
 * Safety-net cleanup: deletes campaign `name` if it still exists. Never throws.
 * Uses a fresh page so it works from afterAll hooks.
 * @param {import('@playwright/test').Browser} browser
 * @param {string} name
 */
export async function deleteCampaignIfPresent(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openCampaignsList(page);
    const result = await searchCampaigns(page, name);
    if (!result.Items.some((/** @type {{Name: string}} */ c) => c.Name === name)) return false;
    await deleteCampaign(page, name);
    console.log(`CLEANUP: deleted campaign "${name}"`);
    return true;
  } catch (error) {
    console.log(`CLEANUP WARNING: could not delete campaign "${name}": ${String(error).slice(0, 300)}`);
    return false;
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Creates a campaign from an afterAll/beforeAll-safe fresh page.
 * @param {import('@playwright/test').Browser} browser
 * @param {string} name
 */
export async function createCampaignInFreshPage(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await openCampaignsList(page);
    await createCampaign(page, { name });
    await findCampaignRow(page, name);
  } finally {
    await context.close().catch(() => {});
  }
}

// ===================== Campaign view & sections =====================

/**
 * Opens the "Manage Campaigns" view of campaign `name`.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export async function openCampaignView(page, name) {
  const panel = await openCampaignMenu(page, name);
  await clickMenuItem(page, panel, 'View');
  await page.waitForURL(/#\/home\/campaigns\/campaign-view\?campaignId=/, { timeout: 60000 });
  await waitForSpinner(page);
  await expect(page.getByText('Manage Campaigns', { exact: true }).first()).toBeVisible({ timeout: 60000 });
  await expect(campaignViewHeader(page, name)).toBeVisible({ timeout: 60000 });
}

/**
 * The campaign view header: "<name> ( <code> ) <start> - <end> <status>".
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
export function campaignViewHeader(page, name) {
  return page.locator('h1').filter({ hasText: name }).first();
}

/**
 * Returns the count shown on a section card of the campaign view.
 * @param {import('@playwright/test').Page} page
 * @param {string} section
 */
export async function sectionCount(page, section) {
  const card = sectionCard(page, section);
  await expect(card).toBeVisible({ timeout: 30000 });
  const text = ((await card.innerText()) || '').replace(/\s+/g, ' ');
  const match = text.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : NaN;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} section  Promo Code | Offers | Free Delivery | Fixed Delivery | Store Pinning
 */
export function sectionCard(page, section) {
  return page.locator('.plain-card').filter({ has: page.locator('h5', { hasText: exactText(section) }) }).first();
}

/**
 * From the campaign view, opens one of the management sections.
 * @param {import('@playwright/test').Page} page
 * @param {string} section
 * @param {RegExp} headingPattern  heading of the management page that must appear
 */
export async function openSection(page, section, headingPattern) {
  const card = sectionCard(page, section);
  await expect(card).toBeVisible({ timeout: 30000 });
  const heading = page.locator('h1, h2, h3, h4, .page-title').filter({ hasText: headingPattern }).first();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await realClick(page, card.locator('h5').first());
    if (await heading.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) break;
  }
  await expect(heading, `${section} management page should open`).toBeVisible({ timeout: 10000 });
  await waitForSpinner(page);
}
