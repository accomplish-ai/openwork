/**
 * Integration tests for daemon-client module
 * Tests the desktop daemon-client bridge with a REAL DaemonRpcServer
 * @module __tests__/integration/main/daemon-client.integration.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { DaemonRpcServer as DaemonRpcServerType } from '@accomplish_ai/agent-core';

let tempDir: string;
let testSocketPath: string;
let activeServer: DaemonRpcServerType | null = null;

const getTestSocketPath = () => testSocketPath;

vi.mock('electron', () => {
  const mockSend = vi.fn();
  const mockWebContents = {
    send: mockSend,
    isDestroyed: vi.fn(() => false),
  };
  const mockWindow = {
    webContents: mockWebContents,
    isDestroyed: vi.fn(() => false),
  };
  return {
    BrowserWindow: {
      getAllWindows: vi.fn(() => [mockWindow]),
    },
    dialog: {
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
    },
  };
});

vi.mock('@accomplish_ai/agent-core/daemon/socket-path.js', () => ({
  getSocketPath: () => getTestSocketPath(),
  getDaemonDir: () => path.dirname(getTestSocketPath()),
  getPidFilePath: () => path.join(path.dirname(getTestSocketPath()), 'daemon.pid'),
}));

async function createTestServer(
  handlers?: Record<string, (params: unknown) => Promise<unknown>>,
): Promise<DaemonRpcServerType> {
  const { DaemonRpcServer } = await import('@accomplish_ai/agent-core');
  const server = new DaemonRpcServer({ socketPath: testSocketPath });
  server.registerMethod('health.check', async () => ({
    version: '1.0.0',
    uptime: 0,
    activeTasks: 0,
  }));
  if (handlers) {
    for (const [method, handler] of Object.entries(handlers)) {
      server.registerMethod(method, handler);
    }
  }
  await server.start();
  activeServer = server;
  return server;
}

describe('daemon-client Integration', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-client-test-'));
    testSocketPath = path.join(tempDir, 'test-daemon.sock');
    vi.resetModules();
  });

  afterEach(async () => {
    // Disconnect the client BEFORE stopping the server to avoid 5s timeout
    try {
      const { disconnectFromDaemon } = await import('@main/daemon-client');
      await disconnectFromDaemon();
    } catch {
      // Module may not be loaded or already disconnected
    }

    if (activeServer) {
      await activeServer.stop();
      activeServer = null;
    }

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('connectToDaemon', () => {
    it('should connect to a real DaemonRpcServer', async () => {
      await createTestServer();

      const { connectToDaemon, getDaemonClient } = await import('@main/daemon-client');
      const client = await connectToDaemon();

      expect(client).toBeDefined();
      expect(client.isConnected()).toBe(true);

      const active = getDaemonClient();
      expect(active).not.toBeNull();
      expect(active!.isConnected()).toBe(true);
    });

    it('should return existing client if already connected', async () => {
      await createTestServer();

      const { connectToDaemon } = await import('@main/daemon-client');
      const client1 = await connectToDaemon();
      const client2 = await connectToDaemon();

      expect(client1).toBe(client2);
    });
  });

  describe('getDaemonClient', () => {
    it('should return null when not connected', async () => {
      const { getDaemonClient } = await import('@main/daemon-client');
      const client = getDaemonClient();
      expect(client).toBeNull();
    });

    it('should return the connected client after connect', async () => {
      await createTestServer();

      const { connectToDaemon, getDaemonClient } = await import('@main/daemon-client');
      await connectToDaemon();

      const client = getDaemonClient();
      expect(client).not.toBeNull();
      expect(client!.isConnected()).toBe(true);
    });
  });

  describe('isDaemonRunning', () => {
    it('should return true when server is up', async () => {
      await createTestServer();

      const { isDaemonRunning } = await import('@main/daemon-client');
      const running = await isDaemonRunning();
      expect(running).toBe(true);
    });

    it('should return false when server is down', async () => {
      const { isDaemonRunning } = await import('@main/daemon-client');
      const running = await isDaemonRunning();
      expect(running).toBe(false);
    });
  });

  describe('RPC call round-trip', () => {
    it('should execute daemonListTasks through real server', async () => {
      const mockTasks = [
        { id: 'task-1', prompt: 'First', status: 'running', messages: [], createdAt: new Date().toISOString() },
        { id: 'task-2', prompt: 'Second', status: 'completed', messages: [], createdAt: new Date().toISOString() },
      ];
      await createTestServer({ 'task.list': async () => mockTasks });

      const { connectToDaemon, daemonListTasks } = await import('@main/daemon-client');
      await connectToDaemon();

      const tasks = await daemonListTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe('task-1');
      expect(tasks[1].id).toBe('task-2');
    });

    it('should execute health.check through real server via getDaemonClient', async () => {
      const { DaemonRpcServer } = await import('@accomplish_ai/agent-core');
      const server = new DaemonRpcServer({ socketPath: testSocketPath });
      server.registerMethod('health.check', async () => ({
        version: '2.0.0',
        uptime: 42,
        activeTasks: 3,
      }));
      await server.start();
      activeServer = server;

      const { connectToDaemon, getDaemonClient } = await import('@main/daemon-client');
      await connectToDaemon();

      const client = getDaemonClient();
      expect(client).not.toBeNull();
      const result = await client!.call<{ version: string; uptime: number; activeTasks: number }>('health.check');
      expect(result.version).toBe('2.0.0');
      expect(result.uptime).toBe(42);
      expect(result.activeTasks).toBe(3);
    });
  });

  describe('RPC calls when not connected', () => {
    it('should throw when calling daemonListTasks without connection', async () => {
      const { daemonListTasks } = await import('@main/daemon-client');
      await expect(daemonListTasks()).rejects.toThrow('Not connected to daemon');
    });

    it('should throw when calling daemonStartTask without connection', async () => {
      const { daemonStartTask } = await import('@main/daemon-client');
      await expect(daemonStartTask({ prompt: 'test' })).rejects.toThrow('Not connected to daemon');
    });

    it('should throw when calling daemonStopTask without connection', async () => {
      const { daemonStopTask } = await import('@main/daemon-client');
      await expect(daemonStopTask({ taskId: 'task-1' })).rejects.toThrow('Not connected to daemon');
    });

    it('should throw when calling daemonGetTask without connection', async () => {
      const { daemonGetTask } = await import('@main/daemon-client');
      await expect(daemonGetTask({ taskId: 'task-1' })).rejects.toThrow('Not connected to daemon');
    });

    it('should throw when calling daemonDeleteTask without connection', async () => {
      const { daemonDeleteTask } = await import('@main/daemon-client');
      await expect(daemonDeleteTask({ taskId: 'task-1' })).rejects.toThrow('Not connected to daemon');
    });
  });

  describe('forwardNotification', () => {
    it('should route task.progress to task:progress IPC channel', async () => {
      const server = await createTestServer();
      const { BrowserWindow } = await import('electron');

      const { connectToDaemon } = await import('@main/daemon-client');
      await connectToDaemon();

      const mockWindow = (BrowserWindow.getAllWindows as ReturnType<typeof vi.fn>)()[0];
      const mockSend = mockWindow.webContents.send as ReturnType<typeof vi.fn>;
      mockSend.mockClear();

      const progressData = { taskId: 'task-1', stage: 'running', message: 'Working...' };
      server.notify('task.progress', progressData);

      await vi.waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith('task:progress', progressData);
      });
    });

    it('should route task.message to task:update:batch IPC channel', async () => {
      const server = await createTestServer();
      const { BrowserWindow } = await import('electron');

      const { connectToDaemon } = await import('@main/daemon-client');
      await connectToDaemon();

      const mockWindow = (BrowserWindow.getAllWindows as ReturnType<typeof vi.fn>)()[0];
      const mockSend = mockWindow.webContents.send as ReturnType<typeof vi.fn>;
      mockSend.mockClear();

      const messageData = { taskId: 'task-1', messages: [{ id: 'm1', type: 'assistant', content: 'Hello' }] };
      server.notify('task.message', messageData);

      await vi.waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith('task:update:batch', messageData);
      });
    });

    it('should route task.complete to task:update with type discriminator', async () => {
      const server = await createTestServer();
      const { BrowserWindow } = await import('electron');

      const { connectToDaemon } = await import('@main/daemon-client');
      await connectToDaemon();

      const mockWindow = (BrowserWindow.getAllWindows as ReturnType<typeof vi.fn>)()[0];
      const mockSend = mockWindow.webContents.send as ReturnType<typeof vi.fn>;
      mockSend.mockClear();

      const completeData = { taskId: 'task-1', result: { status: 'completed' } };
      server.notify('task.complete', completeData);

      await vi.waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith('task:update', { ...completeData, type: 'complete' });
      });
    });

    it('should route task.error to task:update with type discriminator', async () => {
      const server = await createTestServer();
      const { BrowserWindow } = await import('electron');

      const { connectToDaemon } = await import('@main/daemon-client');
      await connectToDaemon();

      const mockWindow = (BrowserWindow.getAllWindows as ReturnType<typeof vi.fn>)()[0];
      const mockSend = mockWindow.webContents.send as ReturnType<typeof vi.fn>;
      mockSend.mockClear();

      const errorData = { taskId: 'task-1', error: 'Something failed' };
      server.notify('task.error', errorData);

      await vi.waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith('task:update', { ...errorData, type: 'error' });
      });
    });

    it('should route permission.request to permission:request IPC channel', async () => {
      const server = await createTestServer();
      const { BrowserWindow } = await import('electron');

      const { connectToDaemon } = await import('@main/daemon-client');
      await connectToDaemon();

      const mockWindow = (BrowserWindow.getAllWindows as ReturnType<typeof vi.fn>)()[0];
      const mockSend = mockWindow.webContents.send as ReturnType<typeof vi.fn>;
      mockSend.mockClear();

      const permData = { requestId: 'perm-1', taskId: 'task-1', type: 'file', path: '/tmp/test' };
      server.notify('permission.request', permData);

      await vi.waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith('permission:request', permData);
      });
    });

    it('should route task.thought to task:thought IPC channel', async () => {
      const server = await createTestServer();
      const { BrowserWindow } = await import('electron');

      const { connectToDaemon } = await import('@main/daemon-client');
      await connectToDaemon();

      const mockWindow = (BrowserWindow.getAllWindows as ReturnType<typeof vi.fn>)()[0];
      const mockSend = mockWindow.webContents.send as ReturnType<typeof vi.fn>;
      mockSend.mockClear();

      const thoughtData = { taskId: 'task-1', thought: 'thinking...' };
      server.notify('task.thought', thoughtData);

      await vi.waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith('task:thought', thoughtData);
      });
    });

    it('should route task.summary to task:summary IPC channel', async () => {
      const server = await createTestServer();
      const { BrowserWindow } = await import('electron');

      const { connectToDaemon } = await import('@main/daemon-client');
      await connectToDaemon();

      const mockWindow = (BrowserWindow.getAllWindows as ReturnType<typeof vi.fn>)()[0];
      const mockSend = mockWindow.webContents.send as ReturnType<typeof vi.fn>;
      mockSend.mockClear();

      const summaryData = { taskId: 'task-1', summary: 'Completed task' };
      server.notify('task.summary', summaryData);

      await vi.waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith('task:summary', summaryData);
      });
    });
  });

  describe('disconnectFromDaemon', () => {
    it('should cleanly disconnect from server', async () => {
      await createTestServer();

      const { connectToDaemon, disconnectFromDaemon, getDaemonClient } = await import('@main/daemon-client');
      await connectToDaemon();
      expect(getDaemonClient()).not.toBeNull();

      await disconnectFromDaemon();
      expect(getDaemonClient()).toBeNull();
    });

    it('should not throw when disconnecting without prior connection', async () => {
      const { disconnectFromDaemon } = await import('@main/daemon-client');
      await expect(disconnectFromDaemon()).resolves.toBeUndefined();
    });
  });

  describe('multiple connect/disconnect cycles', () => {
    it('should handle sequential connect and disconnect cycles', async () => {
      await createTestServer({ 'task.list': async () => [] });

      const { connectToDaemon, disconnectFromDaemon, getDaemonClient, daemonListTasks } =
        await import('@main/daemon-client');

      for (let i = 0; i < 3; i++) {
        await connectToDaemon();
        expect(getDaemonClient()).not.toBeNull();

        const tasks = await daemonListTasks();
        expect(tasks).toEqual([]);

        await disconnectFromDaemon();
        expect(getDaemonClient()).toBeNull();
      }
    });
  });
});
