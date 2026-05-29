#!/usr/bin/env node
import { readFileSync, readdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, isNull, lt } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config/load';
import { createDb, type Db } from '../db/client';
import { cases, runs, steps } from '../db/schema';
import type { SpoolRecord } from '../reporter/spool';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Load config and require a DATABASE_URL (the DB commands are useless without one). */
async function loadWithDb(): Promise<{ databaseUrl: string; spoolDir: string }> {
  const { config, databaseUrl } = await loadConfig();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set — nothing to do.');
  }
  return { databaseUrl, spoolDir: config.spoolDir };
}

/** Apply pending migrations from the bundled `drizzle/` folder. */
async function cmdMigrate(): Promise<void> {
  const { databaseUrl } = await loadWithDb();
  const { db, pool } = createDb(databaseUrl);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log('[qa] migrations applied.');
  } finally {
    await pool.end();
  }
}

/** Replay spooled JSONL files (written when the DB was unreachable) into Postgres. */
async function cmdReconcile(): Promise<void> {
  const { databaseUrl, spoolDir } = await loadWithDb();
  const dir = resolve(spoolDir);

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    console.log(`[qa] no spool directory at ${dir} — nothing to reconcile.`);
    return;
  }
  if (files.length === 0) {
    console.log('[qa] no spool files to reconcile.');
    return;
  }

  const { db, pool } = createDb(databaseUrl);
  try {
    let replayed = 0;
    let skipped = 0;
    for (const file of files) {
      const full = resolve(dir, file);
      const lines = readFileSync(full, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        const rec = JSON.parse(line) as SpoolRecord;
        if (await replay(db, rec)) replayed += 1;
        else skipped += 1;
      }
      renameSync(full, `${full}.done`);
    }
    const tail = skipped > 0 ? `, ${skipped} already present (skipped)` : '';
    console.log(`[qa] reconciled ${replayed} run(s) from ${files.length} spool file(s)${tail}.`);
  } finally {
    await pool.end();
  }
}

/**
 * Replay one spooled record. Idempotent: the run id is stamped at spool time, so
 * re-running after a partial failure inserts the run once (onConflictDoNothing)
 * and skips its steps if it was already written. Returns false when skipped.
 */
async function replay(db: Db, rec: SpoolRecord): Promise<boolean> {
  const c = rec.case;
  const r = rec.run;
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx
      .insert(cases)
      .values({
        id: String(c['id']),
        title: String(c['title']),
        filePath: String(c['filePath']),
        ownerTeam: String(c['ownerTeam']),
        tags: (c['tags'] as string[] | undefined) ?? null,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({ target: cases.id, set: { lastSeenAt: now, archivedAt: null } });

    const insertedRun = await tx
      .insert(runs)
      .values({
        id: String(r['id']),
        caseId: String(r['caseId']),
        status: String(r['status']),
        startedAt: new Date(String(r['startedAt'])),
        durationMs: Number(r['durationMs']),
        retry: Number(r['retry'] ?? 0),
        project: String(r['project']),
        env: String(r['env']),
        branch: (r['branch'] as string | null) ?? null,
        commitSha: (r['commitSha'] as string | null) ?? null,
        ciRunUrl: (r['ciRunUrl'] as string | null) ?? null,
        workerIndex: r['workerIndex'] == null ? null : Number(r['workerIndex']),
        frameworkVer: (r['frameworkVer'] as string | null) ?? null,
      })
      .onConflictDoNothing({ target: runs.id })
      .returning({ id: runs.id });

    // Run already replayed in an earlier pass — don't double-insert its steps.
    if (insertedRun.length === 0) return false;

    const runId = insertedRun[0]!.id;
    if (rec.steps.length > 0) {
      await tx.insert(steps).values(
        rec.steps.map((s) => ({
          runId,
          name: String(s['name']),
          status: String(s['status']),
          durationMs: Number(s['durationMs']),
          ordinal: Number(s['ordinal']),
          errorMessage: (s['errorMessage'] as string | null) ?? null,
          errorStack: (s['errorStack'] as string | null) ?? null,
          payload: s['payload'] ?? null,
        })),
      );
    }
    return true;
  });
}

/** Soft-archive cases not seen in the last `caseArchiveThresholdDays` days. */
async function cmdArchive(): Promise<void> {
  const { config, databaseUrl } = await loadConfig();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set — nothing to do.');
  }
  const days = config.caseArchiveThresholdDays;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const { db, pool } = createDb(databaseUrl);
  try {
    const archived = await db
      .update(cases)
      .set({ archivedAt: new Date() })
      .where(and(isNull(cases.archivedAt), lt(cases.lastSeenAt, cutoff)))
      .returning({ id: cases.id });
    console.log(`[qa] archived ${archived.length} case(s) not seen in ${days} day(s).`);
  } finally {
    await pool.end();
  }
}

function cmdLint(): void {
  console.log(
    '[qa] lint: add `@qa/eslint-config` to your eslint.config and run `eslint .` ' +
      '(qa lint passthrough not yet implemented).',
  );
}

async function main(): Promise<void> {
  const [group, action] = process.argv.slice(2);
  const cmd = `${group ?? ''} ${action ?? ''}`.trim();
  switch (cmd) {
    case 'db migrate':
      await cmdMigrate();
      break;
    case 'db reconcile':
      await cmdReconcile();
      break;
    case 'db archive':
      await cmdArchive();
      break;
    case 'lint':
      cmdLint();
      break;
    default:
      console.log('Usage: qa <db migrate | db reconcile | db archive | lint>');
      process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
