import { useState, useCallback, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Bug, Play, Check, AlertCircle } from 'lucide-react';
import { getAccomplish } from '../lib/accomplish';
import type { TaskMessage } from '@accomplish_ai/agent-core/common';

type BugReportStatus = 'idle' | 'capturing' | 'saving' | 'saved' | 'error';

const STATUS_LABELS: Record<BugReportStatus, string> = {
  idle: 'Bug Report',
  capturing: 'Capturing...',
  saving: 'Saving...',
  saved: 'Saved',
  error: 'Failed',
};

const STATUS_ICONS_SM: Record<BugReportStatus, ReactNode> = {
  idle: <Bug className="h-3 w-3 mr-1" />,
  capturing: <Bug className="h-3 w-3 mr-1" />,
  saving: <Bug className="h-3 w-3 mr-1" />,
  saved: <Check className="h-3 w-3 mr-1 text-green-400" />,
  error: <AlertCircle className="h-3 w-3 mr-1 text-red-400" />,
};

const STATUS_ICONS: Record<BugReportStatus, ReactNode> = {
  idle: <Bug className="h-3.5 w-3.5 mr-1.5" />,
  capturing: <Bug className="h-3.5 w-3.5 mr-1.5" />,
  saving: <Bug className="h-3.5 w-3.5 mr-1.5" />,
  saved: <Check className="h-3.5 w-3.5 mr-1.5 text-green-600" />,
  error: <AlertCircle className="h-3.5 w-3.5 mr-1.5 text-red-600" />,
};

interface BugReportActionsProps {
  taskId?: string;
  taskPrompt?: string;
  taskStatus?: string;
  messages?: TaskMessage[];
  debugLogs?: unknown[];
  onRepeatTask?: () => void;
  compact?: boolean;
}

export function BugReportActions({
  taskId,
  taskPrompt,
  taskStatus,
  messages,
  debugLogs,
  onRepeatTask,
  compact = false,
}: BugReportActionsProps) {
  const [status, setStatus] = useState<BugReportStatus>('idle');
  const accomplish = getAccomplish();

  const handleBugReport = useCallback(async () => {
    setStatus('capturing');

    try {
      const [screenshotResult, axtreeResult] = await Promise.all([
        accomplish.captureScreenshot(),
        accomplish.captureAxtree(),
      ]);

      setStatus('saving');

      const result = await accomplish.generateBugReport({
        taskId,
        taskPrompt,
        taskStatus,
        messages,
        debugLogs,
        screenshot: screenshotResult.success ? screenshotResult.data : undefined,
        axtree: axtreeResult.success ? axtreeResult.data : undefined,
      });

      if (result.success) {
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
      } else if (result.reason === 'cancelled') {
        setStatus('idle');
      } else {
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [accomplish, taskId, taskPrompt, taskStatus, messages, debugLogs]);

  const label = STATUS_LABELS[status];
  const isWorking = status === 'capturing' || status === 'saving';

  if (compact) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
        onClick={(e) => {
          e.stopPropagation();
          handleBugReport();
        }}
        disabled={isWorking}
      >
        {STATUS_ICONS_SM[status]}
        {label}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBugReport}
            disabled={isWorking}
          >
            {STATUS_ICONS[status]}
            {label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>Capture screenshot, accessibility tree, and task data</span>
        </TooltipContent>
      </Tooltip>

      {onRepeatTask && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onRepeatTask}
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Repeat Task
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>Run the same task again</span>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
