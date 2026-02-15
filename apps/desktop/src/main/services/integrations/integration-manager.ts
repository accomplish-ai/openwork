import { EventEmitter } from 'events';
import type { BrowserWindow } from 'electron';
import type {
  MessagingPlatformId,
  MessagingIntegrationConfig,
  MessagingProvider,
  IncomingMessage,
  OutgoingMessage,
  IntegrationConnectionStatus,
  QRCodeData,
  TunnelState,
} from './types';
import { WhatsAppProvider } from './whatsapp-provider';
import { TunnelService } from './tunnel-service';

export interface IntegrationSettings {
  integrations: Record<string, MessagingIntegrationConfig>;
  tunnelEnabled: boolean;
}

const DEFAULT_SETTINGS: IntegrationSettings = {
  integrations: {},
  tunnelEnabled: false,
};

export interface IntegrationTaskBridge {
  startTask(prompt: string, metadata: { platformId: string; senderId: string; senderName?: string }): Promise<{ taskId: string }>;
  getTaskStatus(taskId: string): Promise<{ status: string; summary?: string } | null>;
}

export class IntegrationManager extends EventEmitter {
  private providers: Map<MessagingPlatformId, MessagingProvider> = new Map();
  private tunnel: TunnelService;
  private settings: IntegrationSettings;
  private window: BrowserWindow | null = null;
  private taskBridge: IntegrationTaskBridge | null = null;
  private cleanupFunctions: Array<() => void> = [];
  private activeTaskMappings: Map<string, { platformId: MessagingPlatformId; senderId: string }> = new Map();

  constructor() {
    super();
    this.settings = { ...DEFAULT_SETTINGS };
    this.tunnel = new TunnelService();

    this.registerProvider(new WhatsAppProvider());

    this.tunnel.setMessageHandler((body) => this.handleTunnelMessage(body));
    this.tunnel.on('state-change', (state: TunnelState) => {
      this.forwardToRenderer('integration:tunnel-state', state);
    });
  }

  setWindow(window: BrowserWindow): void {
    this.window = window;
  }

  setTaskBridge(bridge: IntegrationTaskBridge): void {
    this.taskBridge = bridge;
  }

  registerProvider(provider: MessagingProvider): void {
    this.providers.set(provider.platformId, provider);

    const unsubStatus = provider.onStatusChange((status: IntegrationConnectionStatus, error?: string) => {
      this.forwardToRenderer('integration:status-change', {
        platformId: provider.platformId,
        status,
        error,
      });

      if (!this.settings.integrations[provider.platformId]) {
        this.settings.integrations[provider.platformId] = {
          platformId: provider.platformId,
          enabled: false,
          tunnelEnabled: false,
          connectionStatus: status,
        };
      } else {
        this.settings.integrations[provider.platformId].connectionStatus = status;
        if (error) this.settings.integrations[provider.platformId].lastError = error;
        if (status === 'connected') {
          this.settings.integrations[provider.platformId].connectedAt = new Date().toISOString();
        }
      }
    });
    this.cleanupFunctions.push(unsubStatus);

    if (provider.onQRCode) {
      const unsubQR = provider.onQRCode((qrData: QRCodeData) => {
        this.forwardToRenderer('integration:qr-code', {
          platformId: provider.platformId,
          qrData,
        });
      });
      this.cleanupFunctions.push(unsubQR);
    }

    const unsubMessage = provider.onMessage((message: IncomingMessage) => {
      this.handleIncomingMessage(message);
    });
    this.cleanupFunctions.push(unsubMessage);
  }

  async initialize(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.initialize();
    }
  }

  async connectIntegration(platformId: MessagingPlatformId): Promise<void> {
    const provider = this.providers.get(platformId);
    if (!provider) {
      throw new Error(`Unknown messaging platform: ${platformId}`);
    }
    await provider.connect();
  }

  async disconnectIntegration(platformId: MessagingPlatformId): Promise<void> {
    const provider = this.providers.get(platformId);
    if (!provider) {
      throw new Error(`Unknown messaging platform: ${platformId}`);
    }
    await provider.disconnect();
  }

  confirmWhatsAppPairing(phoneNumber?: string): void {
    const provider = this.providers.get('whatsapp') as WhatsAppProvider | undefined;
    if (provider) {
      provider.confirmPairing(phoneNumber);
    }
  }

  getIntegrationConfig(platformId: MessagingPlatformId): MessagingIntegrationConfig {
    return this.settings.integrations[platformId] || {
      platformId,
      enabled: false,
      tunnelEnabled: false,
      connectionStatus: 'disconnected',
    };
  }

  getAllIntegrationConfigs(): Record<string, MessagingIntegrationConfig> {
    const configs: Record<string, MessagingIntegrationConfig> = {};
    for (const [id, provider] of this.providers) {
      configs[id] = this.settings.integrations[id] || {
        platformId: id,
        enabled: false,
        tunnelEnabled: false,
        connectionStatus: provider.getStatus(),
      };
    }
    return configs;
  }

  setIntegrationEnabled(platformId: MessagingPlatformId, enabled: boolean): void {
    if (!this.settings.integrations[platformId]) {
      this.settings.integrations[platformId] = {
        platformId,
        enabled,
        tunnelEnabled: false,
        connectionStatus: 'disconnected',
      };
    } else {
      this.settings.integrations[platformId].enabled = enabled;
    }
  }

  async setTunnelEnabled(platformId: MessagingPlatformId, enabled: boolean): Promise<void> {
    if (!this.settings.integrations[platformId]) {
      this.settings.integrations[platformId] = {
        platformId,
        enabled: false,
        tunnelEnabled: enabled,
        connectionStatus: 'disconnected',
      };
    } else {
      this.settings.integrations[platformId].tunnelEnabled = enabled;
    }

    const anyTunnelEnabled = Object.values(this.settings.integrations)
      .some(config => config.tunnelEnabled && config.enabled);

    if (anyTunnelEnabled && !this.tunnel.getState().active) {
      await this.tunnel.start();
    } else if (!anyTunnelEnabled && this.tunnel.getState().active) {
      await this.tunnel.stop();
    }
  }

  getTunnelState(): TunnelState {
    return this.tunnel.getState();
  }

  getSupportedPlatforms(): Array<{ id: MessagingPlatformId; name: string; available: boolean }> {
    return [
      { id: 'whatsapp', name: 'WhatsApp', available: true },
      { id: 'slack', name: 'Slack', available: false },
      { id: 'teams', name: 'Microsoft Teams', available: false },
      { id: 'telegram', name: 'Telegram', available: false },
    ];
  }

  async sendTaskProgress(taskId: string, stage: string, message?: string, status: 'running' | 'completed' | 'failed' | 'waiting_permission' = 'running'): Promise<void> {
    const mapping = this.activeTaskMappings.get(taskId);
    if (!mapping) return;

    const provider = this.providers.get(mapping.platformId);
    if (!provider || provider.getStatus() !== 'connected') return;

    let richType: 'progress' | 'completion' | 'error' | 'permission_request' = 'progress';
    if (status === 'completed') richType = 'completion';
    else if (status === 'failed') richType = 'error';
    else if (status === 'waiting_permission') richType = 'permission_request';

    const outgoing: OutgoingMessage = {
      recipientId: mapping.senderId,
      text: message || stage,
      richContent: {
        type: richType,
        title: stage,
        body: message,
      },
    };

    await provider.sendMessage(outgoing);
  }

  async dispose(): Promise<void> {
    for (const cleanup of this.cleanupFunctions) {
      cleanup();
    }
    this.cleanupFunctions = [];

    for (const provider of this.providers.values()) {
      await provider.dispose();
    }
    this.providers.clear();

    await this.tunnel.stop();
    this.activeTaskMappings.clear();
  }

  private handleIncomingMessage(message: IncomingMessage): void {
    console.log(`[IntegrationManager] Incoming message from ${message.platformId}:${message.senderId}: ${message.text.substring(0, 100)}`);

    this.forwardToRenderer('integration:message', message);

    if (this.taskBridge) {
      this.taskBridge.startTask(message.text, {
        platformId: message.platformId,
        senderId: message.senderId,
        senderName: message.senderName,
      }).then(({ taskId }) => {
        this.activeTaskMappings.set(taskId, {
          platformId: message.platformId,
          senderId: message.senderId,
        });

        const provider = this.providers.get(message.platformId);
        if (provider && provider.getStatus() === 'connected') {
          provider.sendMessage({
            recipientId: message.senderId,
            text: `🚀 Task started! I'll keep you updated on the progress.`,
            richContent: {
              type: 'progress',
              title: 'Task Started',
              body: `Processing: "${message.text.substring(0, 100)}${message.text.length > 100 ? '...' : ''}"`,
            },
          }).catch(err => console.error('[IntegrationManager] Failed to send ack:', err));
        }
      }).catch(err => {
        console.error('[IntegrationManager] Failed to start task from message:', err);

        const provider = this.providers.get(message.platformId);
        if (provider && provider.getStatus() === 'connected') {
          provider.sendMessage({
            recipientId: message.senderId,
            text: `Failed to start task: ${err.message}`,
            richContent: {
              type: 'error',
              title: 'Task Failed to Start',
              body: err.message,
            },
          }).catch(sendErr => console.error('[IntegrationManager] Failed to send error:', sendErr));
        }
      });
    }
  }

  private handleTunnelMessage(body: unknown): void {
    if (!body || typeof body !== 'object') return;

    const msg = body as Record<string, unknown>;

    if (typeof msg.platformId !== 'string' || typeof msg.senderId !== 'string' || typeof msg.text !== 'string') {
      console.warn('[IntegrationManager] Invalid tunnel message format:', body);
      return;
    }

    const platformId = msg.platformId as MessagingPlatformId;
    const provider = this.providers.get(platformId);

    if (provider && 'handleIncomingMessage' in provider) {
      // Route through the provider
      (provider as WhatsAppProvider).handleIncomingMessage(
        msg.senderId as string,
        (msg.senderName as string) || 'Unknown',
        msg.text as string,
        msg,
      );
    }
  }

  private forwardToRenderer(channel: string, data: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data);
    }
  }
}

// Singleton instance
let _integrationManager: IntegrationManager | null = null;

export function getIntegrationManager(): IntegrationManager {
  if (!_integrationManager) {
    _integrationManager = new IntegrationManager();
  }
  return _integrationManager;
}

export function disposeIntegrationManager(): void {
  if (_integrationManager) {
    _integrationManager.dispose();
    _integrationManager = null;
  }
}
