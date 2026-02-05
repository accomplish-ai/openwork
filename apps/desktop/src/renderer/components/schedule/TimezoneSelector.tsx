// apps/desktop/src/renderer/components/schedule/TimezoneSelector.tsx

import { useMemo } from 'react';

interface TimezoneSelectorProps {
  value: string;
  onChange: (timezone: string) => void;
}

// Common timezones grouped by region
const commonTimezones = [
  // Americas
  { id: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { id: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { id: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { id: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { id: 'America/Anchorage', label: 'Alaska' },
  { id: 'Pacific/Honolulu', label: 'Hawaii' },
  { id: 'America/Toronto', label: 'Toronto' },
  { id: 'America/Vancouver', label: 'Vancouver' },
  { id: 'America/Sao_Paulo', label: 'Brasilia' },
  // Europe
  { id: 'Europe/London', label: 'London' },
  { id: 'Europe/Paris', label: 'Paris' },
  { id: 'Europe/Berlin', label: 'Berlin' },
  { id: 'Europe/Amsterdam', label: 'Amsterdam' },
  { id: 'Europe/Moscow', label: 'Moscow' },
  // Asia/Pacific
  { id: 'Asia/Tokyo', label: 'Tokyo' },
  { id: 'Asia/Shanghai', label: 'Shanghai' },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { id: 'Asia/Singapore', label: 'Singapore' },
  { id: 'Asia/Seoul', label: 'Seoul' },
  { id: 'Asia/Kolkata', label: 'Mumbai' },
  { id: 'Asia/Dubai', label: 'Dubai' },
  // Australia
  { id: 'Australia/Sydney', label: 'Sydney' },
  { id: 'Australia/Melbourne', label: 'Melbourne' },
  { id: 'Australia/Perth', label: 'Perth' },
  // Other
  { id: 'UTC', label: 'UTC' },
];

export function TimezoneSelector({ value, onChange }: TimezoneSelectorProps) {
  // Get the user's local timezone
  const localTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  // Find the display name for the selected timezone
  const selectedLabel = useMemo(() => {
    const found = commonTimezones.find((tz) => tz.id === value);
    return found?.label || value;
  }, [value]);

  // Ensure local timezone is in the list
  const timezones = useMemo(() => {
    const hasLocal = commonTimezones.some((tz) => tz.id === localTimezone);
    if (hasLocal) {
      return commonTimezones;
    }
    return [{ id: localTimezone, label: `Local (${localTimezone})` }, ...commonTimezones];
  }, [localTimezone]);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">Timezone</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {timezones.map((tz) => (
          <option key={tz.id} value={tz.id}>
            {tz.label}
          </option>
        ))}
      </select>
      {value !== localTimezone && (
        <button
          type="button"
          onClick={() => onChange(localTimezone)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Use local timezone ({localTimezone})
        </button>
      )}
    </div>
  );
}

/**
 * Get the user's local timezone
 */
export function getLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
