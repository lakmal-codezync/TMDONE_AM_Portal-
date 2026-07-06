# Admin Portal Playwright Automation

End-to-end Playwright automation suite for a modern admin portal. The project is organized as a feature-by-feature regression pack that checks sign-in, dashboards, reporting, operational tables, campaign tools, media workflows, and subscription-style modules.

This repository is prepared for engineering review, CI execution, and safe public sharing. Real client data, company names, user records, production URLs, credentials, and screenshots with identifiable business information must not be committed.

## What This Suite Does

The suite behaves like a careful QA operator moving through the portal:

- Signs in and verifies authenticated navigation.
- Checks dashboards, cards, filters, tables, pagination, dialogs, and exports.
- Exercises safe CRUD-style flows without intentionally damaging real data.
- Handles UAT variability such as empty states, permissions, redirects, and optional backend data.
- Captures Playwright reports, screenshots, videos, and traces only as local or CI artifacts.

## Coverage Map

```text
tests/
  01-Auth/                    Sign-in and authentication checks
  02-Dashboard/               Dashboard widgets and navigation
  03-VendorPerformance/       Performance tables and filters
  04-Reports/                 Operational reports and exports
  05-Analysis/                Analytics dashboards and charts
  06-Stores/                  Store search, filters, and actions
  07-Stores Ratings/          Ratings filters and table behavior
  08-Offers/                  Offer create, edit, delete, search
  09-Order Management/        Order list and view-order flows
  10-Portfolio Analysis/      Portfolio reporting checks
  11-Accounts Management/     Account table and action coverage
  12-Campaigns/               Campaign, promo, delivery, pinning flows
  13-Smart Boost Campaign/    Boost campaign workflows
  14-Driver KPI Slabs/        Slab scheme configuration flows
  15-Reels/                   Media/reels management flows
  16-TM Done Club/            Analytics, plans, subscriptions, reasons
  17-User Notifications/      Notification workflow coverage
  helpers/                    Shared login and navigation utilities
```

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

Run the full suite:

```bash
npm test
```

Open the latest HTML report:

```bash
npm run report
```

## Useful Test Commands

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

## Environment Variables

The shared login helper reads these values:

```text
TMDONE_BASE_URL
TMDONE_EMAIL
TMDONE_PASSWORD
```

For GitHub Actions, set them as repository secrets or variables:

- `TMDONE_EMAIL`: repository secret
- `TMDONE_PASSWORD`: repository secret
- `TMDONE_BASE_URL`: repository variable, optional

Do not commit real credentials, personal access tokens, private URLs, or account-specific values.

## CI/CD

The GitHub Actions workflow lives at:

```text
.github/workflows/playwright.yml
```

It runs on pushes and pull requests to `main` or `master`:

1. Checks out the repo.
2. Installs Node dependencies with `npm ci`.
3. Installs Playwright browsers.
4. Runs `npx playwright test`.
5. Uploads the Playwright HTML report as an artifact.

## Privacy And Screenshots

Screenshots are not embedded in this README by design.

If screenshots are ever added for documentation, they must be sanitized first:

- No company names.
- No client names.
- No customer names, phone numbers, emails, addresses, order IDs, or account IDs.
- No real revenue, budget, campaign, or subscription values.
- No internal URLs, tokens, cookies, headers, or credentials.
- Use mock data, blurred/redacted images, or recreated demo screens only.

Generated screenshots should stay local or in CI artifacts unless they have been reviewed and redacted.

## Reports And Artifacts

Local Playwright outputs are generated under:

```text
test-results/
playwright-report/
blob-report/
```

These folders are ignored by Git. CI artifacts are available from the GitHub Actions run summary.

## Design Notes

- Tests are grouped by portal module to keep failures easy to triage.
- Shared helpers centralize login, routing, dialog handling, and safe UI actions.
- Specs prefer resilient selectors and explicit empty-state handling for UAT stability.
- Destructive flows are guarded where possible so the suite can be run against shared test environments.

## Maintainer Notes

Before pushing:

```bash
git status --short
npm run test:boost
npm run test:reels
npx playwright test SubscriptionPlans.spec.js
```

For full release confidence, run:

```bash
npm test
```
