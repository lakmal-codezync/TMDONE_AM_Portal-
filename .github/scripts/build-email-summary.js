// @ts-check
// ============================================================
// Builds the nightly email from the merged Playwright JSON report
// (test-results/results.json): one row per test with its ID,
// description, status and - for failed/flaky tests - the reason.
//
// Also covers the runs that produce no report, so an email is
// always sent:
//   SITE_UP=false            -> demo site unreachable, tests not run
//   no results.json          -> run cancelled / timed out / crashed
//
// At the end of the report it adds "Notes for the backend team" (failed
// tests labelled with backendIssue() in tests/helpers/knownIssues.js,
// plus any other failure that got an HTTP 5xx answer), "Notes for the
// frontend team" (frontendIssue()), and labelled tests that passed today.
//
// Writes email-summary.html, appends subject/counts to $GITHUB_OUTPUT
// and a short Markdown summary to $GITHUB_STEP_SUMMARY.
//
// Optional env: SITE_UP, SITE_DETAIL, E2E_RESULT, RUN_URL.
// ============================================================

import fs from 'node:fs';

const REPORT_PATH = 'test-results/results.json';
const OUTPUT_PATH = 'email-summary.html';

const SITE_UP = process.env.SITE_UP || '';
const SITE_DETAIL = process.env.SITE_DETAIL || '';
const E2E_RESULT = process.env.E2E_RESULT || '';
const RUN_URL = process.env.RUN_URL || '';
const RUN_DATE = new Date().toISOString().slice(0, 10);

const COLORS = { PASS: '#1a7f37', FAIL: '#cf222e', FLAKY: '#9a6700', SKIPPED: '#57606a', 'NOT RUN': '#57606a' };

/** @param {string} title */
function splitTestId(title) {
  const match = title.match(/^([A-Za-z]+-\d+[a-z]?)(?:\s*\[[^\]]*\])?:\s*(.*)$/);
  if (match) return { testId: match[1], explain: match[2] };
  return { testId: '-', explain: title };
}

/** @param {any} test */
function statusLabel(test) {
  if (!test.results || test.results.length === 0) return 'NOT RUN';
  switch (test.status) {
    case 'expected': return 'PASS';
    case 'unexpected': return 'FAIL';
    case 'flaky': return 'FLAKY';
    case 'skipped': return 'SKIPPED';
    default: return String(test.status).toUpperCase();
  }
}

/** @param {string} text */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/** @param {string} value */
function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Short, readable reason from a test's last error (first lines only, no stack).
 * @param {any} test
 */
function getFailureReason(test) {
  const results = test.results || [];
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const message = results[i]?.error?.message || results[i]?.errors?.[0]?.message;
    if (message) {
      const lines = stripAnsi(message).trim().split('\n').map((l) => l.trim()).filter(Boolean);
      const summary = lines.slice(0, 3).join(' | ');
      return summary.length > 400 ? `${summary.slice(0, 400)}…` : summary;
    }
  }
  return '';
}

/**
 * Whole error text of every attempt (used to spot HTTP 5xx answers in unlabelled failures).
 * @param {any} test
 */
function getFullErrorText(test) {
  return (test.results || [])
    .flatMap((result) => [result?.error?.message, ...(result?.errors || []).map((e) => e?.message)])
    .filter(Boolean)
    .map((message) => stripAnsi(String(message)))
    .join('\n');
}

/**
 * Known-issue labels set with tests/helpers/knownIssues.js (static and runtime annotations).
 * @param {any} test
 * @returns {{team: 'backend' | 'frontend', description: string} | null}
 */
function getKnownIssue(test) {
  const annotations = [...(test.annotations || []), ...(test.results || []).flatMap((r) => r.annotations || [])];
  for (const annotation of annotations) {
    if (annotation?.type === 'backend-issue') return { team: 'backend', description: String(annotation.description || '') };
    if (annotation?.type === 'frontend-issue') return { team: 'frontend', description: String(annotation.description || '') };
  }
  return null;
}

// An API answered with a server error somewhere in this failure.
const SERVER_ERROR = /\b(?:Received|status(?: code)?|HTTP)[:\s]+5\d\d\b|\b5\d\d (?:Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)\b|Internal Server Error/i;

/**
 * @typedef {{file: string, testId: string, explain: string, status: string, reason: string,
 *   issue: {team: 'backend' | 'frontend', description: string} | null, serverError: boolean}} Row
 */

/**
 * @param {any} suite
 * @param {string} file
 * @param {Row[]} rows
 */
function walkSuite(suite, file, rows) {
  const currentFile = suite.file || file;
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const { testId, explain } = splitTestId(spec.title);
      const status = statusLabel(test);
      const failed = status === 'FAIL' || status === 'FLAKY';
      const reason = failed ? getFailureReason(test) : '';
      const serverError = failed && SERVER_ERROR.test(getFullErrorText(test));
      rows.push({ file: currentFile, testId, explain, status, reason, issue: getKnownIssue(test), serverError });
    }
  }
  for (const sub of suite.suites || []) walkSuite(sub, currentFile, rows);
}

/** @param {Row} row */
const testName = (row) => (row.testId !== '-' ? `${row.testId}: ${row.explain}` : row.explain);

/**
 * The notes at the end of the report: known backend issues (and unexplained server errors),
 * known frontend issues, and known issues that passed today.
 * @param {Row[]} rows
 */
function buildTeamNotes(rows) {
  const failed = (/** @type {Row} */ row) => row.status === 'FAIL' || row.status === 'FLAKY';
  const backend = rows.filter((row) => failed(row) && row.issue?.team === 'backend');
  const serverErrors = rows.filter((row) => failed(row) && !row.issue && row.serverError);
  const frontend = rows.filter((row) => failed(row) && row.issue?.team === 'frontend');
  const passedKnown = rows.filter((row) => row.status === 'PASS' && row.issue);

  const font = 'font-family:sans-serif;';
  /** @param {Row} row @param {boolean} withIssue */
  const item = (row, withIssue) => `
      <li style="${font}margin-bottom:10px;">
        <b>${escapeHtml(testName(row))}</b> <span style="color:#57606a;">(${escapeHtml(row.file)})</span>
        ${row.status === 'FLAKY' ? '<span style="color:#9a6700;"> - intermittent: failed, then passed on retry</span>' : ''}
        ${withIssue && row.issue ? `<div style="margin-top:4px;">${escapeHtml(row.issue.description)}</div>` : ''}
        ${row.reason ? `<div style="margin-top:4px;font-family:monospace;font-size:12px;color:#57606a;">Today: ${escapeHtml(row.reason)}</div>` : ''}
      </li>`;
  /** @param {string} title @param {string} intro @param {string} color @param {string} body */
  const section = (title, intro, color, body) => `
  <div style="margin-top:28px;padding:14px 18px;border-left:4px solid ${color};background:#f6f8fa;">
    <h3 style="${font}margin:0 0 6px;color:#24292f;">${title}</h3>
    <p style="${font}margin:0 0 10px;color:#57606a;">${intro}</p>
    <ol style="margin:0;padding-left:20px;">${body}</ol>
  </div>`;

  let html = '';
  /** @type {string[]} */
  const md = [];

  if (backend.length || serverErrors.length) {
    const body = [
      ...backend.map((row) => item(row, true)),
      ...serverErrors.map((row) => item(row, false)),
    ].join('');
    const intro = [
      backend.length ? `${backend.length} test(s) failed on known backend issues (API, data or server configuration); each note says what is wrong and where.` : '',
      serverErrors.length ? `${serverErrors.length} other failure(s) got an HTTP 5xx answer from the server - please check the server logs for this run.` : '',
    ].filter(Boolean).join(' ');
    html += section('Notes for the backend team', intro, '#cf222e', body);
    md.push('### Notes for the backend team', '');
    for (const row of backend) md.push(`- **${testName(row)}** (${row.file}): ${row.issue?.description}`);
    for (const row of serverErrors) md.push(`- **${testName(row)}** (${row.file}): server error - ${row.reason.slice(0, 200)}`);
    md.push('');
  }

  if (frontend.length) {
    html += section(
      'Notes for the frontend team',
      `${frontend.length} test(s) failed on known console (UI) issues; each note says what the page does wrong.`,
      '#9a6700',
      frontend.map((row) => item(row, true)).join('')
    );
    md.push('### Notes for the frontend team', '');
    for (const row of frontend) md.push(`- **${testName(row)}** (${row.file}): ${row.issue?.description}`);
    md.push('');
  }

  if (passedKnown.length) {
    html += section(
      'Known issues that passed today',
      'These tests carry a known-issue label but passed in this run: either the issue was fixed, or today\'s data did not trigger it. Please check, and once it is confirmed fixed, remove the label from the test.',
      '#1a7f37',
      passedKnown.map((row) => item(row, true)).join('')
    );
    md.push('### Known issues that passed today', '');
    for (const row of passedKnown) md.push(`- **${testName(row)}** (${row.file}) - ${row.issue?.team} issue fixed, or not triggered today`);
    md.push('');
  }

  return { html, markdown: md.join('\n') };
}

/**
 * @param {string} heading
 * @param {string} bodyHtml
 */
function page(heading, bodyHtml) {
  const runLink = RUN_URL
    ? `<p style="font-family:sans-serif;"><a href="${escapeHtml(RUN_URL)}">Open the GitHub Actions run</a> (HTML report with screenshots, videos and traces is attached to the run as the <b>playwright-report</b> artifact).</p>`
    : '';
  return `<!doctype html>
<html>
<body style="margin:0;padding:20px;background:#ffffff;">
  <h2 style="font-family:sans-serif;color:#24292f;">${escapeHtml(heading)}</h2>
  <p style="font-family:sans-serif;color:#57606a;">Date: ${RUN_DATE}</p>
  ${bodyHtml}
  ${runLink}
</body>
</html>`;
}

/**
 * @param {string} subject
 * @param {string} html
 * @param {Record<string, number>} counts
 * @param {string} overall
 * @param {string} markdown
 */
function writeOutputs(subject, html, counts, overall, markdown) {
  fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}: ${subject}`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `subject=${subject}`,
        `overall_status=${overall}`,
        `passed=${counts.PASS || 0}`,
        `failed=${counts.FAIL || 0}`,
        `flaky=${counts.FLAKY || 0}`,
        `skipped=${counts.SKIPPED || 0}`,
        `not_run=${counts['NOT RUN'] || 0}`,
        '',
      ].join('\n')
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function main() {
  const empty = { PASS: 0, FAIL: 0, FLAKY: 0, SKIPPED: 0, 'NOT RUN': 0 };

  if (SITE_UP === 'false') {
    const subject = `TMDone nightly: demo site unreachable, tests not run (${RUN_DATE})`;
    const detail = SITE_DETAIL ? `<p style="font-family:monospace;color:#57606a;">${escapeHtml(SITE_DETAIL)}</p>` : '';
    const html = page('TMDone Admin Console - Nightly Playwright Run', `
      <p style="font-family:sans-serif;font-size:15px;color:${COLORS.FAIL};font-weight:bold;">The demo site did not respond, so the tests were not run.</p>
      ${detail}
      <p style="font-family:sans-serif;">Nothing to fix in the tests: check that the demo environment is up, then re-run the workflow from the Actions tab.</p>`);
    writeOutputs(subject, html, empty, 'SITE_DOWN', `### Demo site unreachable - tests not run\n\n${SITE_DETAIL}`);
    return;
  }

  if (!fs.existsSync(REPORT_PATH)) {
    const how = E2E_RESULT ? `the test jobs ended as "${E2E_RESULT}"` : 'the test jobs did not finish';
    const subject = `TMDone nightly: no test results, ${E2E_RESULT || 'run did not finish'} (${RUN_DATE})`;
    const html = page('TMDone Admin Console - Nightly Playwright Run', `
      <p style="font-family:sans-serif;font-size:15px;color:${COLORS.FAIL};font-weight:bold;">No test report was produced: ${escapeHtml(how)}.</p>
      <p style="font-family:sans-serif;">This usually means the run was cancelled, hit the time limit, or could not start. The run log shows where it stopped.</p>`);
    writeOutputs(subject, html, empty, 'NO_RESULTS', `### No test results\n\nThe test jobs ended as \`${E2E_RESULT || 'unknown'}\`.`);
    return;
  }

  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  /** @type {Row[]} */
  const rows = [];
  for (const suite of report.suites || []) walkSuite(suite, suite.title, rows);
  const notes = buildTeamNotes(rows);

  /** @type {Record<string, number>} */
  const counts = { ...empty };
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;

  const overall = counts.FAIL > 0 || counts['NOT RUN'] > 0 ? 'FAILURE' : 'SUCCESS';
  const parts = [`${counts.PASS} passed`, `${counts.FAIL} failed`];
  if (counts.FLAKY) parts.push(`${counts.FLAKY} flaky`);
  if (counts['NOT RUN']) parts.push(`${counts['NOT RUN']} not run`);
  const backendFailures = rows.filter(
    (r) => (r.status === 'FAIL' || r.status === 'FLAKY') && (r.issue?.team === 'backend' || (!r.issue && r.serverError))
  ).length;
  if (backendFailures) parts.push(`${backendFailures} backend issue${backendFailures === 1 ? '' : 's'}`);
  const subject = `TMDone nightly: ${parts.join(', ')} (${RUN_DATE})`;

  /** @type {Map<string, typeof rows>} */
  const rowsByFile = new Map();
  for (const row of rows) {
    if (!rowsByFile.has(row.file)) rowsByFile.set(row.file, []);
    /** @type {typeof rows} */ (rowsByFile.get(row.file)).push(row);
  }

  const cell = 'padding:6px 10px;border:1px solid #d0d7de;';
  const tableSections = [...rowsByFile.entries()]
    .map(([file, fileRows]) => {
      const tr = fileRows
        .map(
          (row) => `
        <tr>
          <td style="${cell}font-family:monospace;">${escapeHtml(row.testId)}</td>
          <td style="${cell}">${escapeHtml(row.explain)}</td>
          <td style="${cell}font-weight:bold;color:${COLORS[/** @type {keyof typeof COLORS} */ (row.status)] || '#24292f'};">${row.status}${
            row.issue && row.status !== 'PASS'
              ? `<div style="font-weight:normal;font-size:11px;color:#57606a;">known ${row.issue.team} issue</div>`
              : ''
          }</td>
          <td style="${cell}font-family:monospace;font-size:12px;color:#57606a;">${row.reason ? escapeHtml(row.reason) : '-'}</td>
        </tr>`
        )
        .join('');
      return `
      <h3 style="margin:20px 0 6px;font-family:sans-serif;color:#24292f;">${escapeHtml(file)}</h3>
      <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px;">
        <tr style="background:#f6f8fa;">
          <th style="${cell}text-align:left;">Test ID</th>
          <th style="${cell}text-align:left;">Description</th>
          <th style="${cell}text-align:left;">Status</th>
          <th style="${cell}text-align:left;">Reason (if failed)</th>
        </tr>
        ${tr}
      </table>`;
    })
    .join('\n');

  const countLine = Object.entries(counts)
    .filter(([label, n]) => n > 0 || label === 'PASS' || label === 'FAIL')
    .map(([label, n]) => `<span style="color:${COLORS[/** @type {keyof typeof COLORS} */ (label)]};font-weight:bold;">${n} ${label.toLowerCase()}</span>`)
    .join(' &nbsp;|&nbsp; ');
  const html = page('TMDone Admin Console - Nightly Playwright Run', `
  <p style="font-family:sans-serif;font-size:15px;">${countLine}</p>
  ${tableSections}
  ${notes.html}`);

  const failed = rows.filter((r) => r.status === 'FAIL' || r.status === 'FLAKY');
  const markdown = [
    `### ${parts.join(', ')}`,
    '',
    failed.length ? '| Status | File | Test | Reason |\n|---|---|---|---|' : '',
    ...failed.map((r) => `| ${r.status} | ${r.file} | ${testName(r).replace(/\|/g, '/')} | ${r.reason.replace(/\|/g, '/').slice(0, 200)} |`),
    '',
    notes.markdown,
  ].join('\n');

  writeOutputs(subject, html, counts, overall, markdown);
}

main();
