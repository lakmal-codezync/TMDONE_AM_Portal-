# Admin Portal Playwright Automation

> A privacy-safe end-to-end automation suite for a feature-rich admin portal, built with Playwright, JavaScript, and GitHub Actions.

This repository demonstrates a complete QA automation system for an admin-style web application. It covers authentication, dashboards, reporting, data tables, campaigns, media flows, subscription modules, notification flows, CI execution, and HTML report artifacts.

The README uses sanitized mock screenshots only. No company names, client names, real users, real order data, credentials, private URLs, or business-sensitive values are shown.

## System Preview

<p align="center">
  <img src="docs/screenshots/sanitized-dashboard.svg" alt="Sanitized admin portal dashboard mock screenshot" width="900">
</p>

The suite models the portal as a collection of operational workspaces. Each feature area has focused Playwright specs, shared helpers, stable navigation utilities, and safe handling for dialogs, filters, empty states, and optional backend data.

## Test Case Document

Full testcase documentation is maintained here:

[Open testcase document](https://docs.google.com/document/d/1Ygw7hUGV8gru99CCkvyM2YsT4JEum7l8b5V8GpcdkAQ/edit?tab=t.0#heading=h.v8182vllkw9o)

Use the document as the manual coverage map, and this repo as the executable automation layer.

## Automation Flow

<p align="center">
  <img src="docs/screenshots/automation-flow.svg" alt="Sanitized Playwright automation flow diagram" width="900">
</p>

1. GitHub Actions starts on push or pull request.
2. Node dependencies and Playwright browsers are installed.
3. The test suite signs in using repository secrets.
4. Feature specs run one worker at a time for stability.
5. Reports, screenshots, videos, and traces are uploaded as CI artifacts.

## What This Suite Covers

```text
tests/
  01-Auth/                    Sign-in, validation, and session checks
  02-Dashboard/               Dashboard cards, widgets, and navigation
  03-VendorPerformance/       Performance tables, filters, and paging
  04-Reports/                 Report filters, tabs, and export behavior
  05-Analysis/                Analytics pages and chart stability
  06-Stores/                  Store search, filters, and row actions
  07-Stores Ratings/          Rating filters, exports, and tables
  08-Offers/                  Offer create, update, delete, and search
  09-Order Management/        Order list, status filters, and view flows
  10-Portfolio Analysis/      Portfolio reporting and table behavior
  11-Accounts Management/     Account search, actions, and assignment flows
  12-Campaigns/               Campaigns, promo codes, delivery, pinning
  13-Smart Boost Campaign/    Boost campaign create, actions, top-up, terminate
  14-Driver KPI Slabs/        Slab schemes, CRUD paths, and search
  15-Reels/                   Media management, dialogs, filters, row actions
  16-TM Done Club/            Analytics, plans, subscriptions, cancellation reasons
  17-User Notifications/      Notification workflows and table checks
  helpers/                    Shared login, routing, and UI helpers
```

## CI/CD Report Preview

<p align="center">
  <img src="docs/screenshots/ci-report.svg" alt="Sanitized GitHub Actions and Playwright report mock screenshot" width="900">
</p>

The CI pipeline runs the same Playwright suite used locally and keeps the HTML report available as a downloadable artifact.

## Tech Stack

- Playwright Test
- JavaScript ES modules
- Node.js
- GitHub Actions

## Quick Start

Install dependencies:

```bash
npm ci
npx playwright install
```

Run everything:

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
npm run test:reels
npm run test:club
npm run test:user-notifications
```

Debug locally:

```bash
npm run test:headed
npm run test:debug
```

## Environment Setup

The current helper reads these environment variables:

```text
TMDONE_BASE_URL
TMDONE_EMAIL
TMDONE_PASSWORD
```

For GitHub Actions, configure them in repository settings:

- `TMDONE_EMAIL`: repository secret
- `TMDONE_PASSWORD`: repository secret
- `TMDONE_BASE_URL`: repository variable, optional

Never commit credentials, private URLs, personal access tokens, cookies, real account data, or environment-specific secrets.

## GitHub Actions

Workflow file:

```text
.github/workflows/playwright.yml
```

The workflow runs on pushes and pull requests to `main` or `master`:

1. Checkout repository.
2. Install dependencies with `npm ci`.
3. Install Playwright browsers.
4. Run `npx playwright test`.
5. Upload the Playwright HTML report.

## Privacy Rules For Screenshots

Screenshots in this repository must be sanitized before commit.

Allowed:

- Mock data
- Redacted UI captures
- Recreated demo screens
- Generic labels such as "User A", "Store 01", "Order 1001"

Not allowed:

- Company names
- Client names
- Customer names, phone numbers, emails, addresses, order IDs, account IDs
- Real revenue, budget, campaign, subscription, or performance values
- Internal URLs, tokens, cookies, headers, passwords, API keys

Generated Playwright screenshots should normally remain in `test-results/`, `playwright-report/`, or CI artifacts. Only reviewed and sanitized documentation images should be committed.

## Reports And Artifacts

Local Playwright outputs:

```text
test-results/
playwright-report/
blob-report/
```

These folders are ignored by Git. CI artifacts can be downloaded from the GitHub Actions run page.

## Engineering Notes

- Specs are grouped by feature area for fast triage.
- Shared helpers centralize login, route navigation, dialogs, and safe actions.
- Tests use stable selectors, explicit waits, and empty-state handling where the UAT environment can vary.
- Destructive paths are guarded where possible so shared test data is protected.

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
