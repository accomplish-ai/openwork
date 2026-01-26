import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ChevronUp } from 'lucide-react';
import { useHealthStore, setupHealthListeners } from '../stores/healthStore';
import type { ComponentHealth } from '@accomplish/shared';
import { cn } from '@/lib/utils';

interface StatusIndicatorProps {
  status: string;
}

function StatusIndicator({ status }: StatusIndicatorProps) {
  const colors = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    failed: 'bg-red-500',
    checking: 'bg-muted-foreground/50',
    pending: 'bg-muted-foreground/30',
  };

  const color = colors[status as keyof typeof colors] || colors.pending;

  return (
    <span className={cn('w-2 h-2 rounded-full shrink-0', color)} />
  );
}

interface ComponentItemProps {
  component: ComponentHealth;
}

function ComponentItem({ component }: ComponentItemProps) {
  const [showDetails, setShowDetails] = useState(false);
  const hasError = Boolean(component.error);

  const statusIcons = {
    healthy: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    degraded: <AlertCircle className="h-4 w-4 text-yellow-600" />,
    failed: <AlertCircle className="h-4 w-4 text-red-600" />,
    checking: <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />,
    pending: <Loader2 className="h-4 w-4 text-muted-foreground/50" />,
  };

  const Icon = statusIcons[component.status as keyof typeof statusIcons] || statusIcons.pending;

  return (
    <div className="py-3 border-b border-border last:border-b-0">
      <button
        className={cn(
          'w-full flex items-center gap-3 text-left',
          hasError && 'cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded-md transition-colors'
        )}
        onClick={() => hasError && setShowDetails(!showDetails)}
        disabled={!hasError}
      >
        {Icon}
        <span className="text-sm font-medium text-foreground flex-1">
          {component.displayName}
        </span>
      </button>

      <AnimatePresence>
        {hasError && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 ml-7 space-y-2">
              <div className="text-xs text-red-600 font-medium">
                {component.error?.message}
              </div>
              <div className="text-xs text-muted-foreground">
                {component.error?.guidance}
              </div>

              {showDetails && component.error?.debugInfo && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mt-3 bg-muted border border-border rounded-lg p-3 space-y-2"
                >
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Debug Info
                  </div>
                  <pre className="text-[10px] text-foreground/80 overflow-x-auto whitespace-pre-wrap break-words font-mono">
                    {JSON.stringify(component.error.debugInfo, null, 2)}
                  </pre>
                  <button
                    className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(JSON.stringify(component.error, null, 2));
                    }}
                  >
                    Copy to Clipboard
                  </button>
                </motion.div>
              )}

              {!showDetails && (
                <button
                  className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDetails(true);
                  }}
                >
                  Show Details
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function StatusBar() {
  const { health, progressMessage, isExpanded, setExpanded, loadHealth, retry } = useHealthStore();

  useEffect(() => {
    setupHealthListeners();
    loadHealth();
  }, [loadHealth]);

  if (!health) {
    return null;
  }

  const failedCount = health.components.filter(c => c.status === 'failed').length;
  const degradedCount = health.components.filter(c => c.status === 'degraded').length;
  const isChecking = health.isChecking;

  const statusText = isChecking
    ? 'Checking system...'
    : failedCount > 0
    ? `${failedCount} issue${failedCount !== 1 ? 's' : ''} detected`
    : degradedCount > 0
    ? `${degradedCount} warning${degradedCount !== 1 ? 's' : ''}`
    : 'All systems ready';

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[30%] min-w-[280px] max-w-[400px]">
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-full left-0 right-0 mb-1 max-h-[400px] bg-card border border-border rounded-lg shadow-lg"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 rounded-t-lg">
              <span className="text-sm font-semibold text-foreground">System Health</span>
              <button
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md',
                  'border border-border bg-background',
                  'hover:bg-muted transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
                onClick={retry}
                disabled={isChecking}
              >
                <RefreshCw className={cn('h-3 w-3', isChecking && 'animate-spin')} />
                Retry
              </button>
            </div>
            <div className="overflow-y-auto max-h-[340px] px-4">
              {health.components.map(component => (
                <ComponentItem key={component.name} component={component} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        className={cn(
          'w-full flex items-center justify-between px-4 h-9',
          'bg-card border border-border rounded-lg shadow-sm',
          'hover:bg-muted/30 transition-colors',
          'disabled:cursor-wait'
        )}
        onClick={() => setExpanded(!isExpanded)}
        disabled={isChecking}
      >
        <div className="flex items-center gap-2.5">
          <StatusIndicator status={health.overall} />
          <span className="text-xs text-muted-foreground">{statusText}</span>
          {progressMessage && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <span className="text-xs text-muted-foreground/70">{progressMessage}</span>
            </>
          )}
        </div>
        <ChevronUp
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
            !isExpanded && 'rotate-180'
          )}
        />
      </button>
    </div>
  );
}
