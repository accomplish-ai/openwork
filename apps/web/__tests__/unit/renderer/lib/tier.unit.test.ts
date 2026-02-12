import { describe, it, expect } from 'vitest';
import { isEnterprise } from '@/lib/tier';

describe('tier', () => {
  it('returns false when __APP_TIER__ is lite (default)', () => {
    // The vitest config defines __APP_TIER__ as JSON.stringify('lite') by default
    expect(isEnterprise()).toBe(false);
  });
});
