import { connect, type Socket } from 'node:net';
import { getSocketPath } from './socket-path.js';
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from './types.js';

const DEFAULT_CALL_TIMEOUT = 30_000;
const DEFAULT_RECONNECT_INTERVAL = 3_000;
const MAX_RECONNECT_INTERVAL = 60_000;
const RECONNECT_BACKOFF_FACTOR = 2;
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_WRITE_BUFFER_BYTES = 1024 * 1024; // 1 MB
const KEEPALIVE_INTERVAL = 30_000;
const KEEPALIVE_TIMEOUT = 10_000;

export interface RpcClientOptions {
  socketPath?: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  onNotification?: (method: string, params: unknown) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

type NotificationHandler = (method: string, params: unknown) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class DaemonRpcClient {
  private socket: Socket | null = null;
  private socketPath: string;
  private reconnect: boolean;
  private reconnectInterval: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private notificationHandlers: NotificationHandler[] = [];
  private requestCounter = 0;
  private buffer = '';
  private connected = false;
  private intentionalDisconnect = false;
  private reconnectAttempts = 0;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  private optionOnNotification?: NotificationHandler;
  private optionOnConnect?: () => void;
  private optionOnDisconnect?: () => void;

  constructor(options?: RpcClientOptions) {
    this.socketPath = options?.socketPath ?? getSocketPath();
    this.reconnect = options?.reconnect ?? false;
    this.reconnectInterval = options?.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL;
    this.optionOnNotification = options?.onNotification;
    this.optionOnConnect = options?.onConnect;
    this.optionOnDisconnect = options?.onDisconnect;
  }

  async connect(): Promise<void> {
    this.intentionalDisconnect = false;

    this.stopKeepalive();

    if (this.socket) {
      this.socket.removeAllListeners();
      if (!this.socket.destroyed) {
        this.socket.destroy();
      }
      this.socket = null;
    }

    return new Promise((resolve, reject) => {
      this.socket = connect(this.socketPath);

      const onConnect = () => {
        this.connected = true;
        this.buffer = '';
        this.reconnectAttempts = 0;
        this.socket!.removeListener('error', onError);
        this.startKeepalive();
        this.optionOnConnect?.();
        resolve();
      };

      const onError = (err: Error) => {
        this.socket!.removeListener('connect', onConnect);
        reject(err);
      };

      this.socket.once('connect', onConnect);
      this.socket.once('error', onError);

      this.socket.on('data', (chunk) => {
        this.buffer += chunk.toString();

        if (this.buffer.length > MAX_BUFFER_SIZE) {
          console.error('[RpcClient] Buffer exceeded max size, disconnecting');
          this.socket?.destroy();
          return;
        }

        let newlineIndex: number;
        while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
          const line = this.buffer.slice(0, newlineIndex).trim();
          this.buffer = this.buffer.slice(newlineIndex + 1);

          if (line.length > 0) {
            this.handleMessage(line);
          }
        }
      });

      this.socket.on('close', () => {
        this.handleDisconnect();
      });

      this.socket.on('error', () => {
        // Errors after connection are handled by the close event
      });
    });
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;

    this.stopKeepalive();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Client disconnected'));
      this.pendingRequests.delete(id);
    }

    if (this.socket) {
      const socket = this.socket;
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeout);
          this.socket = null;
          this.connected = false;
          resolve();
        };

        const timeout = setTimeout(() => {
          if (!socket.destroyed) {
            socket.destroy();
          }
          finish();
        }, 5_000);

        socket.once('close', finish);
        socket.destroy();
      });
    }
  }

  async call<T>(method: string, params?: unknown, timeout?: number): Promise<T> {
    if (!this.connected || !this.socket || this.socket.destroyed) {
      throw new Error('Not connected');
    }

    this.requestCounter++;
    const id = this.requestCounter;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined && { params }),
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC call '${method}' timed out after ${timeout ?? DEFAULT_CALL_TIMEOUT}ms`));
      }, timeout ?? DEFAULT_CALL_TIMEOUT);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      const ok = this.socket!.write(JSON.stringify(request) + '\n');
      if (!ok && this.socket && !this.socket.destroyed) {
        if (this.socket.writableLength > MAX_WRITE_BUFFER_BYTES) {
          this.pendingRequests.delete(id);
          clearTimeout(timer);
          reject(new Error('Write buffer exceeded limit'));
          this.socket.destroy();
        }
      }
    });
  }

  isConnected(): boolean {
    return this.connected && this.socket !== null && !this.socket.destroyed;
  }

  on(event: 'notification', handler: NotificationHandler): void {
    if (event === 'notification') {
      this.notificationHandlers.push(handler);
    }
  }

  off(event: 'notification', handler: NotificationHandler): void {
    if (event === 'notification') {
      const idx = this.notificationHandlers.indexOf(handler);
      if (idx !== -1) {
        this.notificationHandlers.splice(idx, 1);
      }
    }
  }

  private handleMessage(rawMessage: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return;
    }

    const msg = parsed as Record<string, unknown>;

    // Responses have `id` (non-null) and either `result` or `error`
    if ('id' in msg && msg.id !== null && msg.id !== undefined) {
      this.handleResponse(msg as unknown as JsonRpcResponse);
    } else if ('method' in msg && typeof msg.method === 'string' && !('id' in msg)) {
      this.handleNotification(msg as unknown as JsonRpcNotification);
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id as string | number);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id as string | number);
    clearTimeout(pending.timer);

    if (response.error) {
      pending.reject(
        new Error(`RPC error ${response.error.code}: ${response.error.message}`),
      );
    } else {
      pending.resolve(response.result);
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    this.optionOnNotification?.(notification.method, notification.params);
    for (const handler of this.notificationHandlers) {
      handler(notification.method, notification.params);
    }
  }

  private handleDisconnect(): void {
    const wasConnected = this.connected;
    this.connected = false;

    this.stopKeepalive();

    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Connection lost'));
      this.pendingRequests.delete(id);
    }

    if (wasConnected) {
      this.optionOnDisconnect?.();
    }

    if (this.reconnect && !this.intentionalDisconnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const delay = Math.min(
      this.reconnectInterval * Math.pow(RECONNECT_BACKOFF_FACTOR, this.reconnectAttempts),
      MAX_RECONNECT_INTERVAL,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      if (this.intentionalDisconnect) {
        return;
      }

      try {
        await this.connect();
      } catch {
        if (!this.intentionalDisconnect) {
          this.scheduleReconnect();
        }
      }
    }, delay);
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (!this.isConnected()) {
        return;
      }
      this.call('health.check', undefined, KEEPALIVE_TIMEOUT).catch(() => {
        // Keepalive failure will trigger disconnect via socket close
      });
    }, KEEPALIVE_INTERVAL);
    this.keepaliveTimer.unref();
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}
