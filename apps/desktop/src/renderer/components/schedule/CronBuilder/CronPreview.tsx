// apps/desktop/src/renderer/components/schedule/CronBuilder/CronPreview.tsx

import { useMemo } from 'react';
import cronstrue from 'cronstrue';
import { Clock } from 'lucide-react';

interface CronPreviewProps {
  cron: string;
  timezone?: string;
}

export function CronPreview({ cron, timezone }: CronPreviewProps) {
  const description = useMemo(() => {
    try {
      return cronstrue.toString(cron, {
        use24HourTimeFormat: false,
        verbose: true,
      });
    } catch {
      return null;
    }
  }, [cron]);

  if (!description) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
        <Clock className="h-4 w-4" />
        <span>Invalid cron expression</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 text-sm bg-muted/50 px-3 py-2 rounded-md">
      <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div>
        <span className="text-foreground">{description}</span>
        {timezone && <span className="text-muted-foreground ml-1">({timezone})</span>}
      </div>
    </div>
  );
}
