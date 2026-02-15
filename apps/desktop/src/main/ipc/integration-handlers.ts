import { ipcMain, BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import {
  getIntegrationManager,
  type MessagingPlatformId,
} from '../services/integrations';
import { getStorage } from '../store/storage';
import { createTaskId, createMessageId } from '@accomplish_ai/agent-core';
import type { TaskConfig, TaskMessage } from '@accomplish_ai/agent-core';
import { getTaskManager } from '../opencode';
import { createTaskCallbacks } from './task-callbacks';
import { validateTaskConfig } from '@accomplish_ai/agent-core';

function handle<Args extends unknown[], R = unknown>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => R
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...(args as Args));
    } catch (error) {
      console.error(`IPC handler ${channel} failed`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });
}

export function registerIntegrationHandlers(): void {
  const manager = getIntegrationManager();

  manager.initialize().catch(err => {
    console.error('[Integrations] Failed to initialize:', err);
  });

  handle('integrations:get-platforms', async () => {
    return manager.getSupportedPlatforms();
  });

  handle('integrations:get-configs', async () => {
    return manager.getAllIntegrationConfigs();
  });

  handle('integrations:get-config', async (_event: IpcMainInvokeEvent, platformId: string) => {
    return manager.getIntegrationConfig(platformId as MessagingPlatformId);
  });

  handle('integrations:connect', async (event: IpcMainInvokeEvent, platformId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      manager.setWindow(window);
    }
    await manager.connectIntegration(platformId as MessagingPlatformId);
    return { status: 'connecting' };
  });

  handle('integrations:disconnect', async (_event: IpcMainInvokeEvent, platformId: string) => {
    await manager.disconnectIntegration(platformId as MessagingPlatformId);
    return { status: 'disconnected' };
  });

  handle('integrations:whatsapp:confirm-pairing', async (_event: IpcMainInvokeEvent, phoneNumber?: string) => {
    manager.confirmWhatsAppPairing(phoneNumber);
    return { status: 'connected' };
  });

  handle('integrations:set-enabled', async (_event: IpcMainInvokeEvent, platformId: string, enabled: boolean) => {
    manager.setIntegrationEnabled(platformId as MessagingPlatformId, enabled);
    return { enabled };
  });

  handle('integrations:set-tunnel-enabled', async (_event: IpcMainInvokeEvent, platformId: string, enabled: boolean) => {
    await manager.setTunnelEnabled(platformId as MessagingPlatformId, enabled);
    return { tunnelEnabled: enabled };
  });

  handle('integrations:get-tunnel-state', async () => {
    return manager.getTunnelState();
  });

  handle('integrations:setup-task-bridge', async (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('No window available');

    const sender = event.sender;
    const storage = getStorage();
    const taskManager = getTaskManager();

    manager.setWindow(window);

    manager.setTaskBridge({
      startTask: async (prompt: string, metadata: { platformId: string; senderId: string; senderName?: string }) => {
        const taskId = createTaskId();

        const config: TaskConfig = {
          prompt: `[From ${metadata.platformId}${metadata.senderName ? ` - ${metadata.senderName}` : ''}] ${prompt}`,
          taskId,
        };

        const validatedConfig = validateTaskConfig(config);

        const activeModel = storage.getActiveProviderModel();
        const selectedModel = activeModel || storage.getSelectedModel();
        if (selectedModel?.model) {
          validatedConfig.modelId = selectedModel.model;
        }

        const baseCallbacks = createTaskCallbacks({ taskId, window, sender });

        const integrationCallbacks = {
          ...baseCallbacks,
          onProgress: (progress: { stage: string; message?: string }) => {
            baseCallbacks.onProgress(progress);
            manager.sendTaskProgress(taskId, progress.stage, progress.message, 'running')
              .catch(err => console.error('[Integrations] Failed to send progress:', err));
          },
          onComplete: (result: { status: string; sessionId?: string; durationMs?: number; error?: string }) => {
            baseCallbacks.onComplete(result as any);
            const status = result.status === 'success' ? 'completed' : 'failed';
            manager.sendTaskProgress(
              taskId,
              status === 'completed' ? 'Task Completed' : 'Task Failed',
              result.error || (status === 'completed' ? 'Task completed successfully!' : undefined),
              status as 'completed' | 'failed',
            ).catch(err => console.error('[Integrations] Failed to send completion:', err));
          },
          onError: (error: Error) => {
            baseCallbacks.onError(error);
            manager.sendTaskProgress(taskId, 'Error', error.message, 'failed')
              .catch(err => console.error('[Integrations] Failed to send error:', err));
          },
          onStatusChange: (status: string) => {
            if (baseCallbacks.onStatusChange) {
              baseCallbacks.onStatusChange(status as any);
            }
            if (status === 'waiting_permission') {
              manager.sendTaskProgress(taskId, 'Permission Required', 'The task needs your permission to proceed.', 'waiting_permission')
                .catch(err => console.error('[Integrations] Failed to send permission request:', err));
            }
          },
        };

        const initialMessage: TaskMessage = {
          id: createMessageId(),
          type: 'user',
          content: validatedConfig.prompt,
          timestamp: new Date().toISOString(),
        };

        const task = await taskManager.startTask(taskId, validatedConfig, integrationCallbacks);
        storage.saveTask({
          ...task,
          messages: [initialMessage],
        });

        sender.send('task:update', {
          taskId,
          type: 'start',
          task: {
            ...task,
            messages: [initialMessage],
          },
        });

        return { taskId };
      },

      getTaskStatus: async (taskId: string) => {
        const storage = getStorage();
        const task = storage.getTask(taskId);
        if (!task) return null;
        return {
          status: task.status,
          summary: task.summary,
        };
      },
    });

    return { bridgeConfigured: true };
  });
}
