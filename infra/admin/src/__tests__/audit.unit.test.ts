import { describe, it, expect, beforeEach } from 'vitest';
import { createMockEnv, createMockExecutionContext, type MockKVEntry } from './setup';

import worker from '../index';

function makeRequest(path: string, method = 'GET'): Request {
  return new Request(`https://admin.example.com${path}`, { method });
}

describe('audit log (N+1 fix)', () => {
  let kvStore: Map<string, MockKVEntry>;
  let env: ReturnType<typeof createMockEnv>;
  const ctx = createMockExecutionContext();

  beforeEach(() => {
    kvStore = new Map();
    env = createMockEnv({ kvStore });
  });

  it('GET /api/audit returns entries from KV metadata without per-key get()', async () => {
    // Seed KV with audit entries that have metadata
    const entry = {
      id: 'abc-123',
      timestamp: '2026-01-01T00:00:00.000Z',
      action: 'config_updated',
      details: { before: null, after: { default: '0.1.0-1' } },
      source: 'dashboard',
      user: 'test@example.com',
    };
    const sortKey = String(9999999999999 - new Date(entry.timestamp).getTime()).padStart(13, '0');
    const kvKey = `audit:${sortKey}:${entry.id}`;
    kvStore.set(kvKey, {
      value: JSON.stringify(entry.details),
      metadata: {
        id: entry.id,
        timestamp: entry.timestamp,
        action: entry.action,
        source: entry.source,
        user: entry.user,
      },
    });

    // Update mock to return metadata from list
    (env.ROUTING_CONFIG.list as ReturnType<typeof import('vitest').vi.fn>).mockResolvedValue({
      keys: [
        {
          name: kvKey,
          metadata: {
            id: entry.id,
            timestamp: entry.timestamp,
            action: entry.action,
            source: entry.source,
            user: entry.user,
          },
        },
      ],
      list_complete: true,
      cursor: '',
    });

    const res = await worker.fetch(makeRequest('/api/audit'), env, ctx);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      entries: Array<{ id: string; action: string; details?: unknown }>;
    };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].id).toBe('abc-123');
    expect(body.entries[0].action).toBe('config_updated');
    // List view should NOT include full details
    expect(body.entries[0].details).toBeUndefined();
  });

  it('GET /api/audit/:key returns full details for a single entry', async () => {
    const details = { before: null, after: { default: '0.1.0-1' } };
    const entry = {
      id: 'abc-123',
      timestamp: '2026-01-01T00:00:00.000Z',
      action: 'config_updated',
      details,
      source: 'dashboard',
    };
    const sortKey = String(9999999999999 - new Date(entry.timestamp).getTime()).padStart(13, '0');
    const kvKey = `audit:${sortKey}:${entry.id}`;
    kvStore.set(kvKey, { value: JSON.stringify(entry) });

    const res = await worker.fetch(
      makeRequest(`/api/audit/${encodeURIComponent(kvKey)}`),
      env,
      ctx,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as typeof entry;
    expect(body.action).toBe('config_updated');
    expect(body.details).toEqual(details);
  });

  it('GET /api/audit/:key returns 404 for missing key', async () => {
    const res = await worker.fetch(makeRequest('/api/audit/audit:0000000000000:missing'), env, ctx);
    expect(res.status).toBe(404);
  });

  it('GET /api/audit/:key rejects keys not starting with audit:', async () => {
    const res = await worker.fetch(makeRequest('/api/audit/config'), env, ctx);
    expect(res.status).toBe(400);
  });
});
