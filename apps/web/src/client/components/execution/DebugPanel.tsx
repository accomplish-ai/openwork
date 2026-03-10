import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Bug, Download, Check, Play, RefreshCw } from 'lucide-react';
import { CaretUp, CaretDown, Trash, MagnifyingGlass } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { getAccomplish } from '@/lib/accomplish';

export interface DebugLogEntry {
  taskId: string;
  timestamp: string;
  type: string;
  message: string;
  data?: unknown;
}

interface DebugPanelProps {
  debugLogs: DebugLogEntry[];
  taskId: string | undefined;
  onClearLogs: () => void;
  isTaskComplete?: boolean;
}

export function DebugPanel({ debugLogs, taskId, onClearLogs, isTaskComplete }: DebugPanelProps) {
  const navigate = useNavigate();
  const accomplish = useMemo(() => {
    try {
      return getAccomplish();
    } catch (error) {
      console.error('[DebugPanel] Accomplish API not available:', error);
      return null;
    }
  }, []);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [debugExported, setDebugExported] = useState(false);
  const [bugReportStatus, setBugReportStatus] = useState<
    'idle' | 'generating' | 'success' | 'error'
  >('idle');
  const [bugReportGenerating, setBugReportGenerating] = useState(false);
  const [repeatTaskLoading, setRepeatTaskLoading] = useState(false);
  const bugReportResetTimeoutRef = useRef<number | null>(null);
  const [debugSearchQuery, setDebugSearchQuery] = useState('');
  const [debugSearchIndex, setDebugSearchIndex] = useState(0);
  const debugPanelRef = useRef<HTMLDivElement>(null);
  const debugSearchInputRef = useRef<HTMLInputElement>(null);
  const debugLogRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const filteredDebugLogs = useMemo(() => {
    if (!debugSearchQuery.trim()) return debugLogs;
    const query = debugSearchQuery.toLowerCase();
    return debugLogs.filter(
      (log) =>
        log.message.toLowerCase().includes(query) ||
        log.type.toLowerCase().includes(query) ||
        (log.data !== undefined &&
          (typeof log.data === 'string' ? log.data : JSON.stringify(log.data))
            .toLowerCase()
            .includes(query)),
    );
  }, [debugLogs, debugSearchQuery]);

  const handleSearchChange = useCallback((value: string) => {
    setDebugSearchQuery(value);
    setDebugSearchIndex(0);
  }, []);

  useEffect(() => {
    return () => {
      if (bugReportResetTimeoutRef.current !== null) {
        clearTimeout(bugReportResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (debugPanelOpen && debugPanelRef.current) {
      debugPanelRef.current.scrollTop = debugPanelRef.current.scrollHeight;
    }
  }, [debugLogs.length, debugPanelOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && debugPanelOpen) {
        e.preventDefault();
        debugSearchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [debugPanelOpen]);

  const goToNextMatch = useCallback(() => {
    if (filteredDebugLogs.length === 0) return;
    const nextIndex = (debugSearchIndex + 1) % filteredDebugLogs.length;
    setDebugSearchIndex(nextIndex);
    const rowEl = debugLogRefs.current.get(nextIndex);
    rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [filteredDebugLogs.length, debugSearchIndex]);

  const goToPrevMatch = useCallback(() => {
    if (filteredDebugLogs.length === 0) return;
    const prevIndex = (debugSearchIndex - 1 + filteredDebugLogs.length) % filteredDebugLogs.length;
    setDebugSearchIndex(prevIndex);
    const rowEl = debugLogRefs.current.get(prevIndex);
    rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [filteredDebugLogs.length, debugSearchIndex]);

  const highlightText = useCallback((text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-500/40 text-yellow-200 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  }, []);

  const getBugReportLabel = useCallback(() => {
    if (bugReportStatus === 'generating') {
      return 'Generating...';
    }
    if (bugReportStatus === 'success') {
      return 'Saved!';
    }
    if (bugReportStatus === 'error') {
      return 'Error';
    }
    return 'Bug Report';
  }, [bugReportStatus]);

  const BUG_REPORT_CLASS_MAP: Record<'idle' | 'generating' | 'success' | 'error', string> = {
    idle: 'text-zinc-400 hover:text-zinc-200',
    generating: 'text-zinc-400 hover:text-zinc-200',
    success: 'text-green-400 hover:text-green-300',
    error: 'text-red-400 hover:text-red-300',
  };

  const BUG_REPORT_ICON_MAP = {
    idle: Bug,
    generating: RefreshCw,
    success: Check,
    error: Bug,
  };

  const BugReportIcon = BUG_REPORT_ICON_MAP[bugReportStatus];
  const bugReportIconClass = cn('h-3 w-3 mr-1', bugReportStatus === 'generating' && 'animate-spin');

  const handleGenerateBugReport = useCallback(async () => {
    if (!taskId || bugReportGenerating || !accomplish?.generateBugReport) {
      return;
    }
    if (bugReportResetTimeoutRef.current !== null) {
      clearTimeout(bugReportResetTimeoutRef.current);
      bugReportResetTimeoutRef.current = null;
    }
    setBugReportGenerating(true);
    setBugReportStatus('generating');
    try {
      const result = await accomplish.generateBugReport(taskId, debugLogs);
      if (result.success) {
        setBugReportStatus('success');
        bugReportResetTimeoutRef.current = window.setTimeout(() => {
          setBugReportStatus('idle');
          bugReportResetTimeoutRef.current = null;
        }, 2000);
      } else if (result.reason === 'cancelled') {
        setBugReportStatus('idle');
      } else {
        console.error('[Bug Report] Generation failed:', result.error);
        setBugReportStatus('error');
        bugReportResetTimeoutRef.current = window.setTimeout(() => {
          setBugReportStatus('idle');
          bugReportResetTimeoutRef.current = null;
        }, 3000);
      }
    } catch (error) {
      console.error('[Bug Report] Generation failed:', error);
      setBugReportStatus('error');
      bugReportResetTimeoutRef.current = window.setTimeout(() => {
        setBugReportStatus('idle');
        bugReportResetTimeoutRef.current = null;
      }, 3000);
    } finally {
      setBugReportGenerating(false);
    }
  }, [taskId, bugReportGenerating, accomplish, debugLogs]);

  const handleRepeatTask = useCallback(async () => {
    if (!taskId || repeatTaskLoading || !accomplish?.repeatTask) {
      return;
    }
    setRepeatTaskLoading(true);
    try {
      const newTask = (await accomplish.repeatTask(taskId)) as { id: string };
      navigate(`/execution/${newTask.id}`);
    } catch (error) {
      console.error('[Repeat Task] Failed:', error);
    } finally {
      setRepeatTaskLoading(false);
    }
  }, [taskId, repeatTaskLoading, accomplish, navigate]);

  const handleExportDebugLogs = useCallback(() => {
    const text = debugLogs
      .map((log) => {
        const dataStr =
          log.data !== undefined
            ? ` ${typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}`
            : '';
        return `${new Date(log.timestamp).toISOString()} [${log.type}] ${log.message}${dataStr}`;
      })
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${taskId}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDebugExported(true);
    setTimeout(() => setDebugExported(false), 2000);
  }, [debugLogs, taskId]);

  return (
    <div className="flex-shrink-0 border-t border-border" data-testid="debug-panel">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDebugPanelOpen(!debugPanelOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDebugPanelOpen(!debugPanelOpen);
          }
        }}
        className="w-full flex items-center justify-between px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Bug className="h-4 w-4" />
          <span className="font-medium">Debug Logs</span>
          {debugLogs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-300 text-xs">
              {debugSearchQuery.trim() && filteredDebugLogs.length !== debugLogs.length
                ? `${filteredDebugLogs.length} of ${debugLogs.length}`
                : debugLogs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {debugLogs.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-6 px-2 text-xs hover:bg-zinc-700',
                  BUG_REPORT_CLASS_MAP[bugReportStatus],
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleGenerateBugReport();
                }}
                disabled={bugReportGenerating}
                data-testid="debug-bug-report-button"
              >
                <BugReportIcon className={bugReportIconClass} />
                {getBugReportLabel()}
              </Button>
              {isTaskComplete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRepeatTask();
                  }}
                  disabled={repeatTaskLoading}
                  data-testid="debug-repeat-task-button"
                >
                  {repeatTaskLoading ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3 mr-1" />
                  )}
                  Repeat Task
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExportDebugLogs();
                }}
              >
                {debugExported ? (
                  <Check className="h-3 w-3 mr-1 text-green-400" />
                ) : (
                  <Download className="h-3 w-3 mr-1" />
                )}
                {debugExported ? 'Exported' : 'Export'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearLogs();
                }}
              >
                <Trash className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </>
          )}
          {debugPanelOpen ? (
            <CaretDown className="h-4 w-4 text-zinc-500" />
          ) : (
            <CaretUp className="h-4 w-4 text-zinc-500" />
          )}
        </div>
      </div>

      <AnimatePresence>
        {debugPanelOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 200, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="h-[200px] flex flex-col bg-zinc-950">
              <div className="flex items-center justify-end gap-2 p-2 border-b border-zinc-800 shrink-0">
                {debugSearchQuery.trim() && filteredDebugLogs.length > 0 && (
                  <span className="text-xs text-zinc-500">
                    {debugSearchIndex + 1} of {filteredDebugLogs.length}
                  </span>
                )}
                {debugSearchQuery.trim() && filteredDebugLogs.length > 0 && (
                  <div className="flex">
                    <button
                      onClick={goToPrevMatch}
                      className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-l border border-zinc-700 border-r-0"
                      title="Previous match (Shift+Enter)"
                    >
                      <CaretUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={goToNextMatch}
                      className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-r border border-zinc-700"
                      title="Next match (Enter)"
                    >
                      <CaretDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="relative">
                  <MagnifyingGlass className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
                  <input
                    ref={debugSearchInputRef}
                    type="text"
                    value={debugSearchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && debugSearchQuery.trim()) {
                        e.preventDefault();
                        if (e.shiftKey) {
                          goToPrevMatch();
                        } else {
                          goToNextMatch();
                        }
                      }
                    }}
                    placeholder="Search logs... (⌘F)"
                    className="h-7 w-52 pl-7 pr-2 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
                    data-testid="debug-search-input"
                  />
                </div>
              </div>
              <div
                ref={debugPanelRef}
                className="flex-1 overflow-y-auto text-zinc-300 font-mono text-xs p-4"
              >
                {debugLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-zinc-500">
                    No debug logs yet. Run a task to see logs.
                  </div>
                ) : filteredDebugLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-zinc-500">
                    No logs match your search
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredDebugLogs.map((log, index) => (
                      <div
                        key={index}
                        ref={(el) => {
                          if (el) debugLogRefs.current.set(index, el);
                          else debugLogRefs.current.delete(index);
                        }}
                        className={cn(
                          'flex gap-2 px-1 -mx-1 rounded',
                          debugSearchQuery.trim() &&
                            index === debugSearchIndex &&
                            'bg-zinc-800/80 ring-1 ring-zinc-600',
                        )}
                      >
                        <span className="text-zinc-500 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 px-1 rounded',
                            log.type === 'error'
                              ? 'bg-red-500/20 text-red-400'
                              : log.type === 'warn'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : log.type === 'info'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-zinc-700 text-zinc-400',
                          )}
                        >
                          [{highlightText(log.type, debugSearchQuery)}]
                        </span>
                        <span className="text-zinc-300 break-all">
                          {highlightText(log.message, debugSearchQuery)}
                          {log.data !== undefined && (
                            <span className="text-zinc-500 ml-2">
                              {highlightText(
                                typeof log.data === 'string'
                                  ? log.data
                                  : JSON.stringify(log.data, null, 0),
                                debugSearchQuery,
                              )}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
