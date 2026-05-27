import { z } from 'zod';
import { ENVIRONMENTS, type Environment } from './environments';

export const serviceUrlSchema = z.url();

/** A per-environment base-URL map for one service. */
export type ServiceUrls = Record<Environment, string>;

/**
 * Declare a service's base URLs across environments. Validates every entry is a
 * URL so both qa-core and k6 resolve the same address for the same
 * (service, environment) pair — one source of truth for "where does X live".
 */
export function defineServiceUrls(urls: ServiceUrls): ServiceUrls {
  for (const env of ENVIRONMENTS) {
    serviceUrlSchema.parse(urls[env]);
  }
  return urls;
}

/** Resolve a service's base URL for the given environment. */
export function resolveServiceUrl(urls: ServiceUrls, env: Environment): string {
  return urls[env];
}
