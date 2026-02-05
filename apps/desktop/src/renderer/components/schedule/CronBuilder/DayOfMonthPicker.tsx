// apps/desktop/src/renderer/components/schedule/CronBuilder/DayOfMonthPicker.tsx

interface DayOfMonthPickerProps {
  value: number;
  onChange: (day: number) => void;
}

export function DayOfMonthPicker({ value, onChange }: DayOfMonthPickerProps) {
  // Generate day options (1-31)
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  // Format day with ordinal suffix
  const formatDay = (day: number): string => {
    const suffix =
      day === 1 || day === 21 || day === 31
        ? 'st'
        : day === 2 || day === 22
          ? 'nd'
          : day === 3 || day === 23
            ? 'rd'
            : 'th';
    return `${day}${suffix}`;
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">Day of month</label>
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {days.map((day) => (
          <option key={day} value={day}>
            {formatDay(day)}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        Note: If the selected day doesn't exist in a month (e.g., 31st in February), the task will
        run on the last day of that month.
      </p>
    </div>
  );
}
