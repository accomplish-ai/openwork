/**
 * WhatsApp Messaging Provider
 *
 * Implements the MessagingProvider interface for WhatsApp Web.
 * Uses a lightweight WhatsApp Web bridge approach:
 * - Generates QR codes for multi-device pairing
 * - Receives messages via WebSocket connection
 * - Sends progress updates back to the user
 *
 * Note: In production, this would integrate with whatsapp-web.js or
 * the WhatsApp Business Cloud API. This implementation provides the
 * full architecture with a simulated connection layer that can be
 * swapped for the real WhatsApp library.
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import type {
  MessagingProvider,
  IncomingMessage,
  OutgoingMessage,
  QRCodeData,
  IntegrationConnectionStatus,
} from './types';

export class WhatsAppProvider extends EventEmitter implements MessagingProvider {
  readonly platformId = 'whatsapp' as const;
  readonly displayName = 'WhatsApp';

  private status: IntegrationConnectionStatus = 'disconnected';
  private messageCallbacks: Array<(message: IncomingMessage) => void> = [];
  private qrCallbacks: Array<(qrData: QRCodeData) => void> = [];
  private statusCallbacks: Array<(status: IntegrationConnectionStatus, error?: string) => void> = [];
  private qrRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private sessionData: Record<string, string> = {};
  private disposed = false;

  async initialize(): Promise<void> {
    // In production: initialize WhatsApp Web client library
    // e.g., const { Client } = require('whatsapp-web.js');
    // this.client = new Client({ authStrategy: new LocalAuth() });
    console.log('[WhatsApp] Provider initialized');
  }

  async connect(): Promise<void> {
    if (this.disposed) throw new Error('Provider has been disposed');
    if (this.status === 'connected') return;

    this.updateStatus('connecting');

    try {
      // Generate initial QR code
      await this.generateAndEmitQR();
      this.updateStatus('awaiting_scan');

      // In production: the whatsapp-web.js library would emit 'qr' events
      // this.client.on('qr', (qr) => this.emitQR(qr));
      // this.client.on('ready', () => this.updateStatus('connected'));
      // this.client.on('message', (msg) => this.handleIncoming(msg));
      // await this.client.initialize();

      // Refresh QR code every 30 seconds while awaiting scan
      this.qrRefreshInterval = setInterval(async () => {
        if (this.status === 'awaiting_scan') {
          await this.generateAndEmitQR();
        }
      }, 30000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      this.updateStatus('error', message);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.qrRefreshInterval) {
      clearInterval(this.qrRefreshInterval);
      this.qrRefreshInterval = null;
    }
    this.sessionData = {};
    this.updateStatus('disconnected');

    // In production: await this.client.destroy();
    console.log('[WhatsApp] Disconnected');
  }

  getStatus(): IntegrationConnectionStatus {
    return this.status;
  }

  async sendMessage(message: OutgoingMessage): Promise<void> {
    if (this.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    // Format message based on rich content type
    let text = message.text;
    if (message.richContent) {
      switch (message.richContent.type) {
        case 'progress':
          text = `⏳ *${message.richContent.title || 'Task Progress'}*\n${message.richContent.body || message.text}`;
          break;
        case 'completion':
          text = `✅ *${message.richContent.title || 'Task Completed'}*\n${message.richContent.body || message.text}`;
          break;
        case 'error':
          text = `❌ *${message.richContent.title || 'Task Failed'}*\n${message.richContent.body || message.text}`;
          break;
        case 'permission_request':
          text = `🔐 *Permission Required*\n${message.richContent.body || message.text}\n\nReply YES to allow or NO to deny.`;
          break;
      }
    }

    // In production: await this.client.sendMessage(message.recipientId, text);
    console.log(`[WhatsApp] Sending message to ${message.recipientId}: ${text.substring(0, 100)}...`);
  }

  onMessage(callback: (message: IncomingMessage) => void): () => void {
    this.messageCallbacks.push(callback);
    return () => {
      this.messageCallbacks = this.messageCallbacks.filter(cb => cb !== callback);
    };
  }

  onQRCode(callback: (qrData: QRCodeData) => void): () => void {
    this.qrCallbacks.push(callback);
    return () => {
      this.qrCallbacks = this.qrCallbacks.filter(cb => cb !== callback);
    };
  }

  onStatusChange(callback: (status: IntegrationConnectionStatus, error?: string) => void): () => void {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Simulate receiving a message (called by the tunnel HTTP endpoint or WhatsApp Web bridge)
   */
  handleIncomingMessage(senderId: string, senderName: string, text: string, raw?: unknown): void {
    const message: IncomingMessage = {
      id: crypto.randomUUID(),
      platformId: 'whatsapp',
      senderId,
      senderName,
      text,
      timestamp: Date.now(),
      raw,
    };

    for (const cb of this.messageCallbacks) {
      try {
        cb(message);
      } catch (err) {
        console.error('[WhatsApp] Error in message callback:', err);
      }
    }
  }

  /**
   * Simulate a successful QR scan (called when pairing is confirmed)
   */
  confirmPairing(phoneNumber?: string): void {
    if (this.qrRefreshInterval) {
      clearInterval(this.qrRefreshInterval);
      this.qrRefreshInterval = null;
    }
    if (phoneNumber) {
      this.sessionData.phoneNumber = phoneNumber;
    }
    this.updateStatus('connected');
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.disconnect();
    this.messageCallbacks = [];
    this.qrCallbacks = [];
    this.statusCallbacks = [];
  }

  // --- Private helpers ---

  private updateStatus(status: IntegrationConnectionStatus, error?: string): void {
    this.status = status;
    for (const cb of this.statusCallbacks) {
      try {
        cb(status, error);
      } catch (err) {
        console.error('[WhatsApp] Error in status callback:', err);
      }
    }
    this.emit('status-change', { status, error });
  }

  private async generateAndEmitQR(): Promise<void> {
    // In production: QR string comes from whatsapp-web.js 'qr' event
    // Here we generate a deterministic-looking QR string for the pairing flow
    const qrPayload = `accomplish-whatsapp-pair:${crypto.randomUUID()}`;
    const qrData: QRCodeData = {
      qrString: qrPayload,
      expiresAt: Date.now() + 30000, // 30s expiry
    };

    for (const cb of this.qrCallbacks) {
      try {
        cb(qrData);
      } catch (err) {
        console.error('[WhatsApp] Error in QR callback:', err);
      }
    }
    this.emit('qr-code', qrData);
  }
}
