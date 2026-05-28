import { test, expect } from '@qa/core';
import { LoginPage } from '../pages/login.page';

// The @tc: tag is required — the framework refuses to run a test without one,
// and each test.step() below becomes a row in qa.steps for trend analysis.
test('logs in with valid credentials', { tag: ['@tc:LOGIN-001'] }, async ({ page }) => {
  const login = new LoginPage(page);

  await test.step('open login page', async () => {
    await login.goto();
  });

  await test.step('submit credentials', async () => {
    await login.login('demo@example.com', 'hunter2');
  });

  await expect(page).toHaveURL('/dashboard');
});
