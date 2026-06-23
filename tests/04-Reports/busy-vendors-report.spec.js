// @ts-check
// ============================================================
// TMDone Admin Console - Busy Vendors Report Tests
// URL: #/home/reports -> Busy Vendors tab
// ============================================================

import { test } from '@playwright/test';
import { defineReportSuite } from '../helpers/reportHelper.js';

defineReportSuite(test, { name: 'Busy Vendors', keyword: /busy vendor/i }, 'BV');
