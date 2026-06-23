// @ts-check
// ============================================================
// TMDone Admin Console - Fulfillment Report Tests
// URL: #/home/reports -> Fulfillment tab
// ============================================================

import { test } from '@playwright/test';
import { defineReportSuite } from '../helpers/reportHelper.js';

defineReportSuite(test, { name: 'Fulfillment', keyword: /fulfillment|fullfilment/i }, 'FR');
