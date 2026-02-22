import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, rm, unlink, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { DaemonRpcServer } from '../../src/daemon/rpc-server.js';
import { DaemonRpcClient } from '../../src/daemon/rpc-client.js';

const testDir = join(tmpdir(), `daemon-flow-tests-${process.pid}`);

function tmpSocketPath(): string {
  return join(testDir, `daemon-flow-${randomBytes(8).toString('hex')}.sock`);
}

describe('Daemon RPC Integration (Server + Client)', () => {
  let servers: DaemonRpcServer[] = [];
  let clients: DaemonRpcClient[] = [];
  let socketPaths: string[] = [];

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
    for (const c of clients) {
      try {
        await Promise.race([
          c.disconnect(),
          new Promise<void>((resolve) => setTimeout(resolve, 1000)),
        ]);
      } catch {
        // already disconnected
      }
    }
    clients = [];

    for (const s of servers) {
      try {
        await s.stop();
      } catch {
        // already stopped
      }
    }
    servers = [];

    for (const sp of socketPaths) {
      try {
        await unlink(sp);
      } catch {
        // already cleaned up
      }
    }
    socketPaths = [];
  });

  function trackServer(server: DaemonRpcServer): DaemonRpcServer {
    servers.push(server);
    return server;
  }

  function trackClient(client: DaemonRpcClient): DaemonRpcClient {
    clients.push(client);
    return client;
  }

  function trackSocket(sp: string): string {
    socketPaths.push(sp);
    return sp;
  }

  // ---------------------------------------------------------------------------
  // 1. Full RPC round trip
  // ---------------------------------------------------------------------------
  it('full RPC round trip: server registers method, client calls it, verifies response', async () => {
    const sp = trackSocket(tmpSocketPath());
    const server = trackServer(new DaemonRpcServer({ socketPath: sp }));
    server.registerMethod('echo', async (params) => {
      return { echoed: params };
    });
    server.registerMethod('add', async (params) => {
      const { a, b } = params as { a: number; b: number };
      return { sum: a + b };
    });
    await server.start();

    const client = trackClient(new DaemonRpcClient({ socketPath: sp }));
    await client.connect();

    const echoResult = await client.call<{ echoed: unknown }>('echo', { hello: 'world' });
    expect(echoResult).toEqual({ echoed: { hello: 'world' } });

    const addResult = await client.call<{ sum: number }>('add', { a: 3, b: 7 });
    expect(addResult).toEqual({ sum: 10 });
  });

  // ---------------------------------------------------------------------------
  // 2. Error handling round trip
  // ---------------------------------------------------------------------------
  it('error handling round trip: server method throws, client gets proper RPC error', async () => {
    const sp = trackSocket(tmpSocketPath());
    const server = trackServer(new DaemonRpcServer({ socketPath: sp }));
    server.registerMethod('fail', async () => {
      throw new Error('Something went wrong');
    });
    server.registerMethod('fail-generic', async () => {
      throw 'non-Error throw'; // eslint-disable-line no-throw-literal
    });
    await server.start();

    const client = trackClient(new DaemonRpcClient({ socketPath: sp }));
    await client.connect();

    await expect(client.call('fail')).rejects.toThrow(
      /RPC error -32603: Something went wrong/,
    );

    await expect(client.call('fail-generic')).rejects.toThrow(
      /RPC error -32603: Internal error/,
    );
  });

  // ---------------------------------------------------------------------------
  // 3. Notification broadcast
  // ---------------------------------------------------------------------------
  it('notification broadcast: server notifies all clients, all receive it', async () => {
    const sp = trackSocket(tmpSocketPath());
    const server = trackServer(new DaemonRpcServer({ socketPath: sp }));
    await server.start();

    const notifications1: Array<{ method: string; params: unknown }> = [];
    const notifications2: Array<{ method: string; params: unknown }> = [];

    const client1 = trackClient(
      new DaemonRpcClient({
        socketPath: sp,
        onNotification: (method, params) => {
          notifications1.push({ method, params });
        },
      }),
    );
    const client2 = trackClient(
      new DaemonRpcClient({
        socketPath: sp,
        onNotification: (method, params) => {
          notifications2.push({ method, params });
        },
      }),
    );

    await client1.connect();
    await client2.connect();
    await new Promise((r) => setTimeout(r, 50));

    server.notify('task.progress', { taskId: 'abc', stage: 'running' });

    await vi.waitFor(() => {
      expect(notifications1.length).toBe(1);
      expect(notifications1[0].method).toBe('task.progress');
      expect(notifications1[0].params).toEqual({ taskId: 'abc', stage: 'running' });
    });

    await vi.waitFor(() => {
      expect(notifications2.length).toBe(1);
      expect(notifications2[0].method).toBe('task.progress');
      expect(notifications2[0].params).toEqual({ taskId: 'abc', stage: 'running' });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Client-specific notification
  // ---------------------------------------------------------------------------
  it('client-specific notification: only target client receives notifyClient', async () => {
    const sp = trackSocket(tmpSocketPath());
    const connectedIds: string[] = [];
    const server = trackServer(
      new DaemonRpcServer({
        socketPath: sp,
        onConnection: (clientId) => {
          connectedIds.push(clientId);
        },
      }),
    );
    await server.start();

    const notifications1: Array<{ method: string; params: unknown }> = [];
    const notifications2: Array<{ method: string; params: unknown }> = [];

    const client1 = trackClient(
      new DaemonRpcClient({
        socketPath: sp,
        onNotification: (method, params) => {
          notifications1.push({ method, params });
        },
      }),
    );
    await client1.connect();
    await new Promise((r) => setTimeout(r, 50));

    const client2 = trackClient(
      new DaemonRpcClient({
        socketPath: sp,
        onNotification: (method, params) => {
          notifications2.push({ method, params });
        },
      }),
    );
    await client2.connect();
    await new Promise((r) => setTimeout(r, 50));

    expect(connectedIds.length).toBe(2);

    server.notifyClient(connectedIds[0], 'task.message', { taskId: 'x', content: 'hello' });

    await vi.waitFor(() => {
      expect(notifications1.length).toBe(1);
      expect(notifications1[0].method).toBe('task.message');
      expect(notifications1[0].params).toEqual({ taskId: 'x', content: 'hello' });
    });

    await vi.waitFor(() => {
      expect(notifications2.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Method not found
  // ---------------------------------------------------------------------------
  it('method not found: client calls unregistered method, gets -32601 error', async () => {
    const sp = trackSocket(tmpSocketPath());
    const server = trackServer(new DaemonRpcServer({ socketPath: sp }));
    await server.start();

    const client = trackClient(new DaemonRpcClient({ socketPath: sp }));
    await client.connect();

    await expect(client.call('nonexistent.method')).rejects.toThrow(
      /RPC error -32601: Method not found/,
    );
  });

  // ---------------------------------------------------------------------------
  // 6. Multiple concurrent calls
  // ---------------------------------------------------------------------------
  it('multiple concurrent calls: parallel calls from same client all resolve correctly', async () => {
    const sp = trackSocket(tmpSocketPath());
    const server = trackServer(new DaemonRpcServer({ socketPath: sp }));
    server.registerMethod('delayed-echo', async (params) => {
      const { value, delay } = params as { value: string; delay: number };
      await new Promise((r) => setTimeout(r, delay));
      return { value };
    });
    await server.start();

    const client = trackClient(new DaemonRpcClient({ socketPath: sp }));
    await client.connect();

    const results = await Promise.all([
      client.call<{ value: string }>('delayed-echo', { value: 'first', delay: 100 }),
      client.call<{ value: string }>('delayed-echo', { value: 'second', delay: 50 }),
      client.call<{ value: string }>('delayed-echo', { value: 'third', delay: 10 }),
      client.call<{ value: string }>('delayed-echo', { value: 'fourth', delay: 75 }),
    ]);

    expect(results[0]).toEqual({ value: 'first' });
    expect(results[1]).toEqual({ value: 'second' });
    expect(results[2]).toEqual({ value: 'third' });
    expect(results[3]).toEqual({ value: 'fourth' });
  });

  // ---------------------------------------------------------------------------
  // 7. Client disconnect and reconnect
  // ---------------------------------------------------------------------------
  it('client disconnect and reconnect: disconnects, reconnects to same server, makes new call', async () => {
    const sp = trackSocket(tmpSocketPath());
    const server = trackServer(new DaemonRpcServer({ socketPath: sp }));
    server.registerMethod('ping', async () => ({ pong: true }));
    await server.start();

    const client = trackClient(new DaemonRpcClient({ socketPath: sp }));
    await client.connect();
    expect(client.isConnected()).toBe(true);

    const result1 = await client.call<{ pong: boolean }>('ping');
    expect(result1).toEqual({ pong: true });

    await client.disconnect();
    expect(client.isConnected()).toBe(false);

    await new Promise((r) => setTimeout(r, 50));

    await client.connect();
    expect(client.isConnected()).toBe(true);

    const result2 = await client.call<{ pong: boolean }>('ping');
    expect(result2).toEqual({ pong: true });
  });

  // ---------------------------------------------------------------------------
  // 8. Server stop while clients connected
  // ---------------------------------------------------------------------------
  it('server stop while clients connected: pending calls reject with "Connection lost"', async () => {
    const sp = trackSocket(tmpSocketPath());
    const server = trackServer(new DaemonRpcServer({ socketPath: sp }));
    server.registerMethod('slow', async () => {
      await new Promise((r) => setTimeout(r, 5000));
      return { done: true };
    });
    await server.start();

    const client = trackClient(new DaemonRpcClient({ socketPath: sp }));
    await client.connect();
    await new Promise((r) => setTimeout(r, 50));

    // Capture the call promise and attach a catch handler immediately to prevent
    // unhandled rejection warnings when server.stop() destroys the socket
    const callPromise = client.call('slow');
    let caughtError: Error | null = null;
    const handled = callPromise.catch((err: Error) => {
      caughtError = err;
    });

    await new Promise((r) => setTimeout(r, 50));

    await server.stop();
    servers = servers.filter((s) => s !== server);

    await handled;

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toBe('Connection lost');
    expect(client.isConnected()).toBe(false);

    let socketExists = true;
    try {
      await stat(sp);
    } catch {
      socketExists = false;
    }
    expect(socketExists).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 9. Connection lifecycle
  // ---------------------------------------------------------------------------
  it('connection lifecycle: connect -> call -> disconnect -> verify isConnected states', async () => {
    const sp = trackSocket(tmpSocketPath());
    const server = trackServer(new DaemonRpcServer({ socketPath: sp }));
    server.registerMethod('health.check', async () => {
      return { status: 'ok' };
    });
    await server.start();

    const client = trackClient(new DaemonRpcClient({ socketPath: sp }));

    // Before connect
    expect(client.isConnected()).toBe(false);
    await expect(client.call('health.check')).rejects.toThrow('Not connected');

    // After connect
    await client.connect();
    expect(client.isConnected()).toBe(true);

    // Successful call
    const result = await client.call<{ status: string }>('health.check');
    expect(result).toEqual({ status: 'ok' });

    // After disconnect
    await client.disconnect();
    expect(client.isConnected()).toBe(false);
    await expect(client.call('health.check')).rejects.toThrow('Not connected');
  });
});
