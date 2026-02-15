import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockEnv, createMockExecutionContext, type MockKVEntry } from './setup';

import worker from '../index';

function makeRequest(path: string, method = 'GET', body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: {
      origin: 'https://admin.example.com',
      'content-type': 'application/json',
    },
  };
  if (body) init.body = JSON.stringify(body);
  return new Request(`https://admin.example.com${path}`, init);
}

describe('Slack webhook notifications', () => {
  let kvStore: Map<string, MockKVEntry>;
  let env: ReturnType<typeof createMockEnv>;
  let ctx: ReturnType<typeof createMockExecutionContext>;

  beforeEach(() => {
    vi.restoreAllMocks();
    kvStore = new Map();
    env = createMockEnv({ kvStore });
    ctx = createMockExecutionContext();
    // Mock global fetch for GitHub + Slack
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  it('sends Slack notification on config update when SLACK_WEBHOOK_URL is set', async () => {
    (env as Record<string, unknown>).SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    // Restore KV mocks since we stubbed global fetch
    const origGet = createMockEnv({ kvStore }).ROUTING_CONFIG.get;
    const origPut = createMockEnv({ kvStore }).ROUTING_CONFIG.put;
    (env.ROUTING_CONFIG as unknown as Record<string, unknown>).get = origGet;
    (env.ROUTING_CONFIG as unknown as Record<string, unknown>).put = origPut;

    kvStore.set('config', {
      value: JSON.stringify({ default: '0.1.0-1', overrides: [], activeVersions: ['0.1.0-1'] }),
    });

    await worker.fetch(
      makeRequest('/api/config', 'PUT', {
        default: '0.1.0-1',
        overrides: [],
        activeVersions: ['0.1.0-1'],
      }),
      env,
      ctx,
    );

    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it('skips Slack notification when SLACK_WEBHOOK_URL is not set', async () => {
    const origGet = createMockEnv({ kvStore }).ROUTING_CONFIG.get;
    const origPut = createMockEnv({ kvStore }).ROUTING_CONFIG.put;
    (env.ROUTING_CONFIG as unknown as Record<string, unknown>).get = origGet;
    (env.ROUTING_CONFIG as unknown as Record<string, unknown>).put = origPut;

    kvStore.set('config', {
      value: JSON.stringify({ default: '0.1.0-1', overrides: [], activeVersions: ['0.1.0-1'] }),
    });

    await worker.fetch(
      makeRequest('/api/config', 'PUT', {
        default: '0.1.0-1',
        overrides: [],
        activeVersions: ['0.1.0-1'],
      }),
      env,
      ctx,
    );

    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
});
