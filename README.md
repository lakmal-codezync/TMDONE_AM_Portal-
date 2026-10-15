# TMDone Admin Console - Playwright Test Suite

![TMDone Admin Console Login](docs/screenshots/login.png)

End-to-end Playwright automation suite for the TMDone Admin Console.

## Test Case Document

- Official testcase reference: [TMDone Admin Testcases](https://docs.google.com/document/d/1Ygw7hUGV8gru99CCkvyM2YsT4JEum7l8b5V8GpcdkAQ/edit?tab=t.0#heading=h.v8182vllkw9o)

## Project Overview

This repository validates the main admin portal workflows against the UAT console at `https://console.demo.dr.tmd1.org`.

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
- Spotlights (Tile and Carousel)

##  Page Screenshots

The screenshots below are captured from the real TMDone Admin Console as 1440x900 viewport previews using `scripts/capture-readme-screenshots.mjs`.

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
- `npm run test:spotlights` - run spotlights tests
- `npm run test:all` - run all tests
- `npm run report` - show the HTML report

## Screenshot Capture

Run this command to refresh the README screenshots from the live portal:

```bash
node scripts/capture-readme-screenshots.mjs
```

Generated screenshots are saved in `docs/screenshots/` as 1440x900 PNG files.

## Playwright Configuration

- Base URL: `https://console.demo.dr.tmd1.org`
- Browser: Chromium
- Headless by default
- Screenshots and videos are captured on failure
- Trace collection enabled on first retry (off for the Auth suite, which types the real password)
- Signs in once per run (global setup) and reuses the session in every test
- Reporters: HTML (`playwright-report/`), JSON (`test-results/results.json`), and list (console)

## Continuous Integration

### CI (`.github/workflows/ci.yml`)

Runs on every push and pull request, without touching the live site:

- every script parses (`node --check`)
- no `_debug*` / `_audit*` files and no `test.only` are committed (they would run nightly)
- every spec loads (`npx playwright test --list --forbid-only`)

On pushes to `main` (or run by hand) it also runs a short **smoke test** on the live demo: the Auth suite (without the wrong-password test) and the Change Password / header and sidebar checks. If the demo site is down the smoke test is skipped with a warning.

### Nightly E2E (`.github/workflows/daily-playwright.yml`)

Runs the whole suite every night (scheduled 00:17 Sri Lanka time; GitHub often starts scheduled runs a few hours late) and can be started from the Actions tab with **Run workflow**, optionally for one folder (e.g. `08-Offers`).

1. **Preflight** - checks the console and its API respond. If not, no tests run and the email says the site is down.
2. **Tests** - the suite in 3 shards that run one after another (all tests share one live account), each with its own 6-hour job limit. A shard stops early after 25 failed tests, and skips itself if the site went down meanwhile.
3. **Report** - merges the shard reports into one HTML report (`playwright-report` artifact, 7 days) and always sends the email: one table per spec file with each test's ID, description, status and failure reason, or a "site down" / "no results" notice.

Settings (repository **Settings -> Secrets and variables -> Actions**):

| Name | Kind | Purpose |
|---|---|---|
| `TMDONE_EMAIL`, `TMDONE_PASSWORD` | secret | the shared test account |
| `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` | secret | Gmail sender and its [App Password](https://myaccount.google.com/apppasswords) |
| `TMDONE_BASE_URL` | variable (optional) | console URL, default `https://console.demo.dr.tmd1.org`; only the origin is used |
| `TMDONE_API_URL` | variable (optional) | API URL for the preflight check, default `https://amportal.demo.dr.tmd1.org` |
| `REPORT_EMAIL_TO` | variable (optional) | email recipients (comma separated), default `lakmal@codezync.com` |

The tests sign in once per run in `tests/helpers/global-setup.js`, outside any test, so the password and access token never appear in a test's trace. Reports can contain screenshots of the console, so keep this repository private.

## Folder Structure

- `tests/` - Playwright test suites
- `tests/helpers/` - shared login, navigation, report, and utility helpers
- `tests/fixtures/` - test upload files and sample assets
- `docs/screenshots/` - real screenshots used in this README
- `scripts/capture-readme-screenshots.mjs` - README screenshot capture script
- `.github/workflows/ci.yml` - checks on every push / pull request, smoke test on `main`
- `.github/workflows/daily-playwright.yml` - nightly full run, email report
- `.github/scripts/build-email-summary.js` - builds the HTML email summary from test results
- `.github/playwright-merge.config.js` - merges the nightly shard reports
- `tests/helpers/global-setup.js` - signs in once before each run
- `playwright.config.js` - Playwright settings
- `package.json` - npm scripts and dependencies

## Notes

Use `HEADED=true npx playwright test` to run tests with the browser visible.
