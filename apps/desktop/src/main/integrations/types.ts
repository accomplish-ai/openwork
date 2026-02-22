import type { EventEmitter } from 'events';
import { IntegrationPlatform, IntegrationStatus } from '@accomplish_ai/agent-core';
import type {
  IntegrationConfig,
  QRCodeData,
  TunnelConfig,
  IncomingMessage,
} from '@accomplish_ai/agent-core';
import type { IntegrationTaskProgressEvent } from '@accomplish_ai/agent-core/src/types/integrations';

// Re-export enums and types from agent-core for backwards compatibility
export { IntegrationPlatform, IntegrationStatus };
export type { IntegrationConfig, QRCodeData, TunnelConfig, IncomingMessage };

// Message routing for task updates over tunnel connection (alias for external use)
export type TaskProgressEvent = IntegrationTaskProgressEvent;

// Provider interface for pluggable platform implementations
// Combines EventEmitter methods with provider-specific methods
export interface IntegrationProvider extends Omit<EventEmitter, never> {
  platform: IntegrationPlatform;
  status: IntegrationStatus;
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'qr', listener: (data: QRCodeData) => void): this;
  on(event: 'tunnel-established', listener: (config: TunnelConfig) => void): this;
  on(event: 'message-sent', listener: (data: unknown) => void): this;
  emit(event: 'connected'): boolean;
  emit(event: 'disconnected'): boolean;
  emit(event: 'error', error: Error): boolean;
  emit(event: 'qr', data: QRCodeData): boolean;
  emit(event: 'tunnel-established', config: TunnelConfig): boolean;
  emit(event: 'message-sent', data: unknown): boolean;
  removeAllListeners(): this;

  // Restore provider state from persisted configuration
  initialize(config: IntegrationConfig): Promise<void>;

  // Produces a QR payload the UI renders for device pairing
  generateQRCode(sessionToken: string): Promise<QRCodeData>;

  // Opens a tunnel that routes remote commands to this provider
  setupTunnel(tunnelId: string): Promise<TunnelConfig>;

  verifyTunnel(tunnelId: string): Promise<boolean>;

  sendProgressUpdate(tunnelId: string, event: IntegrationTaskProgressEvent): Promise<void>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMessage(callback: (message: any) => void): () => void;

  disconnect(): Promise<void>;

  cleanup(): Promise<void>;
}

// Integration manager interface for orchestration
export interface IIntegrationManager extends Omit<EventEmitter, never> {
  on(event: 'initialized', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'integration-connected', listener: (platform: IntegrationPlatform) => void): this;
  on(event: 'integration-disconnected', listener: (platform: IntegrationPlatform) => void): this;
  on(
    event: 'provider-error',
    listener: (data: { platform: IntegrationPlatform; error: Error }) => void,
  ): this;
  on(event: 'tunnel-established', listener: (tunnel: TunnelConfig) => void): this;
  on(
    event: 'connection-initiated',
    listener: (data: { platform: IntegrationPlatform; sessionToken: string }) => void,
  ): this;
  on(event: 'message-processed', listener: (message: IncomingMessage) => void): this;
  on(
    event: 'message-error',
    listener: (data: { message: IncomingMessage; error: Error }) => void,
  ): this;

  emit(event: 'initialized'): boolean;
  emit(event: 'error', error: Error): boolean;
  emit(event: 'integration-connected', platform: IntegrationPlatform): boolean;
  emit(event: 'integration-disconnected', platform: IntegrationPlatform): boolean;
  emit(event: 'provider-error', data: { platform: IntegrationPlatform; error: Error }): boolean;
  emit(event: 'tunnel-established', tunnel: TunnelConfig): boolean;
  emit(
    event: 'connection-initiated',
    data: { platform: IntegrationPlatform; sessionToken: string },
  ): boolean;
  emit(event: 'message-processed', message: IncomingMessage): boolean;
  emit(event: 'message-error', data: { message: IncomingMessage; error: Error }): boolean;

  removeAllListeners(): this;

  getIntegrations(): IntegrationConfig[];

  connect(platform: IntegrationPlatform): Promise<QRCodeData>;

  disconnect(platform: IntegrationPlatform): Promise<void>;

  getStatus(platform: IntegrationPlatform): IntegrationStatus;

  // Opens a local tunnel for receiving remote commands on `platform`
  setupTunnel(platform: IntegrationPlatform): Promise<TunnelConfig>;

  handleIncomingMessage(message: IncomingMessage): Promise<void>;

  sendTaskProgress(
    platform: IntegrationPlatform,
    event: IntegrationTaskProgressEvent,
  ): Promise<void>;
}
