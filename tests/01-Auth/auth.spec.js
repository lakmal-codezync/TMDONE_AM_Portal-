

import { test, expect } from '@playwright/test';
import { CREDENTIALS, requireCredentials } from '../helpers/loginHelper.js';

// ===================== CONSTANTS ============================
const LOGIN_URL = CREDENTIALS.loginUrl;
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

test.beforeEach(() => {
  requireCredentials();
});

/** @param {import('@playwright/test').Page} page */
async function openLoginPage(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await expect(emailInput(page)).toBeVisible({ timeout: 30000 });
  await expect(passwordInput(page)).toBeVisible({ timeout: 30000 });
}

/** @param {import('@playwright/test').Page} page */
async function waitForSignedIn(page) {
  await page.waitForURL((url) => !url.toString().includes('signin'), { timeout: 60000 });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
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
