# TMDone Admin Portal - Playwright Automation

> A complete end-to-end automation system for the TMDone Admin Portal.  
> The suite validates login, dashboards, reports, stores, campaigns, orders, media, subscriptions, notifications, and safe admin workflows using Playwright.

This repository is the automated QA layer for an admin-style web application. It follows real user journeys: sign in, navigate modules, filter data, open dialogs, validate tables, run safe create/update/delete paths, verify downloads, and publish Playwright reports in CI.

## Quick Links

- [System Overview](#system-overview)
- [Page Screenshots](#page-screenshots)
- [Automation Flow](#automation-flow)
- [Quick Start](#quick-start)
- [Test Case Document](#test-case-document)
- [Before Pushing](#before-pushing)

## System Overview

<p align="center">
  <img src="docs/screenshots/sanitized-dashboard.svg" alt="Sanitized TMDone admin portal preview" width="900">
</p>

The automation is organized by admin module. Each folder under `tests/` represents one feature area, while shared helpers handle login, routing, loading states, dialogs, row actions, table checks, filters, pagination, downloads, and safe cleanup behavior.

At a system level, the test suite behaves like a careful admin user. It signs in through the real authentication page, opens each business module, verifies the important controls, runs searches and filters, checks tables or empty states, opens action menus, tests safe create/update/delete paths, and leaves shared environments protected whenever a destructive action is possible.

The suite is intentionally modular. A failing report, campaign, store, or subscription test can be traced back to one feature folder, while common browser behavior stays in shared helper files. This keeps the automation readable and easier to extend when new portal pages are added.

```text
tests/
  01-Auth/
  02-Dashboard/
  03-VendorPerformance/
  04-Reports/
  05-Analysis/
  06-Stores/
  07-Stores Ratings/
  08-Offers/
  09-Order Management/
  10-Portfolio Analysis/
  11-Accounts Management/
  12-Campaigns/
  13-Smart Boost Campaign/
  14-Driver KPI Slabs/
  15-Reels/
  16-TM Done Club/
  17-User Notifications/
  helpers/
```

## Tech Stack

- Playwright Test
- JavaScript ES modules
- Node.js
- GitHub Actions
- HTML reports, screenshots, videos, and traces

## How The Suite Works

| Layer | Responsibility |
| --- | --- |
| `playwright.config.js` | Defines Chromium execution, retries, timeouts, report output, screenshots, videos, traces, and one-worker shared-environment stability. |
| `tests/helpers/loginHelper.js` | Centralizes credentials, login, direct route navigation, loading-state waits, modal handling, row action menus, and safe delete cancellation. |
| Feature spec folders | Hold page-specific journeys such as reports, stores, campaigns, orders, reels, subscriptions, and notifications. |
| `docs/screenshots/` | Stores privacy-safe visual documentation used by this README. |
| `.github/workflows/playwright.yml` | Runs the suite in CI and uploads the Playwright HTML report as an artifact. |

## Main Features Covered

| Area | What The Automation Checks |
| --- | --- |
| Authentication | Required-field validation, invalid credentials, successful login, keyboard behavior, password visibility, and session routing. |
| Dashboard | Widgets, statistic cards, navigation links, header controls, responsive behavior, and page-load stability. |
| Reports | Report tabs, date ranges, store filters, search, result tables, empty states, pagination, and export/download controls. |
| Stores | Search, dropdown filters, status controls, table rows, row actions, detail navigation, and safe operational actions. |
| Campaigns | Campaign creation, management screens, promo codes, offers, free delivery, store pinning, fixed delivery fees, edit/delete flows, and pagination. |
| Smart Boost | Campaign list, filters, create form, export, row actions, dashboard navigation, top-up dialog, and terminate dialog. |
| Driver KPI Slabs | KPI scheme pages, filters, slab create/edit/delete surfaces, view actions, and safe confirmation handling. |
| Reels | Media list, create form, validation, upload surfaces, view/edit/delete actions, search, filters, and pagination. |
| TM Done Club | Analytics, subscription plans, subscription reports, cancellation reasons, create/update/delete flows, filters, and empty-state handling. |
| Notifications | Notification list, create workflow, phone-number upload, detail view, downloads, filters, row actions, and pagination. |

## Page Screenshots

Screenshots must be privacy-safe before they are committed. Use the file names below for each page so the README renders as a complete visual walkthrough.

### 01. Authentication

<p align="center">
  <img src="docs/screenshots/login.svg" alt="Authentication page screenshot" width="900">
</p>

Validates the first security checkpoint of the portal: required fields, invalid login messages, successful sign-in, keyboard navigation, and password masking.

Command:

```bash
npm run test:auth
```

### 02. Dashboard

<p align="center">
  <img src="docs/screenshots/dashboard.svg" alt="Dashboard page screenshot" width="900">
</p>

Checks the landing page after login, including summary cards, widgets, quick navigation, filter controls, sidebar links, and stable rendering.

Command:

```bash
npm run test:dashboard
```

### 03. Vendor Performance

<p align="center">
  <img src="docs/screenshots/vendor-performance.svg" alt="Vendor Performance page screenshot" width="900">
</p>

Validates operational performance reporting with filters, data tables, export controls, row actions, pagination, and meaningful page content.

Command:

```bash
npm run test:vendor
```

### 04. Reports

<p align="center">
  <img src="docs/screenshots/reports.svg" alt="Reports page screenshot" width="900">
</p>

Covers Fulfillment, Sales, Orders Count, Cancellation Reasons, Busy Vendors, Menu Optimization, and Target Offer Usage reports.

Command:

```bash
npm run test:reports
```

### 05. Analysis

<p align="center">
  <img src="docs/screenshots/analysis.svg" alt="Analysis page screenshot" width="900">
</p>

Verifies analytics pages, date comparisons, store selection, chart containers, search behavior, downloads, and pagination.

Command:

```bash
npm run test:analysis
```

### 06. Stores

<p align="center">
  <img src="docs/screenshots/stores.svg" alt="Stores page screenshot" width="900">
</p>

Checks store-management workflows: search, status filters, zone/store dropdowns, export, create dialog, row actions, and store details.

Command:

```bash
npm run test:stores
```

### 07. Store Ratings

<p align="center">
  <img src="docs/screenshots/store-ratings.svg" alt="Store Ratings page screenshot" width="900">
</p>

Validates rating filters, store filters, date range controls, search, clear/reset behavior, export controls, pagination, and details actions.

Command:

```bash
npm run test:ratings
```

### 08. Offers

<p align="center">
  <img src="docs/screenshots/offers.svg" alt="Offers page screenshot" width="900">
</p>

Exercises target-audience/offer-query flows including create, validation, search, pagination, export, edit, and delete confirmation handling.

Command:

```bash
npm run test:offers
```

### 09. Order Management

<p align="center">
  <img src="docs/screenshots/order-management.svg" alt="Order Management page screenshot" width="900">
</p>

Checks order list workflows: status filters, secondary filters, date range search, order ID search, clear actions, export, pagination, and view-order paths.

Command:

```bash
npm run test:orders
```

### 10. Portfolio Analysis

<p align="center">
  <img src="docs/screenshots/portfolio-analysis.svg" alt="Portfolio Analysis page screenshot" width="900">
</p>

Validates portfolio reporting screens with filters, charts or tables, download controls, pagination, and first-row safe actions.

Command:

```bash
npm run test:portfolio
```

### 11. Accounts Management

<p align="center">
  <img src="docs/screenshots/accounts-management.svg" alt="Accounts Management page screenshot" width="900">
</p>

Checks account search, filters, tables, assignment/delegation flows, bulk upload surfaces, downloads, pagination, and row actions.

Command:

```bash
npm run test:accounts
```

### 12. Campaigns

<p align="center">
  <img src="docs/screenshots/campaigns.svg" alt="Campaigns page screenshot" width="900">
</p>

One of the broadest modules: campaign creation, management, edit/delete, promo codes, offers, free delivery, store pinning, and fixed delivery fee management.

Command:

```bash
npm run test:campaigns
```

### 13. Smart Boost Campaign

<p align="center">
  <img src="docs/screenshots/smart-boost-campaign.svg" alt="Smart Boost Campaign page screenshot" width="900">
</p>

Validates the smart boost list, filters, create form, export controls, row action menu, manage campaign, dashboard, top-up, and terminate actions.

Command:

```bash
npm run test:boost
```

### 14. Driver KPI Slabs

<p align="center">
  <img src="docs/screenshots/driver-kpi-slabs.svg" alt="Driver KPI Slabs page screenshot" width="900">
</p>

Checks KPI slab schemes such as speed of delivery, redispatch rate, fines, block count, and average attendance.

Command:

```bash
npm run test:kpi
```

### 15. Reels

<p align="center">
  <img src="docs/screenshots/reels.svg" alt="Reels page screenshot" width="900">
</p>

Validates media content management with create, validation, upload surfaces, row actions, view/edit/delete flows, search, filters, and pagination.

Command:

```bash
npm run test:reels
```

### 16. TM Done Club

#### Analytics

<p align="center">
  <img src="docs/screenshots/tm-done-club-analytics.svg" alt="TM Done Club Analytics page screenshot" width="900">
</p>

#### Subscription Plans

<p align="center">
  <img src="docs/screenshots/tm-done-club-plans.svg" alt="TM Done Club Subscription Plans page screenshot" width="900">
</p>

#### Subscription Reports

<p align="center">
  <img src="docs/screenshots/tm-done-club-subscriptions.svg" alt="TM Done Club Subscriptions Reports page screenshot" width="900">
</p>

#### Cancellation Reasons

<p align="center">
  <img src="docs/screenshots/tm-done-club-cancellation-reasons.svg" alt="TM Done Club Cancellation Reasons page screenshot" width="900">
</p>

TM Done Club tests cover analytics, subscription plans, subscription reports, cancellation reasons, tables, filters, CRUD surfaces, and safe skip behavior when backend data is unavailable.

Command:

```bash
npm run test:club
```

### 17. User Notifications

<p align="center">
  <img src="docs/screenshots/user-notifications.svg" alt="User Notifications page screenshot" width="900">
</p>

Checks notification-management workflows: filters, table shell, create flow, phone-number upload, detail view, download actions, row actions, and pagination.

Command:

```bash
npm run test:user-notifications
```

## Automation Flow

<p align="center">
  <img src="docs/screenshots/automation-flow.svg" alt="Playwright automation flow" width="900">
</p>

1. Developer pushes code or opens a pull request.
2. GitHub Actions installs Node dependencies and Playwright browsers.
3. Playwright signs in using repository secrets.
4. Specs run with one worker for shared-environment stability.
5. HTML reports, screenshots, videos, and traces are uploaded as artifacts.

## CI/CD Report

<p align="center">
  <img src="docs/screenshots/ci-report.svg" alt="CI report preview" width="900">
</p>

Workflow file:

```text
.github/workflows/playwright.yml
```

The workflow runs on pushes and pull requests to `main` or `master`.

## Quick Start

Install dependencies:

```bash
npm ci
npx playwright install
```

Run the full suite:

```bash
npm test
```

Open the latest HTML report:

```bash
npm run report
```

## Useful Commands

```bash
npm run test:auth
npm run test:dashboard
npm run test:reports
npm run test:campaigns
npm run test:boost
npm run test:kpi
npm run test:reels
npm run test:club
npm run test:user-notifications
```

Debug locally:

```bash
npm run test:headed
npm run test:debug
```

## Environment Variables

The login helper reads:

```text
TMDONE_BASE_URL
TMDONE_EMAIL
TMDONE_PASSWORD
```

For GitHub Actions, configure:

- `TMDONE_EMAIL`: repository secret
- `TMDONE_PASSWORD`: repository secret
- `TMDONE_BASE_URL`: repository variable, optional

Do not commit credentials, tokens, cookies, private URLs, or real account data.

## Screenshot Workflow

Real UI screenshots are useful, but they must be cleaned before commit.

Allowed:

- Real UI layout with sensitive values blurred or replaced
- Mock names such as `User A`, `Store 01`, `Campaign 01`
- Generic amounts such as `100.00`, `250.00`, `1,000.00`
- Redacted URLs and IDs
- Recreated demo screens

Not allowed:

- Real company names
- Customer names, emails, phone numbers, or addresses
- Real order IDs, account IDs, campaign IDs, or subscription IDs
- Real revenue, budgets, performance, or private business values
- Tokens, cookies, passwords, API keys, internal URLs, or credentials

Recommended process:

1. Capture the page locally.
2. Blur or replace all sensitive values.
3. Save the cleaned file under `docs/screenshots/` using the matching README filename.
4. Review the image manually before committing.

Screenshot helper:

```bash
node scripts/capture-readme-screenshots.mjs
```

## Reports And Artifacts

Local Playwright outputs:

```text
test-results/
playwright-report/
blob-report/
```

These folders are ignored by Git. CI artifacts are available from the GitHub Actions run page.

## Test Case Document

Full manual testcase documentation:

[Open testcase document](https://docs.google.com/document/d/1Ygw7hUGV8gru99CCkvyM2YsT4JEum7l8b5V8GpcdkAQ/edit?tab=t.0#heading=h.v8182vllkw9o)

Use the Google Doc as the manual testcase catalogue and this repository as the automated execution layer.

## Engineering Notes

- Specs are grouped by feature area for easier triage.
- Shared helpers centralize login, route navigation, dialogs, filters, and safe actions.
- Tests prefer stable selectors and explicit empty-state handling for UAT variability.
- Destructive paths are guarded or cancelled where possible to protect shared test environments.
- Sequential execution is intentional because the target environment is shared and stateful.

## Before Pushing

Recommended smoke checks:

```bash
git status --short
npm run test:boost
npm run test:reels
npx playwright test SubscriptionPlans.spec.js
```

For full confidence:

```bash
npm test
```
