// Factory functions from agent-core
export {
  OpenCodeCliNotFoundError,
  createLogWatcher,
  createTaskManager,
  createOpenCodeAdapter,
} from '@accomplish/agent-core';

// Types from agent-core
export type {
  AdapterOptions,
  OpenCodeAdapterEvents,
  TaskManagerOptions,
  TaskCallbacks,
  TaskProgressEvent,
  OpenCodeLogError,
  CompletionEnforcerCallbacks,
  TaskManagerAPI,
  OpenCodeAdapterAPI,
} from '@accomplish/agent-core';

export {
  createElectronAdapterOptions,
  createElectronTaskManagerOptions,
  buildEnvironment,
  buildCliArgs,
  getCliCommand,
  isCliAvailable,
  onBeforeStart,
  onBeforeTaskStart,
  getOpenCodeCliPath,
  isOpenCodeBundled,
  getBundledOpenCodeVersion,
} from './electron-options';

export {
  generateOpenCodeConfig,
  getMcpToolsPath,
  syncApiKeysToOpenCodeAuth,
  ACCOMPLISH_AGENT_NAME,
} from './config-generator';

export { loginOpenAiWithChatGpt } from './auth-browser';

import { createTaskManager, createOpenCodeAdapter, type TaskManagerAPI, type OpenCodeAdapterAPI } from '@accomplish/agent-core';
import {
  createElectronAdapterOptions,
  createElectronTaskManagerOptions,
  isCliAvailable,
  getBundledOpenCodeVersion,
} from './electron-options';

let taskManagerInstance: TaskManagerAPI | null = null;

export function getTaskManager(): TaskManagerAPI {
  if (!taskManagerInstance) {
    taskManagerInstance = createTaskManager(createElectronTaskManagerOptions());
  }
  return taskManagerInstance;
}

export function disposeTaskManager(): void {
  if (taskManagerInstance) {
    taskManagerInstance.dispose();
    taskManagerInstance = null;
  }
}

export function createAdapter(taskId?: string): OpenCodeAdapterAPI {
  return createOpenCodeAdapter(createElectronAdapterOptions(), taskId);
}

export async function isOpenCodeCliInstalled(): Promise<boolean> {
  return isCliAvailable();
}

export async function getOpenCodeCliVersion(): Promise<string | null> {
  return getBundledOpenCodeVersion();
}
