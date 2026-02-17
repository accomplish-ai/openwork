/**
 * Messaging Integration Types
 *
 * Generic abstractions for messaging platform integrations.
 * Designed with WhatsApp, Slack, Teams, and Telegram in mind.
 */

/** Supported messaging platforms */
export type MessagingPlatformId = 'whatsapp' | 'slack' | 'teams' | 'telegram';

/** Connection state for a messaging integration */
export type IntegrationConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'awaiting_scan'    // QR code shown, waiting for user to scan
  | 'connected'
  | 'error';

/** Configuration for a messaging integration */
export interface MessagingIntegrationConfig {
  platformId: MessagingPlatformId;
  enabled: boolean;
  tunnelEnabled: boolean;
  connectionStatus: IntegrationConnectionStatus;
  connectedAt?: string;
  lastError?: string;
  /** Platform-specific metadata (e.g., phone number for WhatsApp, workspace for Slack) */
  metadata?: Record<string, string>;
}

/** QR code data for pairing (WhatsApp/Telegram style) */
export interface QRCodeData {
  /** Base64-encoded QR code image or raw string for client-side rendering */
  qrString: string;
  /** Expiry timestamp */
  expiresAt: number;
}

/** Incoming message from a messaging platform */
export interface IncomingMessage {
  id: string;
  platformId: MessagingPlatformId;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: number;
  /** Platform-specific raw data */
  raw?: unknown;
}

/** Outgoing message to a messaging platform */
export interface OutgoingMessage {
  recipientId: string;
  text: string;
  /** Optional structured content (e.g., buttons, cards) */
  richContent?: {
    type: 'progress' | 'completion' | 'error' | 'permission_request';
    title?: string;
    body?: string;
    actions?: Array<{ label: string; value: string }>;
  };
}

/** Progress update to send back to the messaging user */
export interface TaskProgressUpdate {
  taskId: string;
  platformId: MessagingPlatformId;
  recipientId: string;
  stage: string;
  message?: string;
  status: 'running' | 'completed' | 'failed' | 'waiting_permission';
}

/** Tunnel connection state */
export interface TunnelState {
  active: boolean;
  url?: string;
  connectedAt?: string;
  lastError?: string;
}

/** Events emitted by integrations */
export interface IntegrationEvents {
  'integration:status-change': {
    platformId: MessagingPlatformId;
    status: IntegrationConnectionStatus;
    error?: string;
  };
  'integration:qr-code': {
    platformId: MessagingPlatformId;
    qrData: QRCodeData;
  };
  'integration:message': IncomingMessage;
  'integration:tunnel-state': TunnelState;
}

/** Interface that all messaging platform providers must implement */
export interface MessagingProvider {
  readonly platformId: MessagingPlatformId;
  readonly displayName: string;

  /** Initialize the provider */
  initialize(): Promise<void>;

  /** Start the connection/pairing process */
  connect(): Promise<void>;

  /** Disconnect from the platform */
  disconnect(): Promise<void>;

  /** Get current connection status */
  getStatus(): IntegrationConnectionStatus;

  /** Send a message to a user on this platform */
  sendMessage(message: OutgoingMessage): Promise<void>;

  /** Register a callback for incoming messages */
  onMessage(callback: (message: IncomingMessage) => void): () => void;

  /** Register a callback for QR code updates (for QR-based auth) */
  onQRCode?(callback: (qrData: QRCodeData) => void): () => void;

  /** Register a callback for status changes */
  onStatusChange(callback: (status: IntegrationConnectionStatus, error?: string) => void): () => void;

  /** Clean up resources */
  dispose(): Promise<void>;
}
