import { z } from 'zod';

/** Common zod building blocks reused across API contracts. */

/** ISO-8601 timestamp string, e.g. '2026-05-27T10:00:00Z'. */
export const isoTimestamp = z.iso.datetime();

/** UUID identifier. */
export const uuid = z.uuid();

/** Pagination envelope shared by list endpoints. */
export const pagination = z.object({
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type Pagination = z.infer<typeof pagination>;

/** RFC 7807-style error body — one shape for "what an error looks like". */
export const problemDetails = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof problemDetails>;
