import type { Page } from '@playwright/test';
import { WebBasePage } from '@qa/core';

/** Page object for the login screen. Extends the framework's WebBasePage. */
export class LoginPage extends WebBasePage {
  readonly path = '/login';

  constructor(page: Page) {
    super(page);
  }

  async login(email: string, password: string): Promise<void> {
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
  }
}
