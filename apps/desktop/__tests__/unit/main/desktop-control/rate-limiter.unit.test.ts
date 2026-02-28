import { describe, expect, it, beforeEach } from 'vitest';
import { RateLimiter, getRateLimiter, resetRateLimiter } from '@main/desktop-control/rate-limiter';

describe('RateLimiter', () => {
  it('allows requests within the limit', () => {
    const limiter = new RateLimiter(
      { mouse_action: { maxRequests: 3, windowMs: 1000 } },
      () => 1000,
    );

    expect(limiter.tryAcquire('mouse_action')).toBe(true);
    expect(limiter.tryAcquire('mouse_action')).toBe(true);
    expect(limiter.tryAcquire('mouse_action')).toBe(true);
  });

  it('rejects requests exceeding the limit', () => {
    const limiter = new RateLimiter(
      { mouse_action: { maxRequests: 2, windowMs: 1000 } },
      () => 1000,
    );

    expect(limiter.tryAcquire('mouse_action')).toBe(true);
    expect(limiter.tryAcquire('mouse_action')).toBe(true);
    expect(limiter.tryAcquire('mouse_action')).toBe(false);
  });

  it('allows requests after the window expires', () => {
    let now = 1000;
    const limiter = new RateLimiter(
      { mouse_action: { maxRequests: 2, windowMs: 1000 } },
      () => now,
    );

    expect(limiter.tryAcquire('mouse_action')).toBe(true);
    expect(limiter.tryAcquire('mouse_action')).toBe(true);
    expect(limiter.tryAcquire('mouse_action')).toBe(false);

    // Advance time past the window
    now = 2100;
    expect(limiter.tryAcquire('mouse_action')).toBe(true);
  });

  it('tracks remaining capacity', () => {
    const limiter = new RateLimiter(
      { mouse_action: { maxRequests: 3, windowMs: 1000 } },
      () => 1000,
    );

    expect(limiter.remaining('mouse_action')).toBe(3);
    limiter.tryAcquire('mouse_action');
    expect(limiter.remaining('mouse_action')).toBe(2);
    limiter.tryAcquire('mouse_action');
    expect(limiter.remaining('mouse_action')).toBe(1);
    limiter.tryAcquire('mouse_action');
    expect(limiter.remaining('mouse_action')).toBe(0);
  });

  it('acquireOrThrow throws on limit exceeded', () => {
    const limiter = new RateLimiter(
      { mouse_action: { maxRequests: 1, windowMs: 1000 } },
      () => 1000,
    );

    limiter.acquireOrThrow('mouse_action');
    expect(() => limiter.acquireOrThrow('mouse_action')).toThrow();
  });

  it('acquireOrThrow throws a ToolFailure-like object', () => {
    const limiter = new RateLimiter(
      { mouse_action: { maxRequests: 1, windowMs: 1000 } },
      () => 1000,
    );

    limiter.tryAcquire('mouse_action');

    try {
      limiter.acquireOrThrow('mouse_action');
      expect.fail('should have thrown');
    } catch (error: any) {
      expect(error.code).toBe('ERR_UNKNOWN');
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(1000);
      expect(error.details?.bucket).toBe('mouse_action');
    }
  });

  it('isolates different buckets', () => {
    const limiter = new RateLimiter(
      {
        mouse_action: { maxRequests: 1, windowMs: 1000 },
        readiness_check: { maxRequests: 1, windowMs: 1000 },
      },
      () => 1000,
    );

    expect(limiter.tryAcquire('mouse_action')).toBe(true);
    expect(limiter.tryAcquire('readiness_check')).toBe(true);
    expect(limiter.tryAcquire('mouse_action')).toBe(false);
    expect(limiter.tryAcquire('readiness_check')).toBe(false);
  });

  it('resets all state', () => {
    const limiter = new RateLimiter(
      { mouse_action: { maxRequests: 1, windowMs: 1000 } },
      () => 1000,
    );

    limiter.tryAcquire('mouse_action');
    expect(limiter.tryAcquire('mouse_action')).toBe(false);

    limiter.reset();
    expect(limiter.tryAcquire('mouse_action')).toBe(true);
  });

  it('resets a specific bucket', () => {
    const limiter = new RateLimiter(
      {
        mouse_action: { maxRequests: 1, windowMs: 1000 },
        readiness_check: { maxRequests: 1, windowMs: 1000 },
      },
      () => 1000,
    );

    limiter.tryAcquire('mouse_action');
    limiter.tryAcquire('readiness_check');

    limiter.resetBucket('mouse_action');
    expect(limiter.tryAcquire('mouse_action')).toBe(true);
    expect(limiter.tryAcquire('readiness_check')).toBe(false);
  });

  it('evicts expired timestamps on each acquire', () => {
    let now = 1000;
    const limiter = new RateLimiter(
      { mouse_action: { maxRequests: 3, windowMs: 500 } },
      () => now,
    );

    limiter.tryAcquire('mouse_action'); // t=1000
    now = 1200;
    limiter.tryAcquire('mouse_action'); // t=1200
    now = 1400;
    limiter.tryAcquire('mouse_action'); // t=1400

    // All 3 within window, next should fail
    expect(limiter.tryAcquire('mouse_action')).toBe(false);

    // Advance past the first timestamp's expiry
    now = 1600; // 1000 + 500 = 1500 cutoff, so t=1000 evicted
    expect(limiter.tryAcquire('mouse_action')).toBe(true);
  });
});

describe('getRateLimiter / resetRateLimiter', () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it('returns a singleton instance', () => {
    const a = getRateLimiter();
    const b = getRateLimiter();
    expect(a).toBe(b);
  });

  it('resets the singleton', () => {
    const a = getRateLimiter();
    a.tryAcquire('mouse_action');

    resetRateLimiter();

    const b = getRateLimiter();
    expect(b).not.toBe(a);
  });
});
