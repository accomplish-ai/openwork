// apps/desktop/src/renderer/components/schedule/CronBuilder/FrequencySelector.tsx

import type { CronFrequency } from '@accomplish/shared';

interface FrequencySelectorProps {
  value: CronFrequency;
  onChange: (frequency: CronFrequency) => void;
}

const frequencies: { value: CronFrequency; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export function FrequencySelector({ value, onChange }: FrequencySelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">Frequency</label>
      <div className="flex flex-wrap gap-2">
        {frequencies.map((freq) => (
          <button
            key={freq.value}
            type="button"
            onClick={() => onChange(freq.value)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              value === freq.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input hover:bg-muted'
            }`}
          >
            {freq.label}
          </button>
        ))}
      </div>
    </div>
  );
}
