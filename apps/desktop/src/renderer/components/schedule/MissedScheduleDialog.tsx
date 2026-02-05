/**
 * MissedScheduleDialog - Notifies the user about one-time schedules
 * that were due while the app was offline.
 *
 * The user can choose to run each missed schedule now or dismiss it.
 */

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Clock, Play, X } from 'lucide-react';
import type { MissedScheduleInfo } from '@accomplish/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { getAccomplish } from '../../lib/accomplish';

export function MissedScheduleDialog() {
  const [missedSchedules, setMissedSchedules] = useState<MissedScheduleInfo[]>([]);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const isOpen = missedSchedules.length > 0;

  useEffect(() => {
    const accomplish = getAccomplish();
    if (!accomplish.onScheduleMissed) return;

    const cleanup = accomplish.onScheduleMissed((schedules) => {
      if (schedules.length > 0) {
        setMissedSchedules(schedules);
      }
    });

    return cleanup;
  }, []);

  const handleRunNow = useCallback(async (scheduleId: string) => {
    setProcessingIds((prev) => new Set(prev).add(scheduleId));
    try {
      const accomplish = getAccomplish();
      await accomplish.scheduler.runScheduleNow(scheduleId);
      setMissedSchedules((prev) => prev.filter((m) => m.schedule.id !== scheduleId));
    } catch (error) {
      console.error('[MissedScheduleDialog] Failed to run schedule:', error);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(scheduleId);
        return next;
      });
    }
  }, []);

  const handleDismiss = useCallback(async (scheduleId: string) => {
    setProcessingIds((prev) => new Set(prev).add(scheduleId));
    try {
      const accomplish = getAccomplish();
      await accomplish.scheduler.dismissMissedSchedule(scheduleId);
      setMissedSchedules((prev) => prev.filter((m) => m.schedule.id !== scheduleId));
    } catch (error) {
      console.error('[MissedScheduleDialog] Failed to dismiss schedule:', error);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(scheduleId);
        return next;
      });
    }
  }, []);

  const handleDismissAll = useCallback(async () => {
    const ids = missedSchedules.map((m) => m.schedule.id);
    setProcessingIds(new Set(ids));
    try {
      const accomplish = getAccomplish();
      await Promise.all(ids.map((id) => accomplish.scheduler.dismissMissedSchedule(id)));
      setMissedSchedules([]);
    } catch (error) {
      console.error('[MissedScheduleDialog] Failed to dismiss all:', error);
    } finally {
      setProcessingIds(new Set());
    }
  }, [missedSchedules]);

  const handleClose = useCallback((open: boolean) => {
    if (!open) {
      // Dismiss all remaining when closing the dialog
      handleDismissAll();
    }
  }, [handleDismissAll]);

  const formatMissedTime = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }
    if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    }
    if (diffMins > 0) {
      return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    }
    return 'just now';
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Missed Schedule{missedSchedules.length > 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            {missedSchedules.length === 1
              ? 'A scheduled task was due while the app was closed. Would you like to run it now?'
              : `${missedSchedules.length} scheduled tasks were due while the app was closed.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-64 overflow-y-auto py-2">
          {missedSchedules.map(({ schedule, missedAt }) => {
            const isProcessing = processingIds.has(schedule.id);

            return (
              <div
                key={schedule.id}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {schedule.prompt}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    Was due {formatMissedTime(missedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDismiss(schedule.id)}
                    disabled={isProcessing}
                    title="Dismiss"
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleRunNow(schedule.id)}
                    disabled={isProcessing}
                    title="Run now"
                    className="h-8 gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Run
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleDismissAll} disabled={processingIds.size > 0}>
            Dismiss All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
