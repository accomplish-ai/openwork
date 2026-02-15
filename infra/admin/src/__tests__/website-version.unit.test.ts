import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockEnv, createMockExecutionContext } from './setup';

function makeRequest(path: string): Request {
  return new Request(`https://admin.example.com${path}`);
}

const SAMPLE_HTML = `
<html><body>
<a href="https://downloads.accomplish.ai/downloads/1.2.3/macos/Accomplish-1.2.3-arm64.dmg">Mac ARM</a>
<a href="https://downloads.accomplish.ai/downloads/1.2.3/macos/Accomplish-1.2.3.dmg">Mac x64</a>
<a href="https://downloads.accomplish.ai/downloads/1.2.3/windows/Accomplish-Setup-1.2.3.exe">Win</a>
</body></html>
`;

describe('GET /api/website-version', () => {
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

  it('returns version and downloads from accomplish.ai', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://accomplish.ai/') {
        return new Response(SAMPLE_HTML, { status: 200 });
      }
      return originalFetch(input);
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/website-version'), env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      version: string;
      downloads: Array<{ platform: string; arch: string; url: string }>;
    };
    expect(body.version).toBe('1.2.3');
    expect(body.downloads).toHaveLength(3);
    expect(body.downloads[0]).toEqual({
      platform: 'macOS',
      arch: 'ARM64',
      url: 'https://downloads.accomplish.ai/downloads/1.2.3/macos/Accomplish-1.2.3-arm64.dmg',
    });
    expect(body.downloads[2]).toEqual({
      platform: 'Windows',
      arch: 'x64',
      url: 'https://downloads.accomplish.ai/downloads/1.2.3/windows/Accomplish-Setup-1.2.3.exe',
    });
  });

  it('returns 502 when accomplish.ai is unreachable', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://accomplish.ai/') {
        return new Response('Server Error', { status: 500 });
      }
      return originalFetch(input);
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/website-version'), env, ctx);
    expect(res.status).toBe(502);
  });

  it('returns 502 when fetch throws (network error)', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://accomplish.ai/') {
        throw new Error('DNS resolution failed');
      }
      return originalFetch(input);
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/website-version'), env, ctx);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('fetch_failed');
  });

  it('returns 404 when no version found in HTML', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://accomplish.ai/') {
        return new Response('<html><body>No downloads here</body></html>', { status: 200 });
      }
      return originalFetch(input);
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/website-version'), env, ctx);
    expect(res.status).toBe(404);
  });

  it('filters downloads to only the detected version', async () => {
    const multiVersionHtml = `
<html><body>
<a href="https://downloads.accomplish.ai/downloads/1.2.3/macos/Accomplish-1.2.3-arm64.dmg">Current</a>
<a href="https://downloads.accomplish.ai/downloads/1.1.0/macos/Accomplish-1.1.0-arm64.dmg">Old</a>
</body></html>`;

    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://accomplish.ai/') {
        return new Response(multiVersionHtml, { status: 200 });
      }
      return originalFetch(input);
    }) as typeof fetch;

    const res = await worker.fetch(makeRequest('/api/website-version'), env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      version: string;
      downloads: Array<{ platform: string; arch: string; url: string }>;
    };
    expect(body.version).toBe('1.2.3');
    expect(body.downloads).toHaveLength(1);
    expect(body.downloads.every((d) => d.url.includes('1.2.3'))).toBe(true);
  });
});
