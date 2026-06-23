// @ts-check
// ============================================================
// TMDone Admin Console - Menu Optimization Report Tests
// URL: #/home/reports -> Menu Optimization tab
// ============================================================

import { test } from '@playwright/test';
import { defineReportSuite } from '../helpers/reportHelper.js';

defineReportSuite(test, { name: 'Menu Optimization', keyword: /menu optimization/i }, 'MO');
