import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import { loadConfig } from '../config/load';
import type { QaConfig } from '../config/schema';
import { createDb, type Db } from '../db/client';
import { cases, runs, steps, teams } from '../db/schema';
import { Spool } from './spool';

interface ReporterOptions {
  /** Override the path to qa.config.ts (defaults to cwd/qa.config.ts). */
  configPath?: string;
}

type RunStatus = 'passed' | 'failed' | 'skipped' | 'timedout';

function mapStatus(status: TestResult['status']): RunStatus {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'skipped':
      return 'skipped';
    case 'timedOut':
      return 'timedout';
    default:
      return 'failed'; // 'failed' | 'interrupted'
  }
}

function git(args: string[]): string | undefined {
  try {
    return (
      execFileSync('git', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

function detectCiRunUrl(): string | undefined {
  const env = process.env;
  if (env['CI_RUN_URL']) return env['CI_RUN_URL']; // explicit override wins
  // GitHub Actions
  if (env['GITHUB_SERVER_URL'] && env['GITHUB_REPOSITORY'] && env['GITHUB_RUN_ID']) {
    return `${env['GITHUB_SERVER_URL']}/${env['GITHUB_REPOSITORY']}/actions/runs/${env['GITHUB_RUN_ID']}`;
  }
  if (env['CI_JOB_URL']) return env['CI_JOB_URL']; // GitLab CI
  if (env['CIRCLE_BUILD_URL']) return env['CIRCLE_BUILD_URL']; // CircleCI
  if (env['BUILDKITE_BUILD_URL']) return env['BUILDKITE_BUILD_URL']; // Buildkite
  if (env['BUILD_URL']) return env['BUILD_URL']; // Jenkins / TeamCity
  return undefined;
}

/** Per-step JSON: source location + nested title path, so step rows are traceable. */
function stepPayload(step: TestStep): Record<string, unknown> {
  const payload: Record<string, unknown> = { titlePath: step.titlePath() };
  if (step.location) {
    payload['location'] = {
      file: step.location.file,
      line: step.location.line,
      column: step.location.column,
    };
  }
  return payload;
}

function frameworkVersion(): string | undefined {
  try {
    const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version;
  } catch {
    return undefined;
  }
}

/**
 * Playwright reporter that mirrors runs/steps/cases into shared Postgres.
 *
 * Write strategy: step data is buffered in memory per test, then flushed at
 * `onTestEnd` as one transactional batch (one round-trip per test). If Postgres
 * is unreachable the batch is spooled to JSONL and a single warning is logged —
 * the test run is never failed by DB problems.
 */
export class QaPostgresReporter implements Reporter {
  private readonly options: ReporterOptions;
  private readonly sessionId = randomUUID();
  private readonly stepsByResult = new WeakMap<TestResult, TestStep[]>();
  private readonly pending: Promise<void>[] = [];

  private ready: Promise<void> = Promise.resolve();
  private config: QaConfig | undefined;
  private db: Db | undefined;
  private pool: pgPoolLike | undefined;
  private dbEnabled = false;

  private spool: Spool | undefined;
  private spoolDir = './test-results/db-spool';
  private warned = false;

  // Session-wide run metadata, resolved in init() only when DB logging is on
  // (avoids spawning git when there's nothing to write).
  private env = 'local';
  private branch: string | undefined;
  private commitSha: string | undefined;
  private ciRunUrl: string | undefined;
  private frameworkVer: string | undefined;

  constructor(options: ReporterOptions = {}) {
    this.options = options;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.checkStandards(suite); // fail fast before any DB work or test execution
    this.ready = this.init();
  }

  /**
   * Startup standards gate: refuse the run if any test lacks a @tc: id, or if a
   * @tc: id is reused across distinct tests. (Tests fan out across projects, so
   * we dedupe by source location before judging a collision.) Errors point at
   * file:line. The per-test fixture guard is the second line of defence.
   */
  private checkStandards(suite: Suite): void {
    const missing = new Map<string, TestCase>();
    const byId = new Map<string, Map<string, TestCase>>();

    for (const test of suite.allTests()) {
      const key = `${test.location.file}:${test.location.line}`;
      const id = this.caseId(test);
      if (!id) {
        missing.set(key, test);
        continue;
      }
      let locations = byId.get(id);
      if (!locations) {
        locations = new Map();
        byId.set(id, locations);
      }
      locations.set(key, test);
    }

    const list = (tests: Iterable<TestCase>): string =>
      [...tests].map((t) => `  ${t.location.file}:${t.location.line} — ${t.title}`).join('\n');

    const problems: string[] = [];
    if (missing.size > 0) {
      problems.push(`Tests missing a @tc: annotation:\n${list(missing.values())}`);
    }
    for (const [id, locations] of byId) {
      if (locations.size > 1) {
        problems.push(`@tc:${id} is reused by ${locations.size} tests:\n${list(locations.values())}`);
      }
    }
    if (problems.length > 0) {
      throw new Error(`[qa] standards check failed:\n\n${problems.join('\n\n')}\n`);
    }
  }

  private async init(): Promise<void> {
    const resolved = await loadConfig(
      this.options.configPath ? { path: this.options.configPath } : {},
    );
    this.config = resolved.config;
    this.dbEnabled = resolved.dbLoggingEnabled;
    this.spoolDir = resolved.config.spoolDir;

    if (!this.dbEnabled || !resolved.databaseUrl) return;

    this.env = process.env['QA_ENV'] ?? 'local';
    this.branch = process.env['QA_BRANCH'] ?? git(['rev-parse', '--abbrev-ref', 'HEAD']);
    this.commitSha = process.env['QA_COMMIT_SHA'] ?? git(['rev-parse', 'HEAD']);
    this.ciRunUrl = detectCiRunUrl();
    this.frameworkVer = frameworkVersion();

    const created = createDb(resolved.databaseUrl);
    this.db = created.db;
    this.pool = created.pool;

    try {
      await this.db
        .insert(teams)
        .values({
          id: this.config.team.id,
          name: this.config.team.name,
          slackChannel: this.config.team.slackChannel ?? null,
          oncall: this.config.team.oncall ?? null,
        })
        .onConflictDoUpdate({
          target: teams.id,
          set: {
            name: this.config.team.name,
            slackChannel: this.config.team.slackChannel ?? null,
            oncall: this.config.team.oncall ?? null,
          },
        });
    } catch (err) {
      this.warnOnce(err);
    }
  }

  onStepEnd(_test: TestCase, result: TestResult, step: TestStep): void {
    // Only user-marked test.step() blocks become rows — not every PW action.
    if (step.category !== 'test.step') return;
    const list = this.stepsByResult.get(result) ?? [];
    list.push(step);
    this.stepsByResult.set(result, list);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.pending.push(this.flush(test, result));
  }

  async onEnd(_result: FullResult): Promise<void> {
    await this.ready;
    await Promise.allSettled(this.pending);
    if (this.pool) await this.pool.end().catch(() => undefined);
  }

  private caseId(test: TestCase): string | undefined {
    const tag = test.tags.find((t) => t.startsWith('@tc:'));
    return tag?.slice('@tc:'.length) || undefined;
  }

  private async flush(test: TestCase, result: TestResult): Promise<void> {
    await this.ready;
    if (!this.config) return;

    const caseId = this.caseId(test);
    if (!caseId) return; // runtime guard rejects these before they run

    const now = new Date();
    const runId = randomUUID(); // stamped here so a spooled run replays idempotently
    const stepList = this.stepsByResult.get(result) ?? [];
    const projectName = test.parent.project()?.name ?? 'web';

    const caseRow = {
      id: caseId,
      title: test.title,
      filePath: test.location.file,
      ownerTeam: this.config.team.id,
      tags: test.tags,
      lastSeenAt: now,
    };

    const runRow = {
      id: runId,
      caseId,
      status: mapStatus(result.status),
      startedAt: result.startTime,
      durationMs: Math.round(result.duration),
      retry: result.retry,
      project: projectName,
      env: this.env,
      branch: this.branch ?? null,
      commitSha: this.commitSha ?? null,
      ciRunUrl: this.ciRunUrl ?? null,
      workerIndex: result.workerIndex,
      frameworkVer: this.frameworkVer ?? null,
    };

    const stepRows = stepList.map((s, i) => ({
      name: s.title,
      status: s.error ? 'failed' : 'passed',
      durationMs: Math.round(s.duration),
      ordinal: i,
      errorMessage: s.error?.message ?? null,
      errorStack: s.error?.stack ?? null,
      payload: stepPayload(s),
    }));

    if (!this.dbEnabled || !this.db) return;

    try {
      await this.db.transaction(async (tx) => {
        await tx
          .insert(cases)
          .values(caseRow)
          .onConflictDoUpdate({
            target: cases.id,
            set: {
              title: caseRow.title,
              filePath: caseRow.filePath,
              ownerTeam: caseRow.ownerTeam,
              tags: caseRow.tags,
              lastSeenAt: now,
              archivedAt: null,
            },
          });
        await tx.insert(runs).values(runRow);
        if (stepRows.length > 0) {
          await tx.insert(steps).values(stepRows.map((s) => ({ ...s, runId })));
        }
      });
    } catch (err) {
      this.warnOnce(err);
      this.spool ??= new Spool(this.spoolDir, this.sessionId);
      this.spool.write({ case: caseRow, run: runRow, steps: stepRows });
    }
  }

  private warnOnce(err: unknown): void {
    if (this.warned) return;
    this.warned = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[qa] Postgres unreachable — spooling run data to ${this.spoolDir} ` +
        `(replay later with \`qa db reconcile\`). Tests unaffected. (${msg})`,
    );
  }
}

interface pgPoolLike {
  end(): Promise<void>;
}

export default QaPostgresReporter;
