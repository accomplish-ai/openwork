import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { createServer, connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stat, unlink, mkdir, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { DaemonRpcServer } from '../../src/daemon/rpc-server.js';

const testDir = join(tmpdir(), `rpc-server-tests-${process.pid}`);

function tmpSocketPath(): string {
  return join(testDir, `test-rpc-server-${randomBytes(8).toString('hex')}.sock`);
}

function sendRequest(socket: Socket, method: string, params?: unknown, id: number | string = 1): void {
  const request = { jsonrpc: '2.0', id, method, params };
  socket.write(JSON.stringify(request) + '\n');
}

function readResponse(socket: Socket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const idx = buffer.indexOf('\n');
      if (idx !== -1) {
        const line = buffer.slice(0, idx).trim();
        socket.removeListener('data', onData);
        try {
          resolve(JSON.parse(line));
        } catch (err) {
          reject(err);
        }
      }
    };
    socket.on('data', onData);
    setTimeout(() => {
      socket.removeListener('data', onData);
      reject(new Error('Timed out waiting for response'));
    }, 5000);
  });
}

function connectClient(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

describe('DaemonRpcServer', () => {
  let server: DaemonRpcServer | null = null;
  const socketsToClean: Socket[] = [];
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
    for (const s of socketsToClean) {
      if (!s.destroyed) {
        s.destroy();
      }
    }
    socketsToClean.length = 0;

    if (server) {
      await server.stop();
      server = null;
    }

    if (socketPath) {
      try {
        await unlink(socketPath);
      } catch {
        // already cleaned up
      }
    }
  });

  it('starts and listens on socket path', async () => {
    socketPath = tmpSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    // Verify the server is listening by successfully connecting a client
    const client = await connectClient(socketPath);
    socketsToClean.push(client);
    expect(client.destroyed).toBe(false);
  });

  it('stops and cleans up socket file', async () => {
    socketPath = tmpSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();
    await server.stop();
    server = null;

    let exists = true;
    try {
      await stat(socketPath);
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it('tracks client connections', async () => {
    socketPath = tmpSocketPath();
    const connectedClients: string[] = [];
    server = new DaemonRpcServer({
      socketPath,
      onConnection: (clientId) => {
        connectedClients.push(clientId);
      },
    });
    await server.start();

    const client = await connectClient(socketPath);
    socketsToClean.push(client);

    await vi.waitFor(() => {
      expect(connectedClients.length).toBe(1);
      expect(connectedClients[0]).toMatch(/^client_/);
      expect(server!.getConnectedClientCount()).toBe(1);
    });
  });

  it('detects client disconnect', async () => {
    socketPath = tmpSocketPath();
    const disconnectedClients: string[] = [];
    server = new DaemonRpcServer({
      socketPath,
      onDisconnection: (clientId) => {
        disconnectedClients.push(clientId);
      },
    });
    await server.start();

    const client = await connectClient(socketPath);
    await vi.waitFor(() => {
      expect(server!.getConnectedClientCount()).toBe(1);
    });

    client.destroy();
    await vi.waitFor(() => {
      expect(disconnectedClients.length).toBe(1);
      expect(server!.getConnectedClientCount()).toBe(0);
    });
  });

  it('registerMethod and client call gets correct response', async () => {
    socketPath = tmpSocketPath();
    server = new DaemonRpcServer({ socketPath });
    server.registerMethod('echo', async (params) => {
      return { echoed: params };
    });
    await server.start();

    const client = await connectClient(socketPath);
    socketsToClean.push(client);

    const responsePromise = readResponse(client);
    sendRequest(client, 'echo', { hello: 'world' }, 42);

    const response = await responsePromise;
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(42);
    expect(response.result).toEqual({ echoed: { hello: 'world' } });
    expect(response.error).toBeUndefined();
  });

  it('returns METHOD_NOT_FOUND error for unknown method', async () => {
    socketPath = tmpSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    const client = await connectClient(socketPath);
    socketsToClean.push(client);

    const responsePromise = readResponse(client);
    sendRequest(client, 'nonexistent.method', undefined, 1);

    const response = await responsePromise;
    expect(response.jsonrpc).toBe('2.0');
    expect(response.error).toBeDefined();
    const error = response.error as { code: number; message: string };
    expect(error.code).toBe(-32601); // METHOD_NOT_FOUND
    expect(error.message).toBe('Method not found');
  });

  it('returns PARSE_ERROR for invalid JSON', async () => {
    socketPath = tmpSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    const client = await connectClient(socketPath);
    socketsToClean.push(client);

    const responsePromise = readResponse(client);
    client.write('this is not valid json\n');

    const response = await responsePromise;
    expect(response.jsonrpc).toBe('2.0');
    expect(response.error).toBeDefined();
    const error = response.error as { code: number; message: string };
    expect(error.code).toBe(-32700); // PARSE_ERROR
    expect(error.message).toBe('Parse error');
  });

  it('notify broadcasts to all connected clients', async () => {
    socketPath = tmpSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    const client1 = await connectClient(socketPath);
    socketsToClean.push(client1);
    const client2 = await connectClient(socketPath);
    socketsToClean.push(client2);
    await vi.waitFor(() => {
      expect(server!.getConnectedClientCount()).toBe(2);
    });

    const promise1 = readResponse(client1);
    const promise2 = readResponse(client2);

    server.notify('task.progress', { taskId: 'abc', stage: 'running' });

    const [msg1, msg2] = await Promise.all([promise1, promise2]);

    expect(msg1.method).toBe('task.progress');
    expect(msg1.params).toEqual({ taskId: 'abc', stage: 'running' });
    expect(msg1.id).toBeUndefined();

    expect(msg2.method).toBe('task.progress');
    expect(msg2.params).toEqual({ taskId: 'abc', stage: 'running' });
  });

  it('notifyClient sends to specific client only', async () => {
    socketPath = tmpSocketPath();
    const connectedClients: string[] = [];
    server = new DaemonRpcServer({
      socketPath,
      onConnection: (clientId) => {
        connectedClients.push(clientId);
      },
    });
    await server.start();

    const client1 = await connectClient(socketPath);
    socketsToClean.push(client1);
    await vi.waitFor(() => {
      expect(connectedClients.length).toBe(1);
    });

    const client2 = await connectClient(socketPath);
    socketsToClean.push(client2);
    await vi.waitFor(() => {
      expect(connectedClients.length).toBe(2);
    });

    // Only notify the first client
    const promise1 = readResponse(client1);
    server.notifyClient(connectedClients[0], 'task.message', { taskId: 'x' });

    const msg1 = await promise1;
    expect(msg1.method).toBe('task.message');
    expect(msg1.params).toEqual({ taskId: 'x' });

    // Second client should not receive anything within a short window
    let client2Received = false;
    const listener = () => {
      client2Received = true;
    };
    client2.on('data', listener);
    await new Promise((r) => setTimeout(r, 200));
    client2.removeListener('data', listener);
    expect(client2Received).toBe(false);
  });

  it('getConnectedClientCount tracks clients correctly', async () => {
    socketPath = tmpSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    expect(server.getConnectedClientCount()).toBe(0);

    const client1 = await connectClient(socketPath);
    socketsToClean.push(client1);
    await vi.waitFor(() => {
      expect(server!.getConnectedClientCount()).toBe(1);
    });

    const client2 = await connectClient(socketPath);
    socketsToClean.push(client2);
    await vi.waitFor(() => {
      expect(server!.getConnectedClientCount()).toBe(2);
    });

    client1.destroy();
    await vi.waitFor(() => {
      expect(server!.getConnectedClientCount()).toBe(1);
    });

    client2.destroy();
    await vi.waitFor(() => {
      expect(server!.getConnectedClientCount()).toBe(0);
    });
  });

  it('disconnects client that sends too much data (MAX_BUFFER_SIZE)', async () => {
    socketPath = tmpSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    const client = await connectClient(socketPath);
    socketsToClean.push(client);
    await vi.waitFor(() => {
      expect(server!.getConnectedClientCount()).toBe(1);
    });

    // Suppress console.error for expected message
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Wait for the server to destroy the connection via the close event
    const clientClosedPromise = new Promise<void>((resolve) => {
      client.once('close', () => resolve());
      // Safety: don't hang forever
      setTimeout(() => resolve(), 10_000);
    });

    // Send data that exceeds 10 MB without a newline, so it stays buffered on the server.
    // Write in smaller chunks with drain handling to avoid backpressure stalls.
    client.setMaxListeners(60); // prevent MaxListenersExceeded warning during drain loop
    const chunkSize = 256 * 1024; // 256 KB
    const chunk = Buffer.alloc(chunkSize, 0x78); // 'x'
    for (let i = 0; i < 50; i++) {
      if (client.destroyed) {
        break;
      }
      const ok = client.write(chunk);
      if (!ok) {
        // Wait for drain before writing more to avoid backpressure deadlock
        await new Promise<void>((resolve) => {
          const done = () => {
            client.removeListener('drain', done);
            client.removeListener('error', done);
            client.removeListener('close', done);
            resolve();
          };
          client.on('drain', done);
          client.on('error', done);
          client.on('close', done);
        });
      }
      if (client.destroyed) {
        break;
      }
    }

    await clientClosedPromise;
    expect(server!.getConnectedClientCount()).toBe(0);
    consoleSpy.mockRestore();
  });

  it('stale socket cleanup: removes dead socket on start', async () => {
    socketPath = tmpSocketPath();

    // Create a stale socket file (simulate a leftover from a crashed daemon)
    await writeFile(socketPath, '');

    // Socket file should exist
    const statResult = await stat(socketPath);
    expect(statResult).toBeDefined();

    // Now start a new server - it should clean up the stale socket file
    // (isSocketAlive will return false since no server is listening)
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    // Should be running fine
    const client = await connectClient(socketPath);
    socketsToClean.push(client);
    await vi.waitFor(() => {
      expect(server!.getConnectedClientCount()).toBe(1);
    });
  });

  it('stale socket cleanup: throws if live daemon exists', async () => {
    socketPath = tmpSocketPath();

    // Start a live server on the socket
    const liveServer = createServer(() => {});
    await new Promise<void>((resolve, reject) => {
      liveServer.listen(socketPath, () => resolve());
      liveServer.on('error', reject);
    });

    // Try to start our DaemonRpcServer on the same path - should fail
    // Either "Another daemon is already running" (from stale check) or
    // EADDRINUSE (from listen) depending on timing
    server = new DaemonRpcServer({ socketPath });
    await expect(server.start()).rejects.toThrow();
    server = null;

    // Clean up the live server
    await new Promise<void>((resolve) => {
      liveServer.close(() => resolve());
    });
    try {
      await unlink(socketPath);
    } catch {
      // ok
    }
  });

  it('handler that throws returns INTERNAL_ERROR', async () => {
    socketPath = tmpSocketPath();
    server = new DaemonRpcServer({ socketPath });
    server.registerMethod('fail', async () => {
      throw new Error('Something went wrong');
    });
    await server.start();

    const client = await connectClient(socketPath);
    socketsToClean.push(client);

    const responsePromise = readResponse(client);
    sendRequest(client, 'fail', undefined, 7);

    const response = await responsePromise;
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(7);
    expect(response.error).toBeDefined();
    const error = response.error as { code: number; message: string };
    expect(error.code).toBe(-32603); // INTERNAL_ERROR
    expect(error.message).toBe('Something went wrong');
  });

  it('returns INVALID_REQUEST for valid JSON but invalid JSON-RPC', async () => {
    socketPath = tmpSocketPath();
    server = new DaemonRpcServer({ socketPath });
    await server.start();

    const client = await connectClient(socketPath);
    socketsToClean.push(client);

    const responsePromise = readResponse(client);
    // Valid JSON but missing required fields (no id, no method)
    client.write(JSON.stringify({ jsonrpc: '2.0', foo: 'bar' }) + '\n');

    const response = await responsePromise;
    expect(response.error).toBeDefined();
    const error = response.error as { code: number; message: string };
    expect(error.code).toBe(-32600); // INVALID_REQUEST
  });
});
