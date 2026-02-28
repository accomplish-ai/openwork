import { BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import {
  getTaskManager,
  type TaskCallbacks,
} from '../opencode/task-manager';
import {
  startPermissionApiServer,
  initPermissionApi,
  resolvePermission,
  isFilePermissionRequest,
} from '../permission-api';
import { getDebugMode } from '../store/appSettings';
import type {
  TaskConfig,
  OpenCodeMessage,
  PermissionResponse,
  TaskResult,
  TaskStatus,
  TaskMessage,
} from '@accomplish/shared';
import {
  permissionResponseSchema,
  validate,
} from './validation';
import {
  queueMessage,
  flushAndCleanupBatcher,
} from './messageBatching';
import {
  handle,
  sanitizeString,
  validateTaskConfig,
  createTaskId,
  createMessageId,
  toTaskMessage,
} from './message-utils';
import {
  addTaskMessage,
  clearHistory,
  deleteTask,
  getTask,
  getTasks,
  saveTask,
  updateTaskResult,
  updateTaskSessionId,
  updateTaskStatus,
} from '../store/taskHistory';

let permissionApiInitialized = false;

function assertTrustedWindow(window: BrowserWindow | null): BrowserWindow {
  if (!window || window.isDestroyed()) {
    throw new Error('Untrusted window');
  }

  const focused = BrowserWindow.getFocusedWindow();
  if (BrowserWindow.getAllWindows().length > 1 && focused && focused.id !== window.id) {
    throw new Error('IPC request must originate from the focused window');
  }

  return window;
}

function createForwardToRenderer(
  window: BrowserWindow,
  sender: Electron.WebContents
): (channel: string, data: unknown) => void {
  return (channel: string, data: unknown) => {
    if (!window.isDestroyed() && !sender.isDestroyed()) {
      sender.send(channel, data);
    }
  };
}

function createTaskCallbacksForTask(
  taskId: string,
  forwardToRenderer: (channel: string, data: unknown) => void
): TaskCallbacks {
  return {
    onMessage: (message: OpenCodeMessage) => {
      const taskMessage = toTaskMessage(message);
      if (!taskMessage) return;
      addTaskMessage(taskId, taskMessage);
      queueMessage(taskId, taskMessage, forwardToRenderer);
    },

    onProgress: (progress: { stage: string; message?: string }) => {
      forwardToRenderer('task:progress', {
        taskId,
        ...progress,
      });
    },

    onPermissionRequest: (request: unknown) => {
      flushAndCleanupBatcher(taskId);
      forwardToRenderer('permission:request', request);
    },

    onComplete: (result: TaskResult) => {
      updateTaskResult(taskId, result);
      updateTaskStatus(taskId, 'completed', new Date().toISOString());
      if (result.sessionId) {
        updateTaskSessionId(taskId, result.sessionId);
      }
      flushAndCleanupBatcher(taskId);
      forwardToRenderer('task:update', {
        taskId,
        type: 'complete',
        result,
      });
    },

    onError: (error: Error) => {
      updateTaskStatus(taskId, 'failed', new Date().toISOString());
      flushAndCleanupBatcher(taskId);
      forwardToRenderer('task:update', {
        taskId,
        type: 'error',
        error: error.message,
      });
    },

    onDebug: (log: { type: string; message: string; data?: unknown }) => {
      if (getDebugMode()) {
        forwardToRenderer('debug:log', {
          taskId,
          timestamp: new Date().toISOString(),
          ...log,
        });
      }
    },

    onStatusChange: (status: TaskStatus) => {
      updateTaskStatus(taskId, status);
      forwardToRenderer('task:status-change', {
        taskId,
        status,
      });
    },
  };
}

/**
 * Register task lifecycle IPC handlers
 */
export function registerTaskHandlers(): void {
  permissionApiInitialized = false;
  const taskManager = getTaskManager();

  // Task: Start a new task (send message to agent)
  handle('task:start', async (event: IpcMainInvokeEvent, config: TaskConfig) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedConfig = validateTaskConfig(config);

    // Initialize permission API server (once, when we have a window)
    if (!permissionApiInitialized) {
      initPermissionApi(window, () => taskManager.getActiveTaskId());
      startPermissionApiServer();
      permissionApiInitialized = true;
    }

    const taskId = createTaskId();
    const forwardToRenderer = createForwardToRenderer(window, sender);
    const callbacks = createTaskCallbacksForTask(taskId, forwardToRenderer);

    // Start the task via TaskManager (creates isolated adapter or queues if busy)
    const task = await taskManager.startTask(taskId, validatedConfig, callbacks);

    // Add initial user message with the prompt to the chat
    const initialUserMessage: TaskMessage = {
      id: createMessageId(),
      type: 'user',
      content: validatedConfig.prompt,
      timestamp: new Date().toISOString(),
    };
    task.messages = [initialUserMessage];
    saveTask(task);

    return task;
  });

  // Task: Cancel current task (running or queued)
  handle('task:cancel', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) return;

    // Check if it's a queued task first
    if (taskManager.isTaskQueued(taskId)) {
      taskManager.cancelQueuedTask(taskId);
      updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
      return;
    }

    // Otherwise cancel the running task
    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.cancelTask(taskId);
      updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
    }
  });

  // Task: Interrupt current task (graceful Ctrl+C, doesn't kill process)
  handle('task:interrupt', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) return;

    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.interruptTask(taskId);
      updateTaskStatus(taskId, 'interrupted', new Date().toISOString());
      console.log(`[IPC] Task ${taskId} interrupted`);
    }
  });

  // Permission: Respond to permission request
  handle('permission:respond', async (_event: IpcMainInvokeEvent, response: PermissionResponse) => {
    const parsedResponse = validate(permissionResponseSchema, response);
    const { taskId, decision, requestId } = parsedResponse;

    // Check if this is a file permission request from the MCP server
    if (requestId && isFilePermissionRequest(requestId)) {
      const allowed = decision === 'allow';
      const resolved = resolvePermission(requestId, allowed);
      if (resolved) {
        console.log(`[IPC] File permission request ${requestId} resolved: ${allowed ? 'allowed' : 'denied'}`);
        return;
      }
      // If not found in pending, fall through to standard handling
      console.warn(`[IPC] File permission request ${requestId} not found in pending requests`);
    }

    // Check if the task is still active
    if (!taskManager.hasActiveTask(taskId)) {
      console.warn(`[IPC] Permission response for inactive task ${taskId}`);
      return;
    }

    if (decision === 'allow') {
      // Send the response to the correct task's CLI
      const message = parsedResponse.selectedOptions?.join(', ') || parsedResponse.message || 'yes';
      const sanitizedMessage = sanitizeString(message, 'permissionResponse', 1024);
      await taskManager.sendResponse(taskId, sanitizedMessage);
    } else {
      // Send denial to the correct task
      await taskManager.sendResponse(taskId, 'no');
    }
  });

  // Session: Resume (continue conversation)
  handle(
    'session:resume',
    async (
      event: IpcMainInvokeEvent,
      sessionId: string,
      prompt: string,
      existingTaskId?: string
    ) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedSessionId = sanitizeString(sessionId, 'sessionId', 128);
    const validatedPrompt = sanitizeString(prompt, 'prompt');
    const taskId = existingTaskId
      ? sanitizeString(existingTaskId, 'taskId', 128)
      : createTaskId();
    const forwardToRenderer = createForwardToRenderer(window, sender);
    const callbacks = createTaskCallbacksForTask(taskId, forwardToRenderer);

    // Start the task via TaskManager with sessionId for resume
    const task = await taskManager.startTask(taskId, {
      prompt: validatedPrompt,
      sessionId: validatedSessionId,
      taskId,
    }, callbacks);

    const initialUserMessage: TaskMessage = {
      id: createMessageId(),
      type: 'user',
      content: validatedPrompt,
      timestamp: new Date().toISOString(),
    };
    task.sessionId = validatedSessionId;

    if (existingTaskId) {
      addTaskMessage(taskId, initialUserMessage);
      updateTaskSessionId(taskId, validatedSessionId);
      updateTaskStatus(taskId, 'running', new Date().toISOString());
    } else {
      task.messages = [initialUserMessage];
      saveTask(task);
    }

    return task;
    }
  );

  handle('task:get', async (_event: IpcMainInvokeEvent, taskId: string) => {
    return getTask(sanitizeString(taskId, 'taskId', 128)) ?? null;
  });

  handle('task:list', async () => {
    return getTasks();
  });

  handle('task:delete', async (_event: IpcMainInvokeEvent, taskId: string) => {
    deleteTask(sanitizeString(taskId, 'taskId', 128));
  });

  handle('task:clear-history', async () => {
    clearHistory();
  });
}
