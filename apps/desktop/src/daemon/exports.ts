/**
 * Daemon Module - Public API
 *
 * Re-exports all components needed by both the daemon process and the UI.
 */

// Protocol definitions (shared between daemon and client)
export {
  DaemonMethod,
  DaemonEvent,
  RPC_ERROR,
  getDaemonSocketPath,
  getDaemonPidPath,
  getDaemonLogPath,
  type RpcRequest,
  type RpcResponse,
  type RpcNotification,
  type RpcError,
  type RpcMessage,
} from './protocol';

// Transport layer
export {
  DaemonTransportServer,
  DaemonTransportClient,
  DaemonClientConnection,
  NdjsonParser,
  serialize,
  type DaemonClientOptions,
} from './transport';

// Daemon server (used by daemon process)
export { DaemonServer, type DaemonServerOptions } from './server';

// Daemon client (used by UI/Electron main process)
export { DaemonClient, type DaemonClientConfig } from './client';

// Lifecycle manager (used by Electron main process)
export { DaemonManager, type DaemonManagerOptions } from './lifecycle';
