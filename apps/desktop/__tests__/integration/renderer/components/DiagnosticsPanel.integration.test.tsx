/**
 * Integration tests for desktop-control diagnostics behavior in renderer.
 *
 * Coverage targets:
 * - blocked diagnostics are shown
 * - Recheck action is wired
 * - panel hides when readiness returns to ready
 *
 * @module __tests__/integration/renderer/components/DiagnosticsPanel.integration.test
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DesktopControlStatusSnapshot } from '@/lib/accomplish';

const floatingChatMocks = vi.hoisted(() => {
  const getDesktopControlStatus = vi.fn();
  const accomplishApi = {
    onSmartTrigger: vi.fn(() => undefined),
    notifyActivity: vi.fn(),
    onTaskUpdate: vi.fn(() => () => {}),
    onTaskUpdateBatch: vi.fn(() => () => {}),
    hasAnyApiKey: vi.fn(async () => true),
    listTasks: vi.fn(async () => []),
    getSelectedModel: vi.fn(async () => null),
    cancelTask: vi.fn(async () => undefined),
    interruptTask: vi.fn(async () => undefined),
    startTask: vi.fn(async () => ({ id: 'task-1' })),
    resumeSession: vi.fn(async () => ({ id: 'task-1' })),
  };

  return {
    getDesktopControlStatus,
    accomplishApi,
  };
});

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => floatingChatMocks.accomplishApi,
  getDesktopControlStatus: floatingChatMocks.getDesktopControlStatus,
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import DiagnosticsPanel from '@/components/desktop-control/DiagnosticsPanel';
import { FloatingChat } from '@/components/FloatingChat';

const blockedStatus: DesktopControlStatusSnapshot = {
  status: 'needs_screen_recording_permission',
  errorCode: 'screen_recording_permission_required',
  message: 'Screen recording permission is required before taking screenshots.',
  remediation: {
    title: 'Allow Screen Recording',
    systemSettingsPath: 'System Settings > Privacy & Security > Screen Recording',
    steps: [
      'Open System Settings > Privacy & Security > Screen Recording.',
      'Enable permission for Screen Agent.',
      'Quit and reopen Screen Agent, then recheck status.',
    ],
  },
  checkedAt: new Date().toISOString(),
  cache: {
    ttlMs: 5000,
    expiresAt: new Date(Date.now() + 5000).toISOString(),
    fromCache: false,
  },
  checks: {
    screen_capture: {
      capability: 'screen_capture',
      status: 'blocked',
      errorCode: 'screen_recording_permission_required',
      message: 'Screen recording permission is required before taking screenshots.',
      remediation: {
        title: 'Allow Screen Recording',
        systemSettingsPath: 'System Settings > Privacy & Security > Screen Recording',
        steps: ['Enable Screen Recording access.'],
      },
      checkedAt: new Date().toISOString(),
    },
    action_execution: {
      capability: 'action_execution',
      status: 'ready',
      errorCode: null,
      message: 'Accessibility permission is granted.',
      remediation: {
        title: 'No action needed',
        steps: ['Desktop control dependencies are ready.'],
      },
      checkedAt: new Date().toISOString(),
    },
    mcp_health: {
      capability: 'mcp_health',
      status: 'ready',
      errorCode: null,
      message: 'MCP runtime dependencies are present.',
      remediation: {
        title: 'No action needed',
        steps: ['Desktop control dependencies are ready.'],
      },
      checkedAt: new Date().toISOString(),
    },
  },
};

const readyStatus: DesktopControlStatusSnapshot = {
  ...blockedStatus,
  status: 'ready',
  errorCode: null,
  message: 'Desktop control is ready.',
  remediation: {
    title: 'No action needed',
    steps: ['Desktop control dependencies are ready.'],
  },
  checks: {
    ...blockedStatus.checks,
    screen_capture: {
      ...blockedStatus.checks.screen_capture,
      status: 'ready',
      errorCode: null,
      message: 'Screen recording permission is granted.',
      remediation: {
        title: 'No action needed',
        steps: ['Desktop control dependencies are ready.'],
      },
    },
  },
};

const accessibilityBlockedStatus: DesktopControlStatusSnapshot = {
  ...readyStatus,
  status: 'needs_accessibility_permission',
  errorCode: 'accessibility_permission_required',
  message: 'Accessibility permission is required before keyboard/mouse actions can run.',
  remediation: {
    title: 'Allow Accessibility',
    systemSettingsPath: 'System Settings > Privacy & Security > Accessibility',
    steps: ['Enable Accessibility access for Screen Agent.'],
  },
  checks: {
    ...readyStatus.checks,
    action_execution: {
      ...readyStatus.checks.action_execution,
      status: 'blocked',
      errorCode: 'accessibility_permission_required',
      message: 'Accessibility permission is required before keyboard/mouse actions can run.',
      remediation: {
        title: 'Allow Accessibility',
        systemSettingsPath: 'System Settings > Privacy & Security > Accessibility',
        steps: ['Enable Accessibility access for Screen Agent.'],
      },
    },
  },
};

describe('DiagnosticsPanel Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    if (typeof HTMLElement !== 'undefined') {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: vi.fn(),
      });
    }
  });

  it('shows blocked diagnostics details (failure path)', () => {
    const onRecheck = vi.fn();
    render(
      <DiagnosticsPanel
        status={blockedStatus}
        isChecking={false}
        errorMessage={null}
        onRecheck={onRecheck}
      />
    );

    expect(screen.getByText('Desktop Control Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Screen capture')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(
      screen.getAllByText(/screen recording permission is required before taking screenshots/i)
        .length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/System Settings > Privacy & Security > Screen Recording/i).length
    ).toBeGreaterThan(0);
  });

  it('calls recheck handler when Recheck is clicked', () => {
    const onRecheck = vi.fn();
    render(
      <DiagnosticsPanel
        status={blockedStatus}
        isChecking={false}
        errorMessage={null}
        onRecheck={onRecheck}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /recheck/i }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it('shows panel when blocked and hides after recheck returns ready (recovery path)', async () => {
    floatingChatMocks.getDesktopControlStatus
      .mockResolvedValueOnce(blockedStatus)
      .mockResolvedValueOnce(readyStatus);

    render(<FloatingChat />);

    await waitFor(() => {
      expect(screen.getByText('Desktop Control Diagnostics')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /recheck/i }));

    await waitFor(() => {
      expect(screen.queryByText('Desktop Control Diagnostics')).not.toBeInTheDocument();
    });

    expect(floatingChatMocks.getDesktopControlStatus).toHaveBeenNthCalledWith(1, { forceRefresh: false });
    expect(floatingChatMocks.getDesktopControlStatus).toHaveBeenNthCalledWith(2, { forceRefresh: true });
  });

  it('blocks action requests from chat input when accessibility is not ready', async () => {
    floatingChatMocks.getDesktopControlStatus
      .mockResolvedValueOnce(accessibilityBlockedStatus)
      .mockResolvedValueOnce(accessibilityBlockedStatus);

    render(<FloatingChat />);

    const input = screen.getByPlaceholderText('Ask me anything...');
    fireEvent.change(input, { target: { value: 'Click the Save button for me.' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/I cannot run desktop actions yet/i)).toBeInTheDocument();
    });

    expect(floatingChatMocks.accomplishApi.startTask).not.toHaveBeenCalled();
    expect(floatingChatMocks.accomplishApi.resumeSession).not.toHaveBeenCalled();
    expect(floatingChatMocks.getDesktopControlStatus).toHaveBeenNthCalledWith(1, { forceRefresh: false });
    expect(floatingChatMocks.getDesktopControlStatus).toHaveBeenNthCalledWith(2, { forceRefresh: true });
  });

  it('renders the Screen Agent composer as a multiline textarea', async () => {
    floatingChatMocks.getDesktopControlStatus.mockResolvedValueOnce(readyStatus);

    render(<FloatingChat />);

    const input = await screen.findByLabelText('Chat message input');
    expect(input.tagName).toBe('TEXTAREA');
    expect(input).toHaveAttribute('rows', '2');
  });

  it('shows stop control while running and interrupts the active task', async () => {
    floatingChatMocks.getDesktopControlStatus.mockResolvedValueOnce(readyStatus);

    render(<FloatingChat />);

    const input = screen.getByPlaceholderText('Ask me anything...');
    fireEvent.change(input, { target: { value: 'Help me run this mission.' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(floatingChatMocks.accomplishApi.startTask).toHaveBeenCalledTimes(1);
    });

    const stopButton = screen.getByRole('button', { name: /stop agent/i });
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(floatingChatMocks.accomplishApi.interruptTask).toHaveBeenCalledWith('task-1');
    });
  });

  it('hydrates the newest saved chat on mount', async () => {
    floatingChatMocks.getDesktopControlStatus.mockResolvedValueOnce(readyStatus);
    floatingChatMocks.accomplishApi.listTasks.mockResolvedValueOnce([
      {
        id: 'task-newest',
        prompt: 'Newest prompt',
        status: 'completed',
        sessionId: 'session-newest',
        createdAt: new Date().toISOString(),
        messages: [
          {
            id: 'msg-newest',
            type: 'assistant',
            content: 'Newest chat message',
            timestamp: new Date().toISOString(),
          },
        ],
      },
      {
        id: 'task-oldest',
        prompt: 'Old prompt',
        status: 'completed',
        sessionId: 'session-oldest',
        createdAt: new Date(Date.now() - 1000).toISOString(),
        messages: [
          {
            id: 'msg-oldest',
            type: 'assistant',
            content: 'Old chat message',
            timestamp: new Date(Date.now() - 1000).toISOString(),
          },
        ],
      },
    ]);

    render(<FloatingChat />);

    await waitFor(() => {
      expect(screen.getByText('Newest chat message')).toBeInTheDocument();
    });

    expect(screen.queryByText('Old chat message')).not.toBeInTheDocument();
  });

  it('resumes the active session for same-chat follow-up messages', async () => {
    floatingChatMocks.getDesktopControlStatus.mockResolvedValueOnce(readyStatus);
    floatingChatMocks.accomplishApi.listTasks.mockResolvedValueOnce([
      {
        id: 'task-existing',
        prompt: 'Existing prompt',
        status: 'completed',
        sessionId: 'session-existing',
        createdAt: new Date().toISOString(),
        messages: [
          {
            id: 'msg-existing',
            type: 'assistant',
            content: 'Existing assistant reply',
            timestamp: new Date().toISOString(),
          },
        ],
      },
    ]);

    render(<FloatingChat />);

    await waitFor(() => {
      expect(screen.getByText('Existing assistant reply')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Ask me anything...');
    fireEvent.change(input, { target: { value: 'continue' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(floatingChatMocks.accomplishApi.resumeSession).toHaveBeenCalledWith(
        'session-existing',
        'continue',
        'task-existing'
      );
    });

    expect(floatingChatMocks.accomplishApi.startTask).not.toHaveBeenCalled();
  });
});
