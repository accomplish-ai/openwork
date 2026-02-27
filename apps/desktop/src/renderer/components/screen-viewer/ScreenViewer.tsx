/**
 * ScreenViewer Component
 *
 * Uses desktop-control sampled live-screen sessions from the Electron bridge.
 * This keeps renderer UI aligned with main-process session/state handling.
 */

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import { Button } from '../ui/button';
import { Monitor, MonitorOff, RefreshCw } from 'lucide-react';
import { getAccomplish } from '../../lib/accomplish';
import type {
  LiveScreenFramePayload,
  LiveScreenSessionStartPayload,
} from '@accomplish/shared';

interface ScreenSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  displayId: string;
}

interface ScreenViewerProps {
  className?: string;
  autoStart?: boolean;
  showControls?: boolean;
  defaultSampleFps?: number;
  defaultDurationSeconds?: number;
}

function toImageSrc(imagePath: string | undefined): string | null {
  if (!imagePath) return null;
  if (
    imagePath.startsWith('file://') ||
    imagePath.startsWith('http://') ||
    imagePath.startsWith('https://') ||
    imagePath.startsWith('data:')
  ) {
    return imagePath;
  }
  return `file://${encodeURI(imagePath)}`;
}

export function ScreenViewer({
  className = '',
  autoStart = false,
  showControls = true,
  defaultSampleFps = 2,
  defaultDurationSeconds = 300,
}: ScreenViewerProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSession, setActiveSession] = useState<LiveScreenSessionStartPayload | null>(null);
  const [activeFrame, setActiveFrame] = useState<LiveScreenFramePayload | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoStartedRef = useRef(false);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearLocalSessionState = useCallback(() => {
    clearPollTimer();
    sessionIdRef.current = null;
    setActiveSession(null);
    setActiveFrame(null);
    setIsStreaming(false);
  }, [clearPollTimer]);

  const fetchSources = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const screenSources: ScreenSource[] = [
        {
          id: 'live-screen-session',
          name: 'Screen',
          thumbnailDataUrl: '',
          displayId: 'default',
        },
      ];
      setSources(screenSources);
      if (!selectedSourceId) {
        setSelectedSourceId(screenSources[0].id);
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedSourceId]);

  const pullFrame = useCallback(async (refresh: boolean): Promise<void> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    const api = getAccomplish();
    const liveScreenApi = api.desktopControl?.liveScreen;
    if (!liveScreenApi) {
      throw new Error('Live screen bridge is unavailable.');
    }

    const frame = refresh
      ? await liveScreenApi.refreshFrame?.(sessionId)
      : await liveScreenApi.getFrame?.(sessionId);

    if (!frame) {
      throw new Error('Live frame payload is missing.');
    }

    setActiveFrame(frame);
    if (frame.captureWarning) {
      setError(frame.captureWarning);
    } else {
      setError(null);
    }
  }, []);

  const stopCapture = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    clearLocalSessionState();

    if (!sessionId) {
      return;
    }

    try {
      const api = getAccomplish();
      await api.desktopControl?.liveScreen?.stopSession?.(sessionId);
    } catch (err) {
      console.warn('[ScreenViewer] Failed to stop live session:', err);
    }
  }, [clearLocalSessionState]);

  const stopSessionOnly = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try {
      const api = getAccomplish();
      await api.desktopControl?.liveScreen?.stopSession?.(sessionId);
    } catch (err) {
      console.warn('[ScreenViewer] Failed to stop previous live session:', err);
    }
  }, []);

  const startCapture = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // Optimistic state to keep the UI responsive while session starts.
    setIsStreaming(true);

    try {
      await stopSessionOnly();
      clearPollTimer();
      sessionIdRef.current = null;
      setActiveSession(null);
      setActiveFrame(null);

      const api = getAccomplish();
      const liveScreenApi = api.desktopControl?.liveScreen;
      if (!liveScreenApi) {
        throw new Error('Live screen bridge is unavailable.');
      }

      const session = await liveScreenApi.startSession?.({
        sampleFps: defaultSampleFps,
        durationSeconds: defaultDurationSeconds,
        includeCursor: true,
      });
      if (!session) {
        throw new Error('Live screen session did not start.');
      }

      sessionIdRef.current = session.sessionId;
      setActiveSession(session);

      await pullFrame(false);

      const pollIntervalMs = Math.max(300, Math.round(session.sampleIntervalMs));
      clearPollTimer();
      pollTimerRef.current = setInterval(() => {
        void pullFrame(true).catch((frameError) => {
          console.warn('[ScreenViewer] Failed to refresh live frame:', frameError);
          setError(
            frameError instanceof Error
              ? frameError.message
              : 'Failed to refresh live frame.'
          );
        });
      }, pollIntervalMs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start live screen session.';
      setError(message);
      clearLocalSessionState();
    } finally {
      setIsLoading(false);
    }
  }, [
    clearLocalSessionState,
    clearPollTimer,
    defaultDurationSeconds,
    defaultSampleFps,
    pullFrame,
    stopSessionOnly,
  ]);

  const toggleCapture = useCallback(async () => {
    if (isStreaming) {
      await stopCapture();
      return;
    }
    await startCapture();
  }, [isStreaming, startCapture, stopCapture]);

  useEffect(() => {
    if (autoStart && !hasAutoStartedRef.current && !isStreaming && !isLoading) {
      hasAutoStartedRef.current = true;
      void startCapture();
    }
  }, [autoStart, isStreaming, isLoading, startCapture]);

  useEffect(() => {
    void fetchSources();
  }, [fetchSources]);

  useEffect(() => {
    return () => {
      void stopCapture();
    };
  }, [stopCapture]);

  const frameSrc = toImageSrc(activeFrame?.imagePath);
  const handleKeyboardToggle = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    void toggleCapture();
  };

  return (
    <div
      className={`relative rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden ${className}`}
      data-testid="screen-viewer"
      role="region"
      tabIndex={0}
      aria-label="Live screen viewer"
      aria-describedby="screen-viewer-defaults"
      onKeyDown={handleKeyboardToggle}
    >
      {showControls && (
        <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isStreaming ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'
              }`}
            />
            <span className="text-xs text-zinc-300">
              {isStreaming ? 'Live' : 'Live view stopped'}
            </span>
            <span
              id="screen-viewer-defaults"
              className="text-[10px] text-zinc-400"
            >
              Default {defaultSampleFps}fps for {Math.round(defaultDurationSeconds / 60)}m
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void fetchSources();
              }}
              disabled={isLoading}
              className="h-6 w-6 p-0 hover:bg-zinc-800"
              title="Refresh sources"
              aria-label="Refresh live view sources"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void toggleCapture();
              }}
              disabled={isLoading || (!selectedSourceId && sources.length === 0)}
              className="h-6 w-6 p-0 hover:bg-zinc-800"
              title={isStreaming ? 'Stop capture' : 'Start capture'}
              aria-label={isStreaming ? 'Stop live view capture' : 'Start live view capture'}
            >
              {isStreaming ? (
                <MonitorOff className="h-3 w-3 text-red-500" />
              ) : (
                <Monitor className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      )}

      {frameSrc ? (
        <img
          src={frameSrc}
          alt="Live desktop frame"
          className="w-full h-full object-contain bg-black"
          style={{ minHeight: '200px' }}
        />
      ) : (
        <div className="w-full h-full min-h-[200px] bg-black" />
      )}

      {!isStreaming && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90">
          <Monitor className="h-12 w-12 text-zinc-600 mb-2" />
          <p className="text-sm text-zinc-400 text-center px-4">
            {isLoading
              ? 'Starting live view...'
              : sources.length === 0
                ? 'No screens available'
                : 'Start live view to stream desktop snapshots'}
          </p>
          <p className="mt-1 text-xs text-zinc-500 text-center px-4" aria-live="polite">
            Press Enter or Space while focused here to toggle live view.
          </p>
          {sources.length > 0 && !isLoading && (
            <Button
              onClick={() => {
                void startCapture();
              }}
              className="mt-4"
              variant="outline"
              size="sm"
            >
              <Monitor className="h-4 w-4 mr-2" />
              Start Live View
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90">
          <MonitorOff className="h-12 w-12 text-red-500 mb-2" />
          <p className="text-sm text-red-400 text-center px-4">{error}</p>
          <Button
            onClick={() => {
              void startCapture();
            }}
            className="mt-4"
            variant="outline"
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry live view
          </Button>
        </div>
      )}

      {isStreaming && activeSession && (
        <div className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-1 text-[11px] text-zinc-200">
          Frame {activeFrame?.frameSequence ?? activeSession.initialFrameSequence}
        </div>
      )}
    </div>
  );
}

export default ScreenViewer;
