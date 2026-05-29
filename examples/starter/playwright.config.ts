import { defineConfig, devices } from '@playwright/test';
import { qaPreset } from '@qa/core';

// qaPreset reads qa.config.ts toggles to build the reporter array (HTML +
// Postgres) and supplies the framework-recommended trace/screenshot/video defaults.
const preset = qaPreset();

export default defineConfig({
  testDir: './tests',
  retries: process.env['CI'] ? 2 : 0,
  reporter: preset.reporter,
  use: {
    ...preset.use,
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:3000',
  },
  projects: [
    { name: 'web', use: { ...devices['Desktop Chrome'] } },
    { name: 'api' },
  ],
});
