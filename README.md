# qa-framework

A TypeScript test framework for multi-team organisations, built on **Playwright Test** with first-class **Postgres-backed traceability** and **enforced standards**. Published as a small set of packages each team installs in their own repo.

> **Status:** Design ratified, v1 implementation not yet started. See [Roadmap](#roadmap).

---

## Table of contents

1. [Why this exists](#why-this-exists)
2. [Goals (in priority order)](#goals-in-priority-order)
3. [What's in scope (and what isn't)](#whats-in-scope-and-what-isnt)
4. [High-level architecture](#high-level-architecture)
5. [Packages](#packages)
6. [How a team uses it](#how-a-team-uses-it)
7. [Data model](#data-model)
8. [Runtime behaviour](#runtime-behaviour)
9. [Configuration model](#configuration-model)
10. [Reporting](#reporting)
11. [Standards enforcement](#standards-enforcement)
12. [Reuse with the existing k6 framework](#reuse-with-the-existing-k6-framework)
13. [v1 scope and deferred work](#v1-scope-and-deferred-work)
14. [Roadmap](#roadmap)
15. [Glossary](#glossary)

---

## Why this exists

We have multiple teams writing automated tests in slightly different ways. Tooling drift produces three concrete problems:

- **Low confidence** — a green run on Team A's pipeline doesn't mean the same thing as a green run on Team B's, because the setup, retry policy, and reporting differ.
- **No traceability** — there is no single place to ask "how has this test case behaved over the last 30 days, across every run, across every team?"
- **Duplicated effort** — every team rebuilds the same fixtures (auth, request helpers, data setup), and the existing k6 load-testing framework has no shared vocabulary with the functional suites.

The framework's job is to remove those three problems while leaving teams free to write the tests they care about.

## Goals (in priority order)

1. **Confidence** — every test runs through the same orchestration, retry, and reporting paths. A green run means the same thing everywhere.
2. **Traceability** — every test case, run, and step is queryable in a shared Postgres database. Trends across teams, environments, and framework versions are first-class.
3. **Speed** — explicitly *not* a v1 goal. We will optimise after confidence and traceability are paying off.

## What's in scope (and what isn't)

**In scope**

- Web UI testing (Playwright)
- API testing (Playwright `request` fixture)
- Database-backed run logging and trend storage
- Multi-team standards enforcement (lint + runtime checks + base classes)
- HTML reports + Postgres reporter
- Mobile testing via Appium (phase 2 — the runtime is reserved)

**Out of scope (now)**

- Load testing — stays in the existing **k6** framework. We share contracts and env config with it, but we do not replace it.
- A custom dashboard UI — Postgres is the data layer; dashboards are a follow-on project.
- Hosted report serving — HTML reports stay as CI artefacts in v1.

## High-level architecture

```
                         ┌──────────────────────────────────────┐
                         │           Shared Postgres            │
                         │       (schema `qa`, all teams)       │
                         └──────────────────────────────────────┘
                                          ▲
                                          │ writes (buffered per test)
                                          │
   ┌──────────────────┐    installs    ┌──┴────────────────────┐
   │ Team A's repo    │ ─────────────▶ │ @<org>/qa-core        │
   │   tests/*.spec   │                │  Playwright reporter  │
   │   qa.config.ts   │                │  fixtures, base cls   │
   └──────────────────┘                │  migrations + CLI     │
                                       │  zod config loader    │
   ┌──────────────────┐                └──┬────────────────────┘
   │ Team B's repo    │ ─────────────▶    │
   │   …              │                   │  also imports
   └──────────────────┘                   ▼
                                       ┌────────────────────────┐
                                       │ @<org>/qa-contracts    │  ← also consumed by
                                       │ @<org>/qa-env          │    the existing k6 repo
                                       │ @<org>/eslint-config-qa│
                                       └────────────────────────┘
```

Key properties:

- **One published framework**, not a "base + testing framework" pair. Standards are enforced by what `qa-core` exposes.
- **Shared Postgres** across all teams so trend queries work without ETL.
- **Code is authoritative** for test cases and team metadata; the database is a mirror that the framework upserts into on each run.
- **Playwright Test is the single runner.** Mobile is added later as a fixture, not as a parallel runner.

## Packages

This repo is a pnpm-workspaces monorepo. The packages it publishes:

| Package | Purpose | Consumed by |
|---|---|---|
| `@<org>/qa-core` | The framework: Playwright reporter, fixtures, base classes, CLI (`qa db migrate`, `qa db reconcile`, `qa lint`), migrations, zod config loader. | Every team's test repo. |
| `@<org>/qa-contracts` | Shared zod schemas for API request/response shapes. | Team test repos **and** the existing k6 repo. |
| `@<org>/qa-env` | Shared environment config: env URLs, credential shapes, well-known service identifiers. | Team test repos **and** the existing k6 repo. |
| `@<org>/eslint-config-qa` | ESLint rules: naming conventions, banned imports, file placement, required JSDoc. | Every team's test repo (extended in their `.eslintrc`). |

Each package versions independently (Changesets). `qa-core` is the only one with breaking-change discipline tied to the Postgres schema.

## How a team uses it

> **Copy-paste starter:** [`examples/starter/`](./examples/starter/). **Full walkthrough:** [docs/getting-started.md](./docs/getting-started.md).

1. **Install:**
   ```bash
   pnpm add -D @<org>/qa-core @<org>/qa-contracts @<org>/qa-env @<org>/eslint-config-qa
   ```
2. **Configure (`qa.config.ts` at repo root):**
   ```ts
   import { defineConfig } from '@<org>/qa-core';

   export default defineConfig({
     team: {
       id: 'web-checkout',
       name: 'Checkout',
       slackChannel: '#qa-checkout',
       oncall: 'jane@example.com',
     },
     toggles: {
       dbLogging: true,    // auto-disabled if DATABASE_URL is unset
       htmlReport: true,
     },
   });
   ```
3. **Write tests** using the framework's helpers and the `@tc:` annotation:
   ```ts
   import { test, expect } from '@<org>/qa-core';

   test('logs in with valid credentials', { tag: ['@tc:LOGIN-001'] }, async ({ page }) => {
     await test.step('open login page', async () => {
       await page.goto('/login');
     });
     await test.step('submit credentials', async () => {
       await page.getByLabel('Email').fill('demo@example.com');
       await page.getByLabel('Password').fill('hunter2');
       await page.getByRole('button', { name: 'Sign in' }).click();
     });
     await expect(page).toHaveURL('/dashboard');
   });
   ```
4. **Run** with the team's normal Playwright invocation:
   ```bash
   pnpm exec playwright test
   ```
   The framework auto-installs its custom reporter and DB logger. If `DATABASE_URL` is set, runs/steps/cases are upserted into Postgres; otherwise DB logging is silently skipped.

## Data model

The shared Postgres uses schema `qa` with four tables:

```sql
qa.teams
  id            text PK              -- e.g. 'web-checkout'
  name          text NOT NULL
  slack_channel text
  oncall        text
  created_at    timestamptz NOT NULL

qa.cases
  id            text PK              -- e.g. 'LOGIN-001', from @tc annotation
  title         text NOT NULL
  file_path     text NOT NULL
  owner_team    text NOT NULL  FK -> qa.teams(id)
  tags          text[]
  first_seen_at timestamptz NOT NULL
  last_seen_at  timestamptz NOT NULL
  archived_at   timestamptz NULL     -- soft-archive for deprecated cases

qa.runs
  id            uuid PK
  case_id       text NOT NULL  FK -> qa.cases(id)
  status        text NOT NULL        -- passed | failed | skipped | timedout
  started_at    timestamptz NOT NULL
  duration_ms   int  NOT NULL
  retry         int  NOT NULL DEFAULT 0
  project       text NOT NULL        -- 'web' | 'api' | 'mobile' (phase 2)
  env           text NOT NULL        -- 'ci' | 'staging' | 'prod-smoke' | ...
  branch        text
  commit_sha    text
  ci_run_url    text                 -- one-click jump from dashboard to CI
  worker_index  int
  framework_ver text                 -- regression hunting after upgrades

qa.steps
  id            uuid PK
  run_id        uuid NOT NULL  FK -> qa.runs(id)
  name          text NOT NULL
  status        text NOT NULL
  duration_ms   int  NOT NULL
  ordinal       int  NOT NULL        -- order within run
  error_message text
  error_stack   text
  payload       jsonb                -- request/response, screenshot refs, etc.
```

**Lifecycle:**

- A test case row is **upserted** on every run from the `@tc:` annotation + file location. Tests removed from code are not auto-deleted; they're soft-archived when `last_seen_at` falls behind a threshold (configurable, default 30 days).
- A team row is upserted from `qa.config.ts` on every run. Unknown `owner_team` IDs fail fast at startup.
- Steps correspond to **user-marked `test.step()` blocks** only — not every Playwright action. This keeps row volume sane and trends meaningful.

**Migrations** live in `qa-core` and are applied out-of-band by central ops via `qa db migrate`. Only backwards-compatible changes are allowed within a major version so older clients keep writing.

## Runtime behaviour

- **Runner:** `npx playwright test` is the single entry point. The framework installs a custom reporter that owns DB writes and propagates `CI_RUN_URL` into `qa.runs`.
- **Write strategy:** Step data accumulates in memory during a test, then `onTestEnd` inserts the run row plus all step rows in **one transactional batch**. One DB round-trip per test, not per step.
- **DB unreachable mid-run:** the run continues, the reporter spools events to `./test-results/db-spool/<run-id>.jsonl`, and a warning is logged. A separate command, `qa db reconcile`, replays spool files into Postgres later. **Tests never fail because the DB is down.**
- **No DB URL configured:** DB logging is silently disabled (the original notes' requirement). HTML report still works.
- **PW defaults** the framework sets (overridable per project): `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`.

## Configuration model

- **`qa.config.ts`** at the consumer's repo root, exporting a typed `defineConfig({...})`. Validated with **zod** at startup; missing required fields fail loudly with a path-pointer error.
- **Secrets** (`DATABASE_URL`, future device-farm tokens, etc.) come from **env vars** and override file values. This keeps secrets out of version control and out of the typed config surface.
- **Toggles** are all in the config object; each can also be flipped by env var (`QA_DB_LOGGING=0`).

Resolution order (highest wins): env var → `qa.config.ts` → framework default.

## Reporting

Two reporters run by default; both are toggleable:

| Reporter | Purpose | Output |
|---|---|---|
| **PW HTML** (built-in) | Human-readable per-run artefact. Includes trace viewer, screenshots, video. | `./playwright-report/` — uploaded as a CI artefact by the team's CI snippet. |
| **`qa-postgres`** (ours) | Long-term traceability and trend queries. | Rows in `qa.runs` / `qa.steps` / `qa.cases`. |

Dashboards (future work) join `qa.runs.ci_run_url` to give one-click "open in CI" links from a trend chart back to the original HTML report.

## Standards enforcement

Three layers, each catching a different class of violation:

1. **`eslint-config-qa`** — static rules: naming conventions, banned imports (no `axios` when `request` fixture exists, etc.), file placement, required `@tc:` annotation present.
2. **Runtime checks at startup** — the framework refuses to run if any test is missing a `@tc:` ID, references an unknown team, or sets disallowed Playwright options. Errors point at file:line.
3. **Opinionated base classes** — `WebBasePage` and (phase 2) `MobileBasePage`. Opt-in, but all documentation and starter templates use them, so they become the path of least resistance.

No single layer is a SPOF; teams who bypass one still hit the others.

## Reuse with the existing k6 framework

The existing k6 framework owns load and performance testing. We do **not** replace it. We do share:

- **`@<org>/qa-contracts`** — zod schemas describing API request/response shapes. k6 scripts import them to validate payloads they generate; functional tests import them to validate responses. One source of truth for "what does this API look like."
- **`@<org>/qa-env`** — env URLs, credential shapes, well-known service identifiers. Both stacks resolve the same env in the same way.

We explicitly **do not** share data-builder code — k6's runtime restrictions make that more pain than payoff.

## v1 scope and deferred work

**v1 (Phase 1)**

- `@<org>/qa-core` with: Playwright reporter, web fixture, API (request) fixture, page-object base class, zod config loader, custom DB reporter writing to `qa.*`, JSONL spool fallback, `qa db migrate` and `qa db reconcile` CLIs.
- `@<org>/qa-contracts` and `@<org>/qa-env` published so k6 can start consuming.
- `@<org>/eslint-config-qa` with the initial rule set.
- Starter template / docs for a team adopting the framework.

**Deferred to phase 2**

- Mobile / Appium fixture and `MobileBasePage`.
- k6 trigger fixture (run k6 from inside a Playwright test, write results to `qa.steps`).
- Hosted dashboard UI (Postgres is the source; the UI is a separate project).
- S3/blob upload of HTML reports.
- OpenAPI-driven codegen for `qa-contracts`.

## Roadmap

| Phase | Contents | Status |
|---|---|---|
| **0 — Design** | This document. Decisions ratified. | Done |
| **1 — v1 framework** | Web + API + DB + reports + standards. See above. | Not started |
| **2 — Mobile + reuse** | Appium fixture, k6 trigger, OpenAPI codegen. | Not started |
| **3 — Dashboards** | Hosted UI on top of `qa.*`, cross-team views. | Not started |

## Glossary

- **`@tc:` annotation** — a Playwright test tag of the form `@tc:LOGIN-001` that supplies the stable test-case ID. Required; the framework refuses to run without one.
- **Case / Run / Step** — the three first-class concepts. A *case* is the test as written; a *run* is one execution of that case in a specific env on a specific commit; a *step* is one user-marked `test.step()` inside a run.
- **Spool file** — a local JSONL fallback the reporter writes to when Postgres is unreachable, replayed later by `qa db reconcile`.
- **Consumer repo** — a team's own repo that installs `qa-core` and writes tests against it. This monorepo is **not** a consumer; it's the publisher.
