import { BrowserWindow } from 'electron';
import type { IncomingMessage, TaskProgressEvent } from './types';
import { getIntegrationManager } from './manager';
import { getTaskManager } from '../opencode';
import type { TaskConfig, TaskMessage } from '@accomplish_ai/agent-core';
import { createTaskId, createMessageId, validateTaskConfig } from '@accomplish_ai/agent-core';
import { createTaskCallbacks } from '../ipc/task-callbacks';
import { getStorage } from '../store/storage';

// Active task tracking — prevent overload from rapid @accomplish messages
const activeTasks = new Map<string, { prompt: string; startedAt: number }>();
const MAX_CONCURRENT_TASKS = 3;

/**
 * Get the main Accomplish BrowserWindow.
 * We pick the first non-WhatsApp window (WhatsApp has partition 'persist:whatsapp').
 */
function getMainBrowserWindow(): BrowserWindow | null {
  const allWindows = BrowserWindow.getAllWindows();
  return (
    allWindows.find((w) => {
      try {
        // The main app window uses default session, WhatsApp uses persist:whatsapp
        return !w.isDestroyed() && !w.webContents.session.storagePath?.includes('whatsapp');
      } catch {
        return false;
      }
    }) ||
    allWindows.find((w) => !w.isDestroyed()) ||
    null
  );
}

// Event handler for processing incoming messages from messaging platform tunnels
// Routes messages to task creation and manages progress updates back to platform
export async function handleIncomingIntegrationMessage(message: IncomingMessage): Promise<void> {
  try {
    const manager = getIntegrationManager();
    const taskManager = getTaskManager();
    const storage = getStorage();

    // Parse task command from incoming message
    const taskConfig = parseMessageContentToTask(message.content);
    if (!taskConfig?.prompt) {
      // Message received but not a valid task command - acknowledge only
      trySendTunnelProgress(manager, message.platform, {
        taskId: `ack-${message.id}`,
        status: 'completed',
        message: 'Message received (no @accomplish trigger found)',
        timestamp: Date.now(),
      });
      return;
    }

    // Check concurrent task limit
    const now = Date.now();
    for (const [id, info] of activeTasks) {
      if (now - info.startedAt > 10 * 60 * 1000) {
        activeTasks.delete(id);
      }
    }
    if (activeTasks.size >= MAX_CONCURRENT_TASKS) {
      console.warn(
        `[MessageHandler] Rejecting task — ${activeTasks.size} tasks already active (max ${MAX_CONCURRENT_TASKS})`,
      );
      trySendTunnelProgress(manager, message.platform, {
        taskId: `reject-${Date.now()}`,
        status: 'error',
        message: `Too many tasks running (${activeTasks.size}/${MAX_CONCURRENT_TASKS}). Please wait.`,
        timestamp: Date.now(),
      });
      return;
    }

    // Ensure a provider/model is configured
    if (!storage.hasReadyProvider()) {
      console.error('[MessageHandler] No provider ready — cannot start task');
      trySendTunnelProgress(manager, message.platform, {
        taskId: `err-${Date.now()}`,
        status: 'error',
        message:
          'No AI provider configured. Please open Accomplish and set up a provider in Settings.',
        timestamp: Date.now(),
      });
      return;
    }

    // Create task from remote command
    const taskId = createTaskId();
    activeTasks.set(taskId, { prompt: taskConfig.prompt, startedAt: Date.now() });

    const validatedConfig = validateTaskConfig({
      prompt: taskConfig.prompt,
      ...taskConfig,
    } as TaskConfig);

    // Attach model configuration from settings
    const activeModel = storage.getActiveProviderModel();
    const selectedModel = activeModel || storage.getSelectedModel();
    if (selectedModel?.model) {
      validatedConfig.modelId = selectedModel.model;
    }

    // Get the main Accomplish window to forward UI updates
    const mainWindow = getMainBrowserWindow();
    if (!mainWindow) {
      console.error('[MessageHandler] No Accomplish window found — task will run headlessly');
    }

    // Build callbacks that forward to BOTH the UI and the WhatsApp tunnel
    const uiCallbacks = mainWindow
      ? createTaskCallbacks({ taskId, window: mainWindow, sender: mainWindow.webContents })
      : null;

    // Helper to relay progress to WhatsApp tunnel (best-effort, non-fatal)
    const tunnelProgress = (event: TaskProgressEvent) => {
      trySendTunnelProgress(manager, message.platform, event);
    };

    try {
      const task = await taskManager.startTask(taskId, validatedConfig, {
        onBatchedMessages: (messages) => {
          // Forward to UI
          uiCallbacks?.onBatchedMessages?.(messages);
          // Relay to WhatsApp tunnel
          const text = messages.map((m) => m.content).join('\n');
          if (text.length > 0) {
            tunnelProgress({
              taskId,
              status: 'progress',
              message: text.length > 500 ? text.substring(0, 500) + '...' : text,
              timestamp: Date.now(),
            });
          }
        },

        onStatusChange: (status) => {
          uiCallbacks?.onStatusChange?.(status);

          const statusMap: Record<string, string> = { completed: 'completed', failed: 'error' };
          tunnelProgress({
            taskId,
            status: statusMap[status] ?? 'progress',
            message: `Task status: ${status}`,
            timestamp: Date.now(),
          });
        },

        onProgress: (progress) => {
          uiCallbacks?.onProgress(progress);
          tunnelProgress({
            taskId,
            status: 'progress',
            message: progress.message || `Processing: ${progress.stage}`,
            timestamp: Date.now(),
          });
        },

        onPermissionRequest: async (request) => {
          // Forward to UI so user can respond in the app
          uiCallbacks?.onPermissionRequest(request);
          // Also notify on WhatsApp
          tunnelProgress({
            taskId,
            status: 'progress',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            message: `⚠️ Permission needed: ${(request as any).type || 'unknown'}. Please approve in the Accomplish app.`,
            timestamp: Date.now(),
          });
        },

        onComplete: (result) => {
          activeTasks.delete(taskId);
          uiCallbacks?.onComplete(result);
          tunnelProgress({
            taskId,
            status: 'completed',
            message:
              result.status === 'success'
                ? '✅ Task completed successfully'
                : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  `Task ${result.status}: ${(result as any).error || 'Unknown error'}`,
            timestamp: Date.now(),
          });
        },

        onError: (error) => {
          activeTasks.delete(taskId);
          uiCallbacks?.onError(error);
          tunnelProgress({
            taskId,
            status: 'error',
            message: `❌ Error: ${error.message}`,
            timestamp: Date.now(),
          });
        },

        onDebug: (log) => {
          uiCallbacks?.onDebug?.(log);
        },

        onTodoUpdate: (todos) => {
          uiCallbacks?.onTodoUpdate?.(todos);
        },

        onAuthError: (error) => {
          uiCallbacks?.onAuthError?.(error);
        },
      });

      // Save task to storage so it appears in the UI task list
      const initialUserMessage: TaskMessage = {
        id: createMessageId(),
        type: 'user',
        content: validatedConfig.prompt,
        timestamp: new Date().toISOString(),
      };
      task.messages = [initialUserMessage];
      storage.saveTask(task);

      // Notify sender on WhatsApp
      tunnelProgress({
        taskId,
        status: 'progress',
        message: `🚀 Task started: ${validatedConfig.prompt}\nTask ID: ${taskId}`,
        timestamp: Date.now(),
      });

      // Notify the UI to navigate to the new task
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('task:created-from-integration', {
          taskId,
          prompt: validatedConfig.prompt,
        });
      }
    } catch (error) {
      activeTasks.delete(taskId);
      const errorMsg = error instanceof Error ? error.message : 'Task failed to start';
      console.error(`[MessageHandler] Task ${taskId} failed to start:`, errorMsg);

      tunnelProgress({
        taskId,
        status: 'error',
        message: `❌ Failed to start task: ${errorMsg}`,
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error('[MessageHandler] Fatal error handling integration message:', error);
  }
}

/**
 * Best-effort send progress to the WhatsApp tunnel. Never throws.
 */
function trySendTunnelProgress(
  manager: ReturnType<typeof getIntegrationManager>,
  platform: string,
  event: TaskProgressEvent,
): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    manager.sendTaskProgress(platform as any, event).catch((err) => {
      console.warn('[MessageHandler] Tunnel progress send failed (non-fatal):', err.message || err);
    });
  } catch (err) {
    console.warn(
      '[MessageHandler] Tunnel progress send failed (non-fatal):',
      (err as Error).message || err,
    );
  }
}

// Parse incoming message content to extract task configuration
// Supports formats:
//   "@accomplish list files"        (WhatsApp sidebar trigger)
//   "task: list files"              (legacy format)
//   "You: @accomplish list files"   (self-message with "You:" prefix)
function parseMessageContentToTask(content: string): Partial<TaskConfig> | null {
  // Trim whitespace
  let trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  // Aggressively strip all non-printable, zero-width, and formatting Unicode characters
  // Also strip guillemets, smart quotes, bidi marks, and other common wrapping chars
  function stripFormatting(s: string): string {
    return (
      s
        // Zero-width and bidi control characters
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
        // Leading/trailing quotation marks (all varieties)
        .replace(/^[^\w@\s]*(?=[@\w])/, '') // strip non-word chars before first @ or word char
        .replace(/[^\w\s.!?]*$/, '') // strip non-word chars at end (keep punctuation)
        .trim()
    );
  }

  trimmed = stripFormatting(trimmed);

  // WhatsApp sidebar previews for self-messages may show "You: @accomplish ..."
  // or "📷 You: @accomplish ..." — strip common prefixes
  trimmed = trimmed.replace(/^(📷\s*)?You:\s*/i, '');

  // Support "@accomplish <task>" trigger
  const atIdx = trimmed.toLowerCase().indexOf('@accomplish');
  if (atIdx !== -1) {
    let prompt = trimmed.substring(atIdx + '@accomplish'.length).trim();
    // Strip any remaining non-printable or formatting chars from end of prompt
    prompt = stripFormatting(prompt);
    if (prompt.length === 0) {
      return null;
    }
    return { prompt };
  }

  // Legacy "task:" prefix
  if (trimmed.toLowerCase().startsWith('task:')) {
    const prompt = trimmed.substring(5).trim();
    if (prompt.length === 0) {
      return null;
    }
    return { prompt };
  }

  // No recognized trigger prefix — ignore the message
  return null;
}
