/**
 * Daemon Lifecycle Manager
 *
 * Manages the daemon process lifecycle from the Electron main process.
 * Responsibilities:
 * - Spawn the daemon if not already running
 * - Monitor daemon health via ping
 * - Restart daemon on unexpected exit
 * - Graceful shutdown on app quit
 * - Install as a system service (macOS launchd / Windows service)
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { DaemonClient } from './client';
import { getDaemonPidPath, getDaemonSocketPath, getDaemonLogPath } from './protocol';

/**
 * Validate that a value is a safe absolute filesystem path.
 * Rejects null bytes, relative paths, path traversal, and shell metacharacters.
 * Throws on invalid input — call at construction / entry boundaries.
 */
function assertSafePath(value: string, label: string): void {
  if (!value || typeof value !== 'string') {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (value.includes('\0')) {
    throw new Error(`${label} contains null bytes`);
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path, got: ${value}`);
  }
  // Detect traversal: resolved path must equal the normalised input
  const normalised = path.normalize(value);
  if (path.resolve(value) !== normalised) {
    throw new Error(`${label} contains path traversal: ${value}`);
  }
  // Reject characters that are dangerous in shells / config interpolation
  if (/[;|&$`\\!#~{}\r\n]/.test(value)) {
    throw new Error(`${label} contains disallowed characters: ${value}`);
  }
}

export interface DaemonManagerOptions {
  /** Path to the daemon entry script (compiled JS) */
  daemonScript: string;
  /** Path to Node.js binary for spawning the daemon */
  nodePath?: string;
  /** Environment variables to pass to the daemon */
  env?: Record<string, string>;
  /** Health check interval in ms (default: 10000) */
  healthCheckInterval?: number;
  /** Max startup wait time in ms (default: 10000) */
  startupTimeout?: number;
  /** Whether to auto-restart on crash (default: true) */
  autoRestart?: boolean;
}

export class DaemonManager {
  private process: ChildProcess | null = null;
  private client: DaemonClient | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private opts: Required<DaemonManagerOptions>;
  private restarting = false;
  private stopped = false;

  constructor(opts: DaemonManagerOptions) {
    this.opts = {
      nodePath: process.execPath,
      env: {},
      healthCheckInterval: 10000,
      startupTimeout: 10000,
      autoRestart: true,
      ...opts,
    };

    // Validate paths eagerly so we fail before they ever reach spawn()
    assertSafePath(this.opts.nodePath, 'nodePath');
    assertSafePath(this.opts.daemonScript, 'daemonScript');
  }

  /**
   * Ensure the daemon is running and return a connected client.
   * If the daemon is already running (detected via PID file), connect to it.
   * Otherwise, spawn a new daemon process.
   *
   * This method handles the TOCTOU race between isDaemonRunning() and
   * spawnDaemon() by catching "already running" from spawnDaemon() and
   * falling back to connectToExisting().
   */
  async ensureRunning(): Promise<DaemonClient> {
    // Check if daemon is already running
    if (this.isDaemonRunning()) {
      console.log('[DaemonManager] Daemon already running, connecting...');
      return this.connectToExisting();
    }

    // Spawn new daemon — spawnDaemon is idempotent: if another process
    // won the race it will detect the running daemon and no-op
    console.log('[DaemonManager] Starting daemon...');
    try {
      await this.spawnDaemon();
    } catch (err) {
      // If another instance started between our check and spawn, connect to it
      if (this.isDaemonRunning()) {
        console.log('[DaemonManager] Daemon was started by another process, connecting...');
        return this.connectToExisting();
      }
      throw err;
    }
    return this.connectToExisting();
  }

  /**
   * Get the daemon client. Throws if not connected.
   */
  getClient(): DaemonClient {
    if (!this.client || !this.client.connected) {
      throw new Error('Daemon client not connected. Call ensureRunning() first.');
    }
    return this.client;
  }

  /**
   * Check if the daemon process is running.
   */
  isDaemonRunning(): boolean {
    const pidPath = getDaemonPidPath();
    if (!fs.existsSync(pidPath)) return false;

    try {
      const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim(), 10);
      if (isNaN(pid)) return false;
      process.kill(pid, 0); // Test if process exists
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Spawn the daemon as a detached child process.
   * The daemon will survive if the Electron app quits.
   */
  private async spawnDaemon(): Promise<void> {
    // Re-check if daemon appeared between caller's check and now
    if (this.isDaemonRunning()) {
      console.log('[DaemonManager] Daemon already running (detected in spawnDaemon)');
      return;
    }

    const logPath = getDaemonLogPath();
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFd = fs.openSync(logPath, 'a');

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...this.opts.env,
      NODE_ENV: process.env.NODE_ENV ?? 'production',
    };

    try {
      this.process = spawn(this.opts.nodePath, [this.opts.daemonScript], {
        detached: true, // Allow daemon to survive parent exit
        stdio: ['ignore', logFd, logFd],
        env,
      });
    } catch (err) {
      // Close the FD if spawn itself throws
      fs.closeSync(logFd);
      throw err;
    }

    // Unref so the Electron app can quit without waiting for daemon
    this.process.unref();

    // Close the parent-side FD now that it's been handed to the child
    fs.closeSync(logFd);

    this.process.on('exit', (code, signal) => {
      console.log(`[DaemonManager] Daemon exited (code=${code}, signal=${signal})`);

      if (!this.stopped && this.opts.autoRestart && !this.restarting) {
        console.log('[DaemonManager] Auto-restarting daemon...');
        this.restarting = true;
        setTimeout(async () => {
          this.restarting = false;
          try {
            await this.spawnDaemon();
            if (this.client) {
              await this.client.connect();
            }
          } catch (err) {
            console.error('[DaemonManager] Failed to restart daemon:', err);
          }
        }, 2000);
      }
    });

    // Wait for daemon to be ready (socket file appears + ping succeeds)
    await this.waitForReady();
  }

  /**
   * Wait for the daemon to be ready to accept connections.
   */
  private async waitForReady(): Promise<void> {
    const deadline = Date.now() + this.opts.startupTimeout;
    const socketPath = getDaemonSocketPath();

    while (Date.now() < deadline) {
      // Check if socket file exists
      if (process.platform !== 'win32' && !fs.existsSync(socketPath)) {
        await sleep(200);
        continue;
      }

      // Try to connect and ping
      const testClient = new DaemonClient({ autoReconnect: false });
      try {
        await testClient.connect();
        await testClient.ping();
        console.log('[DaemonManager] Daemon is ready');
        return;
      } catch {
        await sleep(200);
      } finally {
        testClient.disconnect();
      }
    }

    throw new Error(`Daemon failed to start within ${this.opts.startupTimeout}ms`);
  }

  /**
   * Connect to an already-running daemon and start health monitoring.
   */
  private async connectToExisting(): Promise<DaemonClient> {
    if (this.client) {
      if (this.client.connected) return this.client;
      this.client.disconnect();
    }

    this.client = new DaemonClient({ autoReconnect: true });
    await this.client.connect();

    // Start health monitoring
    this.startHealthCheck();

    return this.client;
  }

  /**
   * Periodically ping the daemon to detect crashes.
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthTimer = setInterval(async () => {
      if (!this.client || !this.client.connected) return;
      try {
        await this.client.ping();
      } catch {
        console.warn('[DaemonManager] Health check failed');
        // The auto-reconnect in DaemonTransportClient will handle reconnection.
        // If the daemon crashed, the process exit handler will restart it.
      }
    }, this.opts.healthCheckInterval);
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  /**
   * Gracefully stop the daemon.
   * Call this from app.on('before-quit') if you want the daemon to stop
   * when the app quits. Omit it if you want the daemon to keep running.
   */
  async stopDaemon(): Promise<void> {
    this.stopped = true;
    this.stopHealthCheck();

    if (this.client?.connected) {
      try {
        await this.client.shutdown();
      } catch {
        // Daemon may already be gone
      }
      this.client.disconnect();
    }

    // Force kill if still running
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
    }
  }

  /**
   * Disconnect the client but leave the daemon running.
   * Call this from app.on('before-quit') to let the daemon persist.
   */
  detach(): void {
    this.stopped = true;
    this.stopHealthCheck();
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  // -----------------------------------------------------------------------
  // macOS LaunchAgent support (for always-on daemon)
  // -----------------------------------------------------------------------

  /**
   * Install a macOS LaunchAgent plist so the daemon starts at login.
   * This enables the daemon to run even when the Electron UI is closed.
   */
  static installLaunchAgent(opts: {
    nodePath: string;
    daemonScript: string;
    appVersion: string;
  }): void {
    if (process.platform !== 'darwin') {
      throw new Error('LaunchAgent installation is only supported on macOS');
    }

    // Validate inputs before writing them into the plist
    assertSafePath(opts.nodePath, 'nodePath');
    assertSafePath(opts.daemonScript, 'daemonScript');
    if (!/^[\w.\-+]+$/.test(opts.appVersion)) {
      throw new Error(`appVersion contains invalid characters: ${opts.appVersion}`);
    }

    const escapeXml = (str: string): string =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const plistPath = path.join(
      os.homedir(),
      'Library',
      'LaunchAgents',
      'ai.accomplish.daemon.plist'
    );

    const safeNodePath = escapeXml(opts.nodePath);
    const safeDaemonScript = escapeXml(opts.daemonScript);
    const safeAppVersion = escapeXml(opts.appVersion);
    const safeLogPath = escapeXml(getDaemonLogPath());

    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.accomplish.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>${safeNodePath}</string>
        <string>${safeDaemonScript}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>${safeLogPath}</string>
    <key>StandardErrorPath</key>
    <string>${safeLogPath}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>APP_VERSION</key>
        <string>${safeAppVersion}</string>
    </dict>
    <key>ProcessType</key>
    <string>Background</string>
    <key>ThrottleInterval</key>
    <integer>5</integer>
</dict>
</plist>
`;

    const dir = path.dirname(plistPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(plistPath, plistContent, { encoding: 'utf-8', mode: 0o600 });
    console.log(`[DaemonManager] LaunchAgent installed at ${plistPath}`);
    console.log('[DaemonManager] Run: launchctl load ' + plistPath);
  }

  /**
   * Uninstall the macOS LaunchAgent.
   */
  static uninstallLaunchAgent(): void {
    if (process.platform !== 'darwin') return;

    const plistPath = path.join(
      os.homedir(),
      'Library',
      'LaunchAgents',
      'ai.accomplish.daemon.plist'
    );

    try {
      fs.unlinkSync(plistPath);
      console.log('[DaemonManager] LaunchAgent uninstalled');
    } catch {
      // Already gone
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
