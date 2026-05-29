import { test, expect } from '@qa/core';
import { loginContract } from '@qa/contracts';

// Simple checks can use Playwright's built-in `request` fixture directly — no
// axios/fetch. (The eslint preset bans ad-hoc HTTP clients in favour of this.)
test('health endpoint returns ok', { tag: ['@tc:API-HEALTH-001'] }, async ({ request }) => {
  await test.step('GET /health', async () => {
    const res = await request.get('/health');
    expect(res.ok()).toBeTruthy();
  });
});

// Anything tied to a contract should use the `api` fixture: it validates the
// request body, asserts the status, and hands back a response already parsed
// against the contract — so `data` is fully typed and drift is caught early.
test('login returns a token', { tag: ['@tc:LOGIN-002'] }, async ({ api }) => {
  const { data } = await api.call(loginContract, { email: 'user@example.com', password: 'pw' });
  expect(data.token).toBeTruthy();
});
