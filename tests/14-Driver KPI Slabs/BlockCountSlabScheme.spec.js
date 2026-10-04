// @ts-check
// ============================================================
// TMDone Admin Console - Driver KPI Slabs
// Block Count slab scheme checks
// ============================================================

import { test } from '@playwright/test';
import { DriverKpiSlabSchemePage } from './driver-kpi-slab-helper.js';

const SCHEME_NAME = 'Block Count';
const RUN_STAMP = Date.now();
const CREATE_WEIGHT = 1000 + (RUN_STAMP % 8000);
const EDIT_WEIGHT = CREATE_WEIGHT + 1;

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
    slabScheme = new BlockCountSlabScheme(page);
    await slabScheme.goto();
  });

  test('BLC-01: Block Count slab scheme page loads with main controls', async () => {
    await slabScheme.verifyPageLoaded();
  });

  test('BLC-02: Block Count filters, search, and pagination are usable', async () => {
    await slabScheme.verifyFiltersSearchAndPagination();
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
});
