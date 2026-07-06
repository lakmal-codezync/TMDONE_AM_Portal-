# TMDone Admin Console - Playwright Test Suite

![TMDone Admin Console Screenshot](docs/screenshots/login.svg)

A full Playwright automation suite for the TMDone Admin Console.

## Test Case Document

- Official testcase reference: [TMDone Admin Testcases](https://docs.google.com/document/d/1Ygw7hUGV8gru99CCkvyM2YsT4JEum7l8b5V8GpcdkAQ/edit?tab=t.0#heading=h.v8182vllkw9o)

## Project Overview

This repository contains end-to-end tests for the TMDone Admin portal, including:

- Authentication
- Dashboard
- Vendor performance
- Reports
- Analysis
- Store management
- Offers
- Order management
- Portfolio analysis
- Accounts management
- Campaigns
- Driver KPI slabs
- Reels
- TM Done Club
- User notifications

## Page Screenshots

| Page | Screenshot |
| --- | --- |
| Login | ![Login page](docs/screenshots/login.svg) |
| Dashboard | ![Dashboard page](docs/screenshots/dashboard.svg) |
| Vendor Performance | ![Vendor Performance page](docs/screenshots/vendor-performance.svg) |
| Reports | ![Reports page](docs/screenshots/reports.svg) |
| Analysis | ![Analysis page](docs/screenshots/analysis.svg) |
| Stores | ![Stores page](docs/screenshots/stores.svg) |
| Store Ratings | ![Store Ratings page](docs/screenshots/store-ratings.svg) |
| Offers | ![Offers page](docs/screenshots/offers.svg) |
| Order Management | ![Order Management page](docs/screenshots/order-management.svg) |
| Portfolio Analysis | ![Portfolio Analysis page](docs/screenshots/portfolio-analysis.svg) |
| Accounts Management | ![Accounts Management page](docs/screenshots/accounts-management.svg) |
| Campaigns | ![Campaigns page](docs/screenshots/campaigns.svg) |
| Smart Boost Campaign | ![Smart Boost Campaign page](docs/screenshots/smart-boost-campaign.svg) |
| Driver KPI Slabs | ![Driver KPI Slabs page](docs/screenshots/driver-kpi-slabs.svg) |
| Reels | ![Reels page](docs/screenshots/reels.svg) |
| TM Done Club Analytics | ![TM Done Club Analytics page](docs/screenshots/tm-done-club-analytics.svg) |
| TM Done Club Plans | ![TM Done Club Plans page](docs/screenshots/tm-done-club-plans.svg) |
| TM Done Club Subscriptions | ![TM Done Club Subscriptions page](docs/screenshots/tm-done-club-subscriptions.svg) |
| TM Done Club Cancellation Reasons | ![TM Done Club Cancellation Reasons page](docs/screenshots/tm-done-club-cancellation-reasons.svg) |
| User Notifications | ![User Notifications page](docs/screenshots/user-notifications.svg) |

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
- `npm run test:reports` - run report tests
- `npm run test:all` - run all tests
- `npm run report` - show the HTML report

## Playwright Configuration

- Base URL: `https://consoledemo.uat.v3.dr.tmd1.org`
- Browser: Chromium
- Headless by default
- Screenshots and videos are captured on failure
- Trace collection enabled on first retry

## Folder Structure

- `tests/` - Playwright test suites
- `docs/screenshots/` - system screenshots used in documentation
- `playwright.config.js` - Playwright settings
- `package.json` - npm scripts and dependencies

## Notes

Use `HEADED=true npx playwright test` to run tests with the browser visible.

# TMDONE_AM_Portal-
