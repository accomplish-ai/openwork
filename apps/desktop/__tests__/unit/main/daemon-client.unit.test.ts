import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWebContents = {
  send: vi.fn(),
  isDestroyed: vi.fn().mockReturnValue(false),
};

const mockWindow = {
  isDestroyed: vi.fn().mockReturnValue(false),
  webContents: mockWebContents,
};

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [mockWindow]),
  },
  dialog: {
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  },
}));

const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  call: vi.fn().mockResolvedValue(undefined),
};

let lastConstructorOpts: unknown = null;

vi.mock('@accomplish_ai/agent-core', () => {
  class MockDaemonRpcClient {
    connect = mockClient.connect;
    disconnect = mockClient.disconnect;
    isConnected = mockClient.isConnected;
    call = mockClient.call;
    constructor(opts?: unknown) {
      lastConstructorOpts = opts;
    }
  }
  return {
    DaemonRpcClient: MockDaemonRpcClient,
  };
});

import { BrowserWindow } from 'electron';
import {
  connectToDaemon,
  disconnectFromDaemon,
  daemonStartTask,
  daemonStopTask,
  daemonInterruptTask,
  daemonGetTask,
  daemonDeleteTask,
  daemonClearHistory,
  daemonGetTodos,
  daemonListTasks,
  daemonRespondPermission,
  daemonResumeSession,
} from '@main/daemon-client';

describe('daemon-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastConstructorOpts = null;
    mockClient.isConnected.mockReturnValue(true);
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.disconnect.mockResolvedValue(undefined);
    mockClient.call.mockResolvedValue(undefined);
    mockWindow.isDestroyed.mockReturnValue(false);
    mockWebContents.isDestroyed.mockReturnValue(false);
    mockWebContents.send.mockReset();
    (BrowserWindow.getAllWindows as ReturnType<typeof vi.fn>).mockReturnValue([mockWindow]);
  });

  describe('daemon RPC wrapper functions', () => {
    beforeEach(async () => {
      await disconnectFromDaemon();
      await connectToDaemon();
      vi.clearAllMocks();
      mockClient.isConnected.mockReturnValue(true);
    });

    describe('when not connected', () => {
      beforeEach(() => {
        mockClient.isConnected.mockReturnValue(false);
      });

      it('daemonStartTask should throw', async () => {
        await expect(daemonStartTask({ prompt: 'test' } as never)).rejects.toThrow(
          'Not connected to daemon'
        );
      });

      it('daemonStopTask should throw', async () => {
        await expect(daemonStopTask({ taskId: '1' } as never)).rejects.toThrow(
          'Not connected to daemon'
        );
      });

      it('daemonInterruptTask should throw', async () => {
        await expect(daemonInterruptTask({ taskId: '1' } as never)).rejects.toThrow(
          'Not connected to daemon'
        );
      });

      it('daemonGetTask should throw', async () => {
        await expect(daemonGetTask({ taskId: '1' } as never)).rejects.toThrow(
          'Not connected to daemon'
        );
      });

      it('daemonDeleteTask should throw', async () => {
        await expect(daemonDeleteTask({ taskId: '1' } as never)).rejects.toThrow(
          'Not connected to daemon'
        );
      });

      it('daemonClearHistory should throw', async () => {
        await expect(daemonClearHistory()).rejects.toThrow('Not connected to daemon');
      });

      it('daemonGetTodos should throw', async () => {
        await expect(daemonGetTodos({ taskId: '1' } as never)).rejects.toThrow(
          'Not connected to daemon'
        );
      });

      it('daemonListTasks should throw', async () => {
        await expect(daemonListTasks()).rejects.toThrow('Not connected to daemon');
      });

      it('daemonRespondPermission should throw', async () => {
        await expect(
          daemonRespondPermission({ requestId: 'r1', decision: 'allow' } as never)
        ).rejects.toThrow('Not connected to daemon');
      });

      it('daemonResumeSession should throw', async () => {
        await expect(
          daemonResumeSession({ sessionId: 's1', prompt: 'hi' } as never)
        ).rejects.toThrow('Not connected to daemon');
      });

    });
  });

  describe('forwardNotification', () => {
    let onNotification: (method: string, params: unknown) => void;

    beforeEach(async () => {
      await disconnectFromDaemon();
      lastConstructorOpts = null;
      await connectToDaemon();
      // Extract the onNotification callback that was passed to DaemonRpcClient
      const opts = lastConstructorOpts as Record<string, unknown>;
      onNotification = opts.onNotification as (method: string, params: unknown) => void;
      vi.clearAllMocks();
      mockWindow.isDestroyed.mockReturnValue(false);
      mockWebContents.isDestroyed.mockReturnValue(false);
      (BrowserWindow.getAllWindows as ReturnType<typeof vi.fn>).mockReturnValue([mockWindow]);
    });

    it('should route task.progress to task:progress', () => {
      const params = { taskId: '1', progress: 50 };
      onNotification('task.progress', params);
      expect(mockWebContents.send).toHaveBeenCalledWith('task:progress', params);
    });

    it('should route task.message to task:update:batch', () => {
      const params = { taskId: '1', messages: [{ id: 'm1', type: 'assistant', content: 'hello' }] };
      onNotification('task.message', params);
      expect(mockWebContents.send).toHaveBeenCalledWith('task:update:batch', params);
    });

    it('should route task.complete to task:update with type discriminator', () => {
      const params = { taskId: '1', result: { status: 'success' } };
      onNotification('task.complete', params);
      expect(mockWebContents.send).toHaveBeenCalledWith('task:update', { ...params, type: 'complete' });
    });

    it('should route task.error to task:update with type discriminator', () => {
      const params = { taskId: '1', error: 'fail' };
      onNotification('task.error', params);
      expect(mockWebContents.send).toHaveBeenCalledWith('task:update', { ...params, type: 'error' });
    });

    it('should route permission.request to permission:request', () => {
      const params = { requestId: 'r1' };
      onNotification('permission.request', params);
      expect(mockWebContents.send).toHaveBeenCalledWith('permission:request', params);
    });

    it('should route task.thought to task:thought', () => {
      const params = { taskId: '1', thought: 'thinking...' };
      onNotification('task.thought', params);
      expect(mockWebContents.send).toHaveBeenCalledWith('task:thought', params);
    });

    it('should route task.checkpoint to task:checkpoint', () => {
      const params = { taskId: '1' };
      onNotification('task.checkpoint', params);
      expect(mockWebContents.send).toHaveBeenCalledWith('task:checkpoint', params);
    });

    it('should route task.summary to task:summary', () => {
      const params = { taskId: '1', summary: 'done' };
      onNotification('task.summary', params);
      expect(mockWebContents.send).toHaveBeenCalledWith('task:summary', params);
    });

    it('should do nothing for unknown notification methods', () => {
      onNotification('unknown.method', { data: 'test' });
      expect(mockWebContents.send).not.toHaveBeenCalled();
    });

    it('should do nothing when no window exists', () => {
      (BrowserWindow.getAllWindows as ReturnType<typeof vi.fn>).mockReturnValue([]);
      onNotification('task.progress', { taskId: '1' });
      expect(mockWebContents.send).not.toHaveBeenCalled();
    });

    it('should do nothing when window is destroyed', () => {
      mockWindow.isDestroyed.mockReturnValue(true);
      onNotification('task.progress', { taskId: '1' });
      expect(mockWebContents.send).not.toHaveBeenCalled();
    });

    it('should do nothing when webContents is destroyed', () => {
      mockWebContents.isDestroyed.mockReturnValue(true);
      onNotification('task.progress', { taskId: '1' });
      expect(mockWebContents.send).not.toHaveBeenCalled();
    });
  });
});
