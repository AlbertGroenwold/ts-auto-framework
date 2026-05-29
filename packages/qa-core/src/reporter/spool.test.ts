import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Spool, type SpoolRecord } from './spool';

function record(id: string): SpoolRecord {
  return { case: { id }, run: { id: `run-${id}` }, steps: [{ name: 'step', ordinal: 0 }] };
}

describe('Spool', () => {
  it('appends each record as one JSONL line under <dir>/<sessionId>.jsonl', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qa-spool-'));
    const spool = new Spool(dir, 'sess-1');

    spool.write(record('A'));
    spool.write(record('B'));

    expect(spool.path).toBe(resolve(dir, 'sess-1.jsonl'));

    const lines = readFileSync(spool.path, 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    const parsed = lines.map((l) => JSON.parse(l) as SpoolRecord);
    expect(parsed[0]!.case['id']).toBe('A');
    expect(parsed[1]!.run['id']).toBe('run-B');
  });

  it('creates the spool directory if it does not exist', () => {
    const base = mkdtempSync(join(tmpdir(), 'qa-spool-'));
    const nested = join(base, 'deep', 'spool');

    const spool = new Spool(nested, 'sess-2');
    spool.write(record('C'));

    expect(readFileSync(spool.path, 'utf8')).toContain('"id":"C"');
  });
});
