/**
 * Messaging channel types for integrations (WhatsApp, Slack, Teams, Telegram, etc.)
 *
 * Designed with a generic channel adapter pattern so any messaging platform
 * can be wired into Accomplish's task system.
 */

// ---------------------------------------------------------------------------
// Channel types
// ---------------------------------------------------------------------------

/** Supported messaging channel platforms */
export type ChannelType = 'whatsapp' | 'slack' | 'telegram' | 'teams';

/** Connection status for a messaging channel */
export type ChannelStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ---------------------------------------------------------------------------
// Inbound messages (platform → Accomplish)
// ---------------------------------------------------------------------------

/** Normalised inbound message from any messaging platform */
export interface InboundChannelMessage {
  /** Which platform the message came from */
  channelType: ChannelType;
  /** Platform-specific chat / channel / group identifier */
  channelId: string;
  /** Platform-specific sender identifier */
  senderId: string;
  /** Display name of the sender when available */
  senderName?: string;
  /** Plain-text body of the message */
  text: string;
  /** Optional file / media attachments */
  attachments?: ChannelAttachment[];
  /** If this message is a reply, reference to the original */
  replyToMessageId?: string;
  /** Unix-ms timestamp of the message */
  timestamp: number;
  /**
   * Raw platform payload – kept for channel-specific logic but never
   * inspected by generic code.
   */
  rawPayload?: unknown;
}

export interface ChannelAttachment {
  type: 'image' | 'video' | 'audio' | 'document' | 'other';
  url?: string;
  mimeType?: string;
  filename?: string;
  size?: number;
}

// ---------------------------------------------------------------------------
// Outbound progress events (Accomplish → platform)
// ---------------------------------------------------------------------------

/** Progress phase for outbound events */
export type ProgressPhase = 'starting' | 'in-progress' | 'completed' | 'failed';

/** A structured progress update to send back to the user on their platform */
export interface OutboundProgressEvent {
  /** Chat / channel / group the update should be sent to */
  channelId: string;
  /** Sender to DM (if applicable) */
  senderId: string;
  /** Human-readable progress text */
  text: string;
  /** Semantic phase of the task */
  phase?: ProgressPhase;
  /** 0-100 completion percentage */
  percentage?: number;
  /** Accomplish task ID this progress relates to */
  taskId?: string;
}

// ---------------------------------------------------------------------------
// Channel adapter interface
// ---------------------------------------------------------------------------

/**
 * Each messaging platform implements this interface.
 * The adapter is responsible for connecting to the platform, emitting
 * normalised inbound messages, and sending outbound progress events.
 */
export interface ChannelAdapter {
  /** The platform this adapter serves */
  readonly channelType: ChannelType;

  /** Start the connection (e.g. open a WebSocket, start Baileys session) */
  connect(): Promise<void>;

  /** Tear down the connection gracefully */
  disconnect(): Promise<void>;

  /** Register a handler for incoming messages */
  onMessage(handler: (msg: InboundChannelMessage) => void): void;

  /** Send a progress / status update back to the user */
  sendProgress(event: OutboundProgressEvent): Promise<void>;

  /** Current connection status */
  getStatus(): ChannelStatus;

  /**
   * For platforms that use QR-code pairing (e.g. WhatsApp).
   * Returns a base64-encoded QR code image or data-url, or null if not
   * applicable / not yet available.
   */
  getQrCode?(): string | null;

  /** Register a handler that fires whenever a new QR code is generated */
  onQrCode?(handler: (qr: string) => void): void;

  /** Register a handler for status changes */
  onStatusChange?(handler: (status: ChannelStatus) => void): void;
}

// ---------------------------------------------------------------------------
// Integration settings (persisted per-channel)
// ---------------------------------------------------------------------------

/** Persisted settings for a single messaging integration */
export interface IntegrationConfig {
  /** Which platform */
  channelType: ChannelType;
  /** Whether the integration is enabled */
  enabled: boolean;
  /** Whether the tunnel (remote access) is enabled */
  tunnelEnabled: boolean;
  /** Connection status (runtime, not persisted) */
  status?: ChannelStatus;
  /** Timestamp of last successful connection */
  lastConnected?: number;
}

/** Map from channel type to its config */
export type IntegrationSettings = Partial<Record<ChannelType, IntegrationConfig>>;
