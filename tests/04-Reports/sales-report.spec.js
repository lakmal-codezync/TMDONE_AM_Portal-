// @ts-check
// ============================================================
// TMDone Admin Console - Sales Report Tests
// URL: #/home/reports -> Sales tab
// ============================================================

import { test } from '@playwright/test';
import { defineReportSuite } from '../helpers/reportHelper.js';

defineReportSuite(test, { name: 'Sales', keyword: /sales/i }, 'SR');
