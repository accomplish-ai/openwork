/**
 * Factory function for creating OpenCodeAdapter instances
 *
 * OpenCodeAdapter is the low-level adapter for interacting with the OpenCode CLI.
 * Most consumers should use createTaskManager instead, which handles task lifecycle
 * and uses OpenCodeAdapter internally.
 */

import { OpenCodeAdapter, type AdapterOptions, type OpenCodeAdapterEvents } from '../internal/classes/OpenCodeAdapter.js';
import type { Task, TaskConfig } from '../common/types/task.js';

/**
 * Public API for OpenCodeAdapter operations
 * Matches the OpenCodeAdapter class interface
 */
export interface OpenCodeAdapterAPI {
  /** Start a task with the given configuration */
  startTask(config: TaskConfig): Promise<Task>;
  /** Resume an existing session */
  resumeSession(sessionId: string, prompt: string): Promise<Task>;
  /** Cancel the current task */
  cancelTask(): Promise<void>;
  /** Interrupt the current task (softer than cancel) */
  interruptTask(): Promise<void>;
  /** Send a response to a waiting prompt */
  sendResponse(response: string): Promise<void>;
  /** Check if the adapter is currently running a task */
  readonly running: boolean;
  /** Get the current session ID */
  getSessionId(): string | null;
  /** Get the current task ID */
  getTaskId(): string | null;
  /** Check if the adapter has been disposed */
  isAdapterDisposed(): boolean;
  /** Dispose of the adapter and clean up resources */
  dispose(): void;
  /** Register an event handler */
  on<K extends keyof OpenCodeAdapterEvents>(event: K, handler: (...args: OpenCodeAdapterEvents[K]) => void): this;
  /** Remove an event handler */
  off<K extends keyof OpenCodeAdapterEvents>(event: K, handler: (...args: OpenCodeAdapterEvents[K]) => void): this;
  /** Emit an event */
  emit<K extends keyof OpenCodeAdapterEvents>(event: K, ...args: OpenCodeAdapterEvents[K]): boolean;
}

// Re-export types for convenience
export type { AdapterOptions, OpenCodeAdapterEvents };

/**
 * Create a new OpenCodeAdapter instance
 * @param options - Adapter configuration options
 * @param taskId - Optional task ID for logging/tracking
 * @returns OpenCodeAdapterAPI instance
 */
export function createOpenCodeAdapter(options: AdapterOptions, taskId?: string): OpenCodeAdapterAPI {
  return new OpenCodeAdapter(options, taskId);
}
