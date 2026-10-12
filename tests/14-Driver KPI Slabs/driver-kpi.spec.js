// @ts-check
// ============================================================
// TMDone Admin Console - Driver KPI Slabs
// Slabs setup checks: page load, table controls, create, view, edit, delete
// URL: #/home/11b-driver-kpi redirects to the dashboard on this environment, so the
// Speed of Delivery scheme route (#/home/fare-scheme/speed-of-delivery) is used.
//
// This targets the same live page/table as SpeedofDeliverySlabScheme.spec.js
// (#/home/fare-scheme/speed-of-delivery) - it reuses the same shared
// DriverKpiSlabSchemePage rather than duplicating its own copy of the
// create/view/edit/delete logic.
// ============================================================

import { test } from '@playwright/test';
import { DriverKpiSlabSchemePage, cleanupCreatedSlabs } from './driver-kpi-slab-helper.js';

const SCHEME_NAME = 'Speed of Delivery';
const RUN_STAMP = Date.now();
const CREATE_WEIGHT = 1000 + (RUN_STAMP % 8000);
const EDIT_WEIGHT = CREATE_WEIGHT + 1;
// Used only to fill a create form that is then cancelled - it must never be saved.
const UNSAVED_WEIGHT = CREATE_WEIGHT + 2;

class DriverKpiSlabsPage extends DriverKpiSlabSchemePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page, SCHEME_NAME);
  }
}

test.describe.serial('Driver KPI Slabs - driver-kpi.spec.js', () => {
  /** @type {DriverKpiSlabsPage} */
  let driverKpi;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(240000);
    driverKpi = new DriverKpiSlabsPage(page);
    await driverKpi.goto();
  });

  // Safety net: delete any slab this run created if a later lifecycle step failed.
  test.afterAll(async ({ browser }) => {
    test.setTimeout(240000);
    await cleanupCreatedSlabs(browser, SCHEME_NAME);
  });

  test('DKPI-01: Driver KPI Slabs page loads with main controls', async () => {
    await driverKpi.verifyPageLoaded();
  });

  test('DKPI-02: Slab table shows the scheme columns and per-row Edit/Delete actions', async () => {
    await driverKpi.verifyTableStructure();
  });

  test('DKPI-03: Create a slab and confirm it appears in the table', async () => {
    test.setTimeout(240000);
    await driverKpi.verifyCreateSlabFlow(CREATE_WEIGHT);
  });

  test('DKPI-04: View the created slab\'s details', async () => {
    await driverKpi.verifyViewFlow(CREATE_WEIGHT);
  });

  test('DKPI-05: Edit the created slab and confirm the update is saved', async () => {
    await driverKpi.verifyEditFlow(CREATE_WEIGHT, EDIT_WEIGHT);
  });

  test('DKPI-06: Delete the edited slab and confirm it is removed', async () => {
    await driverKpi.verifyDeleteConfirmation(EDIT_WEIGHT);
  });

  test('DKPI-07: Create dialog rejects a negative minimum and Cancel discards the slab', async () => {
    await driverKpi.verifyCreateValidationAndCancel(UNSAVED_WEIGHT);
  });

  test('DKPI-08: Driver KPI Slabs sidebar menu opens every slab scheme page', async () => {
    test.setTimeout(300000);
    await driverKpi.verifySidebarSchemeNavigation();
  });
});
