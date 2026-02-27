import { describe, expect, it, vi } from 'vitest';
import type {
  DesktopContextSnapshot,
  DesktopControlStatusSnapshot,
  LiveScreenFramePayload,
  LiveScreenSessionStartPayload,
  LiveScreenStopPayload,
  ToolFailure,
} from '@accomplish/shared';
import {
  DesktopControlService,
  type DesktopControlServiceDependencies,
} from '@main/desktop-control/service';
import type { DesktopControlDataAccess } from '@main/desktop-control/data-access';
import type { LiveScreenSessionSnapshot } from '@main/desktop-control/live-screen';

function createDataAccessMock(overrides: Partial<DesktopControlDataAccess> = {}): DesktopControlDataAccess {
  const readiness: DesktopControlStatusSnapshot = {
    status: 'ready',
    errorCode: null,
    message: 'ready',
    remediation: { title: 'ok', steps: ['none'] },
    checkedAt: new Date().toISOString(),
    cache: {
      ttlMs: 5000,
      expiresAt: new Date(Date.now() + 5000).toISOString(),
      fromCache: false,
    },
    checks: {
      screen_capture: {
        capability: 'screen_capture',
        status: 'ready',
        errorCode: null,
        message: 'ready',
        remediation: { title: 'ok', steps: ['none'] },
        checkedAt: new Date().toISOString(),
      },
      action_execution: {
        capability: 'action_execution',
        status: 'ready',
        errorCode: null,
        message: 'ready',
        remediation: { title: 'ok', steps: ['none'] },
        checkedAt: new Date().toISOString(),
      },
      mcp_health: {
        capability: 'mcp_health',
        status: 'ready',
        errorCode: null,
        message: 'ready',
        remediation: { title: 'ok', steps: ['none'] },
        checkedAt: new Date().toISOString(),
      },
    },
  };

  const context: DesktopContextSnapshot = {
    timestamp: new Date().toISOString(),
    windows: [],
    accessibilityTrees: {},
    screenshots: [],
  };

  const session: LiveScreenSessionStartPayload = {
    sessionId: 'session-1',
    sampleFps: 1,
    sampleIntervalMs: 1000,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30000).toISOString(),
    expiresInSeconds: 30,
    maxLifetimeSeconds: 300,
    initialFrameSequence: 1,
    initialFrameCapturedAt: new Date().toISOString(),
  };

  const frame: LiveScreenFramePayload = {
    sessionId: 'session-1',
    frameSequence: 2,
    capturedAt: new Date().toISOString(),
    staleMs: 10,
    expiresAt: new Date(Date.now() + 30000).toISOString(),
    sampleFps: 1,
    imagePath: '/tmp/frame.png',
  };

  const snapshot: LiveScreenSessionSnapshot = {
    session,
    lastFrame: frame,
    lastCaptureError: null,
  };

  return {
    getReadinessStatus: vi.fn(async () => readiness),
    captureDesktopContext: vi.fn(async () => context),
    startLiveScreenSession: vi.fn(async () => session),
    getLiveScreenFrame: vi.fn(async () => frame),
    updateLiveScreenSession: vi.fn(async () => frame),
    refreshLiveScreenFrame: vi.fn(async () => frame),
    getLiveScreenSession: vi.fn(async () => snapshot),
    listLiveScreenSessions: vi.fn(async () => [snapshot]),
    closeLiveScreenSession: vi.fn(async (): Promise<LiveScreenStopPayload> => ({
      sessionId: 'session-1',
      status: 'stopped',
      stoppedAt: new Date().toISOString(),
    })),
    deleteLiveScreenSession: vi.fn(async () => {}),
    stopLiveScreenSession: vi.fn(async (): Promise<LiveScreenStopPayload> => ({
      sessionId: 'session-1',
      status: 'stopped',
      stoppedAt: new Date().toISOString(),
    })),
    ...overrides,
  };
}

function createService(dataAccess: DesktopControlDataAccess): DesktopControlService {
  const deps: DesktopControlServiceDependencies = {
    dataAccess,
    now: () => 1_000_000,
  };
  return new DesktopControlService(deps);
}

const TOOL_FAILURE: ToolFailure = {
  code: 'ERR_TIMEOUT',
  category: 'timeout',
  source: 'live_screen',
  message: 'timed out',
  retryable: true,
};

describe('DesktopControlService mission M11 paths', () => {
  it('reverts to idle and stores failure when startLiveScreenSession fails', async () => {
    const dataAccess = createDataAccessMock({
      startLiveScreenSession: vi.fn(async () => {
        throw TOOL_FAILURE;
      }),
    });
    const service = createService(dataAccess);

    await expect(service.startLiveScreenSession()).rejects.toEqual(TOOL_FAILURE);

    const state = service.getState().liveScreen;
    expect(state.phase).toBe('idle');
    expect(state.session).toBeNull();
    expect(state.lastFailure?.code).toBe('ERR_TIMEOUT');
  });

  it('reverts to active and stores failure when stopLiveScreenSession fails', async () => {
    const dataAccess = createDataAccessMock({
      stopLiveScreenSession: vi.fn(async () => {
        throw TOOL_FAILURE;
      }),
    });
    const service = createService(dataAccess);

    await service.startLiveScreenSession();
    await service.refreshLiveScreenFrame('session-1');
    await expect(service.stopLiveScreenSession('session-1')).rejects.toEqual(TOOL_FAILURE);

    const state = service.getState().liveScreen;
    expect(state.phase).toBe('active');
    expect(state.session?.sessionId).toBe('session-1');
    expect(state.lastFrame?.sessionId).toBe('session-1');
    expect(state.lastFailure?.code).toBe('ERR_TIMEOUT');
  });

  it('updates session frame using updateLiveScreenSession', async () => {
    const frame: LiveScreenFramePayload = {
      sessionId: 'session-1',
      frameSequence: 7,
      capturedAt: new Date().toISOString(),
      staleMs: 0,
      expiresAt: new Date(Date.now() + 30000).toISOString(),
      sampleFps: 2,
      imagePath: '/tmp/frame-7.png',
    };
    const dataAccess = createDataAccessMock({
      updateLiveScreenSession: vi.fn(async () => frame),
    });
    const service = createService(dataAccess);

    const updated = await service.updateLiveScreenSession('session-1');

    expect(updated.frameSequence).toBe(7);
    expect(service.getState().liveScreen.lastFrame?.frameSequence).toBe(7);
    expect(dataAccess.updateLiveScreenSession).toHaveBeenCalledWith('session-1');
  });

  it('sanitizes sessionId before update path invocation', async () => {
    const dataAccess = createDataAccessMock();
    const service = createService(dataAccess);

    await service.updateLiveScreenSession('  session-1  ');

    expect(dataAccess.updateLiveScreenSession).toHaveBeenCalledWith('session-1');
  });

  it('rejects empty sessionId with validation failure', async () => {
    const dataAccess = createDataAccessMock();
    const service = createService(dataAccess);

    await expect(service.updateLiveScreenSession('   ')).rejects.toMatchObject({
      code: 'ERR_VALIDATION_ERROR',
    });
    expect(dataAccess.updateLiveScreenSession).not.toHaveBeenCalled();
  });

  it('retries transient update errors once', async () => {
    const frame: LiveScreenFramePayload = {
      sessionId: 'session-1',
      frameSequence: 8,
      capturedAt: new Date().toISOString(),
      staleMs: 0,
      expiresAt: new Date(Date.now() + 30000).toISOString(),
      sampleFps: 2,
      imagePath: '/tmp/frame-8.png',
    };
    const timeoutFailure: ToolFailure = {
      code: 'ERR_TIMEOUT',
      category: 'timeout',
      source: 'live_screen',
      message: 'timed out',
      retryable: true,
    };
    const updateLiveScreenSession = vi
      .fn<DesktopControlDataAccess['updateLiveScreenSession']>()
      .mockRejectedValueOnce(timeoutFailure)
      .mockResolvedValueOnce(frame);
    const dataAccess = createDataAccessMock({ updateLiveScreenSession });
    const service = createService(dataAccess);

    const result = await service.updateLiveScreenSession('session-1');

    expect(result.frameSequence).toBe(8);
    expect(updateLiveScreenSession).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable update failures', async () => {
    const nonRetryableFailure: ToolFailure = {
      code: 'ERR_VALIDATION_ERROR',
      category: 'validation',
      source: 'live_screen',
      message: 'invalid session',
      retryable: false,
    };
    const updateLiveScreenSession = vi
      .fn<DesktopControlDataAccess['updateLiveScreenSession']>()
      .mockRejectedValue(nonRetryableFailure);
    const dataAccess = createDataAccessMock({ updateLiveScreenSession });
    const service = createService(dataAccess);

    await expect(service.updateLiveScreenSession('session-1')).rejects.toEqual(nonRetryableFailure);
    expect(updateLiveScreenSession).toHaveBeenCalledTimes(1);
  });

  it('retries unavailable-binary update failures by error code', async () => {
    const frame: LiveScreenFramePayload = {
      sessionId: 'session-1',
      frameSequence: 9,
      capturedAt: new Date().toISOString(),
      staleMs: 0,
      expiresAt: new Date(Date.now() + 30000).toISOString(),
      sampleFps: 2,
      imagePath: '/tmp/frame-9.png',
    };
    const unavailableFailure: ToolFailure = {
      code: 'ERR_UNAVAILABLE_BINARY',
      category: 'unavailable',
      source: 'live_screen',
      message: 'helper missing',
    };
    const updateLiveScreenSession = vi
      .fn<DesktopControlDataAccess['updateLiveScreenSession']>()
      .mockRejectedValueOnce(unavailableFailure)
      .mockResolvedValueOnce(frame);
    const dataAccess = createDataAccessMock({ updateLiveScreenSession });
    const service = createService(dataAccess);

    const result = await service.updateLiveScreenSession('session-1');

    expect(result.frameSequence).toBe(9);
    expect(updateLiveScreenSession).toHaveBeenCalledTimes(2);
  });

  it('closes an active session and clears local state', async () => {
    const dataAccess = createDataAccessMock();
    const service = createService(dataAccess);

    await service.startLiveScreenSession();
    await service.refreshLiveScreenFrame('session-1');
    const payload = await service.closeLiveScreenSession('session-1');

    expect(payload.status).toBe('stopped');
    const state = service.getState().liveScreen;
    expect(state.phase).toBe('idle');
    expect(state.session).toBeNull();
    expect(state.lastFrame).toBeNull();
  });

  it('treats repeated close as idempotent and does not call data access again', async () => {
    const dataAccess = createDataAccessMock();
    const service = createService(dataAccess);

    const first = await service.closeLiveScreenSession('session-1');
    const second = await service.closeLiveScreenSession('session-1');

    expect(first).toEqual(second);
    expect(dataAccess.closeLiveScreenSession).toHaveBeenCalledTimes(1);
  });

  it('deletes active session and reverts to previous state on failure', async () => {
    const dataAccess = createDataAccessMock({
      deleteLiveScreenSession: vi.fn(async () => {
        throw TOOL_FAILURE;
      }),
    });
    const service = createService(dataAccess);

    await service.startLiveScreenSession();
    await service.refreshLiveScreenFrame('session-1');
    await expect(service.deleteLiveScreenSession('session-1')).rejects.toEqual(TOOL_FAILURE);

    const state = service.getState().liveScreen;
    expect(state.phase).toBe('active');
    expect(state.session?.sessionId).toBe('session-1');
    expect(state.lastFailure?.code).toBe('ERR_TIMEOUT');
  });

  it('treats repeated delete as idempotent and does not call data access again', async () => {
    const dataAccess = createDataAccessMock();
    const service = createService(dataAccess);

    await service.deleteLiveScreenSession('session-1');
    await service.deleteLiveScreenSession('session-1');

    expect(dataAccess.deleteLiveScreenSession).toHaveBeenCalledTimes(1);
  });

  it('sanitizes start options before creating a session', async () => {
    const startLiveScreenSession = vi.fn<DesktopControlDataAccess['startLiveScreenSession']>();
    startLiveScreenSession.mockResolvedValue({
      sessionId: 'session-2',
      sampleFps: 2,
      sampleIntervalMs: 500,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      expiresInSeconds: 60,
      maxLifetimeSeconds: 300,
      initialFrameSequence: 1,
      initialFrameCapturedAt: new Date().toISOString(),
    });
    const dataAccess = createDataAccessMock({ startLiveScreenSession });
    const service = createService(dataAccess);

    await service.startLiveScreenSession({
      sampleFps: 2.9,
      durationSeconds: 42.8,
      includeCursor: true,
      activeWindowOnly: false,
    });

    expect(startLiveScreenSession).toHaveBeenCalledWith({
      sampleFps: 2,
      durationSeconds: 42,
      includeCursor: true,
      activeWindowOnly: false,
    });
  });

  it('rejects out-of-range start options with validation failure', async () => {
    const dataAccess = createDataAccessMock();
    const service = createService(dataAccess);

    await expect(service.startLiveScreenSession({ sampleFps: 0 })).rejects.toMatchObject({
      code: 'ERR_VALIDATION_ERROR',
    });
    expect(dataAccess.startLiveScreenSession).not.toHaveBeenCalled();
  });

  it('passes undefined options when sanitized start options are empty', async () => {
    const startLiveScreenSession = vi.fn<DesktopControlDataAccess['startLiveScreenSession']>();
    startLiveScreenSession.mockResolvedValue({
      sessionId: 'session-3',
      sampleFps: 1,
      sampleIntervalMs: 1000,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      expiresInSeconds: 60,
      maxLifetimeSeconds: 300,
      initialFrameSequence: 1,
      initialFrameCapturedAt: new Date().toISOString(),
    });
    const dataAccess = createDataAccessMock({ startLiveScreenSession });
    const service = createService(dataAccess);

    await service.startLiveScreenSession({
      sampleFps: Number.NaN,
      durationSeconds: Number.NaN,
    });

    expect(startLiveScreenSession).toHaveBeenCalledWith(undefined);
  });
});
