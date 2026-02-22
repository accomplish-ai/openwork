export {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcNotification,
  type JsonRpcError,
  RPC_ERROR_CODES,
  type TaskStartParams,
  type TaskStopParams,
  type TaskInterruptParams,
  type TaskGetParams,
  type TaskDeleteParams,
  type TaskGetTodosParams,
  type TaskStatusParams,
  type PermissionRespondParams,
  type SessionResumeParams,
  type HealthCheckResult,
  type TaskStatusResult,
  type RpcMethodMap,
  type RpcMethod,
  type TaskProgressNotification,
  type TaskMessageNotification,
  type TaskCompleteNotification,
  type TaskErrorNotification,
  type TaskSummaryNotification,
  type TaskStatusChangeNotification,
  type RpcNotificationMap,
  type RpcNotificationType,
  isJsonRpcRequest,
  isJsonRpcNotification,
} from './types.js';

export { DaemonRpcServer, type RpcServerOptions, type RpcMethodHandler } from './rpc-server.js';
export { DaemonRpcClient, type RpcClientOptions } from './rpc-client.js';
export { getSocketPath, getDaemonDir, getPidFilePath } from './socket-path.js';

export {
  type PidLockPayload,
  type PidLockHandle,
  PidLockError,
  acquirePidLock,
} from './pid-lock.js';

export {
  type CrashHandlerOptions,
  installCrashHandlers,
  isAbortError,
  isFatalError,
  isTransientError,
} from './unhandled-rejections.js';

