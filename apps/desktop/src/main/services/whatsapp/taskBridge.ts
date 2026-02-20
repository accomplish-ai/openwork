import { sanitizeString } from '@accomplish_ai/agent-core';
import { isLidUser } from '@whiskeysockets/baileys';

export interface InboundMessage {
  messageId: string;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: number;
  isGroup: boolean;
  isFromMe: boolean;
}

/** Minimal contract TaskBridge needs from a WhatsApp transport layer. */
export interface MessageTransport {
  on(event: 'message', listener: (msg: InboundMessage) => void): this;
  off(event: 'message', listener: (msg: InboundMessage) => void): this;
  sendMessage(recipientId: string, text: string): Promise<void>;
}

export const MAX_MESSAGE_LENGTH = 4096;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_MESSAGES = 10;
const GLOBAL_RATE_LIMIT_MAX = 30;
const MAX_TRACKED_SENDERS = 100;
const SESSION_IDLE_TIMEOUT_MS = 10 * 60_000; // 10 minutes

interface SenderSession {
  sessionId: string;
  lastActivity: number;
}

export class TaskBridge {
  private senderTimestamps = new Map<string, number[]>();
  private globalTimestamps: number[] = [];
  private activeTasks = new Map<string, string>();
  private senderSessions = new Map<string, SenderSession>();
  private transport: MessageTransport;
  private onTaskRequest: (senderId: string, senderName: string | undefined, text: string) => Promise<void>;
  private messageHandler: (msg: InboundMessage) => void;
  private ownerJid: string | null = null;
  private ownerLid: string | null = null;
  private enabled = true;

  constructor(
    transport: MessageTransport,
    onTaskRequest: (senderId: string, senderName: string | undefined, text: string) => Promise<void>,
  ) {
    this.transport = transport;
    this.onTaskRequest = onTaskRequest;

    this.messageHandler = (msg) => {
      this.handleMessage(msg).catch((err) => {
        console.error('[TaskBridge] Error handling message:', err);
      });
    };
    this.transport.on('message', this.messageHandler);
  }

  setOwnerJid(jid: string): void {
    this.ownerJid = jid;
  }

  getOwnerJid(): string | null {
    return this.ownerJid;
  }

  setOwnerLid(lid: string): void {
    this.ownerLid = lid;
  }

  getOwnerLid(): string | null {
    return this.ownerLid;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private isRateLimited(senderId: string): boolean {
    const now = Date.now();
    const timestamps = this.senderTimestamps.get(senderId) || [];
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    this.senderTimestamps.set(senderId, recent);
    return recent.length >= RATE_LIMIT_MAX_MESSAGES;
  }

  private isGlobalRateLimited(): boolean {
    const now = Date.now();
    this.globalTimestamps = this.globalTimestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    return this.globalTimestamps.length >= GLOBAL_RATE_LIMIT_MAX;
  }

  private recordMessage(senderId: string): void {
    const now = Date.now();
    const timestamps = this.senderTimestamps.get(senderId) || [];
    timestamps.push(now);
    this.senderTimestamps.set(senderId, timestamps);
    this.globalTimestamps.push(now);

    if (this.senderTimestamps.size > MAX_TRACKED_SENDERS) {
      for (const [key, ts] of this.senderTimestamps) {
        if (ts.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) {
          this.senderTimestamps.delete(key);
        }
      }
    }
  }

  hasActiveTask(senderId: string): boolean {
    return this.activeTasks.has(senderId);
  }

  setActiveTask(senderId: string, taskId: string): void {
    this.activeTasks.set(senderId, taskId);
  }

  clearActiveTask(senderId: string): void {
    this.activeTasks.delete(senderId);
  }

  setSessionForSender(senderId: string, sessionId: string): void {
    this.senderSessions.set(senderId, { sessionId, lastActivity: Date.now() });
  }

  getSessionForSender(senderId: string): string | null {
    const session = this.senderSessions.get(senderId);
    if (!session) {
      return null;
    }
    if (Date.now() - session.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
      this.senderSessions.delete(senderId);
      return null;
    }
    return session.sessionId;
  }

  private async handleMessage(msg: InboundMessage): Promise<void> {
    console.log('[TaskBridge] Message received:', {
      isFromMe: msg.isFromMe,
      isGroup: msg.isGroup,
      enabled: this.enabled,
      hasOwnerJid: !!this.ownerJid,
      hasOwnerLid: !!this.ownerLid,
    });

    if (!this.enabled) {
      console.log('[TaskBridge] Rejected: bridge disabled');
      return;
    }

    if (msg.isGroup) {
      console.log('[TaskBridge] Rejected: group message');
      return;
    }

    // Self-only access control (fail-closed): only accept self-chat messages.
    // WhatsApp uses two identity formats: JID (phone@s.whatsapp.net) and
    // LID (linked-identity@lid). Self-chat messages arrive in LID format,
    // so we compare the sender against whichever format matches.
    if (!this.ownerJid && !this.ownerLid) {
      console.log('[TaskBridge] Rejected: neither ownerJid nor ownerLid set');
      return;
    }

    const senderMatchesOwner = isLidUser(msg.senderId)
      ? msg.senderId === this.ownerLid
      : msg.senderId === this.ownerJid;
    const isSelfChat = msg.isFromMe && senderMatchesOwner;
    if (!isSelfChat) {
      console.log('[TaskBridge] Rejected: not self-chat', {
        isFromMe: msg.isFromMe,
        senderMatchesOwner,
      });
      return;
    }

    if (this.isGlobalRateLimited()) {
      return;
    }

    if (this.isRateLimited(msg.senderId)) {
      await this.transport.sendMessage(
        msg.senderId,
        'You are sending messages too quickly. Please wait a moment.',
      ).catch(() => {});
      return;
    }

    this.recordMessage(msg.senderId);

    if (msg.text.length > MAX_MESSAGE_LENGTH) {
      await this.transport.sendMessage(
        msg.senderId,
        `Message too long. Please keep messages under ${MAX_MESSAGE_LENGTH} characters.`,
      ).catch(() => {});
      return;
    }

    let sanitizedText: string;
    try {
      sanitizedText = sanitizeString(msg.text, 'whatsappMessage', MAX_MESSAGE_LENGTH);
    } catch {
      await this.transport.sendMessage(
        msg.senderId,
        'Could not process your message. Please try again with plain text.',
      ).catch(() => {});
      return;
    }

    if (this.hasActiveTask(msg.senderId)) {
      await this.transport.sendMessage(
        msg.senderId,
        'Your previous task is still running. Please wait for it to complete.',
      ).catch(() => {});
      return;
    }

    // Mark task as active immediately to prevent duplicate task creation
    // if another message arrives before onTaskRequest sets the real task ID
    this.setActiveTask(msg.senderId, 'pending');

    // Sanitize senderName to prevent prompt injection via WhatsApp display name
    const safeSenderName = msg.senderName
      ? sanitizeString(msg.senderName, 'senderName', 128)
      : undefined;

    try {
      await this.onTaskRequest(msg.senderId, safeSenderName, sanitizedText);
    } catch (err) {
      console.error('[TaskBridge] Failed to create task:', err);
      this.clearActiveTask(msg.senderId);
      await this.transport.sendMessage(
        msg.senderId,
        'Sorry, I could not process your request. Please try again later.',
      ).catch(() => {});
    }
  }

  dispose(): void {
    this.transport.off('message', this.messageHandler);
    this.senderTimestamps.clear();
    this.globalTimestamps = [];
    this.activeTasks.clear();
    this.senderSessions.clear();
  }
}
