// @ts-check

import { expect } from '@playwright/test';
import { CREDENTIALS, loginToApp, goToPage } from '../helpers/loginHelper.js';

export const DRIVER_KPI_URL = '#/home/11b-driver-kpi';
const DASHBOARD_URL = `${CREDENTIALS.baseUrl}/#/home/dashboard`;
const SCHEME_ROUTES = {
  'Average Attendance': '#/home/fare-scheme/average-attendance',
  'Block Count': '#/home/fare-scheme/block-count',
  'Number of Fines': '#/home/fare-scheme/number-of-fines',
  'Redispatch Rate': '#/home/fare-scheme/redispatch-rate',
  'Speed of Delivery': '#/home/fare-scheme/speed-of-delivery',
};
// The unit each scheme's Minimum/Maximum columns and form fields are expressed in.
const SCHEME_UNITS = {
  'Average Attendance': 'Days',
  'Block Count': 'Days',
  'Number of Fines': 'Fines',
  'Redispatch Rate': 'Percentage',
  'Speed of Delivery': 'Minutes',
};
export const ALL_SCHEMES = Object.keys(SCHEME_ROUTES);

// Slab weights created by this worker and not yet deleted, per scheme. Lets an afterAll
// safety net delete exactly the records this run created if a later lifecycle step fails.
/** @type {Map<string, Set<string>>} */
const createdSlabWeights = new Map();

/** @param {string} schemeName */
function createdWeightsFor(schemeName) {
  if (!createdSlabWeights.has(schemeName)) createdSlabWeights.set(schemeName, new Set());
  return /** @type {Set<string>} */ (createdSlabWeights.get(schemeName));
}

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class DriverKpiSlabSchemePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} schemeName
   */
  constructor(page, schemeName) {
    this.page = page;
    this.schemeName = schemeName;
    this.unit = SCHEME_UNITS[schemeName] || '';
  }

  get pageTitle() {
    return this.page
      .locator('h1, h2, h3, h4, .page-title, .breadcrumb-item')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(this.schemeName)} Slab Scheme\\s*$`, 'i') })
      .first();
  }

  get table() {
    return this.page.locator('table').filter({ visible: true }).first();
  }

  get rows() {
    return this.page.locator('tbody tr').filter({ visible: true });
  }

  get createButton() {
    return this.page.locator('button').filter({ hasText: /^\s*Create\s*$/ }).filter({ visible: true }).first();
  }

  activeDialog() {
    return this.page
      .locator('.modal-dialog, mat-dialog-container, modal-container, [role="dialog"]')
      .filter({ visible: true })
      .last();
  }

  async goto() {
    await loginToApp(this.page);
    await this.navigateToDriverKpi();
    await this.waitForReady();
  }

  async navigateToDriverKpi() {
    const schemeRoute = SCHEME_ROUTES[this.schemeName];
    if (schemeRoute) {
      await goToPage(this.page, schemeRoute);
      await this.waitForKpiOrSignin();
      if (!/signin|dashboard/i.test(this.page.url())) return;
    }

    await this.page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await this.openSchemeFromSidebar();
  }

  /** Opens this scheme's page through the "Driver KPI Slabs" sidebar menu (real clicks). */
  async openSchemeFromSidebar() {
    const schemeLink = this.sidebarSchemeLink(this.schemeName);
    if (!(await schemeLink.isVisible().catch(() => false))) {
      const parent = this.page.locator('.sidebar a, aside a').filter({ hasText: /Driver\s*KPI\s*Slabs/i }).first();
      await parent.scrollIntoViewIfNeeded();
      await parent.click();
    }
    await expect(schemeLink, `Sidebar should list "${this.schemeName} Slab Scheme" under Driver KPI Slabs.`).toBeVisible({ timeout: 15000 });
    await schemeLink.scrollIntoViewIfNeeded();
    await schemeLink.click();
    await this.waitForKpiOrSignin();
  }

  /** @param {string} schemeName */
  sidebarSchemeLink(schemeName) {
    return this.page
      .locator('.sidebar a[href*="fare-scheme"], aside a[href*="fare-scheme"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(schemeName)} Slab Scheme\\s*$`, 'i') })
      .first();
  }

  async waitForKpiOrSignin() {
    await this.page
      .waitForURL((url) => /\/#\/home\/|\/#\/authentication\/signin/i.test(url.toString()), { timeout: 10000 })
      .catch(() => {});
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
  }

  async waitForNoSpinner() {
    for (const selector of ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay', '.loading-spinner']) {
      await this.page.locator(selector).first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    }
  }

  async waitForReady() {
    await this.waitForKpiOrSignin();
    if (/signin/i.test(this.page.url())) {
      await loginToApp(this.page);
      await this.navigateToDriverKpi();
    }
    await expect(this.page).not.toHaveURL(/signin|dashboard/i, { timeout: 25000 });
    await expect(this.pageTitle, `"${this.schemeName} Slab Scheme" heading should be visible.`).toBeVisible({ timeout: 45000 });
    await expect(this.table).toBeVisible({ timeout: 30000 });
    await this.waitForNoSpinner();
  }

  async verifyPageLoaded() {
    await this.waitForReady();
    await expect(this.createButton, `${this.schemeName} Create button should be visible.`).toBeVisible({ timeout: 20000 });
  }

  /**
   * The slab table shows this scheme's Minimum/Maximum unit columns, Weight and Action,
   * and every existing slab row offers Edit and Delete buttons.
   */
  async verifyTableStructure() {
    await this.verifyPageLoaded();
    const headers = (await this.table.locator('th').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
    expect(headers, `${this.schemeName} table columns`).toEqual([`Minimum ${this.unit}`, `Maximum ${this.unit}`, 'Weight', 'Action']);

    const count = await this.rows.count();
    for (let index = 0; index < count; index += 1) {
      const row = this.rows.nth(index);
      await expect(row.locator('button[mattooltip="Edit"]'), `Slab row ${index + 1} should have an Edit button.`).toBeVisible();
      await expect(row.locator('button[mattooltip="Delete"]'), `Slab row ${index + 1} should have a Delete button.`).toBeVisible();
    }
    console.log(`INFO: ${this.schemeName} currently has ${count} slab row(s).`);
  }

  /** The three numeric fields of the create/edit dialog: minimum, maximum, weight. */
  /** @param {import('@playwright/test').Locator} dialog */
  slabInputs(dialog) {
    const inputs = dialog.locator('input[type="number"]');
    return { min: inputs.nth(0), max: inputs.nth(1), weight: inputs.nth(2) };
  }

  /**
   * @param {import('@playwright/test').Locator} input
   * @param {string} value
   */
  async setNumber(input, value) {
    await input.fill(value);
    await expect(input).toHaveValue(value);
  }

  async openCreateDialog() {
    await this.createButton.click();
    const dialog = this.activeDialog();
    await expect(dialog, `${this.schemeName} create dialog should open.`).toBeVisible({ timeout: 12000 });
    await expect(dialog).toContainText(`Create ${this.schemeName} Slab Scheme`);
    return dialog;
  }

  /**
   * Exactly the row whose Weight cell equals this value (a substring match could hit
   * another slab whose weight merely contains these digits).
   * @param {string | number} weight
   */
  findRowByWeight(weight) {
    return this.rows.filter({
      has: this.page.locator('td:nth-child(3)', { hasText: new RegExp(`^\\s*${escapeRegExp(String(weight))}\\s*$`) }),
    });
  }

  /**
   * Creates a slab (Min 1, Max 10) with the given run-stamped weight so later steps can
   * identify it precisely, and verifies the new row with all three values.
   * @param {string | number} weight
   */
  async verifyCreateSlabFlow(weight) {
    await expect(this.findRowByWeight(weight), `Run-stamped weight ${weight} must not already exist in ${this.schemeName}.`).toHaveCount(0);
    const dialog = await this.openCreateDialog();
    const { min, max, weight: weightInput } = this.slabInputs(dialog);
    await this.setNumber(min, '1');
    await this.setNumber(max, '10');
    await this.setNumber(weightInput, String(weight));

    const submit = dialog.getByRole('button', { name: /^Create$/i });
    await expect(submit, `${this.schemeName} Create should be enabled once the fields are filled.`).toBeEnabled({ timeout: 10000 });
    const createResponse = this.page
      .waitForResponse((response) => /\/create$/i.test(response.url().split('?')[0]) && response.request().method() === 'POST', { timeout: 30000 })
      .catch(() => null);
    await submit.click();
    const response = await createResponse;
    expect(response, `${this.schemeName} Create should call its create API.`).not.toBeNull();
    expect(response?.ok(), `${this.schemeName} create should succeed (HTTP ${response?.status()}).`).toBe(true);
    createdWeightsFor(this.schemeName).add(String(weight));
    await this.confirmSuccessIfShown();
    await expect(dialog, 'Create dialog should close after saving.').toBeHidden({ timeout: 15000 });

    const row = this.findRowByWeight(weight);
    await expect(row, `A ${this.schemeName} slab with weight ${weight} should appear in the table after creating it.`).toHaveCount(1, { timeout: 15000 });
    await expect(row.locator('td').nth(0)).toHaveText('1');
    await expect(row.locator('td').nth(1)).toHaveText('10');
  }

  /**
   * Create dialog validation: the minimum must be greater than zero, and Cancel discards the
   * form without calling the create API or adding a row.
   * @param {string | number} unsavedWeight a run-stamped weight that must never be saved
   */
  async verifyCreateValidationAndCancel(unsavedWeight) {
    const createRequests = /** @type {string[]} */ ([]);
    /** @param {import('@playwright/test').Request} request */
    const onRequest = (request) => {
      if (request.method() === 'POST' && /\/create$/i.test(request.url().split('?')[0])) createRequests.push(request.url());
    };
    this.page.on('request', onRequest);
    try {
      const dialog = await this.openCreateDialog();
      await expect(dialog).toContainText(`${this.schemeName} Slab Scheme Information`);
      await expect(dialog).toContainText(`Minimum ${this.unit}`);
      await expect(dialog).toContainText(`Maximum ${this.unit}`);
      await expect(dialog).toContainText('Weight');
      const { min, max, weight } = this.slabInputs(dialog);
      const submit = dialog.getByRole('button', { name: /^Create$/i });

      await this.setNumber(min, '-5');
      await this.setNumber(max, '10');
      await this.setNumber(weight, String(unsavedWeight));
      await expect(dialog, 'A negative minimum must be rejected.').toContainText(new RegExp(`Minimum ${this.unit} should be greater than zero`, 'i'));
      await expect(submit, 'Create must be disabled while the minimum is negative.').toBeDisabled();

      await this.setNumber(min, '1');
      await expect(dialog).not.toContainText(/should be greater than zero/i);
      await expect(submit, 'Create is enabled again once the minimum is valid.').toBeEnabled();

      await dialog.getByRole('button', { name: /^Cancel$/i }).click();
      await expect(dialog, 'Cancel should close the create dialog.').toBeHidden({ timeout: 10000 });
      expect(createRequests, 'Cancel must not call the create API.').toHaveLength(0);
      await expect(this.findRowByWeight(unsavedWeight), 'The cancelled slab must not be added.').toHaveCount(0);
    } finally {
      this.page.off('request', onRequest);
    }
  }

  /**
   * Create dialog weight validation: the weight is required and must be greater than zero
   * (Create stays disabled until it is), and the header close icon discards the form
   * without calling the create API or adding a row.
   * @param {string | number} unsavedWeight a run-stamped weight that must never be saved
   */
  async verifyWeightValidationAndCloseIcon(unsavedWeight) {
    const createRequests = /** @type {string[]} */ ([]);
    /** @param {import('@playwright/test').Request} request */
    const onRequest = (request) => {
      if (request.method() === 'POST' && /\/create$/i.test(request.url().split('?')[0])) createRequests.push(request.url());
    };
    this.page.on('request', onRequest);
    try {
      const dialog = await this.openCreateDialog();
      const { min, max, weight } = this.slabInputs(dialog);
      const submit = dialog.getByRole('button', { name: /^Create$/i });
      await this.setNumber(min, '1');
      await this.setNumber(max, '10');

      await weight.fill('');
      await weight.blur();
      await expect(dialog, 'An empty weight must be rejected.').toContainText('Weight is required');
      await expect(submit, 'Create must be disabled without a weight.').toBeDisabled();

      await this.setNumber(weight, '-3');
      await weight.blur();
      await expect(dialog, 'A negative weight must be rejected.').toContainText('Weight should be greater than zero');
      await expect(submit, 'Create must be disabled while the weight is negative.').toBeDisabled();

      await this.setNumber(weight, String(unsavedWeight));
      await expect(dialog).not.toContainText(/Weight is required|Weight should be greater than zero/);
      await expect(submit, 'Create is enabled once the weight is valid.').toBeEnabled();

      await dialog.locator('button, mat-icon, span').filter({ hasText: /^\s*close\s*$/ }).first().click();
      await expect(dialog, 'The close icon should close the create dialog.').toBeHidden({ timeout: 10000 });
      expect(createRequests, 'Closing the dialog must not call the create API.').toHaveLength(0);
      await expect(this.findRowByWeight(unsavedWeight), 'The discarded slab must not be added.').toHaveCount(0);
    } finally {
      this.page.off('request', onRequest);
    }
  }

  /**
   * @param {RegExp} actionLabel /Edit/ or /Delete/
   * @param {import('@playwright/test').Locator} row
   */
  async openRowAction(actionLabel, row) {
    const ready = await row.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    if (!ready) return false;
    const tooltip = /delete|remove/i.test(actionLabel.source) ? 'Delete' : 'Edit';
    const button = row.locator(`button[mattooltip="${tooltip}"]`).first();
    if (!(await button.isVisible().catch(() => false))) return false;
    await button.scrollIntoViewIfNeeded().catch(() => {});
    // Real click required - force clicks don't trigger these row-action buttons.
    await button.click();
    return true;
  }

  /**
   * This UI has no dedicated "View" action (only Edit and Delete per row), so Edit doubles
   * as the detail view: open it, confirm it shows this record's real values, then cancel.
   * @param {string | number} weight
   */
  async verifyViewFlow(weight) {
    const row = this.findRowByWeight(weight);
    await expect(row, `${this.schemeName} slab with weight ${weight} should be listed.`).toHaveCount(1, { timeout: 15000 });
    const opened = await this.openRowAction(/Edit/i, row);
    expect(opened, `${this.schemeName} slab with weight ${weight} should expose an Edit/view action.`).toBe(true);

    const dialog = this.activeDialog();
    await expect(dialog, `${this.schemeName} detail dialog should open.`).toBeVisible({ timeout: 10000 });
    const { min, max, weight: weightInput } = this.slabInputs(dialog);
    await expect(weightInput, `${this.schemeName} detail dialog should show weight ${weight}.`).toHaveValue(String(weight), { timeout: 10000 });
    await expect(min).toHaveValue('1');
    await expect(max).toHaveValue('10');
    await this.closeDialog();

    await expect(this.findRowByWeight(weight), 'Viewing must not change the slab.').toHaveCount(1);
  }

  /**
   * @param {string | number} currentWeight the weight identifying the record to edit
   * @param {string | number} newWeight the weight to change it to
   */
  async verifyEditFlow(currentWeight, newWeight) {
    const row = this.findRowByWeight(currentWeight);
    await expect(row, `${this.schemeName} slab with weight ${currentWeight} should be listed.`).toHaveCount(1, { timeout: 15000 });
    const opened = await this.openRowAction(/Edit/i, row);
    expect(opened, `${this.schemeName} slab with weight ${currentWeight} should expose an Edit action.`).toBe(true);

    const dialog = this.activeDialog();
    await expect(dialog, `${this.schemeName} edit dialog should open.`).toBeVisible({ timeout: 10000 });
    const { weight } = this.slabInputs(dialog);
    await expect(weight).toHaveValue(String(currentWeight), { timeout: 10000 });
    await this.setNumber(weight, String(newWeight));

    // The submit button is literally labelled "Edit".
    const submit = dialog.getByRole('button', { name: /^(Edit|Update|Save)$/i }).first();
    await expect(submit, `${this.schemeName} edit submit button should be enabled.`).toBeEnabled({ timeout: 10000 });
    const saveResponse = this.waitForSlabApi(/update|edit/);
    await submit.click();
    const response = await saveResponse;
    expect(response, `${this.schemeName} Edit should call its update API.`).not.toBeNull();
    expect(response?.ok(), `${this.schemeName} update should succeed (HTTP ${response?.status()}).`).toBe(true);
    const created = createdWeightsFor(this.schemeName);
    created.delete(String(currentWeight));
    created.add(String(newWeight));
    await this.confirmSuccessIfShown();
    await expect(dialog, 'Edit dialog should close after saving.').toBeHidden({ timeout: 15000 });

    await expect(
      this.findRowByWeight(newWeight),
      `The edited ${this.schemeName} slab should show the updated weight ${newWeight}.`
    ).toHaveCount(1, { timeout: 15000 });
    await expect(this.findRowByWeight(currentWeight), 'The old weight should no longer be listed.').toHaveCount(0);
  }

  /** @param {string | number} weight identifies the record to delete */
  async verifyDeleteConfirmation(weight) {
    const row = this.findRowByWeight(weight);
    await expect(row, `${this.schemeName} slab with weight ${weight} should be listed before deleting it.`).toHaveCount(1, { timeout: 15000 });
    const opened = await this.openRowAction(/Delete/i, row);
    expect(opened, `${this.schemeName} slab with weight ${weight} should expose a Delete action.`).toBe(true);

    const confirmation = this.page.locator('.swal2-popup, .modal-dialog, mat-dialog-container').filter({ visible: true }).last();
    await expect(confirmation, `${this.schemeName} delete confirmation should open.`).toBeVisible({ timeout: 10000 });
    const confirmButton = confirmation.getByRole('button', { name: /^(Delete|Remove|Yes.*|Confirm)$/i }).first();
    await expect(confirmButton, `${this.schemeName} delete confirm button should be visible.`).toBeVisible({ timeout: 10000 });
    const deleteResponse = this.waitForSlabApi(/delete|remove/);
    await confirmButton.click();
    const response = await deleteResponse;
    expect(response, `${this.schemeName} Delete should call its delete API.`).not.toBeNull();
    expect(response?.ok(), `${this.schemeName} delete should succeed (HTTP ${response?.status()}).`).toBe(true);
    await this.confirmSuccessIfShown();

    await expect(
      this.findRowByWeight(weight),
      `The ${this.schemeName} slab with weight ${weight} should no longer appear after deleting it.`
    ).toHaveCount(0, { timeout: 15000 });
    createdWeightsFor(this.schemeName).delete(String(weight));
  }

  /**
   * Every slab scheme is listed under the "Driver KPI Slabs" sidebar menu and each link opens
   * that scheme's page.
   */
  async verifySidebarSchemeNavigation() {
    for (const schemeName of ALL_SCHEMES) {
      const page = new DriverKpiSlabSchemePage(this.page, schemeName);
      await page.openSchemeFromSidebar();
      await expect(this.page, `${schemeName} link should open its route.`).toHaveURL(new RegExp(escapeRegExp(SCHEME_ROUTES[schemeName])), { timeout: 30000 });
      await page.verifyPageLoaded();
      const headers = (await page.table.locator('th').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
      expect(headers[0], `${schemeName} first column`).toBe(`Minimum ${page.unit}`);
    }
  }

  /**
   * Resolves with the next slab API response whose path ends in this action (e.g. the
   * delete call is GET /api/numberOfFines/delete?id=...), or null after 30s.
   * @param {RegExp} action e.g. /update|edit/ or /delete/
   */
  waitForSlabApi(action) {
    return this.page
      .waitForResponse((response) => {
        const urlPath = response.url().split('?')[0];
        return ['xhr', 'fetch'].includes(response.request().resourceType()) && response.request().method() !== 'OPTIONS'
          && new RegExp(`/api/[^/]+/(${action.source})$`, 'i').test(urlPath);
      }, { timeout: 30000 })
      .catch(() => null);
  }

  async confirmSuccessIfShown() {
    const okButton = this.page.locator('.swal2-confirm').filter({ visible: true }).first();
    if (await okButton.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
      await okButton.click();
      await okButton.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
  }

  async closeDialog() {
    const dialog = this.activeDialog();
    await dialog.getByRole('button', { name: /^Cancel$/i }).click();
    await expect(dialog, 'Dialog should close without saving.').toBeHidden({ timeout: 10000 });
  }
}

/**
 * afterAll safety net: deletes any slab this worker created for the scheme and did not get
 * to delete (only exact run-stamped weights recorded at create/edit time).
 * @param {import('@playwright/test').Browser} browser
 * @param {string} schemeName
 */
export async function cleanupCreatedSlabs(browser, schemeName, budgetMs = 180000) {
  const weights = [...createdWeightsFor(schemeName)];
  if (weights.length === 0) return;
  const page = await browser.newPage();
  const work = (async () => {
    const scheme = new DriverKpiSlabSchemePage(page, schemeName);
    await scheme.goto();
    for (const weight of weights) {
      if ((await scheme.findRowByWeight(weight).count()) === 0) {
        createdWeightsFor(schemeName).delete(weight);
        continue;
      }
      await scheme.verifyDeleteConfirmation(weight);
      console.log(`INFO: Cleanup deleted ${schemeName} test slab with weight ${weight}.`);
    }
  })();
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`cleanup exceeded ${budgetMs} ms`)), budgetMs);
  });
  try {
    // Bounded so a hung page can never make the afterAll hook itself time out.
    await Promise.race([work, deadline]);
  } catch (error) {
    console.log(`WARNING: Could not clean up ${schemeName} test slabs ${JSON.stringify([...createdWeightsFor(schemeName)])} (Min 1 / Max 10) - delete them manually: ${error instanceof Error ? error.message : error}`);
  } finally {
    clearTimeout(timer);
    await page.close().catch(() => {});
    await work.catch(() => {});
  }
}
