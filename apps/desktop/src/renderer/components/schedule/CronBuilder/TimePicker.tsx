// apps/desktop/src/renderer/components/schedule/CronBuilder/TimePicker.tsx

interface TimePickerProps {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  showMinuteOnly?: boolean;
}

export function TimePicker({ hour, minute, onChange, showMinuteOnly }: TimePickerProps) {
  // Generate hour options (0-23)
  const hours = Array.from({ length: 24 }, (_, i) => i);
  // Generate minute options (0-59, in 5-minute increments for convenience)
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

  // Format hour for display (12-hour format with AM/PM)
  const formatHour = (h: number): string => {
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${h12} ${ampm}`;
  };

  // Format minute for display
  const formatMinute = (m: number): string => {
    return m.toString().padStart(2, '0');
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">
        {showMinuteOnly ? 'At minute' : 'Time'}
      </label>
      <div className="flex gap-2">
        {!showMinuteOnly && (
          <select
            value={hour}
            onChange={(e) => onChange(parseInt(e.target.value, 10), minute)}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {hours.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        )}
        <select
          value={minute}
          onChange={(e) => onChange(hour, parseInt(e.target.value, 10))}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {minutes.map((m) => (
            <option key={m} value={m}>
              :{formatMinute(m)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
