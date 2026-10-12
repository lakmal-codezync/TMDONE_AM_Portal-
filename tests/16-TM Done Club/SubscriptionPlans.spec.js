// @ts-check
// ============================================================
// TMDone Admin Console - TM Done Club - Subscription Plans
// URL: #/home/tm-done-club/plans
// VIEW-ONLY by explicit user decision: page load, table vs API, server-side
// search, no-match search, clear, pagination footer and the row-actions menu
// (opened and closed without choosing). Plans are never created, edited or
// deleted here.
// ============================================================

import { test, expect } from '@playwright/test';
import {
  TM_DONE_CLUB_ROUTES,
  API,
  openClubPage,
  toolbarButton,
  searchInput,
  dataRows,
  tableHeaders,
  clickAndCapture,
  expectTableMatchesApi,
  readRowActions,
} from './tm-done-club-helper.js';

const NO_MATCH_TERM = `zz-no-plan-${Date.now()}`;

test.describe('TM Done Club Subscription Plans - View-Only Coverage', () => {
  /** @type {{ TotalItemCount: number, PageCount: number, Items: any[] }} */
  let initial;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(180000);
    initial = await openClubPage(page, TM_DONE_CLUB_ROUTES.plans, 'Subscription Plans', API.plans);
    expect(initial, 'Plans list API should return JSON.').not.toBeNull();
  });

  test('TDCSP-01: Subscription plans page loads with main controls', async ({ page }) => {
    await expect(page.locator('button.create-button').filter({ hasText: 'Create Subscription Plan' })).toBeVisible();
    await expect(searchInput(page)).toBeVisible();
    await expect(toolbarButton(page, 'Search')).toBeEnabled();
    await expect(toolbarButton(page, 'Clear')).toBeEnabled();
    expect(await tableHeaders(page)).toEqual(['Name', 'Billing Cycle', 'Price', 'Is Active', 'Actions']);
    expect(initial.TotalItemCount, 'Subscription plans should exist in this environment.').toBeGreaterThan(0);
    await expectTableMatchesApi(page, initial);
  });

  test('TDCSP-02: Search by plan name filters server-side and Clear restores the list', async ({ page }) => {
    const term = initial.Items[0].Name;
    await searchInput(page).fill(term);
    const searched = await clickAndCapture(page, 'Search', API.plans);
    expect(searched.request.SearchString, 'Search term should be sent to the API.').toBe(term);
    expect(searched.body.TotalItemCount).toBeGreaterThan(0);
    await expectTableMatchesApi(page, searched.body);
    for (const name of await dataRows(page).locator('td:first-child').allInnerTexts()) {
      expect(name.toLowerCase(), `Every row should match "${term}".`).toContain(term.toLowerCase());
    }
    const otherNames = initial.Items.map((p) => p.Name).filter((n) => !n.toLowerCase().includes(term.toLowerCase()));
    if (otherNames.length) {
      await expect(dataRows(page).filter({ hasText: otherNames[0] }), `"${otherNames[0]}" should be filtered out.`).toHaveCount(0);
    }

    const cleared = await clickAndCapture(page, 'Clear', API.plans);
    expect(cleared.request.SearchString).toBe('');
    await expect(searchInput(page)).toHaveValue('');
    expect(cleared.body.TotalItemCount).toBe(initial.TotalItemCount);
    await expectTableMatchesApi(page, cleared.body);
  });

  test('TDCSP-03: Pagination footer reflects the API page count', async ({ page }) => {
    await expect(page.getByText(/You're on page\s*1/).first()).toBeVisible();
    const next = page.locator('li.pagination-next').first();
    await expect(next).toBeVisible();
    if (initial.PageCount <= 1) {
      await expect(next, 'Next page should be disabled when all plans fit on one page.').toHaveClass(/disabled/);
    } else {
      await expect(next).not.toHaveClass(/disabled/);
    }
  });

  test('TDCSP-04: Table rows show the plan values returned by the API', async ({ page }) => {
    for (const plan of initial.Items) {
      const row = dataRows(page).filter({ has: page.locator('td:first-child', { hasText: new RegExp(`^\\s*${plan.Name}\\s*$`) }) });
      await expect(row, `Plan "${plan.Name}" should be listed once.`).toHaveCount(1);
      const cells = (await row.locator('td').allInnerTexts()).map((c) => c.trim());
      expect(cells[1]).toBe(plan.BillingCycle);
      expect(Number(cells[2])).toBe(Number(plan.Price));
      expect(cells[3].toLowerCase()).toBe(String(plan.IsActive).toLowerCase());
    }
  });

  test('TDCSP-05: Search with no matching plan shows an empty result', async ({ page }) => {
    await searchInput(page).fill(NO_MATCH_TERM);
    const searched = await clickAndCapture(page, 'Search', API.plans);
    expect(searched.request.SearchString).toBe(NO_MATCH_TERM);
    expect(searched.body.TotalItemCount).toBe(0);
    await expectTableMatchesApi(page, searched.body);
  });

  test('TDCSP-06: Row actions menu offers Edit and Delete (view-only, nothing chosen)', async ({ page }) => {
    const actions = await readRowActions(page, dataRows(page).first());
    expect(actions).toEqual(['Edit', 'Delete']);
    await expect(dataRows(page)).toHaveCount(initial.Items.length);
  });
});
