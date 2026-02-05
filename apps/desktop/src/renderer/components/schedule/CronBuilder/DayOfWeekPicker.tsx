// apps/desktop/src/renderer/components/schedule/CronBuilder/DayOfWeekPicker.tsx

interface DayOfWeekPickerProps {
  selected: number[];
  onChange: (days: number[]) => void;
}

const days = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export function DayOfWeekPicker({ selected, onChange }: DayOfWeekPickerProps) {
  const toggleDay = (day: number) => {
    if (selected.includes(day)) {
      // Don't allow deselecting if only one day is selected
      if (selected.length === 1) return;
      onChange(selected.filter((d) => d !== day));
    } else {
      onChange([...selected, day].sort((a, b) => a - b));
    }
  };

  const selectWeekdays = () => {
    onChange([1, 2, 3, 4, 5]);
  };

  const selectWeekends = () => {
    onChange([0, 6]);
  };

  const selectAll = () => {
    onChange([0, 1, 2, 3, 4, 5, 6]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Days</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={selectWeekdays}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Weekdays
          </button>
          <span className="text-muted-foreground">|</span>
          <button
            type="button"
            onClick={selectWeekends}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Weekends
          </button>
          <span className="text-muted-foreground">|</span>
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            All
          </button>
        </div>
      </div>
      <div className="flex gap-1">
        {days.map((day) => (
          <button
            key={day.value}
            type="button"
            onClick={() => toggleDay(day.value)}
            className={`flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors ${
              selected.includes(day.value)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input hover:bg-muted'
            }`}
          >
            {day.label}
          </button>
        ))}
      </div>
    </div>
  );
}
