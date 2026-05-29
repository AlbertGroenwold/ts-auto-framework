import type { APIRequestContext, APIResponse } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ContractClient } from './api';

const postContract = {
  name: 'login',
  method: 'POST',
  path: '/login',
  request: z.object({ email: z.email(), password: z.string().min(1) }),
  response: z.object({ token: z.string() }),
} as const;

const getContract = {
  name: 'getUser',
  method: 'GET',
  path: '/user',
  request: z.object({ id: z.string() }),
  response: z.object({ id: z.string(), name: z.string() }),
} as const;

function fakeResponse(opts: { status?: number; body?: unknown }): APIResponse {
  const status = opts.status ?? 200;
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    json: async () => opts.body ?? {},
    text: async () => JSON.stringify(opts.body ?? {}),
  } as unknown as APIResponse;
}

function fakeCtx(response: APIResponse): { ctx: APIRequestContext; fetch: ReturnType<typeof vi.fn> } {
  const fetch = vi.fn(async () => response);
  return { ctx: { fetch } as unknown as APIRequestContext, fetch };
}

describe('ContractClient', () => {
  it('validates the response and returns typed data on a 2xx', async () => {
    const { ctx, fetch } = fakeCtx(fakeResponse({ body: { token: 'abc' } }));
    const api = new ContractClient(ctx);

    const { data } = await api.call(postContract, { email: 'a@b.com', password: 'pw' });

    expect(data.token).toBe('abc');
    expect(fetch).toHaveBeenCalledWith('/login', expect.objectContaining({ method: 'POST' }));
  });

  it('sends body methods as JSON data', async () => {
    const { ctx, fetch } = fakeCtx(fakeResponse({ body: { token: 'abc' } }));
    await new ContractClient(ctx).call(postContract, { email: 'a@b.com', password: 'pw' });

    const opts = fetch.mock.calls[0]![1] as { data?: unknown; params?: unknown };
    expect(opts.data).toEqual({ email: 'a@b.com', password: 'pw' });
    expect(opts.params).toBeUndefined();
  });

  it('sends non-body methods as query params', async () => {
    const { ctx, fetch } = fakeCtx(fakeResponse({ body: { id: '1', name: 'x' } }));
    await new ContractClient(ctx).call(getContract, { id: '1' });

    const opts = fetch.mock.calls[0]![1] as { data?: unknown; params?: unknown };
    expect(opts.params).toEqual({ id: '1' });
    expect(opts.data).toBeUndefined();
  });

  it('throws on an invalid request body before calling fetch', async () => {
    const { ctx, fetch } = fakeCtx(fakeResponse({ body: { token: 'abc' } }));
    const api = new ContractClient(ctx);

    await expect(api.call(postContract, { email: 'not-email', password: 'pw' })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts a matching expectStatus for error paths', async () => {
    const errorContract = { ...postContract, response: z.object({ title: z.string() }) };
    const { ctx } = fakeCtx(fakeResponse({ status: 422, body: { title: 'nope' } }));

    const { response, data } = await new ContractClient(ctx).call(
      errorContract,
      { email: 'a@b.com', password: 'pw' },
      { expectStatus: 422 },
    );

    expect(response.status()).toBe(422);
    expect(data.title).toBe('nope');
  });

  it('throws with a descriptive message on an unexpected status', async () => {
    const { ctx } = fakeCtx(fakeResponse({ status: 500, body: { error: 'boom' } }));

    await expect(
      new ContractClient(ctx).call(postContract, { email: 'a@b.com', password: 'pw' }),
    ).rejects.toThrow(/expected status 2xx, got 500/);
  });
});
