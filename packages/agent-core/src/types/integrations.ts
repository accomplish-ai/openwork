import type { EventEmitter } from 'events';

/**
 * Integration types for messaging platform integration
 * Allows agent to receive tasks and send updates via messaging platforms
 */

// Core integration platform enumeration for extensibility
export enum IntegrationPlatform {
  WHATSAPP = 'whatsapp',
  SLACK = 'slack',
  TEAMS = 'teams',
  TELEGRAM = 'telegram',
}

// Integration connection state tracking
export enum IntegrationStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

// Message routing for task updates over tunnel connection
export interface IntegrationTaskProgressEvent {
  taskId: string;
  status: 'started' | 'progress' | 'completed' | 'error';
  message?: string;
  progress?: number;
  timestamp: number;
}

// QR code data for mobile device pairing
export interface IntegrationQRCodeData {
  // Base64 encoded PNG image data
  imageData?: string;
  // QR code string payload
  qrString?: string;
  // QR code token for tracking pairing session
  sessionToken: string;
  expiresAt: number;
  // Optional metadata for setup instructions
  metadata?: {
    setupMethod?: string;
    instruction?: string;
    requiredFields?: Array<{
      name: string;
      label: string;
      placeholder?: string;
      help?: string;
      type?: string;
    }>;
  };
}

// Tunnel configuration for secure message routing
export interface IntegrationTunnelConfig {
  // Unique tunnel identifier
  tunnelId: string;
  // Platform the tunnel is routing through
  platform: IntegrationPlatform;
  // Tunnel endpoint URL for receiving messages
  endpoint: string;
  // Authentication token for tunnel operations
  token: string;
  // Device identifier connected to this tunnel
  deviceId: string;
  createdAt: number;
  expiresAt: number;
}

// Incoming message from integrated platform via tunnel
export interface IntegrationIncomingMessage {
  id: string;
  platform: IntegrationPlatform;
  senderId: string;
  content: string;
  receivedAt: number;
  tunnelId: string;
}

// Integration configuration stored in user settings
export interface IntegrationConfig {
  platform: IntegrationPlatform;
  // Tunnel mode: enabled to allow receiving remote commands
  tunnelEnabled: boolean;
  status: IntegrationStatus;
  connectedDeviceId?: string;
  lastSyncedAt?: number;
  credentials?: Record<string, string>;
}

// Provider interface for pluggable platform implementations
// Combines EventEmitter methods with provider-specific methods
export interface IntegrationProvider extends Omit<EventEmitter, never> {
  platform: IntegrationPlatform;
  status: IntegrationStatus;
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'qr', listener: (data: IntegrationQRCodeData) => void): this;
  on(event: 'tunnel-established', listener: (config: IntegrationTunnelConfig) => void): this;
  on(event: 'message-sent', listener: (data: unknown) => void): this;
  emit(event: 'connected'): boolean;
  emit(event: 'disconnected'): boolean;
  emit(event: 'error', error: Error): boolean;
  emit(event: 'qr', data: IntegrationQRCodeData): boolean;
  emit(event: 'tunnel-established', config: IntegrationTunnelConfig): boolean;
  emit(event: 'message-sent', data: unknown): boolean;
  removeAllListeners(): this;

  // Initialize provider with stored configuration
  initialize(config: IntegrationConfig): Promise<void>;

  // Generate QR code for device pairing
  generateQRCode(sessionToken: string): Promise<IntegrationQRCodeData>;

  // Establish tunnel connection for message routing
  setupTunnel(tunnelId: string): Promise<IntegrationTunnelConfig>;

  // Verify tunnel connectivity
  verifyTunnel(tunnelId: string): Promise<boolean>;

  // Send task progress updates back through tunnel
  sendProgressUpdate(tunnelId: string, event: IntegrationTaskProgressEvent): Promise<void>;

  // Register callback for incoming messages
  onMessage(callback: (message: IntegrationIncomingMessage) => void): () => void;

  // Disconnect integration cleanly
  disconnect(): Promise<void>;

  // Cleanup resources on provider removal
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
  on(event: 'tunnel-established', listener: (tunnel: IntegrationTunnelConfig) => void): this;
  on(
    event: 'connection-initiated',
    listener: (data: { platform: IntegrationPlatform; sessionToken: string }) => void,
  ): this;
  on(event: 'message-processed', listener: (message: IntegrationIncomingMessage) => void): this;
  on(
    event: 'message-error',
    listener: (data: { message: IntegrationIncomingMessage; error: Error }) => void,
  ): this;

  emit(event: 'initialized'): boolean;
  emit(event: 'error', error: Error): boolean;
  emit(event: 'integration-connected', platform: IntegrationPlatform): boolean;
  emit(event: 'integration-disconnected', platform: IntegrationPlatform): boolean;
  emit(event: 'provider-error', data: { platform: IntegrationPlatform; error: Error }): boolean;
  emit(event: 'tunnel-established', tunnel: IntegrationTunnelConfig): boolean;
  emit(
    event: 'connection-initiated',
    data: { platform: IntegrationPlatform; sessionToken: string },
  ): boolean;
  emit(event: 'message-processed', message: IntegrationIncomingMessage): boolean;
  emit(
    event: 'message-error',
    data: { message: IntegrationIncomingMessage; error: Error },
  ): boolean;

  removeAllListeners(): this;

  // Get all registered integrations
  getIntegrations(): IntegrationConfig[];

  // Connect new integration with platform
  connect(platform: IntegrationPlatform): Promise<IntegrationQRCodeData>;

  // Disconnect existing integration
  disconnect(platform: IntegrationPlatform): Promise<void>;

  // Get integration status
  getStatus(platform: IntegrationPlatform): IntegrationStatus;

  // Setup tunnel for receiving remote commands
  setupTunnel(platform: IntegrationPlatform): Promise<IntegrationTunnelConfig>;

  // Process incoming message from platform tunnel
  handleIncomingMessage(message: IntegrationIncomingMessage): Promise<void>;

  // Send progress update to connected device
  sendTaskProgress(
    platform: IntegrationPlatform,
    event: IntegrationTaskProgressEvent,
  ): Promise<void>;

  // Register handler for incoming messages from specific platform
  registerMessageHandler(
    platform: IntegrationPlatform,
    handler: (message: IntegrationIncomingMessage) => Promise<void>,
  ): void;
}
