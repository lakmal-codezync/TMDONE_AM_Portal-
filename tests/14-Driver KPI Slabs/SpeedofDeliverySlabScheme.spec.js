// @ts-check
// ============================================================
// TMDone Admin Console - Driver KPI Slabs
// Speed of Delivery slab scheme checks
// ============================================================

import { test } from '@playwright/test';
import { DriverKpiSlabSchemePage } from './driver-kpi-slab-helper.js';

const SCHEME_NAME = 'Speed of Delivery';
const RUN_STAMP = Date.now();
const CREATE_WEIGHT = 1000 + (RUN_STAMP % 8000);
const EDIT_WEIGHT = CREATE_WEIGHT + 1;

class SpeedofDeliverySlabScheme extends DriverKpiSlabSchemePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, SCHEME_NAME);
  }
}

test.describe.serial('Driver KPI Slabs - Speed of Delivery Slab Scheme', () => {
  /** @type {SpeedofDeliverySlabScheme} */
  let slabScheme;

  test.beforeEach(async ({ page }) => {
    slabScheme = new SpeedofDeliverySlabScheme(page);
    await slabScheme.goto();
  });

  test('SOD-01: Speed of Delivery slab scheme page loads with main controls', async () => {
    await slabScheme.verifyPageLoaded();
  });

  test('SOD-02: Speed of Delivery filters, search, and pagination are usable', async () => {
    await slabScheme.verifyFiltersSearchAndPagination();
  });

  test('SOD-03: Create a slab and confirm it appears in the table', async () => {
    test.setTimeout(240000);
    await slabScheme.verifyCreateSlabFlow(CREATE_WEIGHT);
  });

  test('SOD-04: View the created slab\'s details', async () => {
    await slabScheme.verifyViewFlow(CREATE_WEIGHT);
  });

  test('SOD-05: Edit the created slab and confirm the update is saved', async () => {
    await slabScheme.verifyEditFlow(CREATE_WEIGHT, EDIT_WEIGHT);
  });

  test('SOD-06: Delete the edited slab and confirm it is removed', async () => {
    await slabScheme.verifyDeleteConfirmation(EDIT_WEIGHT);
  });
});
