/**
 * Rate Limiter — sliding-window rate limiter for desktop-control operations.
 *
 * Tracks request timestamps per bucket and rejects requests that exceed
 * the configured limit within the window.
 */

import type { ToolFailure } from '@accomplish/shared';

export type RateLimitBucket =
  | 'mouse_action'
  | 'live_screen_start'
  | 'readiness_check'
  | 'context_capture';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_LIMITS: Record<RateLimitBucket, RateLimitConfig> = {
  mouse_action: { maxRequests: 30, windowMs: 1_000 },
  live_screen_start: { maxRequests: 5, windowMs: 60_000 },
  readiness_check: { maxRequests: 10, windowMs: 60_000 },
  context_capture: { maxRequests: 10, windowMs: 60_000 },
};

export class RateLimiter {
  private timestamps: Map<RateLimitBucket, number[]> = new Map();
  private limits: Record<RateLimitBucket, RateLimitConfig>;
  private readonly now: () => number;

  constructor(
    overrides?: Partial<Record<RateLimitBucket, RateLimitConfig>>,
    now?: () => number,
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...overrides };
    this.now = now ?? (() => Date.now());
  }

  /**
   * Check whether a request is allowed under the rate limit for the given bucket.
   * If allowed, records the timestamp and returns true.
   * If rejected, returns false.
   */
  tryAcquire(bucket: RateLimitBucket): boolean {
    const config = this.limits[bucket];
    if (!config) return true;

    const now = this.now();
    const cutoff = now - config.windowMs;

    let timestamps = this.timestamps.get(bucket);
    if (!timestamps) {
      timestamps = [];
      this.timestamps.set(bucket, timestamps);
    }

    // Evict expired timestamps
    const firstValid = timestamps.findIndex((t) => t > cutoff);
    if (firstValid > 0) {
      timestamps.splice(0, firstValid);
    } else if (firstValid === -1) {
      timestamps.length = 0;
    }

    if (timestamps.length >= config.maxRequests) {
      return false;
    }

    timestamps.push(now);
    return true;
  }

  /**
   * Check and throw a ToolFailure if rate limited.
   */
  acquireOrThrow(bucket: RateLimitBucket): void {
    if (!this.tryAcquire(bucket)) {
      const config = this.limits[bucket];
      const failure: ToolFailure = {
        code: 'ERR_UNKNOWN', // No ERR_RATE_LIMITED in the existing enum; using ERR_UNKNOWN with details
        message: `Rate limit exceeded for ${bucket}: max ${config.maxRequests} requests per ${config.windowMs}ms.`,
        category: 'unknown',
        source: 'service',
        retryable: true,
        retryAfterMs: config.windowMs,
        details: { bucket, maxRequests: config.maxRequests, windowMs: config.windowMs },
      };
      throw failure;
    }
  }

  /**
   * Returns how many requests remain before the limit is reached.
   */
  remaining(bucket: RateLimitBucket): number {
    const config = this.limits[bucket];
    if (!config) return Infinity;

    const now = this.now();
    const cutoff = now - config.windowMs;
    const timestamps = this.timestamps.get(bucket) ?? [];
    const validCount = timestamps.filter((t) => t > cutoff).length;
    return Math.max(0, config.maxRequests - validCount);
  }

  /**
   * Reset all rate limit state.
   */
  reset(): void {
    this.timestamps.clear();
  }

  /**
   * Reset a specific bucket.
   */
  resetBucket(bucket: RateLimitBucket): void {
    this.timestamps.delete(bucket);
  }
}

let defaultRateLimiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!defaultRateLimiter) {
    defaultRateLimiter = new RateLimiter();
  }
  return defaultRateLimiter;
}

export function resetRateLimiter(): void {
  defaultRateLimiter = null;
}
