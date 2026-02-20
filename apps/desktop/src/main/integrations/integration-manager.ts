/**
 * Integration Manager – orchestrates messaging channel adapters.
 *
 * Manages the lifecycle of messaging integrations (WhatsApp, future Slack/Teams/Telegram).
 * When a message arrives from a channel:
 *   1. Normalises it via the adapter into InboundChannelMessage
 *   2. Dispatches it into Accomplish's task system (creates or resumes a task)
 *   3. Forwards progress events back through the adapter
 *
 * This is a singleton, initialised once from the IPC registration code.
 */

import path from 'path';
import fs from 'fs';
import { app, BrowserWindow } from 'electron';
import { WhatsAppAdapter } from '@accomplish_ai/agent-core';
import type { WhatsAppAdapterOptions } from '@accomplish_ai/agent-core';
import type {
  ChannelAdapter,
  ChannelType,
  ChannelStatus,
  InboundChannelMessage,
  IntegrationConfig,
  IntegrationSettings,
} from '@accomplish_ai/agent-core/common';
import { getStorage } from '../store/storage';
import { getTaskManager } from '../opencode';
import { createTaskId, createMessageId } from '@accomplish_ai/agent-core';
import { createTaskCallbacks } from '../ipc/task-callbacks';
import type { TaskMessage } from '@accomplish_ai/agent-core';

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: IntegrationManager | null = null;

export function getIntegrationManager(): IntegrationManager {
  if (!instance) {
    instance = new IntegrationManager();
  }
  return instance;
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export class IntegrationManager {
  /** Registered adapters keyed by channel type */
  private adapters = new Map<ChannelType, ChannelAdapter>();

  /** Persisted config per channel */
  private configs: IntegrationSettings = {};

  /** The main BrowserWindow so we can send IPC events to the renderer */
  private mainWindow: BrowserWindow | null = null;

  /** Path to the JSON file that persists integration settings */
  private get settingsPath(): string {
    return path.join(app.getPath('userData'), 'integration-settings.json');
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Call once after the main window is created */
  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.loadSettings();
  }

  /** Load persisted settings from JSON file */
  private loadSettings(): void {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        this.configs = JSON.parse(data) as IntegrationSettings;
      }
    } catch {
      this.configs = {};
    }
  }

  /** Persist current configs to JSON file */
  private persist(): void {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.configs, null, 2), 'utf-8');
    } catch (err) {
      console.error('[IntegrationManager] Failed to persist settings:', err);
    }
  }

  // -----------------------------------------------------------------------
  // WhatsApp helpers
  // -----------------------------------------------------------------------

  private getOrCreateWhatsAppAdapter(): WhatsAppAdapter {
    let adapter = this.adapters.get('whatsapp');
    if (!adapter) {
      const authDir = path.join(app.getPath('userData'), 'whatsapp-auth');
      const options: WhatsAppAdapterOptions = { authDir };
      adapter = new WhatsAppAdapter(options);

      // Wire up message handler → task dispatch
      adapter.onMessage((msg: InboundChannelMessage) => {
        void this.dispatchInboundMessage(msg);
      });

      this.adapters.set('whatsapp', adapter);
    }
    return adapter as WhatsAppAdapter;
  }

  // -----------------------------------------------------------------------
  // Public API (called from IPC handlers)
  // -----------------------------------------------------------------------

  async connectWhatsApp(): Promise<void> {
    const adapter = this.getOrCreateWhatsAppAdapter();
    await adapter.connect();

    this.configs.whatsapp = {
      ...(this.configs.whatsapp ?? {
        channelType: 'whatsapp',
        enabled: true,
        tunnelEnabled: false,
      }),
      enabled: true,
    };
    this.persist();
  }

  async disconnectWhatsApp(): Promise<void> {
    const adapter = this.adapters.get('whatsapp');
    if (adapter) {
      await adapter.disconnect();
    }

    if (this.configs.whatsapp) {
      this.configs.whatsapp.enabled = false;
      this.persist();
    }
  }

  getWhatsAppStatus(): {
    status: ChannelStatus;
    qrCode: string | null;
    config: IntegrationConfig | null;
  } {
    const adapter = this.adapters.get('whatsapp') as WhatsAppAdapter | undefined;
    return {
      status: adapter?.getStatus() ?? 'disconnected',
      qrCode: adapter?.getQrCode?.() ?? null,
      config: this.configs.whatsapp ?? null,
    };
  }

  /** Register a QR code listener – forwards to renderer via IPC */
  subscribeQrCode(callback: (qr: string) => void): void {
    const adapter = this.getOrCreateWhatsAppAdapter();
    adapter.onQrCode?.(callback);
  }

  /** Register a status change listener – forwards to renderer via IPC */
  subscribeStatusChange(callback: (status: ChannelStatus) => void): void {
    const adapter = this.getOrCreateWhatsAppAdapter();
    adapter.onStatusChange?.(callback);
  }

  setTunnelEnabled(channelType: ChannelType, enabled: boolean): void {
    const config: IntegrationConfig = this.configs[channelType] ?? {
      channelType,
      enabled: false,
      tunnelEnabled: false,
    };
    config.tunnelEnabled = enabled;
    this.configs[channelType] = config;
    this.persist();

    if (enabled) {
      void this.openTunnel(channelType);
    } else {
      void this.closeTunnel(channelType);
    }
  }

  getIntegrationSettings(): IntegrationSettings {
    return { ...this.configs };
  }

  // -----------------------------------------------------------------------
  // Task dispatch
  // -----------------------------------------------------------------------

  /**
   * When a normalised message arrives from any channel, create a task
   * in the actual UI and forward progress events back through the adapter.
   */
  private async dispatchInboundMessage(msg: InboundChannelMessage): Promise<void> {
    const adapter = this.adapters.get(msg.channelType);
    if (!adapter) {
      return;
    }

    const taskManager = getTaskManager();
    const taskId = createTaskId();
    const window = this.mainWindow;

    if (!window || window.isDestroyed()) {
      return;
    }

    // Notify the renderer that a new task is being created from a channel
    window.webContents.send('integration:task-created', {
      taskId,
      channelType: msg.channelType,
      channelId: msg.channelId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      prompt: msg.text,
    });

    // Send initial progress back to the user on their platform
    await adapter.sendProgress({
      channelId: msg.channelId,
      senderId: msg.senderId,
      text: `Task started: "${msg.text.slice(0, 80)}${msg.text.length > 80 ? '…' : ''}"`,
      phase: 'starting',
      taskId,
    });

    const callbacks = createTaskCallbacks({
      taskId,
      window,
      sender: window.webContents,
    });

    // Wrap callbacks to also forward progress to the channel
    const originalOnProgress = callbacks.onProgress;
    callbacks.onProgress = (progress) => {
      originalOnProgress?.(progress);

      void adapter.sendProgress({
        channelId: msg.channelId,
        senderId: msg.senderId,
        text: progress.message ?? progress.stage ?? 'Working...',
        phase: 'in-progress',
        taskId,
      });
    };

    const originalOnComplete = callbacks.onComplete;
    callbacks.onComplete = (result) => {
      originalOnComplete?.(result);

      void adapter.sendProgress({
        channelId: msg.channelId,
        senderId: msg.senderId,
        text: `Task completed! (${result.status})`,
        phase: 'completed',
        taskId,
      });
    };

    const originalOnError = callbacks.onError;
    callbacks.onError = (error) => {
      originalOnError?.(error);

      void adapter.sendProgress({
        channelId: msg.channelId,
        senderId: msg.senderId,
        text: `Task failed: ${error instanceof Error ? error.message : String(error)}`,
        phase: 'failed',
        taskId,
      });
    };

    // Create the initial user message
    const initialUserMessage: TaskMessage = {
      id: createMessageId(),
      type: 'user',
      content: msg.text,
      timestamp: new Date().toISOString(),
    };

    const storage = getStorage();
    const activeModel = storage.getActiveProviderModel();

    const config = { prompt: msg.text, modelId: activeModel?.model };

    try {
      const task = await taskManager.startTask(taskId, config, callbacks);
      storage.saveTask(task);
      storage.addTaskMessage(taskId, initialUserMessage);
    } catch (err) {
      console.error('[IntegrationManager] Failed to start task from channel message:', err);

      await adapter.sendProgress({
        channelId: msg.channelId,
        senderId: msg.senderId,
        text: `Failed to start task: ${err instanceof Error ? err.message : String(err)}`,
        phase: 'failed',
        taskId,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Tunnel (placeholder – see tunnel.ts for full implementation)
  // -----------------------------------------------------------------------

  private async openTunnel(_channelType: ChannelType): Promise<void> {
    // TODO: Implement WebSocket tunnel to relay service.
    // This would open an outbound WS connection so remote messages can
    // reach the local machine without opening inbound ports.
    console.log(
      `[IntegrationManager] Tunnel open requested for ${_channelType} (not yet implemented)`,
    );
  }

  private async closeTunnel(_channelType: ChannelType): Promise<void> {
    console.log(
      `[IntegrationManager] Tunnel close requested for ${_channelType} (not yet implemented)`,
    );
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  async dispose(): Promise<void> {
    for (const [, adapter] of this.adapters) {
      await adapter.disconnect();
    }
    this.adapters.clear();
    instance = null;
  }
}
