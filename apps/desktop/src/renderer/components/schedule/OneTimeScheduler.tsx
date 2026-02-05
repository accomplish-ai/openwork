// apps/desktop/src/renderer/components/schedule/OneTimeScheduler.tsx

import { useState, useEffect } from 'react';

interface OneTimeSchedulerProps {
  value: string | undefined;
  onChange: (scheduledAt: string) => void;
}

export function OneTimeScheduler({ value, onChange }: OneTimeSchedulerProps) {
  const formatLocalDate = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Parse the ISO string to local date and time
  const parseIsoToLocal = (iso: string | undefined): { date: string; time: string } => {
    if (!iso) {
      // Default to now + 1 hour
      const defaultDate = new Date();
      defaultDate.setHours(defaultDate.getHours() + 1);
      defaultDate.setMinutes(0, 0, 0);
      return {
        date: formatLocalDate(defaultDate),
        time: defaultDate.toTimeString().slice(0, 5),
      };
    }
    const d = new Date(iso);
    return {
      date: formatLocalDate(d),
      time: d.toTimeString().slice(0, 5),
    };
  };

  const [localDate, setLocalDate] = useState(() => parseIsoToLocal(value).date);
  const [localTime, setLocalTime] = useState(() => parseIsoToLocal(value).time);

  // Update parent when local values change
  useEffect(() => {
    if (localDate && localTime) {
      const combined = new Date(`${localDate}T${localTime}`);
      if (!isNaN(combined.getTime())) {
        onChange(combined.toISOString());
      }
    }
  }, [localDate, localTime, onChange]);

  // Quick action buttons
  const setIn = (hours: number) => {
    const d = new Date();
    d.setHours(d.getHours() + hours);
    d.setMinutes(0, 0, 0);
    setLocalDate(formatLocalDate(d));
    setLocalTime(d.toTimeString().slice(0, 5));
  };

  const setTomorrow = (hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    setLocalDate(formatLocalDate(d));
    setLocalTime(d.toTimeString().slice(0, 5));
  };

  return (
    <div className="space-y-4">
      {/* Quick actions */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Quick select</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIn(1)}
            className="px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-muted"
          >
            In 1 hour
          </button>
          <button
            type="button"
            onClick={() => setIn(3)}
            className="px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-muted"
          >
            In 3 hours
          </button>
          <button
            type="button"
            onClick={() => setTomorrow(9)}
            className="px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-muted"
          >
            Tomorrow 9 AM
          </button>
          <button
            type="button"
            onClick={() => setTomorrow(17)}
            className="px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-muted"
          >
            Tomorrow 5 PM
          </button>
        </div>
      </div>

      {/* Date and time inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Date</label>
          <input
            type="date"
            value={localDate}
            onChange={(e) => setLocalDate(e.target.value)}
            min={formatLocalDate(new Date())}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Time</label>
          <input
            type="time"
            value={localTime}
            onChange={(e) => setLocalTime(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
