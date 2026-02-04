/**
 * TaskManager - Manages multiple concurrent OpenCode CLI task executions
 *
 * This class implements a process manager pattern to support true parallel
 * session execution. Each task gets its own OpenCodeAdapter instance with
 * isolated PTY process, state, and event handling.
 */

import { OpenCodeAdapter, AdapterOptions, OpenCodeCliNotFoundError } from './adapter.js';
import type {
  TaskConfig,
  Task,
  TaskResult,
  TaskStatus,
  OpenCodeMessage,
  PermissionRequest,
  TodoItem,
} from '@accomplish/shared';

/**
 * Progress event with startup stage information
 */
export interface TaskProgressEvent {
  stage: string;
  message?: string;
  /** Whether this is the first task (cold start) - used for UI hints */
  isFirstTask?: boolean;
  /** Model display name for 'connecting' stage */
  modelName?: string;
}

/**
 * Callbacks for task events - scoped to a specific task
 */
export interface TaskCallbacks {
  onMessage: (message: OpenCodeMessage) => void;
  onProgress: (progress: TaskProgressEvent) => void;
  onPermissionRequest: (request: PermissionRequest) => void;
  onComplete: (result: TaskResult) => void;
  onError: (error: Error) => void;
  onStatusChange?: (status: TaskStatus) => void;
  onDebug?: (log: { type: string; message: string; data?: unknown }) => void;
  onTodoUpdate?: (todos: TodoItem[]) => void;
  onAuthError?: (error: { providerId: string; message: string }) => void;
}

/**
 * Options for creating a TaskManager
 */
export interface TaskManagerOptions {
  /** Configuration for adapters (without workingDirectory which is per-task) */
  adapterOptions: Omit<AdapterOptions, 'buildCliArgs'> & {
    buildCliArgs: (config: TaskConfig, taskId: string) => Promise<string[]>;
  };
  /** Default working directory for tasks */
  defaultWorkingDirectory: string;
  /** Maximum number of concurrent tasks (default: 10) */
  maxConcurrentTasks?: number;
  /** Function to check if CLI is available */
  isCliAvailable: () => Promise<boolean>;
  /** Optional callback before starting task (e.g., browser setup) */
  onBeforeTaskStart?: (callbacks: TaskCallbacks, isFirstTask: boolean) => Promise<void>;
}

/**
 * Internal representation of a managed task
 */
interface ManagedTask {
  taskId: string;
  adapter: OpenCodeAdapter;
  callbacks: TaskCallbacks;
  cleanup: () => void;
  createdAt: Date;
}

/**
 * Queued task waiting for execution
 */
interface QueuedTask {
  taskId: string;
  config: TaskConfig;
  callbacks: TaskCallbacks;
  createdAt: Date;
}

/**
 * Default maximum number of concurrent tasks
 */
const DEFAULT_MAX_CONCURRENT_TASKS = 10;

/**
 * TaskManager manages OpenCode CLI task executions with parallel execution
 *
 * Multiple tasks can run concurrently up to maxConcurrentTasks.
 * Each task gets its own isolated PTY process.
 */
export class TaskManager {
  private activeTasks: Map<string, ManagedTask> = new Map();
  private taskQueue: QueuedTask[] = [];
  private maxConcurrentTasks: number;
  private options: TaskManagerOptions;
  /** Tracks whether this is the first task since app launch (cold start) */
  private isFirstTask: boolean = true;

  constructor(options: TaskManagerOptions) {
    this.options = options;
    this.maxConcurrentTasks = options.maxConcurrentTasks ?? DEFAULT_MAX_CONCURRENT_TASKS;
  }

  /**
   * Check if this is a cold start (first task since app launch)
   */
  getIsFirstTask(): boolean {
    return this.isFirstTask;
  }

  /**
   * Start a new task. Multiple tasks can run in parallel up to maxConcurrentTasks.
   * If at capacity, new tasks are queued and start automatically when a task completes.
   */
  async startTask(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks
  ): Promise<Task> {
    // Check if CLI is installed
    const cliInstalled = await this.options.isCliAvailable();
    if (!cliInstalled) {
      throw new OpenCodeCliNotFoundError();
    }

    // Check if task already exists
    if (this.activeTasks.has(taskId) || this.taskQueue.some(q => q.taskId === taskId)) {
      throw new Error(`Task ${taskId} is already running or queued`);
    }

    // If at max concurrent tasks, queue this one
    if (this.activeTasks.size >= this.maxConcurrentTasks) {
      console.log(`[TaskManager] At max concurrent tasks (${this.maxConcurrentTasks}). Queueing task ${taskId}`);
      return this.queueTask(taskId, config, callbacks);
    }

    // Execute immediately
    return this.executeTask(taskId, config, callbacks);
  }

  /**
   * Queue a task for later execution
   */
  private queueTask(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks
  ): Task {
    // Check queue limit
    if (this.taskQueue.length >= this.maxConcurrentTasks) {
      throw new Error(
        `Maximum queued tasks (${this.maxConcurrentTasks}) reached. Please wait for tasks to complete.`
      );
    }

    const queuedTask: QueuedTask = {
      taskId,
      config,
      callbacks,
      createdAt: new Date(),
    };

    this.taskQueue.push(queuedTask);
    console.log(`[TaskManager] Task ${taskId} queued. Queue length: ${this.taskQueue.length}`);

    return {
      id: taskId,
      prompt: config.prompt,
      status: 'queued',
      messages: [],
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Execute a task immediately
   */
  private async executeTask(
    taskId: string,
    config: TaskConfig,
    callbacks: TaskCallbacks
  ): Promise<Task> {
    // Build adapter options for this specific task
    const adapterOptions: AdapterOptions = {
      ...this.options.adapterOptions,
      buildCliArgs: (taskConfig) => this.options.adapterOptions.buildCliArgs(taskConfig, taskId),
    };

    // Create a new adapter instance for this task
    const adapter = new OpenCodeAdapter(adapterOptions, taskId);

    // Wire up event listeners
    const onMessage = (message: OpenCodeMessage) => {
      callbacks.onMessage(message);
    };

    const onProgress = (progress: { stage: string; message?: string; modelName?: string }) => {
      callbacks.onProgress(progress);
    };

    const onPermissionRequest = (request: PermissionRequest) => {
      callbacks.onPermissionRequest(request);
    };

    const onComplete = (result: TaskResult) => {
      callbacks.onComplete(result);
      // Auto-cleanup on completion and process queue
      this.cleanupTask(taskId);
      this.processQueue();
    };

    const onError = (error: Error) => {
      callbacks.onError(error);
      // Auto-cleanup on error and process queue
      this.cleanupTask(taskId);
      this.processQueue();
    };

    const onDebug = (log: { type: string; message: string; data?: unknown }) => {
      callbacks.onDebug?.(log);
    };

    const onTodoUpdate = (todos: TodoItem[]) => {
      callbacks.onTodoUpdate?.(todos);
    };

    const onAuthError = (error: { providerId: string; message: string }) => {
      callbacks.onAuthError?.(error);
    };

    // Attach listeners
    adapter.on('message', onMessage);
    adapter.on('progress', onProgress);
    adapter.on('permission-request', onPermissionRequest);
    adapter.on('complete', onComplete);
    adapter.on('error', onError);
    adapter.on('debug', onDebug);
    adapter.on('todo:update', onTodoUpdate);
    adapter.on('auth-error', onAuthError);

    // Create cleanup function
    const cleanup = () => {
      adapter.off('message', onMessage);
      adapter.off('progress', onProgress);
      adapter.off('permission-request', onPermissionRequest);
      adapter.off('complete', onComplete);
      adapter.off('error', onError);
      adapter.off('debug', onDebug);
      adapter.off('todo:update', onTodoUpdate);
      adapter.off('auth-error', onAuthError);
      adapter.dispose();
    };

    // Register the managed task
    const managedTask: ManagedTask = {
      taskId,
      adapter,
      callbacks,
      cleanup,
      createdAt: new Date(),
    };
    this.activeTasks.set(taskId, managedTask);

    console.log(`[TaskManager] Executing task ${taskId}. Active tasks: ${this.activeTasks.size}`);

    // Create task object immediately
    const task: Task = {
      id: taskId,
      prompt: config.prompt,
      status: 'running',
      messages: [],
      createdAt: new Date().toISOString(),
    };

    // Start setup and agent asynchronously
    const isFirstTask = this.isFirstTask;
    (async () => {
      try {
        // Emit starting stage immediately
        callbacks.onProgress({ stage: 'starting', message: 'Starting task...', isFirstTask });

        // Run pre-start callback if provided (e.g., browser setup)
        if (this.options.onBeforeTaskStart) {
          await this.options.onBeforeTaskStart(callbacks, isFirstTask);
        }

        // Mark cold start as complete after setup
        if (this.isFirstTask) {
          this.isFirstTask = false;
        }

        // Emit environment setup stage
        callbacks.onProgress({ stage: 'environment', message: 'Setting up environment...', isFirstTask });

        // Now start the agent
        await adapter.startTask({
          ...config,
          taskId,
          workingDirectory: config.workingDirectory || this.options.defaultWorkingDirectory,
        });
      } catch (error) {
        // Cleanup on failure and process queue
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
        this.cleanupTask(taskId);
        this.processQueue();
      }
    })();

    return task;
  }

  /**
   * Process the queue - start queued tasks if we have capacity
   */
  private async processQueue(): Promise<void> {
    while (this.taskQueue.length > 0 && this.activeTasks.size < this.maxConcurrentTasks) {
      const nextTask = this.taskQueue.shift()!;
      console.log(`[TaskManager] Processing queue. Starting task ${nextTask.taskId}. Active: ${this.activeTasks.size}, Remaining in queue: ${this.taskQueue.length}`);

      // Notify that task is now running
      nextTask.callbacks.onStatusChange?.('running');

      try {
        await this.executeTask(nextTask.taskId, nextTask.config, nextTask.callbacks);
      } catch (error) {
        console.error(`[TaskManager] Error starting queued task ${nextTask.taskId}:`, error);
        nextTask.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (this.taskQueue.length === 0) {
      console.log('[TaskManager] Queue empty, no more tasks to process');
    }
  }

  /**
   * Cancel a specific task (running or queued)
   */
  async cancelTask(taskId: string): Promise<void> {
    // Check if it's a queued task
    const queueIndex = this.taskQueue.findIndex(q => q.taskId === taskId);
    if (queueIndex !== -1) {
      console.log(`[TaskManager] Cancelling queued task ${taskId}`);
      this.taskQueue.splice(queueIndex, 1);
      return;
    }

    // Otherwise, it's a running task
    const managedTask = this.activeTasks.get(taskId);
    if (!managedTask) {
      console.warn(`[TaskManager] Task ${taskId} not found for cancellation`);
      return;
    }

    console.log(`[TaskManager] Cancelling running task ${taskId}`);

    try {
      await managedTask.adapter.cancelTask();
    } finally {
      this.cleanupTask(taskId);
      this.processQueue();
    }
  }

  /**
   * Interrupt a running task (graceful Ctrl+C)
   */
  async interruptTask(taskId: string): Promise<void> {
    const managedTask = this.activeTasks.get(taskId);
    if (!managedTask) {
      console.warn(`[TaskManager] Task ${taskId} not found for interruption`);
      return;
    }

    console.log(`[TaskManager] Interrupting task ${taskId}`);
    await managedTask.adapter.interruptTask();
  }

  /**
   * Cancel a queued task
   */
  cancelQueuedTask(taskId: string): boolean {
    const queueIndex = this.taskQueue.findIndex(q => q.taskId === taskId);
    if (queueIndex === -1) {
      return false;
    }

    console.log(`[TaskManager] Removing task ${taskId} from queue`);
    this.taskQueue.splice(queueIndex, 1);
    return true;
  }

  /**
   * Send a response to a specific task's PTY
   */
  async sendResponse(taskId: string, response: string): Promise<void> {
    const managedTask = this.activeTasks.get(taskId);
    if (!managedTask) {
      throw new Error(`Task ${taskId} not found or not active`);
    }

    await managedTask.adapter.sendResponse(response);
  }

  /**
   * Get the session ID for a specific task
   */
  getSessionId(taskId: string): string | null {
    const managedTask = this.activeTasks.get(taskId);
    return managedTask?.adapter.getSessionId() ?? null;
  }

  /**
   * Check if a task is running
   */
  isTaskRunning(taskId: string): boolean {
    const managedTask = this.activeTasks.get(taskId);
    return managedTask?.adapter.running ?? false;
  }

  /**
   * Get an active adapter for a task
   */
  getTask(taskId: string): OpenCodeAdapter | undefined {
    return this.activeTasks.get(taskId)?.adapter;
  }

  /**
   * Check if a task is active
   */
  hasActiveTask(taskId: string): boolean {
    return this.activeTasks.has(taskId);
  }

  /**
   * Check if there are any running tasks
   */
  hasRunningTask(): boolean {
    return this.activeTasks.size > 0;
  }

  /**
   * Check if a specific task is queued
   */
  isTaskQueued(taskId: string): boolean {
    return this.taskQueue.some(q => q.taskId === taskId);
  }

  /**
   * Get queue position for a task (1-based), or 0 if not queued
   */
  getQueuePosition(taskId: string): number {
    const index = this.taskQueue.findIndex(q => q.taskId === taskId);
    return index === -1 ? 0 : index + 1;
  }

  /**
   * Get the current queue length
   */
  getQueueLength(): number {
    return this.taskQueue.length;
  }

  /**
   * Get the number of active tasks
   */
  get runningTaskCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Get all active task IDs
   */
  getActiveTaskIds(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  /**
   * Get the currently running task ID (not queued)
   * Returns the first active task if multiple are running
   */
  getActiveTaskId(): string | null {
    const firstActive = this.activeTasks.keys().next();
    return firstActive.done ? null : firstActive.value;
  }

  /**
   * Get the number of active tasks
   */
  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Cancel all running tasks
   */
  cancelAllTasks(): void {
    console.log(`[TaskManager] Cancelling all ${this.activeTasks.size} active tasks`);

    // Clear the queue
    this.taskQueue = [];

    // Cancel all active tasks
    for (const [taskId] of this.activeTasks) {
      this.cancelTask(taskId).catch(err => {
        console.error(`[TaskManager] Error cancelling task ${taskId}:`, err);
      });
    }
  }

  /**
   * Cleanup a specific task
   */
  private cleanupTask(taskId: string): void {
    const managedTask = this.activeTasks.get(taskId);
    if (managedTask) {
      console.log(`[TaskManager] Cleaning up task ${taskId}`);
      managedTask.cleanup();
      this.activeTasks.delete(taskId);
      console.log(`[TaskManager] Task ${taskId} cleaned up. Active tasks: ${this.activeTasks.size}`);
    }
  }

  /**
   * Dispose all tasks and cleanup resources
   */
  dispose(): void {
    console.log(`[TaskManager] Disposing all tasks (${this.activeTasks.size} active, ${this.taskQueue.length} queued)`);

    // Clear the queue
    this.taskQueue = [];

    for (const [taskId, managedTask] of this.activeTasks) {
      try {
        managedTask.cleanup();
      } catch (error) {
        console.error(`[TaskManager] Error cleaning up task ${taskId}:`, error);
      }
    }

    this.activeTasks.clear();
    console.log('[TaskManager] All tasks disposed');
  }
}

/**
 * Create a new TaskManager instance
 */
export function createTaskManager(options: TaskManagerOptions): TaskManager {
  return new TaskManager(options);
}
