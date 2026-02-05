// apps/desktop/src/renderer/components/schedule/ScheduleCard.tsx

import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  Repeat,
  Pause,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import cronstrue from 'cronstrue';
import type { ScheduledTask, Task, TaskStatus } from '@accomplish/shared';
import { Badge } from '@/components/ui/badge';
import { ScheduleActions } from './ScheduleActions';
import { getAccomplish } from '@/lib/accomplish';

interface ScheduleCardProps {
  schedule: ScheduledTask;
  onRunNow: () => void;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ScheduleCard({
  schedule,
  onRunNow,
  onToggle,
  onEdit,
  onDelete,
}: ScheduleCardProps) {
  // Update current time every 30 seconds to keep relative times fresh
  const [now, setNow] = useState(() => Date.now());
  
  // State for last task display
  const [lastTask, setLastTask] = useState<Task | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoadingTask, setIsLoadingTask] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Fetch last task details when lastTaskId exists
  useEffect(() => {
    if (schedule.lastTaskId) {
      setIsLoadingTask(true);
      getAccomplish()
        .getTask(schedule.lastTaskId)
        .then(setLastTask)
        .catch(() => setLastTask(null))
        .finally(() => setIsLoadingTask(false));
    } else {
      setLastTask(null);
    }
  }, [schedule.lastTaskId]);

  const formatInScheduleTimezone = (date: Date, options: Intl.DateTimeFormatOptions) => {
    try {
      return date.toLocaleString(undefined, { ...options, timeZone: schedule.timezone });
    } catch {
      return date.toLocaleString(undefined, options);
    }
  };

  // Format the cron expression to human-readable text
  const scheduleDescription = useMemo(() => {
    if (schedule.scheduleType === 'one-time') {
      if (schedule.scheduledAt) {
        const date = new Date(schedule.scheduledAt);
        return formatInScheduleTimezone(date, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
      }
      return 'One-time';
    }

    if (schedule.cronExpression) {
      try {
        return cronstrue.toString(schedule.cronExpression, {
          use24HourTimeFormat: false,
        });
      } catch {
        return schedule.cronExpression;
      }
    }

    return 'Unknown schedule';
  }, [schedule]);

  // Format next run time
  const nextRunText = useMemo(() => {
    if (!schedule.nextRunAt) return null;
    const date = new Date(schedule.nextRunAt);
    const diffMs = date.getTime() - now;

    if (diffMs < 0) return 'Overdue';
    if (diffMs < 60000) return 'In less than a minute';
    if (diffMs < 3600000) {
      const mins = Math.round(diffMs / 60000);
      return `In ${mins} minute${mins === 1 ? '' : 's'}`;
    }
    if (diffMs < 86400000) {
      const hours = Math.round(diffMs / 3600000);
      return `In ${hours} hour${hours === 1 ? '' : 's'}`;
    }

    return formatInScheduleTimezone(date, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }, [schedule.nextRunAt, schedule.timezone, now]);

  // Get status icon and color
  const StatusIcon = useMemo(() => {
    if (schedule.status === 'cancelled') return XCircle;
    if (schedule.executionStatus === 'running') return Clock;
    if (schedule.executionStatus === 'failed') return AlertCircle;
    if (schedule.status === 'completed') return CheckCircle2;
    if (!schedule.enabled || schedule.status === 'paused') return Pause;
    return schedule.scheduleType === 'recurring' ? Repeat : Clock;
  }, [schedule]);

  const statusColor = useMemo(() => {
    if (schedule.status === 'cancelled') return 'text-red-500';
    if (schedule.executionStatus === 'running') return 'text-blue-500';
    if (schedule.executionStatus === 'failed') return 'text-red-500';
    if (schedule.status === 'completed') return 'text-green-500';
    if (!schedule.enabled || schedule.status === 'paused') return 'text-muted-foreground';
    return 'text-blue-500';
  }, [schedule]);

  const isActive = schedule.status === 'active' && schedule.enabled;

  return (
    <div
      className={`p-4 rounded-lg border bg-card transition-colors ${
        isActive ? 'border-border' : 'border-border/50 opacity-75'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${statusColor}`}>
          <StatusIcon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Prompt */}
          <p className="font-medium text-foreground line-clamp-2">{schedule.prompt}</p>

          {/* Schedule description */}
          <p className="text-sm text-muted-foreground mt-1">{scheduleDescription}</p>

          {/* Next run / Status badges */}
          <div className="flex items-center gap-2 mt-2">
            {schedule.executionStatus === 'running' && (
              <Badge variant="default" className="text-xs">
                Running
              </Badge>
            )}
            {schedule.executionStatus === 'failed' && (
              <Badge variant="destructive" className="text-xs">
                Failed
              </Badge>
            )}
            {schedule.status === 'active' && schedule.executionStatus === 'completed' && schedule.lastRunAt && (
              <Badge variant="secondary" className="text-xs">
                Last: Completed
              </Badge>
            )}
            {schedule.status === 'active' && schedule.enabled && nextRunText && (
              <Badge variant="secondary" className="text-xs">
                Next: {nextRunText}
              </Badge>
            )}
            {schedule.status === 'completed' && (
              <Badge variant="secondary" className="text-xs">
                Completed
              </Badge>
            )}
            {schedule.status === 'cancelled' && (
              <Badge variant="destructive" className="text-xs">
                Cancelled
              </Badge>
            )}
            {schedule.status === 'active' && !schedule.enabled && (
              <Badge variant="secondary" className="text-xs">
                Paused
              </Badge>
            )}
            {schedule.lastRunAt && (
              <span className="text-xs text-muted-foreground">
                Last run:{' '}
                {formatInScheduleTimezone(new Date(schedule.lastRunAt), {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          {/* Expandable Last Task Section */}
          {schedule.lastTaskId && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                <span>Last execution</span>
              </button>

              {isExpanded && (
                <div className="mt-2 pl-5">
                  {isLoadingTask ? (
                    <div className="text-xs text-muted-foreground">Loading...</div>
                  ) : lastTask ? (
                    <div className="space-y-1.5">
                      {/* Task status and summary */}
                      <div className="flex items-start gap-2">
                        <TaskStatusBadge status={lastTask.status} />
                        <p className="text-xs text-foreground line-clamp-2 flex-1">
                          {lastTask.summary || lastTask.prompt}
                        </p>
                      </div>

                      {/* Completion time and view link */}
                      <div className="flex items-center justify-between">
                        {lastTask.completedAt && (
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(new Date(lastTask.completedAt), now)}
                          </span>
                        )}
                        <Link
                          to={`/execution/${lastTask.id}`}
                          className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1"
                        >
                          View details
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Task not found</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <ScheduleActions
          schedule={schedule}
          onRunNow={onRunNow}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

// Helper function to format relative time
function formatRelativeTime(date: Date, now: number): string {
  const diffMs = now - date.getTime();
  
  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) {
    const mins = Math.floor(diffMs / 60000);
    return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  }
  if (diffMs < 86400000) {
    const hours = Math.floor(diffMs / 3600000);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(diffMs / 86400000);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// Helper component for task status badge
function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const config: Record<TaskStatus, { label: string; variant: 'default' | 'secondary' | 'destructive'; icon?: typeof CheckCircle2 }> = {
    completed: { label: 'Completed', variant: 'secondary', icon: CheckCircle2 },
    failed: { label: 'Failed', variant: 'destructive', icon: AlertCircle },
    cancelled: { label: 'Cancelled', variant: 'secondary', icon: XCircle },
    interrupted: { label: 'Interrupted', variant: 'secondary', icon: AlertCircle },
    running: { label: 'Running', variant: 'default' },
    pending: { label: 'Pending', variant: 'secondary' },
    queued: { label: 'Queued', variant: 'secondary' },
    waiting_permission: { label: 'Waiting', variant: 'secondary' },
  };
  
  const { label, variant, icon: Icon } = config[status] || { label: status, variant: 'secondary' as const };
  
  return (
    <Badge variant={variant} className="text-xs flex items-center gap-1 shrink-0">
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </Badge>
  );
}
