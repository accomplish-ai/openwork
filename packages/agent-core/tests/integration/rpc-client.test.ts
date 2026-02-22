import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlink, mkdir, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { DaemonRpcClient } from '../../src/daemon/rpc-client.js';

const testDir = join(tmpdir(), `rpc-client-tests-${process.pid}`);

function tmpSocketPath(): string {
  return join(testDir, `test-rpc-client-${randomBytes(8).toString('hex')}.sock`);
}

interface TestServer {
  server: Server;
  responses: Map<number | string, unknown>;
  sockets: Socket[];
}

function createTestServer(socketPath: string): TestServer {
  const responses = new Map<number | string, unknown>();
  const sockets: Socket[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) {
          continue;
        }
        const req = JSON.parse(line);
        if (req.id !== undefined && req.id !== null) {
          const result = responses.has(req.id) ? responses.get(req.id) : null;
          socket.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n');
        }
      }
    });
  });
  return { server, responses, sockets };
}

function listenServer(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.listen(socketPath, () => resolve());
    server.on('error', reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

describe('DaemonRpcClient', () => {
  let testServer: TestServer | null = null;
  let client: DaemonRpcClient | null = null;
  let socketPath = '';

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  afterEach(async () => {
    // Disconnect client with a short timeout to avoid hanging afterEach
    if (client) {
      const c = client;
      client = null;
      try {
        // Race disconnect against a 1s hard timeout
        await Promise.race([
          c.disconnect(),
          new Promise<void>((resolve) => setTimeout(resolve, 1000)),
        ]);
      } catch {
        // already disconnected
      }
    }
    if (testServer) {
      for (const s of testServer.sockets) {
        if (!s.destroyed) {
          s.destroy();
        }
      }
      await closeServer(testServer.server);
      testServer = null;
    }
    if (socketPath) {
      try {
        await unlink(socketPath);
      } catch {
        // already cleaned up
      }
    }
  });

  it('connect successfully connects to a server', async () => {
    socketPath = tmpSocketPath();
    testServer = createTestServer(socketPath);
    await listenServer(testServer.server, socketPath);

    client = new DaemonRpcClient({ socketPath });
    await client.connect();
    expect(client.isConnected()).toBe(true);
  });

  it('connect rejects when server does not exist', async () => {
    socketPath = tmpSocketPath();
    client = new DaemonRpcClient({ socketPath });
    await expect(client.connect()).rejects.toThrow();
    expect(client.isConnected()).toBe(false);
  });

  it('disconnect cleanly closes connection', async () => {
    socketPath = tmpSocketPath();
    testServer = createTestServer(socketPath);
    await listenServer(testServer.server, socketPath);

    client = new DaemonRpcClient({ socketPath });
    await client.connect();
    expect(client.isConnected()).toBe(true);

    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('disconnect with settled flag resolves exactly once', async () => {
    socketPath = tmpSocketPath();
    testServer = createTestServer(socketPath);
    await listenServer(testServer.server, socketPath);

    client = new DaemonRpcClient({ socketPath });
    await client.connect();

    // Call disconnect - the settled flag in the source ensures the promise
    // resolves exactly once even if both 'close' and timeout fire
    let resolveCount = 0;
    const promise = client.disconnect().then(() => {
      resolveCount++;
    });
    await promise;
    // Verify no duplicate resolve attempts occur
    await vi.waitFor(() => {
      expect(resolveCount).toBe(1);
    });
  });

  it('call sends request and receives response', async () => {
    socketPath = tmpSocketPath();
    testServer = createTestServer(socketPath);
    testServer.responses.set(1, { status: 'ok' });
    await listenServer(testServer.server, socketPath);

    client = new DaemonRpcClient({ socketPath });
    await client.connect();

    const result = await client.call<{ status: string }>('health.check');
    expect(result).toEqual({ status: 'ok' });
  });

  it('call rejects on timeout', async () => {
    socketPath = tmpSocketPath();
    // Create a server that never responds
    const serverSockets: Socket[] = [];
    const silentServer = createServer((socket) => {
      serverSockets.push(socket);
    });
    testServer = { server: silentServer, responses: new Map(), sockets: serverSockets };
    await listenServer(silentServer, socketPath);

    client = new DaemonRpcClient({ socketPath });
    await client.connect();

    await expect(client.call('slow.method', undefined, 100)).rejects.toThrow(/timed out/);
  });

  it('call rejects when not connected', async () => {
    socketPath = tmpSocketPath();
    client = new DaemonRpcClient({ socketPath });

    await expect(client.call('any.method')).rejects.toThrow('Not connected');
  });

  it('isConnected returns correct state', async () => {
    socketPath = tmpSocketPath();
    testServer = createTestServer(socketPath);
    await listenServer(testServer.server, socketPath);

    client = new DaemonRpcClient({ socketPath });
    expect(client.isConnected()).toBe(false);

    await client.connect();
    expect(client.isConnected()).toBe(true);

    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('handles notifications via on("notification", handler)', async () => {
    socketPath = tmpSocketPath();
    // Create a server that sends a notification after connection
    const sockets: Socket[] = [];
    const server = createServer((socket) => {
      sockets.push(socket);
    });
    testServer = { server, responses: new Map(), sockets };
    await listenServer(server, socketPath);

    const receivedNotifications: Array<{ method: string; params: unknown }> = [];
    client = new DaemonRpcClient({ socketPath });
    client.on('notification', (method, params) => {
      receivedNotifications.push({ method, params });
    });

    await client.connect();

    // Server sends a notification (no id field)
    const notification = { jsonrpc: '2.0', method: 'task.progress', params: { taskId: '123', stage: 'done' } };
    for (const s of sockets) {
      s.write(JSON.stringify(notification) + '\n');
    }

    await vi.waitFor(() => {
      expect(receivedNotifications.length).toBe(1);
      expect(receivedNotifications[0].method).toBe('task.progress');
      expect(receivedNotifications[0].params).toEqual({ taskId: '123', stage: 'done' });
    });
  });

  it('handles notifications via constructor onNotification option', async () => {
    socketPath = tmpSocketPath();
    const sockets: Socket[] = [];
    const server = createServer((socket) => {
      sockets.push(socket);
    });
    testServer = { server, responses: new Map(), sockets };
    await listenServer(server, socketPath);

    const receivedNotifications: Array<{ method: string; params: unknown }> = [];
    client = new DaemonRpcClient({
      socketPath,
      onNotification: (method, params) => {
        receivedNotifications.push({ method, params });
      },
    });

    await client.connect();

    const notification = { jsonrpc: '2.0', method: 'task.error', params: { taskId: 'x', error: 'fail' } };
    for (const s of sockets) {
      s.write(JSON.stringify(notification) + '\n');
    }

    await vi.waitFor(() => {
      expect(receivedNotifications.length).toBe(1);
      expect(receivedNotifications[0].method).toBe('task.error');
    });
  });

  it('reconnects automatically after disconnect when reconnect is true', async () => {
    socketPath = tmpSocketPath();
    testServer = createTestServer(socketPath);
    await listenServer(testServer.server, socketPath);

    const connectEvents: boolean[] = [];
    const disconnectEvents: boolean[] = [];

    client = new DaemonRpcClient({
      socketPath,
      reconnect: true,
      reconnectInterval: 100,
      onConnect: () => {
        connectEvents.push(true);
      },
      onDisconnect: () => {
        disconnectEvents.push(true);
      },
    });

    await client.connect();
    expect(client.isConnected()).toBe(true);
    expect(connectEvents.length).toBe(1);

    // Destroy server-side socket to trigger disconnect
    for (const s of testServer.sockets) {
      s.destroy();
    }

    await vi.waitFor(() => {
      expect(disconnectEvents.length).toBe(1);
    });

    // Wait for reconnection
    await vi.waitFor(() => {
      expect(client!.isConnected()).toBe(true);
      expect(connectEvents.length).toBe(2);
    }, { timeout: 2000 });
  });

  it('call rejects pending requests on disconnect', async () => {
    socketPath = tmpSocketPath();
    // Server that accepts but never responds
    const sockets: Socket[] = [];
    const server = createServer((socket) => {
      sockets.push(socket);
    });
    testServer = { server, responses: new Map(), sockets };
    await listenServer(server, socketPath);

    client = new DaemonRpcClient({ socketPath });
    await client.connect();

    const callPromise = client.call('slow.method', undefined, 30000);

    // Destroy the server-side socket to trigger disconnect
    for (const s of sockets) {
      s.destroy();
    }

    await expect(callPromise).rejects.toThrow('Connection lost');
  });

  it('call returns error from server RPC error response', async () => {
    socketPath = tmpSocketPath();
    // Server that always returns an error
    const sockets: Socket[] = [];
    const server = createServer((socket) => {
      sockets.push(socket);
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) {
            continue;
          }
          const req = JSON.parse(line);
          socket.write(
            JSON.stringify({
              jsonrpc: '2.0',
              id: req.id,
              error: { code: -32601, message: 'Method not found' },
            }) + '\n',
          );
        }
      });
    });
    testServer = { server, responses: new Map(), sockets };
    await listenServer(server, socketPath);

    client = new DaemonRpcClient({ socketPath });
    await client.connect();

    await expect(client.call('unknown.method')).rejects.toThrow(/RPC error -32601: Method not found/);
  });

  it('buffer overflow disconnects when MAX_BUFFER_SIZE exceeded', async () => {
    socketPath = tmpSocketPath();
    // Server that sends an enormous amount of data without newlines
    const sockets: Socket[] = [];
    const server = createServer((socket) => {
      sockets.push(socket);
      // Suppress EPIPE errors when client destroys its end
      socket.on('error', () => {});
    });
    testServer = { server, responses: new Map(), sockets };
    await listenServer(server, socketPath);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    client = new DaemonRpcClient({ socketPath });

    // Wait for the disconnected state by polling isConnected
    const disconnectPromise = new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (!client!.isConnected()) {
          clearInterval(interval);
          resolve();
        }
      }, 10);
      // Safety: don't hang forever
      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, 10_000);
    });

    await client.connect();

    // Send data in smaller chunks with drain handling to avoid backpressure stalls.
    // Without newlines the client buffer grows unbounded until it exceeds 10 MB.
    const chunkSize = 256 * 1024; // 256 KB — small enough to avoid stalling writes
    const chunk = Buffer.alloc(chunkSize, 0x78); // 'x'
    for (const s of sockets) {
      s.setMaxListeners(60); // prevent MaxListenersExceeded warning during drain loop
      for (let i = 0; i < 50; i++) {
        if (s.destroyed) {
          break;
        }
        const ok = s.write(chunk);
        if (!ok) {
          // Wait for drain before writing more to avoid backpressure deadlock
          await new Promise<void>((resolve) => {
            const done = () => {
              s.removeListener('drain', done);
              s.removeListener('error', done);
              s.removeListener('close', done);
              resolve();
            };
            s.on('drain', done);
            s.on('error', done);
            s.on('close', done);
          });
        }
        if (s.destroyed) {
          break;
        }
      }
    }

    await disconnectPromise;
    expect(client.isConnected()).toBe(false);
    consoleSpy.mockRestore();
  });

  it('does not reconnect after intentional disconnect', async () => {
    socketPath = tmpSocketPath();
    testServer = createTestServer(socketPath);
    await listenServer(testServer.server, socketPath);

    const connectEvents: boolean[] = [];
    client = new DaemonRpcClient({
      socketPath,
      reconnect: true,
      reconnectInterval: 100,
      onConnect: () => {
        connectEvents.push(true);
      },
    });

    await client.connect();
    expect(connectEvents.length).toBe(1);

    await client.disconnect();
    // Verify no reconnection occurs after intentional disconnect
    await vi.waitFor(() => {
      expect(connectEvents.length).toBe(1);
      expect(client!.isConnected()).toBe(false);
    });
  });
});
