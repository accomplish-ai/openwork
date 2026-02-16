import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockEnv, createMockExecutionContext } from './setup';

function makeRequest(path: string): Request {
  return new Request(`https://admin.example.com${path}`);
}

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@accomplish_ai%2Fagent-core';

const SAMPLE_NPM_RESPONSE = {
  'dist-tags': {
    latest: '0.3.1',
    beta: '0.4.0-beta.1',
  },
  time: {
    created: '2024-01-01T00:00:00.000Z',
    modified: '2025-02-01T00:00:00.000Z',
    '0.1.0': '2024-01-15T00:00:00.000Z',
    '0.2.0': '2024-06-01T00:00:00.000Z',
    '0.3.0': '2024-12-01T00:00:00.000Z',
    '0.3.1': '2025-01-15T00:00:00.000Z',
    '0.4.0-beta.1': '2025-02-01T00:00:00.000Z',
  },
};

function makeGitHubContentResponse(
  deps: Record<string, string>,
  overrides?: Record<string, string>,
) {
  const pkg: Record<string, unknown> = { dependencies: deps };
  if (overrides) pkg.pnpm = { overrides };
  const content = btoa(JSON.stringify(pkg));
  return new Response(JSON.stringify({ content }), { status: 200 });
}

describe('GET /api/agent-core/versions', () => {
  let env: ReturnType<typeof createMockEnv>;
  const ctx = createMockExecutionContext();
  const originalFetch = globalThis.fetch;
  let worker: typeof import('../index').default;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    env = createMockEnv();
    const module = await import('../index');
    worker = module.default;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns versions sorted newest first with dist-tags', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === NPM_REGISTRY_URL) {
        return new Response(JSON.stringify(SAMPLE_NPM_RESPONSE), { status: 200 });
      }
      return originalFetch(input);
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/agent-core/versions'), env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      official: Array<{ version: string; publishedAt: string; distTags: string[] }>;
      pr: Array<{ version: string; publishedAt: string; distTags: string[] }>;
    };

    // All 5 versions are official (none contain '-pr-')
    expect(body.official).toHaveLength(5);
    expect(body.official[0].version).toBe('0.4.0-beta.1');
    expect(body.official[0].distTags).toContain('beta');
    expect(body.official[1].version).toBe('0.3.1');
    expect(body.official[1].distTags).toContain('latest');
    expect(body.official[4].version).toBe('0.1.0');
    expect(body.official[4].distTags).toEqual([]);
    expect(body.pr).toHaveLength(0);
  });

  it('returns all versions split by type', async () => {
    const manyVersions: Record<string, string> = {
      created: '2024-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z',
    };
    for (let i = 1; i <= 10; i++) {
      manyVersions[`0.0.${i}`] = `2024-${String(i).padStart(2, '0')}-01T00:00:00.000Z`;
    }
    for (let i = 1; i <= 15; i++) {
      manyVersions[`0.0.0-pr-${i}-20240101`] = `2024-${String(i).padStart(2, '0')}-15T00:00:00.000Z`;
    }

    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === NPM_REGISTRY_URL) {
        return new Response(JSON.stringify({ 'dist-tags': {}, time: manyVersions }), {
          status: 200,
        });
      }
      return originalFetch(input);
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/agent-core/versions'), env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { official: unknown[]; pr: unknown[] };
    expect(body.official).toHaveLength(10);
    expect(body.pr).toHaveLength(15);
  });

  it('caches results for 5 minutes', async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(JSON.stringify(SAMPLE_NPM_RESPONSE), { status: 200 });
    }) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;

    await worker.fetch(makeRequest('/api/agent-core/versions'), env, ctx);
    await worker.fetch(makeRequest('/api/agent-core/versions'), env, ctx);

    // Only one actual fetch to npm
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns 502 when npm registry is down', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === NPM_REGISTRY_URL) {
        return new Response('Internal Server Error', { status: 500 });
      }
      return originalFetch(input);
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/agent-core/versions'), env, ctx);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('fetch_failed');
  });

  it('returns 502 when fetch throws (network error)', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === NPM_REGISTRY_URL) {
        throw new Error('Network error');
      }
      return originalFetch(input);
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/agent-core/versions'), env, ctx);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('fetch_failed');
    expect(body.message).toBe('Network error or timeout');
  });

  it('excludes created/modified keys from versions', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify(SAMPLE_NPM_RESPONSE), { status: 200 });
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/agent-core/versions'), env, ctx);
    const body = (await res.json()) as {
      official: Array<{ version: string }>;
      pr: Array<{ version: string }>;
    };
    const versionNames = body.official.concat(body.pr).map((v) => v.version);
    expect(versionNames).not.toContain('created');
    expect(versionNames).not.toContain('modified');
  });
});

describe('GET /api/agent-core/installed', () => {
  let env: ReturnType<typeof createMockEnv>;
  const ctx = createMockExecutionContext();
  const originalFetch = globalThis.fetch;
  let worker: typeof import('../index').default;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    env = createMockEnv();
    const module = await import('../index');
    worker = module.default;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns desktop, web, and override versions', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/contents/apps/desktop/package.json')) {
        return makeGitHubContentResponse({ '@accomplish_ai/agent-core': '0.3.1' });
      }
      if (url.includes('/contents/apps/web/package.json')) {
        return makeGitHubContentResponse({ '@accomplish_ai/agent-core': '0.3.1' });
      }
      if (url.includes('/contents/package.json')) {
        return makeGitHubContentResponse({}, { '@accomplish_ai/agent-core': '0.3.2' });
      }
      return originalFetch(input);
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/agent-core/installed'), env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { desktop: string; web: string; override: string };
    expect(body.desktop).toBe('0.3.1');
    expect(body.web).toBe('0.3.1');
    expect(body.override).toBe('0.3.2');
  });

  it('returns empty strings when deps not found', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/contents/')) {
        return makeGitHubContentResponse({});
      }
      return originalFetch(input);
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/agent-core/installed'), env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { desktop: string; web: string; override: string };
    expect(body.desktop).toBe('');
    expect(body.web).toBe('');
    expect(body.override).toBe('');
  });

  it('caches results', async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/contents/')) {
        return makeGitHubContentResponse({ '@accomplish_ai/agent-core': '0.3.1' });
      }
      return originalFetch(input);
    }) as typeof fetch;
    globalThis.fetch = mockFetch;

    await worker.fetch(makeRequest('/api/agent-core/installed'), env, ctx);
    await worker.fetch(makeRequest('/api/agent-core/installed'), env, ctx);

    // 3 fetches for first call (desktop, web, root), 0 for second (cached)
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('returns 502 when GitHub API fails', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/contents/')) {
        return new Response('Not Found', { status: 404 });
      }
      return originalFetch(input);
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/agent-core/installed'), env, ctx);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('github_api_error');
  });

  it('uses correct GitHub API headers', async () => {
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/contents/')) {
        return makeGitHubContentResponse({ '@accomplish_ai/agent-core': '0.3.1' });
      }
      return originalFetch(input);
    }) as typeof fetch;
    globalThis.fetch = mockFetch;

    await worker.fetch(makeRequest('/api/agent-core/installed'), env, ctx);

    const firstCall = vi.mocked(mockFetch).mock.calls[0];
    const opts = firstCall[1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-github-token');
    expect(headers['User-Agent']).toBe('accomplish-admin');
  });
});
