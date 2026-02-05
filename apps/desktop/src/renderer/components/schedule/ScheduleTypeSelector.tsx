// apps/desktop/src/renderer/components/schedule/ScheduleTypeSelector.tsx

import type { ScheduleType } from '@accomplish/shared';
import { Clock, Repeat } from 'lucide-react';

interface ScheduleTypeSelectorProps {
  value: ScheduleType;
  onChange: (type: ScheduleType) => void;
}

export function ScheduleTypeSelector({ value, onChange }: ScheduleTypeSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">Schedule type</label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange('one-time')}
          className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
            value === 'one-time'
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-background border-input hover:bg-muted'
          }`}
        >
          <Clock className="h-4 w-4" />
          <div className="text-left">
            <div className="text-sm font-medium">Run once</div>
            <div className="text-xs text-muted-foreground">At a specific time</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChange('recurring')}
          className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
            value === 'recurring'
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-background border-input hover:bg-muted'
          }`}
        >
          <Repeat className="h-4 w-4" />
          <div className="text-left">
            <div className="text-sm font-medium">Recurring</div>
            <div className="text-xs text-muted-foreground">On a schedule</div>
          </div>
        </button>
      </div>
    </div>
  );
}
