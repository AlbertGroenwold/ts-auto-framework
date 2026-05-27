import { z } from 'zod';

/**
 * Credential *shapes* shared across stacks. The values come from env vars /
 * secret stores at runtime — these schemas describe the shape, never hold a secret.
 */

export const basicAuthSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type BasicAuth = z.infer<typeof basicAuthSchema>;

export const bearerTokenSchema = z.object({
  token: z.string().min(1),
});
export type BearerToken = z.infer<typeof bearerTokenSchema>;

export const apiKeySchema = z.object({
  header: z.string().min(1).default('x-api-key'),
  key: z.string().min(1),
});
export type ApiKey = z.infer<typeof apiKeySchema>;
