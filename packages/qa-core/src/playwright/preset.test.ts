import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { qaPreset } from './preset';

/** Write a qa.config.ts in a fresh temp dir (fresh path dodges jiti's path cache). */
function writeConfig(toggles: Record<string, boolean>): string {
  const dir = mkdtempSync(join(tmpdir(), 'qa-preset-'));
  const file = join(dir, 'qa.config.ts');
  const source = `export default { team: { id: 't', name: 'Team' }, toggles: ${JSON.stringify(toggles)} };`;
  writeFileSync(file, source, 'utf8');
  return file;
}

const names = (reporter: unknown): string[] =>
  (reporter as Array<[string, unknown]>).map((r) => r[0]);

describe('qaPreset', () => {
  it('includes the html reporter before the qa reporter when htmlReport is on', () => {
    const { reporter } = qaPreset({ configPath: writeConfig({ htmlReport: true }) });
    expect(names(reporter)).toEqual(['html', '@qa/core/reporter']);
  });

  it('omits the html reporter when htmlReport is off', () => {
    const { reporter } = qaPreset({ configPath: writeConfig({ htmlReport: false }) });
    expect(names(reporter)).toEqual(['@qa/core/reporter']);
  });

  it('threads the config path through to the qa reporter', () => {
    const path = writeConfig({ htmlReport: false });
    const { reporter } = qaPreset({ configPath: path });
    expect(reporter[0]).toEqual(['@qa/core/reporter', { configPath: path }]);
  });

  it('appends extra reporters after the framework ones', () => {
    const { reporter } = qaPreset({
      configPath: writeConfig({ htmlReport: true }),
      reporters: [['list', {}]],
    });
    expect(names(reporter)).toEqual(['html', '@qa/core/reporter', 'list']);
  });

  it('returns recommended use defaults', () => {
    const { use } = qaPreset({ configPath: writeConfig({ htmlReport: true }) });
    expect(use).toMatchObject({ trace: 'retain-on-failure', screenshot: 'only-on-failure' });
  });
});
