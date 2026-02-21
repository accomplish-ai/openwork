import { BrowserWindow, ipcMain, app } from 'electron';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import path from 'path';
import type {
  IntegrationProvider,
  IntegrationConfig,
  QRCodeData,
  TunnelConfig,
  TaskProgressEvent,
} from '../types';
import { IntegrationPlatform, IntegrationStatus } from '../types';
import { getTunnelServer } from '../../tunnel/tunnel-service';

export class WhatsAppProvider extends EventEmitter implements IntegrationProvider {
  platform = IntegrationPlatform.WHATSAPP;
  status: IntegrationStatus = IntegrationStatus.DISCONNECTED;

  private window: BrowserWindow | null = null;
  private config?: IntegrationConfig;
  private activeConnections = new Map<string, TunnelConfig>();
  private messageSenderMap = new Map<string, string>(); // tunnelId -> senderJID mapping

  private qrCallbacks: Array<(qrData: QRCodeData) => void> = [];
  private statusCallbacks: Array<(status: IntegrationStatus, error?: string) => void> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private messageCallbacks: Array<(message: any) => void> = [];

  private disposed = false;
  private connectionPollInterval: ReturnType<typeof setInterval> | null = null;
  private messagePollInterval: ReturnType<typeof setInterval> | null = null;
  private lastSeenMessageIds = new Set<string>();

  // Store bound handler references for proper cleanup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ipcQrHandler: ((_event: any, qrString: string) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ipcStatusHandler: ((_event: any, statusStr: string) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ipcMessageHandler: ((_event: any, message: any) => void) | null = null;

  constructor() {
    super();
    this.setupIpcListeners();
  }

  private setupIpcListeners() {
    // Store references so we can remove them on dispose
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.ipcQrHandler = (_event: any, qrString: string) => {
      this.emitQR(qrString);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.ipcStatusHandler = (_event: any, statusStr: string) => {
      let status = IntegrationStatus.DISCONNECTED;
      if (statusStr === 'CONNECTED' || statusStr === IntegrationStatus.CONNECTED) {
        status = IntegrationStatus.CONNECTED;
      }

      this.status = status;
      this.emitStatus(status);

      if (status === IntegrationStatus.CONNECTED) {
        this.emit('connected');
      } else if (status === IntegrationStatus.DISCONNECTED) {
        this.emit('disconnected');
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.ipcMessageHandler = (_event: any, message: any) => {
      this.handleIncomingMessage(message);
    };

    ipcMain.on('whatsapp-qr-update', this.ipcQrHandler);
    ipcMain.on('whatsapp-status-update', this.ipcStatusHandler);
    ipcMain.on('whatsapp-message', this.ipcMessageHandler);
  }

  private removeIpcListeners() {
    if (this.ipcQrHandler) {
      ipcMain.removeListener('whatsapp-qr-update', this.ipcQrHandler);
      this.ipcQrHandler = null;
    }
    if (this.ipcStatusHandler) {
      ipcMain.removeListener('whatsapp-status-update', this.ipcStatusHandler);
      this.ipcStatusHandler = null;
    }
    if (this.ipcMessageHandler) {
      ipcMain.removeListener('whatsapp-message', this.ipcMessageHandler);
      this.ipcMessageHandler = null;
    }
  }

  // --- IntegrationProvider Interface Implementation ---

  async initialize(config: IntegrationConfig): Promise<void> {
    this.config = config;
    this.status = IntegrationStatus.DISCONNECTED;
  }

  async generateQRCode(sessionToken: string): Promise<QRCodeData> {
    // Opens a visible WhatsApp Web window where the user scans the QR directly.
    // This is the most reliable approach — WhatsApp Web's QR is rendered in a
    // canvas element whose internal data changes frequently, making DOM scraping
    // brittle. By showing the real page, we guarantee QR always works.
    await this.connectInternal();

    // Start polling for connection from main process side
    this.startConnectionPolling();

    // Return immediately — the popup window IS the QR display.
    // The UI should show a "Scan the QR in the popup window" message.
    return {
      qrString: 'WINDOW_OPEN',
      imageData: '',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sessionToken,
    };
  }

  /**
   * Polls the WhatsApp Web page from the main process to detect when the user
   * has successfully scanned the QR code and is connected.
   * This uses executeJavaScript directly — no preload IPC dependency.
   */
  private startConnectionPolling() {
    if (this.connectionPollInterval) {
      clearInterval(this.connectionPollInterval);
    }

    this.connectionPollInterval = setInterval(async () => {
      if (!this.window || this.window.isDestroyed()) {
        this.stopConnectionPolling();
        return;
      }

      try {
        // Check if WhatsApp Web shows the main chat UI (means connected)
        const isConnected = await this.window.webContents.executeJavaScript(`
          !!(document.querySelector('#side') ||
             document.querySelector('[data-testid="chat-list"]') ||
             document.querySelector('[aria-label="Chat list"]') ||
             document.querySelector('div[data-tab="3"]'))
        `);

        if (isConnected && this.status !== IntegrationStatus.CONNECTED) {
          console.log('[WhatsApp] Connection detected — user scanned QR successfully');
          this.status = IntegrationStatus.CONNECTED;
          this.emitStatus(IntegrationStatus.CONNECTED);
          this.emit('connected');
          this.stopConnectionPolling();

          // Move OFF-SCREEN (not minimize!) so the page keeps FULLY rendering.
          // Minimized windows may have DOM updates suspended on Windows.
          // Off-screen windows remain fully active for DOM queries + MutationObserver.
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.setBackgroundThrottling(false);
            this.window.setPosition(-2000, -2000);
          }

          // Re-inject notification override (in case page reloaded) + module raiding for send
          this.injectNotificationOverride();
          this.injectModuleRaidScript();

          // Start listening for incoming messages
          this.startMessagePolling();
        }
      } catch (_err) {
        // Window may have been destroyed between check and exec — ignore
      }
    }, 3000);
  }

  private stopConnectionPolling() {
    if (this.connectionPollInterval) {
      clearInterval(this.connectionPollInterval);
      this.connectionPollInterval = null;
    }
  }

  /**
   * Polls for new incoming messages from WhatsApp Web.
   *
   * PRIMARY STRATEGY: Sidebar preview text scanning.
   * Each chat item in the sidebar shows the last message as a preview.
   * We scan all sidebar items for previews containing "@accomplish" — this
   * works WITHOUT opening any chat, no module raiding, no click simulation.
   *
   * Also drains notification + MutationObserver queues as secondary sources.
   *
   * Trigger format:  @accomplish <your task description>
   * Example:         @accomplish explain the weather today
   */
  private pollCount = 0;
  private pollingInFlight = false;

  private startMessagePolling() {
    if (this.messagePollInterval) {
      clearInterval(this.messagePollInterval);
    }

    this.pollCount = 0;
    this.pollingInFlight = false;

    // Poll every 3 seconds
    this.messagePollInterval = setInterval(async () => {
      if (!this.window || this.window.isDestroyed()) {
        this.stopMessagePolling();
        return;
      }

      // Guard against overlapping async poll cycles
      if (this.pollingInFlight) {
        return;
      }
      this.pollingInFlight = true;

      this.pollCount++;

      try {
        const isBaselineScan = this.pollCount === 1;
        const result = await this.window.webContents.executeJavaScript(`
          (function() {
            var results = [];
            var TRIGGER = '@accomplish';
            var NOW = Date.now();
            var BASELINE = ${isBaselineScan ? 'true' : 'false'};
            var diag = {
              title: document.title || '',
              titleUnread: 0,
              notifQ: (window.__waIncomingMessages || []).length,
              mutQ: (window.__waMutationMessages || []).length,
              sidebarItems: 0,
              sidebarPreviews: 0,
              triggerFound: 0,
              sidebarHits: 0,
              visState: document.visibilityState,
              hidden: document.hidden
            };

            // Content-based dedup: track last processed preview text per chat.
            // Only fire when the preview text for a chat CHANGES to a new @accomplish message.
            // This prevents re-detection of the same message that stays in the sidebar.
            if (!window.__waLastChatPreview) window.__waLastChatPreview = {};

            // Helper: strip non-printable Unicode formatting chars (LRM, RLM, ZWS, guillemets, smart quotes)
            function cleanText(t) {
              return (t || '')
                .replace(/[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\uFEFF]/g, '') // zero-width and bidi
                .replace(/^[\\u00AB\\u00BB\\u201C\\u201D\\u201E\\u201F\\u2018\\u2019\\u2039\\u203A\\xAB\\xBB"'\\s]+/, '') // leading quotes
                .replace(/[\\u00AB\\u00BB\\u201C\\u201D\\u201E\\u201F\\u2018\\u2019\\u2039\\u203A\\xAB\\xBB"'\\s]+$/, '') // trailing quotes
                .trim();
            }

            // --- Secondary: Drain notification capture queue ---
            if (window.__waIncomingMessages && window.__waIncomingMessages.length > 0) {
              while (window.__waIncomingMessages.length > 0) {
                var nm = window.__waIncomingMessages.shift();
                if (nm && nm.text && nm.text.toLowerCase().indexOf(TRIGGER) !== -1) {
                  nm.text = cleanText(nm.text);
                  results.push(nm);
                }
              }
            }

            // --- Secondary: Drain MutationObserver queue ---
            if (window.__waMutationMessages && window.__waMutationMessages.length > 0) {
              while (window.__waMutationMessages.length > 0) {
                var mm = window.__waMutationMessages.shift();
                if (mm && mm.text && mm.text.toLowerCase().indexOf(TRIGGER) !== -1) {
                  mm.text = cleanText(mm.text);
                  results.push(mm);
                }
              }
            }

            // --- Title unread count ---
            var titleMatch = (document.title || '').match(/\\((\\d+)\\)/);
            diag.titleUnread = titleMatch ? parseInt(titleMatch[1], 10) : 0;

            // =====================================================
            // PRIMARY STRATEGY: Sidebar preview text scanning
            // =====================================================
            try {
              var listItems = document.querySelectorAll('[data-testid="cell-frame-container"]');
              if (listItems.length === 0) listItems = document.querySelectorAll('#pane-side [role="listitem"]');
              if (listItems.length === 0) listItems = document.querySelectorAll('#pane-side [role="row"]');
              if (listItems.length === 0) {
                var sidePane = document.querySelector('#pane-side');
                if (sidePane) listItems = sidePane.querySelectorAll('[tabindex="-1"]');
              }
              diag.sidebarItems = listItems.length;

              for (var si = 0; si < listItems.length; si++) {
                var item = listItems[si];

                // --- Get the contact/group name ---
                var nameEl = item.querySelector('span[title]');
                var chatName = nameEl ? (nameEl.getAttribute('title') || '').trim() : '';

                // --- Get the message preview text ---
                var previewText = '';

                // Method 1: data-testid approach
                var previewEl = item.querySelector('[data-testid="last-msg-status"]');
                if (previewEl) {
                  var parent = previewEl.closest('[class]');
                  if (parent) {
                    previewText = (parent.textContent || '').trim();
                  }
                }

                // Method 2: second span[title]
                if (!previewText) {
                  var titleSpans = item.querySelectorAll('span[title]');
                  if (titleSpans.length >= 2) {
                    previewText = (titleSpans[1].getAttribute('title') || '').trim();
                  }
                }

                // Method 3: span[dir] that isn't the chat name
                if (!previewText) {
                  var dirSpans = item.querySelectorAll('span[dir]');
                  for (var ds = 0; ds < dirSpans.length; ds++) {
                    var dText = (dirSpans[ds].textContent || '').trim();
                    if (dText && dText !== chatName && dText.length > 5 && !/^\\d{1,2}:\\d{2}/.test(dText)) {
                      previewText = dText;
                      break;
                    }
                  }
                }

                // Method 4: Broadest fallback
                if (!previewText) {
                  var allSpans = item.querySelectorAll('span');
                  for (var as2 = 0; as2 < allSpans.length; as2++) {
                    var sTxt = (allSpans[as2].textContent || '').trim();
                    if (sTxt && sTxt !== chatName && sTxt.length > 5 && sTxt.toLowerCase().indexOf(TRIGGER) !== -1) {
                      previewText = sTxt;
                      break;
                    }
                  }
                }

                if (previewText) diag.sidebarPreviews++;

                // --- Extract time indicator from sidebar item (e.g. "10:44 PM", "Yesterday") ---
                var timeText = '';
                try {
                  var allSpansTime = item.querySelectorAll('span');
                  for (var tsi = 0; tsi < allSpansTime.length; tsi++) {
                    var spt = (allSpansTime[tsi].textContent || '').trim();
                    if (spt && spt !== chatName && spt.length <= 12 &&
                        (/^\\d{1,2}:\\d{2}/.test(spt) || /^yesterday/i.test(spt) || /^\\d{1,2}[\\/\\-]\\d{1,2}/.test(spt))) {
                      timeText = spt;
                      break;
                    }
                  }
                } catch(e2) {}

                // --- Clean the preview and check for @accomplish trigger ---
                var cleaned = cleanText(previewText);
                var lowerCleaned = cleaned.toLowerCase();
                if (lowerCleaned.indexOf(TRIGGER) !== -1) {
                  diag.triggerFound++; // Count before dedup

                  // Dedup uses content + time indicator. When a new message arrives
                  // (even with same text), the time indicator changes, so we detect it.
                  var chatKey = chatName || 'unknown-chat';
                  var currentSig = cleaned + '||' + timeText;
                  var lastSig = window.__waLastChatPreview[chatKey];

                  if (lastSig !== currentSig) {
                    window.__waLastChatPreview[chatKey] = currentSig;

                    // On baseline scan (poll #1), seed the map but don't trigger tasks.
                    // This prevents old messages already in sidebar from firing.
                    if (BASELINE) {
                      continue;
                    }

                    diag.sidebarHits++;

                    results.push({
                      id: 'sidebar-' + NOW + '-' + si,
                      text: cleaned,
                      senderId: chatName || 'sidebar-sender',
                      senderName: chatName || 'Unknown',
                      timestamp: NOW,
                      chatId: chatName || 'sidebar-chat'
                    });
                    // silent — sidebar hit logged via main process callback
                  }
                }
              }

              // Content-based dedup has no expiry — entries stay until preview text changes.
              // Limit map size to prevent memory leak (keep last 200 chats).
              var chatKeys = Object.keys(window.__waLastChatPreview);
              if (chatKeys.length > 200) {
                for (var ck = 0; ck < chatKeys.length - 200; ck++) {
                  delete window.__waLastChatPreview[chatKeys[ck]];
                }
              }
            } catch(e) {
              diag.sidebarError = e.message || String(e);
            }

            return { messages: results, diag: diag };
          })()
        `);

        const messages = result?.messages || [];
        const _diag = result?.diag || {};

        // On baseline scan, skip processing (seeding dedup)
        if (isBaselineScan) {
          return;
        }

        if (messages.length > 0) {
          for (const msg of messages) {
            // Deduplicate by message ID
            if (this.lastSeenMessageIds.has(msg.id)) {
              continue;
            }
            this.lastSeenMessageIds.add(msg.id);

            // Keep the set from growing forever
            if (this.lastSeenMessageIds.size > 500) {
              const iter = this.lastSeenMessageIds.values();
              for (let i = 0; i < 250; i++) iter.next();
              const keep = new Set<string>();
              for (const v of iter) keep.add(v);
              this.lastSeenMessageIds = keep;
            }

            // Store the sender JID so we can reply to them later
            for (const tunnelId of this.activeConnections.keys()) {
              this.messageSenderMap.set(tunnelId, msg.senderId);
            }

            // Forward to all message callbacks (manager listens here)
            this.handleIncomingMessage({
              id: msg.id,
              text: msg.text,
              senderId: msg.senderId,
              senderName: msg.senderName || 'Unknown',
              timestamp: msg.timestamp,
              chatId: msg.chatId || '',
            });
          }
        }
      } catch (err) {
        console.error('[WhatsApp] Message poll error:', err);
      } finally {
        this.pollingInFlight = false;
      }
    }, 3000);
  }

  private stopMessagePolling() {
    if (this.messagePollInterval) {
      clearInterval(this.messagePollInterval);
      this.messagePollInterval = null;
    }
  }

  async setupTunnel(tunnelId: string): Promise<TunnelConfig> {
    // Reusing logic from original implementation
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const deviceId = crypto.randomBytes(16).toString('hex');

      const tunnelConfig: TunnelConfig = {
        tunnelId,
        platform: this.platform,
        endpoint: `http://localhost:3000/pair?tunnelId=${tunnelId}`,
        token,
        deviceId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      this.activeConnections.set(tunnelId, tunnelConfig);

      // Register with tunnel server if needed
      try {
        const tunnelServer = getTunnelServer();
        tunnelServer.registerTunnel(tunnelId, this.platform, deviceId);
      } catch (e) {
        console.warn('[WhatsApp] Tunnel server not available or failed', e);
      }

      this.emit('tunnel-established', tunnelConfig);
      return tunnelConfig;
    } catch (error) {
      this.emit('error', error);
      throw new Error(
        `Failed to setup WhatsApp tunnel: ${error instanceof Error ? error.message : String(error)}`,
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
        console.warn(`[WhatsApp] sendProgressUpdate: tunnel ${tunnelId} not found — skipping`);
        return;
      }

      // Get sender JID — may be a display name if scraped from sidebar
      const senderJID = this.messageSenderMap.get(tunnelId);
      const isValidJID = senderJID && /^\d+@(s\.whatsapp\.net|g\.us)$/.test(senderJID);

      if (!senderJID || !isValidJID) {
        // Sender unknown or not a valid JID — fall back to tunnel server
        try {
          const tunnelServer = getTunnelServer();
          await tunnelServer.sendProgressUpdate(tunnelId, event);
        } catch (e) {
          console.warn('[WhatsApp] Tunnel server sendProgressUpdate failed:', e);
        }
        return;
      }

      // Format message
      const progressMessage = `📊 Task: ${event.taskId}\nStatus: ${event.status}\n${event.message || ''}`;

      // Try to send via hidden window — if Store isn't ready, just log
      try {
        await this.sendMessage(senderJID, progressMessage);
        this.emit('message-sent', {
          tunnelId,
          taskId: event.taskId,
          status: event.status,
          recipient: senderJID,
          timestamp: Date.now(),
        });
      } catch (_sendErr) {
        // Sending replies requires Store (module raid) — it may not be available.
        // This is non-fatal: task execution continues regardless.
        console.warn(`[WhatsApp] Cannot send reply (Store likely not ready) — task still runs`);
      }
    } catch (error) {
      // Non-fatal — task should still execute even if we can't send status back
      console.warn(
        '[WhatsApp] sendProgressUpdate error (non-fatal):',
        error instanceof Error ? error.message : error,
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMessage(callback: (message: any) => void): () => void {
    this.messageCallbacks.push(callback);
    // Return unsubscribe function
    return () => {
      this.messageCallbacks = this.messageCallbacks.filter((cb) => cb !== callback);
    };
  }

  async disconnect(): Promise<void> {
    this.stopConnectionPolling();
    this.stopMessagePolling();
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
      this.window = null;
    }
    this.status = IntegrationStatus.DISCONNECTED;
    this.emitStatus(IntegrationStatus.DISCONNECTED);
    this.emit('disconnected');
    return Promise.resolve();
  }

  /**
   * Auto-reconnect from a previous session.
   * Opens the WhatsApp Web window **hidden / off-screen** so the user isn't
   * interrupted. Electron's persistent partition (`persist:whatsapp`) keeps
   * the WA session cookies/localStorage, so WhatsApp Web should auto-login
   * without requiring a QR scan.
   *
   * If the session has expired and a QR scan is needed, the window is made
   * visible after a timeout so the user can re-scan.
   */
  async reconnect(): Promise<void> {
    await this.connectInternal({ hidden: true });
    this.startConnectionPolling();

    // If not connected within 30s, the session likely expired — show window
    // so user can re-scan QR.
    const reconnectTimeout = setTimeout(() => {
      if (
        this.status !== IntegrationStatus.CONNECTED &&
        this.window &&
        !this.window.isDestroyed()
      ) {
        console.log('[WhatsApp] Session expired — showing window for QR re-scan');
        this.window.setPosition(100, 100);
        this.window.show();
        this.window.focus();
      }
    }, 30_000);

    // Clear the timeout once connected (or if window is closed)
    const clearOnConnect = () => {
      clearTimeout(reconnectTimeout);
      this.removeListener('connected', clearOnConnect);
      this.removeListener('disconnected', clearOnConnect);
    };
    this.once('connected', clearOnConnect);
    this.once('disconnected', clearOnConnect);
  }

  async cleanup(): Promise<void> {
    await this.dispose();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.removeIpcListeners();
    await this.disconnect();
    this.messageCallbacks = [];
    this.qrCallbacks = [];
    this.statusCallbacks = [];
    this.activeConnections.clear();
  }

  // --- Internal Methods ---

  private async connectInternal(options?: { hidden?: boolean }): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      if (!options?.hidden) {
        this.window.focus();
      }
      return;
    }

    const hidden = options?.hidden ?? false;

    this.status = IntegrationStatus.CONNECTING;
    this.emitStatus(IntegrationStatus.CONNECTING);

    // In ESM context (type: module), __dirname is not available.
    // We use app.getAppPath() which points to the app root (or resources/app in prod).
    // The preload script is built to dist-electron/preload/integrations/whatsapp.cjs
    const _preloadPath = path.join(
      app.getAppPath(),
      'dist-electron/preload/integrations/whatsapp.cjs',
    );

    this.window = new BrowserWindow({
      width: 1000,
      height: 800,
      show: !hidden,
      ...(hidden ? { x: -2000, y: -2000 } : {}),
      title: 'WhatsApp Web — Scan QR Code',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false, // Keep timers active when window is hidden/off-screen
        // No preload needed — we use executeJavaScript for all WA page interaction
        partition: 'persist:whatsapp',
      },
    });

    this.window.webContents.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    // Auto-grant notification permission so WhatsApp Web fires notifications
    this.window.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'notifications');
    });

    await this.window.loadURL('https://web.whatsapp.com');

    // Inject notification override ASAP to capture incoming messages
    this.injectNotificationOverride();

    // Re-inject on every page navigation/reload (WhatsApp Web does SPA navigations)
    this.window.webContents.on('dom-ready', () => {
      this.injectNotificationOverride();
    });

    this.window.on('closed', () => {
      this.window = null;
      this.stopConnectionPolling();
      this.status = IntegrationStatus.DISCONNECTED;
      this.emitStatus(IntegrationStatus.DISCONNECTED);
      this.emit('disconnected');
    });

    this.window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error('[WhatsApp] Failed to load:', errorDescription);
      this.emitStatus(IntegrationStatus.ERROR, errorDescription);
    });
  }

  async sendMessage(to: string, message: string): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      throw new Error('WhatsApp is not connected');
    }

    const formattedNumber = to.replace(/\D/g, '');
    const chatId = formattedNumber.includes('@') ? formattedNumber : `${formattedNumber}@c.us`;

    // Use JSON.stringify to safely escape the message string and prevent injection
    const safeChatId = JSON.stringify(chatId);
    const safeMessage = JSON.stringify(message);
    const sendScript = `
      (async () => {
        try {
          if (!window.Store || !window.Store.SendMessage) {
             return { success: false, error: 'Store not ready' };
          }
          const chat = await window.Store.Chat.find(${safeChatId});
          if (!chat) return { success: false, error: 'Chat not found' };
          
          await window.Store.SendMessage.sendTextMsgToChat(chat, ${safeMessage});
          return { success: true };
        } catch (err) {
          return { success: false, error: err.toString() };
        }
      })()
    `;

    const result = await this.window.webContents.executeJavaScript(sendScript);
    if (!result.success) {
      throw new Error(`Failed to send message: ${result.error}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleIncomingMessage(rawMessage: any) {
    // Logic from old provider: parse and emit
    // Here rawMessage comes from preload
    // For now, just pass it through
    this.messageCallbacks.forEach((cb) => cb(rawMessage));
  }

  private emitQR(qrString: string) {
    const qrData: QRCodeData = {
      qrString: qrString,
      imageData: '', // If needed, generate with qrcode lib or leave empty if frontend can invoke it
      expiresAt: Date.now() + 60000,
      sessionToken: '',
    };
    this.emit('qr', qrData); // Emit generic event
    this.qrCallbacks.forEach((cb) => cb(qrData));
  }

  private emitStatus(status: IntegrationStatus, error?: string) {
    this.statusCallbacks.forEach((cb) => cb(status, error));
  }

  // Interface requires specific on() overloads but TypeScript usually handles EventEmitter OK
  // unless strictly typed. The interface extends Omit<EventEmitter, ...> so we might need strict impl if not extending EventEmitter properly.
  // We extend EventEmitter so we inherit on/emit.

  onQR(callback: (qrData: QRCodeData) => void): () => void {
    this.qrCallbacks.push(callback);
    return () => {
      this.qrCallbacks = this.qrCallbacks.filter((cb) => cb !== callback);
    };
  }

  onStatusChange(callback: (status: IntegrationStatus, error?: string) => void): () => void {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Injects notification override + MutationObserver + visibility overrides
   * for real-time message detection.
   * - Visibility override: forces WhatsApp to think the tab is always visible/focused
   *   so it keeps updating the sidebar DOM even when the window is off-screen
   * - Notification override: captures incoming messages via Notification API
   * - MutationObserver: watches the DOM for new message nodes
   * Idempotent — safe to call multiple times.
   */
  private injectNotificationOverride() {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const script = `
      (function() {
        // --- Visibility override ---
        // WhatsApp Web stops updating the sidebar DOM when it detects the tab
        // is hidden/unfocused. We override these APIs so it always thinks the
        // page is visible, keeping the sidebar live even when the window is off-screen.
        if (!window.__waVisibilityOverridden) {
          // Override document.hidden to always return false
          Object.defineProperty(document, 'hidden', {
            get: function() { return false; },
            configurable: true
          });

          // Override document.visibilityState to always return 'visible'
          Object.defineProperty(document, 'visibilityState', {
            get: function() { return 'visible'; },
            configurable: true
          });

          // Suppress visibilitychange events that would tell WhatsApp we're hidden
          document.addEventListener('visibilitychange', function(e) {
            e.stopImmediatePropagation();
          }, true);

          // Override Page Visibility API (some builds use this)
          if (document.onvisibilitychange !== undefined) {
            document.onvisibilitychange = null;
          }

          // Periodically dispatch focus/visibilitychange to keep WhatsApp "awake"
          setInterval(function() {
            try {
              window.dispatchEvent(new Event('focus'));
              document.dispatchEvent(new Event('focus'));
            } catch(e) {}
          }, 15000);

          window.__waVisibilityOverridden = true;
        }

        // --- Notification override ---
        if (!window.__waNotifOverridden) {
          window.__waIncomingMessages = [];
          var OrigNotif = window.Notification;

          function PatchedNotif(title, options) {
            try {
              var body = (options && options.body) || '';
              if (body) {
                window.__waIncomingMessages.push({
                  id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                  senderName: title || 'Unknown',
                  text: body,
                  senderId: (options && options.tag) || title || 'unknown',
                  timestamp: Date.now()
                });
                // silent
              }
            } catch(e) {
              // silent — capture error
            }
            return new OrigNotif(title, options);
          }

          PatchedNotif.prototype = OrigNotif.prototype;
          PatchedNotif.requestPermission = function(cb) {
            if (cb) cb('granted');
            return Promise.resolve('granted');
          };
          Object.defineProperty(PatchedNotif, 'permission', {
            get: function() { return 'granted'; }
          });

          window.Notification = PatchedNotif;
          window.__waNotifOverridden = true;
        }

        // --- MutationObserver for real-time message detection ---
        if (!window.__waMutationObserverInstalled) {
          window.__waMutationMessages = [];
          window.__waMutationLastText = '';

          function startObserver() {
            var pane = document.querySelector('#app') || document.body;

            var observer = new MutationObserver(function(mutations) {
              for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                  var node = added[j];
                  if (!(node instanceof HTMLElement)) continue;

                  var msgEls = node.querySelectorAll
                    ? node.querySelectorAll('span.selectable-text span, [data-testid="msg-container"] span[dir]')
                    : [];

                  if (node.matches && node.matches('span.selectable-text span')) {
                    msgEls = [node];
                  }

                  for (var k = 0; k < msgEls.length; k++) {
                    var text = (msgEls[k].textContent || '').trim();
                    if (text && text !== window.__waMutationLastText && text.length > 1) {
                      window.__waMutationLastText = text;

                      var headerEl = document.querySelector('header span[title]') ||
                                     document.querySelector('[data-testid="conversation-info-header"] span[title]');
                      var senderName = headerEl ? headerEl.getAttribute('title') : 'Unknown';

                      window.__waMutationMessages.push({
                        id: 'mut-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
                        text: text,
                        senderId: senderName || 'mutation-sender',
                        senderName: senderName || 'Unknown',
                        timestamp: Date.now(),
                        chatId: 'mutation-chat'
                      });
                      // silent — mutation detected
                    }
                  }
                }
              }
            });

            observer.observe(pane, { childList: true, subtree: true });
            window.__waMutationObserverInstalled = true;
          }

          startObserver();
        }
      })()
    `;

    this.window.webContents
      .executeJavaScript(script)
      .catch((err) => console.error('[WhatsApp] Failed to inject overrides:', err));
  }

  /**
   * Injects the webpack module raiding script AFTER connection is established.
   * Finds internal Store modules for Chat reading and SendMessage.
   * This is BEST-EFFORT — modern WhatsApp Web (2025+) may have patched the
   * webpackChunk push technique. The sidebar+DOM strategies handle message
   * reception even if this fails completely.
   */
  private injectModuleRaidScript() {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const script = `
      (function() {
        if (window.__waModuleRaidDone) return;
        var attempts = 0;
        var maxAttempts = 15;

        function raidModules() {
          attempts++;

          // --- Find webpack require function ---
          var wpRequire = null;

          // Method 1: Push onto webpackChunk array (classic technique)
          var chunkArrays = [];
          var allKeys = [];
          try { allKeys = Object.getOwnPropertyNames(window); } catch(e) { allKeys = Object.keys(window); }

          for (var wi = 0; wi < allKeys.length; wi++) {
            try {
              if (allKeys[wi].indexOf('webpackChunk') === 0 && Array.isArray(window[allKeys[wi]])) {
                chunkArrays.push(window[allKeys[wi]]);
              }
            } catch(e) {}
          }
          if (window.webpackChunkwhatsapp_web_client && chunkArrays.indexOf(window.webpackChunkwhatsapp_web_client) === -1) {
            chunkArrays.push(window.webpackChunkwhatsapp_web_client);
          }

          for (var ca = 0; ca < chunkArrays.length; ca++) {
            try {
              chunkArrays[ca].push([
                ['_wa_raid_' + Date.now()],
                {},
                function(req) { wpRequire = req; }
              ]);
              if (wpRequire) {
                break;
              }
            } catch(e) {}
          }

          // Method 2: Scan window properties for webpack require-like functions
          // Accept functions that have EITHER .m (definitions) OR .c (cache)
          if (!wpRequire) {
            for (var gi = 0; gi < allKeys.length; gi++) {
              try {
                var v = window[allKeys[gi]];
                if (v && typeof v === 'function') {
                  if ((v.m && typeof v.m === 'object') || (v.c && typeof v.c === 'object')) {
                    wpRequire = v;
                    // found require-like function
                    break;
                  }
                }
              } catch(e) {}
            }
          }

          // Method 3: Look for __webpack_require__ or __webpack_modules__ on window/self/globalThis
          if (!wpRequire) {
            var globals = [window, self];
            try { globals.push(globalThis); } catch(e) {}
            for (var gx = 0; gx < globals.length; gx++) {
              try {
                if (globals[gx].__webpack_require__) {
                  wpRequire = globals[gx].__webpack_require__;
                  // found __webpack_require__
                  break;
                }
              } catch(e) {}
            }
          }

          // Method 4: Scan chunk array entries for runtime functions that expose require
          if (!wpRequire && chunkArrays.length > 0) {
            for (var cx = 0; cx < chunkArrays.length && !wpRequire; cx++) {
              for (var ci = chunkArrays[cx].length - 1; ci >= 0 && !wpRequire; ci--) {
                try {
                  var entry = chunkArrays[cx][ci];
                  if (entry && entry[2] && typeof entry[2] === 'function') {
                    // The runtime function is called with __webpack_require__
                    // Try to intercept it
                    var captured = null;
                    var proxy = new Proxy(function(){}, {
                      apply: function(target, thisArg, args) { return undefined; },
                      get: function(target, prop) {
                        if (prop === 'O' || prop === 'r' || prop === 'd' || prop === 'n') {
                          return function() {};
                        }
                        return undefined;
                      }
                    });
                    // Don't actually call runtime (dangerous), just check if structure exists
                  }
                } catch(e) {}
              }
            }
          }

          if (!wpRequire) {
            // retry silently
            return false;
          }

          // --- Extract module exports ---
          var modules = [];

          // Try cache first (e.c) — faster, no side effects
          if (wpRequire.c && typeof wpRequire.c === 'object') {
            var cKeys = Object.keys(wpRequire.c);
            for (var ck = 0; ck < cKeys.length; ck++) {
              try {
                var cached = wpRequire.c[cKeys[ck]];
                if (cached && cached.exports) modules.push(cached.exports);
              } catch(e) {}
            }
            // cache scanned
          }

          // Fallback: require from definitions (e.m)
          if (modules.length === 0 && wpRequire.m && typeof wpRequire.m === 'object') {
            var mKeys = Object.keys(wpRequire.m);
            for (var mi = 0; mi < Math.min(mKeys.length, 5000); mi++) {
              try { modules.push(wpRequire(mKeys[mi])); } catch(e) {}
            }
            // definitions loaded
          }

          if (modules.length === 0) {
            // 0 modules extracted
            return false;
          }

          window.Store = window.Store || {};

          // --- Scan for Store modules ---
          for (var i = 0; i < modules.length; i++) {
            var m = modules[i];
            if (!m) continue;

            var targets = [m];
            if (m.default) targets.push(m.default);
            if (m.__esModule && m.default) targets.push(m.default);

            for (var t = 0; t < targets.length; t++) {
              var mod = targets[t];
              if (!mod || typeof mod !== 'object') continue;

              try {
                if (!window.Store.Chat) {
                  if (typeof mod.getModelsArray === 'function' && typeof mod.find === 'function') {
                    try {
                      var arr = mod.getModelsArray();
                      if (arr.length > 0 && arr[0] && arr[0].msgs) {
                        window.Store.Chat = mod;
                      }
                    } catch(e) {}
                  }
                  if (!window.Store.Chat && mod.ChatCollection) {
                    window.Store.Chat = mod.ChatCollection;
                  }
                }

                if (!window.Store.SendMessage) {
                  if (typeof mod.sendTextMsgToChat === 'function') {
                    window.Store.SendMessage = mod;
                  } else if (typeof mod.addAndSendMsgToChat === 'function') {
                    window.Store.SendMessage = mod;
                  }
                }
              } catch(e) {}
            }
          }

          var hasChat = !!window.Store.Chat;
          var hasSend = !!window.Store.SendMessage;

          // If Chat found, install real-time listeners
          if (window.Store.Chat && !window.__waStoreListenerInstalled) {
            try {
              if (!window.__waIncomingMessages) window.__waIncomingMessages = [];
              var chatArr = window.Store.Chat.getModelsArray();
              var listenCount = 0;
              for (var li = 0; li < chatArr.length; li++) {
                (function(chat) {
                  if (chat.msgs && typeof chat.msgs.on === 'function') {
                    chat.msgs.on('add', function(msg) {
                      if (msg && msg.body) {
                        window.__waIncomingMessages.push({
                          id: (msg.id && (msg.id._serialized || msg.id.id)) || ('evt-' + Date.now()),
                          text: msg.body,
                          senderId: msg.from || (chat.id && chat.id._serialized) || 'unknown',
                          senderName: chat.name || chat.formattedTitle || 'Unknown',
                          timestamp: (msg.t || Math.floor(Date.now()/1000)) * 1000,
                          chatId: (chat.id && chat.id._serialized) || 'unknown'
                        });
                        // silent — store event
                      }
                    });
                    listenCount++;
                  }
                })(chatArr[li]);
              }
              window.__waStoreListenerInstalled = true;
            } catch(e) {
              // listener install error — non-fatal
            }
          }

          window.__waModuleRaidDone = hasChat || hasSend;
          return hasChat || hasSend;
        }

        var interval = setInterval(function() {
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            // max attempts reached — relying on sidebar strategy
            return;
          }
          if (raidModules()) {
            clearInterval(interval);
            // raid complete
          }
        }, 3000);
      })()
    `;

    this.window.webContents
      .executeJavaScript(script)
      .catch((err) => console.error('[WhatsApp] Failed to inject module raid:', err));
  }
}
