// @ts-check
// ============================================================
// TMDone Admin Console - Driver KPI Slabs
// Average Attendance slab scheme checks
// ============================================================

import { test } from '@playwright/test';
import { DriverKpiSlabSchemePage } from './driver-kpi-slab-helper.js';

const SCHEME_NAME = 'Average Attendance';
const RUN_STAMP = Date.now();
const CREATE_WEIGHT = 1000 + (RUN_STAMP % 8000);
const EDIT_WEIGHT = CREATE_WEIGHT + 1;

class AverageAttendanceSlabScheme extends DriverKpiSlabSchemePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, SCHEME_NAME);
  }
}

test.describe.serial('Driver KPI Slabs - Average Attendance Slab Scheme', () => {
  /** @type {AverageAttendanceSlabScheme} */
  let slabScheme;

  test.beforeEach(async ({ page }) => {
    slabScheme = new AverageAttendanceSlabScheme(page);
    await slabScheme.goto();
  });

  test('AAT-01: Average Attendance slab scheme page loads with main controls', async () => {
    await slabScheme.verifyPageLoaded();
  });

  test('AAT-02: Average Attendance filters, search, and pagination are usable', async () => {
    await slabScheme.verifyFiltersSearchAndPagination();
  });

  test('AAT-03: Create a slab and confirm it appears in the table', async () => {
    test.setTimeout(240000);
    await slabScheme.verifyCreateSlabFlow(CREATE_WEIGHT);
  });

  test('AAT-04: View the created slab\'s details', async () => {
    await slabScheme.verifyViewFlow(CREATE_WEIGHT);
  });

  test('AAT-05: Edit the created slab and confirm the update is saved', async () => {
    await slabScheme.verifyEditFlow(CREATE_WEIGHT, EDIT_WEIGHT);
  });

  test('AAT-06: Delete the edited slab and confirm it is removed', async () => {
    await slabScheme.verifyDeleteConfirmation(EDIT_WEIGHT);
  });
});
