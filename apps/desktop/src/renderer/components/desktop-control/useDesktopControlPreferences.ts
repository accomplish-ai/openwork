import { useCallback, useEffect, useState } from 'react';

const DESKTOP_CONTROL_PREFERENCES_STORAGE_KEY =
  'openwork.desktopControlPreferences.v1';

export interface DesktopControlPreferences {
  liveGuidanceByDefault: boolean;
  screenCaptureByDefault: boolean;
  keepDiagnosticsPanelVisible: boolean;
}

const DEFAULT_DESKTOP_CONTROL_PREFERENCES: DesktopControlPreferences = {
  liveGuidanceByDefault: false,
  screenCaptureByDefault: false,
  keepDiagnosticsPanelVisible: false,
};

function parseStoredPreferences(value: string | null): DesktopControlPreferences {
  if (!value) {
    return DEFAULT_DESKTOP_CONTROL_PREFERENCES;
  }

  try {
    const parsed = JSON.parse(value) as Partial<DesktopControlPreferences> | null;
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_DESKTOP_CONTROL_PREFERENCES;
    }

    return {
      liveGuidanceByDefault: Boolean(parsed.liveGuidanceByDefault),
      screenCaptureByDefault: Boolean(parsed.screenCaptureByDefault),
      keepDiagnosticsPanelVisible: Boolean(parsed.keepDiagnosticsPanelVisible),
    };
  } catch {
    return DEFAULT_DESKTOP_CONTROL_PREFERENCES;
  }
}

export interface UseDesktopControlPreferencesResult {
  preferences: DesktopControlPreferences;
  setPreferences: (next: Partial<DesktopControlPreferences>) => void;
}

export function useDesktopControlPreferences(): UseDesktopControlPreferencesResult {
  const [preferences, setPreferencesState] = useState<DesktopControlPreferences>(
    DEFAULT_DESKTOP_CONTROL_PREFERENCES
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setPreferencesState(
      parseStoredPreferences(
        window.localStorage.getItem(DESKTOP_CONTROL_PREFERENCES_STORAGE_KEY)
      )
    );
  }, []);

  const setPreferences = useCallback((next: Partial<DesktopControlPreferences>) => {
    setPreferencesState((current) => {
      const merged = {
        ...current,
        ...next,
      };

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          DESKTOP_CONTROL_PREFERENCES_STORAGE_KEY,
          JSON.stringify(merged)
        );
      }

      return merged;
    });
  }, []);

  return {
    preferences,
    setPreferences,
  };
}

export default useDesktopControlPreferences;
