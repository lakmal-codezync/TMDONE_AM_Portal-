// @ts-check
// ============================================================
// TMDone Admin Console - TM Done Club - Cancellation Reasons
// URL: #/home/tm-done-club/cancellation-reasons
// VIEW-ONLY by explicit user decision: page load, table vs API, server-side
// search, no-match search, clear, pagination footer, Excel export and the
// row-actions menu (opened and closed without choosing). Reasons are never
// created, edited or deleted here.
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
  captureDownload,
  isXlsx,
} from './tm-done-club-helper.js';

const NO_MATCH_TERM = `zz-no-reason-${Date.now()}`;

test.describe('TM Done Club Cancellation Reasons - View-Only Coverage', () => {
  /** @type {{ TotalItemCount: number, PageCount: number, Items: any[] }} */
  let initial;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(180000);
    initial = await openClubPage(page, TM_DONE_CLUB_ROUTES.cancellationReasons, 'Cancellation Reasons', API.reasons);
    expect(initial, 'Cancellation reasons API should return JSON.').not.toBeNull();
  });

  test('TDCCR-01: Cancellation reasons page loads with main controls', async ({ page }) => {
    await expect(page.locator('button.create-button').filter({ hasText: 'Add New Reason' })).toBeVisible();
    await expect(searchInput(page)).toBeVisible();
    await expect(toolbarButton(page, 'Search')).toBeEnabled();
    await expect(toolbarButton(page, 'Clear')).toBeEnabled();
    await expect(toolbarButton(page, 'Download')).toBeEnabled();
    expect(await tableHeaders(page)).toEqual(['Title', 'Arabic Title', 'Description', 'Actions']);
    expect(initial.TotalItemCount, 'Cancellation reasons should exist in this environment.').toBeGreaterThan(0);
    await expectTableMatchesApi(page, initial);
  });

  test('TDCCR-02: Search by title filters server-side and Clear restores the list', async ({ page }) => {
    const term = initial.Items[0].Title.split(/\s+/)[0];
    const expected = initial.Items.filter((r) => r.Title.toLowerCase().includes(term.toLowerCase()) || (r.Description || '').toLowerCase().includes(term.toLowerCase()));
    await searchInput(page).fill(term);
    const searched = await clickAndCapture(page, 'Search', API.reasons);
    expect(searched.request.SerchText, 'Search term should be sent to the API.').toBe(term);
    expect(searched.body.TotalItemCount).toBeGreaterThan(0);
    expect(searched.body.TotalItemCount).toBeLessThanOrEqual(expected.length);
    await expectTableMatchesApi(page, searched.body);
    for (const text of await dataRows(page).allInnerTexts()) {
      expect(text.toLowerCase(), `Every row should match "${term}".`).toContain(term.toLowerCase());
    }
    const nonMatching = initial.Items.filter((r) => !expected.includes(r));
    if (nonMatching.length) {
      await expect(dataRows(page).filter({ hasText: nonMatching[0].Title }), `"${nonMatching[0].Title}" should be filtered out.`).toHaveCount(0);
    }

    const cleared = await clickAndCapture(page, 'Clear', API.reasons);
    expect(cleared.request.SerchText).toBe('');
    await expect(searchInput(page)).toHaveValue('');
    expect(cleared.body.TotalItemCount).toBe(initial.TotalItemCount);
    await expectTableMatchesApi(page, cleared.body);
  });

  test('TDCCR-03: Pagination footer reflects the API page count', async ({ page }) => {
    await expect(page.getByText(/You're on page\s*1/).first()).toBeVisible();
    const next = page.locator('li.pagination-next').first();
    await expect(next).toBeVisible();
    if (initial.PageCount <= 1) {
      await expect(next, 'Next page should be disabled when all reasons fit on one page.').toHaveClass(/disabled/);
    } else {
      await expect(next).not.toHaveClass(/disabled/);
    }
  });

  test('TDCCR-04: Table rows show the EN/AR titles and descriptions returned by the API', async ({ page }) => {
    for (const reason of initial.Items) {
      const row = dataRows(page).filter({ has: page.locator('td:first-child', { hasText: reason.Title }) });
      await expect(row, `Reason "${reason.Title}" should be listed once.`).toHaveCount(1);
      const cells = (await row.locator('td').allInnerTexts()).map((c) => c.trim());
      expect(cells[0]).toBe(reason.Title);
      expect(cells[1]).toBe(reason.TitleAr);
      expect(cells[2]).toBe(reason.Description);
    }
  });

  test('TDCCR-05: Search with no matching reason shows an empty result', async ({ page }) => {
    await searchInput(page).fill(NO_MATCH_TERM);
    const searched = await clickAndCapture(page, 'Search', API.reasons);
    expect(searched.request.SerchText).toBe(NO_MATCH_TERM);
    expect(searched.body.TotalItemCount).toBe(0);
    await expectTableMatchesApi(page, searched.body);
  });

  test('TDCCR-06: Row actions menu offers Edit and Delete (view-only, nothing chosen)', async ({ page }) => {
    const actions = await readRowActions(page, dataRows(page).first());
    expect(actions).toEqual(['Edit', 'Delete']);
    await expect(dataRows(page)).toHaveCount(initial.Items.length);
  });

  test('TDCCR-07: Download exports the cancellation reasons as an Excel file', async ({ page }, testInfo) => {
    const file = await captureDownload(page, toolbarButton(page, 'Download'), testInfo, /\/api\/clubCancellationReasons\/generateCancellationReasonsExel/i);
    expect(file.status, 'Export API should succeed.').toBe(200);
    expect(file.request.SerchText, 'Unfiltered export should send an empty search.').toBe('');
    expect(file.filename).toMatch(/^TMDONE_Cancellation_Reason_\d{2}_\d{2}_\d{4},\d{2}_\d{2}\.xlsx$/);
    expect(file.size).toBeGreaterThan(0);
    expect(isXlsx(file.head), 'Downloaded file should be a real .xlsx (zip) file.').toBe(true);
  });
});
