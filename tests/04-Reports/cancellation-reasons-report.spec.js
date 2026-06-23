// @ts-check
// ============================================================
// TMDone Admin Console - Cancellation Reasons Report Tests
// URL: #/home/reports -> Cancellation Reasons tab
// ============================================================

import { test } from '@playwright/test';
import { defineReportSuite } from '../helpers/reportHelper.js';

defineReportSuite(test, { name: 'Cancellation Reasons', keyword: /cancellation/i }, 'CR');
