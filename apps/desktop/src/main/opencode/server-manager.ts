/**
 * ServerManager - Manages the lifecycle of a single `opencode serve` child process.
 *
 * Spawns `opencode serve` via child_process.spawn, waits for health check,
 * auto-restarts on crash with exponential backoff, and exposes an SDK client.
 */

import { spawn, type ChildProcess } from 'child_process';
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { getOpenCodeCliPath } from './cli-path';
import { getBundledNodePaths } from '../utils/bundled-node';
import { getExtendedNodePath } from '../utils/system-path';
import { app } from 'electron';

export type ServerState = 'stopped' | 'starting' | 'ready' | 'error';

interface ServerManagerEvents {
  'state-change': [ServerState];
  'error': [Error];
}

/** Default port for opencode serve */
const DEFAULT_PORT = 4096;

/** Health check polling interval in ms */
const HEALTH_POLL_MS = 200;

/** Max time to wait for server to become healthy */
const HEALTH_TIMEOUT_MS = 15000;

/** Max restart attempts before giving up */
const MAX_RESTART_ATTEMPTS = 5;

/** Base delay for exponential backoff (ms) */
const BACKOFF_BASE_MS = 1000;

/** Max backoff delay (ms) */
const BACKOFF_MAX_MS = 30000;

export class ServerManager extends EventEmitter<ServerManagerEvents> {
  private process: ChildProcess | null = null;
  private client: OpencodeClient | null = null;
  private state: ServerState = 'stopped';
  private port: number = DEFAULT_PORT;
  private password: string = '';
  private restartAttempts: number = 0;
  private disposed: boolean = false;
  private healthCheckTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Get the current server state
   */
  getState(): ServerState {
    return this.state;
  }

  /**
   * Get the SDK client. Throws if server is not ready.
   */
  getClient(): OpencodeClient {
    if (!this.client || this.state !== 'ready') {
      throw new Error('Server is not ready. Current state: ' + this.state);
    }
    return this.client;
  }

  /**
   * Get the server port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Start the opencode serve process
   */
  async start(): Promise<void> {
    if (this.state === 'ready' || this.state === 'starting') {
      return;
    }

    this.disposed = false;
    this.restartAttempts = 0;
    await this.spawnServer();
  }

  /**
   * Internal: spawn the server process and wait for health
   */
  private async spawnServer(): Promise<void> {
    this.setState('starting');

    // Generate a random password for this launch
    this.password = randomUUID();

    // Find an available port (start from DEFAULT_PORT)
    this.port = DEFAULT_PORT;

    // Get CLI path
    const { command: cliCommand, args: cliArgs } = getOpenCodeCliPath();

    // Build serve arguments
    const serveArgs = [
      ...cliArgs,
      'serve',
      '--port', String(this.port),
      '--hostname', '127.0.0.1',
    ];

    // Build environment
    const bundledPaths = getBundledNodePaths();
    const env: NodeJS.ProcessEnv = { ...process.env };

    // Add bundled Node.js to PATH
    if (bundledPaths) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      env.PATH = `${bundledPaths.binDir}${delimiter}${env.PATH || ''}`;
      env.NODE_BIN_PATH = bundledPaths.binDir;
    }

    // Extend PATH with system node paths
    const extendedPath = getExtendedNodePath();
    if (extendedPath) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      env.PATH = `${env.PATH}${delimiter}${extendedPath}`;
    }

    // Set server password for auth
    env.OPENCODE_SERVER_PASSWORD = this.password;

    // Ensure OPENCODE_CONFIG is set (config-generator sets this in process.env)
    // It should already be in process.env from generateOpenCodeConfig()

    console.log(`[ServerManager] Spawning: ${cliCommand} ${serveArgs.join(' ')}`);
    console.log(`[ServerManager] Port: ${this.port}`);

    // Spawn the process
    // On macOS packaged, use /bin/sh -c to avoid TCC dialogs
    let spawnCommand: string;
    let spawnArgs: string[];

    if (process.platform === 'darwin' && app.isPackaged) {
      const fullCommand = [cliCommand, ...serveArgs].map(a => `"${a}"`).join(' ');
      spawnCommand = '/bin/sh';
      spawnArgs = ['-c', fullCommand];
    } else {
      spawnCommand = cliCommand;
      spawnArgs = serveArgs;
    }

    const child = spawn(spawnCommand, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      windowsHide: true,
    });

    this.process = child;

    // Log stdout/stderr
    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        console.log('[opencode-serve stdout]', line);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        console.log('[opencode-serve stderr]', line);
      }
    });

    // Handle process exit
    child.on('exit', (code, signal) => {
      console.log(`[ServerManager] Process exited: code=${code}, signal=${signal}`);
      this.process = null;
      this.client = null;

      if (this.disposed) {
        this.setState('stopped');
        return;
      }

      // Unexpected exit — attempt restart
      this.setState('error');
      this.attemptRestart();
    });

    child.on('error', (err) => {
      console.error('[ServerManager] Spawn error:', err);
      this.process = null;
      this.setState('error');
      this.emit('error', err);
    });

    // Wait for health check
    try {
      await this.waitForHealth();
      this.restartAttempts = 0; // Reset on success

      // Create SDK client
      this.client = createOpencodeClient({
        baseUrl: `http://127.0.0.1:${this.port}`,
      });

      this.setState('ready');
      console.log(`[ServerManager] Server ready on port ${this.port}`);
    } catch (err) {
      console.error('[ServerManager] Health check failed:', err);
      this.kill();
      this.setState('error');
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Poll GET /health until 200 or timeout
   */
  private async waitForHealth(): Promise<void> {
    const startTime = Date.now();
    const url = `http://127.0.0.1:${this.port}/health`;

    while (Date.now() - startTime < HEALTH_TIMEOUT_MS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          console.log(`[ServerManager] Health check passed after ${Date.now() - startTime}ms`);
          return;
        }
      } catch {
        // Server not ready yet, keep polling
      }

      await new Promise(resolve => setTimeout(resolve, HEALTH_POLL_MS));
    }

    throw new Error(`Server health check timed out after ${HEALTH_TIMEOUT_MS}ms`);
  }

  /**
   * Attempt restart with exponential backoff
   */
  private async attemptRestart(): Promise<void> {
    if (this.disposed) return;

    this.restartAttempts++;
    if (this.restartAttempts > MAX_RESTART_ATTEMPTS) {
      console.error(`[ServerManager] Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Giving up.`);
      this.emit('error', new Error('Server failed to restart after maximum attempts'));
      return;
    }

    const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, this.restartAttempts - 1), BACKOFF_MAX_MS);
    console.log(`[ServerManager] Restarting in ${delay}ms (attempt ${this.restartAttempts}/${MAX_RESTART_ATTEMPTS})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    if (this.disposed) return;

    try {
      await this.spawnServer();
    } catch (err) {
      console.error('[ServerManager] Restart failed:', err);
    }
  }

  /**
   * Kill the server process
   */
  private kill(): void {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
        // Force kill after 3 seconds
        setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
        }, 3000);
      } catch {
        // Process may already be dead
      }
    }
  }

  /**
   * Gracefully dispose the server
   */
  async dispose(): Promise<void> {
    this.disposed = true;

    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Try graceful shutdown via SDK
    if (this.client && this.state === 'ready') {
      try {
        // Give the server a chance to clean up
        await Promise.race([
          this.client.instance.dispose(),
          new Promise(resolve => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // Ignore errors during shutdown
      }
    }

    // Force kill if still running
    this.kill();

    this.client = null;
    this.process = null;
    this.setState('stopped');
    console.log('[ServerManager] Disposed');
  }

  private setState(state: ServerState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('state-change', state);
    }
  }
}

// Singleton
let serverManagerInstance: ServerManager | null = null;

export function getServerManager(): ServerManager {
  if (!serverManagerInstance) {
    serverManagerInstance = new ServerManager();
  }
  return serverManagerInstance;
}

export function disposeServerManager(): Promise<void> {
  if (serverManagerInstance) {
    const promise = serverManagerInstance.dispose();
    serverManagerInstance = null;
    return promise;
  }
  return Promise.resolve();
}
