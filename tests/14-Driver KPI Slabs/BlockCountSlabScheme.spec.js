// @ts-check
// ============================================================
// TMDone Admin Console - Driver KPI Slabs
// Block Count slab scheme checks
// ============================================================

import { test } from '@playwright/test';
import { DriverKpiSlabSchemePage, cleanupCreatedSlabs } from './driver-kpi-slab-helper.js';

const SCHEME_NAME = 'Block Count';
const RUN_STAMP = Date.now();
const CREATE_WEIGHT = 1000 + (RUN_STAMP % 8000);
const EDIT_WEIGHT = CREATE_WEIGHT + 1;
// Used only to fill a create form that is then cancelled - it must never be saved.
const UNSAVED_WEIGHT = CREATE_WEIGHT + 2;

class BlockCountSlabScheme extends DriverKpiSlabSchemePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, SCHEME_NAME);
  }
}

test.describe.serial('Driver KPI Slabs - Block Count Slab Scheme', () => {
  /** @type {BlockCountSlabScheme} */
  let slabScheme;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    slabScheme = new BlockCountSlabScheme(page);
    await slabScheme.goto();
  });

  // Safety net: delete any slab this run created if a later lifecycle step failed.
  test.afterAll(async ({ browser }) => {
    test.setTimeout(240000);
    await cleanupCreatedSlabs(browser, SCHEME_NAME);
  });

  test('BLC-01: Block Count slab scheme page loads with main controls', async () => {
    await slabScheme.verifyPageLoaded();
  });

  test('BLC-02: Slab table shows the scheme columns and per-row Edit/Delete actions', async () => {
    await slabScheme.verifyTableStructure();
  });

  test('BLC-03: Create a slab and confirm it appears in the table', async () => {
    test.setTimeout(240000);
    await slabScheme.verifyCreateSlabFlow(CREATE_WEIGHT);
  });

  test('BLC-04: View the created slab\'s details', async () => {
    await slabScheme.verifyViewFlow(CREATE_WEIGHT);
  });

  test('BLC-05: Edit the created slab and confirm the update is saved', async () => {
    await slabScheme.verifyEditFlow(CREATE_WEIGHT, EDIT_WEIGHT);
  });

  test('BLC-06: Delete the edited slab and confirm it is removed', async () => {
    await slabScheme.verifyDeleteConfirmation(EDIT_WEIGHT);
  });

  test('BLC-07: Create dialog rejects a negative minimum and Cancel discards the slab', async () => {
    await slabScheme.verifyCreateValidationAndCancel(UNSAVED_WEIGHT);
  });

  test('BLC-08: Create dialog requires a positive weight and the close icon discards the slab', async () => {
    await slabScheme.verifyWeightValidationAndCloseIcon(UNSAVED_WEIGHT);
  });
});
