# Getting started

How a team adopts the QA framework in its own test repo. For the design and
rationale, see the [root README](../README.md); for files you can copy, see
[`examples/starter/`](../examples/starter/).

## 1. Prerequisites

- Node 20+ and pnpm.
- The `@qa/*` packages available to your repo (published to your registry, or
  `workspace:*` inside this monorepo).
- A shared `DATABASE_URL` if you want run logging — otherwise it's skipped.

## 2. Install

```bash
pnpm add -D @qa/core @qa/contracts @qa/env @qa/eslint-config @playwright/test
pnpm exec playwright install --with-deps chromium
```

## 3. Configure `qa.config.ts`

At your repo root. Validated with zod at startup — missing/invalid fields fail
loudly with a path-pointed error.

```ts
import { defineConfig } from '@qa/core';

export default defineConfig({
  team: { id: 'web-checkout', name: 'Checkout', oncall: 'jane@example.com' },
  toggles: { dbLogging: true, htmlReport: true },
});
```

| Field | Default | Notes |
|---|---|---|
| `team.id` / `team.name` | — (required) | Upserted into `qa.teams` on every run. |
| `team.slackChannel` / `team.oncall` | optional | `oncall` must be an email. |
| `toggles.dbLogging` | `true` | Auto-disabled when `DATABASE_URL` is unset. |
| `toggles.htmlReport` | `true` | |
| `reportDir` | `./playwright-report` | |
| `spoolDir` | `./test-results/db-spool` | Where DB-down runs are spooled. |
| `caseArchiveThresholdDays` | `30` | Stale-case archive window. |

## 4. Wire Playwright

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [
    ['html'],
    ['@qa/core/reporter'], // writes runs/steps/cases to Postgres; no-ops without DATABASE_URL
  ],
});
```

The reporter reads `qa.config.ts` itself, derives git/CI metadata, and buffers
each test's steps to flush in **one transaction at `onTestEnd`**.

## 5. Wire ESLint

```js
// eslint.config.js
import qa from '@qa/eslint-config';
export default qa;
```

This enforces naming, bans ad-hoc HTTP clients (use the `request` fixture),
blocks `test.only`/`describe.only`, and requires a `@tc:` tag on every test —
the static mirror of the runtime guard.

## 6. Write tests

```ts
import { test, expect } from '@qa/core';

test('logs in', { tag: ['@tc:LOGIN-001'] }, async ({ page }) => {
  await test.step('open login page', async () => {
    await page.goto('/login');
  });
  await expect(page).toHaveURL('/dashboard');
});
```

- **`@tc:<ID>` is mandatory.** Both eslint and the runtime refuse a test without one.
- **Only `test.step()` blocks become `qa.steps` rows** — not every action — so
  trends stay meaningful.
- Page objects extend `WebBasePage` (see the starter's `pages/login.page.ts`).

## 7. Run

```bash
pnpm exec playwright test
```

## 8. Database behaviour

| Situation | What happens |
|---|---|
| No `DATABASE_URL` | DB logging silently disabled. HTML report still produced. |
| DB reachable | `runs` + `steps` inserted per test; `cases`/`teams` upserted. |
| DB down mid-run | A warning is logged once; run data spools to `spoolDir`. **Tests never fail because of the DB.** |
| After an outage | `qa db reconcile` replays spool files (idempotently) into Postgres. |

Schema migrations live in `@qa/core` and are applied out-of-band by central ops
with `qa db migrate` — individual teams don't migrate.

## 9. Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Enables run logging. Secret — never commit it. |
| `QA_ENV` | Stored on `qa.runs.env` (e.g. `ci`, `staging`). Defaults to `local`. |
| `QA_DB_LOGGING` | `0`/`1` to force logging off/on (overrides config). |
| `QA_BRANCH` / `QA_COMMIT_SHA` | Override the auto-detected git metadata. |
| `CI_RUN_URL` | One-click link from a future dashboard back to CI. Auto-detected on GitHub Actions. |

## 10. CI (GitHub Actions)

```yaml
name: qa
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.QA_DATABASE_URL }}
      QA_ENV: ci
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report
      - if: always()
        run: pnpm exec qa db reconcile   # flush anything spooled if the DB blipped
```

`CI_RUN_URL` is auto-derived from the `GITHUB_*` env vars, so each run links
back to its Actions page.

## Troubleshooting

- **"Test … is missing a required @tc: annotation"** — add `{ tag: ['@tc:…'] }`.
- **"Invalid qa.config.ts"** — the message points at the offending field path.
- **Rows not appearing** — check `DATABASE_URL` is set and `QA_DB_LOGGING` isn't
  `0`; look for the one-time "Postgres unreachable" warning and spool files.
