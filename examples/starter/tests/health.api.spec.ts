import { test, expect } from '@qa/core';

// API test using Playwright's built-in `request` fixture — no axios/fetch.
// (The eslint preset bans ad-hoc HTTP clients in favour of this.)
test('health endpoint returns ok', { tag: ['@tc:API-HEALTH-001'] }, async ({ request }) => {
  await test.step('GET /health', async () => {
    const res = await request.get('/health');
    expect(res.ok()).toBeTruthy();
  });
});
