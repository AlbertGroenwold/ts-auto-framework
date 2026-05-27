import { z } from 'zod';

/** A single team's identity, mirrored into `qa.teams` on every run. */
export const teamConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slackChannel: z.string().optional(),
  oncall: z.email().optional(),
});

/** Feature toggles. Each is also overridable by env var (see config/load.ts). */
export const togglesSchema = z
  .object({
    dbLogging: z.boolean().default(true),
    htmlReport: z.boolean().default(true),
  })
  // prefault: run an empty object through the field defaults when `toggles`
  // is omitted entirely (zod 4 — `.default` would demand the full output type).
  .prefault({});

export const qaConfigSchema = z.object({
  team: teamConfigSchema,
  toggles: togglesSchema,
  reportDir: z.string().default('./playwright-report'),
  spoolDir: z.string().default('./test-results/db-spool'),
  /** Soft-archive cases whose last_seen_at falls this many days behind. */
  caseArchiveThresholdDays: z.number().int().positive().default(30),
});

/** What a consumer writes in `qa.config.ts` (pre-defaults). */
export type QaConfigInput = z.input<typeof qaConfigSchema>;
/** Fully-resolved config with defaults applied. */
export type QaConfig = z.output<typeof qaConfigSchema>;
export type TeamConfig = z.output<typeof teamConfigSchema>;
