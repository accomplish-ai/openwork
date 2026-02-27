/**
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDesktopControlPreferences } from './useDesktopControlPreferences';

const STORAGE_KEY = 'openwork.desktopControlPreferences.v1';

describe('useDesktopControlPreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('hydrates preferences from localStorage', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        liveGuidanceByDefault: true,
        screenCaptureByDefault: false,
        keepDiagnosticsPanelVisible: true,
      })
    );

    const { result } = renderHook(() => useDesktopControlPreferences());

    await waitFor(() => {
      expect(result.current.preferences).toEqual({
        liveGuidanceByDefault: true,
        screenCaptureByDefault: false,
        keepDiagnosticsPanelVisible: true,
      });
    });
  });

  it('persists preference updates', async () => {
    const { result } = renderHook(() => useDesktopControlPreferences());

    act(() => {
      result.current.setPreferences({
        liveGuidanceByDefault: true,
        screenCaptureByDefault: true,
      });
    });

    expect(result.current.preferences).toEqual({
      liveGuidanceByDefault: true,
      screenCaptureByDefault: true,
      keepDiagnosticsPanelVisible: false,
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({
        liveGuidanceByDefault: true,
        screenCaptureByDefault: true,
        keepDiagnosticsPanelVisible: false,
      })
    );
  });
});
