export type MessagingProviderId = 'whatsapp';

export type MessagingConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'qr_ready'
  | 'connected'
  | 'reconnecting'
  | 'logged_out';

export interface MessagingIntegrationConfig {
  providerId: MessagingProviderId;
  enabled: boolean;
  status: MessagingConnectionStatus;
  phoneNumber?: string;
  ownerJid?: string;
  ownerLid?: string;
  lastConnectedAt?: number;
}

export interface IncomingMessage {
  providerId: MessagingProviderId;
  messageId: string;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: number;
  isGroup: boolean;
}

export interface OutgoingMessage {
  providerId: MessagingProviderId;
  recipientId: string;
  text: string;
  replyToMessageId?: string;
}

export interface InboundChannelMessage {
  channelType: MessagingProviderId;
  channelId: string;
  senderId: string;
  senderName?: string;
  text: string;
  attachments?: ChannelAttachment[];
  replyToMessageId?: string;
  timestamp: number;
}

export interface ChannelAttachment {
  type: 'image' | 'video' | 'audio' | 'document' | 'other';
  mimeType?: string;
  filename?: string;
  size?: number;
}

export type ProgressPhase = 'starting' | 'in-progress' | 'completed' | 'failed';

export interface OutboundProgressEvent {
  channelId: string;
  senderId: string;
  text: string;
  phase?: ProgressPhase;
  percentage?: number;
  taskId?: string;
}

export interface ChannelAdapter {
  readonly channelType: MessagingProviderId;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (msg: InboundChannelMessage) => void): void;
  sendProgress(event: OutboundProgressEvent): Promise<void>;
  getStatus(): MessagingConnectionStatus;
  getQrCode?(): string | null;
  onQrCode?(handler: (qr: string) => void): void;
  onStatusChange?(handler: (status: MessagingConnectionStatus) => void): void;
}
