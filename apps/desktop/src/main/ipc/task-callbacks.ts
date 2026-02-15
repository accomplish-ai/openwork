import type { BrowserWindow } from 'electron';
import type {
  TaskErrorDetails,
  TaskMessage,
  TaskResult,
  TaskStatus,
  TodoItem,
} from '@accomplish_ai/agent-core';
import { createMessageId, mapResultToStatus } from '@accomplish_ai/agent-core';
import { getTaskManager } from '../opencode';
import type { TaskCallbacks } from '../opencode';
import { getStorage } from '../store/storage';

export interface TaskCallbacksOptions {
  taskId: string;
  window: BrowserWindow;
  sender: Electron.WebContents;
}

export function createTaskCallbacks(options: TaskCallbacksOptions): TaskCallbacks {
  const { taskId, window, sender } = options;

  const storage = getStorage();
  const taskManager = getTaskManager();

  const forwardToRenderer = (channel: string, data: unknown) => {
    if (!window.isDestroyed() && !sender.isDestroyed()) {
      sender.send(channel, data);
    }
  };

  const appendFailureSystemMessage = (
    userMessage: string,
    errorDetails?: TaskErrorDetails
  ) => {
    const normalizedMessage = userMessage?.trim() || 'Task failed due to an unknown error.';
    const messagePrefix = /^task failed[:\s-]/i.test(normalizedMessage) ? '' : 'Task failed: ';
    const hints = (errorDetails?.actionHints || []).slice(0, 2);
    const hintLines = hints.length
      ? `\n\nNext steps:\n${hints.map((hint) => `- ${hint}`).join('\n')}`
      : '';

    const systemMessage: TaskMessage = {
      id: createMessageId(),
      type: 'system',
      content: `${messagePrefix}${normalizedMessage}${hintLines}`,
      timestamp: new Date().toISOString(),
    };

    storage.addTaskMessage(taskId, systemMessage);
    forwardToRenderer('task:update', {
      taskId,
      type: 'message',
      message: systemMessage,
    });
  };

  return {
    onBatchedMessages: (messages: TaskMessage[]) => {
      forwardToRenderer('task:update:batch', { taskId, messages });
      for (const msg of messages) {
        storage.addTaskMessage(taskId, msg);
      }
    },

    onProgress: (progress: { stage: string; message?: string }) => {
      forwardToRenderer('task:progress', {
        taskId,
        ...progress,
      });
    },

    onPermissionRequest: (request: unknown) => {
      forwardToRenderer('permission:request', request);
    },

    onComplete: (result: TaskResult) => {
      forwardToRenderer('task:update', {
        taskId,
        type: 'complete',
        result,
      });

      const taskStatus = mapResultToStatus(result);
      storage.updateTaskStatus(taskId, taskStatus, new Date().toISOString());

      const sessionId = result.sessionId || taskManager.getSessionId(taskId);
      if (sessionId) {
        storage.updateTaskSessionId(taskId, sessionId);
      }

      if (result.status === 'success') {
        storage.clearTodosForTask(taskId);
      } else if (result.status === 'error') {
        appendFailureSystemMessage(result.error || 'Task failed', result.errorDetails);
      }
    },

    onError: (error: Error) => {
      const errorDetails: TaskErrorDetails = {
        category: 'unknown',
        retryable: true,
        userMessage: error.message || 'Task failed due to an unknown error.',
        actionHints: [
          'Retry the task.',
          'Check logs for technical details if the issue persists.',
        ],
      };

      forwardToRenderer('task:update', {
        taskId,
        type: 'error',
        error: error.message,
        errorDetails,
      });

      storage.updateTaskStatus(taskId, 'failed', new Date().toISOString());
      appendFailureSystemMessage(errorDetails.userMessage, errorDetails);
    },

    onDebug: (log: { type: string; message: string; data?: unknown }) => {
      if (storage.getDebugMode()) {
        forwardToRenderer('debug:log', {
          taskId,
          timestamp: new Date().toISOString(),
          ...log,
        });
      }
    },

    onStatusChange: (status: TaskStatus) => {
      forwardToRenderer('task:status-change', {
        taskId,
        status,
      });
      storage.updateTaskStatus(taskId, status, new Date().toISOString());
    },

    onTodoUpdate: (todos: TodoItem[]) => {
      storage.saveTodosForTask(taskId, todos);
      forwardToRenderer('todo:update', { taskId, todos });
    },

    onAuthError: (error: { providerId: string; message: string }) => {
      forwardToRenderer('auth:error', error);
    },
  };
}
