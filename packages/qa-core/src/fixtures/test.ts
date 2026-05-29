import { test as base, expect } from '@playwright/test';
import { ContractClient } from './api';

interface QaFixtures {
  /** Auto fixture enforcing framework standards at runtime. */
  _qaGuards: void;
  /** Contract-driven API client over Playwright's `request` context. */
  api: ContractClient;
}

/**
 * The framework's `test`. A drop-in for Playwright's, plus an automatic guard
 * that refuses to run any test missing a `@tc:` annotation — the runtime layer
 * of standards enforcement — and an `api` fixture for contract-driven calls.
 */
export const test = base.extend<QaFixtures>({
  _qaGuards: [
    async ({}, use) => {
      const info = base.info();
      const hasTc = info.tags.some((t) => t.startsWith('@tc:'));
      if (!hasTc) {
        throw new Error(
          `Test "${info.title}" is missing a required @tc: annotation. ` +
            `Add one, e.g. test('...', { tag: ['@tc:LOGIN-001'] }, ...).`,
        );
      }
      await use();
    },
    { auto: true },
  ],
  api: async ({ request }, use) => {
    await use(new ContractClient(request));
  },
});

export { expect };
