/**
 * Daemon Bootstrap
 *
 * Manages the daemon lifecycle with two modes:
 *   1. **Child process** (Step 3): forks a separate Node.js process via IPC channel
 *   2. **In-process** (Step 2 fallback): runs everything in the Electron main process
 *
 * The bootstrap automatically falls back to in-process mode if the child
 * process fails to start.
 */

import { fork, type ChildProcess } from 'child_process';
import path from 'path';
import {
  DaemonServer,
  DaemonClient,
  createInProcessTransportPair,
  createChildProcessTransport,
  addScheduledTask,
  listScheduledTasks,
  cancelScheduledTask,
  disposeScheduler,
} from '@accomplish_ai/agent-core';
import type { TaskManagerAPI, StorageAPI } from '@accomplish_ai/agent-core';
import { app } from 'electron';

let server: DaemonServer | null = null;
let client: DaemonClient | null = null;
let daemonProcess: ChildProcess | null = null;
let mode: 'child-process' | 'in-process' | null = null;

export interface DaemonBootstrapOptions {
  taskManager: TaskManagerAPI;
  storage: StorageAPI;
}

const DAEMON_READY_TIMEOUT_MS = 10_000;

/**
 * Boot the daemon — tries child process first, falls back to in-process.
 */
export async function bootstrapDaemon(options: DaemonBootstrapOptions): Promise<DaemonClient> {
  const { taskManager, storage } = options;

  // Try child process mode
  try {
    const childClient = await spawnDaemonProcess();
    console.log('[DaemonBootstrap] Running in child-process mode');
    client = childClient;
    mode = 'child-process';
    return childClient;
  } catch (err) {
    console.warn('[DaemonBootstrap] Child process failed, falling back to in-process:', err);
  }

  // Fallback: in-process mode (Step 2 behavior)
  return bootstrapInProcess(taskManager, storage);
}

/**
 * Boot in-process mode (no child process). This is the Step 2 fallback.
 */
export function bootstrapInProcess(taskManager: TaskManagerAPI, storage: StorageAPI): DaemonClient {
  const { serverTransport, clientTransport } = createInProcessTransportPair();

  server = new DaemonServer({ transport: serverTransport });
  registerInProcessHandlers(server, taskManager, storage);

  client = new DaemonClient({ transport: clientTransport });
  mode = 'in-process';
  console.log('[DaemonBootstrap] Running in in-process mode');
  return client;
}

/**
 * Fork the daemon as a child process and connect via IPC transport.
 */
async function spawnDaemonProcess(): Promise<DaemonClient> {
  // Resolve the daemon entry script path
  const entryPath = getDaemonEntryPath();

  const userDataPath = app.getPath('userData');

  return new Promise<DaemonClient>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Daemon process did not become ready within timeout'));
      if (daemonProcess) {
        daemonProcess.kill();
        daemonProcess = null;
      }
    }, DAEMON_READY_TIMEOUT_MS);

    try {
      daemonProcess = fork(entryPath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env },
        serialization: 'advanced',
      });

      // Forward daemon stdout/stderr to our console
      daemonProcess.stdout?.on('data', (data: Buffer) => {
        process.stdout.write(`[Daemon] ${data.toString()}`);
      });
      daemonProcess.stderr?.on('data', (data: Buffer) => {
        process.stderr.write(`[Daemon:err] ${data.toString()}`);
      });

      // Handle errors
      daemonProcess.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      daemonProcess.on('exit', (code) => {
        console.log(`[DaemonBootstrap] Daemon process exited with code ${code}`);
        daemonProcess = null;
      });

      // Wait for "ready" signal
      const onMessage = (msg: unknown): void => {
        if (
          typeof msg === 'object' &&
          msg !== null &&
          (msg as { type: string }).type === 'daemon:ready'
        ) {
          clearTimeout(timer);
          daemonProcess?.removeListener('message', onMessage);

          // Create transport + client
          const transport = createChildProcessTransport(daemonProcess!);
          const daemonClient = new DaemonClient({ transport });

          console.log('[DaemonBootstrap] Daemon process ready, pid:', (msg as { pid: number }).pid);
          resolve(daemonClient);
        }
      };

      daemonProcess.on('message', onMessage);

      // Send initialization payload
      daemonProcess.send({
        type: 'daemon:init',
        userDataPath,
      });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

/**
 * Resolve the path to the daemon entry script.
 */
function getDaemonEntryPath(): string {
  if (app.isPackaged) {
    // In production, the compiled daemon entry is bundled with the app
    return path.join(process.resourcesPath, 'daemon', 'entry.js');
  }
  // In development, use the TypeScript source via ts-node or the compiled output
  return path.join(app.getAppPath(), 'out', 'main', 'daemon', 'entry.js');
}

/**
 * Register in-process daemon handlers (same as daemon/entry.ts).
 */
function registerInProcessHandlers(
  srv: DaemonServer,
  taskManager: TaskManagerAPI,
  storage: StorageAPI,
): void {
  srv.registerMethod('task.get', (params) => {
    if (!params) {
      return null;
    }
    return storage.getTask(params.taskId) ?? null;
  });

  srv.registerMethod('task.list', () => storage.getTasks());

  srv.registerMethod('task.delete', (params) => {
    if (params) {
      storage.deleteTask(params.taskId);
    }
  });

  srv.registerMethod('task.clearHistory', () => storage.clearHistory());

  srv.registerMethod('task.getTodos', (params) => {
    if (!params) {
      return [];
    }
    return storage.getTodosForTask(params.taskId);
  });

  srv.registerMethod('task.cancel', async (params) => {
    if (!params) {
      return;
    }
    const { taskId } = params;
    if (taskManager.isTaskQueued(taskId)) {
      taskManager.cancelQueuedTask(taskId);
      storage.updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
      return;
    }
    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.cancelTask(taskId);
      storage.updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
    }
  });

  srv.registerMethod('task.interrupt', async (params) => {
    if (!params) {
      return;
    }
    if (taskManager.hasActiveTask(params.taskId)) {
      await taskManager.interruptTask(params.taskId);
    }
  });

  srv.registerMethod('task.sendResponse', async (params) => {
    if (!params) {
      return;
    }
    await taskManager.sendResponse(params.taskId, params.response);
  });

  srv.registerMethod('task.getActiveIds', () => taskManager.getActiveTaskIds());
  srv.registerMethod('task.getActiveCount', () => taskManager.getActiveTaskCount());

  srv.registerMethod('task.hasActive', (params) => {
    if (!params) {
      return false;
    }
    return taskManager.hasActiveTask(params.taskId);
  });

  srv.registerMethod('task.isQueued', (params) => {
    if (!params) {
      return false;
    }
    return taskManager.isTaskQueued(params.taskId);
  });

  srv.registerMethod('task.cancelQueued', (params) => {
    if (!params) {
      return false;
    }
    return taskManager.cancelQueuedTask(params.taskId);
  });

  srv.registerMethod('storage.saveTask', (params) => {
    if (params) {
      storage.saveTask(params.task);
    }
  });

  srv.registerMethod('storage.updateTaskStatus', (params) => {
    if (params) {
      storage.updateTaskStatus(params.taskId, params.status, params.completedAt);
    }
  });

  srv.registerMethod('storage.updateTaskSummary', (params) => {
    if (params) {
      storage.updateTaskSummary(params.taskId, params.summary);
    }
  });

  srv.registerMethod('storage.addTaskMessage', (params) => {
    if (params) {
      storage.addTaskMessage(params.taskId, params.message);
    }
  });

  // ── Scheduling ───────────────────────────────────────────────────

  srv.registerMethod('task.schedule', (params) => {
    if (!params) {
      throw new Error('Missing schedule params');
    }
    return addScheduledTask(params.cron, params.prompt);
  });

  srv.registerMethod('task.listScheduled', () => {
    return listScheduledTasks();
  });

  srv.registerMethod('task.cancelScheduled', (params) => {
    if (params) {
      cancelScheduledTask(params.scheduleId);
    }
  });

  console.log('[DaemonBootstrap] In-process handlers registered');
}

/**
 * Get the daemon client. Throws if not bootstrapped.
 */
export function getDaemonClient(): DaemonClient {
  if (!client) {
    throw new Error('Daemon not bootstrapped. Call bootstrapDaemon() first.');
  }
  return client;
}

/**
 * Get the daemon server (for pushing notifications). Only available in in-process mode.
 */
export function getDaemonServer(): DaemonServer | null {
  return server;
}

/**
 * Get the current daemon mode.
 */
export function getDaemonMode(): 'child-process' | 'in-process' | null {
  return mode;
}

/**
 * Shut down the daemon.
 */
export function shutdownDaemon(): void {
  if (client) {
    client.close();
    client = null;
  }
  if (server) {
    server.close();
    server = null;
  }
  if (daemonProcess) {
    daemonProcess.kill();
    daemonProcess = null;
  }
  disposeScheduler();
  mode = null;
  console.log('[DaemonBootstrap] Daemon shut down');
}
