import { useEffect, useState, useRef } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DebugLog {
  taskId: string;
  timestamp: string;
  type: string;
  message: string;
  data?: unknown;
}

interface DebugLogsProps {
  taskId?: string;
  className?: string;
}

export function DebugLogs({ taskId, className }: DebugLogsProps) {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const accomplish = getAccomplish();

    const unsubscribe = accomplish.onDebugLog((log) => {
      const debugLog = log as DebugLog;
      
      // If taskId is provided, only show logs for that task
      if (taskId && debugLog.taskId !== taskId) {
        return;
      }

      setLogs((prev) => [...prev, debugLog]);

      // Auto-scroll to bottom
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 0);
    });

    return () => {
      unsubscribe();
    };
  }, [taskId]);

  if (logs.length === 0) {
    return (
      <Card className={cn('p-4', className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Terminal className="h-4 w-4" />
          <span className="text-sm">No debug logs yet. Logs will appear here when debug mode is enabled.</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn('p-0 overflow-hidden', className)}>
      <div className="bg-muted px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-foreground">
          <Terminal className="h-4 w-4" />
          <span className="text-sm font-medium">Debug Logs ({logs.length})</span>
        </div>
      </div>
      <ScrollArea className="h-[300px]">
        <div ref={scrollRef} className="p-4 space-y-2 font-mono text-xs">
          {logs.map((log, index) => (
            <div
              key={index}
              className="bg-muted/50 rounded-md p-2 border border-border"
            >
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={cn(
                  'shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase',
                  log.type === 'error' && 'bg-destructive/10 text-destructive',
                  log.type === 'warn' && 'bg-warning/10 text-warning',
                  log.type === 'info' && 'bg-blue-500/10 text-blue-600',
                  log.type === 'debug' && 'bg-muted-foreground/10 text-muted-foreground'
                )}>
                  {log.type}
                </span>
              </div>
              <div className="mt-1 text-foreground break-all">{log.message}</div>
              {log.data ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Show data
                  </summary>
                  <pre className="mt-1 text-muted-foreground whitespace-pre-wrap">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}
