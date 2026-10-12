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

import { test, expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from '../../helpers/loginHelper.js';

export const TEST_ZONE = 'Colombo';
export const TEST_STORES = ['Food House', 'Cafe Asiana - Market Place'];
export const API_HOST = /amportal\.demo\.dr\.tmd1\.org/;

const SPINNERS = '.ngx-spinner-overlay, app-page-loader, .loading-overlay, .loading-spinner';

/** @param {string} value */
export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Regex matching `value` exactly, ignoring surrounding whitespace and treating any
 * run of whitespace inside it (e.g. a non-breaking space) as one space.
 * @param {string} value
 */
export function exactText(value) {
  return new RegExp(`^\\s*${escapeRegex(value).replace(/ +/g, '\\s+')}\\s*$`);
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
      (method === 'ANY' || response.request().method() === method) &&
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
 * Returns the parsed getCampignList response of the initial load (null if it
 * was not observed).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<any>}
 */
export async function openCampaignsList(page) {
  // Log in only on a fresh page. loginToApp on a page that is already inside the
  // app (after its 30-minute auth cache expired) mistakes the first checkbox for
  // the e-mail field, so a page that is already signed in is reused as it is.
  if (!/#\/home\//.test(page.url())) await loginToApp(page);
  const listLoaded = waitForApi(page, /api\/campaign\/getCampignList/, { timeout: 90000 }).catch(() => null);
  await page.goto(`${CREDENTIALS.baseUrl}/#/home/campaigns`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForSpinner(page);
  // A hash-only navigation right after the cached-auth dashboard load is sometimes
  // swallowed by the router (the page stays on the dashboard); fall back to the
  // sidebar link, and reload the route once more if that is swallowed too.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await campaignsHeading(page).isVisible({ timeout: 15000 }).catch(() => false)) break;
    if (attempt === 0) await realClick(page, page.locator('a[href="#/home/campaigns"]').first()).catch(() => {});
    else await page.goto(`${CREDENTIALS.baseUrl}/#/home/campaigns`, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
    await waitForSpinner(page);
  }
  await expect(campaignsHeading(page)).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: /Create Campaign/ })).toBeVisible({ timeout: 30000 });
  const response = await listLoaded;
  await waitForSpinner(page);
  return response ? response.json().catch(() => null) : null;
}

/**
 * The mat-select of the list/section toolbar whose form field shows `label`.
 * @param {import('@playwright/test').Page | import('@playwright/test').Locator} scope
 * @param {string} label
 */
export function fieldSelect(scope, label) {
  return scope.locator('mat-form-field').filter({ hasText: label }).locator('mat-select').first();
}

/**
 * Runs `fn` but gives up after `ms` (rejects with a clear message). Used by the
 * afterAll safety nets so that a hanging page can never hang the hook.
 * @template T
 * @param {string} label
 * @param {number} ms
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function runBounded(label, ms, fn) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} did not finish within ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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
 * Safety-net cleanup: deletes campaign `name` if it still exists. Never throws
 * and gives up after `budgetMs` (default 240 s), so an afterAll hook using it
 * cannot hang. Uses a fresh page so it works from afterAll hooks.
 * @param {import('@playwright/test').Browser} browser
 * @param {string} name
 * @param {number} [budgetMs]
 */
export async function deleteCampaignIfPresent(browser, name, budgetMs = 240000) {
  const deadline = Date.now() + budgetMs;
  // Two attempts (each in a fresh context) within the budget: the shared demo
  // sometimes fails a login or a page load once.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 30000) break;
    const context = await browser.newContext().catch(() => null);
    if (!context) {
      console.log(`CLEANUP WARNING: could not open a browser context to delete campaign "${name}"`);
      return false;
    }
    try {
      return await runBounded(`cleanup of campaign "${name}"`, remaining, async () => {
        const page = await context.newPage();
        await openCampaignsList(page);
        const result = await searchCampaigns(page, name);
        if (!result.Items.some((/** @type {{Name: string}} */ c) => c.Name === name)) return false;
        await deleteCampaign(page, name);
        console.log(`CLEANUP: deleted campaign "${name}"`);
        return true;
      });
    } catch (error) {
      console.log(`CLEANUP WARNING (attempt ${attempt}): could not delete campaign "${name}": ${String(error).slice(0, 300)}`);
    } finally {
      await context.close().catch(() => {});
    }
  }
  return false;
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
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await card.isVisible().catch(() => false)) {
      // Still on the campaign view: the click may have been swallowed while it settled.
      await realClick(page, card.locator('h5').first(), { attempts: 2 }).catch(() => {});
    } else {
      // Navigated, but the app sometimes hangs on its full-page loader: reload the section URL.
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
      await waitForSpinner(page);
    }
    if (await heading.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false)) break;
  }
  await expect(heading, `${section} management page should open`).toBeVisible({ timeout: 10000 });
  await waitForSpinner(page);
}

// ===================== Section management pages =====================
// Promo Code / Offers / Free Delivery / Fixed Delivery / Store Pinning lists share
// one layout: back arrow + heading, a create button, "Enter Search String" input,
// filters, Search/Clear buttons, List-View/Analytics toggles and a paged table.

/**
 * Navigates list -> campaign view -> section page of campaign `name`.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {string} section
 * @param {RegExp} heading
 */
export async function gotoCampaignSection(page, name, section, heading) {
  await openCampaignsList(page);
  await openCampaignView(page, name);
  await openSection(page, section, heading);
  await closeStrayEmptyModal(page);
}

/**
 * The Free Delivery / Fixed Delivery pages open an EMPTY modal on load (their
 * analytics widgets call freeDeliverySummary?freeDeliveryId=undefined and
 * getCampaignBearerPartySummary?campaignId=undefined -> 400, and an empty
 * modal-container is left open over the page). Known product defect: this closes
 * that EMPTY modal (only when every open modal is empty) and records an annotation.
 * @param {import('@playwright/test').Page} page
 */
export async function closeStrayEmptyModal(page) {
  const modals = page.locator('modal-container');
  const empty = modals.filter({ hasNot: page.locator('.modal-content > *') });
  if (!(await empty.first().waitFor({ state: 'attached', timeout: 4000 }).then(() => true).catch(() => false))) return;
  if ((await modals.count()) !== (await empty.count())) return;
  await page.keyboard.press('Escape');
  await expect(modals).toHaveCount(0, { timeout: 10000 });
  try {
    test.info().annotations.push({ type: 'product-defect', description: 'An empty modal opened on page load (summary APIs called with id=undefined -> 400); closed with Escape.' });
  } catch {
    /* called outside a test */
  }
}

/** @param {import('@playwright/test').Page} page */
export function sectionHeading(page) {
  return page.locator('h4').filter({ hasText: /^\s*Campaigns\s*-/ }).first();
}

/**
 * Opens a create dialog of a section page (the button may need a second click
 * while the list settles). With `menuItem`, the button opens a menu first.
 * @param {import('@playwright/test').Page} page
 * @param {string | RegExp} buttonName  accessible name of the create button
 * @param {RegExp} title                 dialog title that must appear
 * @param {string} [menuItem]            item of the create menu (Offers)
 */
export async function openSectionCreateDialog(page, buttonName, title, menuItem) {
  const button = page.getByRole('button', typeof buttonName === 'string' ? { name: buttonName, exact: true } : { name: buttonName }).first();
  const dialog = campaignDialog(page).filter({ hasText: title });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await realClick(page, button);
    if (menuItem) {
      const item = page.locator('.mat-menu-panel button').filter({ hasText: menuItem }).first();
      if (!(await item.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false))) continue;
      await item.click();
    }
    if (await dialog.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) break;
  }
  await expect(dialog, `${String(title)} dialog should open`).toBeVisible({ timeout: 10000 });
  await waitForSpinner(page);
  return dialog;
}

/**
 * Switches a section list to its card (grid) view, verifies that the record
 * showing `text` is rendered as a card and that the table is gone, then switches
 * back to the table and verifies the record's row is shown again.
 * Promo / Offers / Free Delivery / Fixed Delivery use "List View" / "Grid View"
 * toggles; Store Pinning uses a single "Change View" icon.
 * @param {import('@playwright/test').Page} page
 * @param {string} text  unique text of a record of the current list (code or name)
 * @param {string | RegExp} [cardText]  what identifies the record's card (default: `text`)
 */
export async function checkSectionGridView(page, text, cardText = text) {
  const single = page.locator('mat-icon[mattooltip="Change View"]').first();
  const hasSingle = (await single.count()) > 0;
  const toGrid = hasSingle ? single : page.locator('span[mattooltip="List View"]').first();
  const toList = hasSingle ? single : page.locator('span[mattooltip="Grid View"]').first();
  await expect(page.locator('tbody tr').filter({ hasText: text }), `"${text}" is listed before switching views`).toHaveCount(1, { timeout: 20000 });
  await realClick(page, toGrid);
  await expect(page.locator('tbody tr'), 'the card view replaces the table').toHaveCount(0, { timeout: 15000 });
  const card = typeof cardText === 'string' ? page.getByText(cardText, { exact: true }) : page.getByText(cardText);
  await expect(card.first(), `"${text}" is shown as a card`).toBeVisible({ timeout: 15000 });
  await realClick(page, toList);
  await expect(page.locator('tbody tr').filter({ hasText: text }), `"${text}" is listed again in the table view`).toHaveCount(1, { timeout: 15000 });
}

/**
 * On the "Set Stores" page of a STORE free delivery / fixed delivery fee (opened
 * from its row menu) adds `store` to the selected stores, saves and verifies the
 * save call. Returns the request body.
 * @param {import('@playwright/test').Page} page
 * @param {{ heading: string, saveApi: RegExp }} cfg
 * @param {string} store
 * @param {string[]} expectedNames  all store names that must be sent
 */
export async function addStoreOnSetStoresPage(page, cfg, store, expectedNames) {
  await expect(page.locator('h4, h3').filter({ hasText: cfg.heading }).first(), `${cfg.heading} page`).toBeVisible({ timeout: 30000 });
  const lists = page.locator('dual-list .listbox');
  await expect(lists.nth(1).locator('li').first(), 'the current stores are selected').toBeVisible({ timeout: 20000 });
  await expect(lists.nth(1).locator('li').filter({ hasText: exactText(store) })).toHaveCount(0);
  await addToDualList(page, page.locator('body'), [store]);
  const save = waitForApi(page, cfg.saveApi);
  await realClick(page, page.getByRole('button', { name: /^\s*Set Stores\s*$/ }));
  const response = await save;
  const text = await response.text();
  expect(response.status(), `set stores failed: ${text}`).toBe(200);
  expect(text).toContain('SUCCESS');
  const body = JSON.parse(response.request().postData() || '{}');
  expect(body.TargetInfo.map((/** @type {{Name: string}} */ t) => t.Name).sort()).toEqual([...expectedNames].sort());
  await waitForSpinner(page);
  return body;
}

/**
 * On the Manage view of a STORE free delivery / fixed delivery fee: opens the
 * "Manage Store" dialog, verifies the applied stores (API + table), searches them
 * by name, then deactivates and re-activates `toggleStore` (each change verified
 * on the status API and the refreshed list) and closes the dialog.
 * @param {import('@playwright/test').Page} page
 * @param {{ summaryApi: RegExp, statusApi: RegExp }} cfg
 * @param {string[]} expectedNames
 * @param {string} toggleStore
 */
export async function checkAppliedStoresDialog(page, cfg, expectedNames, toggleStore) {
  const summary = waitForApi(page, cfg.summaryApi);
  const dialog = campaignDialog(page).filter({ hasText: 'Manage Store' });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await realClick(page, page.getByRole('button', { name: /Manage Store/ }));
    if (await dialog.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)) break;
  }
  await expect(dialog, 'Manage Store dialog should open').toBeVisible();
  const json = await (await summary).json();
  const names = (/** @type {any} */ list) => list.Items.map((/** @type {{Name: string}} */ i) => i.Name).sort();
  expect(names(json), 'applied stores').toEqual([...expectedNames].sort());
  expect(json.Items.every((/** @type {{IsManualExcluded: boolean}} */ i) => !i.IsManualExcluded), 'every applied store is active').toBe(true);
  await waitForSpinner(page);
  await expect(dialog.locator('thead th')).toHaveText(['Store Name', 'Added Date', 'Is Active'].map((t) => exactText(t)));
  const row = (/** @type {string} */ name) => dialog.locator('tbody tr').filter({ has: page.locator('td:nth-child(1)', { hasText: exactText(name) }) });
  for (const name of expectedNames) {
    await expect(row(name), `${name} is listed`).toHaveCount(1, { timeout: 15000 });
    await expect(row(name).locator('td').nth(1)).toHaveText(formatDDMMYYYY(new Date()));
    await expect(row(name).locator('mat-slide-toggle')).toHaveClass(/mat-checked/);
  }

  const input = dialog.locator('mat-form-field').filter({ hasText: 'Enter Search String' }).locator('input');
  await input.fill('Food');
  const search = waitForApi(page, cfg.summaryApi, { body: (b) => b.includes('"SearchString":"Food"') });
  await realClick(page, dialog.locator('button[mattooltip="Search"]'));
  expect(names(await (await search).json()), 'search "Food"').toEqual(['Food House']);
  await expect(dialog.locator('tbody tr')).toHaveCount(1, { timeout: 15000 });
  const clear = waitForApi(page, cfg.summaryApi, { body: (b) => b.includes('"SearchString":""') });
  await realClick(page, dialog.locator('button[mattooltip="Clear"]'));
  await clear;
  await expect(dialog.locator('tbody tr')).toHaveCount(expectedNames.length, { timeout: 15000 });

  const target = json.Items.find((/** @type {{Name: string}} */ i) => i.Name === toggleStore);
  expect(target, `${toggleStore} is an applied store`).toBeTruthy();
  for (const excluded of [true, false]) {
    const change = waitForApi(page, cfg.statusApi, { body: (b) => b.includes(`"TargetId":"${target.TargetId}"`) && b.includes(`"Status":${excluded}`) });
    const refreshed = waitForApi(page, cfg.summaryApi);
    await realClick(page, row(toggleStore).locator('mat-slide-toggle label').first());
    const response = await change;
    expect(response.status()).toBe(200);
    expect(await response.text()).toBe('true');
    const list = await (await refreshed).json();
    for (const item of list.Items) {
      expect(item.IsManualExcluded, `${item.Name} excluded after ${excluded ? 'deactivating' : 're-activating'} ${toggleStore}`).toBe(item.Name === toggleStore ? excluded : false);
    }
    await expect(row(toggleStore).locator('mat-slide-toggle')).toHaveClass(excluded ? /^(?!.*mat-checked)/ : /mat-checked/, { timeout: 15000 });
  }
  await closeDialogWithX(page, dialog);
}

/**
 * Closes a dialog with its X icon and verifies it is gone.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 */
export async function closeDialogWithX(page, dialog) {
  await realClick(page, dialog.locator('mat-icon').filter({ hasText: /^\s*close\s*$/ }).first());
  await expect(dialog).toBeHidden({ timeout: 10000 });
}

/**
 * Fills the two calendar dates of a dialog (its first two datepicker toggles).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 * @param {Date} start
 * @param {Date} end
 */
export async function fillDialogDates(page, dialog, start, end) {
  const toggles = dialog.locator('mat-datepicker-toggle button');
  await pickCalendarDate(page, toggles.nth(0), dialog.locator('input[formcontrolname="StartDate"]'), start);
  await pickCalendarDate(page, toggles.nth(1), dialog.locator('input[formcontrolname="EndDate"]'), end);
}

/** Date in the API's yyyy/mm/dd format. @param {Date} date */
export function formatApiDate(date) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

/** @param {import('@playwright/test').Page} page */
export function sectionSearchInput(page) {
  return page.locator('mat-form-field').filter({ hasText: 'Enter Search String' }).locator('input').first();
}

/**
 * Applies the section list search and waits for the list API.
 * @param {import('@playwright/test').Page} page
 * @param {string} term
 * @param {RegExp} listApi
 * @returns {Promise<any>}
 */
export async function searchSection(page, term, listApi) {
  const input = sectionSearchInput(page);
  await expect(input).toBeVisible({ timeout: 30000 });
  await input.fill(term);
  const response = waitForApi(page, listApi, { body: (b) => b.includes(`"SearchString":${JSON.stringify(term)}`) });
  await realClick(page, page.locator('button[mattooltip="Search"]').first());
  const json = await (await response).json();
  await waitForSpinner(page);
  return json;
}

/**
 * Picks a filter option (pressing the toolbar Search button when the selection
 * alone does not query) and returns the list API response whose request body
 * contains `bodyPart`.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} select
 * @param {string} option
 * @param {RegExp} listApi
 * @param {string | RegExp} bodyPart  text (or pattern) the request body must contain
 * @returns {Promise<any>}
 */
export async function applySectionFilter(page, select, option, listApi, bodyPart) {
  // Some filters query on selection, others only on the Search button.
  const response = waitForApi(page, listApi, { body: (b) => (typeof bodyPart === 'string' ? b.includes(bodyPart) : bodyPart.test(b)) });
  await chooseMatOption(page, select, option);
  const early = await Promise.race([response.then(() => true), page.waitForTimeout(5000).then(() => false)]);
  if (!early) await realClick(page, page.locator('button[mattooltip="Search"]').first());
  const json = await (await response).json();
  await waitForSpinner(page);
  return json;
}

/**
 * Clears the section filters (toolbar Clear button), then searches again and
 * returns the unfiltered list API response.
 * @param {import('@playwright/test').Page} page
 * @param {RegExp} listApi
 * @returns {Promise<any>}
 */
export async function clearSectionFilters(page, listApi) {
  await realClick(page, page.locator('button[mattooltip="Clear"]').first());
  await expect(sectionSearchInput(page)).toHaveValue('', { timeout: 10000 });
  await waitForSpinner(page);
  // Some pages re-query on Clear, others only reset the form: query explicitly.
  const response = waitForApi(page, listApi, { body: (b) => b.includes('"SearchString":""') });
  await realClick(page, page.locator('button[mattooltip="Search"]').first());
  const json = await (await response).json();
  await waitForSpinner(page);
  return json;
}

/**
 * Table row whose cell `column` (1-based) equals `text` exactly.
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 * @param {number} [column]
 */
export function sectionRow(page, text, column = 1) {
  return page.locator('tbody tr').filter({ has: page.locator(`td:nth-child(${column})`, { hasText: exactText(text) }) });
}

/**
 * Opens the action menu of a table row and returns the menu panel.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} row
 */
export async function openRowMenu(page, row) {
  await expect(row, 'Row should be listed exactly once').toHaveCount(1, { timeout: 30000 });
  const panel = page.locator('.mat-menu-panel').filter({ visible: true }).last();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await realClick(page, row.locator('.mat-menu-trigger').last());
    if (await panel.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) return panel;
  }
  await expect(panel, 'Row action menu should open').toBeVisible();
  return panel;
}

/**
 * Menu item labels without their icon ligature (e.g. "edit_noteEdit" -> "Edit").
 * @param {import('@playwright/test').Locator} panel
 */
export async function menuLabels(panel) {
  return panel.getByRole('menuitem').evaluateAll((items) =>
    items.map((item) => {
      const icon = (item.querySelector('mat-icon')?.textContent || '').trim();
      const text = (item.textContent || '').replace(/\s+/g, ' ').trim();
      return (icon && text.startsWith(icon) ? text.slice(icon.length) : text).trim();
    })
  );
}

/**
 * Closes an open mat-menu by clicking its transparent backdrop.
 * @param {import('@playwright/test').Page} page
 */
export async function closeMenu(page) {
  await page.locator('.cdk-overlay-backdrop').last().click({ position: { x: 3, y: 3 } });
  await expect(page.locator('.mat-menu-panel').filter({ visible: true })).toHaveCount(0, { timeout: 5000 });
}

/**
 * Row menu -> Delete -> "Are you sure?" -> confirm; verifies the delete API and
 * the "Deleted!" SweetAlert.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} row
 * @param {RegExp} deleteApi
 * @param {string | RegExp} deletedText
 */
export async function deleteSectionRow(page, row, deleteApi, deletedText) {
  const panel = await openRowMenu(page, row);
  await clickMenuItem(page, panel, 'Delete');
  const popup = swalPopup(page);
  await expect(popup).toContainText('Are you sure?', { timeout: 15000 });
  const call = waitForApi(page, deleteApi, { method: 'ANY' });
  await realClick(page, popup.locator('button.swal2-confirm'));
  const response = await call;
  expect(response.status(), `delete failed: ${await response.text()}`).toBe(200);
  expect(await readAndConfirmSwal(page)).toMatch(typeof deletedText === 'string' ? new RegExp(escapeRegex(deletedText)) : deletedText);
  await waitForSpinner(page);
}

/**
 * Row menu -> Delete -> "Are you sure?" -> Cancel; verifies no delete API call.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} row
 * @param {RegExp} deleteApi
 */
export async function cancelSectionRowDelete(page, row, deleteApi) {
  const calls = [];
  const listener = (/** @type {import('@playwright/test').Request} */ request) => {
    if (deleteApi.test(request.url())) calls.push(request.url());
  };
  page.on('request', listener);
  const panel = await openRowMenu(page, row);
  await clickMenuItem(page, panel, 'Delete');
  const popup = swalPopup(page);
  await expect(popup).toContainText('Are you sure?', { timeout: 15000 });
  await expect(popup).toContainText("You won't be able to revert this!");
  await realClick(page, popup.locator('button.swal2-cancel'));
  await expect(page.locator('.swal2-popup').filter({ visible: true })).toHaveCount(0, { timeout: 10000 });
  await page.waitForTimeout(1000);
  page.off('request', listener);
  expect(calls, 'Cancelling the confirmation must not call the delete API').toHaveLength(0);
  await expect(row).toHaveCount(1);
}

/**
 * Uploads the EN and AR offer images (each opens a Photo Editor whose Apply
 * uploads the cropped image) and verifies both uploads.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 */
export async function uploadOfferImages(page, dialog) {
  const images = ['tests/fixtures/offer-image.png', 'tests/fixtures/offer-image-ar.png'];
  for (let index = 0; index < images.length; index += 1) {
    const input = dialog.locator('input[type="file"]').first();
    await expect(input, `Upload slot ${index + 1} should be available`).toBeAttached({ timeout: 15000 });
    await input.setInputFiles(images[index]);
    const apply = page.locator('button').filter({ hasText: /^\s*Apply\s*$/ }).filter({ visible: true }).first();
    await expect(apply, 'Photo Editor should open with Apply').toBeVisible({ timeout: 20000 });
    // Apply only once the cropper has loaded the picked image; an early Apply uploads
    // but leaves the slot stuck in its "uploading" state.
    const editor = apply.locator('xpath=ancestor::*[.//*[normalize-space(text())="Photo Editor"]][1]');
    await expect
      .poll(
        () => editor.locator('img').evaluateAll((imgs) => imgs.filter((img) => /** @type {HTMLImageElement} */ (img).naturalWidth > 0 && img.getBoundingClientRect().width > 0).length),
        { message: 'Photo Editor should show the picked image', timeout: 20000 }
      )
      .toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    const upload = waitForApi(page, /api\/offer\/upload/);
    await apply.click();
    const response = await upload;
    const text = await response.text();
    expect(response.status(), `image upload failed: ${text}`).toBe(200);
    expect(text).toMatch(/https:\/\/.+\.(png|jpe?g)/i);
    await expect(apply).toBeHidden({ timeout: 15000 });
    // An uploaded slot replaces its file input with the image preview. The preview
    // is only rendered on the next UI event, so click the (inert) dialog title.
    const inputs = dialog.locator('input[type="file"]');
    for (let attempt = 0; attempt < 10 && (await inputs.count()) !== images.length - index - 1; attempt += 1) {
      await dialog.locator('h6, .modal-title, h5, h4').first().click().catch(() => {});
      await page.waitForTimeout(1000);
    }
    await expect(inputs).toHaveCount(images.length - index - 1, { timeout: 30000 });
  }
}

/**
 * afterAll safety net: deletes the given rows (exact text in `column`) of a
 * section of campaign `campaignName` if they still exist. Never throws.
 * @param {import('@playwright/test').Browser} browser
 * @param {string} campaignName
 * @param {{ section: string, heading: RegExp, listApi: RegExp, deleteApi: RegExp, deletedText: string | RegExp, column?: number }} cfg
 * @param {string[]} texts
 * @param {number} [budgetMs]  overall time budget (default 240 s); the safety net gives up after it
 */
export async function deleteSectionRowsIfPresent(browser, campaignName, cfg, texts, budgetMs = 240000) {
  if (!texts.length) return;
  const deadline = Date.now() + budgetMs;
  const pending = new Set(texts);
  // Two attempts (each in a fresh context) within the budget: the shared demo
  // sometimes fails a login or a page load once.
  for (let attempt = 1; attempt <= 2 && pending.size; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 30000) break;
    const context = await browser.newContext().catch(() => null);
    if (!context) {
      console.log(`CLEANUP WARNING: could not open a browser context to clean ${cfg.section} of "${campaignName}"`);
      return;
    }
    try {
      await runBounded(`cleanup of ${cfg.section} in "${campaignName}"`, remaining, async () => {
        const page = await context.newPage();
        await openCampaignsList(page);
        const found = await searchCampaigns(page, campaignName);
        if (!found.Items.some((/** @type {{Name: string}} */ c) => c.Name === campaignName)) {
          pending.clear();
          return;
        }
        await openCampaignView(page, campaignName);
        await openSection(page, cfg.section, cfg.heading);
        await closeStrayEmptyModal(page);
        for (const text of [...pending]) {
          try {
            const json = await searchSection(page, text, cfg.listApi);
            if (!JSON.stringify(json.Items || []).includes(JSON.stringify(text))) {
              pending.delete(text); // already gone
              continue;
            }
            const row = sectionRow(page, text, cfg.column);
            await expect(row).toHaveCount(1, { timeout: 20000 });
            await deleteSectionRow(page, row, cfg.deleteApi, cfg.deletedText);
            pending.delete(text);
            console.log(`CLEANUP: deleted ${cfg.section} "${text}"`);
          } catch (error) {
            console.log(`CLEANUP WARNING: ${cfg.section} "${text}": ${String(error).slice(0, 200)}`);
          }
        }
      });
    } catch (error) {
      console.log(`CLEANUP WARNING (attempt ${attempt}): ${cfg.section} cleanup in "${campaignName}": ${String(error).slice(0, 200)}`);
    } finally {
      await context.close().catch(() => {});
    }
  }
  if (pending.size) console.log(`CLEANUP WARNING: ${cfg.section} left in "${campaignName}": ${[...pending].join(', ')}`);
}
