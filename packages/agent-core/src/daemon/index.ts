/**
 * Daemon module — public exports
 *
 * Provides the in-process RPC infrastructure for the daemon architecture.
 * Step 2: server and client run in the same Electron main process.
 * Step 3: swap createInProcessTransportPair for a socket-based transport.
 */

export { DaemonServer } from './server.js';
export type { DaemonServerOptions } from './server.js';

export { DaemonClient } from './client.js';
export type { DaemonClientOptions } from './client.js';

export { createInProcessTransportPair } from './transport.js';

export { createChildProcessTransport, createParentProcessTransport } from './ipc-transport.js';

export {
  addScheduledTask,
  listScheduledTasks,
  cancelScheduledTask,
  onScheduledTaskFire,
  disposeScheduler,
} from './scheduler.js';
