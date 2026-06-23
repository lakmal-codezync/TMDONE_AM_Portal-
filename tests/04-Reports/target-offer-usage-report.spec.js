// @ts-check
// ============================================================
// TMDone Admin Console - Target Offer Usage Report Tests
// URL: #/home/reports -> Target Offer Usage tab
// ============================================================

import { test } from '@playwright/test';
import { defineReportSuite } from '../helpers/reportHelper.js';

defineReportSuite(test, { name: 'Target Offer Usage', keyword: /target offer/i }, 'TOU');
