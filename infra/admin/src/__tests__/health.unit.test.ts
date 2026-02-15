import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockEnv, createMockExecutionContext } from './setup';

import worker from '../index';

function makeRequest(path: string): Request {
  return new Request(`https://admin.example.com${path}`);
}

describe('GET /health', () => {
  let env: ReturnType<typeof createMockEnv>;
  const ctx = createMockExecutionContext();

  beforeEach(() => {
    vi.restoreAllMocks();
    env = createMockEnv();
  });

  it('returns 200 with status ok when KV is reachable', async () => {
    const res = await worker.fetch(makeRequest('/health'), env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string; timestamp: number };
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTypeOf('number');
  });

  it('returns 503 when KV is unreachable', async () => {
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('KV down'));

    const res = await worker.fetch(makeRequest('/health'), env, ctx);
    expect(res.status).toBe(503);

    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('degraded');
  });
});
