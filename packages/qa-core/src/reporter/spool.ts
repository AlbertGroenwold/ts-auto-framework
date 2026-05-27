import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** One spooled test record: enough to replay the DB write later. */
export interface SpoolRecord {
  case: Record<string, unknown>;
  run: Record<string, unknown>;
  steps: Record<string, unknown>[];
}

/**
 * Append-only JSONL fallback used when Postgres is unreachable mid-run.
 * Replayed later by `qa db reconcile`. Tests never fail because of this.
 */
export class Spool {
  private readonly file: string;

  constructor(dir: string, sessionId: string) {
    const target = resolve(dir);
    mkdirSync(target, { recursive: true });
    this.file = resolve(target, `${sessionId}.jsonl`);
  }

  write(record: SpoolRecord): void {
    appendFileSync(this.file, `${JSON.stringify(record)}\n`, 'utf8');
  }

  get path(): string {
    return this.file;
  }
}
