// @ts-check
// Used only by the nightly workflow: merges the per-shard blob reports into one
// HTML report (uploaded as an artifact) and the JSON file the email summary reads.
//   npx playwright merge-reports --config .github/playwright-merge.config.js <blob-dir>
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const root = process.cwd();

export default defineConfig({
  testDir: path.join(root, 'tests'),
  reporter: [
    ['html', { outputFolder: path.join(root, 'playwright-report'), open: 'never' }],
    ['json', { outputFile: path.join(root, 'test-results', 'results.json') }],
  ],
});
