// @ts-check
// ============================================================
// TMDone Admin Console - Driver KPI Slabs
// Redispatch Rate slab scheme checks
// ============================================================

import { test } from '@playwright/test';
import { RedispatchRateSlabScheme } from './RedispatchRateSlabScheme.js';

const RUN_STAMP = Date.now();
const CREATE_WEIGHT = 1000 + (RUN_STAMP % 8000);
const EDIT_WEIGHT = CREATE_WEIGHT + 1;

test.describe.serial('Driver KPI Slabs - Redispatch Rate Slab Scheme', () => {
  /** @type {RedispatchRateSlabScheme} */
  let slabScheme;

  test.beforeEach(async ({ page }) => {
    slabScheme = new RedispatchRateSlabScheme(page);
    await slabScheme.goto();
  });

  test('RDR-01: Redispatch Rate slab scheme page loads with main controls', async () => {
    await slabScheme.verifyPageLoaded();
  });

  test('RDR-02: Redispatch Rate filters, search, and pagination are usable', async () => {
    await slabScheme.verifyFiltersSearchAndPagination();
  });

  test('RDR-03: Create a slab and confirm it appears in the table', async () => {
    test.setTimeout(240000);
    await slabScheme.verifyCreateSlabFlow(CREATE_WEIGHT);
  });

  test('RDR-04: View the created slab\'s details', async () => {
    await slabScheme.verifyViewFlow(CREATE_WEIGHT);
  });

  test('RDR-05: Edit the created slab and confirm the update is saved', async () => {
    await slabScheme.verifyEditFlow(CREATE_WEIGHT, EDIT_WEIGHT);
  });

  test('RDR-06: Delete the edited slab and confirm it is removed', async () => {
    await slabScheme.verifyDeleteConfirmation(EDIT_WEIGHT);
  });
});
