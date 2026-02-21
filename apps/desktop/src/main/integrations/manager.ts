import crypto from 'crypto';
import { EventEmitter } from 'events';
import { getIntegrationsStore } from '../store/integrations';
import {
  IntegrationPlatform,
  IntegrationStatus,
  type IntegrationProvider,
  type IntegrationConfig,
  type QRCodeData,
  type TunnelConfig,
  type IncomingMessage,
  type TaskProgressEvent,
  type IIntegrationManager,
} from './types';
import { WhatsAppProvider } from './providers/whatsapp';
import { handleIncomingIntegrationMessage } from './message-handler';
import { getTunnelServer } from '../tunnel/tunnel-service';

// Centralized integration manager handling lifecycle and message routing
export class IntegrationManager extends EventEmitter implements IIntegrationManager {
  private providers = new Map<IntegrationPlatform, IntegrationProvider>();
  private configurations = new Map<IntegrationPlatform, IntegrationConfig>();
  private tunnelMap = new Map<string, IntegrationPlatform>();
  private messageHandlers = new Map<string, (message: IncomingMessage) => Promise<void>>();
  private initialized = false;
  private tunnelServerInitialized = false;

  constructor() {
    super();
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Register available integrations for extensibility
    this.providers.set(IntegrationPlatform.WHATSAPP, new WhatsAppProvider());

    // TODO: Add additional providers as implemented
    // this.providers.set(IntegrationPlatform.SLACK, new SlackProvider());
    // this.providers.set(IntegrationPlatform.TEAMS, new TeamsProvider());
    // this.providers.set(IntegrationPlatform.TELEGRAM, new TelegramProvider());
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize tunnel server for WebSocket communication
      if (!this.tunnelServerInitialized) {
        const tunnelServer = getTunnelServer(3000);
        try {
          await tunnelServer.start();
          this.tunnelServerInitialized = true;

          // Wire tunnel HTTP messages to the integration message handler
          tunnelServer.setMessageHandler(async (body: unknown) => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const msg = body as any;
              const platform = msg.platform;
              const validPlatforms = Object.values(IntegrationPlatform);
              if (!platform || !validPlatforms.includes(platform)) {
                console.warn(
                  '[IntegrationManager] Dropping tunnel message with invalid platform:',
                  platform,
                );
                return;
              }
              await handleIncomingIntegrationMessage({
                id: msg.id || `tunnel-${Date.now()}`,
                platform,
                content: msg.content || msg.text || '',
                senderId: msg.senderId || 'unknown',
                receivedAt: msg.receivedAt || Date.now(),
                tunnelId: msg.tunnelId || '',
              });
            } catch (error) {
              console.error('[IntegrationManager] Failed to handle tunnel message:', error);
            }
          });
        } catch (error) {
          console.error('[IntegrationManager] Failed to start tunnel server:', error);
          // Don't fail initialization if tunnel server fails, it can be retried
        }
      }

      const store = getIntegrationsStore();
      const savedConfigs = store.getAll();
      const platformsToReconnect: IntegrationPlatform[] = [];

      for (const config of savedConfigs) {
        const provider = this.providers.get(config.platform);
        if (!provider) {
          continue;
        }

        // Remember if this platform was connected in the previous session
        const wasConnected = config.status === IntegrationStatus.CONNECTED;

        // Reset status — the provider is not actually connected at startup
        config.status = IntegrationStatus.DISCONNECTED;

        // Restore provider state from storage
        await provider.initialize(config);
        this.configurations.set(config.platform, config);

        // Setup event listeners for provider
        this.setupProviderListeners(provider);

        if (wasConnected) {
          platformsToReconnect.push(config.platform);
        }
      }

      // Persist the reset status so the store reflects reality
      for (const config of this.configurations.values()) {
        this.saveConfiguration(config.platform, config);
      }

      this.initialized = true;
      this.emit('initialized');

      // Auto-reconnect previously connected platforms in the background
      // WhatsApp Web session is persisted via Electron's partition, so
      // re-opening the window will auto-login without requiring QR scan.
      for (const platform of platformsToReconnect) {
        this.autoReconnect(platform).catch((err) => {
          console.warn(`[IntegrationManager] Auto-reconnect failed for ${platform}:`, err);
        });
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private setupProviderListeners(provider: IntegrationProvider): void {
    provider.on('connected', () => {
      const config = this.configurations.get(provider.platform);
      if (config) {
        config.status = IntegrationStatus.CONNECTED;
        this.saveConfiguration(provider.platform, config);
        this.emit('integration-connected', provider.platform);
      }
    });

    provider.on('disconnected', () => {
      const config = this.configurations.get(provider.platform);
      if (config) {
        config.status = IntegrationStatus.DISCONNECTED;
        this.saveConfiguration(provider.platform, config);
        this.emit('integration-disconnected', provider.platform);
      }
    });

    provider.on('error', (error: Error) => {
      this.emit('provider-error', { platform: provider.platform, error });
    });

    provider.on('qr', (data: QRCodeData) => {
      this.emit('qr-update', { platform: provider.platform, data });
    });

    provider.on('tunnel-established', (tunnel: TunnelConfig) => {
      this.tunnelMap.set(tunnel.tunnelId, provider.platform);
      this.emit('tunnel-established', tunnel);
    });

    // Setup message handler for incoming messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider.onMessage(async (message: any) => {
      try {
        await handleIncomingIntegrationMessage({
          id: message.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          platform: provider.platform as any,
          content: message.text,
          senderId: message.senderId,
          receivedAt: message.timestamp,
          tunnelId: '',
        });
      } catch (error) {
        console.error(`[IntegrationManager] Failed to handle message:`, error);
      }
    });
  }

  /**
   * Auto-reconnect a previously connected platform.
   * Opens the provider window hidden/off-screen. If the stored session is
   * still valid the connection polling will detect it and transition to
   * CONNECTED automatically. If the session expired (QR needed) the window
   * is shown after a timeout so the user can re-scan.
   */
  private async autoReconnect(platform: IntegrationPlatform): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = this.providers.get(platform) as any; // cast to access reconnect()
    if (!provider) {
      return;
    }

    // Mark the config as CONNECTING so the renderer shows the right state
    const config = this.configurations.get(platform);
    if (config) {
      config.status = IntegrationStatus.CONNECTING;
      // Don't persist CONNECTING — it's a transient state
    }

    // Use a dedicated reconnect() method if the provider supports it,
    // which opens the window off-screen instead of visible.
    if (typeof provider.reconnect === 'function') {
      await provider.reconnect();
    }
  }

  getIntegrations(): IntegrationConfig[] {
    return Array.from(this.configurations.values());
  }

  async connect(platform: IntegrationPlatform): Promise<QRCodeData> {
    const provider = this.providers.get(platform);
    if (!provider) {
      throw new Error(`Platform ${platform} not supported`);
    }

    try {
      // Initialize provider with default config if not already initialized
      const existingConfig = this.configurations.get(platform);
      if (!existingConfig) {
        const defaultConfig: IntegrationConfig = {
          platform,
          tunnelEnabled: false,
          status: IntegrationStatus.DISCONNECTED,
        };
        await provider.initialize(defaultConfig);
        // Setup event listeners so manager receives QR, connected, disconnected events
        this.setupProviderListeners(provider);
      }

      // Generate session token for QR code pairing
      const sessionToken = crypto.randomBytes(32).toString('hex');

      // Get QR code from provider
      const qrCode = await provider.generateQRCode(sessionToken);

      // Create pending configuration
      const config: IntegrationConfig = {
        platform,
        tunnelEnabled: false,
        status: IntegrationStatus.CONNECTING,
      };

      this.configurations.set(platform, config);
      this.emit('connection-initiated', { platform, sessionToken });

      return qrCode;
    } catch (error) {
      throw new Error(
        `Failed to initiate ${platform} connection: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async disconnect(platform: IntegrationPlatform): Promise<void> {
    const provider = this.providers.get(platform);
    const config = this.configurations.get(platform);

    if (!provider || !config) {
      throw new Error(`No active ${platform} integration`);
    }

    try {
      await provider.disconnect();

      // Remove configuration and tunnel mappings
      this.configurations.delete(platform);
      const tunnelsToRemove = Array.from(this.tunnelMap.entries())
        .filter(([, p]) => p === platform)
        .map(([tunnelId]) => tunnelId);

      for (const tunnelId of tunnelsToRemove) {
        this.tunnelMap.delete(tunnelId);
      }

      this.saveConfiguration(platform, undefined);
    } catch (error) {
      throw new Error(
        `Failed to disconnect ${platform}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getStatus(platform: IntegrationPlatform): IntegrationStatus {
    const config = this.configurations.get(platform);
    return config?.status || IntegrationStatus.DISCONNECTED;
  }

  async setupTunnel(platform: IntegrationPlatform): Promise<TunnelConfig> {
    const provider = this.providers.get(platform);
    const config = this.configurations.get(platform);

    if (!provider || !config) {
      throw new Error(`No active ${platform} integration`);
    }

    if (config.status !== IntegrationStatus.CONNECTED) {
      throw new Error(`${platform} is not connected`);
    }

    // Lazy-start tunnel server if it failed during initial initialize()
    if (!this.tunnelServerInitialized) {
      const tunnelServer = getTunnelServer(3000);
      await tunnelServer.start();
      this.tunnelServerInitialized = true;
    }

    try {
      const tunnelId = crypto.randomBytes(16).toString('hex');
      const tunnel = await provider.setupTunnel(tunnelId);

      // Enable tunnel mode in configuration
      config.tunnelEnabled = true;
      config.connectedDeviceId = tunnel.deviceId;
      this.saveConfiguration(platform, config);

      return tunnel;
    } catch (error) {
      throw new Error(
        `Failed to setup ${platform} tunnel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    // Route to registered handler, or fall back to the default handler
    const handler = this.messageHandlers.get(message.platform) ?? handleIncomingIntegrationMessage;

    try {
      await handler(message);
      this.emit('message-processed', message);
    } catch (error) {
      this.emit('message-error', {
        message,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  async sendTaskProgress(platform: IntegrationPlatform, event: TaskProgressEvent): Promise<void> {
    const config = this.configurations.get(platform);
    if (!config || !config.tunnelEnabled) {
      throw new Error(`${platform} tunnel not enabled`);
    }

    const provider = this.providers.get(platform);
    if (!provider) {
      throw new Error(`Provider for ${platform} not found`);
    }

    try {
      // Find tunnel for this platform
      const tunnelId = Array.from(this.tunnelMap.entries()).find(([, p]) => p === platform)?.[0];

      if (!tunnelId) {
        throw new Error(`No active tunnel for ${platform}`);
      }

      await provider.sendProgressUpdate(tunnelId, event);
    } catch (error) {
      throw new Error(
        `Failed to send progress to ${platform}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Register handler for incoming messages from specific platform
  registerMessageHandler(
    platform: IntegrationPlatform,
    handler: (message: IncomingMessage) => Promise<void>,
  ): void {
    this.messageHandlers.set(platform, handler);
  }

  private saveConfiguration(platform: IntegrationPlatform, config?: IntegrationConfig): void {
    try {
      const store = getIntegrationsStore();
      if (config) {
        store.update(config);
      } else {
        store.delete(platform);
      }
    } catch (error) {
      console.error(`Failed to save ${platform} configuration:`, error);
    }
  }

  // Cleanup on application shutdown
  async cleanup(): Promise<void> {
    try {
      const cleanupPromises = Array.from(this.providers.values()).map((provider) =>
        provider.cleanup().catch((error) => {
          console.error(
            `Provider cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }),
      );

      await Promise.all(cleanupPromises);
      this.removeAllListeners();
      this.messageHandlers.clear();
      this.tunnelMap.clear();
      this.configurations.clear();
    } catch (error) {
      console.error('Integration manager cleanup error:', error);
    }
  }
}

// Singleton instance for application-wide use
let integrationManagerInstance: IntegrationManager | null = null;

export function getIntegrationManager(): IntegrationManager {
  if (!integrationManagerInstance) {
    integrationManagerInstance = new IntegrationManager();
  }
  return integrationManagerInstance;
}

export function resetIntegrationManager(): void {
  integrationManagerInstance = null;
}
