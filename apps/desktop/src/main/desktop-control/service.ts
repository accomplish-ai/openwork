import type {
  DesktopActionRequest,
  DesktopActionResponse,
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
  ACTION_HISTORY_MAX_LENGTH,
  createInitialDesktopControlState,
  type DesktopControlDomainState,
  type DesktopControlEvent,
  type DesktopControlEventListener,
  type DesktopControlEventType,
} from './domain';
import type { LiveScreenSessionSnapshot } from './live-screen';
import { AuditLog, getAuditLog, type AuditAction, type AuditOutcome } from './audit-log';
import { RateLimiter, getRateLimiter, type RateLimitBucket } from './rate-limiter';

export interface DesktopControlServiceDependencies {
  dataAccess?: DesktopControlDataAccess;
  auditLog?: AuditLog;
  rateLimiter?: RateLimiter;
  now?: () => number;
}

const RETRY_ATTEMPTS = 2;
const MAX_ALLOWED_SAMPLE_FPS = 10;
const MAX_ALLOWED_DURATION_SECONDS = 300;

export class DesktopControlService {
  private dataAccess: DesktopControlDataAccess;
  private readonly now: () => number;
  private state: DesktopControlDomainState;
  private readonly completedStopPayloadBySessionId = new Map<string, LiveScreenStopPayload>();
  private readonly deletedSessionIds = new Set<string>();
  private readonly auditLog: AuditLog;
  private readonly rateLimiter: RateLimiter;
  private readonly eventListeners: Set<DesktopControlEventListener> = new Set();

  constructor({ dataAccess, auditLog, rateLimiter, now }: DesktopControlServiceDependencies = {}) {
    this.dataAccess = dataAccess ?? createDesktopControlDataAccess();
    this.auditLog = auditLog ?? getAuditLog();
    this.rateLimiter = rateLimiter ?? getRateLimiter();
    this.now = now ?? (() => Date.now());
    this.state = createInitialDesktopControlState(this.now());
  }

  getAuditLog(): AuditLog {
    return this.auditLog;
  }

  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  getState(): DesktopControlDomainState {
    return this.state;
  }

  onEvent(listener: DesktopControlEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private emitEvent(type: DesktopControlEventType, details?: Record<string, unknown>): void {
    const event: DesktopControlEvent = {
      type,
      timestamp: this.now(),
      details,
    };
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Event listeners should not throw, but swallow errors to protect the service
      }
    }
  }

  clearSensitiveData(): void {
    this.state.liveScreen = {
      phase: 'idle',
      session: null,
      lastFrame: null,
      lastFailure: null,
      lastUpdatedAt: this.now(),
    };
    this.state.actionExecution = {
      lastAction: null,
      lastFailure: null,
      executionCount: 0,
      lastUpdatedAt: this.now(),
      history: [],
    };
    this.state.context = {
      snapshot: null,
      lastUpdatedAt: this.now(),
    };
    this.completedStopPayloadBySessionId.clear();
    this.deletedSessionIds.clear();
    this.rateLimiter.reset();
    this.auditLog.record({
      timestamp: this.now(),
      action: 'clear_sensitive_data',
      outcome: 'success',
    });
    this.emitEvent('sensitive_data_cleared');
  }

  async undoLastAction(): Promise<DesktopActionResponse | null> {
    const history = this.state.actionExecution.history;
    if (history.length === 0) return null;

    const lastEntry = history[history.length - 1];
    if (!lastEntry.response || lastEntry.failure) return null;

    // For move_mouse: find the previous position and move back
    if (lastEntry.request.type === 'move_mouse') {
      // Find the last successful move_mouse before this one
      for (let i = history.length - 2; i >= 0; i--) {
        const prev = history[i];
        if (prev.request.type === 'move_mouse' && prev.response) {
          return this.executeAction({ type: 'move_mouse', x: prev.request.x, y: prev.request.y });
        }
      }
    }

    // For other action types, undo is not straightforward — return null
    return null;
  }

  async restartLiveScreenSession(
    options?: LiveScreenStartOptions,
  ): Promise<LiveScreenSessionStartPayload> {
    // Clean up any active session first
    const currentSession = this.state.liveScreen.session;
    if (currentSession) {
      try {
        await this.stopLiveScreenSession(currentSession.sessionId);
      } catch {
        // If stop fails, force-clear the state and continue
      }
    }
    // Reset live screen state
    this.state.liveScreen = {
      phase: 'idle',
      session: null,
      lastFrame: null,
      lastFailure: null,
      lastUpdatedAt: this.now(),
    };
    return this.startLiveScreenSession(options);
  }

  setDataAccess(dataAccess: DesktopControlDataAccess): void {
    this.dataAccess = dataAccess;
  }

  async getReadinessStatus(
    options?: { forceRefresh?: boolean }
  ): Promise<DesktopControlStatusSnapshot> {
    this.rateLimiter.acquireOrThrow('readiness_check');
    const start = this.now();
    try {
      const snapshot = await this.withRetry(() => this.dataAccess.getReadinessStatus(options));
      this.state.readiness = {
        snapshot,
        lastUpdatedAt: this.now(),
      };
      this.auditLog.record({
        timestamp: this.now(),
        action: 'readiness_check',
        outcome: 'success',
        durationMs: this.now() - start,
      });
      this.emitEvent('readiness_checked', { status: snapshot.status });
      return snapshot;
    } catch (error) {
      this.auditLog.record({
        timestamp: this.now(),
        action: 'readiness_check',
        outcome: 'failure',
        durationMs: this.now() - start,
        details: { error: String(error) },
      });
      throw error;
    }
  }

  async captureDesktopContext(options?: DesktopContextOptions): Promise<DesktopContextSnapshot> {
    const snapshot = await this.withRetry(() => this.dataAccess.captureDesktopContext(options));
    this.state.context = {
      snapshot,
      lastUpdatedAt: this.now(),
    };
    return snapshot;
  }

  async executeAction(request: DesktopActionRequest): Promise<DesktopActionResponse> {
    this.rateLimiter.acquireOrThrow('mouse_action');
    this.emitEvent('action_started', { type: request.type });
    const start = this.now();
    try {
      const response = await this.withRetry(() => this.dataAccess.executeAction(request));
      const now = this.now();
      this.state.actionExecution = {
        lastAction: response,
        lastFailure: null,
        executionCount: this.state.actionExecution.executionCount + 1,
        lastUpdatedAt: now,
        history: [
          ...this.state.actionExecution.history.slice(-(ACTION_HISTORY_MAX_LENGTH - 1)),
          { request, response, failure: null, executedAt: now },
        ],
      };
      this.auditLog.record({
        timestamp: now,
        action: 'action_execute',
        outcome: 'success',
        durationMs: now - start,
        details: { type: request.type },
      });
      this.emitEvent('action_completed', { type: request.type, durationMs: now - start });
      return response;
    } catch (error) {
      const now = this.now();
      const failure = normalizeToolFailure(error, 'action_execution');
      const outcome: AuditOutcome = failure.code === 'ERR_PERMISSION_DENIED' ? 'permission_denied' : 'failure';
      this.state.actionExecution = {
        ...this.state.actionExecution,
        lastFailure: failure,
        lastUpdatedAt: now,
        history: [
          ...this.state.actionExecution.history.slice(-(ACTION_HISTORY_MAX_LENGTH - 1)),
          { request, response: null, failure, executedAt: now },
        ],
      };
      this.auditLog.record({
        timestamp: now,
        action: 'action_execute',
        outcome,
        durationMs: now - start,
        details: { type: request.type, error: failure.message },
      });
      const eventType = failure.code === 'ERR_PERMISSION_DENIED' ? 'permission_blocked' as const : 'action_failed' as const;
      this.emitEvent(eventType, { type: request.type, error: failure.message });
      throw error;
    }
  }

  async startLiveScreenSession(
    options?: LiveScreenStartOptions
  ): Promise<LiveScreenSessionStartPayload> {
    this.rateLimiter.acquireOrThrow('live_screen_start');
    const sanitizedOptions = sanitizeLiveScreenStartOptions(options);
    const previousState = this.state.liveScreen;
    this.state.liveScreen = {
      ...this.state.liveScreen,
      phase: 'starting',
      lastUpdatedAt: this.now(),
    };

    try {
      const session = await this.withRetry(() =>
        this.dataAccess.startLiveScreenSession(sanitizedOptions)
      );
      this.state.liveScreen = {
        ...this.state.liveScreen,
        phase: 'active',
        session,
        lastFailure: null,
        lastUpdatedAt: this.now(),
      };
      this.auditLog.record({
        timestamp: this.now(),
        action: 'live_screen_start',
        outcome: 'success',
        sessionId: session.sessionId,
      });
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
    const frame = await this.withRetry(() =>
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
    const frame = await this.withRetry(() =>
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
    const frame = await this.withRetry(() =>
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
    const snapshot = await this.withRetry(() =>
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
    return await this.withRetry(() => this.dataAccess.listLiveScreenSessions());
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
      const payload = await this.withRetry(() =>
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
      const payload = await this.withRetry(() =>
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
      await this.withRetry(() => this.dataAccess.deleteLiveScreenSession(normalizedSessionId));
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

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt < RETRY_ATTEMPTS) {
      try {
        return await operation();
      } catch (error) {
        const normalized = normalizeToolFailure(error, 'live_screen');
        if (!shouldRetryFailure(normalized) || attempt + 1 >= RETRY_ATTEMPTS) {
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
