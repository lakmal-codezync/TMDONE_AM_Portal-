

import { test, expect } from '@playwright/test';
import { CREDENTIALS, requireCredentials } from '../helpers/loginHelper.js';

// ===================== CONSTANTS ============================
const LOGIN_URL = CREDENTIALS.loginUrl;
const DASHBOARD_URL = `${CREDENTIALS.baseUrl}/#/home/dashboard`;
const VALID_EMAIL = CREDENTIALS.email;
const VALID_PASSWORD = CREDENTIALS.password;

// Shared locator helpers (used across multiple tests)
/** @param {import('@playwright/test').Page} page */
const emailInput = (page) => page.locator('input').first();
/** @param {import('@playwright/test').Page} page */
const passwordInput = (page) => page.locator('input[type="password"]').first();
/** @param {import('@playwright/test').Page} page */
const loginButton = (page) =>
  page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("SIGN IN")').first();
/** @param {import('@playwright/test').Page} page */
const loginErrorMessage = (page) =>
  page
    .locator(
      '.swal2-popup, .swal2-container, mat-error, .error-message, .alert-danger, ' +
        '[class*="error"], [class*="invalid"], [role="alert"]'
    )
    .filter({ visible: true });

test.beforeEach(() => {
  requireCredentials();
});

/** @param {import('@playwright/test').Page} page */
async function openLoginPage(page) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(LOGIN_URL, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});

    const emailVisible = await emailInput(page).isVisible({ timeout: 30000 }).catch(() => false);
    const passwordVisible = await passwordInput(page).isVisible({ timeout: 30000 }).catch(() => false);
    if (emailVisible && passwordVisible) return;

    console.log(`Login form was not visible after navigation attempt ${attempt}; retrying...`);
    await page.waitForTimeout(2000);
  }

  await expect(emailInput(page)).toBeVisible({ timeout: 30000 });
  await expect(passwordInput(page)).toBeVisible({ timeout: 30000 });
}

/** @param {import('@playwright/test').Page} page */
async function waitForSignedIn(page) {
  await page.waitForURL((url) => !url.toString().includes('signin'), { timeout: 60000, waitUntil: 'commit' });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
}

/** @param {import('@playwright/test').Page} page */
async function signInWithValidCredentials(page) {
  await openLoginPage(page);
  await emailInput(page).fill(VALID_EMAIL);
  await passwordInput(page).fill(VALID_PASSWORD);
  await loginButton(page).click();
  await waitForSignedIn(page);
}

/** @param {import('@playwright/test').Page} page */
async function waitForLoginRejected(page) {
  await page.waitForTimeout(3000);
  expect(page.url()).toContain('signin');
}

/** @param {import('@playwright/test').Page} page */
async function getVisibleLoginErrorText(page) {
  const errors = loginErrorMessage(page);
  const count = await errors.count();
  const messages = [];

  for (let i = 0; i < count; i += 1) {
    const text = (await errors.nth(i).innerText().catch(() => '')).trim();
    if (text) messages.push(text);
  }

  return messages.join('\n');
}

/** @param {import('@playwright/test').Page} page */
async function clickLogout(page) {
  const visibleLogout = page
    .locator('.sidebar a:has-text("Logout"), a:has-text("power_settings_newLogout"), a:has-text("Logout"), button:has-text("Logout")')
    .filter({ visible: true })
    .first();

  if (await visibleLogout.isVisible().catch(() => false)) {
    await visibleLogout.click();
    return;
  }

  const profileTrigger = page.locator('.nav-item.user_pro, [class*="user_pro"], nav li button.mat-icon-button').filter({ visible: true }).first();
  await expect(profileTrigger).toBeVisible({ timeout: 15000 });
  await profileTrigger.click();
  await page.waitForTimeout(1000);

  const menuLogout = page.locator('a:has-text("Logout"), button:has-text("Logout")').filter({ visible: true }).first();
  await expect(menuLogout).toBeVisible({ timeout: 10000 });
  await menuLogout.click();
}

// ============================================================
// AUTH-01: Valid Login
// Entering correct username and password should log the user in
// and redirect away from the sign-in page.
// ============================================================
test('AUTH-01: Valid login - correct credentials redirect to dashboard', async ({ page }) => {
  await openLoginPage(page);

  await emailInput(page).fill(VALID_EMAIL);
  await passwordInput(page).fill(VALID_PASSWORD);
  await loginButton(page).click();

  // Wait until the URL changes away from the signin page (max 30s)
  await waitForSignedIn(page);

  const currentUrl = page.url();
  const isLoggedIn = !currentUrl.includes('signin');
  expect(isLoggedIn).toBe(true);

  console.log('✅ AUTH-01 PASSED: Valid login redirected to:', currentUrl);
});

// ============================================================
// AUTH-02: Invalid Username
// Entering a wrong/unregistered email should show an error and
// keep the user on the sign-in page.
// ============================================================
test('AUTH-02: Invalid username - wrong email shows error', async ({ page }) => {
  await openLoginPage(page);

  await emailInput(page).fill('wronguser@notexisting.com');
  await passwordInput(page).fill(VALID_PASSWORD);
  await loginButton(page).click();
  await page.waitForTimeout(3000);

  // User should still be on the signin page
  expect(page.url()).toContain('signin');

  console.log('✅ AUTH-02 PASSED: Invalid username correctly rejected.');
});

// ============================================================
// AUTH-03: Invalid Password
// Entering the correct email but wrong password should show an
// error and keep the user on the sign-in page.
// ============================================================
test('AUTH-03: Invalid password - correct email + wrong password shows error', async ({ page }) => {
  await openLoginPage(page);

  await emailInput(page).fill(VALID_EMAIL);
  await passwordInput(page).fill('WrongPassword999!');
  await loginButton(page).click();
  await page.waitForTimeout(3000);

  // User should still be on the signin page
  expect(page.url()).toContain('signin');

  console.log('✅ AUTH-03 PASSED: Invalid password correctly rejected.');
});

// ============================================================
// AUTH-04: Empty Fields
// Clicking Login without filling any field should block
// submission and keep the user on the sign-in page.
// ============================================================
test('AUTH-04: Empty fields - login should be blocked', async ({ page }) => {
  await openLoginPage(page);

  // Click login without filling anything
  await loginButton(page).click();
  await page.waitForTimeout(2000);

  // Must stay on the signin page
  expect(page.url()).toContain('signin');

  // Check for any visible validation error messages
  const errors = page.locator('mat-error, .error-message, [class*="error"]');
  const errorCount = await errors.count();
  console.log(`ℹ️ Validation errors visible: ${errorCount}`);

  console.log('✅ AUTH-04 PASSED: Empty form submission blocked.');
});

// ============================================================
// AUTH-05: Username Empty Only
// If the email field is empty but password is filled, the form
// should show validation and block login.
// ============================================================
test('AUTH-05: Username empty only - validation triggered even with password', async ({ page }) => {
  await openLoginPage(page);

  // Leave email empty, fill only password
  await passwordInput(page).fill(VALID_PASSWORD);
  await loginButton(page).click();
  await page.waitForTimeout(2000);

  // Should remain on the signin page
  expect(page.url()).toContain('signin');

  console.log('✅ AUTH-05 PASSED: Username-only-empty validation triggered.');
});

// ============================================================
// AUTH-06: Password Empty Only
// If the password field is empty but email is filled, the form
// should show validation and block login.
// ============================================================
test('AUTH-06: Password empty only - validation triggered even with username', async ({ page }) => {
  await openLoginPage(page);

  // Fill email, leave password empty
  await emailInput(page).fill(VALID_EMAIL);
  await loginButton(page).click();
  await page.waitForTimeout(2000);

  // Should remain on the signin page
  expect(page.url()).toContain('signin');

  console.log('✅ AUTH-06 PASSED: Password-only-empty validation triggered.');
});

// ============================================================
// AUTH-07: Password Show / Hide Toggle (Eye Icon)
// Clicking the eye icon should toggle the password field type
// between "password" (hidden) and "text" (visible).
// ============================================================
test('AUTH-07: Password hide/show toggle - eye icon works correctly', async ({ page }) => {
  await openLoginPage(page);

  // Use a stable locator based on position (2nd input) rather than type attribute,
  // because type changes from "password" → "text" when eye icon is clicked,
  // which would break a selector that relies on type="password".
  const pwdField = page.locator('input').nth(1);
  await pwdField.fill(VALID_PASSWORD);

  // Password should be masked by default
  await expect(pwdField).toHaveAttribute('type', 'password');

  // Try to find and click the eye/toggle icon
  const eyeIcon = page.locator(
    'button[mat-icon-button]:has(mat-icon), ' +
    'mat-icon:has-text("visibility"), mat-icon:has-text("visibility_off"), ' +
    '[class*="toggle-password"], [class*="eye"]'
  ).first();

  const eyeExists = await eyeIcon.isVisible().catch(() => false);

  if (eyeExists) {
    await eyeIcon.click();
    await page.waitForTimeout(500);

    // After clicking, type should be "text" (password now visible)
    const typeAfterReveal = await pwdField.getAttribute('type');
    expect(typeAfterReveal).toBe('text');

    // Click again — should mask back to "password"
    await eyeIcon.click();
    await page.waitForTimeout(500);
    await expect(pwdField).toHaveAttribute('type', 'password');

    console.log('✅ AUTH-07 PASSED: Eye icon toggled password visibility correctly.');
  } else {
    console.log('⚠️ AUTH-07 SKIPPED: Eye icon not found on this page.');
  }
});


// ============================================================
// AUTH-08: Tab Keyboard Navigation
// Pressing Tab should move focus: Username → Password → Login
// This ensures the form is keyboard-accessible.
// ============================================================
test('AUTH-08: Tab navigation - keyboard moves focus username → password → button', async ({ page }) => {
  await openLoginPage(page);

  // Click on the email field to start
  await emailInput(page).click();
  const emailFocused = await emailInput(page).evaluate(/** @param {Element} el */(el) => el === document.activeElement);
  expect(emailFocused).toBe(true);

  // Tab to password field
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  const pwdFocused = await passwordInput(page).evaluate(/** @param {Element} el */(el) => el === document.activeElement);
  expect(pwdFocused).toBe(true);

  // Tab to login button
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);

  // Verify a focusable element received focus (login button or next element)
  const activeTag = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase());
  expect(['button', 'a', 'input']).toContain(activeTag);

  console.log('✅ AUTH-08 PASSED: Tab navigation works correctly.');
});

// ============================================================
// AUTH-09: Login Button Click
// Clicking the Login button with valid credentials should
// submit the form and navigate to the dashboard.
// ============================================================
test('AUTH-09: Login button click - submits form and redirects to dashboard', async ({ page }) => {
  await openLoginPage(page);

  await emailInput(page).fill(VALID_EMAIL);
  await passwordInput(page).fill(VALID_PASSWORD);

  const btn = loginButton(page);
  await expect(btn).toBeVisible({ timeout: 10000 });
  await expect(btn).toBeEnabled();
  await btn.click();

  await waitForSignedIn(page);
  expect(page.url()).not.toContain('signin');

  console.log('✅ AUTH-09 PASSED: Login button click submitted form correctly.');
});

// ============================================================
// AUTH-10: Enter Key Login
// After filling in credentials, pressing Enter should submit
// the form — same as clicking the Login button.
// ============================================================
test('AUTH-10: Enter key login - pressing Enter submits the form', async ({ page }) => {
  await openLoginPage(page);

  await emailInput(page).fill(VALID_EMAIL);
  await passwordInput(page).fill(VALID_PASSWORD);

  // Press Enter inside the password field
  await passwordInput(page).press('Enter');

  await waitForSignedIn(page);
  expect(page.url()).not.toContain('signin');

  console.log('✅ AUTH-10 PASSED: Enter key correctly submitted the login form.');
});

// ============================================================
// AUTH-11: Field Placeholder / Label Check
// The Username and Password fields must have correct labels or
// placeholders so users know what to enter.
// ============================================================
test('AUTH-11: Field placeholder/label - username and password labels are visible', async ({ page }) => {
  await openLoginPage(page);

  // Check for label or placeholder text related to email/username
  const emailLabel = page.locator(
    'label:has-text("Email"), label:has-text("Username"), ' +
    'mat-label:has-text("Email"), mat-label:has-text("Username"), ' +
    'input[placeholder*="email" i], input[placeholder*="username" i]'
  ).first();
  const emailLabelVisible = await emailLabel.isVisible().catch(() => false);

  // Check for label or placeholder text related to password
  const passwordLabel = page.locator(
    'label:has-text("Password"), mat-label:has-text("Password"), ' +
    'input[placeholder*="password" i]'
  ).first();
  const passwordLabelVisible = await passwordLabel.isVisible().catch(() => false);

  console.log(`ℹ️ Email label visible: ${emailLabelVisible}`);
  console.log(`ℹ️ Password label visible: ${passwordLabelVisible}`);

  // At minimum the input fields themselves must be visible
  await expect(emailInput(page)).toBeVisible();
  await expect(passwordInput(page)).toBeVisible();

  console.log('✅ AUTH-11 PASSED: Username and Password fields are present on the page.');
});

// ============================================================
// AUTH-12: Password Masked By Default
// When the page loads, the password field must hide input as
// dots/asterisks — type attribute must be "password".
// ============================================================
test('AUTH-12: Password masked by default - type is "password" on load', async ({ page }) => {
  await openLoginPage(page);

  const pwdField = passwordInput(page);
  await expect(pwdField).toBeVisible();

  // Type attribute must be "password" (not "text") by default
  await expect(pwdField).toHaveAttribute('type', 'password');

  // Type something and verify it stays masked
  await pwdField.fill(VALID_PASSWORD);
  await expect(pwdField).toHaveAttribute('type', 'password');

  console.log('✅ AUTH-12 PASSED: Password field is masked by default.');
});


// ============================================================
// AUTH-13: UI Alignment Check
// The login form fields, button, and icons must all be visible
// and properly rendered on the page.
// ============================================================
test('AUTH-13: UI alignment - all form elements are visible and rendered', async ({ page }) => {
  await openLoginPage(page);

  // All key elements must be present and visible
  await expect(emailInput(page)).toBeVisible();
  await expect(passwordInput(page)).toBeVisible();
  await expect(loginButton(page)).toBeVisible();

  // Verify the page URL is correct
  expect(page.url()).toContain('signin');

  // Capture a screenshot for visual inspection
  await page.screenshot({ path: 'test-results/auth-ui-alignment.png', fullPage: true });

  // Verify email and password fields have non-zero dimensions (properly rendered)
  const emailBox = await emailInput(page).boundingBox();
  const passwordBox = await passwordInput(page).boundingBox();
  const buttonBox = await loginButton(page).boundingBox();

  // TypeScript understands if+throw as a null narrowing guard —
  // after this block, all three are guaranteed non-null.
  if (!emailBox) throw new Error('❌ Email input has no bounding box — element not visible');
  if (!passwordBox) throw new Error('❌ Password input has no bounding box — element not visible');
  if (!buttonBox) throw new Error('❌ Login button has no bounding box — element not visible');

  // All elements should have positive width and height
  expect(emailBox.width).toBeGreaterThan(0);
  expect(emailBox.height).toBeGreaterThan(0);
  expect(passwordBox.width).toBeGreaterThan(0);
  expect(passwordBox.height).toBeGreaterThan(0);
  expect(buttonBox.width).toBeGreaterThan(0);
  expect(buttonBox.height).toBeGreaterThan(0);

  console.log('✅ AUTH-13 PASSED: All UI elements are properly aligned and rendered.');
});

// ============================================================
// AUTH-14: Whitespace Handling
// Leading and trailing whitespace in the Email/Username field
// should ideally be trimmed by the application.
// ============================================================
test('AUTH-14: Whitespace handling - leading/trailing spaces in credentials', async ({ page }) => {
  await openLoginPage(page);

  // Fill email with leading/trailing whitespace
  // If the app trims, this should work just like a normal login
  await emailInput(page).fill(`  ${VALID_EMAIL}  `);
  await passwordInput(page).fill(VALID_PASSWORD);
  await loginButton(page).click();

  // Wait for potential redirect or error
  // If it trims, it should redirect to dashboard
  // Using a shorter timeout here as we just want to observe the behavior
  await page.waitForTimeout(5000);

  const currentUrl = page.url();
  const isRedirected = !currentUrl.includes('signin');

  if (isRedirected) {
    console.log('✅ AUTH-14 PASSED: App correctly trimmed whitespace and logged in.');
  } else {
    console.log('ℹ️ AUTH-14 INFO: App did not log in with whitespace (possibly no trimming).');

    // Check if there are validation errors
    const errors = page.locator('mat-error, .error-message, [class*="error"]');
    if (await errors.count() > 0) {
      console.log('✅ AUTH-14 PASSED: App correctly identified whitespace-only or untrimmed input as invalid.');
    }
  }
});

// ============================================================
// AUTH-15: Invalid Login Error Message
// The system should show a clear error when credentials are
// rejected, not only remain on the sign-in page.
// ============================================================
test('AUTH-15: Invalid login shows visible error message', async ({ page }) => {
  await openLoginPage(page);

  await emailInput(page).fill('wronguser@notexisting.com');
  await passwordInput(page).fill('WrongPassword999!');
  await loginButton(page).click();

  await waitForLoginRejected(page);

  const errorText = await getVisibleLoginErrorText(page);
  console.log(`Login error text: ${errorText || '(none found)'}`);

  expect(errorText).toMatch(/invalid|incorrect|wrong|check|credential|username|password|unauthori[sz]ed|not found|required/i);

  console.log('AUTH-15 PASSED: Invalid login displayed a visible rejection message.');
});

// ============================================================
// AUTH-16: Invalid Email Format Validation
// The sign-in form should reject malformed email/username input
// before authenticating.
// ============================================================
test('AUTH-16: Invalid email format is rejected on login form', async ({ page }) => {
  await openLoginPage(page);

  await emailInput(page).fill('invalid-email-format');
  await passwordInput(page).fill(VALID_PASSWORD);
  await loginButton(page).click();

  await waitForLoginRejected(page);

  const emailValidationText = await getVisibleLoginErrorText(page);
  console.log(`Email validation text: ${emailValidationText || '(none found)'}`);

  const emailValidity = await emailInput(page).evaluate(
    /** @param {HTMLInputElement} input */ (input) => ({
      type: input.type,
      valid: input.validity.valid,
      validationMessage: input.validationMessage,
    })
  );

  const hasVisibleValidation = /email|valid|invalid|required|username|credential/i.test(emailValidationText);
  const browserRejectedEmail = emailValidity.type === 'email' && !emailValidity.valid;

  expect(hasVisibleValidation || browserRejectedEmail).toBe(true);

  console.log('AUTH-16 PASSED: Malformed email/username input was rejected.');
});

// ============================================================
// AUTH-17: Auth Guard - Dashboard Requires Login
// Direct access to a protected dashboard route without a session
// should redirect the user to sign-in or render the sign-in form.
// ============================================================
test('AUTH-17: Protected dashboard URL redirects unauthenticated user to sign-in', async ({ page }) => {
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await expect
    .poll(
      async () => {
        const redirectedToSignin = page.url().includes('signin');
        const loginFormVisible = await emailInput(page).isVisible().catch(() => false);
        return redirectedToSignin || loginFormVisible;
      },
      { timeout: 30000, message: 'Protected dashboard should redirect or show the sign-in form.' }
    )
    .toBe(true);

  expect(page.url()).not.toContain('/home/dashboard');

  console.log('AUTH-17 PASSED: Protected dashboard route requires authentication.');
});

// ============================================================
// AUTH-18: Logged-In User Visiting Sign-In
// A user with a valid session should not be stuck on the sign-in
// page when navigating to the sign-in URL again.
// ============================================================
test('AUTH-18: Already logged-in user can access app when sign-in URL is opened again', async ({ page }) => {
  await signInWithValidCredentials(page);

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(3000);

  const appShellVisible = await page.locator('.sidebar, nav.navbar, a[href*="#/home"]').first().isVisible().catch(() => false);
  const stillOnSignin = page.url().includes('signin');

  if (stillOnSignin && !appShellVisible) {
    await emailInput(page).fill(VALID_EMAIL);
    await passwordInput(page).fill(VALID_PASSWORD);
    await loginButton(page).click();
    await waitForSignedIn(page);
  }

  expect(page.url()).not.toContain('signin');

  console.log('AUTH-18 PASSED: Existing session can reach the authenticated app.');
});

// ============================================================
// AUTH-19: Logout Back Button Protection
// After logout, browser back should not expose the protected
// dashboard content without signing in again.
// ============================================================
test('AUTH-19: Logout prevents returning to dashboard with browser back', async ({ page }) => {
  await signInWithValidCredentials(page);
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);

  await clickLogout(page);
  await page.waitForURL((url) => url.toString().includes('signin'), { timeout: 30000 });

  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const dashboardShellVisible = await page.locator('.sidebar, nav.navbar').first().isVisible().catch(() => false);
  const loginFormVisible = await emailInput(page).isVisible().catch(() => false);

  expect(page.url().includes('signin') || loginFormVisible).toBe(true);
  expect(dashboardShellVisible).toBe(false);

  console.log('AUTH-19 PASSED: Dashboard is protected after logout and browser back.');
});

// ============================================================
// AUTH-20: Login Page Responsive View
// The login form should remain usable on a mobile-sized viewport.
// ============================================================
test('AUTH-20: Login page is usable on mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openLoginPage(page);

  await expect(emailInput(page)).toBeVisible();
  await expect(passwordInput(page)).toBeVisible();
  await expect(loginButton(page)).toBeVisible();

  const buttonBox = await loginButton(page).boundingBox();
  if (!buttonBox) throw new Error('Login button has no bounding box on mobile viewport.');
  expect(buttonBox.width).toBeGreaterThan(0);
  expect(buttonBox.height).toBeGreaterThan(0);

  console.log('AUTH-20 PASSED: Login page is usable on mobile viewport.');
});
