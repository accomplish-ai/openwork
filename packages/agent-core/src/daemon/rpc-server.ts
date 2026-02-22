import { createServer, connect, type Server, type Socket } from 'node:net';
import { mkdir, unlink, stat, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { platform } from 'node:os';
import { getSocketPath } from './socket-path.js';
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification,
  RPC_ERROR_CODES,
  isJsonRpcRequest,
} from './types.js';

const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_WRITE_BUFFER_BYTES = 1024 * 1024; // 1 MB - disconnect slow consumers before buffer bloats

export interface RpcServerOptions {
  socketPath?: string;
  onConnection?: (clientId: string) => void;
  onDisconnection?: (clientId: string) => void;
  onError?: (err: Error) => void;
}

export interface RpcMethodHandler {
  (params: unknown): Promise<unknown>;
}

export class DaemonRpcServer {
  private server: Server | null = null;
  private clients = new Map<string, Socket>();
  private methods = new Map<string, RpcMethodHandler>();
  private clientCounter = 0;
  private socketPath: string;
  private onConnection?: (clientId: string) => void;
  private onDisconnection?: (clientId: string) => void;
  private onError?: (err: Error) => void;

  constructor(options?: RpcServerOptions) {
    this.socketPath = options?.socketPath ?? getSocketPath();
    this.onConnection = options?.onConnection;
    this.onDisconnection = options?.onDisconnection;
    this.onError = options?.onError;
  }

  registerMethod(method: string, handler: RpcMethodHandler): void {
    this.methods.set(method, handler);
  }

  notify(method: string, params: unknown): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    const data = JSON.stringify(notification) + '\n';
    for (const [clientId, socket] of Array.from(this.clients)) {
      if (!socket.destroyed) {
        this.safeWrite(socket, data, clientId);
      }
    }
  }

  notifyClient(clientId: string, method: string, params: unknown): void {
    const socket = this.clients.get(clientId);
    if (socket && !socket.destroyed) {
      const notification: JsonRpcNotification = {
        jsonrpc: '2.0',
        method,
        params,
      };
      this.safeWrite(socket, JSON.stringify(notification) + '\n', clientId);
    }
  }

  getConnectedClientCount(): number {
    return this.clients.size;
  }

  isClientConnected(clientId: string): boolean {
    const socket = this.clients.get(clientId);
    return socket !== undefined && !socket.destroyed;
  }

  async start(): Promise<void> {
    await this.cleanupStaleSocket();
    await this.ensureSocketDir();

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => this.handleConnection(socket));

      const onStartupError = (err: Error) => {
        reject(err);
      };
      this.server.on('error', onStartupError);

      this.server.listen(this.socketPath, () => {
        this.server!.removeListener('error', onStartupError);
        this.server!.on('error', (err) => {
          if (this.onError) {
            this.onError(err);
          } else {
            console.error('[RpcServer] Server error:', err.message);
          }
        });
        if (platform() !== 'win32') {
          chmod(this.socketPath, 0o600).catch(() => {});
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Close all client connections
    for (const [, socket] of Array.from(this.clients)) {
      if (!socket.destroyed) {
        socket.destroy();
      }
    }
    this.clients.clear();

    // Close the server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    // Remove socket file
    await this.removeSocketFile();
  }

  private handleConnection(socket: Socket): void {
    this.clientCounter++;
    const clientId = `client_${this.clientCounter}`;
    this.clients.set(clientId, socket);

    let buffer = '';
    let disconnected = false;

    this.onConnection?.(clientId);

    socket.on('data', (chunk) => {
      buffer += chunk.toString();

      if (buffer.length > MAX_BUFFER_SIZE) {
        console.error(`[RpcServer] Client ${clientId} exceeded max buffer size, disconnecting`);
        socket.destroy();
        return;
      }

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.length > 0) {
          this.handleMessage(clientId, socket, line);
        }
      }
    });

    const handleDisconnect = () => {
      if (disconnected) {
        return;
      }
      disconnected = true;
      this.clients.delete(clientId);
      this.onDisconnection?.(clientId);
    };

    socket.on('close', handleDisconnect);
    socket.on('error', handleDisconnect);
  }

  private handleMessage(clientId: string, socket: Socket, rawMessage: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      this.sendError(socket, null, RPC_ERROR_CODES.PARSE_ERROR, 'Parse error', clientId);
      return;
    }

    if (!isJsonRpcRequest(parsed)) {
      this.sendError(socket, null, RPC_ERROR_CODES.INVALID_REQUEST, 'Invalid Request', clientId);
      return;
    }

    const request = parsed;
    this.handleRequest(clientId, socket, request).catch((err) => {
      const message = err instanceof Error ? err.message : 'Internal error';
      this.sendError(socket, request.id, RPC_ERROR_CODES.INTERNAL_ERROR, message, clientId);
    });
  }

  private async handleRequest(
    clientId: string,
    socket: Socket,
    request: JsonRpcRequest,
  ): Promise<void> {
    const handler = this.methods.get(request.method);
    if (!handler) {
      this.sendError(socket, request.id, RPC_ERROR_CODES.METHOD_NOT_FOUND, 'Method not found', clientId);
      return;
    }

    try {
      const result = await handler(request.params);
      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: request.id,
        result: result ?? null,
      };
      this.safeWrite(socket, JSON.stringify(response) + '\n', clientId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      this.sendError(socket, request.id, RPC_ERROR_CODES.INTERNAL_ERROR, message, clientId);
    }
  }

  private sendError(
    socket: Socket,
    id: string | number | null,
    code: number,
    message: string,
    clientId?: string,
  ): void {
    if (socket.destroyed) {
      return;
    }
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };
    this.safeWrite(socket, JSON.stringify(response) + '\n', clientId);
  }

  private safeWrite(socket: Socket, data: string, clientId?: string): void {
    if (socket.destroyed) {
      return;
    }
    const ok = socket.write(data);
    if (!ok && socket.writableLength > MAX_WRITE_BUFFER_BYTES) {
      if (clientId) {
        console.warn(`[RpcServer] Client ${clientId} write buffer too large (${socket.writableLength}), disconnecting`);
        this.clients.delete(clientId);
      }
      socket.destroy();
    }
  }

  /**
   * Stale socket cleanup relies on the PID lock (pid-lock.ts) being held
   * before this method is called, preventing concurrent daemon starts from
   * racing on socket removal.
   */
  private async cleanupStaleSocket(): Promise<void> {
    try {
      await stat(this.socketPath);
    } catch {
      return;
    }

    const isAlive = await this.isSocketAlive();
    if (isAlive) {
      throw new Error(`Another daemon is already running on ${this.socketPath}`);
    }

    try {
      await unlink(this.socketPath);
    } catch {
      // Another process may have already removed it
    }
  }

  private isSocketAlive(): Promise<boolean> {
    return new Promise((resolve) => {
      const probe = connect(this.socketPath);

      const cleanup = () => {
        probe.removeAllListeners();
        probe.destroy();
      };

      probe.once('connect', () => {
        cleanup();
        resolve(true);
      });
      probe.once('error', () => {
        cleanup();
        resolve(false);
      });

      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 1000);
      timer.unref();
    });
  }

  private async ensureSocketDir(): Promise<void> {
    const dir = dirname(this.socketPath);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if (platform() !== 'win32') {
      await chmod(dir, 0o700);
    }
  }

  private async removeSocketFile(): Promise<void> {
    try {
      await unlink(this.socketPath);
    } catch {
      // Already removed or doesn't exist
    }
  }
}
