# CLAUDE.md

Guidance for Claude Code sessions working in this repo.

## What this repo is

A pnpm-workspaces monorepo that will publish a TypeScript test framework (`@<org>/qa-core`) plus a small set of shared packages (`qa-contracts`, `qa-env`, `eslint-config-qa`) for multi-team adoption. Full design is in [README.md](./README.md); historical reasoning behind every decision is in the user's memory directory.

**Current state:** design ratified, no implementation yet. The only source file is `notes.txt` (the original brief — kept for provenance).

## Read these before suggesting changes

1. [README.md](./README.md) — the canonical design. If a suggestion contradicts it, surface the contradiction explicitly rather than silently revising the design.
2. `notes.txt` — the original brief. Useful for understanding what was *asked for* vs what was *ratified after discussion*. Naming in `notes.txt` is **not** final; the README is.

## Architectural ground rules

These are decided and not up for casual revision:

- **One published framework package**, not a "base + testing framework" split. Teams install one thing.
- **Playwright Test is the sole runner.** Mobile is a deferred fixture, not a parallel runner. Do not propose alternative runners.
- **Shared Postgres** across all teams; schema `qa`; tables `teams`, `cases`, `runs`, `steps`. Code is authoritative for cases and teams (upsert on run).
- **DB writes are buffered per-test and flushed at `onTestEnd`** in one transaction. No per-step round-trips.
- **DB-unreachable behaviour: warn + spool to JSONL, never fail the run.** Tests are first-class; observability degrades gracefully.
- **No DB URL configured → DB logging silently disabled.** This is a feature, not a bug.
- **Three-layer standards enforcement**: eslint config + runtime checks + opinionated base classes. Don't collapse to one layer.
- **k6 reuse is contracts and env only.** Don't propose sharing data builders or replacing k6 for load testing.

## Conventions

- **TypeScript strict mode** everywhere; no `any` without a `// reason:` comment.
- **zod** is the schema/validation library. Use it for config validation and `qa-contracts` schemas.
- **Postgres client**: `drizzle-orm` + `drizzle-kit` for migrations (lighter than Prisma, better SQL transparency). Open to alternatives if a concrete reason surfaces.
- **Package manager**: pnpm. Workspaces in `packages/*`.
- **Versioning**: Changesets, independent per package.
- **Default branch**: `main`.
- **CLI name**: `qa` (e.g. `qa db migrate`, `qa db reconcile`, `qa lint`).
- **Config file**: `qa.config.ts` in consumer repos.
- **Test annotation**: `@tc:<ID>`, e.g. `@tc:LOGIN-001`.

## What's in scope vs deferred

**v1** (ship): web fixture, API (`request`) fixture, page-object base class, Postgres reporter, JSONL spool fallback, migrations CLI, zod config, eslint config.

**Deferred** (don't implement unless asked): Appium fixture, k6 trigger, dashboard UI, S3 report upload, OpenAPI codegen.

If asked to add something deferred, confirm scope before starting — it's almost certainly worth a separate task.

## Working in this repo

- Prefer editing existing files. The only files that exist right now are `README.md`, `CLAUDE.md`, `notes.txt`, and `.gitignore` — there is no scaffolding yet.
- Don't scaffold packages on a whim; ask which package(s) to set up and in what order. The first natural step is `packages/qa-core/` with `package.json` + `tsconfig.json` + an empty entry point.
- **Don't auto-commit.** The user wants to review each step. Run `git status` and surface what's changed; let them tell you when to commit.
- **No backwards-compatibility shims** while there are no consumers — break and rewrite freely.

## Memory

The user maintains structured memory at `C:\Users\ajgro\.claude\projects\C--repos-automation-framework\memory\`. Key entries:

- `project_qa_framework_design.md` — the ratified design in detail, including the *why* behind each decision.
- `user_role.md` — context on the user's role and how to collaborate with them.

Consult these when context is unclear; update them when material decisions change.
