// @ts-check
// ============================================================
// TMDone Admin Console - Authentication
// Route: #/authentication/signin  (login API: POST <api>/token)
// ------------------------------------------------------------
// Every test starts from a fresh, logged-out browser context.
// Client-side validation is checked together with the fact that no
// /token request was sent; server-side rejection is checked on the
// /token response (400 invalid_grant) and the error popup.
//
// The shared real account only ever gets ONE wrong-password attempt per
// run (AUTH-03, retries disabled), followed by successful logins, so the
// suite can never lock the account that CI and every other test use.
// ============================================================

import { test, expect } from '@playwright/test';
import { CREDENTIALS, requireCredentials } from '../helpers/loginHelper.js';

const LOGIN_URL = CREDENTIALS.loginUrl;
const DASHBOARD_URL = `${CREDENTIALS.baseUrl}/#/home/dashboard`;
const VALID_EMAIL = CREDENTIALS.email;
const VALID_PASSWORD = CREDENTIALS.password;
const UNKNOWN_USER = 'wronguser@notexisting.com';
const FAKE_PASSWORD = 'NotARealPassword#1';
const REJECTED_MESSAGE = 'The user name or password is incorrect.';
const HOME_URL = /#\/home\//;

/** @param {import('@playwright/test').Page} page */
const usernameInput = (page) => page.locator('input[formcontrolname="username"]');
/** @param {import('@playwright/test').Page} page */
const passwordInput = (page) => page.locator('input[formcontrolname="password"]');
/** @param {import('@playwright/test').Page} page */
const loginButton = (page) => page.getByRole('button', { name: 'Login' });
/** @param {import('@playwright/test').Page} page */
const eyeToggle = (page) => page.locator('a.show-pwd-icon');
/** @param {import('@playwright/test').Page} page */
const errorPopup = (page) => page.locator('.swal2-popup').filter({ visible: true });
/** @param {import('@playwright/test').Page} page */
const fieldErrors = (page) => page.locator('mat-error').filter({ visible: true });
/** @param {import('@playwright/test').Page} page */
const appShell = (page) => page.locator('li.user_profile');

test.beforeEach(() => {
  requireCredentials();
});

/** @param {import('@playwright/test').Response} response */
const isTokenResponse = (response) => response.request().method() === 'POST' && /\/token$/.test(response.url());

/**
 * Records every POST /token request the page sends.
 * @param {import('@playwright/test').Page} page
 */
function recordTokenRequests(page) {
  /** @type {string[]} */
  const requests = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/token$/.test(request.url())) requests.push(request.postData() || '');
  });
  return requests;
}

/** @param {import('@playwright/test').Page} page */
async function openLoginPage(page) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
    if (await passwordInput(page).isVisible({ timeout: 30000 }).catch(() => false)) break;
    console.log(`Login form not visible after attempt ${attempt}; retrying...`);
  }
  await expect(usernameInput(page)).toBeVisible({ timeout: 30000 });
  await expect(passwordInput(page)).toBeVisible();
  await expect(loginButton(page)).toBeVisible();
}

/**
 * Fills the form, submits it with `submit` and returns the /token response.
 * @param {import('@playwright/test').Page} page
 * @param {string} username
 * @param {string} password
 * @param {(page: import('@playwright/test').Page) => Promise<void>} [submit]
 */
async function submitLogin(page, username, password, submit = (p) => loginButton(p).click()) {
  await usernameInput(page).fill(username);
  await passwordInput(page).fill(password);
  const response = page.waitForResponse(isTokenResponse, { timeout: 60000 });
  await submit(page);
  return response;
}

/**
 * Asserts a successful sign-in: 200 token for the account, home route, app shell, stored token.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Response} response
 */
async function expectSignedIn(page, response) {
  expect(response.status(), 'Valid credentials should get a 200 from /token').toBe(200);
  const body = await response.json();
  expect(body.access_token, 'Token response should carry an access token').toBeTruthy();
  expect(String(body.email).toLowerCase()).toBe(VALID_EMAIL.toLowerCase());
  await expect(page).toHaveURL(HOME_URL, { timeout: 60000 });
  await expect(appShell(page), 'App header with the profile menu should render after login').toBeVisible({ timeout: 60000 });
  expect(await page.evaluate(() => localStorage.getItem('token')), 'The access token should be stored').toBeTruthy();
  return body;
}

/**
 * Asserts a server-side rejection: 400 invalid_grant, error popup, still signed out.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Response} response
 */
async function expectRejected(page, response) {
  expect(response.status(), 'Rejected credentials should get a 400 from /token').toBe(400);
  const body = await response.json();
  expect(body.error).toBe('invalid_grant');
  expect(body.error_description).toBe(REJECTED_MESSAGE);
  await expect(errorPopup(page)).toContainText(REJECTED_MESSAGE);
  await expect(page).toHaveURL(/authentication\/signin/);
  expect(await page.evaluate(() => localStorage.getItem('token')), 'No token may be stored after a rejected login').toBeNull();
}

/** @param {import('@playwright/test').Page} page */
async function signIn(page) {
  await openLoginPage(page);
  const response = await submitLogin(page, VALID_EMAIL, VALID_PASSWORD);
  return expectSignedIn(page, response);
}

// ===================== SUCCESSFUL LOGIN =====================

test('AUTH-01: Valid login - correct credentials get a token and open the app', async ({ page }) => {
  await openLoginPage(page);
  const response = await submitLogin(page, VALID_EMAIL, VALID_PASSWORD);
  const body = await expectSignedIn(page, response);

  expect(body.token_type).toMatch(/bearer/i);
  expect(Number(body.expires_in)).toBeGreaterThan(0);
  const stored = await page.evaluate(() => ({ email: localStorage.getItem('email'), user: localStorage.getItem('currentUser') }));
  expect(String(stored.email).toLowerCase()).toContain(VALID_EMAIL.toLowerCase());
  expect(stored.user, 'currentUser should be stored for the session').toBeTruthy();
});

test('AUTH-09: Login button - is a labelled submit button and signs the user in', async ({ page }) => {
  await openLoginPage(page);
  const button = loginButton(page);
  await expect(button).toHaveAttribute('type', 'submit');
  await expect(button).toBeEnabled();

  const response = await submitLogin(page, VALID_EMAIL, VALID_PASSWORD);
  const body = await expectSignedIn(page, response);

  // The header avatar shows the first letter of the signed-in user's first name.
  const initial = String(body.firstName || '').trim().charAt(0).toUpperCase();
  await expect(page.locator('li.user_profile .profile-img-letter')).toHaveText(initial);
});

test('AUTH-10: Enter key in the password field submits the form', async ({ page }) => {
  await openLoginPage(page);
  const response = await submitLogin(page, VALID_EMAIL, VALID_PASSWORD, (p) => passwordInput(p).press('Enter'));
  await expectSignedIn(page, response);
});

// ===================== SERVER-SIDE REJECTION =====================

test('AUTH-02: Unknown username is rejected by the server (400 invalid_grant)', async ({ page }) => {
  await openLoginPage(page);
  const response = await submitLogin(page, UNKNOWN_USER, FAKE_PASSWORD);
  await expectRejected(page, response);
});

test.describe('AUTH-03 (single attempt)', () => {
  // One wrong-password attempt per run on the shared account - never retried.
  test.describe.configure({ retries: 0 });

  test('AUTH-03: Correct username with a wrong password is rejected', async ({ page }) => {
    await openLoginPage(page);
    const response = await submitLogin(page, VALID_EMAIL, 'WrongPassword999!');
    await expectRejected(page, response);
  });
});

test('AUTH-15: Rejection popup shows the error and OK returns to a usable form', async ({ page }) => {
  await openLoginPage(page);
  const response = await submitLogin(page, UNKNOWN_USER, FAKE_PASSWORD);
  await expectRejected(page, response);

  await expect(errorPopup(page).locator('.swal2-icon-show')).toHaveClass(/swal2-error/);
  await expect(errorPopup(page).locator('#swal2-html-container')).toHaveText(REJECTED_MESSAGE);
  await errorPopup(page).getByRole('button', { name: 'OK' }).click();
  await expect(errorPopup(page)).toHaveCount(0);

  // The form stays filled and editable for a second try.
  await expect(usernameInput(page)).toHaveValue(UNKNOWN_USER);
  await expect(usernameInput(page)).toBeEditable();
  await expect(passwordInput(page)).toBeEditable();
  await expect(loginButton(page)).toBeEnabled();
});

test('AUTH-16: Username that is not an email address is sent and rejected by the server', async ({ page }) => {
  await openLoginPage(page);
  // The field is a plain "username" text input: no client-side email format check.
  expect(await usernameInput(page).evaluate((/** @type {HTMLInputElement} */ el) => el.type)).toBe('text');
  const response = await submitLogin(page, 'invalid-email-format', FAKE_PASSWORD);
  expect(response.request().postData()).toContain('username=invalid-email-format');
  await expectRejected(page, response);
});

// ===================== CLIENT-SIDE VALIDATION =====================

test('AUTH-04: Empty form shows both required errors and sends no login request', async ({ page }) => {
  const tokenRequests = recordTokenRequests(page);
  await openLoginPage(page);
  await loginButton(page).click();

  await expect(fieldErrors(page)).toHaveText(['Username is required', 'Password is required']);
  await expect(usernameInput(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(passwordInput(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/authentication\/signin/);
  expect(tokenRequests).toHaveLength(0);
});

test('AUTH-05: Empty username only - "Username is required", no login request', async ({ page }) => {
  const tokenRequests = recordTokenRequests(page);
  await openLoginPage(page);
  await passwordInput(page).fill(FAKE_PASSWORD);
  await loginButton(page).click();

  await expect(fieldErrors(page)).toHaveText(['Username is required']);
  await expect(passwordInput(page)).toHaveAttribute('aria-invalid', 'false');
  expect(tokenRequests).toHaveLength(0);
});

test('AUTH-06: Empty password only - "Password is required", no login request', async ({ page }) => {
  const tokenRequests = recordTokenRequests(page);
  await openLoginPage(page);
  await usernameInput(page).fill(VALID_EMAIL);
  await loginButton(page).click();

  await expect(fieldErrors(page)).toHaveText(['Password is required']);
  await expect(usernameInput(page)).toHaveAttribute('aria-invalid', 'false');
  expect(tokenRequests).toHaveLength(0);
});

test('AUTH-14: Leading/trailing spaces in the username are rejected before sending', async ({ page }) => {
  const tokenRequests = recordTokenRequests(page);
  await openLoginPage(page);
  await usernameInput(page).fill(`  ${VALID_EMAIL}  `);
  await passwordInput(page).fill(VALID_PASSWORD);
  await loginButton(page).click();

  await expect(fieldErrors(page)).toHaveText(["Whitespace Can't contain start and end"]);
  await expect(usernameInput(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/authentication\/signin/);
  expect(tokenRequests).toHaveLength(0);
});

// ===================== FORM UI =====================

test('AUTH-07: Eye icon toggles the password between hidden and visible', async ({ page }) => {
  await openLoginPage(page);
  await passwordInput(page).fill(FAKE_PASSWORD);
  const icon = eyeToggle(page).locator('mat-icon');

  await expect(passwordInput(page)).toHaveAttribute('type', 'password');
  await expect(icon).toHaveText('visibility_off');

  await eyeToggle(page).click();
  await expect(passwordInput(page)).toHaveAttribute('type', 'text');
  await expect(icon).toHaveText('visibility');
  await expect(passwordInput(page)).toHaveValue(FAKE_PASSWORD);
  await expect(page).toHaveURL(/authentication\/signin/); // href="#" must not navigate

  await eyeToggle(page).click();
  await expect(passwordInput(page)).toHaveAttribute('type', 'password');
  await expect(icon).toHaveText('visibility_off');
});

test('AUTH-08: Tab moves focus username -> password -> Login button', async ({ page }) => {
  await openLoginPage(page);
  await usernameInput(page).focus();
  await expect(usernameInput(page)).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(passwordInput(page)).toBeFocused();

  // The eye toggle may sit between the password field and the button.
  await page.keyboard.press('Tab');
  if (!(await loginButton(page).evaluate((el) => el === document.activeElement))) {
    await expect(eyeToggle(page)).toBeFocused();
    await page.keyboard.press('Tab');
  }
  await expect(loginButton(page)).toBeFocused();
});

test('AUTH-11: Username and Password fields are labelled and autocomplete-ready', async ({ page }) => {
  await openLoginPage(page);
  await expect(page.locator('mat-label').filter({ visible: true })).toHaveText(['Username', 'Password']);
  await expect(usernameInput(page)).toHaveAttribute('autocomplete', 'username');
  await expect(passwordInput(page)).toHaveAttribute('autocomplete', 'current-password');
});

test('AUTH-12: Password is masked by default and stays masked while typing', async ({ page }) => {
  await openLoginPage(page);
  await expect(passwordInput(page)).toHaveAttribute('type', 'password');
  await passwordInput(page).pressSequentially('Abc#123');
  await expect(passwordInput(page)).toHaveAttribute('type', 'password');
  await expect(passwordInput(page)).toHaveValue('Abc#123');
});

test('AUTH-13: Form layout - fields and button are visible, stacked and inside the viewport', async ({ page }, testInfo) => {
  await openLoginPage(page);
  const boxes = await Promise.all([usernameInput(page), passwordInput(page), loginButton(page)].map((l) => l.boundingBox()));
  const [user, pass, button] = boxes;
  if (!user || !pass || !button) throw new Error('Login form elements must have a rendered box.');

  for (const box of boxes) {
    expect(box && box.width > 0 && box.height > 0).toBe(true);
  }
  expect(user.y, 'Username should be above Password').toBeLessThan(pass.y);
  expect(pass.y, 'Password should be above the Login button').toBeLessThan(button.y);
  const viewport = page.viewportSize();
  expect(button.x + button.width).toBeLessThanOrEqual(viewport ? viewport.width : Infinity);
  await testInfo.attach('login-form', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('AUTH-20: Login page is usable on a mobile viewport without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openLoginPage(page);

  for (const locator of [usernameInput(page), passwordInput(page), loginButton(page)]) {
    await expect(locator).toBeInViewport();
  }
  // Polled: the page animates in, and is wider than the screen until it settles. Once settled,
  // a Bootstrap .row gutter overhangs by 2px, which nobody can see; anything wider is a real defect.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
      message: 'Login page should not scroll sideways at 375px',
      timeout: 15000,
    })
    .toBeLessThanOrEqual(4);
});

// ===================== SESSION =====================

test('AUTH-17: Protected pages redirect a signed-out user to sign-in', async ({ page }) => {
  for (const url of [DASHBOARD_URL, `${CREDENTIALS.baseUrl}/#/home/campaigns`]) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await expect(page, `${url} should redirect to sign-in`).toHaveURL(/authentication\/signin/, { timeout: 30000 });
    await expect(passwordInput(page)).toBeVisible();
    await expect(appShell(page)).toHaveCount(0);
  }
});

test('AUTH-18: Opening the sign-in URL while signed in goes back into the app', async ({ page }) => {
  await signIn(page);
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await expect(page).toHaveURL(HOME_URL, { timeout: 30000 });
  await expect(passwordInput(page)).toHaveCount(0);
  await expect(appShell(page)).toBeVisible();
});

test('AUTH-21: Session survives a page reload', async ({ page }) => {
  await signIn(page);
  const urlBefore = page.url();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(urlBefore, { timeout: 30000 });
  await expect(appShell(page)).toBeVisible({ timeout: 60000 });
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeTruthy();
});

test('AUTH-19: Logout clears the session and Back does not reopen the app', async ({ page }) => {
  await signIn(page);
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await expect(appShell(page)).toBeVisible({ timeout: 60000 });

  await page.locator('li.user_profile a.dropdown-toggle').click();
  await page.locator('.user_dw_menu a').filter({ hasText: 'Logout' }).click();
  await expect(page).toHaveURL(/authentication\/signin/, { timeout: 30000 });
  expect(await page.evaluate(() => localStorage.getItem('token')), 'Logout should remove the stored token').toBeNull();

  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await expect(page).toHaveURL(/authentication\/signin/, { timeout: 30000 });
  await expect(appShell(page)).toHaveCount(0);

  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await expect(page).toHaveURL(/authentication\/signin/, { timeout: 30000 });
});
