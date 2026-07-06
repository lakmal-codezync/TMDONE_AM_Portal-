import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'https://consoledemo.uat.v3.dr.tmd1.org';
const loginUrl = `${baseUrl}/#/authentication/signin`;
const screenshotDir = path.resolve('docs/screenshots');

const credentials = {
  email: 'nimsara@codezync.com',
  password: '123123',
};

const pages = [
  { name: 'Login', slug: 'login', route: '#/authentication/signin', public: true },
  { name: 'Dashboard', slug: 'dashboard', route: '#/home/dashboard', readyText: 'Accounts per Brand' },
  { name: 'Vendor Performance', slug: 'vendor-performance', route: '#/home/vendor-performance' },
  { name: 'Reports', slug: 'reports', route: '#/home/reports' },
  { name: 'Analysis', slug: 'analysis', route: '#/home/analysis' },
  { name: 'Stores', slug: 'stores', route: '#/home/stores' },
  { name: 'Store Ratings', slug: 'store-ratings', route: '#/home/stores-ratings' },
  { name: 'Offers', slug: 'offers', route: '#/home/offers/offer-queries' },
  { name: 'Order Management', slug: 'order-management', route: '#/home/order-management' },
  { name: 'Portfolio Analysis', slug: 'portfolio-analysis', route: '#/home/portfolio-analysis' },
  { name: 'Accounts Management', slug: 'accounts-management', route: '#/home/accounts-management' },
  { name: 'Campaigns', slug: 'campaigns', route: '#/home/campaigns' },
  { name: 'Smart Boost Campaign', slug: 'smart-boost-campaign', route: '#/home/smart-boost-campaign/list' },
  { name: 'Driver KPI Slabs', slug: 'driver-kpi-slabs', route: '#/home/fare-scheme/speed-of-delivery' },
  { name: 'Reels', slug: 'reels', route: '#/home/reels' },
  { name: 'TM Done Club Analytics', slug: 'tm-done-club-analytics', route: '#/home/tm-done-club/analytics' },
  { name: 'TM Done Club Plans', slug: 'tm-done-club-plans', route: '#/home/tm-done-club/plans' },
  { name: 'TM Done Club Subscriptions', slug: 'tm-done-club-subscriptions', route: '#/home/tm-done-club/subscriptions' },
  { name: 'TM Done Club Cancellation Reasons', slug: 'tm-done-club-cancellation-reasons', route: '#/home/tm-done-club/cancellation-reasons' },
  { name: 'User Notifications', slug: 'user-notifications', route: '#/home/user-notifications' },
];

async function waitForNoSpinner(page) {
  const spinnerSelectors = ['.ngx-spinner-overlay', 'app-page-loader', '.loading-overlay', '.loading-spinner'];
  for (const selector of spinnerSelectors) {
    await page.locator(selector).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }
}

async function dismissAlert(page) {
  const okButton = page
    .locator('.swal2-confirm, button:has-text("OK"), button:has-text("Ok"), button:has-text("Yes")')
    .filter({ visible: true })
    .first();
  if (await okButton.isVisible().catch(() => false)) {
    await okButton.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
}

async function login(page) {
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitForNoSpinner(page);

  const emailInput = page
    .locator('input[type="email"], input[formcontrolname*="email" i], input[placeholder*="email" i], input')
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: 20000 });
  await emailInput.fill(credentials.email);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(credentials.password);

  const loginButton = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")').first();
  await loginButton.click();
  await page.waitForURL((url) => !url.toString().includes('signin'), { timeout: 45000 }).catch(() => {});
  await waitForNoSpinner(page);
  await dismissAlert(page);
}

async function capturePage(page, item) {
  const url = `${baseUrl}/${item.route}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitForNoSpinner(page);
  await dismissAlert(page);
  if (item.readyText) {
    await page.getByText(item.readyText).first().waitFor({ state: 'visible', timeout: 45000 }).catch(() => {});
  }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(screenshotDir, `${item.slug}.png`),
    fullPage: true,
  });
  console.log(`Captured ${item.name}: docs/screenshots/${item.slug}.png`);
}

await fs.mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  await capturePage(page, pages[0]);
  await login(page);

  for (const item of pages.slice(1)) {
    await capturePage(page, item);
  }
} finally {
  await browser.close();
}
