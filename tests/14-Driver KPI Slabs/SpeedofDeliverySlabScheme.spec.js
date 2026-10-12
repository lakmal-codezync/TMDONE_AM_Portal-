// @ts-check
// ============================================================
// TMDone Admin Console - Driver KPI Slabs
// Speed of Delivery slab scheme checks
// ============================================================

import { test } from '@playwright/test';
import { DriverKpiSlabSchemePage, cleanupCreatedSlabs } from './driver-kpi-slab-helper.js';

const SCHEME_NAME = 'Speed of Delivery';
const RUN_STAMP = Date.now();
const CREATE_WEIGHT = 1000 + (RUN_STAMP % 8000);
const EDIT_WEIGHT = CREATE_WEIGHT + 1;
// Used only to fill a create form that is then cancelled - it must never be saved.
const UNSAVED_WEIGHT = CREATE_WEIGHT + 2;

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
    test.setTimeout(240000);
    slabScheme = new SpeedofDeliverySlabScheme(page);
    await slabScheme.goto();
  });

  // Safety net: delete any slab this run created if a later lifecycle step failed.
  test.afterAll(async ({ browser }) => {
    test.setTimeout(240000);
    await cleanupCreatedSlabs(browser, SCHEME_NAME);
  });

  test('SOD-01: Speed of Delivery slab scheme page loads with main controls', async () => {
    await slabScheme.verifyPageLoaded();
  });

  test('SOD-02: Slab table shows the scheme columns and per-row Edit/Delete actions', async () => {
    await slabScheme.verifyTableStructure();
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

  test('SOD-07: Create dialog rejects a negative minimum and Cancel discards the slab', async () => {
    await slabScheme.verifyCreateValidationAndCancel(UNSAVED_WEIGHT);
  });

  test('SOD-08: Create dialog requires a positive weight and the close icon discards the slab', async () => {
    await slabScheme.verifyWeightValidationAndCloseIcon(UNSAVED_WEIGHT);
  });
});
