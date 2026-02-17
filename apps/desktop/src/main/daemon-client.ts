/**
 * Daemon Client
 *
 * Connects the Electron app to the daemon process via HTTP REST + WebSocket.
 * Replaces direct TaskManager/Storage usage in the main process.
 */

import http from 'http';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import WebSocket from 'ws';
import type { BrowserWindow } from 'electron';

const DAEMON_PORT = 9229;
const DAEMON_URL = `http://127.0.0.1:${DAEMON_PORT}`;
const WS_URL = `ws://127.0.0.1:${DAEMON_PORT}/ws`;

let ws: WebSocket | null = null;
let daemonProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

// --- HTTP Client ---

function request<T = unknown>(method: string, urlPath: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, DAEMON_URL);
    const data = body ? JSON.stringify(body) : undefined;

    const req = http.request(url, { method, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        const parsed = JSON.parse(raw) as T;
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error((parsed as Record<string, string>).error || `HTTP ${res.statusCode}`));
        } else {
          resolve(parsed);
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

export const daemon = {
  // Health
  health: () => request<{ status: string; pid: number; activeTasks: number }>('GET', '/health'),

  // Tasks
  startTask: (config: Record<string, unknown>) => request('POST', '/tasks', config),
  listTasks: () => request('GET', '/tasks'),
  getTask: (id: string) => request('GET', `/tasks/${id}`),
  deleteTask: (id: string) => request('DELETE', `/tasks/${id}`),
  cancelTask: (id: string) => request('POST', `/tasks/${id}/cancel`),
  interruptTask: (id: string) => request('POST', `/tasks/${id}/interrupt`),
  respondToTask: (id: string, response: string) => request('POST', `/tasks/${id}/respond`, { response }),

  // Settings
  getProviderSettings: () => request('GET', '/settings/providers'),
  getSelectedModel: () => request('GET', '/settings/model'),
  setSelectedModel: (model: unknown) => request('PUT', '/settings/model', model),

  // API Keys
  storeApiKey: (provider: string, key: string) => request('POST', `/api-keys/${provider}`, { key }),
  deleteApiKey: (provider: string) => request('DELETE', `/api-keys/${provider}`),

  // Shutdown
  shutdown: () => request('POST', '/shutdown'),
};

// --- WebSocket Connection ---

function connectWebSocket(): void {
  if (ws) return;

  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('[Daemon Client] WebSocket connected');
  });

  ws.on('message', (raw) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const event = JSON.parse(raw.toString()) as { type: string; taskId?: string; data?: unknown; status?: string; error?: string };

    // Map daemon events to existing Electron IPC channels
    const channelMap: Record<string, string> = {
      'task:update': 'task:update:batch',
      'task:progress': 'task:progress',
      'task:status-change': 'task:status-change',
      'task:complete': 'task:update',
      'task:error': 'task:update',
      'task:thought': 'task:thought',
      'task:checkpoint': 'task:checkpoint',
      'task:todo-update': 'todo:update',
      'permission:request': 'permission:request',
      'auth:error': 'auth:error',
    };

    const channel = channelMap[event.type];
    if (!channel) return;

    // Format data to match what the renderer expects
    if (event.type === 'task:update') {
      mainWindow.webContents.send(channel, { taskId: event.taskId, messages: event.data });
    } else if (event.type === 'task:complete') {
      mainWindow.webContents.send(channel, { taskId: event.taskId, type: 'complete', result: event.data });
    } else if (event.type === 'task:error') {
      mainWindow.webContents.send(channel, { taskId: event.taskId, type: 'error', error: event.error });
    } else if (event.type === 'task:progress') {
      mainWindow.webContents.send(channel, { taskId: event.taskId, ...event.data as object });
    } else if (event.type === 'task:status-change') {
      mainWindow.webContents.send(channel, { taskId: event.taskId, status: event.status });
    } else if (event.type === 'task:todo-update') {
      mainWindow.webContents.send(channel, { taskId: event.taskId, todos: event.data });
    } else {
      mainWindow.webContents.send(channel, event.data);
    }
  });

  ws.on('close', () => {
    console.log('[Daemon Client] WebSocket disconnected, reconnecting in 2s...');
    ws = null;
    setTimeout(connectWebSocket, 2000);
  });

  ws.on('error', (err) => {
    console.warn('[Daemon Client] WebSocket error:', err.message);
    ws?.close();
    ws = null;
  });
}

/**
 * Send a message to the daemon via WebSocket (for permission/question responses).
 */
export function sendWsMessage(msg: Record<string, unknown>): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// --- Daemon Lifecycle ---

/**
 * Check if the daemon is running by hitting the health endpoint.
 */
export async function isDaemonRunning(): Promise<boolean> {
  return daemon.health().then(() => true).catch(() => false);
}

/**
 * Spawn the daemon as a detached child process.
 */
export function spawnDaemon(): void {
  const daemonScript = path.join(process.cwd(), 'apps', 'daemon', 'dist', 'index.js');
  console.log('[Daemon Client] Spawning daemon:', daemonScript);

  daemonProcess = spawn('node', [daemonScript], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });

  daemonProcess.unref();
  console.log('[Daemon Client] Daemon spawned with pid:', daemonProcess.pid);
}

/**
 * Ensure the daemon is running, spawning it if needed.
 * Then connect the WebSocket for real-time events.
 */
export async function ensureDaemon(window: BrowserWindow): Promise<void> {
  mainWindow = window;

  if (!(await isDaemonRunning())) {
    spawnDaemon();

    // Wait for daemon to be ready (poll health endpoint)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isDaemonRunning()) break;
    }
  }

  connectWebSocket();
}

export function disconnectDaemon(): void {
  ws?.close();
  ws = null;
}
