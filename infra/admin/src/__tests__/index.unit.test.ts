import { describe, it, expect } from 'vitest';
import { createMockEnv, createMockExecutionContext } from './setup';

describe('test infrastructure', () => {
  it('creates mock env with working KV', async () => {
    const env = createMockEnv();
    await env.ROUTING_CONFIG.put('test-key', JSON.stringify({ value: 1 }));
    const result = await env.ROUTING_CONFIG.get('test-key', { type: 'json' });
    expect(result).toEqual({ value: 1 });
  });

  it('creates mock env with working R2', async () => {
    const r2Objects = new Map<string, unknown>();
    r2Objects.set('builds/v0.1.0-1-lite/manifest.json', { buildId: '0.1.0-1' });
    const env = createMockEnv({ r2Objects });
    const obj = await env.ASSETS.get('builds/v0.1.0-1-lite/manifest.json');
    expect(obj).not.toBeNull();
    const data = await obj!.json();
    expect(data).toEqual({ buildId: '0.1.0-1' });
  });

  it('creates mock execution context', () => {
    const ctx = createMockExecutionContext();
    expect(ctx.waitUntil).toBeDefined();
    expect(ctx.passThroughOnException).toBeDefined();
  });
});
