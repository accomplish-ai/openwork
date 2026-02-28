import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DesktopActionRequest, DesktopActionResponse, ToolFailure } from '@accomplish/shared';
import { DesktopControlService } from '@main/desktop-control/service';
import type { DesktopControlDataAccess } from '@main/desktop-control/data-access';
import { RateLimiter } from '@main/desktop-control/rate-limiter';
import { AuditLog } from '@main/desktop-control/audit-log';

/**
 * Integration-level tests for the action execution flow through
 * service → data-access → action-executor.
 *
 * We mock executeAction at the data-access level to simulate what
 * the real executor would return without spawning actual processes.
 */

function createMockDataAccess(
  executeActionImpl?: (request: DesktopActionRequest) => Promise<DesktopActionResponse>,
): DesktopControlDataAccess {
  return {
    getReadinessStatus: vi.fn(async () => ({
      status: 'ready' as const,
      errorCode: null,
      message: 'ready',
      remediation: { title: 'ok', steps: ['none'] },
      checkedAt: new Date().toISOString(),
      cache: { ttlMs: 5000, expiresAt: new Date(Date.now() + 5000).toISOString(), fromCache: false },
      checks: {
        screen_capture: {
          capability: 'screen_capture' as const,
          status: 'ready' as const,
          errorCode: null,
          message: 'ok',
          remediation: { title: 'ok', steps: ['none'] },
          checkedAt: new Date().toISOString(),
        },
        action_execution: {
          capability: 'action_execution' as const,
          status: 'ready' as const,
          errorCode: null,
          message: 'ok',
          remediation: { title: 'ok', steps: ['none'] },
          checkedAt: new Date().toISOString(),
        },
        mcp_health: {
          capability: 'mcp_health' as const,
          status: 'ready' as const,
          errorCode: null,
          message: 'ok',
          remediation: { title: 'ok', steps: ['none'] },
          checkedAt: new Date().toISOString(),
        },
      },
    })),
    captureDesktopContext: vi.fn(async () => ({
      timestamp: new Date().toISOString(),
      windows: [],
      accessibilityTrees: {},
      screenshots: [],
    })),
    executeAction: vi.fn(
      executeActionImpl ??
        (async (request: DesktopActionRequest): Promise<DesktopActionResponse> => ({
          action: request,
          message: `Executed ${request.type}`,
          executedAt: new Date().toISOString(),
        })),
    ),
    startLiveScreenSession: vi.fn(async () => ({
      sessionId: 'session-1',
      sampleFps: 1,
      sampleIntervalMs: 1000,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30000).toISOString(),
      expiresInSeconds: 30,
      maxLifetimeSeconds: 300,
      initialFrameSequence: 1,
      initialFrameCapturedAt: new Date().toISOString(),
    })),
    getLiveScreenFrame: vi.fn(async () => ({
      sessionId: 'session-1',
      frameSequence: 1,
      capturedAt: new Date().toISOString(),
      staleMs: 0,
      expiresAt: new Date(Date.now() + 30000).toISOString(),
      sampleFps: 1,
      imagePath: '/tmp/frame.png',
    })),
    updateLiveScreenSession: vi.fn(async () => ({
      sessionId: 'session-1',
      frameSequence: 1,
      capturedAt: new Date().toISOString(),
      staleMs: 0,
      expiresAt: new Date(Date.now() + 30000).toISOString(),
      sampleFps: 1,
      imagePath: '/tmp/frame.png',
    })),
    refreshLiveScreenFrame: vi.fn(async () => ({
      sessionId: 'session-1',
      frameSequence: 1,
      capturedAt: new Date().toISOString(),
      staleMs: 0,
      expiresAt: new Date(Date.now() + 30000).toISOString(),
      sampleFps: 1,
      imagePath: '/tmp/frame.png',
    })),
    getLiveScreenSession: vi.fn(async () => null),
    listLiveScreenSessions: vi.fn(async () => []),
    closeLiveScreenSession: vi.fn(async () => ({
      sessionId: 'session-1',
      status: 'stopped' as const,
      stoppedAt: new Date().toISOString(),
    })),
    deleteLiveScreenSession: vi.fn(async () => {}),
    stopLiveScreenSession: vi.fn(async () => ({
      sessionId: 'session-1',
      status: 'stopped' as const,
      stoppedAt: new Date().toISOString(),
    })),
  };
}

function createTestService(dataAccess: DesktopControlDataAccess) {
  return new DesktopControlService({
    dataAccess,
    auditLog: new AuditLog(),
    rateLimiter: new RateLimiter(
      {
        mouse_action: { maxRequests: 10000, windowMs: 1000 },
        live_screen_start: { maxRequests: 10000, windowMs: 1000 },
        readiness_check: { maxRequests: 10000, windowMs: 1000 },
        context_capture: { maxRequests: 10000, windowMs: 1000 },
      },
      () => Date.now(),
    ),
  });
}

describe('Action execution integration', () => {
  it('executes a move_mouse action through the service layer', async () => {
    const dataAccess = createMockDataAccess();
    const service = createTestService(dataAccess);

    const result = await service.executeAction({ type: 'move_mouse', x: 100, y: 200 });

    expect(result.message).toContain('move_mouse');
    expect(dataAccess.executeAction).toHaveBeenCalledWith({ type: 'move_mouse', x: 100, y: 200 });
  });

  it('executes a click action through the service layer', async () => {
    const dataAccess = createMockDataAccess();
    const service = createTestService(dataAccess);

    const result = await service.executeAction({ type: 'click', x: 50, y: 75, button: 'left' });

    expect(result.action.type).toBe('click');
    expect(dataAccess.executeAction).toHaveBeenCalledTimes(1);
  });

  it('tracks action execution state on success', async () => {
    const dataAccess = createMockDataAccess();
    const service = createTestService(dataAccess);

    await service.executeAction({ type: 'move_mouse', x: 10, y: 20 });

    const state = service.getState().actionExecution;
    expect(state.lastAction).not.toBeNull();
    expect(state.lastFailure).toBeNull();
    expect(state.executionCount).toBe(1);
    expect(state.history).toHaveLength(1);
    expect(state.history[0].response).not.toBeNull();
    expect(state.history[0].failure).toBeNull();
  });

  it('tracks action execution state on failure', async () => {
    const permissionFailure: ToolFailure = {
      code: 'ERR_PERMISSION_DENIED',
      category: 'permission',
      source: 'action_execution',
      message: 'Accessibility permission required.',
      retryable: false,
    };
    const dataAccess = createMockDataAccess(async () => {
      throw permissionFailure;
    });
    const service = createTestService(dataAccess);

    await expect(
      service.executeAction({ type: 'move_mouse', x: 10, y: 20 }),
    ).rejects.toMatchObject({ code: 'ERR_PERMISSION_DENIED' });

    const state = service.getState().actionExecution;
    expect(state.lastFailure).not.toBeNull();
    expect(state.lastFailure?.code).toBe('ERR_PERMISSION_DENIED');
    expect(state.executionCount).toBe(0);
    expect(state.history).toHaveLength(1);
    expect(state.history[0].failure).not.toBeNull();
    expect(state.history[0].response).toBeNull();
  });

  it('records audit log entries for executed actions', async () => {
    const auditLog = new AuditLog();
    const dataAccess = createMockDataAccess();
    const service = new DesktopControlService({
      dataAccess,
      auditLog,
      rateLimiter: new RateLimiter(
        { mouse_action: { maxRequests: 10000, windowMs: 1000 } },
        () => Date.now(),
      ),
    });

    await service.executeAction({ type: 'type_text', text: 'hello' });

    const entries = auditLog.getEntriesByAction('action_execute');
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe('success');
    expect(entries[0].details?.type).toBe('type_text');
  });

  it('maintains action history up to the max length', async () => {
    const dataAccess = createMockDataAccess();
    const service = createTestService(dataAccess);

    for (let i = 0; i < 60; i++) {
      await service.executeAction({ type: 'move_mouse', x: i, y: i });
    }

    const state = service.getState().actionExecution;
    expect(state.executionCount).toBe(60);
    // History should be capped at ACTION_HISTORY_MAX_LENGTH (50)
    expect(state.history.length).toBeLessThanOrEqual(50);
  });

  it('executes multiple action types sequentially', async () => {
    const dataAccess = createMockDataAccess();
    const service = createTestService(dataAccess);

    await service.executeAction({ type: 'move_mouse', x: 100, y: 100 });
    await service.executeAction({ type: 'click', x: 100, y: 100 });
    await service.executeAction({ type: 'type_text', text: 'test' });
    await service.executeAction({ type: 'press_key', key: 'return' });

    expect(service.getState().actionExecution.executionCount).toBe(4);
    expect(service.getState().actionExecution.history).toHaveLength(4);
  });

  it('clears sensitive data including action history', async () => {
    const dataAccess = createMockDataAccess();
    const service = createTestService(dataAccess);

    await service.executeAction({ type: 'move_mouse', x: 1, y: 1 });
    expect(service.getState().actionExecution.history).toHaveLength(1);

    service.clearSensitiveData();

    const state = service.getState().actionExecution;
    expect(state.history).toHaveLength(0);
    expect(state.executionCount).toBe(0);
    expect(state.lastAction).toBeNull();
    expect(state.lastFailure).toBeNull();
  });
});
