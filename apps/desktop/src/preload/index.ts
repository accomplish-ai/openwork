/**
 * Preload Script for Local Renderer
 *
 * This preload script exposes a secure API to the local React renderer
 * for communicating with the Electron main process via IPC.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  DesktopControlBridgeNamespace,
  DesktopControlStatusRequest,
  DesktopControlStatusSnapshot,
} from '../../../../src/shared/contracts/desktopControlBridge';
import type {
  LiveScreenFramePayload,
  LiveScreenSessionStartPayload,
  LiveScreenStartOptions,
  LiveScreenStopPayload,
} from '@accomplish/shared';
import {
  createDesktopControlBridgeUnavailableSnapshot,
  createDesktopControlIpcFailureSnapshot,
  DESKTOP_CONTROL_BRIDGE_CHANNELS,
  normalizeDesktopControlIpcErrorMessage,
} from '../../../../src/shared/contracts/desktopControlBridge';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDesktopControlStatusSnapshot(value: unknown): value is DesktopControlStatusSnapshot {
  if (!isRecord(value)) return false;
  if (typeof value.status !== 'string') return false;
  if (!isRecord(value.remediation)) return false;
  if (!isRecord(value.cache)) return false;
  if (!isRecord(value.checks)) return false;

  const checks = value.checks;
  return (
    isRecord(checks.screen_capture) &&
    isRecord(checks.action_execution) &&
    isRecord(checks.mcp_health)
  );
}

async function invokeDesktopControlStatus(
  options: DesktopControlStatusRequest = {}
): Promise<DesktopControlStatusSnapshot> {
  if (typeof ipcRenderer.invoke !== 'function') {
    return createDesktopControlBridgeUnavailableSnapshot(
      'ipcRenderer.invoke is not available in preload context'
    );
  }

  try {
    const payload = await ipcRenderer.invoke(DESKTOP_CONTROL_BRIDGE_CHANNELS.getStatus, options);
    if (!isDesktopControlStatusSnapshot(payload)) {
      return createDesktopControlIpcFailureSnapshot(
        'IPC returned malformed desktop-control readiness payload'
      );
    }
    return payload;
  } catch (error) {
    return createDesktopControlIpcFailureSnapshot(
      normalizeDesktopControlIpcErrorMessage(error)
    );
  }
}

const desktopControlBridge: DesktopControlBridgeNamespace = {
  getStatus: (options?: DesktopControlStatusRequest) =>
    invokeDesktopControlStatus(options ?? {}),
  liveScreen: {
    startSession: (options?: LiveScreenStartOptions): Promise<LiveScreenSessionStartPayload> =>
      ipcRenderer.invoke('desktopControl:startLiveScreenSession', options ?? {}),
    getFrame: (sessionId: string): Promise<LiveScreenFramePayload> =>
      ipcRenderer.invoke('desktopControl:getLiveScreenFrame', { sessionId }),
    refreshFrame: (sessionId: string): Promise<LiveScreenFramePayload> =>
      ipcRenderer.invoke('desktopControl:refreshLiveScreenFrame', { sessionId }),
    stopSession: (sessionId: string): Promise<LiveScreenStopPayload> =>
      ipcRenderer.invoke('desktopControl:stopLiveScreenSession', { sessionId }),
  },
};

// Expose the accomplish API to the renderer
const accomplishAPI = {
  // App info
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  getPlatform: (): Promise<string> => ipcRenderer.invoke('app:platform'),

  // Shell
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:open-external', url),

  // Task operations
  startTask: (config: { description: string }): Promise<unknown> =>
    ipcRenderer.invoke('task:start', config),
  cancelTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('task:cancel', taskId),
  interruptTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('task:interrupt', taskId),
  getTask: (taskId: string): Promise<unknown> =>
    ipcRenderer.invoke('task:get', taskId),
  listTasks: (): Promise<unknown[]> => ipcRenderer.invoke('task:list'),
  deleteTask: (taskId: string): Promise<void> =>
    ipcRenderer.invoke('task:delete', taskId),
  clearTaskHistory: (): Promise<void> => ipcRenderer.invoke('task:clear-history'),

  // Permission responses
  respondToPermission: (response: { taskId: string; allowed: boolean }): Promise<void> =>
    ipcRenderer.invoke('permission:respond', response),

  // Session management
  resumeSession: (sessionId: string, prompt: string, taskId?: string): Promise<unknown> =>
    ipcRenderer.invoke('session:resume', sessionId, prompt, taskId),

  // Settings
  getApiKeys: (): Promise<unknown[]> => ipcRenderer.invoke('settings:api-keys'),
  addApiKey: (
    provider: 'anthropic' | 'openai' | 'google' | 'xai' | 'openrouter' | 'custom',
    key: string,
    label?: string
  ): Promise<unknown> =>
    ipcRenderer.invoke('settings:add-api-key', provider, key, label),
  removeApiKey: (id: string): Promise<void> =>
    ipcRenderer.invoke('settings:remove-api-key', id),
  getDebugMode: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:debug-mode'),
  setDebugMode: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:set-debug-mode', enabled),
  getAppSettings: (): Promise<{
    debugMode: boolean;
    onboardingComplete: boolean;
    desktopControlPreflight?: boolean;
    liveScreenSampling?: boolean;
    allowMouseControl?: boolean;
  }> =>
    ipcRenderer.invoke('settings:app-settings'),
  getDesktopControlPreflight: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:get-desktop-control-preflight'),
  setDesktopControlPreflight: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:set-desktop-control-preflight', enabled),
  getLiveScreenSampling: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:get-live-screen-sampling'),
  setLiveScreenSampling: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:set-live-screen-sampling', enabled),
  setAllowMouseControl: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:set-allow-mouse-control', enabled),
  getAllowDesktopContext: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:get-allow-desktop-context'),
  setAllowDesktopContext: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:set-allow-desktop-context', enabled),
  getDesktopContextBackgroundPolling: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:get-desktop-context-background-polling'),
  setDesktopContextBackgroundPolling: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('settings:set-desktop-context-background-polling', enabled),

  // API Key management (new simplified handlers)
  hasApiKey: (): Promise<boolean> =>
    ipcRenderer.invoke('api-key:exists'),
  setApiKey: (key: string): Promise<void> =>
    ipcRenderer.invoke('api-key:set', key),
  getApiKey: (): Promise<{ exists: boolean; prefix?: string }> =>
    ipcRenderer.invoke('api-key:get'),
  validateApiKey: (key: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('api-key:validate', key),
  validateApiKeyForProvider: (provider: string, key: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('api-key:validate-provider', provider, key),
  clearApiKey: (): Promise<void> =>
    ipcRenderer.invoke('api-key:clear'),

  // Onboarding
  getOnboardingComplete: (): Promise<boolean> =>
    ipcRenderer.invoke('onboarding:complete'),
  setOnboardingComplete: (complete: boolean): Promise<void> =>
    ipcRenderer.invoke('onboarding:set-complete', complete),

  // Desktop control readiness bridge (canonical + compatibility aliases)
  getDesktopControlStatus: (options?: DesktopControlStatusRequest): Promise<DesktopControlStatusSnapshot> =>
    desktopControlBridge.getStatus(options),
  desktopControlGetStatus: (options?: DesktopControlStatusRequest): Promise<DesktopControlStatusSnapshot> =>
    desktopControlBridge.getStatus(options),
  desktopControl: desktopControlBridge,

  // OpenCode CLI status
  checkOpenCodeCli: (): Promise<{
    installed: boolean;
    version: string | null;
    installCommand: string;
  }> => ipcRenderer.invoke('opencode:check'),
  getOpenCodeVersion: (): Promise<string | null> =>
    ipcRenderer.invoke('opencode:version'),

  // Model selection
  getSelectedModel: (): Promise<{ provider: string; model: string; baseUrl?: string } | null> =>
    ipcRenderer.invoke('model:get'),
  setSelectedModel: (model: { provider: string; model: string; baseUrl?: string }): Promise<void> =>
    ipcRenderer.invoke('model:set', model),

  // Multi-provider API keys
  getAllApiKeys: (): Promise<Record<string, { exists: boolean; prefix?: string }>> =>
    ipcRenderer.invoke('api-keys:all'),
  hasAnyApiKey: (): Promise<boolean> =>
    ipcRenderer.invoke('api-keys:has-any'),

  // Ollama configuration
  testOllamaConnection: (url: string): Promise<{
    success: boolean;
    models?: Array<{ id: string; displayName: string; size: number }>;
    error?: string;
  }> => ipcRenderer.invoke('ollama:test-connection', url),

  getOllamaConfig: (): Promise<{ baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; displayName: string; size: number }> } | null> =>
    ipcRenderer.invoke('ollama:get-config'),

  setOllamaConfig: (config: { baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; displayName: string; size: number }> } | null): Promise<void> =>
    ipcRenderer.invoke('ollama:set-config', config),

  // Event subscriptions
  onTaskUpdate: (callback: (event: unknown) => void) => {
    const listener = (_: unknown, event: unknown) => callback(event);
    ipcRenderer.on('task:update', listener);
    return () => ipcRenderer.removeListener('task:update', listener);
  },
  // Batched task updates for performance - multiple messages in single IPC call
  onTaskUpdateBatch: (callback: (event: { taskId: string; messages: unknown[] }) => void) => {
    const listener = (_: unknown, event: { taskId: string; messages: unknown[] }) => callback(event);
    ipcRenderer.on('task:update:batch', listener);
    return () => ipcRenderer.removeListener('task:update:batch', listener);
  },
  onPermissionRequest: (callback: (request: unknown) => void) => {
    const listener = (_: unknown, request: unknown) => callback(request);
    ipcRenderer.on('permission:request', listener);
    return () => ipcRenderer.removeListener('permission:request', listener);
  },
  onTaskProgress: (callback: (progress: unknown) => void) => {
    const listener = (_: unknown, progress: unknown) => callback(progress);
    ipcRenderer.on('task:progress', listener);
    return () => ipcRenderer.removeListener('task:progress', listener);
  },
  onDebugLog: (callback: (log: unknown) => void) => {
    const listener = (_: unknown, log: unknown) => callback(log);
    ipcRenderer.on('debug:log', listener);
    return () => ipcRenderer.removeListener('debug:log', listener);
  },
  // Task status changes (e.g., queued -> running)
  onTaskStatusChange: (callback: (data: { taskId: string; status: string }) => void) => {
    const listener = (_: unknown, data: { taskId: string; status: string }) => callback(data);
    ipcRenderer.on('task:status-change', listener);
    return () => ipcRenderer.removeListener('task:status-change', listener);
  },
  // Task summary updates (AI-generated summary)
  onTaskSummary: (callback: (data: { taskId: string; summary: string }) => void) => {
    const listener = (_: unknown, data: { taskId: string; summary: string }) => callback(data);
    ipcRenderer.on('task:summary', listener);
    return () => ipcRenderer.removeListener('task:summary', listener);
  },
  onToggleDictationRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('voice:toggle-dictation', listener);
    return () => ipcRenderer.removeListener('voice:toggle-dictation', listener);
  },

  logEvent: (payload: { level?: string; message: string; context?: Record<string, unknown> }) =>
    ipcRenderer.invoke('log:event', payload),

  // Window controls
  toggleAlwaysOnTop: (): Promise<boolean> =>
    ipcRenderer.invoke('window:toggle-always-on-top'),
  minimizeWindow: (): Promise<void> =>
    ipcRenderer.invoke('window:minimize'),
  showWindow: (): Promise<void> =>
    ipcRenderer.invoke('window:show'),
  collapseToIconWindow: (): Promise<void> =>
    ipcRenderer.invoke('window:collapse-to-icon'),
  expandFromIconWindow: (): Promise<void> =>
    ipcRenderer.invoke('window:expand-from-icon'),

  // Smart trigger
  getSmartTriggerConfig: (): Promise<{
    enabled: boolean;
    idleThresholdSeconds: number;
    minActivitySeconds: number;
    checkIntervalMs: number;
  }> => ipcRenderer.invoke('smart-trigger:get-config'),
  setSmartTriggerConfig: (config: {
    enabled?: boolean;
    idleThresholdSeconds?: number;
    minActivitySeconds?: number;
    checkIntervalMs?: number;
  }): Promise<unknown> => ipcRenderer.invoke('smart-trigger:set-config', config),
  notifyActivity: () => ipcRenderer.send('smart-trigger:activity'),
  onSmartTrigger: (callback: (data: { reason: string; timestamp: number }) => void) => {
    const listener = (_: unknown, data: { reason: string; timestamp: number }) => callback(data);
    ipcRenderer.on('smart-trigger:triggered', listener);
    return () => ipcRenderer.removeListener('smart-trigger:triggered', listener);
  },

  // Mouse control (gated by allowMouseControl setting in main process)
  mouse: {
    move: (payload: { x: number; y: number }): Promise<{ ok: true }> =>
      ipcRenderer.invoke('mouse:move', payload),
    click: (payload: { button: 'left' | 'right' | 'middle' }): Promise<{ ok: true }> =>
      ipcRenderer.invoke('mouse:click', payload),
  },

  // Desktop context: List windows, inspect accessibility, capture screenshots
  desktop: {
    listWindows: (): Promise<unknown[]> => ipcRenderer.invoke('desktop:listWindows'),
    inspectWindow: (
      windowId: number,
      maxDepth?: number,
      maxNodes?: number
    ): Promise<unknown> => ipcRenderer.invoke('desktop:inspectWindow', windowId, maxDepth, maxNodes),
    capture: (options: {
      mode: 'screen' | 'window' | 'region';
      windowId?: number;
      rect?: { x: number; y: number; width: number; height: number };
    }): Promise<unknown> => ipcRenderer.invoke('desktop:capture', options),
    getContext: (options?: unknown): Promise<unknown> =>
      ipcRenderer.invoke('desktop:getContext', options),
  },
};

// Expose the API to the renderer
contextBridge.exposeInMainWorld('accomplish', accomplishAPI);

// Also expose shell info for compatibility checks
contextBridge.exposeInMainWorld('accomplishShell', {
  version: process.env.npm_package_version || '1.0.0',
  platform: process.platform,
  isElectron: true,
});

// Type declarations
export type AccomplishAPI = typeof accomplishAPI;
