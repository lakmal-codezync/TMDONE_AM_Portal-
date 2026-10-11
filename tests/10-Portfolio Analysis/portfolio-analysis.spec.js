// @ts-check
// ============================================================
// TMDone Admin Console - Portfolio Analysis: Performance Comparison Report
// URL: #/home/portfolio-analysis
// Tests: PA-01 -> PA-09 (read-only; per-account-manager comparison of two date ranges)
// The suite itself lives in tests/helpers/reportHelper.js (defineComparisonSuite).
// ============================================================

import { test } from '@playwright/test';
import { PORTFOLIO_METRICS, defineComparisonSuite } from '../helpers/reportHelper.js';

defineComparisonSuite(test, {
  name: 'Portfolio Analysis',
  prefix: 'PA',
  hashPath: '#/home/portfolio-analysis',
  api: 'reports/getPortfolioReport',
  excelApi: 'reports/portfolioReportExcel',
  heading: /^Portfolio Analysis$/,
  nameHeader: 'Account Manager',
  metrics: PORTFOLIO_METRICS,
  filterControl: 'managersArr',
  filterLabel: 'Account Manager',
  // An account manager that actually has a row in the current comparison.
  pickFilterValue: (initial) => String(initial.Report[0].Name).trim(),
  filePattern: /^TMDONE_Performance_Report_.+\.xlsx$/,
});
