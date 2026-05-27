import { z } from 'zod';
import { isoTimestamp } from '../primitives';
import { defineContract } from '../contract';

/**
 * EXAMPLE contract — shows the pattern; delete once real contracts land.
 * One definition feeds both functional response assertions and k6 payload
 * validation.
 */
export const loginContract = defineContract({
  name: 'login',
  method: 'POST',
  path: '/login',
  request: z.object({
    email: z.email(),
    password: z.string().min(1),
  }),
  response: z.object({
    token: z.string(),
    expiresAt: isoTimestamp,
  }),
});
