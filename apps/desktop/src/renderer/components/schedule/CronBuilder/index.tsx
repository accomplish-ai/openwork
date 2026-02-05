// apps/desktop/src/renderer/components/schedule/CronBuilder/index.tsx

import type { CronBuilderState } from '@accomplish/shared';
import { builderToCron } from './utils';
import { FrequencySelector } from './FrequencySelector';
import { TimePicker } from './TimePicker';
import { DayOfWeekPicker } from './DayOfWeekPicker';
import { DayOfMonthPicker } from './DayOfMonthPicker';
import { CronPreview } from './CronPreview';

interface CronBuilderProps {
  value: CronBuilderState;
  onChange: (state: CronBuilderState) => void;
  timezone?: string;
}

export function CronBuilder({ value, onChange, timezone }: CronBuilderProps) {
  const cronExpression = builderToCron(value);

  const handleFrequencyChange = (frequency: CronBuilderState['frequency']) => {
    onChange({ ...value, frequency });
  };

  const handleTimeChange = (hour: number, minute: number) => {
    onChange({ ...value, hour, minute });
  };

  const handleDaysOfWeekChange = (daysOfWeek: number[]) => {
    onChange({ ...value, daysOfWeek });
  };

  const handleDayOfMonthChange = (dayOfMonth: number) => {
    onChange({ ...value, dayOfMonth });
  };

  return (
    <div className="space-y-4">
      <FrequencySelector value={value.frequency} onChange={handleFrequencyChange} />

      {value.frequency === 'hourly' && (
        <TimePicker
          hour={value.hour}
          minute={value.minute}
          onChange={handleTimeChange}
          showMinuteOnly
        />
      )}

      {value.frequency === 'daily' && (
        <TimePicker hour={value.hour} minute={value.minute} onChange={handleTimeChange} />
      )}

      {value.frequency === 'weekly' && (
        <>
          <DayOfWeekPicker selected={value.daysOfWeek} onChange={handleDaysOfWeekChange} />
          <TimePicker hour={value.hour} minute={value.minute} onChange={handleTimeChange} />
        </>
      )}

      {value.frequency === 'monthly' && (
        <>
          <DayOfMonthPicker value={value.dayOfMonth} onChange={handleDayOfMonthChange} />
          <TimePicker hour={value.hour} minute={value.minute} onChange={handleTimeChange} />
        </>
      )}

      {/* Always show preview */}
      <CronPreview cron={cronExpression} timezone={timezone} />
    </div>
  );
}

// Re-export sub-components for potential individual use
export { FrequencySelector } from './FrequencySelector';
export { TimePicker } from './TimePicker';
export { DayOfWeekPicker } from './DayOfWeekPicker';
export { DayOfMonthPicker } from './DayOfMonthPicker';
export { CronPreview } from './CronPreview';
