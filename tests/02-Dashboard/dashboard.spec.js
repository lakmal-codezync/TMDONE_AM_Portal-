// ============================================================
// TMDone Admin Console - Dashboard (read-only analytics page)
// ============================================================
// Every widget on this page is fed by a POST to /api/dashboard/*.
// The tests capture those API responses and verify that what the
// page renders (counts, status breakdown, notification lists, the
// Top 30 lists) is exactly the data the backend returned, and that
// the Today / Week / Month / custom-range / Search filters send the
// correct date window and re-render the lists with the new data.
//
// Nothing on this page is created, edited or deleted. The Change
// Password dialog is opened and cancelled without typing into it.
// ============================================================

import { test, expect } from '@playwright/test';
import { loginToApp, CREDENTIALS } from '../helpers/loginHelper.js';

// ===================== CONSTANTS ============================
const BASE_URL = CREDENTIALS.baseUrl;
const DASHBOARD_URL = `${BASE_URL}/#/home/dashboard`;
const PAGE_READY_TIMEOUT = 90000;

// Navigation items expected to be present in the sidebar
const EXPECTED_NAV_ITEMS = [
  'Dashboard',
  'Vendor Performance',
  'Reports',
  'Analysis',
  'Stores',
  'Stores Ratings',
  'Offers',
  'Order Management',
  'Portfolio Analysis',
  'Accounts Management',
  'Campaigns',
  'Smart Boost Campaign',
  'Spotlights',
  'Driver KPI Slabs',
  'Reels',
  'TM Done Club',
  'User Notifications',
];

// Top 30 cards on the page and the key each one reads from the
// getTopTenStoresFilterBySector response.
const TOP_LISTS = [
  { title: 'Top 30 Restaurants', card: 'app-restaurants-card', apiKey: 'TopTenRestaurants' },
  { title: 'Top 30 Stores', card: 'app-stores-card', apiKey: 'TopTenStores' },
  { title: 'Top 30 Groceries', card: 'app-groceries-card', apiKey: 'TopTenGroceries' },
  { title: 'Top 30 Roses & Gifts', card: 'app-roses-gifts-card', apiKey: 'TopTenRosesAndGifts' },
];

// ===================== HELPERS ==============================

/** Collapse whitespace so UI text and API strings compare cleanly. */
const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** yyyy/MM/dd - the format the app sends in DateRange. */
function fmtApiDate(date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

/** dd/MM/yyyy - the format the date-range inputs display. */
function fmtInputDate(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * The DateRange the app computes for each quick filter
 * (GlobalService.setDateRequest): Today = today..today,
 * Week = today-7d..today-1d, Month = today-30d..today-1d.
 */
function expectedQuickRange(type) {
  if (type === 'Today') return `${fmtApiDate(daysAgo(0))}-${fmtApiDate(daysAgo(0))}`;
  if (type === 'Week') return `${fmtApiDate(daysAgo(7))}-${fmtApiDate(daysAgo(1))}`;
  return `${fmtApiDate(daysAgo(30))}-${fmtApiDate(daysAgo(1))}`;
}

/**
 * Records every /api/dashboard/* response (endpoint, request body,
 * parsed response body). Attach it BEFORE loginToApp so the initial
 * dashboard load is captured too.
 * @param {import('@playwright/test').Page} page
 */
function trackDashboardApi(page) {
  const calls = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/dashboard/')) return;
    const endpoint = url.split('/api/dashboard/')[1].split('?')[0];
    let requestBody = null;
    try {
      requestBody = response.request().postDataJSON();
    } catch {
      requestBody = null;
    }
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    calls.push({ endpoint, status: response.status(), requestBody, body });
  });

  return {
    calls,
    count(endpoint) {
      return calls.filter((call) => call.endpoint === endpoint).length;
    },
    /** Waits for (and returns) the latest call to `endpoint` matching `predicate`. */
    async latest(endpoint, predicate = () => true, timeout = PAGE_READY_TIMEOUT) {
      let match;
      await expect
        .poll(
          () => {
            match = [...calls].reverse().find((call) => call.endpoint === endpoint && predicate(call));
            return Boolean(match);
          },
          { timeout, message: `Expected a response from /api/dashboard/${endpoint}` }
        )
        .toBe(true);
      expect(match.status, `/api/dashboard/${endpoint} should return HTTP 200`).toBe(200);
      return match;
    },
  };
}

/**
 * Logs in and lands on the dashboard with its API traffic recorded.
 * @param {import('@playwright/test').Page} page
 */
async function openDashboard(page) {
  const api = trackDashboardApi(page);
  await loginToApp(page);
  if (!page.url().includes('#/home/dashboard')) {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  }
  await expect(page.locator('h4.page-header', { hasText: 'Dashboard' })).toBeVisible({ timeout: PAGE_READY_TIMEOUT });
  return api;
}

/**
 * Calendar period label, e.g. "SEPT 2026" / "OCT 2026". The app's
 * DateAdapter abbreviates some months with 4 letters (SEPT), so match
 * the 3-letter month prefix followed by any letters and the year.
 * @param {Date} date
 */
function calendarLabel(date) {
  const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase().slice(0, 3);
  return new RegExp(`^\\s*${month}[A-Z]*\\s+${date.getFullYear()}\\s*$`);
}

/** Level-4 page heading of the routed page. */
function pageHeading(page, name) {
  return page.getByRole('heading', { level: 4, name }).first();
}

/**
 * Real click that tolerates the app's cycling spinner overlay.
 * @param {import('@playwright/test').Locator} locator
 */
async function clickWhenReady(locator, attempts = 5) {
  const page = locator.page();
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.locator('.ngx-spinner-overlay, app-page-loader').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    try {
      await locator.click({ timeout: 8000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Reads the rendered rows of a Top 30 card.
 * @param {import('@playwright/test').Page} page
 * @param {string} card
 */
async function readTopList(page, card) {
  return page.locator(`${card} ul.scroll-list > li`).evaluateAll((items) =>
    items.map((item) => ({
      name: (item.querySelector('h5')?.textContent || '').replace(/\s+/g, ' ').trim(),
      count: Number((item.querySelector('.top-ten-list-count')?.textContent || '').trim()),
    }))
  );
}

/**
 * Asserts that a Top 30 card renders exactly the items the API returned
 * (or the "No results found" empty state when the API list is empty).
 * @param {import('@playwright/test').Page} page
 * @param {{title: string, card: string, apiKey: string}} list
 * @param {Array<{Name: string, Count: number}>} apiItems
 */
async function expectTopListMatchesApi(page, list, apiItems) {
  const card = page.locator(list.card);
  await expect(card.locator('h3')).toContainText(list.title);

  const expected = (apiItems || []).map((item) => ({ name: norm(item.Name), count: Number(item.Count) }));
  await expect
    .poll(() => readTopList(page, list.card), {
      timeout: 30000,
      message: `${list.title} should render exactly the ${list.apiKey} items returned by the API`,
    })
    .toEqual(expected);

  if (expected.length === 0) {
    await expect(card.getByText('No results found')).toBeVisible();
  } else {
    await expect(card.getByText('No results found')).toHaveCount(0);
  }
}

/**
 * Reads the value shown under a Branches Operations status label.
 * @param {import('@playwright/test').Page} page
 * @param {'OPENED'|'BUSY'|'CLOSED'} status
 */
function statusValue(page, status) {
  return page
    .locator('.col-md-4.text-center')
    .filter({ has: page.locator('p', { hasText: new RegExp(`^\\s*${status}\\s*$`) }) })
    .locator('p')
    .nth(1);
}

/**
 * Asserts the notification-style card lists exactly the API items.
 * @param {import('@playwright/test').Page} page
 * @param {string} card
 * @param {{Items: Array<{Notification: string}>}} apiBody
 */
async function expectNotificationListMatchesApi(page, card, apiBody) {
  const expected = (apiBody?.Items || []).map((item) => norm(item.Notification));
  await expect
    .poll(
      () =>
        page
          .locator(`${card} ul li`)
          .evaluateAll((items) => items.map((item) => (item.querySelector('h5')?.textContent || '').replace(/\s+/g, ' ').trim())),
      { timeout: 30000, message: `${card} should list the notifications returned by the API` }
    )
    .toEqual(expected);
}

// ============================================================
// DASH-01: Page Load & URL Verification
// ============================================================
test('DASH-01: Dashboard page loads and URL is correct', async ({ page }) => {
  await openDashboard(page);

  expect(page.url()).toContain('#/home/dashboard');
  await expect(page.locator('app-dashboard-panel')).toBeVisible();
  await expect(page.locator('app-counter-card')).toHaveCount(2);
  await expect(page.locator('app-listing-panel')).toBeVisible();

  console.log('DASH-01 PASSED: Dashboard URL verified:', page.url());
});

// ============================================================
// DASH-02: Sidebar Renders All Navigation Items
// ============================================================
test('DASH-02: Sidebar shows all expected navigation menu items', async ({ page }) => {
  await openDashboard(page);

  const sidebar = page.locator('#leftsidebar');
  await expect(sidebar).toBeVisible();
  for (const navItem of EXPECTED_NAV_ITEMS) {
    const link = sidebar.locator('a.menu-top', { has: page.locator('span.hide-menu', { hasText: new RegExp(`^\\s*${navItem.replace(/[&]/g, '\\$&')}\\s*$`) }) });
    await expect(link, `Expected "${navItem}" in sidebar`).toHaveCount(1);
    await expect(link).toHaveAttribute('href', /^#\/home\//);
  }
  await expect(sidebar.locator('a', { hasText: 'Logout' })).toBeVisible();

  console.log('DASH-02 PASSED: All sidebar navigation items verified.');
});

// ============================================================
// DASH-03: Header / Navbar Visibility
// ============================================================
test('DASH-03: Header navbar is visible with logo and brand name', async ({ page }) => {
  await openDashboard(page);

  await expect(page.locator('nav.navbar').first()).toBeVisible();
  const brandLink = page.locator('a.navbar-brand').first();
  await expect(brandLink).toBeVisible();
  await expect(brandLink).toHaveAttribute('href', '#/home/dashboard');
  await expect(page.locator('.logo-name').first()).toHaveText(/TMDone Console/);
  const logo = page.locator('img.logo-image').first();
  await expect(logo).toBeVisible();
  // The logo image must actually have loaded (not a broken image).
  await expect.poll(() => logo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  console.log('DASH-03 PASSED: Header/Navbar elements verified.');
});

// ============================================================
// DASH-04: Fullscreen Button in Header
// ============================================================
// Clicking the fullscreen button enters browser fullscreen, clicking
// it again leaves fullscreen.
// ============================================================
test('DASH-04: Fullscreen button toggles browser fullscreen mode', async ({ page }) => {
  await openDashboard(page);

  const fullscreenBtn = page.locator('li.fullscreen button').first();
  await expect(fullscreenBtn).toBeVisible();

  await clickWhenReady(fullscreenBtn);
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);

  await clickWhenReady(fullscreenBtn);
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);

  console.log('DASH-04 PASSED: Fullscreen enter/exit verified.');
});

// ============================================================
// DASH-05: User Profile Menu Access
// ============================================================
test('DASH-05: User profile menu opens and shows Logout option', async ({ page }) => {
  await openDashboard(page);

  const profileToggle = page.locator('li.user_profile a.dropdown-toggle');
  const menu = page.locator('li.user_profile .dropdown-menu');
  await expect(profileToggle).toBeVisible();
  await expect(menu).toBeHidden();

  await clickWhenReady(profileToggle);
  await expect(menu).toBeVisible();
  await expect(menu.locator('a', { hasText: 'Change Password' })).toBeVisible();
  await expect(menu.locator('a', { hasText: 'Logout' })).toBeVisible();

  // Clicking the avatar again closes the menu.
  await clickWhenReady(profileToggle);
  await expect(menu).toBeHidden();

  console.log('DASH-05 PASSED: User profile menu verified.');
});

// ============================================================
// DASH-05b: Change Password Dialog
// ============================================================
// Opens the dialog, checks its three password fields, that the
// submit button is disabled while the form is empty, that the eye
// icon reveals a field, then cancels. Nothing is typed or submitted
// (the suite shares a single account).
// ============================================================
test('DASH-05b: User profile menu - Change Password form opens', async ({ page }) => {
  await openDashboard(page);

  await clickWhenReady(page.locator('li.user_profile a.dropdown-toggle'));
  await clickWhenReady(page.locator('.user_dw_menu a', { hasText: 'Change Password' }));

  const dialog = page.locator('mat-dialog-container');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Change Password');

  for (const field of ['OldPassword', 'Password', 'ConfirmPassword']) {
    const input = dialog.locator(`input[formcontrolname="${field}"]`);
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('type', 'password');
    await expect(input).toHaveValue('');
  }
  await expect(dialog.getByText('Current Password')).toBeVisible();
  await expect(dialog.getByText('New Password')).toBeVisible();
  await expect(dialog.getByText('Confirm Password')).toBeVisible();

  // Submit is disabled while the form is invalid (empty).
  await expect(dialog.getByRole('button', { name: 'Change Password' })).toBeDisabled();

  // The eye icon toggles visibility of the Current Password field.
  const oldPassword = dialog.locator('input[formcontrolname="OldPassword"]');
  await clickWhenReady(dialog.locator('a.show-pwd-icon').first());
  await expect(oldPassword).toHaveAttribute('type', 'text');
  await clickWhenReady(dialog.locator('a.show-pwd-icon').first());
  await expect(oldPassword).toHaveAttribute('type', 'password');

  await clickWhenReady(dialog.getByRole('button', { name: 'Cancel' }));
  await expect(page.locator('mat-dialog-container')).toHaveCount(0);

  console.log('DASH-05b PASSED: Change password dialog opened and cancelled without submitting.');
});

// ============================================================
// DASH-06: Logout Functionality
// ============================================================
// Logout is client-side only (clears this browser context's storage),
// so it does not affect the shared cached session used by other tests.
// ============================================================
test('DASH-06: Logout works and redirects to the sign-in page', async ({ page }) => {
  await openDashboard(page);

  const logoutLink = page.locator('#leftsidebar a', { hasText: 'Logout' });
  await expect(logoutLink).toBeVisible();
  await clickWhenReady(logoutLink);

  await page.waitForURL(/#\/authentication\/signin/, { timeout: 30000 });
  await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => localStorage.getItem('currentUser'))).toBeNull();

  // After logout the dashboard is no longer reachable.
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/signin/, { timeout: 30000 });

  console.log('DASH-06 PASSED: Logged out, session cleared and dashboard guarded.');
});

// ============================================================
// DASH-07: Sidebar Navigation - Click Dashboard Link
// ============================================================
test('DASH-07: Clicking Dashboard sidebar link stays on dashboard', async ({ page }) => {
  await openDashboard(page);

  // Collapsible group toggles (Offers, Smart Boost...) also carry the current
  // route as href, so only the real top-level link is selected.
  const dashboardLink = page.locator('#leftsidebar a.menu-top:not(.menu-toggle)[href="#/home/dashboard"]');
  await expect(dashboardLink).toBeVisible();
  await clickWhenReady(dashboardLink);

  await expect(page).toHaveURL(/#\/home\/dashboard/);
  await expect(page.locator('h4.page-header', { hasText: 'Dashboard' })).toBeVisible();
  await expect(dashboardLink.locator('xpath=..')).toHaveClass(/active/);

  console.log('DASH-07 PASSED: Dashboard sidebar link navigates correctly.');
});

// ============================================================
// DASH-08: Sidebar Navigation - Campaigns
// ============================================================
test('DASH-08: Clicking Campaigns sidebar link navigates to Campaigns page', async ({ page }) => {
  await openDashboard(page);

  await clickWhenReady(page.locator('#leftsidebar a[href="#/home/campaigns"]'));
  await page.waitForURL(/#\/home\/campaigns/, { timeout: 30000 });
  await expect(pageHeading(page, /^Campaigns$/)).toBeVisible({ timeout: 60000 });

  console.log('DASH-08 PASSED: Campaigns navigation verified. URL:', page.url());
});

// ============================================================
// DASH-09: Sidebar Navigation - Stores
// ============================================================
test('DASH-09: Clicking Stores sidebar link navigates to Stores page', async ({ page }) => {
  await openDashboard(page);

  await clickWhenReady(page.locator('#leftsidebar a[href="#/home/stores"]'));
  await page.waitForURL(/#\/home\/stores$/, { timeout: 30000 });
  await expect(pageHeading(page, /^Manage Stores$/)).toBeVisible({ timeout: 60000 });

  console.log('DASH-09 PASSED: Stores navigation verified. URL:', page.url());
});

// ============================================================
// DASH-10: Sidebar Navigation - Reports
// ============================================================
test('DASH-10: Clicking Reports sidebar link navigates to Reports page', async ({ page }) => {
  await openDashboard(page);

  await clickWhenReady(page.locator('#leftsidebar a[href="#/home/reports"]'));
  await page.waitForURL(/#\/home\/reports/, { timeout: 30000 });
  await expect(pageHeading(page, /^Reports$/)).toBeVisible({ timeout: 60000 });

  console.log('DASH-10 PASSED: Reports navigation verified. URL:', page.url());
});

// ============================================================
// DASH-11: Sidebar Navigation - Offers (sub-menu)
// ============================================================
// "Offers" is a menu toggle: clicking it expands a sub-menu whose
// "Target Audience Builder" entry opens the offers page.
// ============================================================
test('DASH-11: Clicking Offers sidebar link navigates to Offers page', async ({ page }) => {
  await openDashboard(page);

  const offersToggle = page.locator('#leftsidebar a.menu-toggle', { hasText: 'Offers' });
  const subLink = page.locator('#leftsidebar a.ml-menu[href="#/home/offers/offer-queries"]');
  await expect(offersToggle).toBeVisible();
  await expect(subLink).toBeHidden();

  await clickWhenReady(offersToggle);
  await expect(subLink).toBeVisible();
  await expect(subLink).toHaveText(/Target Audience Builder/);

  await clickWhenReady(subLink);
  await page.waitForURL(/#\/home\/offers\/offer-queries/, { timeout: 30000 });

  console.log('DASH-11 PASSED: Offers navigation verified. URL:', page.url());
});

// ============================================================
// DASH-12: Sidebar Navigation - Order Management
// ============================================================
test('DASH-12: Clicking Order Management sidebar link navigates to Order Management page', async ({ page }) => {
  await openDashboard(page);

  await clickWhenReady(page.locator('#leftsidebar a[href="#/home/order-management"]'));
  await page.waitForURL(/#\/home\/order-management/, { timeout: 30000 });
  await expect(page.locator('h4.page-header').first()).toContainText(/Order/i, { timeout: 60000 });

  console.log('DASH-12 PASSED: Order Management navigation verified. URL:', page.url());
});

// ============================================================
// DASH-13: Sidebar Collapse / Expand Toggle
// ============================================================
// The hamburger adds "side-closed" to <body> (collapsed sidebar) and
// removes it again on the second click.
// ============================================================
test('DASH-13: Sidebar collapse/expand toggle works via hamburger button', async ({ page }) => {
  await openDashboard(page);

  const hamburgerBtn = page.locator('button.sidemenu-collapse');
  const body = page.locator('body');
  await expect(hamburgerBtn).toBeVisible();
  await expect(body).not.toHaveClass(/\bside-closed\b/);

  await clickWhenReady(hamburgerBtn);
  await expect(body).toHaveClass(/\bside-closed\b/);
  await expect(body).toHaveClass(/\bsubmenu-closed\b/);

  await clickWhenReady(hamburgerBtn);
  await expect(body).not.toHaveClass(/\bside-closed\b/);
  await expect(page.locator('#leftsidebar a.menu-top', { hasText: 'Dashboard' })).toBeVisible();

  console.log('DASH-13 PASSED: Sidebar collapse/expand verified.');
});

// ============================================================
// DASH-14: Browser Tab Title Check
// ============================================================
test('DASH-14: Browser page title identifies the application', async ({ page }) => {
  await openDashboard(page);

  await expect(page).toHaveTitle('TMDone-Console');

  console.log('DASH-14 PASSED: Page title is set:', await page.title());
});

// ============================================================
// DASH-15: Number of Accounts per Brand
// ============================================================
test('DASH-15: Dashboard shows Number of Accounts per Brand count', async ({ page }) => {
  const api = await openDashboard(page);
  const brand = await api.latest('getAccountsPerBrand');
  expect(typeof brand.body, 'getAccountsPerBrand should return a number').toBe('number');

  const card = page.locator('app-counter-card').filter({ hasText: 'Number of Accounts per Brand' });
  await expect(card).toContainText('BRAND(s)');
  await expect(card.locator('.card-amount-values')).toHaveText(String(brand.body));

  console.log(`DASH-15 PASSED: Accounts per Brand = ${brand.body} (matches API).`);
});

// ============================================================
// DASH-16: Number of Accounts per Branch
// ============================================================
test('DASH-16: Dashboard shows Number of Accounts per Branch count', async ({ page }) => {
  const api = await openDashboard(page);
  const branch = await api.latest('getAccountsPerBranch');
  expect(typeof branch.body, 'getAccountsPerBranch should return a number').toBe('number');

  const card = page.locator('app-counter-card').filter({ hasText: 'Number of Accounts per Branch' });
  await expect(card).toContainText('BRANCH(s)');
  await expect(card.locator('.card-amount-values')).toHaveText(String(branch.body));

  console.log(`DASH-16 PASSED: Accounts per Branch = ${branch.body} (matches API).`);
});

// ============================================================
// DASH-17 / 18 / 19: Branches Operations status counts
// ============================================================
for (const [id, status, apiKey] of [
  ['DASH-17', 'OPENED', 'Opened'],
  ['DASH-18', 'BUSY', 'Busy'],
  ['DASH-19', 'CLOSED', 'Closed'],
]) {
  test(`${id}: Dashboard shows ${status} status count`, async ({ page }) => {
    const api = await openDashboard(page);
    const storeStatus = await api.latest('getStoreStatus');
    expect(typeof storeStatus.body?.[apiKey], `getStoreStatus.${apiKey} should be a number`).toBe('number');

    const value = statusValue(page, status);
    await expect(value).toBeVisible();
    await expect.poll(async () => Number((await value.innerText()).trim())).toBe(storeStatus.body[apiKey]);

    console.log(`${id} PASSED: ${status} = ${storeStatus.body[apiKey]} (matches API).`);
  });
}

// ============================================================
// DASH-20: New Assignments
// ============================================================
test('DASH-20: Dashboard shows New Assignments', async ({ page }) => {
  const api = await openDashboard(page);
  const assignments = await api.latest('getNotifications', (call) => call.requestBody?.Type === 'ASSIGNMENT');
  expect(assignments.requestBody).toMatchObject({ Page: 1, PageSize: 10 });

  await expect(page.locator('app-assignments-card h3')).toContainText('New Assignments');
  await expectNotificationListMatchesApi(page, 'app-assignments-card', assignments.body);

  console.log(`DASH-20 PASSED: ${(assignments.body.Items || []).length} assignments rendered (matches API).`);
});

// ============================================================
// DASH-21: New Notifications
// ============================================================
test('DASH-21: Dashboard shows New Notifications', async ({ page }) => {
  const api = await openDashboard(page);
  const notifications = await api.latest('getNotifications', (call) => call.requestBody?.Type === 'STORE_STATUS_CHANGE');
  expect(notifications.requestBody).toMatchObject({ Page: 1, PageSize: 10 });

  await expect(page.locator('app-notification-card h3')).toContainText('New Notifications');
  await expectNotificationListMatchesApi(page, 'app-notification-card', notifications.body);

  console.log(`DASH-21 PASSED: ${(notifications.body.Items || []).length} notifications rendered (matches API).`);
});

// ============================================================
// DASH-22: Date Filters (Today, Week, Month)
// ============================================================
// Each quick filter re-queries the Top 30 lists with its own date
// window, becomes the highlighted button, and the lists re-render with
// the returned data. Month is the default on page load.
// ============================================================
test('DASH-22: Dashboard allows filtering by Today, Week, and Month', async ({ page }) => {
  test.setTimeout(240000);
  const api = await openDashboard(page);

  // Default: Month is active and was used for the initial load.
  const initial = await api.latest('getTopTenStoresFilterBySector');
  expect(initial.requestBody.DateReqType).toBe('Month');
  expect(initial.requestBody.DateRange).toBe(expectedQuickRange('Month'));
  await expect(page.locator('.btn-filter button', { hasText: 'Month' })).toHaveClass(/btn-primary/);

  for (const type of ['Today', 'Week', 'Month']) {
    const before = api.count('getTopTenStoresFilterBySector');
    await clickWhenReady(page.locator('.btn-filter button', { hasText: type }));

    const response = await api.latest(
      'getTopTenStoresFilterBySector',
      (call) => call.requestBody?.DateReqType === type && api.count('getTopTenStoresFilterBySector') > before
    );
    expect(response.requestBody.DateRange, `${type} should query its own date window`).toBe(expectedQuickRange(type));

    for (const name of ['Today', 'Week', 'Month']) {
      const button = page.locator('.btn-filter button', { hasText: name });
      if (name === type) await expect(button).toHaveClass(/btn-primary/);
      else await expect(button).not.toHaveClass(/btn-primary/);
    }
    for (const list of TOP_LISTS) {
      await expectTopListMatchesApi(page, list, response.body[list.apiKey]);
    }
    // The API returns null (not []) for a list with no data, e.g. "Today" early in the morning.
    console.log(`  ${type}: ${response.requestBody.DateRange} -> ${(response.body.TopTenRestaurants || []).length} restaurants`);
  }

  console.log('DASH-22 PASSED: Today/Week/Month filters query the right window and re-render the lists.');
});

// ============================================================
// DASH-23 .. DASH-26: Top 30 lists render the API data
// ============================================================
for (const [id, list] of [
  ['DASH-23', TOP_LISTS[0]],
  ['DASH-24', TOP_LISTS[1]],
  ['DASH-25', TOP_LISTS[2]],
  ['DASH-26', TOP_LISTS[3]],
]) {
  test(`${id}: Dashboard shows ${list.title}`, async ({ page }) => {
    const api = await openDashboard(page);
    const response = await api.latest('getTopTenStoresFilterBySector');
    expect(Array.isArray(response.body?.[list.apiKey]), `${list.apiKey} should be an array`).toBe(true);

    await expect(page.locator(list.card)).toBeVisible();
    await expectTopListMatchesApi(page, list, response.body[list.apiKey]);

    console.log(`${id} PASSED: ${list.title} renders ${(response.body[list.apiKey] || []).length} item(s) (matches API).`);
  });
}

// ============================================================
// DASH-27: Reload re-fetches every dashboard widget
// ============================================================
test('DASH-27: Dashboard displays real-time data metrics', async ({ page }) => {
  const api = await openDashboard(page);
  await api.latest('getTopTenStoresFilterBySector');

  const endpoints = ['getAccountsPerBrand', 'getAccountsPerBranch', 'getStoreStatus', 'getNotifications', 'getTopTenStoresFilterBySector'];
  const before = Object.fromEntries(endpoints.map((endpoint) => [endpoint, api.count(endpoint)]));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('h4.page-header', { hasText: 'Dashboard' })).toBeVisible({ timeout: PAGE_READY_TIMEOUT });

  for (const endpoint of endpoints) {
    await api.latest(endpoint, () => api.count(endpoint) > before[endpoint]);
  }

  // The re-rendered widgets reflect the fresh responses.
  const brand = await api.latest('getAccountsPerBrand');
  await expect(
    page.locator('app-counter-card').filter({ hasText: 'Number of Accounts per Brand' }).locator('.card-amount-values')
  ).toHaveText(String(brand.body));
  const top = await api.latest('getTopTenStoresFilterBySector');
  await expectTopListMatchesApi(page, TOP_LISTS[0], top.body.TopTenRestaurants);

  console.log('DASH-27 PASSED: All widgets were re-fetched and re-rendered after reload.');
});

// ============================================================
// DASH-28: Page Refresh Maintains Session
// ============================================================
test('DASH-28: Page refresh maintains user session and dashboard access', async ({ page }) => {
  await openDashboard(page);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('h4.page-header', { hasText: 'Dashboard' })).toBeVisible({ timeout: PAGE_READY_TIMEOUT });

  expect(page.url()).toContain('#/home/dashboard');
  expect(page.url()).not.toContain('signin');
  expect(await page.evaluate(() => localStorage.getItem('currentUser'))).not.toBeNull();

  console.log('DASH-28 PASSED: Session maintained after page refresh.');
});

// ============================================================
// DASH-29: Profile avatar shows the signed-in user's initial
// ============================================================
// (The header has no notification bell; notifications are shown in
// the New Notifications card, covered by DASH-21.)
// ============================================================
test('DASH-29: Profile avatar shows the signed-in user initial', async ({ page }) => {
  await openDashboard(page);

  // The avatar letter is the first letter of the signed-in user's first name.
  const firstName = await page.evaluate(() => {
    const raw = localStorage.getItem('firstname');
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  });
  expect(firstName, 'first name should be stored after login').toBeTruthy();
  const initial = String(firstName).trim().charAt(0).toUpperCase();

  await expect(page.locator('li.user_profile .profile-img-letter')).toHaveText(initial);

  console.log(`DASH-29 PASSED: Avatar initial "${initial}" matches the logged-in user's first name.`);
});

// ============================================================
// DASH-30: Top 30 Restaurants ranking
// ============================================================
// The list is a ranking: at most 30 entries, sorted by order count
// from highest to lowest, every count a positive integer.
// ============================================================
test('DASH-30: Top 30 Restaurants list is ranked by order count', async ({ page }) => {
  const api = await openDashboard(page);
  const response = await api.latest('getTopTenStoresFilterBySector');
  await expectTopListMatchesApi(page, TOP_LISTS[0], response.body.TopTenRestaurants);

  const rows = await readTopList(page, TOP_LISTS[0].card);
  expect(rows.length).toBeLessThanOrEqual(30);
  for (const row of rows) {
    expect(row.name.length, 'every row has a store name').toBeGreaterThan(0);
    expect(Number.isInteger(row.count) && row.count > 0, `count for ${row.name} should be a positive integer`).toBe(true);
  }
  const counts = rows.map((row) => row.count);
  expect(counts).toEqual([...counts].sort((a, b) => b - a));

  console.log(`DASH-30 PASSED: ${rows.length} restaurants ranked by order count.`);
});

// ============================================================
// DASH-31: Search button re-applies the current filter
// ============================================================
test('DASH-31: Dashboard search/filter functionality is available', async ({ page }) => {
  const api = await openDashboard(page);
  await api.latest('getTopTenStoresFilterBySector');

  // Pick a non-default filter, then use the toolbar Search button.
  await clickWhenReady(page.locator('.btn-filter button', { hasText: 'Week' }));
  await api.latest('getTopTenStoresFilterBySector', (call) => call.requestBody?.DateReqType === 'Week');

  const searchBtn = page.locator('app-listing-panel button[mattooltip="Search"]');
  await expect(searchBtn).toBeVisible();
  const before = api.count('getTopTenStoresFilterBySector');
  await clickWhenReady(searchBtn);

  const response = await api.latest('getTopTenStoresFilterBySector', () => api.count('getTopTenStoresFilterBySector') > before);
  expect(response.requestBody.DateReqType).toBe('Week');
  expect(response.requestBody.DateRange).toBe(expectedQuickRange('Week'));
  await expect(page.locator('.btn-filter button', { hasText: 'Week' })).toHaveClass(/btn-primary/);
  await expectTopListMatchesApi(page, TOP_LISTS[0], response.body.TopTenRestaurants);

  console.log('DASH-31 PASSED: Search re-queried the lists with the active Week filter.');
});

// ============================================================
// DASH-32: Custom date range from the calendar
// ============================================================
// Picks the 1st..10th of the previous month from the range picker.
// The lists are re-queried with DateReqType "Day" and exactly that
// window, the quick-filter buttons are de-selected, and the lists
// re-render with the new data.
// ============================================================
test('DASH-32: Custom date range from the calendar filters the Top 30 lists', async ({ page }) => {
  const api = await openDashboard(page);
  await api.latest('getTopTenStoresFilterBySector');

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 10);

  await clickWhenReady(page.locator('app-listing-panel mat-datepicker-toggle button'));
  const calendar = page.locator('mat-calendar');
  await expect(calendar).toBeVisible();
  await clickWhenReady(calendar.locator('.mat-calendar-previous-button'));
  await expect(calendar.locator('.mat-calendar-period-button')).toHaveText(calendarLabel(start));

  const day = (n) => calendar.locator('.mat-calendar-body-cell-content').filter({ hasText: new RegExp(`^\\s*${n}\\s*$`) }).first();
  const before = api.count('getTopTenStoresFilterBySector');
  await clickWhenReady(day(1));
  await clickWhenReady(day(10));
  await expect(calendar).toBeHidden();

  await expect(page.locator('app-listing-panel input[formcontrolname="start"]')).toHaveValue(fmtInputDate(start));
  await expect(page.locator('app-listing-panel input[formcontrolname="end"]')).toHaveValue(fmtInputDate(end));

  const response = await api.latest('getTopTenStoresFilterBySector', (call) => call.requestBody?.DateReqType === 'Day' && api.count('getTopTenStoresFilterBySector') > before);
  expect(response.requestBody.DateRange).toBe(`${fmtApiDate(start)}-${fmtApiDate(end)}`);

  for (const name of ['Today', 'Week', 'Month']) {
    await expect(page.locator('.btn-filter button', { hasText: name })).not.toHaveClass(/btn-primary/);
  }
  for (const list of TOP_LISTS) {
    await expectTopListMatchesApi(page, list, response.body[list.apiKey]);
  }

  console.log(`DASH-32 PASSED: Custom range ${response.requestBody.DateRange} applied.`);
});

// ============================================================
// DASH-33: Responsive Design - Mobile View
// ============================================================
// On a phone-sized viewport the left sidebar is moved off-canvas
// (body gets "ls-closed") while the dashboard content stays usable.
// ============================================================
test('DASH-33: Dashboard is responsive on mobile viewport', async ({ page }) => {
  await openDashboard(page);

  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.locator('body')).toHaveClass(/\bls-closed\b/);
  await expect
    .poll(async () => {
      const box = await page.locator('#leftsidebar').boundingBox();
      return box ? box.x + box.width : 0;
    }, { message: 'sidebar should be moved off-canvas on mobile' })
    .toBeLessThanOrEqual(0);

  await expect(page.locator('h4.page-header', { hasText: 'Dashboard' })).toBeVisible();
  await expect(page.locator('app-counter-card').first()).toBeVisible();

  // Back to desktop: sidebar is restored.
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('body')).not.toHaveClass(/\bls-closed\b/);
  await expect(page.locator('#leftsidebar a.menu-top', { hasText: 'Dashboard' })).toBeVisible();

  console.log('DASH-33 PASSED: Sidebar goes off-canvas on mobile and returns on desktop.');
});

// ============================================================
// DASH-34: Keyboard Accessibility
// ============================================================
test('DASH-34: Dashboard supports keyboard navigation (Tab key)', async ({ page }) => {
  await openDashboard(page);

  const focused = [];
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    focused.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName.toLowerCase()}|${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}` : '';
      })
    );
  }
  console.log(`Focus order: ${focused.join(' -> ')}`);

  const interactive = focused.filter((entry) => /^(a|button|input|select|textarea|mat-select)\|/.test(entry));
  expect(interactive.length, 'Tab should move focus through interactive elements').toBeGreaterThanOrEqual(5);
  expect(new Set(focused).size, 'focus should advance to different elements').toBeGreaterThan(3);

  console.log('DASH-34 PASSED: Keyboard navigation is functional.');
});

// ============================================================
// DASH-35: Performance - Page Load Time
// ============================================================
test('DASH-35: Dashboard loads within acceptable time', async ({ page }) => {
  const api = trackDashboardApi(page);
  await loginToApp(page);

  const startTime = Date.now();
  await page.goto(`${BASE_URL}/#/home/reports`, { waitUntil: 'domcontentloaded' });
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h4.page-header', { hasText: 'Dashboard' })).toBeVisible({ timeout: 30000 });
  await api.latest('getStoreStatus', () => true, 30000);
  await expect(statusValue(page, 'OPENED')).toBeVisible({ timeout: 30000 });
  const loadTime = Date.now() - startTime;

  console.log(`Dashboard load time: ${(loadTime / 1000).toFixed(2)}s`);
  // Tolerant of shared demo-environment variance while still catching a stalled page.
  expect(loadTime).toBeLessThan(45000);

  console.log('DASH-35 PASSED.');
});

// ============================================================
// DASH-36: Branches Operations percentage bar
// ============================================================
// (The theme/skin settings panel exists in the DOM but has no visible
// trigger in this build, so it is not user-reachable and not tested.)
// ============================================================
test('DASH-36: Branches Operations bar shows opened/closed percentages from the API', async ({ page }) => {
  const api = await openDashboard(page);
  const status = await api.latest('getStoreStatus');

  const bars = page.locator('.progress [role="progressbar"]');
  const expected = [];
  for (const key of ['OpenedPercentage', 'ClosedPercentage']) {
    if (status.body[key] > 0) expected.push(`${Math.round(status.body[key])}%`);
  }
  expect(expected.length, 'store status API should report at least one non-zero percentage').toBeGreaterThan(0);
  await expect.poll(async () => (await bars.allInnerTexts()).map((text) => text.trim())).toEqual(expected);

  await expect(page.getByText('Opened Stores')).toBeVisible();
  await expect(page.getByText('Busy Stores')).toBeVisible();
  await expect(page.getByText('Closed Stores')).toBeVisible();

  console.log(`DASH-36 PASSED: progress bar ${expected.join(' / ')} matches API.`);
});

// ============================================================
// DASH-37: Breadcrumb / page header
// ============================================================
test('DASH-37: Breadcrumb navigation is present and functional', async ({ page }) => {
  await openDashboard(page);

  const breadcrumb = page.locator('app-dashboard-panel ul.breadcrumb');
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb.locator('li.breadcrumb-item')).toHaveCount(1);
  await expect(breadcrumb.locator('h4.page-header')).toHaveText('Dashboard');

  console.log('DASH-37 PASSED: Breadcrumb shows the Dashboard page header.');
});

// ============================================================
// DASH-38: Brand logo returns to the dashboard
// ============================================================
test('DASH-38: Brand logo link returns to the dashboard from another page', async ({ page }) => {
  await openDashboard(page);

  await clickWhenReady(page.locator('#leftsidebar a[href="#/home/reports"]'));
  await page.waitForURL(/#\/home\/reports/, { timeout: 30000 });

  await clickWhenReady(page.locator('a.navbar-brand'));
  await page.waitForURL(/#\/home\/dashboard/, { timeout: 30000 });
  await expect(page.locator('h4.page-header', { hasText: 'Dashboard' })).toBeVisible({ timeout: PAGE_READY_TIMEOUT });

  console.log('DASH-38 PASSED: Brand logo navigates back to the dashboard.');
});

// ============================================================
// DASH-39: Every top-level sidebar link routes to its page
// ============================================================
test('DASH-39: Every top-level sidebar link routes to its own page', async ({ page }) => {
  test.setTimeout(420000);
  await openDashboard(page);

  const links = await page
    .locator('#leftsidebar a.menu-top:not(.menu-toggle)')
    .evaluateAll((anchors) =>
      anchors
        .map((a) => ({ href: a.getAttribute('href'), text: (a.textContent || '').replace(/\s+/g, ' ').trim() }))
        // Logout is also an a.menu-top but has no route (covered by DASH-06).
        .filter((link) => link.href && link.href.startsWith('#/home/'))
    );
  expect(links.length).toBeGreaterThan(10);

  for (const link of links) {
    await clickWhenReady(page.locator(`#leftsidebar a.menu-top:not(.menu-toggle)[href="${link.href}"]`));
    const reached = await page
      .waitForURL((url) => url.toString().includes(link.href), { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    expect.soft(reached, `"${link.text}" should route to ${link.href} (got ${page.url()})`).toBe(true);
    expect.soft(page.url()).not.toContain('signin');
  }

  console.log(`DASH-39 PASSED: ${links.length} sidebar links route correctly.`);
});

// ============================================================
// DASH-40: Unauthenticated access is redirected to sign-in
// ============================================================
test('DASH-40: Dashboard session timeout handling', async ({ browser }) => {
  // A brand-new context has no session at all (equivalent to an expired one).
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForURL(/#\/authentication\/signin/, { timeout: 60000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('h4.page-header', { hasText: 'Dashboard' })).toHaveCount(0);
  } finally {
    await context.close();
  }

  console.log('DASH-40 PASSED: Dashboard requires an authenticated session.');
});
