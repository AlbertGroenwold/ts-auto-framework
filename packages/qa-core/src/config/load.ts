import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { qaConfigSchema, type QaConfig } from './schema';

export interface ResolvedConfig {
  config: QaConfig;
  /** Secret, env-only. Absent => DB logging is silently disabled. */
  databaseUrl: string | undefined;
  /** Final toggle after env > file > default resolution and the no-URL rule. */
  dbLoggingEnabled: boolean;
}

function envBool(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  const v = value.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  return undefined;
}

/**
 * Load and validate `qa.config.ts` from the consumer repo root, then apply the
 * env-override and DB-toggle rules. Throws a path-pointed error on invalid config.
 */
export async function loadConfig(
  opts: { cwd?: string; path?: string } = {},
): Promise<ResolvedConfig> {
  const cwd = opts.cwd ?? process.cwd();
  const file = opts.path ? resolve(opts.path) : resolve(cwd, 'qa.config.ts');

  const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  const raw = mod['default'] ?? mod['config'];

  const parsed = qaConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid qa.config.ts (${file}):\n${issues}`);
  }
  const config = parsed.data;

  const databaseUrl = process.env['DATABASE_URL'] || undefined;

  // Resolution order: env var > qa.config.ts > framework default.
  let dbLoggingEnabled = envBool(process.env['QA_DB_LOGGING']) ?? config.toggles.dbLogging;
  // No DB URL configured => DB logging silently disabled. By design.
  if (!databaseUrl) dbLoggingEnabled = false;

  return { config, databaseUrl, dbLoggingEnabled };
}
