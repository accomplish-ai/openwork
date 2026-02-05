// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { OneTimeScheduler } from '@/components/schedule/OneTimeScheduler';

describe('OneTimeScheduler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not derive date input values from toISOString()', () => {
    // Guards against using `toISOString().split("T")[0]` (UTC date) for the date input/min.
    // The component should only need `toISOString()` for emitting the final scheduledAt.
    const toISOStringSpy = vi.spyOn(Date.prototype, 'toISOString');

    render(
      <OneTimeScheduler
        value="2026-02-05T07:30:00.000Z"
        onChange={() => {}}
      />
    );

    // Current implementation should only call `toISOString()` for outgoing scheduledAt,
    // not for deriving local date display.
    expect(toISOStringSpy.mock.calls.length).toBeLessThan(3);
  });
});

