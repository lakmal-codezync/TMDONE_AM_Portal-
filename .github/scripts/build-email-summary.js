// @ts-check
// ============================================================
// Builds an HTML email summary from the Playwright JSON report
// (test-results/results.json). One row per test: testID,
// explanation, and status (pass/fail/flaky/skipped). Writes the
// HTML to email-summary.html and, when run in GitHub Actions,
// appends subject/status/counts to $GITHUB_OUTPUT.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const REPORT_PATH = 'test-results/results.json';
const OUTPUT_PATH = 'email-summary.html';

/** @param {string} title */
function splitTestId(title) {
  const match = title.match(/^([A-Za-z]+-\d+):\s*(.*)$/);
  if (match) return { testId: match[1], explain: match[2] };
  return { testId: '-', explain: title };
}

/** @param {string} status */
function statusLabel(status) {
  switch (status) {
    case 'expected': return 'PASS';
    case 'unexpected': return 'FAIL';
    case 'flaky': return 'FLAKY';
    case 'skipped': return 'SKIPPED';
    default: return status.toUpperCase();
  }
}

/** @param {string} label */
function statusColor(label) {
  switch (label) {
    case 'PASS': return '#1a7f37';
    case 'FAIL': return '#cf222e';
    case 'FLAKY': return '#9a6700';
    case 'SKIPPED': return '#57606a';
    default: return '#24292f';
  }
}

/**
 * @param {any} suite
 * @param {string} file
 * @param {Array<{file: string, testId: string, explain: string, status: string}>} rows
 */
function walkSuite(suite, file, rows) {
  const currentFile = suite.file || file;
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const { testId, explain } = splitTestId(spec.title);
      rows.push({ file: currentFile, testId, explain, status: statusLabel(test.status) });
    }
  }
  for (const sub of suite.suites || []) {
    walkSuite(sub, currentFile, rows);
  }
}

function main() {
  if (!fs.existsSync(REPORT_PATH)) {
    console.error(`No Playwright JSON report found at ${REPORT_PATH}; skipping email summary.`);
    process.exitCode = 0;
    return;
  }

  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  /** @type {Array<{file: string, testId: string, explain: string, status: string}>} */
  const rows = [];
  for (const suite of report.suites || []) {
    walkSuite(suite, suite.title, rows);
  }

  const counts = { PASS: 0, FAIL: 0, FLAKY: 0, SKIPPED: 0 };
  for (const row of rows) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }

  const overallStatus = counts.FAIL > 0 ? 'FAILURE' : 'SUCCESS';
  const runDate = new Date().toISOString().slice(0, 10);
  const subject = `TMDone Playwright Daily Run - ${overallStatus === 'SUCCESS' ? 'All Passed' : `${counts.FAIL} Failed`} (${runDate})`;

  const rowsByFile = new Map();
  for (const row of rows) {
    if (!rowsByFile.has(row.file)) rowsByFile.set(row.file, []);
    rowsByFile.get(row.file).push(row);
  }

  const tableSections = [...rowsByFile.entries()]
    .map(([file, fileRows]) => {
      const tr = fileRows
        .map(
          (row) => `
        <tr>
          <td style="padding:6px 10px;border:1px solid #d0d7de;font-family:monospace;">${row.testId}</td>
          <td style="padding:6px 10px;border:1px solid #d0d7de;">${escapeHtml(row.explain)}</td>
          <td style="padding:6px 10px;border:1px solid #d0d7de;font-weight:bold;color:${statusColor(row.status)};">${row.status}</td>
        </tr>`
        )
        .join('');
      return `
      <h3 style="margin:20px 0 6px;font-family:sans-serif;color:#24292f;">${escapeHtml(file)}</h3>
      <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px;">
        <tr style="background:#f6f8fa;">
          <th style="padding:6px 10px;border:1px solid #d0d7de;text-align:left;">Test ID</th>
          <th style="padding:6px 10px;border:1px solid #d0d7de;text-align:left;">Description</th>
          <th style="padding:6px 10px;border:1px solid #d0d7de;text-align:left;">Status</th>
        </tr>
        ${tr}
      </table>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:20px;background:#ffffff;">
  <h2 style="font-family:sans-serif;color:#24292f;">TMDone Admin Console - Daily Playwright Run</h2>
  <p style="font-family:sans-serif;color:#57606a;">Date: ${runDate}</p>
  <p style="font-family:sans-serif;font-size:15px;">
    <span style="color:${statusColor('PASS')};font-weight:bold;">${counts.PASS} passed</span> &nbsp;|&nbsp;
    <span style="color:${statusColor('FAIL')};font-weight:bold;">${counts.FAIL} failed</span> &nbsp;|&nbsp;
    <span style="color:${statusColor('FLAKY')};font-weight:bold;">${counts.FLAKY} flaky</span> &nbsp;|&nbsp;
    <span style="color:${statusColor('SKIPPED')};font-weight:bold;">${counts.SKIPPED} skipped</span>
  </p>
  ${tableSections}
</body>
</html>`;

  fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH} (${rows.length} tests: ${JSON.stringify(counts)})`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `subject=${subject}`,
        `overall_status=${overallStatus}`,
        `passed=${counts.PASS}`,
        `failed=${counts.FAIL}`,
        `flaky=${counts.FLAKY}`,
        `skipped=${counts.SKIPPED}`,
        '',
      ].join('\n')
    );
  }
}

/** @param {string} value */
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

main();
