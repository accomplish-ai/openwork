/**
 * Accomplish API - Interface to the Electron main process
 *
 * This module provides type-safe access to the accomplish API
 * exposed by the preload script via contextBridge.
 */

import type {
  Task,
  TaskConfig,
  TaskUpdateEvent,
  TaskStatus,
  PermissionRequest,
  PermissionResponse,
  TaskProgress,
  ApiKeyConfig,
  TaskMessage,
  DesktopWindow,
  AccessibleNode,
  DesktopScreenshot,
  DesktopContextOptions,
  DesktopContextSnapshot,
  DesktopControlStatus,
  DesktopControlStatusSnapshot,
  LiveScreenFramePayload,
  LiveScreenSessionStartPayload,
  LiveScreenStartOptions,
  LiveScreenStopPayload,
} from '@accomplish/shared';
import type { MouseMovePayload, MouseClickPayload } from '@accomplish/shared';

export type {
  DesktopControlCapability,
  DesktopControlCapabilityStatus,
  DesktopControlCheckStatus,
  DesktopControlRemediation,
  DesktopControlStatus,
  DesktopControlStatusSnapshot,
} from '@accomplish/shared';

export interface LegacyDesktopControlStatusSnapshot {
  status: DesktopControlStatus;
  capabilities: {
    screen_capture: string;
    action_execution: string;
    mcp_health: string;
  };
  checkedAt: number;
  message?: string;
  remediation?: string;
}

export type DesktopControlStatusPayload =
  | DesktopControlStatusSnapshot
  | LegacyDesktopControlStatusSnapshot;

interface AccomplishDesktopControlAPI {
  getDesktopControlStatus?(options?: { forceRefresh?: boolean }): Promise<DesktopControlStatusPayload>;
  desktopControlGetStatus?(options?: { forceRefresh?: boolean }): Promise<DesktopControlStatusPayload>;
  desktopControl?: {
    getStatus?(options?: { forceRefresh?: boolean }): Promise<DesktopControlStatusPayload>;
    liveScreen?: {
      startSession?(options?: LiveScreenStartOptions): Promise<LiveScreenSessionStartPayload>;
      getFrame?(sessionId: string): Promise<LiveScreenFramePayload>;
      refreshFrame?(sessionId: string): Promise<LiveScreenFramePayload>;
      stopSession?(sessionId: string): Promise<LiveScreenStopPayload>;
    };
  };
}

function createDesktopControlUnavailableSnapshot(): DesktopControlStatusSnapshot {
  const checkedAt = new Date().toISOString();
  const remediation = {
    title: 'Desktop control status API unavailable',
    steps: [
      'Restart Screen Agent and run Recheck again.',
      'If this persists, update/reinstall the app so preload desktop-control APIs are available.',
    ],
  };

  return {
    status: 'unknown',
    errorCode: 'desktop_control_status_api_unavailable',
    message: 'Desktop-control readiness API is unavailable in the renderer bridge.',
    remediation,
    checkedAt,
    cache: {
      ttlMs: 0,
      expiresAt: checkedAt,
      fromCache: false,
    },
    checks: {
      screen_capture: {
        capability: 'screen_capture',
        status: 'unknown',
        errorCode: 'desktop_control_status_api_unavailable',
        message: 'Readiness could not be checked because the status bridge is unavailable.',
        remediation,
        checkedAt,
      },
      action_execution: {
        capability: 'action_execution',
        status: 'unknown',
        errorCode: 'desktop_control_status_api_unavailable',
        message: 'Readiness could not be checked because the status bridge is unavailable.',
        remediation,
        checkedAt,
      },
      mcp_health: {
        capability: 'mcp_health',
        status: 'unknown',
        errorCode: 'desktop_control_status_api_unavailable',
        message: 'Readiness could not be checked because the status bridge is unavailable.',
        remediation,
        checkedAt,
      },
    },
  };
}

// Define the API interface
interface AccomplishAPI {
  // App info
  getVersion(): Promise<string>;
  getPlatform(): Promise<string>;

  // Shell
  openExternal(url: string): Promise<void>;

  // Task operations
  startTask(config: TaskConfig): Promise<Task>;
  cancelTask(taskId: string): Promise<void>;
  interruptTask(taskId: string): Promise<void>;
  getTask(taskId: string): Promise<Task | null>;
  listTasks(): Promise<Task[]>;
  deleteTask(taskId: string): Promise<void>;
  clearTaskHistory(): Promise<void>;

  // Permission responses
  respondToPermission(response: PermissionResponse): Promise<void>;

  // Session management
  resumeSession(sessionId: string, prompt: string, taskId?: string): Promise<Task>;

  // Settings
  getApiKeys(): Promise<ApiKeyConfig[]>;
  addApiKey(
    provider: 'anthropic' | 'openai' | 'google' | 'xai' | 'openrouter' | 'custom',
    key: string,
    label?: string
  ): Promise<ApiKeyConfig>;
  removeApiKey(id: string): Promise<void>;
  getDebugMode(): Promise<boolean>;
  setDebugMode(enabled: boolean): Promise<void>;
  getAppSettings(): Promise<{
    debugMode: boolean;
    onboardingComplete: boolean;
    desktopControlPreflight?: boolean;
    liveScreenSampling?: boolean;
    allowMouseControl?: boolean;
  }>;
  getDesktopControlPreflight?(): Promise<boolean>;
  setDesktopControlPreflight?(enabled: boolean): Promise<void>;
  getLiveScreenSampling?(): Promise<boolean>;
  setLiveScreenSampling?(enabled: boolean): Promise<void>;
  setAllowMouseControl?(enabled: boolean): Promise<void>;
  getAllowDesktopContext?(): Promise<boolean>;
  setAllowDesktopContext?(enabled: boolean): Promise<void>;
  getDesktopContextBackgroundPolling?(): Promise<boolean>;
  setDesktopContextBackgroundPolling?(enabled: boolean): Promise<void>;

  // API Key management
  hasApiKey(): Promise<boolean>;
  setApiKey(key: string): Promise<void>;
  getApiKey(): Promise<{ exists: boolean; prefix?: string }>;
  validateApiKey(key: string): Promise<{ valid: boolean; error?: string }>;
  validateApiKeyForProvider(provider: string, key: string): Promise<{ valid: boolean; error?: string }>;
  clearApiKey(): Promise<void>;

  // Multi-provider API keys
  getAllApiKeys(): Promise<Record<string, { exists: boolean; prefix?: string }>>;
  hasAnyApiKey(): Promise<boolean>;

  // Onboarding
  getOnboardingComplete(): Promise<boolean>;
  setOnboardingComplete(complete: boolean): Promise<void>;

  // Claude CLI
  checkClaudeCli(): Promise<{ installed: boolean; version: string | null; installCommand: string }>;
  getClaudeVersion(): Promise<string | null>;

  // Model selection
  getSelectedModel(): Promise<{ provider: string; model: string; baseUrl?: string } | null>;
  setSelectedModel(model: { provider: string; model: string; baseUrl?: string }): Promise<void>;

  // Ollama configuration
  testOllamaConnection(url: string): Promise<{
    success: boolean;
    models?: Array<{ id: string; displayName: string; size: number }>;
    error?: string;
  }>;
  getOllamaConfig(): Promise<{ baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; displayName: string; size: number }> } | null>;
  setOllamaConfig(config: { baseUrl: string; enabled: boolean; lastValidated?: number; models?: Array<{ id: string; displayName: string; size: number }> } | null): Promise<void>;

  // Event subscriptions
  onTaskUpdate(callback: (event: TaskUpdateEvent) => void): () => void;
  onTaskUpdateBatch?(callback: (event: { taskId: string; messages: TaskMessage[] }) => void): () => void;
  onPermissionRequest(callback: (request: PermissionRequest) => void): () => void;
  onTaskProgress(callback: (progress: TaskProgress) => void): () => void;
  onDebugLog(callback: (log: unknown) => void): () => void;
  onTaskStatusChange?(callback: (data: { taskId: string; status: TaskStatus }) => void): () => void;
  onTaskSummary?(callback: (data: { taskId: string; summary: string }) => void): () => void;
  onToggleDictationRequested?(callback: () => void): () => void;

  // Logging
  logEvent(payload: { level?: string; message: string; context?: Record<string, unknown> }): Promise<unknown>;

  // Window controls
  toggleAlwaysOnTop?(): Promise<boolean>;
  minimizeWindow?(): Promise<void>;
  showWindow?(): Promise<void>;
  collapseToIconWindow?(): Promise<void>;
  expandFromIconWindow?(): Promise<void>;

  // Smart trigger
  getSmartTriggerConfig?(): Promise<{
    enabled: boolean;
    idleThresholdSeconds: number;
    minActivitySeconds: number;
    checkIntervalMs: number;
  }>;
  setSmartTriggerConfig?(config: {
    enabled?: boolean;
    idleThresholdSeconds?: number;
    minActivitySeconds?: number;
    checkIntervalMs?: number;
  }): Promise<unknown>;
  notifyActivity?(): void;
  onSmartTrigger?(callback: (data: { reason: string; timestamp: number }) => void): () => void;

  // Desktop control preflight
  getDesktopControlStatus?(options?: { forceRefresh?: boolean }): Promise<DesktopControlStatusPayload>;
  desktopControlGetStatus?(options?: { forceRefresh?: boolean }): Promise<DesktopControlStatusPayload>;
  desktopControl?: {
    getStatus?(options?: { forceRefresh?: boolean }): Promise<DesktopControlStatusPayload>;
    liveScreen?: {
      startSession?(options?: LiveScreenStartOptions): Promise<LiveScreenSessionStartPayload>;
      getFrame?(sessionId: string): Promise<LiveScreenFramePayload>;
      refreshFrame?(sessionId: string): Promise<LiveScreenFramePayload>;
      stopSession?(sessionId: string): Promise<LiveScreenStopPayload>;
    };
  };

  // Mouse control
  mouse?: {
    move(payload: MouseMovePayload): Promise<{ ok: true }>;
    click(payload: MouseClickPayload): Promise<{ ok: true }>;
  };

  // Desktop context
  desktop?: {
    listWindows(): Promise<DesktopWindow[]>;
    inspectWindow(windowId: number, maxDepth?: number, maxNodes?: number): Promise<AccessibleNode>;
    capture(options: {
      mode: 'screen' | 'window' | 'region';
      windowId?: number;
      rect?: { x: number; y: number; width: number; height: number };
    }): Promise<DesktopScreenshot>;
    getContext(options?: DesktopContextOptions): Promise<DesktopContextSnapshot>;
  };
}

interface AccomplishShell {
  version: string;
  platform: string;
  isElectron: true;
}

// Extend Window interface
declare global {
  interface Window {
    accomplish?: AccomplishAPI;
    accomplishShell?: AccomplishShell;
  }
}

/**
 * Get the accomplish API
 * Throws if not running in Electron
 */
export function getAccomplish(): AccomplishAPI {
  if (!window.accomplish) {
    throw new Error('Accomplish API not available - not running in Electron');
  }
  return window.accomplish;
}

/**
 * Check if running in Electron shell
 */
export function isRunningInElectron(): boolean {
  return window.accomplishShell?.isElectron === true;
}

/**
 * Get shell version if available
 */
export function getShellVersion(): string | null {
  return window.accomplishShell?.version ?? null;
}

/**
 * Get shell platform if available
 */
export function getShellPlatform(): string | null {
  return window.accomplishShell?.platform ?? null;
}

/**
 * React hook to use the accomplish API
 */
export function useAccomplish(): AccomplishAPI {
  const api = window.accomplish;
  if (!api) {
    throw new Error('Accomplish API not available - not running in Electron');
  }
  return api;
}

/**
 * Get desktop-control preflight status from the Electron bridge.
 * This is expected to be backed by IPC channel desktopControl:getStatus.
 */
export async function getDesktopControlStatus(
  options?: { forceRefresh?: boolean }
): Promise<DesktopControlStatusPayload> {
  const api = getAccomplish() as AccomplishAPI & AccomplishDesktopControlAPI;

  if (typeof api.getDesktopControlStatus === 'function') {
    return api.getDesktopControlStatus(options);
  }

  if (typeof api.desktopControlGetStatus === 'function') {
    return api.desktopControlGetStatus(options);
  }

  if (typeof api.desktopControl?.getStatus === 'function') {
    return api.desktopControl.getStatus(options);
  }

  return createDesktopControlUnavailableSnapshot();
}
