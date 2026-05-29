import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { z } from 'zod';
import type { Contract, RequestOf, ResponseOf } from '@qa/contracts';

/** Options for a single contract call. */
export interface CallOptions {
  /**
   * Expected HTTP status. Defaults to "any 2xx". Set this to assert an error
   * path (e.g. `expectStatus: 422` with an RFC-7807 response contract).
   */
  expectStatus?: number;
  /** Extra headers merged over the request context defaults. */
  headers?: Record<string, string>;
}

/** Result of a contract call: the raw response plus the validated body. */
export interface CallResult<C> {
  response: APIResponse;
  data: ResponseOf<C>;
}

/** Methods that carry a JSON body; everything else sends the input as query params. */
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Thin wrapper over Playwright's `request` fixture that drives a {@link Contract}:
 * validates the input against the request schema, issues the call, asserts the
 * status, and validates the response against the response schema — returning a
 * fully-typed body. This is the API half of the framework's fixture layer and
 * the reason contracts are the source of truth for functional tests.
 */
export class ContractClient {
  constructor(private readonly request: APIRequestContext) {}

  async call<C extends Contract<z.ZodType, z.ZodType>>(
    contract: C,
    input: RequestOf<C>,
    options: CallOptions = {},
  ): Promise<CallResult<C>> {
    // Fail fast and loud if the test sends a payload the contract forbids — a
    // bad request body is a test bug, not an endpoint failure.
    const parsedInput = contract.request.parse(input) as Record<string, unknown>;

    const carriesBody = BODY_METHODS.has(contract.method);
    const response = await this.request.fetch(contract.path, {
      method: contract.method,
      headers: options.headers,
      ...(carriesBody ? { data: parsedInput } : { params: toParams(parsedInput) }),
    });

    const expected = options.expectStatus;
    const ok = expected == null ? response.ok() : response.status() === expected;
    if (!ok) {
      const wanted = expected == null ? '2xx' : String(expected);
      throw new Error(
        `${contract.name} (${contract.method} ${contract.path}) expected status ${wanted}, ` +
          `got ${response.status()}. Body: ${await safeBody(response)}`,
      );
    }

    const data = contract.response.parse(await response.json()) as ResponseOf<C>;
    return { response, data };
  }
}

/** Coerce a validated object into Playwright's query-param shape (scalars only). */
function toParams(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
    params[key] =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? value
        : JSON.stringify(value);
  }
  return params;
}

/** Best-effort response body for error messages — never throws. */
async function safeBody(response: APIResponse): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '<unreadable>';
  }
}
