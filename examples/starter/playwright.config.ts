import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // CI gets stricter retries; locally fail fast.
  retries: process.env['CI'] ? 2 : 0,
  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:3000',
    // Framework-recommended defaults — keep these unless you have a reason not to.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [
    // Human-readable per-run artefact.
    ['html', { outputFolder: 'playwright-report' }],
    // Long-term traceability: writes runs/steps/cases to shared Postgres.
    // Silently no-ops when DATABASE_URL is unset.
    ['@qa/core/reporter'],
  ],
  projects: [
    { name: 'web', use: { ...devices['Desktop Chrome'] } },
    { name: 'api' },
  ],
});
