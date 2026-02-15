import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { createMockEnv, createMockExecutionContext, type MockKVEntry } from './setup';

import worker from '../index';

// Polyfill crypto.subtle.timingSafeEqual for Node.js test environment
beforeAll(() => {
  if (!crypto.subtle.timingSafeEqual) {
    (crypto.subtle as Record<string, unknown>).timingSafeEqual = (
      a: ArrayBuffer,
      b: ArrayBuffer,
    ) => {
      const viewA = new Uint8Array(a);
      const viewB = new Uint8Array(b);
      if (viewA.length !== viewB.length) return false;
      let result = 0;
      for (let i = 0; i < viewA.length; i++) {
        result |= viewA[i] ^ viewB[i];
      }
      return result === 0;
    };
  }
});

function makeRequest(
  path: string,
  method = 'GET',
  body?: unknown,
  headers?: Record<string, string>,
): Request {
  const init: RequestInit = {
    method,
    headers: {
      origin: 'https://admin.example.com',
      'content-type': 'application/json',
      ...headers,
    },
  };
  if (body) init.body = JSON.stringify(body);
  return new Request(`https://admin.example.com${path}`, init);
}

function makeGetRequest(path: string): Request {
  return new Request(`https://admin.example.com${path}`);
}

describe('handleGetManifest — KV lookup', () => {
  const ctx = createMockExecutionContext();

  it('returns manifest from KV', async () => {
    const kvStore = new Map<string, MockKVEntry>();
    kvStore.set('manifest:0.1.0-1', {
      value: JSON.stringify({ buildId: '0.1.0-1', version: '0.1.0' }),
    });
    const env = createMockEnv({ kvStore });

    const res = await worker.fetch(makeGetRequest('/api/builds/0.1.0-1/manifest'), env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { buildId: string };
    expect(body.buildId).toBe('0.1.0-1');
  });

  it('returns 404 when manifest not in KV', async () => {
    const env = createMockEnv();
    const res = await worker.fetch(makeGetRequest('/api/builds/0.1.0-1/manifest'), env, ctx);
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid build ID format', async () => {
    const env = createMockEnv();
    const res = await worker.fetch(makeGetRequest('/api/builds/invalid/manifest'), env, ctx);
    expect(res.status).toBe(400);
  });
});

describe('handleDeploy — 2s poll delay', () => {
  let kvStore: Map<string, MockKVEntry>;
  let env: ReturnType<typeof createMockEnv>;
  const ctx = createMockExecutionContext();

  beforeEach(() => {
    vi.restoreAllMocks();
    kvStore = new Map();
    env = createMockEnv({ kvStore });
  });

  it('completes deploy dispatch even when workflow poll returns null', async () => {
    vi.useFakeTimers();
    // First fetch = dispatch (204), second fetch = poll runs (error)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = worker.fetch(
      makeRequest('/api/deploy', 'POST', { setAsDefault: true }),
      env,
      ctx,
    );

    // Advance past the 2s poll delay
    await vi.advanceTimersByTimeAsync(2500);
    const res = await promise;

    expect(res.status).toBe(202);
    const body = (await res.json()) as { dispatched: boolean; runUrl: string | null };
    expect(body.dispatched).toBe(true);
    expect(body.runUrl).toBeNull();

    vi.useRealTimers();
  });

  it('returns runUrl when workflow poll succeeds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workflow_runs: [{ html_url: 'https://github.com/org/repo/actions/runs/999' }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const promise = worker.fetch(
      makeRequest('/api/deploy', 'POST', { setAsDefault: false }),
      env,
      ctx,
    );

    await vi.advanceTimersByTimeAsync(2500);
    const res = await promise;

    expect(res.status).toBe(202);
    const body = (await res.json()) as { runUrl: string };
    expect(body.runUrl).toBe('https://github.com/org/repo/actions/runs/999');

    vi.useRealTimers();
  });

  it('returns 502 when GitHub dispatch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    );

    const res = await worker.fetch(
      makeRequest('/api/deploy', 'POST', { setAsDefault: true }),
      env,
      ctx,
    );

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('github_api_error');
  });
});

describe('audit cursor pagination', () => {
  let env: ReturnType<typeof createMockEnv>;
  const ctx = createMockExecutionContext();

  beforeEach(() => {
    env = createMockEnv();
  });

  it('passes cursor parameter to KV list', async () => {
    (env.ROUTING_CONFIG.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      keys: [],
      list_complete: true,
      cursor: '',
    });

    await worker.fetch(makeGetRequest('/api/audit?cursor=some-cursor-value'), env, ctx);

    expect(env.ROUTING_CONFIG.list).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'some-cursor-value' }),
    );
  });

  it('returns cursor when list is not complete', async () => {
    (env.ROUTING_CONFIG.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      keys: [
        {
          name: 'audit:0000:id1',
          metadata: {
            id: 'id1',
            timestamp: '2026-01-01T00:00:00Z',
            action: 'config_updated',
            source: 'dashboard',
          },
        },
      ],
      list_complete: false,
      cursor: 'next-page-cursor',
    });

    const res = await worker.fetch(makeGetRequest('/api/audit?limit=1'), env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: unknown[]; cursor?: string };
    expect(body.cursor).toBe('next-page-cursor');
  });

  it('omits cursor when list is complete', async () => {
    (env.ROUTING_CONFIG.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      keys: [],
      list_complete: true,
      cursor: '',
    });

    const res = await worker.fetch(makeGetRequest('/api/audit'), env, ctx);
    const body = (await res.json()) as { cursor?: string };
    expect(body.cursor).toBeUndefined();
  });

  it('passes garbage cursor to KV without crashing', async () => {
    (env.ROUTING_CONFIG.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      keys: [],
      list_complete: true,
      cursor: '',
    });

    const res = await worker.fetch(makeGetRequest('/api/audit?cursor=!@%23$%25^&*'), env, ctx);
    expect(res.status).toBe(200);
  });

  it('clamps limit to valid range', async () => {
    (env.ROUTING_CONFIG.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      keys: [],
      list_complete: true,
      cursor: '',
    });

    // limit=0 → parseInt("0")||50 = 50 (0 is falsy), then clamped to max(50,1)=50
    await worker.fetch(makeGetRequest('/api/audit?limit=0'), env, ctx);
    expect(env.ROUTING_CONFIG.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));

    // limit=999 should clamp to 200
    await worker.fetch(makeGetRequest('/api/audit?limit=999'), env, ctx);
    expect(env.ROUTING_CONFIG.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
  });

  it('handles non-numeric limit gracefully', async () => {
    (env.ROUTING_CONFIG.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      keys: [],
      list_complete: true,
      cursor: '',
    });

    const res = await worker.fetch(makeGetRequest('/api/audit?limit=abc'), env, ctx);
    expect(res.status).toBe(200);
    // NaN || 50 → defaults to 50
    expect(env.ROUTING_CONFIG.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });
});

describe('deploy status — GitHub API errors', () => {
  const ctx = createMockExecutionContext();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 502 when GitHub API returns non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));
    const env = createMockEnv();

    const res = await worker.fetch(makeGetRequest('/api/deploy/status?run_id=12345'), env, ctx);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; status: number };
    expect(body.error).toBe('github_api_error');
    expect(body.status).toBe(404);
  });

  it('returns 400 for run_id with spaces', async () => {
    const env = createMockEnv();
    const res = await worker.fetch(makeGetRequest('/api/deploy/status?run_id=123%20456'), env, ctx);
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty run_id', async () => {
    const env = createMockEnv();
    const res = await worker.fetch(makeGetRequest('/api/deploy/status?run_id='), env, ctx);
    expect(res.status).toBe(400);
  });
});

describe('rollback — multi-step previousDefault', () => {
  let kvStore: Map<string, MockKVEntry>;
  let env: ReturnType<typeof createMockEnv>;
  const ctx = createMockExecutionContext();

  beforeEach(() => {
    kvStore = new Map();
    env = createMockEnv({ kvStore });
  });

  it('previousDefault updates to latest previous on successive changes', async () => {
    // Set initial config: default=v1
    kvStore.set('config', {
      value: JSON.stringify({
        default: '0.1.0-1',
        overrides: [],
        activeVersions: ['0.1.0-1', '0.2.0-2', '0.3.0-3'],
      }),
    });

    // Change default to v2 → previousDefault should be v1
    await worker.fetch(
      makeRequest('/api/config', 'PUT', {
        default: '0.2.0-2',
        overrides: [],
        activeVersions: ['0.1.0-1', '0.2.0-2', '0.3.0-3'],
      }),
      env,
      ctx,
    );

    // Change default to v3 → previousDefault should be v2 (not v1)
    const res = await worker.fetch(
      makeRequest('/api/config', 'PUT', {
        default: '0.3.0-3',
        overrides: [],
        activeVersions: ['0.1.0-1', '0.2.0-2', '0.3.0-3'],
      }),
      env,
      ctx,
    );

    const body = (await res.json()) as { default: string; previousDefault?: string };
    expect(body.default).toBe('0.3.0-3');
    expect(body.previousDefault).toBe('0.2.0-2');
  });

  it('does not set previousDefault when previous default was empty', async () => {
    kvStore.set('config', {
      value: JSON.stringify({ default: '', overrides: [], activeVersions: ['0.1.0-1'] }),
    });

    const res = await worker.fetch(
      makeRequest('/api/config', 'PUT', {
        default: '0.1.0-1',
        overrides: [],
        activeVersions: ['0.1.0-1'],
      }),
      env,
      ctx,
    );

    const body = (await res.json()) as { previousDefault?: string };
    expect(body.previousDefault).toBeUndefined();
  });
});

describe('error handler', () => {
  const ctx = createMockExecutionContext();

  it('returns 500 when handler throws TypeError', async () => {
    const env = createMockEnv();
    // Make KV.get throw a TypeError to simulate unexpected error in handleGetConfig
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Cannot read properties'),
    );

    // handleGetConfig calls env.ROUTING_CONFIG.get — which will throw
    const res = await worker.fetch(makeGetRequest('/api/config'), env, ctx);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('internal_server_error');
  });

  it('error response includes security headers', async () => {
    const env = createMockEnv();
    (env.ROUTING_CONFIG.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

    const res = await worker.fetch(makeGetRequest('/api/config'), env, ctx);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});

describe('CSP nonce — HTML injection', () => {
  const ctx = createMockExecutionContext();

  it('nonce appears in CSP header script-src directive', async () => {
    const env = createMockEnv();
    const res = await worker.fetch(makeGetRequest('/'), env, ctx);
    const csp = res.headers.get('content-security-policy')!;
    // Verify nonce format and presence in script-src
    const nonceMatch = csp.match(/script-src 'self' 'nonce-([a-f0-9-]+)'/);
    expect(nonceMatch).not.toBeNull();
  });

  it('CSP includes required directives', async () => {
    const env = createMockEnv();
    const res = await worker.fetch(makeGetRequest('/'), env, ctx);
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});

describe('origin validation', () => {
  const ctx = createMockExecutionContext();

  it('rejects PUT without origin header', async () => {
    const env = createMockEnv();
    const req = new Request('https://admin.example.com/api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ default: '0.1.0-1', overrides: [], activeVersions: ['0.1.0-1'] }),
    });

    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(403);
  });

  it('rejects POST with mismatched origin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const env = createMockEnv();
    const req = new Request('https://admin.example.com/api/deploy', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ setAsDefault: true }),
    });

    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(403);
    vi.restoreAllMocks();
  });

  it('allows GET without origin header', async () => {
    const env = createMockEnv();
    const res = await worker.fetch(makeGetRequest('/api/config'), env, ctx);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/audit — webhook auth', () => {
  const ctx = createMockExecutionContext();

  it('rejects request with wrong secret', async () => {
    const env = createMockEnv();
    const req = new Request('https://admin.example.com/api/audit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-audit-secret': 'wrong-secret',
      },
      body: JSON.stringify({
        action: 'release_completed',
        details: { version: '0.1.0-1' },
      }),
    });

    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(401);
  });

  it('rejects request with missing secret', async () => {
    const env = createMockEnv();
    const req = new Request('https://admin.example.com/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'release_completed',
        details: { version: '0.1.0-1' },
      }),
    });

    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(401);
  });

  it('rejects invalid action', async () => {
    const env = createMockEnv();
    const req = new Request('https://admin.example.com/api/audit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-audit-secret': 'test-webhook-secret',
      },
      body: JSON.stringify({
        action: 'invalid_action',
        details: { version: '0.1.0-1' },
      }),
    });

    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_action');
  });

  it('accepts valid audit webhook', async () => {
    const env = createMockEnv();
    const req = new Request('https://admin.example.com/api/audit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-audit-secret': 'test-webhook-secret',
      },
      body: JSON.stringify({
        action: 'release_completed',
        details: { version: '0.1.0-1' },
      }),
    });

    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(201);
  });
});

describe('route matching — 404s', () => {
  const ctx = createMockExecutionContext();

  it('returns 404 for unknown API path', async () => {
    const env = createMockEnv();
    const res = await worker.fetch(makeGetRequest('/api/unknown'), env, ctx);
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-API, non-root path', async () => {
    const env = createMockEnv();
    const res = await worker.fetch(makeGetRequest('/something'), env, ctx);
    expect(res.status).toBe(404);
  });

  it('returns 404 for PATCH on /api/config', async () => {
    const env = createMockEnv();
    const req = new Request('https://admin.example.com/api/config', { method: 'PATCH' });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(404);
  });
});

describe('builds — empty list', () => {
  const ctx = createMockExecutionContext();

  it('returns empty array when no builds exist', async () => {
    const env = createMockEnv();
    const res = await worker.fetch(makeGetRequest('/api/builds'), env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toEqual([]);
  });
});
