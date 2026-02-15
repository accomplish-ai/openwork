import { describe, it, expect } from 'vitest';
import { createMockEnv, createMockExecutionContext } from './setup';

import worker from '../index';

function makeRequest(path: string): Request {
  return new Request(`https://admin.example.com${path}`);
}

describe('nonce-based CSP', () => {
  const env = createMockEnv();
  const ctx = createMockExecutionContext();

  it('includes nonce in script-src CSP directive', async () => {
    const res = await worker.fetch(makeRequest('/'), env, ctx);
    const csp = res.headers.get('content-security-policy');

    expect(csp).toBeDefined();
    expect(csp).toMatch(/script-src 'self' 'nonce-[a-f0-9-]+'/);
  });

  it('does not include unsafe-inline in script-src', async () => {
    const res = await worker.fetch(makeRequest('/'), env, ctx);
    const csp = res.headers.get('content-security-policy');

    expect(csp).toBeDefined();
    // script-src should not have unsafe-inline
    const scriptSrc = csp!.split(';').find((d) => d.trim().startsWith('script-src'));
    expect(scriptSrc).not.toContain('unsafe-inline');
  });

  it('keeps unsafe-inline in style-src for Google Fonts', async () => {
    const res = await worker.fetch(makeRequest('/'), env, ctx);
    const csp = res.headers.get('content-security-policy');

    const styleSrc = csp!.split(';').find((d) => d.trim().startsWith('style-src'));
    expect(styleSrc).toContain("'unsafe-inline'");
  });

  it('generates different nonce per request', async () => {
    const res1 = await worker.fetch(makeRequest('/'), env, ctx);
    const res2 = await worker.fetch(makeRequest('/'), env, ctx);

    const csp1 = res1.headers.get('content-security-policy')!;
    const csp2 = res2.headers.get('content-security-policy')!;

    const nonce1 = csp1.match(/nonce-([a-f0-9-]+)/)?.[1];
    const nonce2 = csp2.match(/nonce-([a-f0-9-]+)/)?.[1];

    expect(nonce1).toBeDefined();
    expect(nonce2).toBeDefined();
    expect(nonce1).not.toBe(nonce2);
  });
});
