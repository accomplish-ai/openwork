/**
 * @vitest-environment jsdom
 */

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopControlStatusPayload } from '../../lib/accomplish';
import { useDesktopControlStatus } from './useDesktopControlStatus';

const getDesktopControlStatusMock = vi.fn();

vi.mock('../../lib/accomplish', async () => {
  const actual = await vi.importActual<typeof import('../../lib/accomplish')>(
    '../../lib/accomplish'
  );

  return {
    ...actual,
    getDesktopControlStatus: getDesktopControlStatusMock,
  };
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function buildStatus(status: string): DesktopControlStatusPayload {
  return {
    status,
    errorCode: null,
    message: `Status: ${status}`,
    remediation: {
      title: 'No action needed',
      steps: ['Everything is configured.'],
    },
    checkedAt: '2026-02-25T20:00:00.000Z',
    cache: {
      ttlMs: 5000,
      expiresAt: '2026-02-25T20:00:05.000Z',
      fromCache: false,
    },
    checks: {
      screen_capture: {
        capability: 'screen_capture',
        status: 'ready',
        errorCode: null,
        message: 'Ready',
        remediation: {
          title: 'No action needed',
          steps: ['Ready'],
        },
        checkedAt: '2026-02-25T20:00:00.000Z',
      },
      action_execution: {
        capability: 'action_execution',
        status: 'ready',
        errorCode: null,
        message: 'Ready',
        remediation: {
          title: 'No action needed',
          steps: ['Ready'],
        },
        checkedAt: '2026-02-25T20:00:00.000Z',
      },
      mcp_health: {
        capability: 'mcp_health',
        status: 'ready',
        errorCode: null,
        message: 'Ready',
        remediation: {
          title: 'No action needed',
          steps: ['Ready'],
        },
        checkedAt: '2026-02-25T20:00:00.000Z',
      },
    },
  } as DesktopControlStatusPayload;
}

describe('useDesktopControlStatus', () => {
  beforeEach(() => {
    getDesktopControlStatusMock.mockReset();
  });

  it('keeps last status snapshot when a refresh fails', async () => {
    const readySnapshot = buildStatus('ready');

    getDesktopControlStatusMock.mockResolvedValueOnce(readySnapshot);
    getDesktopControlStatusMock.mockRejectedValueOnce(new Error('IPC timeout'));

    const { result } = renderHook(() => useDesktopControlStatus());

    await result.current.checkStatus();

    expect(result.current.status).toEqual(readySnapshot);
    expect(result.current.errorMessage).toBeNull();

    await result.current.checkStatus({ forceRefresh: true });

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
      expect(result.current.errorMessage).toBe('IPC timeout');
      expect(result.current.status).toEqual(readySnapshot);
    });
  });

  it('ignores stale responses from an older request', async () => {
    const staleSnapshot = buildStatus('degraded');
    const latestSnapshot = buildStatus('ready');
    const deferredFirst = createDeferred<DesktopControlStatusPayload>();
    const deferredSecond = createDeferred<DesktopControlStatusPayload>();

    getDesktopControlStatusMock
      .mockReturnValueOnce(deferredFirst.promise)
      .mockReturnValueOnce(deferredSecond.promise);

    const { result } = renderHook(() => useDesktopControlStatus());

    const firstRequest = result.current.checkStatus({ forceRefresh: true });
    const secondRequest = result.current.checkStatus({ forceRefresh: true });

    deferredSecond.resolve(latestSnapshot);
    await secondRequest;

    deferredFirst.resolve(staleSnapshot);
    await firstRequest;

    await waitFor(() => {
      expect(result.current.status).toEqual(latestSnapshot);
      expect(result.current.errorMessage).toBeNull();
      expect(result.current.isChecking).toBe(false);
    });
  });
});
