/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DesktopControlStatusPayload,
  DesktopControlStatusSnapshot,
} from '../../lib/accomplish';
import { DesktopControlShell } from './DesktopControlShell';

afterEach(() => {
  cleanup();
});

interface RawStatusSnapshot extends Omit<DesktopControlStatusSnapshot, 'status'> {
  status: string;
}

const BASE_STATUS: RawStatusSnapshot = {
  status: 'degraded',
  errorCode: null,
  message: 'Desktop control is partially ready.',
  remediation: {
    title: 'Complete remaining setup',
    steps: ['Resolve blocked capabilities, then recheck.'],
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
      status: 'blocked',
      errorCode: 'screen_recording_permission_denied',
      message: 'Screen recording permission is denied.',
      remediation: {
        title: 'Allow Screen Recording',
        steps: ['Open System Settings and allow Screen Recording.'],
      },
      checkedAt: '2026-02-25T20:00:00.000Z',
    },
    action_execution: {
      capability: 'action_execution',
      status: 'ready',
      errorCode: null,
      message: 'Accessibility permission is granted.',
      remediation: {
        title: 'No action needed',
        steps: ['Accessibility permission is already granted.'],
      },
      checkedAt: '2026-02-25T20:00:00.000Z',
    },
    mcp_health: {
      capability: 'mcp_health',
      status: 'ready',
      errorCode: null,
      message: 'Runtime health is good.',
      remediation: {
        title: 'No action needed',
        steps: ['Runtime dependencies are healthy.'],
      },
      checkedAt: '2026-02-25T20:00:00.000Z',
    },
  },
};

function buildStatus(): DesktopControlStatusPayload {
  return BASE_STATUS as unknown as DesktopControlStatusPayload;
}

describe('DesktopControlShell', () => {
  it('renders loading state while checking and no status is available', () => {
    render(
      <DesktopControlShell
        status={null}
        isChecking={true}
        errorMessage={null}
        onRecheck={() => undefined}
      />
    );

    expect(screen.getByTestId('desktop-control-shell-loading')).toBeTruthy();
    expect(screen.getByText(/checking desktop control readiness/i)).toBeTruthy();
  });

  it('renders empty state when there is no status and no error', () => {
    const onRecheck = vi.fn();
    render(
      <DesktopControlShell
        status={null}
        isChecking={false}
        errorMessage={null}
        onRecheck={onRecheck}
      />
    );

    expect(screen.getByTestId('desktop-control-shell-empty')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /recheck/i }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it('renders error state when status is missing and error is present', () => {
    const onRecheck = vi.fn();
    render(
      <DesktopControlShell
        status={null}
        isChecking={false}
        errorMessage="Bridge timed out"
        onRecheck={onRecheck}
      />
    );

    expect(screen.getByTestId('desktop-control-shell-error')).toBeTruthy();
    expect(screen.getByText('Bridge timed out')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it('renders diagnostics panel when a status snapshot exists', () => {
    render(
      <DesktopControlShell
        status={buildStatus()}
        isChecking={false}
        errorMessage={null}
        onRecheck={() => undefined}
      />
    );

    expect(screen.getByTestId('desktop-control-diagnostics-panel')).toBeTruthy();
    expect(screen.getByText(/^Degraded/)).toBeTruthy();
  });
});
