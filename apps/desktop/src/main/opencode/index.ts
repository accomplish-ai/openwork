/**
 * OpenCode integration for Electron desktop app
 *
 * This module provides Electron-specific wrappers around @accomplish/core's
 * OpenCodeAdapter and TaskManager. It maintains backward compatibility with
 * existing imports while delegating to the platform-agnostic core implementations.
 *
 * Architecture:
 * - Core classes (OpenCodeAdapter, TaskManager) come from @accomplish/core
 * - Electron-specific options (paths, API keys, env vars) are in electron-options.ts
 * - This module provides singleton instances configured for Electron
 */

// Re-export core classes and types
export {
  OpenCodeAdapter,
  OpenCodeCliNotFoundError,
  TaskManager,
  StreamParser,
  CompletionEnforcer,
  OpenCodeLogWatcher,
  createLogWatcher,
} from '@accomplish/core';

export type {
  AdapterOptions,
  OpenCodeAdapterEvents,
  TaskManagerOptions,
  TaskCallbacks,
  TaskProgressEvent,
  OpenCodeLogError,
  CompletionEnforcerCallbacks,
} from '@accomplish/core';

// Re-export Electron-specific options
export {
  createElectronAdapterOptions,
  createElectronTaskManagerOptions,
  buildEnvironment,
  buildCliArgs,
  getCliCommand,
  isCliAvailable,
  onBeforeStart,
  onBeforeTaskStart,
} from './electron-options';

// Re-export CLI path utilities (Electron-specific)
export {
  getOpenCodeCliPath,
  isOpenCodeBundled,
  getBundledOpenCodeVersion,
} from './cli-path';

// Re-export config generator (uses Electron paths)
export {
  generateOpenCodeConfig,
  getMcpToolsPath,
  syncApiKeysToOpenCodeAuth,
  ACCOMPLISH_AGENT_NAME,
} from './config-generator';

// Re-export auth browser (uses shell.openExternal)
export { loginOpenAiWithChatGpt } from './auth-browser';

import { OpenCodeAdapter, TaskManager } from '@accomplish/core';
import {
  createElectronAdapterOptions,
  createElectronTaskManagerOptions,
  isCliAvailable,
} from './electron-options';
import { getBundledOpenCodeVersion } from './cli-path';

// ============================================================================
// Singleton instances for the application
// ============================================================================

let taskManagerInstance: TaskManager | null = null;

/**
 * Get the global TaskManager instance configured for Electron
 */
export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager(createElectronTaskManagerOptions());
  }
  return taskManagerInstance;
}

/**
 * Dispose the global TaskManager instance
 * Called on app quit
 */
export function disposeTaskManager(): void {
  if (taskManagerInstance) {
    taskManagerInstance.dispose();
    taskManagerInstance = null;
  }
}

/**
 * Create a new OpenCodeAdapter instance configured for Electron
 * @param taskId - Optional task ID for this adapter instance
 */
export function createAdapter(taskId?: string): OpenCodeAdapter {
  return new OpenCodeAdapter(createElectronAdapterOptions(), taskId);
}

// ============================================================================
// Legacy compatibility functions
// ============================================================================

/**
 * Check if OpenCode CLI is available (bundled or installed)
 * @deprecated Use isCliAvailable() instead
 */
export async function isOpenCodeCliInstalled(): Promise<boolean> {
  return isCliAvailable();
}

/**
 * Get OpenCode CLI version
 */
export async function getOpenCodeCliVersion(): Promise<string | null> {
  return getBundledOpenCodeVersion();
}
