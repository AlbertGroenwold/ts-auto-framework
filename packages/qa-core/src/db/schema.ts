import { integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** All framework tables live under the shared `qa` schema. */
export const qa = pgSchema('qa');

export const teams = qa.table('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slackChannel: text('slack_channel'),
  oncall: text('oncall'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cases = qa.table('cases', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  filePath: text('file_path').notNull(),
  ownerTeam: text('owner_team')
    .notNull()
    .references(() => teams.id),
  tags: text('tags').array(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  /** Soft-archive marker for cases no longer present in code. */
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const runs = qa.table('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id),
  status: text('status').notNull(), // passed | failed | skipped | timedout
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  durationMs: integer('duration_ms').notNull(),
  retry: integer('retry').notNull().default(0),
  project: text('project').notNull(), // 'web' | 'api' | 'mobile' (phase 2)
  env: text('env').notNull(), // 'ci' | 'staging' | 'prod-smoke' | ...
  branch: text('branch'),
  commitSha: text('commit_sha'),
  ciRunUrl: text('ci_run_url'),
  workerIndex: integer('worker_index'),
  frameworkVer: text('framework_ver'),
});

export const steps = qa.table('steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id),
  name: text('name').notNull(),
  status: text('status').notNull(),
  durationMs: integer('duration_ms').notNull(),
  ordinal: integer('ordinal').notNull(), // order within run
  errorMessage: text('error_message'),
  errorStack: text('error_stack'),
  payload: jsonb('payload'), // request/response, screenshot refs, etc.
});
