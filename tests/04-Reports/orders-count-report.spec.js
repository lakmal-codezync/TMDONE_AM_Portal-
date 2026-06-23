// @ts-check
// ============================================================
// TMDone Admin Console - Orders Count Report Tests
// URL: #/home/reports -> Orders Count tab
// ============================================================

import { test } from '@playwright/test';
import { defineReportSuite } from '../helpers/reportHelper.js';

defineReportSuite(test, { name: 'Orders Count', keyword: /orders count/i }, 'OC');
