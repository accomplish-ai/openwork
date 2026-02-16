import { useEffect, useState, useRef, useCallback } from 'react';
import { Globe, ChevronDown, ChevronUp, X, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BrowserPreviewProps {
  /** The currently active tool name (e.g. "browser_navigate"). When a browser tool
   *  is detected, the component auto-starts the screencast relay. */
  currentTool?: string | null;
}

/**
 * BrowserPreview — live CDP screencast embedded in the chat.
 *
 * Receives base64 JPEG frames from the main process via IPC,
 * along with URL navigation and loading-state events.
 *
 * Features:
 *  - Auto-starts screencast when a browser_* tool is active
 *  - Collapsible / expandable
 *  - URL bar showing current page
 *  - Loading spinner
 *  - "Pop out" button to open URL in system browser
 *  - Pauses frame updates when the document/tab is hidden
 *  - Fades in when first frame arrives, fades out on close
 */
export const BrowserPreview = ({ currentTool }: BrowserPreviewProps) => {
  const [frameData, setFrameData] = useState<string | null>(null);
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const isPausedRef = useRef(false);
  const screencastStartedRef = useRef(false);

  // Track document visibility to pause updates when hidden
  useEffect(() => {
    const handleVisibility = () => {
      isPausedRef.current = document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Auto-start screencast when a browser tool becomes active
  useEffect(() => {
    if (!currentTool) return;
    // Only trigger for browser_* tools (but not browser_screencast itself)
    const isBrowserTool = currentTool.startsWith('browser_') && currentTool !== 'browser_screencast';
    if (!isBrowserTool) return;
    if (screencastStartedRef.current) return;

    const api = window.accomplish;
    if (!api?.startScreencast) return;

    screencastStartedRef.current = true;
    // Fire-and-forget — the SSE relay will start pushing frames
    api.startScreencast().catch(() => {
      // If the dev-browser server isn't up yet, reset so we can retry
      screencastStartedRef.current = false;
    });
  }, [currentTool]);

  // Subscribe to IPC events from the main process
  useEffect(() => {
    const api = window.accomplish;
    if (!api) return;

    const cleanups: (() => void)[] = [];

    // Frame data
    if (api.onBrowserFrame) {
      const removeFrame = api.onBrowserFrame((frame) => {
        if (isPausedRef.current) return;
        setFrameData(frame.data);
        if (!hasReceivedFrame) {
          setHasReceivedFrame(true);
          setIsDismissed(false);
        }
      });
      cleanups.push(removeFrame);
    }

    // URL navigation
    if (api.onBrowserNavigate) {
      const removeNav = api.onBrowserNavigate((event) => {
        setUrl(event.url);
        setLoading(true);
      });
      cleanups.push(removeNav);
    }

    // Loading state
    if (api.onBrowserStatus) {
      const removeStatus = api.onBrowserStatus((event) => {
        setLoading(event.loading);
      });
      cleanups.push(removeStatus);
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [hasReceivedFrame]);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    setHasReceivedFrame(false);
    setFrameData(null);
  }, []);

  const handlePopOut = useCallback(() => {
    if (url && window.accomplish?.openExternal) {
      window.accomplish.openExternal(url);
    }
  }, [url]);

  // Parse a display-friendly hostname from the URL
  const displayUrl = (() => {
    try {
      if (!url) return '';
      const u = new URL(url);
      const path = u.pathname === '/' ? '' : u.pathname;
      return `${u.hostname}${path}`;
    } catch {
      return url;
    }
  })();

  // Don't render until we've received at least one frame
  if (!hasReceivedFrame || isDismissed) {
    return null;
  }

  return (
    <div
      className={cn(
        'border rounded-lg shadow-lg overflow-hidden flex flex-col',
        'bg-background/95 backdrop-blur-sm',
        'transition-all duration-300 ease-in-out',
        'animate-in fade-in slide-in-from-bottom-2',
        'w-full max-w-md',
      )}
    >
      {/* Title bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/80 border-b select-none">
        {/* Globe icon + loading */}
        <div className="relative flex-shrink-0">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          {loading && (
            <Loader2 className="absolute -top-0.5 -right-0.5 h-2 w-2 text-primary animate-spin" />
          )}
        </div>

        {/* URL bar */}
        <div
          className="flex-1 min-w-0 text-xs text-muted-foreground font-mono truncate"
          title={url}
        >
          {displayUrl || 'Browser Preview'}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {url && (
            <button
              onClick={handlePopOut}
              className="p-0.5 rounded hover:bg-accent hover:text-accent-foreground transition-colors"
              title="Open in browser"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-0.5 rounded hover:bg-accent hover:text-accent-foreground transition-colors"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <button
            onClick={handleDismiss}
            className="p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
            title="Close preview"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Frame viewport */}
      {!isCollapsed && (
        <div className="relative bg-black">
          {frameData ? (
            <img
              ref={imgRef}
              src={`data:image/jpeg;base64,${frameData}`}
              alt="Live browser view"
              className="w-full h-auto block"
              draggable={false}
            />
          ) : (
            <div className="aspect-video flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            </div>
          )}

          {/* Loading overlay */}
          {loading && frameData && (
            <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/80 animate-pulse" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
