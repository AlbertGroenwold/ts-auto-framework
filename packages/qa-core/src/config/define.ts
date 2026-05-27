import type { QaConfigInput } from './schema';

/**
 * Identity helper for `qa.config.ts`. Gives consumers full type-checking and
 * autocomplete on their config without running validation here — validation
 * happens once, centrally, in {@link loadConfig} at startup.
 */
export function defineConfig(config: QaConfigInput): QaConfigInput {
  return config;
}
