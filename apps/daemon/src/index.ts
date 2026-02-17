import fs from 'fs';
import path from 'path';
import os from 'os';
import { createStorage, createTaskManager } from '@accomplish_ai/agent-core';
import { checkExistingDaemon, writePidFile, removePidFile } from './pid.js';
import { initDaemonOptions, createDaemonTaskManagerOptions } from './daemon-options.js';
import { setupWebSocket } from './websocket.js';
import { initMcpBridges, startPermissionServer, startQuestionServer, startThoughtStreamServer } from './mcp-bridges.js';
import { createApiServer, DAEMON_PORT } from './api.js';

// --- CLI args ---

const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const port = portFlag !== -1 ? parseInt(args[portFlag + 1], 10) : DAEMON_PORT;

const dataDirFlag = args.indexOf('--data-dir');
const dataDir = dataDirFlag !== -1
  ? args[dataDirFlag + 1]
  : path.join(os.homedir(), '.accomplish', 'data');

// --- Startup ---

const existingPid = checkExistingDaemon();
if (existingPid) {
  console.error(`[Daemon] Another instance is already running (pid ${existingPid}). Exiting.`);
  process.exit(1);
}

console.log('[Daemon] Starting Accomplish daemon...');
console.log('[Daemon] Data directory:', dataDir);
console.log('[Daemon] API port:', port);

// Ensure data directory exists
fs.mkdirSync(dataDir, { recursive: true });

// Initialize storage
const storage = createStorage({
  databasePath: path.join(dataDir, 'accomplish.db'),
  userDataPath: dataDir,
  runMigrations: true,
});
storage.initialize();

// Initialize daemon options (used by TaskManager)
initDaemonOptions(storage, dataDir);

// Create TaskManager
const taskManager = createTaskManager(createDaemonTaskManagerOptions());

// Create HTTP + WebSocket server
const server = createApiServer(taskManager, storage);
setupWebSocket(server);

// Initialize MCP bridges (permission, question, thought stream)
initMcpBridges(() => taskManager.getActiveTaskId());
startPermissionServer();
startQuestionServer();
startThoughtStreamServer();

// Start listening
server.listen(port, '127.0.0.1', () => {
  console.log(`[Daemon] API server listening on http://127.0.0.1:${port}`);
  console.log('[Daemon] WebSocket available at ws://127.0.0.1:' + port + '/ws');
  writePidFile();
});

// --- Graceful shutdown ---

function shutdown(): void {
  console.log('[Daemon] Shutting down...');
  taskManager.dispose();
  storage.close();
  removePidFile();
  server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('uncaughtException', (err) => {
  console.error('[Daemon] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Daemon] Unhandled rejection:', reason);
});
