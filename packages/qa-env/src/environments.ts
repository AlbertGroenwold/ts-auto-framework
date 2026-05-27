import { z } from 'zod';

/** Well-known deployment targets, shared by qa-core and the k6 stack. */
export const ENVIRONMENTS = ['local', 'ci', 'staging', 'prod-smoke'] as const;

export const environmentSchema = z.enum(ENVIRONMENTS);
export type Environment = z.infer<typeof environmentSchema>;

/** Resolve the active environment from `QA_ENV`, defaulting to 'local'. */
export function currentEnvironment(): Environment {
  return environmentSchema.catch('local').parse(process.env['QA_ENV']);
}
