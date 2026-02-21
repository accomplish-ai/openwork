/**
 * Daemon ↔ UI JSON-RPC Protocol
 *
 * Defines the message format, method names, and event types
 * for communication between the always-on daemon and the Electron UI.
 *
 * Transport: Unix domain socket (macOS/Linux) or named pipe (Windows).
 * Wire format: newline-delimited JSON (ndjson).
 */

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

/** JSON-RPC 2.0 request (UI → Daemon) */
export interface RpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 success response (Daemon → UI) */
export interface RpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: RpcError;
}

/** JSON-RPC 2.0 notification / push event (Daemon → UI, no id) */
export interface RpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type RpcMessage = RpcRequest | RpcResponse | RpcNotification;

// ---------------------------------------------------------------------------
// Error codes (following JSON-RPC 2.0 conventions)
// ---------------------------------------------------------------------------

export const RPC_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Application-specific
  NO_PROVIDER: -32000,
  TASK_NOT_FOUND: -32001,
  STORAGE_ERROR: -32002,
  ALREADY_RUNNING: -32003,
} as const;

// ---------------------------------------------------------------------------
// Method names (UI → Daemon requests)
// ---------------------------------------------------------------------------

export const DaemonMethod = {
  // Health / lifecycle
  PING: 'ping',
  SHUTDOWN: 'shutdown',
  GET_STATUS: 'status.get',

  // Task operations
  TASK_START: 'task.start',
  TASK_CANCEL: 'task.cancel',
  TASK_INTERRUPT: 'task.interrupt',
  TASK_GET: 'task.get',
  TASK_LIST: 'task.list',
  TASK_DELETE: 'task.delete',
  TASK_CLEAR_HISTORY: 'task.clearHistory',
  TASK_GET_TODOS: 'task.getTodos',
  SESSION_RESUME: 'session.resume',

  // Permission
  PERMISSION_RESPOND: 'permission.respond',

  // Settings
  SETTINGS_GET_API_KEYS: 'settings.getApiKeys',
  SETTINGS_ADD_API_KEY: 'settings.addApiKey',
  SETTINGS_REMOVE_API_KEY: 'settings.removeApiKey',
  SETTINGS_GET_DEBUG_MODE: 'settings.getDebugMode',
  SETTINGS_SET_DEBUG_MODE: 'settings.setDebugMode',
  SETTINGS_GET_THEME: 'settings.getTheme',
  SETTINGS_SET_THEME: 'settings.setTheme',
  SETTINGS_GET_APP_SETTINGS: 'settings.getAppSettings',
  SETTINGS_GET_OPENAI_BASE_URL: 'settings.getOpenAiBaseUrl',
  SETTINGS_SET_OPENAI_BASE_URL: 'settings.setOpenAiBaseUrl',
  SETTINGS_GET_OPENAI_OAUTH_STATUS: 'settings.getOpenAiOauthStatus',

  // API key management
  API_KEY_EXISTS: 'apiKey.exists',
  API_KEY_SET: 'apiKey.set',
  API_KEY_GET: 'apiKey.get',
  API_KEY_VALIDATE: 'apiKey.validate',
  API_KEY_VALIDATE_PROVIDER: 'apiKey.validateProvider',
  API_KEY_CLEAR: 'apiKey.clear',
  API_KEYS_ALL: 'apiKeys.all',
  API_KEYS_HAS_ANY: 'apiKeys.hasAny',

  // Model selection
  MODEL_GET: 'model.get',
  MODEL_SET: 'model.set',

  // Provider settings
  PROVIDER_SETTINGS_GET: 'providerSettings.get',
  PROVIDER_SETTINGS_SET: 'providerSettings.set',
  PROVIDER_SETTINGS_REMOVE: 'providerSettings.remove',
  FETCH_MODELS: 'models.fetch',

  // Ollama
  OLLAMA_TEST: 'ollama.test',
  OLLAMA_TOOL_SUPPORT: 'ollama.toolSupport',
  OLLAMA_SET_CONFIG: 'ollama.setConfig',
  OLLAMA_GET_CONFIG: 'ollama.getConfig',

  // Azure Foundry
  AZURE_FOUNDRY_TEST: 'azureFoundry.test',
  AZURE_FOUNDRY_VALIDATE: 'azureFoundry.validate',
  AZURE_FOUNDRY_SET_CONFIG: 'azureFoundry.setConfig',
  AZURE_FOUNDRY_GET_CONFIG: 'azureFoundry.getConfig',

  // LiteLLM
  LITELLM_TEST: 'litellm.test',
  LITELLM_SET_CONFIG: 'litellm.setConfig',
  LITELLM_GET_CONFIG: 'litellm.getConfig',
  LITELLM_FETCH_MODELS: 'litellm.fetchModels',

  // LM Studio
  LMSTUDIO_TEST: 'lmstudio.test',
  LMSTUDIO_VALIDATE: 'lmstudio.validate',
  LMSTUDIO_SET_CONFIG: 'lmstudio.setConfig',
  LMSTUDIO_GET_CONFIG: 'lmstudio.getConfig',
  LMSTUDIO_FETCH_MODELS: 'lmstudio.fetchModels',

  // OpenRouter
  OPENROUTER_FETCH_MODELS: 'openrouter.fetchModels',

  // Bedrock
  BEDROCK_VALIDATE: 'bedrock.validate',
  BEDROCK_FETCH_MODELS: 'bedrock.fetchModels',
  BEDROCK_SET_CREDENTIALS: 'bedrock.setCredentials',
  BEDROCK_GET_CREDENTIALS: 'bedrock.getCredentials',

  // Vertex
  VERTEX_VALIDATE: 'vertex.validate',
  VERTEX_FETCH_MODELS: 'vertex.fetchModels',
  VERTEX_SET_CREDENTIALS: 'vertex.setCredentials',
  VERTEX_GET_CREDENTIALS: 'vertex.getCredentials',

  // Onboarding
  ONBOARDING_GET_COMPLETE: 'onboarding.getComplete',
  ONBOARDING_SET_COMPLETE: 'onboarding.setComplete',

  // OpenCode CLI
  OPENCODE_CHECK: 'opencode.check',
  OPENCODE_VERSION: 'opencode.version',

  // Skills
  SKILLS_LIST: 'skills.list',
  SKILLS_GET: 'skills.get',
  SKILLS_ADD: 'skills.add',
  SKILLS_UPDATE: 'skills.update',
  SKILLS_DELETE: 'skills.delete',
  SKILLS_TOGGLE: 'skills.toggle',

  // Connectors
  CONNECTORS_LIST: 'connectors.list',
  CONNECTORS_ADD: 'connectors.add',
  CONNECTORS_UPDATE: 'connectors.update',
  CONNECTORS_DELETE: 'connectors.delete',
  CONNECTORS_OAUTH_START: 'connectors.oauthStart',

  // Speech
  SPEECH_VALIDATE: 'speech.validate',
  SPEECH_TRANSCRIBE: 'speech.transcribe',
  SPEECH_IS_CONFIGURED: 'speech.isConfigured',

  // Logs
  LOGS_GET: 'logs.get',
  LOGS_EXPORT: 'logs.export',

  // App info
  APP_VERSION: 'app.version',
  APP_PLATFORM: 'app.platform',
} as const;

// ---------------------------------------------------------------------------
// Event names (Daemon → UI push notifications)
// ---------------------------------------------------------------------------

export const DaemonEvent = {
  // Task lifecycle events
  TASK_UPDATE: 'event.task.update',
  TASK_UPDATE_BATCH: 'event.task.updateBatch',
  TASK_PROGRESS: 'event.task.progress',
  TASK_STATUS_CHANGE: 'event.task.statusChange',
  TASK_SUMMARY: 'event.task.summary',
  TASK_COMPLETE: 'event.task.complete',

  // Permission
  PERMISSION_REQUEST: 'event.permission.request',

  // Todos
  TODO_UPDATE: 'event.todo.update',

  // Debug
  DEBUG_LOG: 'event.debug.log',

  // Auth
  AUTH_ERROR: 'event.auth.error',

  // Settings change (for syncing across clients)
  SETTINGS_CHANGED: 'event.settings.changed',
  THEME_CHANGED: 'event.settings.themeChanged',
  DEBUG_MODE_CHANGED: 'event.settings.debugModeChanged',
} as const;

// ---------------------------------------------------------------------------
// Socket path helpers
// ---------------------------------------------------------------------------

import path from 'path';
import os from 'os';

/**
 * Returns the platform-appropriate default data directory for the daemon.
 * - macOS: ~/Library/Application Support/Accomplish
 * - Windows: %APPDATA%/Accomplish
 * - Linux: $XDG_DATA_HOME/Accomplish or ~/.local/share/Accomplish
 *
 * Can be overridden via the ACCOMPLISH_DATA_DIR environment variable.
 */
function getAppDataDir(): string {
  if (process.env.ACCOMPLISH_DATA_DIR) {
    return process.env.ACCOMPLISH_DATA_DIR;
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

/**
 * Returns the IPC socket path for daemon ↔ UI communication.
 * - macOS/Linux: Unix domain socket in the app data directory
 * - Windows: Named pipe \\.\pipe\accomplish-daemon
 */
export function getDaemonSocketPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\accomplish-daemon';
  }

  return path.join(getAppDataDir(), 'daemon.sock');
}

/**
 * Returns the path to the daemon PID file.
 */
export function getDaemonPidPath(): string {
  return path.join(getAppDataDir(), 'daemon.pid');
}

/**
 * Returns the path to the daemon log file.
 */
export function getDaemonLogPath(): string {
  return path.join(getAppDataDir(), 'daemon.log');
}
