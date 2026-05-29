import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  FullConfig,
  FullResult,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Shared, mutable state the mocked db/client closes over. vi.hoisted so the
// vi.mock factory (hoisted above imports) can reference it.
const h = vi.hoisted(() => ({
  records: [] as Array<{ table: unknown; values: unknown; upsert?: unknown }>,
  txCalls: 0,
  createDbCalls: 0,
  endCalls: 0,
  shouldThrow: false,
}));

vi.mock('../db/client', () => {
  const insert = (table: unknown) => {
    const entry: { table: unknown; values: unknown; upsert?: unknown } = { table, values: undefined };
    const builder = {
      values(v: unknown) {
        entry.values = v;
        h.records.push(entry);
        return builder;
      },
      onConflictDoUpdate(arg: unknown) {
        entry.upsert = arg;
        return builder;
      },
      then(onF: (v: unknown[]) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve([]).then(onF, onR);
      },
    };
    return builder;
  };
  const transaction = async (cb: (tx: { insert: typeof insert }) => Promise<void>) => {
    h.txCalls += 1;
    if (h.shouldThrow) throw new Error('db down');
    return cb({ insert });
  };
  return {
    createDb: () => {
      h.createDbCalls += 1;
      return { db: { insert, transaction }, pool: { end: async () => void (h.endCalls += 1) } };
    },
  };
});

// db/client is mocked; db/schema is real, so table identities match the reporter's.
const { QaPostgresReporter } = await import('./postgres-reporter');
const { cases, runs, steps, teams } = await import('../db/schema');

function writeConfig(spoolDir: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'qa-reporter-'));
  const file = join(dir, 'qa.config.ts');
  const source = `export default { team: { id: 'team-a', name: 'Team A' }, spoolDir: ${JSON.stringify(spoolDir)} };`;
  writeFileSync(file, source, 'utf8');
  return file;
}

function fakeStep(title: string, error?: { message: string; stack?: string }): TestStep {
  return {
    category: 'test.step',
    title,
    duration: 5,
    error,
    titlePath: () => [title],
    location: { file: 'a.spec.ts', line: 1, column: 1 },
  } as unknown as TestStep;
}

function fakeTest(id: string | null, title = 'logs in'): TestCase {
  return {
    title,
    tags: id ? [`@tc:${id}`] : [],
    location: { file: 'a.spec.ts', line: 10 },
    parent: { project: () => ({ name: 'web' }) },
  } as unknown as TestCase;
}

function fakeResult(status: TestResult['status'] = 'passed'): TestResult {
  return {
    status,
    startTime: new Date('2026-05-29T10:00:00Z'),
    duration: 123.7,
    retry: 0,
    workerIndex: 0,
  } as unknown as TestResult;
}

const suiteOf = (...tests: TestCase[]): Suite => ({ allTests: () => tests }) as unknown as Suite;
const find = (table: unknown) => h.records.find((r) => r.table === table);

let warnSpy: ReturnType<typeof vi.spyOn>;
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  h.records.length = 0;
  h.txCalls = h.createDbCalls = h.endCalls = 0;
  h.shouldThrow = false;
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  process.env['DATABASE_URL'] = 'postgres://localhost/qa';
  process.env['QA_BRANCH'] = 'main'; // pre-seed so init() doesn't spawn git
  process.env['QA_COMMIT_SHA'] = 'deadbeef';
});

afterEach(() => {
  warnSpy.mockRestore();
  process.env = { ...ORIGINAL_ENV };
});

async function run(
  reporter: InstanceType<typeof QaPostgresReporter>,
  test: TestCase,
  result: TestResult,
  steps_: TestStep[],
) {
  reporter.onBegin({} as FullConfig, suiteOf(test));
  for (const s of steps_) reporter.onStepEnd(test, result, s);
  reporter.onTestEnd(test, result);
  await reporter.onEnd({} as FullResult);
}

describe('QaPostgresReporter', () => {
  it('buffers steps and flushes one transaction per test with linked rows', async () => {
    const reporter = new QaPostgresReporter({ configPath: writeConfig(mkdtempSync(join(tmpdir(), 'spool-'))) });
    const result = fakeResult('passed');
    await run(reporter, fakeTest('LOGIN-001'), result, [fakeStep('open'), fakeStep('submit')]);

    expect(h.txCalls).toBe(1); // one round-trip per test, not per step

    const caseRow = find(cases)!.values as Record<string, unknown>;
    expect(caseRow['id']).toBe('LOGIN-001');
    expect(caseRow['ownerTeam']).toBe('team-a');
    expect(find(cases)!.upsert).toBeDefined(); // cases are upserted

    const runRow = find(runs)!.values as Record<string, unknown>;
    expect(runRow['status']).toBe('passed');
    expect(runRow['durationMs']).toBe(124); // rounded
    expect(runRow['branch']).toBe('main');

    const stepRows = find(steps)!.values as Array<Record<string, unknown>>;
    expect(stepRows).toHaveLength(2);
    expect(stepRows.map((s) => s['ordinal'])).toEqual([0, 1]);
    expect(stepRows[0]!['runId']).toBe(runRow['id']); // steps linked to their run
  });

  it('upserts the team on init', async () => {
    const reporter = new QaPostgresReporter({ configPath: writeConfig(mkdtempSync(join(tmpdir(), 'spool-'))) });
    await run(reporter, fakeTest('LOGIN-001'), fakeResult(), []);

    const teamRow = find(teams)!.values as Record<string, unknown>;
    expect(teamRow['id']).toBe('team-a');
    expect(find(teams)!.upsert).toBeDefined();
  });

  it('spools to JSONL and warns once when the DB is unreachable', async () => {
    const spoolDir = mkdtempSync(join(tmpdir(), 'spool-'));
    h.shouldThrow = true;
    const reporter = new QaPostgresReporter({ configPath: writeConfig(spoolDir) });

    const result1 = fakeResult('failed');
    reporter.onBegin({} as FullConfig, suiteOf(fakeTest('A-1'), fakeTest('A-2')));
    reporter.onTestEnd(fakeTest('A-1'), result1);
    reporter.onTestEnd(fakeTest('A-2'), fakeResult('failed'));
    await reporter.onEnd({} as FullResult);

    const files = readdirSync(spoolDir).filter((f) => f.endsWith('.jsonl'));
    expect(files).toHaveLength(1);
    const lines = readFileSync(join(spoolDir, files[0]!), 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2); // both tests spooled
    expect(warnSpy).toHaveBeenCalledTimes(1); // warned once, not per test
  });

  it('does nothing and never connects when DB logging is disabled', async () => {
    delete process.env['DATABASE_URL']; // no URL => logging silently off
    const reporter = new QaPostgresReporter({ configPath: writeConfig(mkdtempSync(join(tmpdir(), 'spool-'))) });
    await run(reporter, fakeTest('LOGIN-001'), fakeResult(), [fakeStep('open')]);

    expect(h.createDbCalls).toBe(0);
    expect(h.txCalls).toBe(0);
    expect(h.records).toHaveLength(0);
  });

  it('rejects the run at onBegin when a test lacks a @tc: id', () => {
    const reporter = new QaPostgresReporter({ configPath: writeConfig(mkdtempSync(join(tmpdir(), 'spool-'))) });
    expect(() => reporter.onBegin({} as FullConfig, suiteOf(fakeTest(null)))).toThrow(
      /standards check failed/,
    );
  });

  it('rejects the run when a @tc: id is reused across tests', () => {
    const reporter = new QaPostgresReporter({ configPath: writeConfig(mkdtempSync(join(tmpdir(), 'spool-'))) });
    const a = fakeTest('DUP-1');
    const b = { ...fakeTest('DUP-1'), location: { file: 'b.spec.ts', line: 20 } } as TestCase;
    expect(() => reporter.onBegin({} as FullConfig, suiteOf(a, b))).toThrow(/reused/);
  });
});
