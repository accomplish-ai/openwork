import { randomUUID } from 'crypto';
import type {
  DesktopScreenshot,
  LiveScreenFramePayload,
  LiveScreenSessionStartPayload,
  LiveScreenStartOptions,
} from '@accomplish/shared';
import { getDesktopContextService } from '../services/desktop-context-service';

const DEFAULT_SAMPLE_FPS = 1;
const DEFAULT_SESSION_LIFETIME_SECONDS = 120;
const MAX_SESSION_LIFETIME_SECONDS = 300;
const MIN_SAMPLE_INTERVAL_MS = 100;

interface LiveScreenSessionRecord {
  id: string;
  sampleFps: number;
  sampleIntervalMs: number;
  createdAtMs: number;
  expiresAtMs: number;
  expiresInSeconds: number;
  maxLifetimeSeconds: number;
  initialFrameSequence: number;
  initialFrameCapturedAt: string;
  lastFrameSequence: number;
  lastFrameCapturedAtMs: number;
  lastFrameCapturedAt: string;
  lastFrameImagePath: string;
  lastCaptureError: string | null;
  captureInProgress: boolean;
  intervalTimer: NodeJS.Timeout | null;
  expiryTimer: NodeJS.Timeout | null;
}

export interface LiveScreenSessionManager {
  startSession(options?: LiveScreenStartOptions): Promise<LiveScreenSessionStartPayload>;
  getSession(sessionId: string): LiveScreenSessionRecord | null;
  getSessionSnapshot(sessionId: string): LiveScreenSessionSnapshot | null;
  listSessions(): LiveScreenSessionSnapshot[];
  refreshSessionFrame(sessionId: string): Promise<LiveScreenFramePayload>;
  stopSession(sessionId: string): boolean;
}

function normalizeSampleFps(sampleFps: unknown): number {
  if (typeof sampleFps !== 'number' || !Number.isFinite(sampleFps) || sampleFps <= 0) {
    return DEFAULT_SAMPLE_FPS;
  }
  return sampleFps;
}

function normalizeDurationSeconds(durationSeconds: unknown): number {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds)) {
    return DEFAULT_SESSION_LIFETIME_SECONDS;
  }
  return Math.max(1, Math.min(MAX_SESSION_LIFETIME_SECONDS, Math.floor(durationSeconds)));
}

function parseTimestampMs(timestamp: string, fallback: number): number {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function captureLiveFrame(): Promise<DesktopScreenshot> {
  const service = getDesktopContextService();
  return await service.captureScreenshot('screen');
}

export interface LiveScreenSessionSnapshot {
  session: LiveScreenSessionStartPayload;
  lastFrame: LiveScreenFramePayload;
  lastCaptureError: string | null;
}

function buildSessionPayload(session: LiveScreenSessionRecord): LiveScreenSessionStartPayload {
  return {
    sessionId: session.id,
    sampleFps: session.sampleFps,
    sampleIntervalMs: session.sampleIntervalMs,
    startedAt: new Date(session.createdAtMs).toISOString(),
    expiresAt: new Date(session.expiresAtMs).toISOString(),
    expiresInSeconds: session.expiresInSeconds,
    maxLifetimeSeconds: session.maxLifetimeSeconds,
    initialFrameSequence: session.initialFrameSequence,
    initialFrameCapturedAt: session.initialFrameCapturedAt,
  };
}

function buildFramePayload(session: LiveScreenSessionRecord, nowMs: number): LiveScreenFramePayload {
  const staleMs = Math.max(0, nowMs - session.lastFrameCapturedAtMs);
  return {
    sessionId: session.id,
    frameSequence: session.lastFrameSequence,
    capturedAt: session.lastFrameCapturedAt,
    staleMs,
    expiresAt: new Date(session.expiresAtMs).toISOString(),
    sampleFps: session.sampleFps,
    imagePath: session.lastFrameImagePath,
    captureWarning: session.lastCaptureError ?? undefined,
  };
}

function buildSnapshot(session: LiveScreenSessionRecord, nowMs: number): LiveScreenSessionSnapshot {
  return {
    session: buildSessionPayload(session),
    lastFrame: buildFramePayload(session, nowMs),
    lastCaptureError: session.lastCaptureError,
  };
}

export function createLiveScreenSessionManager(now: () => number = () => Date.now()): LiveScreenSessionManager {
  const sessions = new Map<string, LiveScreenSessionRecord>();

  const clearSessionTimers = (session: LiveScreenSessionRecord): void => {
    if (session.intervalTimer) {
      clearInterval(session.intervalTimer);
      session.intervalTimer = null;
    }
    if (session.expiryTimer) {
      clearTimeout(session.expiryTimer);
      session.expiryTimer = null;
    }
  };

  const expireSession = (sessionId: string): void => {
    const session = sessions.get(sessionId);
    if (!session) return;
    clearSessionTimers(session);
    sessions.delete(sessionId);
  };

  const captureFrame = async (session: LiveScreenSessionRecord): Promise<void> => {
    if (session.captureInProgress) {
      return;
    }

    const currentTime = now();
    if (currentTime >= session.expiresAtMs) {
      expireSession(session.id);
      return;
    }

    session.captureInProgress = true;
    try {
      const screenshot = await captureLiveFrame();
      session.lastFrameSequence += 1;
      session.lastFrameCapturedAt = screenshot.timestamp;
      session.lastFrameCapturedAtMs = parseTimestampMs(screenshot.timestamp, now());
      session.lastFrameImagePath = screenshot.imagePath;
      session.lastCaptureError = null;
    } catch (error) {
      session.lastCaptureError = error instanceof Error ? error.message : String(error);
    } finally {
      session.captureInProgress = false;
    }
  };

  const scheduleSession = (session: LiveScreenSessionRecord): void => {
    const intervalTimer = setInterval(() => {
      void captureFrame(session);
    }, session.sampleIntervalMs);
    intervalTimer.unref?.();
    session.intervalTimer = intervalTimer;

    const expiryDelay = Math.max(0, session.expiresAtMs - now());
    const expiryTimer = setTimeout(() => expireSession(session.id), expiryDelay);
    expiryTimer.unref?.();
    session.expiryTimer = expiryTimer;
  };

  return {
    startSession: async (options?: LiveScreenStartOptions): Promise<LiveScreenSessionStartPayload> => {
      const sampleFps = normalizeSampleFps(options?.sampleFps);
      const durationSeconds = normalizeDurationSeconds(options?.durationSeconds);
      const sampleIntervalMs = Math.max(MIN_SAMPLE_INTERVAL_MS, Math.round(1000 / sampleFps));
      const createdAtMs = now();
      const expiresAtMs = createdAtMs + durationSeconds * 1000;

      const screenshot = await captureLiveFrame();
      const initialCapturedAtMs = parseTimestampMs(screenshot.timestamp, createdAtMs);

      const session: LiveScreenSessionRecord = {
        id: randomUUID(),
        sampleFps,
        sampleIntervalMs,
        createdAtMs,
        expiresAtMs,
        expiresInSeconds: durationSeconds,
        maxLifetimeSeconds: MAX_SESSION_LIFETIME_SECONDS,
        initialFrameSequence: 1,
        initialFrameCapturedAt: screenshot.timestamp,
        lastFrameSequence: 1,
        lastFrameCapturedAtMs: initialCapturedAtMs,
        lastFrameCapturedAt: screenshot.timestamp,
        lastFrameImagePath: screenshot.imagePath,
        lastCaptureError: null,
        captureInProgress: false,
        intervalTimer: null,
        expiryTimer: null,
      };

      sessions.set(session.id, session);
      scheduleSession(session);

      return buildSessionPayload(session);
    },
    getSession: (sessionId: string): LiveScreenSessionRecord | null => {
      const session = sessions.get(sessionId);
      if (!session) return null;
      if (now() >= session.expiresAtMs) {
        expireSession(sessionId);
        return null;
      }
      return session;
    },
    getSessionSnapshot: (sessionId: string): LiveScreenSessionSnapshot | null => {
      const session = sessions.get(sessionId);
      if (!session) return null;
      const nowMs = now();
      if (nowMs >= session.expiresAtMs) {
        expireSession(sessionId);
        return null;
      }
      return buildSnapshot(session, nowMs);
    },
    listSessions: (): LiveScreenSessionSnapshot[] => {
      const nowMs = now();
      const snapshots: LiveScreenSessionSnapshot[] = [];
      for (const [sessionId, session] of sessions.entries()) {
        if (nowMs >= session.expiresAtMs) {
          expireSession(sessionId);
          continue;
        }
        snapshots.push(buildSnapshot(session, nowMs));
      }
      return snapshots;
    },
    refreshSessionFrame: async (sessionId: string): Promise<LiveScreenFramePayload> => {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Unknown live screen session: ${sessionId}`);
      }
      await captureFrame(session);
      const nowMs = now();
      if (nowMs >= session.expiresAtMs) {
        expireSession(sessionId);
        throw new Error(`Live screen session expired: ${sessionId}`);
      }
      return buildFramePayload(session, nowMs);
    },
    stopSession: (sessionId: string): boolean => {
      const session = sessions.get(sessionId);
      if (!session) return false;
      expireSession(sessionId);
      return true;
    },
  };
}
