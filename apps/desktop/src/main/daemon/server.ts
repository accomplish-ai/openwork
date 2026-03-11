/**
 * Accomplish Daemon Socket Server
 *
 * Listens on a local Unix socket (macOS/Linux) or named pipe (Windows) and
 * accepts JSON-RPC 2.0 commands from external clients (CLI, scheduled tasks,
 * other apps).  This is Step 2 of the incremental daemon migration.
 *
 * Protocol: newline-delimited JSON-RPC 2.0 messages over the socket.
 */

import net from 'net';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

export interface DaemonRpcMethod {
  'daemon.ping': { params: Record<string, never>; result: { pong: boolean } };
  'daemon.status': {
    params: Record<string, never>;
    result: { running: boolean; version: string; activeTasks: number };
  };
  'daemon.health': {
    params: Record<string, never>;
    result: { version: string; uptime: number; activeTasks: number; memoryUsage: number };
  };
  'task.list': { params: Record<string, never>; result: { tasks: string[] } };
  'task.start': { params: { prompt: string; taskId?: string }; result: { taskId: string } };
  'task.stop': { params: { taskId: string }; result: { ok: boolean } };
  'task.get': { params: { taskId: string }; result: { task: unknown } };
  'task.schedule': {
    params: { cron: string; prompt: string };
    result: { id: string; cron: string; prompt: string; nextRunAt?: string };
  };
  'task.listScheduled': { params: Record<string, never>; result: { schedules: unknown[] } };
  'task.cancelScheduled': { params: { scheduleId: string }; result: { ok: boolean } };
}

export type DaemonMethod = keyof DaemonRpcMethod;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type MethodHandler = (params: unknown) => Promise<unknown> | unknown;

let server: net.Server | null = null;
const methodHandlers = new Map<string, MethodHandler>();

export function getSocketPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\accomplish-daemon';
  }
  return path.join(app.getPath('userData'), 'daemon.sock');
}

export function registerMethod(method: DaemonMethod | string, handler: MethodHandler): void {
  methodHandlers.set(method, handler);
}

function isNotification(request: JsonRpcRequest): boolean {
  return typeof request.id === 'undefined';
}

function handleLine(line: string, socket: net.Socket): void {
  let parsed: unknown;

  try {
    parsed = JSON.parse(line);
  } catch {
    const errResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    };
    socket.write(JSON.stringify(errResponse) + '\n');
    return;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request' },
    };
    socket.write(JSON.stringify(response) + '\n');
    return;
  }

  const request = parsed as JsonRpcRequest;
  const { id, method, params } = request;
  const notification = isNotification(request);

  const handler = methodHandlers.get(method);
  if (!handler) {
    // Per JSON-RPC 2.0 spec, notifications must not receive a response
    if (notification) {
      return;
    }
    const errResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
    socket.write(JSON.stringify(errResponse) + '\n');
    return;
  }

  Promise.resolve()
    .then(() => handler(params ?? {}))
    .then((result) => {
      if (notification) {
        return;
      }
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: id ?? null,
        result,
      };
      socket.write(JSON.stringify(response) + '\n');
    })
    .catch((err: unknown) => {
      if (notification) {
        return;
      }
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: id ?? null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: err instanceof Error ? err.message : String(err),
        },
      };
      socket.write(JSON.stringify(response) + '\n');
    });
}

export function startDaemonServer(): void {
  if (server) {
    return;
  }

  const socketPath = getSocketPath();

  // Remove stale socket file on unix
  if (process.platform !== 'win32') {
    try {
      if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
      }
    } catch (err) {
      console.warn('[Daemon] Failed to remove stale socket file:', err);
    }
  }

  server = net.createServer((socket) => {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          handleLine(trimmed, socket);
        }
      }
    });

    socket.on('end', () => {
      const trimmed = buffer.trim();
      if (trimmed) {
        handleLine(trimmed, socket);
      }
      buffer = '';
    });

    socket.on('error', (err) => {
      console.error('[Daemon] Socket error:', err.message);
    });
  });

  server.on('error', (err) => {
    console.error('[Daemon] Server error:', err.message);
    if (server && !server.listening) {
      server = null;
    }
  });

  server.listen(socketPath, () => {
    console.log(`[Daemon] Socket server listening at ${socketPath}`);
    // Ensure only the owner can connect on unix
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(socketPath, 0o600);
      } catch (err) {
        console.warn('[Daemon] Failed to chmod socket:', err);
      }
    }
  });
}

export function stopDaemonServer(): void {
  if (!server) {
    return;
  }
  server.close();
  server = null;

  const socketPath = getSocketPath();
  if (process.platform !== 'win32' && fs.existsSync(socketPath)) {
    try {
      fs.unlinkSync(socketPath);
    } catch (err) {
      console.warn('[Daemon] Failed to remove socket file:', err);
    }
  }

  console.log('[Daemon] Socket server stopped');
}
