import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfigSync } from './load';

/** Write a qa.config.ts in a fresh temp dir (fresh path dodges jiti's path cache). */
function writeConfig(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'qa-config-'));
  const file = join(dir, 'qa.config.ts');
  writeFileSync(file, source, 'utf8');
  return file;
}

const VALID = `export default { team: { id: 't', name: 'Team' } };`;

const ORIGINAL_DB_URL = process.env['DATABASE_URL'];
const ORIGINAL_DB_LOGGING = process.env['QA_DB_LOGGING'];

afterEach(() => {
  restore('DATABASE_URL', ORIGINAL_DB_URL);
  restore('QA_DB_LOGGING', ORIGINAL_DB_LOGGING);
});

function restore(key: string, value: string | undefined): void {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}

describe('loadConfigSync', () => {
  it('applies schema defaults', () => {
    const { config } = loadConfigSync({ path: writeConfig(VALID) });
    expect(config.reportDir).toBe('./playwright-report');
    expect(config.caseArchiveThresholdDays).toBe(30);
    expect(config.toggles.htmlReport).toBe(true);
  });

  it('disables DB logging when DATABASE_URL is absent, even if the toggle is on', () => {
    delete process.env['DATABASE_URL'];
    const { databaseUrl, dbLoggingEnabled } = loadConfigSync({ path: writeConfig(VALID) });
    expect(databaseUrl).toBeUndefined();
    expect(dbLoggingEnabled).toBe(false);
  });

  it('enables DB logging when DATABASE_URL is set and the toggle defaults on', () => {
    process.env['DATABASE_URL'] = 'postgres://localhost/qa';
    delete process.env['QA_DB_LOGGING'];
    const { dbLoggingEnabled } = loadConfigSync({ path: writeConfig(VALID) });
    expect(dbLoggingEnabled).toBe(true);
  });

  it('lets QA_DB_LOGGING=0 override an on toggle', () => {
    process.env['DATABASE_URL'] = 'postgres://localhost/qa';
    process.env['QA_DB_LOGGING'] = '0';
    const { dbLoggingEnabled } = loadConfigSync({ path: writeConfig(VALID) });
    expect(dbLoggingEnabled).toBe(false);
  });

  it('throws a path-pointed error on invalid config', () => {
    const file = writeConfig(`export default { team: { id: 't' } };`); // missing name
    expect(() => loadConfigSync({ path: file })).toThrow(/Invalid qa\.config\.ts/);
  });
});
