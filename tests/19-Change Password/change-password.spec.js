// @ts-check
// ============================================================
// TMDone Admin Console - Change Password dialog + header/sidebar shell
// Route: header avatar (nav.navbar li.user_profile) -> Change Password
//        -> mat-dialog <app-change-password>; the URL does not change.
//
// VIEW-ONLY / CLIENT-SIDE VALIDATION ONLY - by design:
// the whole suite and the nightly CI share ONE real account. Submitting
// this form would change that account's password and lock everybody out.
// So these tests
//   - never click the "Change Password" submit button and never press
//     Enter inside the form,
//   - never type the real password (only obviously fake values below),
//   - close the dialog with Cancel / X and assert that NO change-password
//     request was sent (request guard on every test).
// The header/sidebar shell tests are pure UI toggles (read-only).
// DASH-04/05/05b/13 already cover fullscreen, the profile menu, the
// basic dialog fields and the collapse button; this file covers the
// validation rules, all three show/hide toggles, X/Cancel reset
// behaviour, the dialog on other pages and the sidebar accordion.
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from '../helpers/loginHelper.js';

const DASHBOARD_URL = `${CREDENTIALS.baseUrl}/#/home/dashboard`;
const SPINNERS = ['.ngx-spinner-overlay', 'app-page-loader'];

// Fake values only - never the account's real password.
const FAKE_CURRENT = 'NotTheRealPw#1';
const WEAK_NEW = 'abc';
const STRONG_NEW = 'QaAutoFake#2026x';
const STRONG_OTHER = 'QaAutoFake#2026z';

const FIELDS = [
  { name: 'OldPassword', label: 'Current Password', placeholder: 'Enter Current Password', required: 'Old Password is required' },
  { name: 'Password', label: 'New Password', placeholder: 'Enter New Password', required: 'New Password is required' },
  { name: 'ConfirmPassword', label: 'Confirm Password', placeholder: 'Re Enter the New Password', required: 'Confirm Password is required' },
];
const RULE_ERROR = 'Use 8+ chars with upper, lower, number, and special character';
const MISMATCH_ERROR = 'Passwords do not match';

const SIDEBAR_GROUPS = [
  { name: 'Offers', links: [['Target Audience Builder', '#/home/offers/offer-queries']] },
  {
    name: 'Smart Boost Campaign',
    links: [['Campaign List', '#/home/smart-boost-campaign/list'], ['Analytics', '#/home/smart-boost-campaign/analytics']],
  },
  {
    name: 'Driver KPI Slabs',
    links: [
      ['Speed of Delivery Slab Scheme', '#/home/fare-scheme/speed-of-delivery'],
      ['Redispatch Rate Slab Scheme', '#/home/fare-scheme/redispatch-rate'],
      ['Average Attendance Slab Scheme', '#/home/fare-scheme/average-attendance'],
      ['Block Count Slab Scheme', '#/home/fare-scheme/block-count'],
      ['Number of Fines Slab Scheme', '#/home/fare-scheme/number-of-fines'],
    ],
  },
  {
    name: 'TM Done Club',
    links: [
      ['Analytics', '#/home/tm-done-club/analytics'],
      ['Subscription Plans', '#/home/tm-done-club/plans'],
      ['Subscriptions Reports', '#/home/tm-done-club/subscriptions'],
      ['Cancellation Reasons', '#/home/tm-done-club/cancellation-reasons'],
    ],
  },
];

// ===================== HELPERS ==============================

/** @param {import('@playwright/test').Page} page */
async function waitForSpinners(page) {
  for (const selector of SPINNERS) {
    await page.locator(selector).first().waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  }
}

/**
 * Real click with a short timeout in a retry loop (spinner overlays cycle).
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 */
async function clickWhenReady(page, locator) {
  await locator.waitFor({ state: 'visible', timeout: 30000 });
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await waitForSpinners(page);
    try {
      await locator.click({ timeout: 8000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1000);
    }
  }
  throw lastError;
}

/**
 * Records AND aborts any request that could change the password, so even an
 * accidental submit never reaches the server (a wrong current password would
 * count as a failed attempt on the shared account). Must stay empty.
 * @param {import('@playwright/test').Page} page
 */
async function guardPasswordRequests(page) {
  /** @type {string[]} */
  const fired = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    const body = request.method() === 'GET' ? '' : request.postData() || '';
    if (request.method() !== 'GET' && (/pass(word)?/i.test(url) || /OldPassword|ConfirmPassword|NotTheRealPw|QaAutoFake/.test(body))) {
      fired.push(`${request.method()} ${url}`);
      await route.abort();
      return;
    }
    await route.fallback();
  });
  return fired;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
async function openPage(page, url = DASHBOARD_URL) {
  await loginToApp(page);
  if (page.url() !== url) await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('nav.navbar')).toBeVisible({ timeout: 90000 });
  await waitForSpinners(page);
}

/** @param {import('@playwright/test').Page} page */
async function openChangePasswordDialog(page) {
  await clickWhenReady(page, page.locator('li.user_profile a.dropdown-toggle'));
  await clickWhenReady(page, page.locator('.user_dw_menu a', { hasText: 'Change Password' }));
  const dialog = page.locator('mat-dialog-container').filter({ has: page.locator('app-change-password') });
  await expect(dialog).toBeVisible({ timeout: 30000 });
  await expect(dialog.locator('h5.title')).toHaveText('Change Password');
  return dialog;
}

/**
 * @param {import('@playwright/test').Locator} dialog
 * @param {string} name
 */
const field = (dialog, name) => dialog.locator(`input[formcontrolname="${name}"]`);

/** @param {import('@playwright/test').Locator} dialog */
const submitButton = (dialog) => dialog.getByRole('button', { name: 'Change Password' });

/** @param {import('@playwright/test').Locator} dialog */
async function errorTexts(dialog) {
  return (await dialog.locator('mat-error').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
}

/**
 * Blur the fields by clicking the dialog title (never Enter: that could submit).
 * @param {import('@playwright/test').Locator} dialog
 */
async function blur(dialog) {
  await dialog.locator('h5.title').click();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 */
async function cancelDialog(page, dialog) {
  await clickWhenReady(page, dialog.getByRole('button', { name: 'Cancel' }));
  await expect(page.locator('mat-dialog-container')).toHaveCount(0, { timeout: 15000 });
}

// ===================== CHANGE PASSWORD ======================

test.describe('19-Change Password - dialog client-side validation (never submitted)', () => {
  /** @type {string[]} */
  let passwordRequests = [];

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    passwordRequests = await guardPasswordRequests(page);
    await openPage(page);
  });

  test.afterEach(async ({ page }) => {
    expect(passwordRequests, 'No change-password request may ever be sent by these tests.').toEqual([]);
    // Safety net: never leave a filled dialog open.
    const cancel = page.locator('mat-dialog-container').getByRole('button', { name: 'Cancel' });
    if (await cancel.count()) await cancel.click({ timeout: 5000 }).catch(() => {});
  });

  test('CP-01: Profile menu lists Change Password and Logout with their icons', async ({ page }) => {
    const toggle = page.locator('li.user_profile a.dropdown-toggle');
    await expect(toggle).toHaveText('M');
    await clickWhenReady(page, toggle);
    const items = page.locator('.user_dw_menu a').filter({ visible: true });
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveText(/lock_reset\s*Change Password/);
    await expect(items.nth(1)).toHaveText(/power_settings_new\s*Logout/);
  });

  test('CP-02: Dialog shows title, close icon, labelled required fields with placeholders and both buttons', async ({ page }) => {
    const urlBefore = page.url();
    const dialog = await openChangePasswordDialog(page);
    expect(page.url(), 'Opening the dialog must not navigate.').toBe(urlBefore);

    await expect(dialog.locator('mat-icon.close-button')).toHaveText('close');
    const labels = (await dialog.locator('mat-label').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    expect(labels).toEqual(FIELDS.map((f) => `${f.label}*`));
    for (const f of FIELDS) {
      const input = field(dialog, f.name);
      await expect(input).toHaveAttribute('placeholder', f.placeholder);
      await expect(input).toHaveAttribute('aria-required', 'true');
      await expect(input).toHaveAttribute('type', 'password');
      await expect(input).toHaveValue('');
    }
    await expect(submitButton(dialog)).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(await errorTexts(dialog), 'No errors before the user touches the form.').toEqual([]);
    await cancelDialog(page, dialog);
  });

  test('CP-03: Every field has its own show/hide toggle that switches only that input', async ({ page }) => {
    const dialog = await openChangePasswordDialog(page);
    const toggles = dialog.locator('a.show-pwd-icon');
    await expect(toggles).toHaveCount(3);

    for (let i = 0; i < FIELDS.length; i += 1) {
      const toggle = toggles.nth(i);
      await expect(toggle.locator('mat-icon')).toHaveText('visibility_off');
      await clickWhenReady(page, toggle);
      await expect(field(dialog, FIELDS[i].name)).toHaveAttribute('type', 'text');
      await expect(toggle.locator('mat-icon')).toHaveText('visibility');
      for (let j = 0; j < FIELDS.length; j += 1) {
        if (j !== i) await expect(field(dialog, FIELDS[j].name), `${FIELDS[j].label} stays masked.`).toHaveAttribute('type', 'password');
      }
      await clickWhenReady(page, toggle);
      await expect(field(dialog, FIELDS[i].name)).toHaveAttribute('type', 'password');
      await expect(toggle.locator('mat-icon')).toHaveText('visibility_off');
    }
    await cancelDialog(page, dialog);
  });

  test('CP-04: Touching and clearing the fields shows a required error for each one', async ({ page }) => {
    const dialog = await openChangePasswordDialog(page);
    for (const f of FIELDS) {
      await field(dialog, f.name).fill('x');
      await field(dialog, f.name).fill('');
    }
    await blur(dialog);
    await expect.poll(() => errorTexts(dialog)).toEqual(FIELDS.map((f) => f.required));
    await expect(submitButton(dialog)).toBeDisabled();
    await cancelDialog(page, dialog);
  });

  test('CP-05: Weak new password shows the complexity rule and keeps submit disabled', async ({ page }) => {
    const dialog = await openChangePasswordDialog(page);
    await field(dialog, 'OldPassword').fill(FAKE_CURRENT);
    await field(dialog, 'Password').fill(WEAK_NEW);
    await field(dialog, 'ConfirmPassword').fill(WEAK_NEW);
    await blur(dialog);
    await expect.poll(() => errorTexts(dialog)).toEqual([RULE_ERROR]);
    await expect(submitButton(dialog)).toBeDisabled();
    await cancelDialog(page, dialog);
  });

  test('CP-06: New and Confirm mismatch shows "Passwords do not match" and keeps submit disabled', async ({ page }) => {
    const dialog = await openChangePasswordDialog(page);
    await field(dialog, 'OldPassword').fill(FAKE_CURRENT);
    await field(dialog, 'Password').fill(STRONG_NEW);
    await field(dialog, 'ConfirmPassword').fill(STRONG_OTHER);
    await blur(dialog);
    await expect.poll(() => errorTexts(dialog)).toEqual([MISMATCH_ERROR]);
    await expect(submitButton(dialog)).toBeDisabled();
    await cancelDialog(page, dialog);
  });

  test('CP-07: A complete valid form enables submit and Cancel closes it without sending anything', async ({ page }) => {
    const dialog = await openChangePasswordDialog(page);
    await field(dialog, 'OldPassword').fill(FAKE_CURRENT);
    await field(dialog, 'Password').fill(STRONG_NEW);
    await field(dialog, 'ConfirmPassword').fill(STRONG_OTHER);
    await blur(dialog);
    await expect(submitButton(dialog)).toBeDisabled();

    // Fixing the confirmation clears the error and enables submit - which is never clicked.
    await field(dialog, 'ConfirmPassword').fill(STRONG_NEW);
    await expect.poll(() => errorTexts(dialog)).toEqual([]);
    await expect(submitButton(dialog)).toBeEnabled();
    await cancelDialog(page, dialog);
    expect(passwordRequests).toEqual([]);
  });

  test('CP-08: Close (X) icon closes the dialog and a reopened dialog starts empty', async ({ page }) => {
    let dialog = await openChangePasswordDialog(page);
    await field(dialog, 'OldPassword').fill(FAKE_CURRENT);
    await field(dialog, 'Password').fill(STRONG_NEW);
    await clickWhenReady(page, dialog.locator('mat-icon.close-button'));
    await expect(page.locator('mat-dialog-container')).toHaveCount(0, { timeout: 15000 });

    dialog = await openChangePasswordDialog(page);
    for (const f of FIELDS) await expect(field(dialog, f.name), `${f.label} should be reset.`).toHaveValue('');
    await expect(submitButton(dialog)).toBeDisabled();
    await cancelDialog(page, dialog);
  });

  test('CP-09: Change Password is reachable from the header on a non-dashboard page and keeps the URL', async ({ page }) => {
    const ratingsUrl = `${CREDENTIALS.baseUrl}/#/home/stores-ratings`;
    await page.goto(ratingsUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('nav.navbar')).toBeVisible({ timeout: 90000 });
    await waitForSpinners(page);
    const dialog = await openChangePasswordDialog(page);
    await expect(page).toHaveURL(/#\/home\/stores-ratings/);
    await expect(field(dialog, 'OldPassword')).toBeVisible();
    await cancelDialog(page, dialog);
    await expect(page).toHaveURL(/#\/home\/stores-ratings/);
  });
});

// ===================== HEADER / SIDEBAR SHELL ===============

test.describe('19-Change Password - header and sidebar shell (read-only)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    await openPage(page);
  });

  test('SHELL-01: Header toolbar has brand, collapse, fullscreen and profile controls', async ({ page }) => {
    const navbar = page.locator('nav.navbar');
    await expect(navbar.locator('a.navbar-brand')).toHaveText(/TMDone Console/);
    await expect(navbar.locator('a.navbar-brand')).toHaveAttribute('href', '#/home/dashboard');
    await expect(navbar.locator('button.sidemenu-collapse')).toHaveText('menu');
    await expect(navbar.locator('li.fullscreen button')).toHaveText('fullscreen');
    await expect(navbar.locator('li.user_profile a.dropdown-toggle')).toBeVisible();
  });

  test('SHELL-02: Sidebar groups list their sub-pages and behave as an accordion', async ({ page }) => {
    const toggles = page.locator('#leftsidebar a.menu-toggle');
    expect((await toggles.allInnerTexts()).map((t) => t.replace(/^[a-z_]+/, '').trim()))
      .toEqual(SIDEBAR_GROUPS.map((g) => g.name));

    /** @param {string} name */
    const subMenu = (name) => toggles.filter({ hasText: name }).locator('xpath=following-sibling::ul[contains(@class,"ml-menu")]');
    for (const group of SIDEBAR_GROUPS) await expect(subMenu(group.name)).toBeHidden();

    for (const group of SIDEBAR_GROUPS) {
      await clickWhenReady(page, toggles.filter({ hasText: group.name }));
      await expect(subMenu(group.name), `${group.name} should expand.`).toBeVisible();
      const links = subMenu(group.name).locator('a');
      expect((await links.allInnerTexts()).map((t) => t.trim())).toEqual(group.links.map(([text]) => text));
      expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(group.links.map(([, href]) => href));
      for (const other of SIDEBAR_GROUPS) {
        if (other.name !== group.name) await expect(subMenu(other.name), `${other.name} should collapse when ${group.name} opens.`).toBeHidden();
      }
    }

    // Clicking the open group again collapses it; the page does not navigate.
    const last = SIDEBAR_GROUPS[SIDEBAR_GROUPS.length - 1].name;
    await clickWhenReady(page, toggles.filter({ hasText: last }));
    await expect(subMenu(last)).toBeHidden();
    await expect(page).toHaveURL(/#\/home\/dashboard$/);
  });

  test('SHELL-03: Each sidebar sub-page link routes to its page and is marked active', async ({ page }) => {
    const toggles = page.locator('#leftsidebar a.menu-toggle');
    for (const group of SIDEBAR_GROUPS) {
      for (const [text, href] of group.links) {
        const link = page.locator(`#leftsidebar ul.ml-menu a[href="${href}"]`);
        if (!(await link.isVisible())) await clickWhenReady(page, toggles.filter({ hasText: group.name }));
        await expect(link).toBeVisible({ timeout: 15000 });
        await clickWhenReady(page, link);
        await expect(page, `${group.name} > ${text}`).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`), { timeout: 60000 });
        await expect(link.locator('xpath=..'), `${text} should be highlighted as active.`).toHaveClass(/\bactive\b/, { timeout: 30000 });
      }
    }
  });

  test('SHELL-04: Collapsed sidebar persists across page navigation until expanded again', async ({ page }) => {
    const body = page.locator('body');
    const collapse = page.locator('button.sidemenu-collapse');
    await expect(body).not.toHaveClass(/\bside-closed\b/);
    await clickWhenReady(page, collapse);
    await expect(body).toHaveClass(/\bside-closed\b/);

    await clickWhenReady(page, page.locator('#leftsidebar a.menu-top[href="#/home/stores-ratings"]'));
    await expect(page).toHaveURL(/#\/home\/stores-ratings/, { timeout: 60000 });
    await expect(body, 'Sidebar stays collapsed after navigating.').toHaveClass(/\bside-closed\b/);

    await clickWhenReady(page, collapse);
    await expect(body).not.toHaveClass(/\bside-closed\b/);
    await expect(page.locator('#leftsidebar a.menu-top', { hasText: 'Stores Ratings' })).toBeVisible();
  });
});
