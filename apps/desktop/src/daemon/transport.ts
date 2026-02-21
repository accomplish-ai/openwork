/**
 * Daemon Transport Layer
 *
 * Provides a newline-delimited JSON (ndjson) transport over Unix domain
 * sockets / named pipes. Used by both the daemon server and the UI client.
 */

import net from 'net';
import { EventEmitter } from 'events';
import type {
  RpcMessage,
  RpcRequest,
  RpcResponse,
  RpcNotification,
} from './protocol';

// ---------------------------------------------------------------------------
// ndjson framing
// ---------------------------------------------------------------------------

/**
 * Accumulates data from a socket and emits complete JSON messages.
 * Each message is delimited by a newline character.
 */
export class NdjsonParser extends EventEmitter {
  private buffer = '';

  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    // Keep the last (possibly incomplete) segment in the buffer
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        this.emit('message', msg);
      } catch {
        this.emit('error', new Error(`Invalid JSON: ${trimmed.slice(0, 120)}`));
      }
    }
  }

  reset(): void {
    this.buffer = '';
  }
}

/**
 * Serialize a message to ndjson wire format.
 */
export function serialize(msg: RpcMessage): string {
  return JSON.stringify(msg) + '\n';
}

// ---------------------------------------------------------------------------
// Server transport (Daemon side)
// ---------------------------------------------------------------------------

export interface DaemonTransportServerEvents {
  connection: (client: DaemonClientConnection) => void;
  error: (err: Error) => void;
  listening: () => void;
}

/**
 * Represents a single connected client (e.g. the Electron UI).
 * The daemon holds one of these per connected socket.
 */
export class DaemonClientConnection extends EventEmitter {
  readonly id: string;
  private socket: net.Socket;
  private parser = new NdjsonParser();
  private _alive = true;

  constructor(socket: net.Socket, id: string) {
    super();
    this.socket = socket;
    this.id = id;

    socket.setEncoding('utf-8');

    socket.on('data', (data: string) => {
      this.parser.feed(data);
    });

    this.parser.on('message', (msg: RpcMessage) => {
      this.emit('message', msg);
    });

    this.parser.on('error', (err: Error) => {
      this.emit('error', err);
    });

    socket.on('close', () => {
      this._alive = false;
      this.emit('close');
    });

    socket.on('error', (err: Error) => {
      this._alive = false;
      this.emit('error', err);
    });
  }

  get alive(): boolean {
    return this._alive && !this.socket.destroyed;
  }

  send(msg: RpcMessage): void {
    if (!this.alive) return;
    this.socket.write(serialize(msg));
  }

  /** Send a JSON-RPC response */
  respond(id: string | number, result: unknown): void {
    this.send({ jsonrpc: '2.0', id, result });
  }

  /** Send a JSON-RPC error response */
  respondError(id: string | number, code: number, message: string, data?: unknown): void {
    this.send({ jsonrpc: '2.0', id, error: { code, message, data } });
  }

  /** Send a JSON-RPC notification (push event) */
  notify(method: string, params?: Record<string, unknown>): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  close(): void {
    this._alive = false;
    this.socket.destroy();
  }
}

/**
 * The daemon-side transport server. Listens on a Unix domain socket / named pipe
 * and manages connected clients.
 */
export class DaemonTransportServer extends EventEmitter {
  private server: net.Server | null = null;
  private clients = new Map<string, DaemonClientConnection>();
  private nextClientId = 0;

  constructor(private socketPath: string) {
    super();
  }

  async listen(): Promise<void> {
    // Clean up stale socket file if it exists (Unix only)
    if (process.platform !== 'win32') {
      const fs = await import('fs');
      try {
        fs.unlinkSync(this.socketPath);
      } catch {
        // File doesn't exist — fine
      }
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        const id = `client-${this.nextClientId++}`;
        const client = new DaemonClientConnection(socket, id);

        this.clients.set(id, client);

        client.on('close', () => {
          this.clients.delete(id);
        });

        this.emit('connection', client);
      });

      this.server.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        // Set socket permissions on Unix (owner read/write only)
        // Done synchronously before resolve to avoid a race window
        if (process.platform !== 'win32') {
          try {
            const fsSync = require('fs');
            fsSync.chmodSync(this.socketPath, 0o600);
          } catch {
            // Non-critical
          }
        }
        this.emit('listening');
        resolve();
      });
    });
  }

  /** Broadcast a notification to all connected clients */
  broadcast(method: string, params?: Record<string, unknown>): void {
    for (const client of this.clients.values()) {
      if (client.alive) {
        client.notify(method, params);
      }
    }
  }

  /** Get number of connected clients */
  get clientCount(): number {
    return this.clients.size;
  }

  async close(): Promise<void> {
    for (const client of this.clients.values()) {
      client.close();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          // Clean up socket file on Unix
          if (process.platform !== 'win32') {
            import('fs').then((fs) => {
              try {
                fs.unlinkSync(this.socketPath);
              } catch {
                // Already gone
              }
            });
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Client transport (UI side)
// ---------------------------------------------------------------------------

export interface DaemonClientOptions {
  socketPath: string;
  /** Connection timeout in ms (default: 5000) */
  connectTimeout?: number;
  /** Automatically reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Reconnect interval in ms (default: 1000) */
  reconnectInterval?: number;
  /** Max reconnect attempts (default: 30) */
  maxReconnectAttempts?: number;
}

/**
 * The UI-side transport client. Connects to the daemon's Unix domain socket
 * and provides request/response and event subscription APIs.
 */
export class DaemonTransportClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private parser = new NdjsonParser();
  private pendingRequests = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  private nextRequestId = 1;
  private _connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private opts: Required<DaemonClientOptions>;
  private disposed = false;

  constructor(options: DaemonClientOptions) {
    super();
    this.opts = {
      connectTimeout: 5000,
      autoReconnect: true,
      reconnectInterval: 1000,
      maxReconnectAttempts: 30,
      ...options,
    };

    // Register parser listener once in the constructor to avoid
    // duplicate handlers on reconnect
    this.parser.on('message', (msg: RpcMessage) => {
      this.handleMessage(msg);
    });
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    if (this.disposed) throw new Error('Client is disposed');
    if (this._connected) return;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection to daemon timed out after ${this.opts.connectTimeout}ms`));
        this.socket?.destroy();
      }, this.opts.connectTimeout);

      this.socket = net.createConnection(this.opts.socketPath, () => {
        clearTimeout(timer);
        this._connected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
        resolve();
      });

      this.socket.setEncoding('utf-8');

      this.socket.on('data', (data: string) => {
        this.parser.feed(data);
      });

      this.socket.on('close', () => {
        clearTimeout(timer);
        this._connected = false;
        this.rejectAllPending(new Error('Connection closed'));
        this.emit('disconnected');
        this.scheduleReconnect();
      });

      this.socket.on('error', (err: Error) => {
        clearTimeout(timer);
        if (!this._connected) {
          reject(err);
        }
        this._connected = false;
        this.emit('error', err);
        this.scheduleReconnect();
      });
    });
  }

  /**
   * Send a JSON-RPC request and wait for the response.
   * @param method The RPC method name
   * @param params Optional parameters
   * @param timeoutMs Request timeout (default: 30000)
   */
  async request(method: string, params?: Record<string, unknown>, timeoutMs = 30000): Promise<unknown> {
    if (!this._connected || !this.socket) {
      throw new Error('Not connected to daemon');
    }

    const id = this.nextRequestId++;
    const msg: RpcRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.socket!.write(serialize(msg));
    });
  }

  private handleMessage(msg: RpcMessage): void {
    // Response to a pending request
    if ('id' in msg && msg.id != null) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        clearTimeout(pending.timer);
        const response = msg as RpcResponse;
        if (response.error) {
          const err = new Error(response.error.message);
          (err as any).code = response.error.code;
          (err as any).data = response.error.data;
          pending.reject(err);
        } else {
          pending.resolve(response.result);
        }
      }
      return;
    }

    // Notification (push event from daemon)
    if ('method' in msg && !('id' in msg)) {
      const notification = msg as RpcNotification;
      this.emit('notification', notification.method, notification.params);
      // Also emit the specific method for convenience
      this.emit(notification.method, notification.params);
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }

  private scheduleReconnect(): void {
    if (this.disposed || !this.opts.autoReconnect) return;
    if (this.reconnectAttempts >= this.opts.maxReconnectAttempts) {
      this.emit('reconnect-failed');
      return;
    }

    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.emit('reconnecting', this.reconnectAttempts);
      try {
        this.parser.reset();
        await this.connect();
      } catch {
        // connect() failure will trigger another scheduleReconnect via the error handler
      }
    }, this.opts.reconnectInterval);
  }

  /** Gracefully disconnect */
  disconnect(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.rejectAllPending(new Error('Client disconnected'));
    this.socket?.destroy();
    this.socket = null;
    this._connected = false;
  }
}
