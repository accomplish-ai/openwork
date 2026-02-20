/**
 * WhatsApp channel adapter using @whiskeysockets/baileys (multi-device).
 *
 * This adapter:
 *  1. Creates a Baileys session and emits QR codes for pairing.
 *  2. Normalises incoming WhatsApp messages into InboundChannelMessage.
 *  3. Sends outbound progress updates back to the user respecting
 *     rate-limits to avoid WhatsApp anti-abuse measures.
 *  4. Persists auth credentials so the session survives restarts.
 *
 * NOTE: @whiskeysockets/baileys must be installed as a dependency of the
 * desktop app (or agent-core).  It is imported dynamically so that code
 * that does not use WhatsApp does not fail at startup.
 */

import type {
  ChannelAdapter,
  ChannelStatus,
  InboundChannelMessage,
  OutboundProgressEvent,
} from '../../common/types/messaging.js';

// ---------------------------------------------------------------------------
// Rate-limiter – coalesce outbound messages (max 1 per 5 s per chat)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 5_000;

interface QueuedMessage {
  event: OutboundProgressEvent;
  timer: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface WhatsAppAdapterOptions {
  /** Directory to persist auth state (creds.json & keys) */
  authDir: string;
  /**
   * Optional callback that fires when the adapter wants to persist
   * encrypted auth state (creds). If not provided the adapter will
   * write to `authDir` directly via the Baileys default store.
   */
  onCredsUpdate?: (creds: unknown) => Promise<void>;
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly channelType = 'whatsapp' as const;

  private status: ChannelStatus = 'disconnected';
  private qrCode: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private socket: any = null;

  // Handlers
  private messageHandler: ((msg: InboundChannelMessage) => void) | null = null;
  private qrHandler: ((qr: string) => void) | null = null;
  private statusHandler: ((status: ChannelStatus) => void) | null = null;

  // Rate-limit map: channelId → queued message
  private outboundQueue = new Map<string, QueuedMessage>();

  private options: WhatsAppAdapterOptions;

  constructor(options: WhatsAppAdapterOptions) {
    this.options = options;
  }

  // -------------------------------------------------------------------
  // ChannelAdapter interface
  // -------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') {
      return;
    }

    this.setStatus('connecting');

    try {
      // Dynamic import so the adapter module can be loaded even when
      // baileys is not installed (e.g. in unit tests / web build).
      const baileys = await import('@whiskeysockets/baileys');
      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
      } = baileys;

      const { state, saveCreds } = await useMultiFileAuthState(this.options.authDir);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        // Keep default logger, it writes to stdout – could be
        // replaced with Accomplish's logger in a follow-up.
      });

      this.socket = sock;

      // Auth credential persistence
      sock.ev.on('creds.update', async () => {
        if (this.options.onCredsUpdate) {
          await this.options.onCredsUpdate(state.creds);
        } else {
          await saveCreds();
        }
      });

      // QR code for pairing
      sock.ev.on('connection.update', ((update: Record<string, unknown>) => {
        const { connection, lastDisconnect, qr } = update as {
          connection?: string;
          lastDisconnect?: { error?: { output?: { statusCode?: number } } };
          qr?: string;
        };

        if (qr) {
          this.qrCode = qr;
          this.qrHandler?.(qr);
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;

          if (loggedOut) {
            this.setStatus('disconnected');
            this.qrCode = null;
          } else {
            // Reconnect automatically
            void this.connect();
          }
        } else if (connection === 'open') {
          this.setStatus('connected');
          this.qrCode = null;
        }
      }) as (...args: unknown[]) => void);

      // Incoming messages
      sock.ev.on('messages.upsert', ((upsert: { messages: Array<Record<string, unknown>> }) => {
        if (!this.messageHandler) {
          return;
        }

        for (const msg of upsert.messages) {
          // Skip status broadcast messages & messages sent by us
          if ((msg.key as Record<string, unknown>)?.remoteJid === 'status@broadcast') {
            continue;
          }
          if ((msg.key as Record<string, unknown>)?.fromMe) {
            continue;
          }

          const normalised = this.normaliseMessage(msg);
          if (normalised) {
            this.messageHandler(normalised);
          }
        }
      }) as (...args: unknown[]) => void);
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      try {
        this.socket.end(undefined);
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.setStatus('disconnected');
    this.qrCode = null;

    // Flush rate-limit timers
    for (const [, queued] of this.outboundQueue) {
      if (queued.timer) {
        clearTimeout(queued.timer);
      }
    }
    this.outboundQueue.clear();
  }

  onMessage(handler: (msg: InboundChannelMessage) => void): void {
    this.messageHandler = handler;
  }

  async sendProgress(event: OutboundProgressEvent): Promise<void> {
    if (!this.socket || this.status !== 'connected') {
      return;
    }

    // Rate-limit: coalesce messages per channelId
    const existing = this.outboundQueue.get(event.channelId);
    if (existing) {
      // Replace queued event with the latest one (keep the timer)
      existing.event = event;
      return;
    }

    // Send immediately, then start cooldown
    await this.sendText(event.channelId, this.formatProgress(event));

    const queued: QueuedMessage = { event, timer: null };
    queued.timer = setTimeout(async () => {
      this.outboundQueue.delete(event.channelId);
      // If a newer event was queued during cooldown, send it now
      if (queued.event !== event) {
        await this.sendText(queued.event.channelId, this.formatProgress(queued.event));
      }
    }, RATE_LIMIT_MS);
    this.outboundQueue.set(event.channelId, queued);
  }

  getStatus(): ChannelStatus {
    return this.status;
  }

  getQrCode(): string | null {
    return this.qrCode;
  }

  onQrCode(handler: (qr: string) => void): void {
    this.qrHandler = handler;
  }

  onStatusChange(handler: (status: ChannelStatus) => void): void {
    this.statusHandler = handler;
  }

  // -------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------

  private setStatus(status: ChannelStatus): void {
    this.status = status;
    this.statusHandler?.(status);
  }

  /** Turn a raw Baileys message into our normalised schema */
  private normaliseMessage(raw: Record<string, unknown>): InboundChannelMessage | null {
    const key = raw.key as Record<string, unknown> | undefined;
    const messageContent = raw.message as Record<string, unknown> | undefined;
    if (!key || !messageContent) {
      return null;
    }

    const remoteJid = (key.remoteJid as string) || '';
    const participant = (key.participant as string) || remoteJid;

    // Extract text from various message types
    let text = '';
    if (messageContent.conversation) {
      text = messageContent.conversation as string;
    } else if (messageContent.extendedTextMessage) {
      text = (messageContent.extendedTextMessage as Record<string, unknown>).text as string;
    } else if (messageContent.imageMessage) {
      text =
        ((messageContent.imageMessage as Record<string, unknown>).caption as string) || '[image]';
    } else if (messageContent.documentMessage) {
      text =
        ((messageContent.documentMessage as Record<string, unknown>).title as string) ||
        '[document]';
    }

    if (!text) {
      return null;
    }

    const pushName = (raw.pushName as string) || undefined;

    return {
      channelType: 'whatsapp',
      channelId: remoteJid,
      senderId: participant,
      senderName: pushName,
      text,
      timestamp: Number(raw.messageTimestamp) * 1000 || Date.now(),
      replyToMessageId: (
        (messageContent.extendedTextMessage as Record<string, unknown> | undefined)?.contextInfo as
          | Record<string, unknown>
          | undefined
      )?.stanzaId as string | undefined,
      rawPayload: raw,
    };
  }

  /** Format a progress event into human-readable WhatsApp text */
  private formatProgress(event: OutboundProgressEvent): string {
    const parts: string[] = [];

    if (event.phase) {
      const emoji: Record<string, string> = {
        starting: '🚀',
        'in-progress': '⏳',
        completed: '✅',
        failed: '❌',
      };
      parts.push(emoji[event.phase] ?? '');
    }

    if (event.percentage !== undefined) {
      parts.push(`[${event.percentage}%]`);
    }

    parts.push(event.text);

    return parts.join(' ').trim();
  }

  /** Low-level text send through Baileys */
  private async sendText(jid: string, text: string): Promise<void> {
    if (!this.socket) {
      return;
    }
    try {
      await this.socket.sendMessage(jid, { text });
    } catch (err) {
      console.error('[WhatsAppAdapter] Failed to send message:', err);
    }
  }
}
