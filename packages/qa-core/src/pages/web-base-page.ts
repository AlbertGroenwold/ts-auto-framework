import type { Locator, Page } from '@playwright/test';

/**
 * Opinionated base for web page objects — the base-class layer of standards
 * enforcement. Opt-in, but every template and doc uses it, so it becomes the
 * path of least resistance.
 */
export abstract class WebBasePage {
  protected constructor(protected readonly page: Page) {}

  /** Path relative to the configured baseURL, e.g. '/login'. */
  abstract readonly path: string;

  /** Navigate to this page's {@link path}. */
  async goto(): Promise<void> {
    await this.page.goto(this.path);
  }

  protected locator(selector: string): Locator {
    return this.page.locator(selector);
  }
}
