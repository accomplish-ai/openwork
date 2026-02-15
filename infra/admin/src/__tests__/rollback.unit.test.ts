import { describe, it, expect, beforeEach } from 'vitest';
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

describe('rollback - previousDefault tracking', () => {
  let kvStore: Map<string, MockKVEntry>;
  let env: ReturnType<typeof createMockEnv>;
  const ctx = createMockExecutionContext();

  beforeEach(() => {
    kvStore = new Map();
    env = createMockEnv({ kvStore });
  });

  it('stores previousDefault when changing default', async () => {
    // Seed initial config
    kvStore.set('config', {
      value: JSON.stringify({
        default: '0.1.0-1',
        overrides: [],
        activeVersions: ['0.1.0-1', '0.2.0-2'],
      }),
    });

    // Update to new default
    const res = await worker.fetch(
      makeRequest('/api/config', 'PUT', {
        default: '0.2.0-2',
        overrides: [],
        activeVersions: ['0.1.0-1', '0.2.0-2'],
      }),
      env,
      ctx,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { default: string; previousDefault?: string };
    expect(body.default).toBe('0.2.0-2');
    expect(body.previousDefault).toBe('0.1.0-1');
  });

  it('does not set previousDefault when default unchanged', async () => {
    kvStore.set('config', {
      value: JSON.stringify({
        default: '0.1.0-1',
        overrides: [],
        activeVersions: ['0.1.0-1'],
      }),
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

    expect(res.status).toBe(200);
    const body = (await res.json()) as { default: string; previousDefault?: string };
    expect(body.previousDefault).toBeUndefined();
  });

  it('validates previousDefault field if provided in input', async () => {
    const res = await worker.fetch(
      makeRequest('/api/config', 'PUT', {
        default: '0.1.0-1',
        overrides: [],
        activeVersions: ['0.1.0-1'],
        previousDefault: 'not-a-valid-build-id',
      }),
      env,
      ctx,
    );

    expect(res.status).toBe(400);
  });

  it('accepts valid previousDefault in input', async () => {
    const res = await worker.fetch(
      makeRequest('/api/config', 'PUT', {
        default: '0.1.0-1',
        overrides: [],
        activeVersions: ['0.1.0-1'],
        previousDefault: '0.0.9-5',
      }),
      env,
      ctx,
    );

    expect(res.status).toBe(200);
  });
});
