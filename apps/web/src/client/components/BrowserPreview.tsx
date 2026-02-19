import { useEffect, useRef, useCallback, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Loader2, AlertCircle, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { springs } from '../lib/animations';
import type { BrowserFramePayload, BrowserStatusPayload } from '@accomplish_ai/agent-core/common';

interface BrowserPreviewProps {
  pageName: string;
  className?: string;
}

type ViewStatus = 'idle' | 'starting' | 'streaming' | 'stopping' | 'error';

export const BrowserPreview = memo(function BrowserPreview({
  pageName,
  className,
}: BrowserPreviewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const lastUrlRef = useRef<string>('');
  const [status, setStatus] = useState<ViewStatus>('starting');
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [error, setError] = useState<string | undefined>();

  const handleFrame = useCallback((frame: BrowserFramePayload) => {
    if (imgRef.current) {
      imgRef.current.src = `data:image/jpeg;base64,${frame.data}`;
    }
    if (frame.pageUrl && frame.pageUrl !== lastUrlRef.current) {
      lastUrlRef.current = frame.pageUrl;
      setCurrentUrl(frame.pageUrl);
    }
  }, []);

  const handleStatus = useCallback((payload: BrowserStatusPayload) => {
    setStatus(payload.status as ViewStatus);
    if (payload.error) {
      setError(payload.error);
    } else {
      setError(undefined);
    }
  }, []);

  useEffect(() => {
    const api = window.accomplish;
    if (!api?.startBrowserScreencast || !api.onBrowserFrame || !api.onBrowserStatus) {
      return;
    }

    const unsubFrame = api.onBrowserFrame(handleFrame);
    const unsubStatus = api.onBrowserStatus(handleStatus);

    api.startBrowserScreencast(pageName).catch((err: Error) => {
      console.error('[BrowserPreview] Failed to start screencast:', err);
      setStatus('error');
      setError(err.message);
    });

    return () => {
      unsubFrame();
      unsubStatus();
      api.stopBrowserScreencast?.().catch((err: unknown) => {
        console.error('[BrowserPreview] Failed to stop screencast:', err);
      });
    };
  }, [pageName, handleFrame, handleStatus]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className={cn('bg-muted border border-border rounded-2xl overflow-hidden', className)}
    >
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/60">
        <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs text-muted-foreground truncate flex-1 font-mono">
          {currentUrl || pageName}
        </span>
        <StatusIndicator status={status} />
      </div>

      {/* Content area */}
      <div className="relative aspect-video bg-black">
        <AnimatePresence mode="wait">
          {status === 'streaming' || status === 'starting' ? (
            <motion.div
              key="frame"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full"
            >
              <img
                ref={imgRef}
                alt="Browser preview"
                className="w-full h-full object-contain"
                draggable={false}
              />
              {status === 'starting' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="flex items-center gap-2 text-white/80">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Connecting...</span>
                  </div>
                </div>
              )}
            </motion.div>
          ) : status === 'error' ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-2 text-destructive/80">
                <AlertCircle className="h-8 w-8" />
                <span className="text-sm">{error ?? 'Stream error'}</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
                <Monitor className="h-8 w-8" />
                <span className="text-sm">No active preview</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

function StatusIndicator({ status }: { status: ViewStatus }) {
  const colors: Record<ViewStatus, string> = {
    idle: 'bg-muted-foreground/40',
    starting: 'bg-yellow-400 animate-pulse',
    streaming: 'bg-green-500',
    stopping: 'bg-yellow-400 animate-pulse',
    error: 'bg-destructive',
  };

  return <span className={cn('h-2 w-2 rounded-full shrink-0', colors[status])} title={status} />;
}
