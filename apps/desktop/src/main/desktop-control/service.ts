import type {
  DesktopContextOptions,
  DesktopContextSnapshot,
  DesktopControlStatusSnapshot,
  LiveScreenFramePayload,
  LiveScreenSessionStartPayload,
  LiveScreenStartOptions,
  LiveScreenStopPayload,
  ToolErrorCode,
  ToolFailureCategory,
  ToolFailureSource,
  ToolFailure,
} from '@accomplish/shared';
import {
  createDesktopControlDataAccess,
  type DesktopControlDataAccess,
} from './data-access';
import {
  createInitialDesktopControlState,
  type DesktopControlDomainState,
} from './domain';
import type { LiveScreenSessionSnapshot } from './live-screen';

export interface DesktopControlServiceDependencies {
  dataAccess?: DesktopControlDataAccess;
  now?: () => number;
}

const LIVE_SCREEN_RETRY_ATTEMPTS = 2;
const MAX_ALLOWED_SAMPLE_FPS = 10;
const MAX_ALLOWED_DURATION_SECONDS = 300;

export class DesktopControlService {
  private dataAccess: DesktopControlDataAccess;
  private readonly now: () => number;
  private state: DesktopControlDomainState;
  private readonly completedStopPayloadBySessionId = new Map<string, LiveScreenStopPayload>();
  private readonly deletedSessionIds = new Set<string>();

  constructor({ dataAccess, now }: DesktopControlServiceDependencies = {}) {
    this.dataAccess = dataAccess ?? createDesktopControlDataAccess();
    this.now = now ?? (() => Date.now());
    this.state = createInitialDesktopControlState(this.now());
  }

  getState(): DesktopControlDomainState {
    return this.state;
  }

  setDataAccess(dataAccess: DesktopControlDataAccess): void {
    this.dataAccess = dataAccess;
  }

  async getReadinessStatus(
    options?: { forceRefresh?: boolean }
  ): Promise<DesktopControlStatusSnapshot> {
    const snapshot = await this.withLiveScreenRetry(() => this.dataAccess.getReadinessStatus(options));
    this.state.readiness = {
      snapshot,
      lastUpdatedAt: this.now(),
    };
    return snapshot;
  }

  async captureDesktopContext(options?: DesktopContextOptions): Promise<DesktopContextSnapshot> {
    const snapshot = await this.withLiveScreenRetry(() => this.dataAccess.captureDesktopContext(options));
    this.state.context = {
      snapshot,
      lastUpdatedAt: this.now(),
    };
    return snapshot;
  }

  async startLiveScreenSession(
    options?: LiveScreenStartOptions
  ): Promise<LiveScreenSessionStartPayload> {
    const sanitizedOptions = sanitizeLiveScreenStartOptions(options);
    const previousState = this.state.liveScreen;
    this.state.liveScreen = {
      ...this.state.liveScreen,
      phase: 'starting',
      lastUpdatedAt: this.now(),
    };

    try {
      const session = await this.withLiveScreenRetry(() =>
        this.dataAccess.startLiveScreenSession(sanitizedOptions)
      );
      this.state.liveScreen = {
        ...this.state.liveScreen,
        phase: 'active',
        session,
        lastFailure: null,
        lastUpdatedAt: this.now(),
      };
      return session;
    } catch (error) {
      const failure = normalizeToolFailure(error, 'live_screen');
      this.state.liveScreen = {
        ...previousState,
        phase: previousState.session ? 'active' : 'idle',
        lastFailure: failure,
        lastUpdatedAt: this.now(),
      };
      throw error;
    }
  }

  async getLiveScreenFrame(sessionId: string): Promise<LiveScreenFramePayload> {
    const normalizedSessionId = normalizeSessionIdOrThrow(sessionId);
    const frame = await this.withLiveScreenRetry(() =>
      this.dataAccess.getLiveScreenFrame(normalizedSessionId)
    );
    this.state.liveScreen = {
      ...this.state.liveScreen,
      lastFrame: frame,
      lastUpdatedAt: this.now(),
    };
    return frame;
  }

  async refreshLiveScreenFrame(sessionId: string): Promise<LiveScreenFramePayload> {
    const normalizedSessionId = normalizeSessionIdOrThrow(sessionId);
    const frame = await this.withLiveScreenRetry(() =>
      this.dataAccess.refreshLiveScreenFrame(normalizedSessionId)
    );
    this.state.liveScreen = {
      ...this.state.liveScreen,
      lastFrame: frame,
      lastUpdatedAt: this.now(),
    };
    return frame;
  }

  async updateLiveScreenSession(sessionId: string): Promise<LiveScreenFramePayload> {
    const normalizedSessionId = normalizeSessionIdOrThrow(sessionId);
    const frame = await this.withLiveScreenRetry(() =>
      this.dataAccess.updateLiveScreenSession(normalizedSessionId)
    );
    this.state.liveScreen = {
      ...this.state.liveScreen,
      lastFrame: frame,
      lastUpdatedAt: this.now(),
    };
    return frame;
  }

  async getLiveScreenSession(sessionId: string): Promise<LiveScreenSessionSnapshot | null> {
    const normalizedSessionId = normalizeSessionIdOrThrow(sessionId);
    const snapshot = await this.withLiveScreenRetry(() =>
      this.dataAccess.getLiveScreenSession(normalizedSessionId)
    );
    if (snapshot) {
      this.state.liveScreen = {
        ...this.state.liveScreen,
        session: snapshot.session,
        lastFrame: snapshot.lastFrame,
        lastUpdatedAt: this.now(),
      };
    }
    return snapshot;
  }

  async listLiveScreenSessions(): Promise<LiveScreenSessionSnapshot[]> {
    return await this.withLiveScreenRetry(() => this.dataAccess.listLiveScreenSessions());
  }

  async stopLiveScreenSession(sessionId: string): Promise<LiveScreenStopPayload> {
    const normalizedSessionId = normalizeSessionIdOrThrow(sessionId);
    const existingPayload = this.completedStopPayloadBySessionId.get(normalizedSessionId);
    if (existingPayload) {
      return existingPayload;
    }

    const previousState = this.state.liveScreen;
    this.state.liveScreen = {
      ...this.state.liveScreen,
      phase: 'stopping',
      lastUpdatedAt: this.now(),
    };

    try {
      const payload = await this.withLiveScreenRetry(() =>
        this.dataAccess.stopLiveScreenSession(normalizedSessionId)
      );
      this.completedStopPayloadBySessionId.set(normalizedSessionId, payload);
      this.state.liveScreen = {
        ...this.state.liveScreen,
        phase: 'idle',
        session: null,
        lastFrame: null,
        lastUpdatedAt: this.now(),
      };
      return payload;
    } catch (error) {
      const failure = normalizeToolFailure(error, 'live_screen');
      this.state.liveScreen = {
        ...previousState,
        phase: previousState.session ? 'active' : 'idle',
        lastFailure: failure,
        lastUpdatedAt: this.now(),
      };
      throw error;
    }
  }

  async closeLiveScreenSession(sessionId: string): Promise<LiveScreenStopPayload> {
    const normalizedSessionId = normalizeSessionIdOrThrow(sessionId);
    const existingPayload = this.completedStopPayloadBySessionId.get(normalizedSessionId);
    if (existingPayload) {
      return existingPayload;
    }

    const previousState = this.state.liveScreen;
    this.state.liveScreen = {
      ...this.state.liveScreen,
      phase: 'stopping',
      lastUpdatedAt: this.now(),
    };

    try {
      const payload = await this.withLiveScreenRetry(() =>
        this.dataAccess.closeLiveScreenSession(normalizedSessionId)
      );
      this.completedStopPayloadBySessionId.set(normalizedSessionId, payload);
      this.state.liveScreen = {
        ...this.state.liveScreen,
        phase: 'idle',
        session: null,
        lastFrame: null,
        lastUpdatedAt: this.now(),
      };
      return payload;
    } catch (error) {
      const failure = normalizeToolFailure(error, 'live_screen');
      this.state.liveScreen = {
        ...previousState,
        phase: previousState.session ? 'active' : 'idle',
        lastFailure: failure,
        lastUpdatedAt: this.now(),
      };
      throw error;
    }
  }

  async deleteLiveScreenSession(sessionId: string): Promise<void> {
    const normalizedSessionId = normalizeSessionIdOrThrow(sessionId);
    if (this.deletedSessionIds.has(normalizedSessionId)) {
      return;
    }

    const previousState = this.state.liveScreen;
    this.state.liveScreen = {
      ...this.state.liveScreen,
      phase: 'stopping',
      lastUpdatedAt: this.now(),
    };

    try {
      await this.withLiveScreenRetry(() => this.dataAccess.deleteLiveScreenSession(normalizedSessionId));
      this.deletedSessionIds.add(normalizedSessionId);
      this.completedStopPayloadBySessionId.delete(normalizedSessionId);

      if (previousState.session?.sessionId === normalizedSessionId) {
        this.state.liveScreen = {
          ...this.state.liveScreen,
          phase: 'idle',
          session: null,
          lastFrame: null,
          lastUpdatedAt: this.now(),
        };
      } else {
        this.state.liveScreen = {
          ...this.state.liveScreen,
          phase: previousState.session ? 'active' : 'idle',
          lastUpdatedAt: this.now(),
        };
      }
    } catch (error) {
      const failure = normalizeToolFailure(error, 'live_screen');
      this.state.liveScreen = {
        ...previousState,
        phase: previousState.session ? 'active' : 'idle',
        lastFailure: failure,
        lastUpdatedAt: this.now(),
      };
      throw error;
    }
  }

  private async withLiveScreenRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt < LIVE_SCREEN_RETRY_ATTEMPTS) {
      try {
        return await operation();
      } catch (error) {
        const normalized = normalizeToolFailure(error, 'live_screen');
        if (!shouldRetryFailure(normalized) || attempt + 1 >= LIVE_SCREEN_RETRY_ATTEMPTS) {
          throw error;
        }
        lastError = error;
      }
      attempt += 1;
    }
    throw lastError ?? new Error('Desktop control operation failed after retry.');
  }
}

const CATEGORY_BY_CODE: Record<ToolErrorCode, ToolFailureCategory> = {
  ERR_PERMISSION_DENIED: 'permission',
  ERR_TIMEOUT: 'timeout',
  ERR_UNAVAILABLE_BINARY: 'unavailable',
  ERR_VALIDATION_ERROR: 'validation',
  ERR_UNKNOWN: 'unknown',
};

function isToolFailure(error: unknown): error is ToolFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

function normalizeToolFailure(error: unknown, source: ToolFailureSource = 'service'): ToolFailure {
  if (isToolFailure(error) && typeof error.code === 'string' && typeof error.message === 'string') {
    const code = error.code as ToolErrorCode;
    return {
      ...error,
      code,
      message: error.message,
      category: error.category ?? CATEGORY_BY_CODE[code] ?? 'unknown',
      source: error.source ?? source,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'ERR_UNKNOWN',
      category: CATEGORY_BY_CODE.ERR_UNKNOWN,
      source,
      message: error.message,
      retryable: false,
    };
  }

  return {
    code: 'ERR_UNKNOWN',
    category: CATEGORY_BY_CODE.ERR_UNKNOWN,
    source,
    message: 'Unknown desktop control failure.',
    retryable: false,
  };
}

function shouldRetryFailure(failure: ToolFailure): boolean {
  if (failure.retryable === false) {
    return false;
  }
  return failure.retryable === true || failure.code === 'ERR_TIMEOUT' || failure.code === 'ERR_UNAVAILABLE_BINARY';
}

function normalizeSessionIdOrThrow(sessionId: string): string {
  if (typeof sessionId !== 'string') {
    throw buildValidationFailure('Live screen sessionId is required.');
  }
  const normalized = sessionId.trim();
  if (!normalized) {
    throw buildValidationFailure('Live screen sessionId is required.');
  }
  return normalized;
}

function sanitizeLiveScreenStartOptions(options?: LiveScreenStartOptions): LiveScreenStartOptions | undefined {
  if (!options) {
    return undefined;
  }

  const sampleFps = sanitizePositiveInteger(options.sampleFps, 1, MAX_ALLOWED_SAMPLE_FPS);
  const durationSeconds = sanitizePositiveInteger(
    options.durationSeconds,
    1,
    MAX_ALLOWED_DURATION_SECONDS
  );
  const includeCursor = typeof options.includeCursor === 'boolean' ? options.includeCursor : undefined;
  const activeWindowOnly =
    typeof options.activeWindowOnly === 'boolean' ? options.activeWindowOnly : undefined;

  const sanitized: LiveScreenStartOptions = {};
  if (sampleFps !== undefined) {
    sanitized.sampleFps = sampleFps;
  }
  if (durationSeconds !== undefined) {
    sanitized.durationSeconds = durationSeconds;
  }
  if (includeCursor !== undefined) {
    sanitized.includeCursor = includeCursor;
  }
  if (activeWindowOnly !== undefined) {
    sanitized.activeWindowOnly = activeWindowOnly;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizePositiveInteger(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.floor(value);
  if (normalized < min || normalized > max) {
    throw buildValidationFailure(`Numeric option is out of range (${min}-${max}).`);
  }

  return normalized;
}

function buildValidationFailure(message: string): ToolFailure {
  return {
    code: 'ERR_VALIDATION_ERROR',
    category: 'validation',
    source: 'service',
    message,
    retryable: false,
  };
}

let serviceInstance: DesktopControlService | null = null;

export function getDesktopControlService(): DesktopControlService {
  if (!serviceInstance) {
    serviceInstance = new DesktopControlService();
  }
  return serviceInstance;
}

export function setDesktopControlService(service: DesktopControlService): void {
  serviceInstance = service;
}
