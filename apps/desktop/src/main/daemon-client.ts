import { BrowserWindow } from 'electron';
import { DaemonRpcClient } from '@accomplish_ai/agent-core';
import type {
  Task,
  TaskStartParams,
  TaskStopParams,
  TaskInterruptParams,
  TaskGetParams,
  TaskDeleteParams,
  TaskGetTodosParams,
  PermissionRespondParams,
  SessionResumeParams,
  HealthCheckResult,
  TodoItem,
  StoredTask,
} from '@accomplish_ai/agent-core';
let client: DaemonRpcClient | null = null;
let connectingPromise: Promise<DaemonRpcClient> | null = null;
let disconnecting = false;

function broadcastToWindows(channel: string, data: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    const sender = window.webContents;
    if (!sender.isDestroyed()) {
      sender.send(channel, data);
    }
  }
}

function forwardNotification(method: string, params: unknown): void {
  const data = (params ?? {}) as Record<string, unknown>;

  switch (method) {
    case 'task.message':
      broadcastToWindows('task:update:batch', data);
      break;
    case 'task.complete':
      broadcastToWindows('task:update', { ...data, type: 'complete' });
      break;
    case 'task.error':
      broadcastToWindows('task:update', { ...data, type: 'error' });
      break;
    case 'task.progress':
      broadcastToWindows('task:progress', data);
      break;
    case 'permission.request':
      broadcastToWindows('permission:request', data);
      break;
    case 'task.thought':
      broadcastToWindows('task:thought', data);
      break;
    case 'task.checkpoint':
      broadcastToWindows('task:checkpoint', data);
      break;
    case 'task.summary':
      broadcastToWindows('task:summary', data);
      break;
    case 'task.statusChange':
      broadcastToWindows('task:status-change', data);
      break;
    default:
      break;
  }
}

export async function connectToDaemon(): Promise<DaemonRpcClient> {
  if (client?.isConnected()) {
    return client;
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = (async () => {
    try {
      if (client) {
        try {
          await client.disconnect();
        } catch {
          // Ignore cleanup errors from stale client
        }
        client = null;
      }

      const newClient = new DaemonRpcClient({
        reconnect: true,
        reconnectInterval: 3000,
        onConnect: () => {
          console.log('[Daemon Client] Connected');
        },
        onDisconnect: () => {
          console.log('[Daemon Client] Disconnected');
        },
        onNotification: forwardNotification,
      });

      await newClient.connect();

      if (disconnecting) {
        // disconnect was called while we were connecting — tear down immediately
        try {
          await newClient.disconnect();
        } catch {
          // best-effort
        }
        throw new Error('Connection cancelled: disconnect was requested');
      }

      client = newClient;
      return newClient;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

export function getDaemonClient(): DaemonRpcClient | null {
  return client?.isConnected() ? client : null;
}

export async function disconnectFromDaemon(): Promise<void> {
  disconnecting = true;
  try {
    if (connectingPromise) {
      try {
        await connectingPromise;
      } catch {
        // Connection may have failed or been cancelled — that's fine
      }
      connectingPromise = null;
    }

    if (client) {
      try {
        await client.disconnect();
      } finally {
        client = null;
      }
    }
  } finally {
    disconnecting = false;
  }
}

export async function isDaemonRunning(): Promise<boolean> {
  if (client?.isConnected()) {
    return true;
  }

  const probe = new DaemonRpcClient();
  try {
    await Promise.race([
      probe.connect(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Connect timeout')), 3_000)),
    ]);
    await probe.call<HealthCheckResult>('health.check', undefined, 3_000);
    return true;
  } catch {
    return false;
  } finally {
    try {
      await probe.disconnect();
    } catch {
      // Ignore cleanup errors
    }
  }
}

export async function daemonStartTask(params: TaskStartParams): Promise<Task> {
  const c = getDaemonClient();
  if (!c) {
    throw new Error('Not connected to daemon');
  }
  return c.call<Task>('task.start', params, 120_000);
}

export async function daemonStopTask(params: TaskStopParams): Promise<void> {
  const c = getDaemonClient();
  if (!c) {
    throw new Error('Not connected to daemon');
  }
  return c.call<void>('task.stop', params);
}

export async function daemonInterruptTask(params: TaskInterruptParams): Promise<void> {
  const c = getDaemonClient();
  if (!c) {
    throw new Error('Not connected to daemon');
  }
  return c.call<void>('task.interrupt', params);
}

export async function daemonGetTask(params: TaskGetParams): Promise<StoredTask | null> {
  const c = getDaemonClient();
  if (!c) {
    throw new Error('Not connected to daemon');
  }
  return c.call<StoredTask | null>('task.get', params);
}

export async function daemonDeleteTask(params: TaskDeleteParams): Promise<void> {
  const c = getDaemonClient();
  if (!c) {
    throw new Error('Not connected to daemon');
  }
  return c.call<void>('task.delete', params);
}

export async function daemonClearHistory(): Promise<void> {
  const c = getDaemonClient();
  if (!c) {
    throw new Error('Not connected to daemon');
  }
  return c.call<void>('task.clearHistory');
}

export async function daemonGetTodos(params: TaskGetTodosParams): Promise<TodoItem[]> {
  const c = getDaemonClient();
  if (!c) {
    throw new Error('Not connected to daemon');
  }
  return c.call<TodoItem[]>('task.getTodos', params);
}

export async function daemonListTasks(): Promise<Task[]> {
  const c = getDaemonClient();
  if (!c) {
    throw new Error('Not connected to daemon');
  }
  return c.call<Task[]>('task.list');
}

export async function daemonRespondPermission(params: PermissionRespondParams): Promise<void> {
  const c = getDaemonClient();
  if (!c) {
    throw new Error('Not connected to daemon');
  }
  return c.call<void>('permission.respond', params);
}

export async function daemonResumeSession(params: SessionResumeParams): Promise<Task> {
  const c = getDaemonClient();
  if (!c) {
    throw new Error('Not connected to daemon');
  }
  return c.call<Task>('session.resume', params);
}

