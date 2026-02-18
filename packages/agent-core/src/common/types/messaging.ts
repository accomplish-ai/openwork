/** Supported messaging platform IDs */
export type MessagingPlatform = 'whatsapp' | 'slack' | 'telegram' | 'teams';

/** Connection status for a messaging integration */
export type MessagingConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr-ready'
  | 'connected'
  | 'error';

/** Configuration for a messaging integration */
export interface MessagingIntegrationConfig {
  platform: MessagingPlatform;
  enabled: boolean;
  tunnelEnabled: boolean;
  /** Connection status (runtime, not persisted) */
  connectionStatus?: MessagingConnectionStatus;
  /** User-friendly name for the connected account */
  accountName?: string;
  /** Last connected timestamp */
  lastConnected?: number;
}

/** Top-level messaging configuration stored in app_settings */
export interface MessagingConfig {
  integrations: Partial<Record<MessagingPlatform, MessagingIntegrationConfig>>;
}

/** QR code data for WhatsApp-style authentication */
export interface MessagingQRCode {
  platform: MessagingPlatform;
  qrData: string;
  expiresAt: number;
}

/** Incoming message from a messaging platform */
export interface IncomingMessage {
  platform: MessagingPlatform;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  messageId: string;
  /** Chat/channel ID for sending replies */
  chatId: string;
}
