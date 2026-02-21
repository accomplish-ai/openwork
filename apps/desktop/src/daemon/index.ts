/**
 * Daemon Entry Point
 *
 * This is the main entry point for the always-on daemon process.
 * It runs independently of the Electron UI and handles:
 * - Task execution via the agent core
 * - Storage (SQLite)
 * - HTTP servers for MCP tool communication
 * - API key and provider management
 * - Skills management
 *
 * The daemon can be started by:
 * 1. The Electron app (auto-launches on startup)
 * 2. A CLI command (for headless operation)
 * 3. A launchd/systemd service (for always-on operation)
 *
 * Usage:
 *   node daemon.js [--port <port>] [--data-dir <path>]
 */

import path from 'path';
import os from 'os';
import fs from 'fs';
import { DaemonServer } from './server';
import { getDaemonPidPath, getDaemonSocketPath } from './protocol';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getDataDir(): string {
  if (process.env.ACCOMPLISH_DATA_DIR) {
    const custom = process.env.ACCOMPLISH_DATA_DIR;
    // Validate to prevent path traversal (CWE-22)
    if (custom.includes('\0')) {
      throw new Error('ACCOMPLISH_DATA_DIR contains null bytes');
    }
    if (!path.isAbsolute(custom)) {
      throw new Error(`ACCOMPLISH_DATA_DIR must be an absolute path, got: ${custom}`);
    }
    // Resolve to canonical form and reject traversal
    const resolved = path.resolve(custom);
    if (resolved !== path.normalize(custom)) {
      throw new Error(`ACCOMPLISH_DATA_DIR contains path traversal: ${custom}`);
    }
    return resolved;
  }

  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'Accomplish');
    case 'win32':
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Accomplish');
    case 'linux':
    default:
      return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'Accomplish');
  }
}

function getDatabasePath(dataDir: string): string {
  const dbName = process.env.NODE_ENV === 'production'
    ? 'accomplish.db'
    : 'accomplish-dev.db';
  return path.join(dataDir, dbName);
}

function getAppVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? 'unknown';
  } catch {
    return process.env.APP_VERSION ?? 'unknown';
  }
}

// ---------------------------------------------------------------------------
// PID file management
// ---------------------------------------------------------------------------

function writePidFile(): void {
  const pidPath = getDaemonPidPath();
  const dir = path.dirname(pidPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(pidPath, String(process.pid), { encoding: 'utf-8', mode: 0o600 });
}

function removePidFile(): void {
  try {
    fs.unlinkSync(getDaemonPidPath());
  } catch {
    // Already gone
  }
}

function isAlreadyRunning(): boolean {
  const pidPath = getDaemonPidPath();
  if (!fs.existsSync(pidPath)) return false;

  try {
    const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim(), 10);
    if (isNaN(pid)) return false;

    // Check if the process is actually alive
    process.kill(pid, 0); // Signal 0 = test existence
    return true;
  } catch {
    // Process doesn't exist — stale PID file
    removePidFile();
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dataDir = getDataDir();

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Check if daemon is already running
  if (isAlreadyRunning()) {
    console.log('[Daemon] Another daemon instance is already running. Exiting.');
    process.exit(0);
  }

  console.log(`[Daemon] Starting Accomplish daemon (PID: ${process.pid})`);
  console.log(`[Daemon] Data directory: ${dataDir}`);
  console.log(`[Daemon] Socket: ${getDaemonSocketPath()}`);

  const server = new DaemonServer({
    databasePath: getDatabasePath(dataDir),
    userDataPath: dataDir,
    appVersion: getAppVersion(),
    isPackaged: process.env.NODE_ENV === 'production',
    socketPath: getDaemonSocketPath(),
  });

  // Write PID file
  writePidFile();

  // Handle graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Daemon] Received ${signal}, shutting down...`);
    try {
      removePidFile();
      await server.stop();
    } catch (err) {
      console.error(`[Daemon] Error during shutdown (${signal}):`, err);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => { shutdown('SIGINT').catch((err) => { console.error('[Daemon] SIGINT shutdown error:', err); process.exit(1); }); });
  process.on('SIGTERM', () => { shutdown('SIGTERM').catch((err) => { console.error('[Daemon] SIGTERM shutdown error:', err); process.exit(1); }); });
  process.on('SIGHUP', () => { shutdown('SIGHUP').catch((err) => { console.error('[Daemon] SIGHUP shutdown error:', err); process.exit(1); }); });

  process.on('uncaughtException', (err) => {
    console.error('[Daemon] Uncaught exception:', err);
    shutdown('uncaughtException').catch((shutdownErr) => {
      console.error('[Daemon] Shutdown after uncaught exception failed:', shutdownErr);
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[Daemon] Unhandled rejection:', reason);
  });

  try {
    await server.start();
    console.log('[Daemon] Ready and accepting connections');
  } catch (err) {
    console.error('[Daemon] Failed to start:', err);
    removePidFile();
    process.exit(1);
  }
}

main();
