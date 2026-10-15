// @ts-check
// ============================================================
// Known product defects that a test deliberately keeps failing on.
// Attach one to the test as a Playwright annotation:
//
//   test('OM-07: ...', { annotation: backendIssue('...') }, async ({ page }) => { ... });
//
// When that test fails, the nightly email adds the description to the
// "Notes for the backend team" (or frontend team) section at the end of
// the report. When it passes again, the email lists it as possibly fixed.
// Write the description for the team that will fix it: what is wrong,
// which API, the evidence, and when it was first seen.
// ============================================================

/**
 * A defect in an API, the data, or server configuration.
 * @param {string} description
 */
export function backendIssue(description) {
  return { type: 'backend-issue', description };
}

/**
 * A defect in the console UI (wrong request sent, value not shown, button does nothing).
 * @param {string} description
 */
export function frontendIssue(description) {
  return { type: 'frontend-issue', description };
}
