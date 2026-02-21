import { EventEmitter } from 'events';
import crypto from 'crypto';
import type {
  IntegrationProvider,
  QRCodeData,
  TunnelConfig,
  IntegrationConfig,
  TaskProgressEvent,
} from '../types';
import { IntegrationPlatform, IntegrationStatus } from '../types';
import { getTunnelServer } from '../../tunnel/tunnel-service';

/**
 * Slack integration provider for remote task triggering
 * Supports OAuth2 authentication and WebSocket tunneling
 */
export class SlackProvider extends EventEmitter implements IntegrationProvider {
  platform = IntegrationPlatform.SLACK;
  status: IntegrationStatus = IntegrationStatus.DISCONNECTED;
  private config?: IntegrationConfig;
  private activeConnections = new Map<string, TunnelConfig>();
  private qrCodeSessions = new Map<string, { token: string; expiresAt: number }>();

  async initialize(config: IntegrationConfig): Promise<void> {
    try {
      this.config = config;
      this.status = IntegrationStatus.CONNECTING;

      // Validate stored credentials if available
      if (config.credentials?.accessToken) {
        const isValid = await this.verifySlackCredentials(config.credentials.accessToken);
        if (isValid) {
          this.status = IntegrationStatus.CONNECTED;
          this.emit('connected');
          return;
        }
      }

      this.status = IntegrationStatus.DISCONNECTED;
    } catch (error) {
      this.status = IntegrationStatus.ERROR;
      this.emit('error', error);
      throw error;
    }
  }

  async generateQRCode(sessionToken: string): Promise<QRCodeData> {
    try {
      const expiresAt = Date.now() + 5 * 60 * 1000;

      // For Slack, QR typically contains OAuth URL
      // Format: https://slack.com/oauth_authorize?...
      const _tunnelId = crypto.randomBytes(16).toString('hex');
      const _deviceToken = crypto.randomBytes(32).toString('hex');

      this.qrCodeSessions.set(sessionToken, { token: sessionToken, expiresAt });

      // generate QR with actual Slack OAuth URL
      // For now: placeholder implementation
      const imageData =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

      return {
        imageData,
        sessionToken,
        expiresAt,
      };
    } catch (error) {
      this.emit('error', error);
      throw new Error(
        `Failed to generate Slack QR code: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async setupTunnel(tunnelId: string): Promise<TunnelConfig> {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const deviceId = crypto.randomBytes(16).toString('hex');

      const tunnelConfig: TunnelConfig = {
        tunnelId,
        platform: this.platform,
        endpoint: `http://localhost:3000/slack/${tunnelId}`,
        token,
        deviceId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      this.activeConnections.set(tunnelId, tunnelConfig);
      const tunnelServer = getTunnelServer();
      tunnelServer.registerTunnel(tunnelId, this.platform, deviceId);

      this.emit('tunnel-established', tunnelConfig);
      return tunnelConfig;
    } catch (error) {
      this.emit('error', error);
      throw new Error(
        `Failed to setup Slack tunnel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async verifyTunnel(tunnelId: string): Promise<boolean> {
    try {
      const tunnel = this.activeConnections.get(tunnelId);
      if (!tunnel) {
        return false;
      }
      return tunnel.expiresAt >= Date.now();
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  async sendProgressUpdate(tunnelId: string, event: TaskProgressEvent): Promise<void> {
    try {
      const tunnel = this.activeConnections.get(tunnelId);
      if (!tunnel) {
        throw new Error(`Tunnel ${tunnelId} not found`);
      }

      const tunnelServer = getTunnelServer();
      await tunnelServer.sendProgressUpdate(tunnelId, event);

      this.emit('message-sent', {
        tunnelId,
        taskId: event.taskId,
        status: event.status,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.emit('error', error);
      throw new Error(
        `Failed to send progress update: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      for (const [tunnelId] of this.activeConnections) {
        this.activeConnections.delete(tunnelId);
      }
      this.status = IntegrationStatus.DISCONNECTED;
      this.emit('disconnected');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    await this.disconnect();
    this.removeAllListeners();
    this.qrCodeSessions.clear();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMessage(_callback: (message: any) => void): () => void {
    // Mock: Slack messages would be received via webhook
    return () => {};
  }

  private async verifySlackCredentials(accessToken: string): Promise<boolean> {
    try {
      // TODO: call Slack API auth.test endpoint to validate the token
      return accessToken.length > 0;
    } catch {
      return false;
    }
  }
}
