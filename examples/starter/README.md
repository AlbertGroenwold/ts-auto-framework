# qa-starter

A copy-paste starting point for a team adopting the QA framework. Copy this
directory's files into your own test repo and adjust `qa.config.ts`.

## Layout

```
qa.config.ts          your team identity + toggles (validated at startup)
playwright.config.ts  reporter wiring + framework-recommended defaults
eslint.config.js      the @qa/eslint-config preset
tsconfig.json
.env.example          copy to .env (gitignored)
pages/login.page.ts   example page object (extends WebBasePage)
tests/login.spec.ts   example web test (@tc: + test.step)
tests/health.api.spec.ts  example API test (request fixture)
```

## Quick start

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
cp .env.example .env          # optional — fill in DATABASE_URL to enable run logging
pnpm test                     # = playwright test
pnpm lint                     # = eslint .
```

- **No `DATABASE_URL`?** Tests still run; DB logging is silently skipped and the
  HTML report is produced as usual.
- **`DATABASE_URL` set but DB down mid-run?** Tests still pass; run data is
  spooled to `test-results/db-spool/*.jsonl`. Replay it later with
  `pnpm db:reconcile`.

## Notes

- Inside this monorepo the `@qa/*` deps would be `workspace:*`; the `^0.0.0`
  here is a placeholder for when the packages are published to your registry.
- Schema migrations (`qa db migrate`) are normally run **once by central ops**,
  not per team — your tests just write to the already-migrated tables.

See [../../docs/getting-started.md](../../docs/getting-started.md) for the full guide.
