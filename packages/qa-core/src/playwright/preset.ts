import type { PlaywrightTestConfig } from '@playwright/test';
import { loadConfigSync } from '../config/load';

type ReporterList = Array<[string, Record<string, unknown>]>;

export interface QaPresetOptions {
  /** Override the path to qa.config.ts (defaults to cwd/qa.config.ts). */
  configPath?: string;
  /** Extra reporters appended after the framework's. */
  reporters?: ReporterList;
}

/**
 * Build the Playwright `reporter` array and recommended `use` defaults from
 * qa.config.ts toggles — the single source of truth for `htmlReport`/`reportDir`.
 * Spread into your config:
 *
 *   const preset = qaPreset();
 *   export default defineConfig({
 *     reporter: preset.reporter,
 *     use: { ...preset.use, baseURL: '...' },
 *   });
 */
export function qaPreset(
  options: QaPresetOptions = {},
): Required<Pick<PlaywrightTestConfig, 'use' | 'reporter'>> {
  const opts = options.configPath ? { path: options.configPath } : {};
  const { config } = loadConfigSync(opts);

  const reporter: ReporterList = [];
  if (config.toggles.htmlReport) {
    reporter.push(['html', { outputFolder: config.reportDir }]);
  }
  // The Postgres reporter self-disables when DATABASE_URL is unset.
  reporter.push(['@qa/core/reporter', options.configPath ? { configPath: options.configPath } : {}]);
  reporter.push(...(options.reporters ?? []));

  const use: PlaywrightTestConfig['use'] = {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  };

  return { use, reporter };
}
