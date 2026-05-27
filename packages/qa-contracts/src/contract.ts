import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Pairs the request and response schemas for one API operation. A single
 * Contract is the source of truth for both functional tests (validate the
 * response) and k6 (validate the payloads it generates).
 */
export interface Contract<TReq extends z.ZodType, TRes extends z.ZodType> {
  name: string;
  method: HttpMethod;
  path: string;
  request: TReq;
  response: TRes;
}

export function defineContract<TReq extends z.ZodType, TRes extends z.ZodType>(
  contract: Contract<TReq, TRes>,
): Contract<TReq, TRes> {
  return contract;
}

/** TS type of a contract's request body. */
export type RequestOf<C> = C extends Contract<infer R, z.ZodType> ? z.infer<R> : never;
/** TS type of a contract's response body. */
export type ResponseOf<C> = C extends Contract<z.ZodType, infer R> ? z.infer<R> : never;
