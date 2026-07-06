# TMDone Admin Console - Playwright Test Suite

![TMDone Admin Console Login](docs/screenshots/login.png)

End-to-end Playwright automation suite for the TMDone Admin Console.

## Test Case Document

- Official testcase reference: [TMDone Admin Testcases](https://docs.google.com/document/d/1Ygw7hUGV8gru99CCkvyM2YsT4JEum7l8b5V8GpcdkAQ/edit?tab=t.0#heading=h.v8182vllkw9o)

## Project Overview

This repository validates the main admin portal workflows against the UAT console at `https://consoledemo.uat.v3.dr.tmd1.org`.

Covered areas:

- Authentication and dashboard
- Vendor performance, reports, and analysis
- Store management and store ratings
- Offers, campaigns, and smart boost campaigns
- Order management and portfolio analysis
- Accounts management
- Driver KPI slabs
- Reels
- TM Done Club analytics, plans, subscriptions, and cancellation reasons
- User notifications

## Real Page Screenshots

The screenshots below are captured from the real TMDone Admin Console using `scripts/capture-readme-screenshots.mjs`.

| Page | Screenshot |
| --- | --- |
| Login | ![Login page](docs/screenshots/login.png) |
| Dashboard | ![Dashboard page](docs/screenshots/dashboard.png) |
| Vendor Performance | ![Vendor Performance page](docs/screenshots/vendor-performance.png) |
| Reports | ![Reports page](docs/screenshots/reports.png) |
| Analysis | ![Analysis page](docs/screenshots/analysis.png) |
| Stores | ![Stores page](docs/screenshots/stores.png) |
| Store Ratings | ![Store Ratings page](docs/screenshots/store-ratings.png) |
| Offers | ![Offers page](docs/screenshots/offers.png) |
| Order Management | ![Order Management page](docs/screenshots/order-management.png) |
| Portfolio Analysis | ![Portfolio Analysis page](docs/screenshots/portfolio-analysis.png) |
| Accounts Management | ![Accounts Management page](docs/screenshots/accounts-management.png) |
| Campaigns | ![Campaigns page](docs/screenshots/campaigns.png) |
| Smart Boost Campaign | ![Smart Boost Campaign page](docs/screenshots/smart-boost-campaign.png) |
| Driver KPI Slabs | ![Driver KPI Slabs page](docs/screenshots/driver-kpi-slabs.png) |
| Reels | ![Reels page](docs/screenshots/reels.png) |
| TM Done Club Analytics | ![TM Done Club Analytics page](docs/screenshots/tm-done-club-analytics.png) |
| TM Done Club Plans | ![TM Done Club Plans page](docs/screenshots/tm-done-club-plans.png) |
| TM Done Club Subscriptions | ![TM Done Club Subscriptions page](docs/screenshots/tm-done-club-subscriptions.png) |
| TM Done Club Cancellation Reasons | ![TM Done Club Cancellation Reasons page](docs/screenshots/tm-done-club-cancellation-reasons.png) |
| User Notifications | ![User Notifications page](docs/screenshots/user-notifications.png) |

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run all tests:
   ```bash
   npm test
   ```

3. Run a specific test suite:
   ```bash
   npm run test:campaigns
   ```

4. Open the generated report:
   ```bash
   npm run report
   ```

## Useful Scripts

- `npm run test:auth` - run authentication tests
- `npm run test:dashboard` - run dashboard tests
- `npm run test:vendor` - run vendor performance tests
- `npm run test:reports` - run report tests
- `npm run test:analysis` - run analysis tests
- `npm run test:stores` - run store tests
- `npm run test:ratings` - run store ratings tests
- `npm run test:offers` - run offer tests
- `npm run test:orders` - run order management tests
- `npm run test:portfolio` - run portfolio analysis tests
- `npm run test:accounts` - run accounts management tests
- `npm run test:campaigns` - run campaign tests
- `npm run test:boost` - run smart boost campaign tests
- `npm run test:kpi` - run driver KPI slab tests
- `npm run test:reels` - run reels tests
- `npm run test:club` - run TM Done Club tests
- `npm run test:user-notifications` - run user notification tests
- `npm run test:all` - run all tests
- `npm run report` - show the HTML report

## Screenshot Capture

Run this command to refresh the README screenshots from the live portal:

```bash
node scripts/capture-readme-screenshots.mjs
```

Generated screenshots are saved in `docs/screenshots/` as PNG files.

## Playwright Configuration

- Base URL: `https://consoledemo.uat.v3.dr.tmd1.org`
- Browser: Chromium
- Headless by default
- Screenshots and videos are captured on failure
- Trace collection enabled on first retry

## Folder Structure

- `tests/` - Playwright test suites
- `tests/helpers/` - shared login, navigation, report, and utility helpers
- `tests/fixtures/` - test upload files and sample assets
- `docs/screenshots/` - real screenshots used in this README
- `scripts/capture-readme-screenshots.mjs` - README screenshot capture script
- `playwright.config.js` - Playwright settings
- `package.json` - npm scripts and dependencies

## Notes

Use `HEADED=true npx playwright test` to run tests with the browser visible.
