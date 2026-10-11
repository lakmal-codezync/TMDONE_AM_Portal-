// @ts-check
// ============================================================
// TMDone Admin Console - Analysis: Performance Comparison Report
// URL: #/home/analysis
// Tests: AN-01 -> AN-09 (read-only; per-store comparison of two date ranges)
// The suite itself lives in tests/helpers/reportHelper.js (defineComparisonSuite),
// shared with tests/10-Portfolio Analysis/portfolio-analysis.spec.js.
// ============================================================

import { test } from '@playwright/test';
import { ANALYSIS_METRICS, defineComparisonSuite } from '../helpers/reportHelper.js';

defineComparisonSuite(test, {
  name: 'Analysis',
  prefix: 'AN',
  hashPath: '#/home/analysis',
  api: 'reports/getPerformanceReport',
  excelApi: 'reports/performanceReportExcel',
  heading: /^Analysis$/,
  nameHeader: 'Brand Name',
  metrics: ANALYSIS_METRICS,
  filterControl: 'storeArr',
  filterLabel: 'Store',
  // Test store from the test data policy (read-only filtering).
  pickFilterValue: () => 'Cafe Asiana',
  filePattern: /^TMDONE_Performance_Report_.+\.xlsx$/,
});
