'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, Minimize2, Maximize2, Globe, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BrowserFrame {
  taskId: string;
  data: string; // base64 JPEG/PNG
  url?: string;
  title?: string;
  timestamp: number;
}

interface BrowserPreviewPanelProps {
  taskId: string;
  isRunning: boolean;
}

export function BrowserPreviewPanel({ taskId, isRunning }: BrowserPreviewPanelProps) {
  const [frame, setFrame] = useState<BrowserFrame | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBrowserFrame = useCallback(
    (data: BrowserFrame) => {
      if (data.taskId === taskId) {
        setFrame(data);
        setDismissed(false);
        setIsStale(false);

        if (staleTimerRef.current) {
          clearTimeout(staleTimerRef.current);
        }
        staleTimerRef.current = setTimeout(() => {
          setIsStale(true);
        }, 10000);
      }
    },
    [taskId],
  );

  useEffect(() => {
    if (!window.accomplish?.onBrowserFrame) {
      return;
    }

    const unsubscribe = window.accomplish.onBrowserFrame(handleBrowserFrame);

    return () => {
      unsubscribe();
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
      }
    };
  }, [handleBrowserFrame]);

  // Derive stale state from isRunning — when the task stops, mark stale immediately
  const derivedIsStale = isStale || !isRunning;

  const handleRequestScreenshot = useCallback(() => {
    if (window.accomplish?.requestBrowserScreenshot) {
      window.accomplish.requestBrowserScreenshot(taskId);
    }
  }, [taskId]);

  if (!frame || dismissed) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: collapsed ? 48 : 400, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="border-l border-border bg-background flex flex-col overflow-hidden shrink-0"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
          {!collapsed && (
            <>
              <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">
                  {frame.title || 'Browser'}
                </div>
                {frame.url && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                    <Globe className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{frame.url}</span>
                  </div>
                )}
              </div>
            </>
          )}
          <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
            {!collapsed && (
              <button
                onClick={handleRequestScreenshot}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="Refresh screenshot"
              >
                <RefreshCw
                  className={cn('h-3 w-3 text-muted-foreground', !derivedIsStale && 'animate-spin')}
                />
              </button>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 rounded hover:bg-muted transition-colors"
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? (
                <Maximize2 className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Minimize2 className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
            {!collapsed && (
              <button
                onClick={() => setDismissed(true)}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="Close preview"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Preview image */}
        {!collapsed && (
          <div className="flex-1 overflow-auto p-2">
            <div className="relative rounded-md overflow-hidden border border-border/50 bg-muted/20">
              <img
                src={
                  frame.data.startsWith('data:')
                    ? frame.data
                    : `data:image/png;base64,${frame.data}`
                }
                alt="Browser preview"
                className="w-full h-auto"
              />
              {derivedIsStale && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3" />
                    Paused
                  </div>
                </div>
              )}
            </div>
            <div className="mt-2 text-[10px] text-muted-foreground text-center">
              Live browser view — updates as the agent works
            </div>
          </div>
        )}

        {/* Collapsed view */}
        {collapsed && (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={() => setCollapsed(false)}
              className="p-2 rounded hover:bg-muted transition-colors"
              title="Show browser preview"
            >
              <Monitor className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
