/**
 * Tunnel – outbound WebSocket relay for remote messaging integrations.
 *
 * When the user enables "Connect from WhatsApp" (or any channel), this module
 * opens an **outbound** WebSocket to a relay service so that remote messages
 * can reach the local Accomplish instance without the user having to open any
 * inbound ports or configure firewalls.
 *
 * Architecture (mirrors OpenClaw):
 *   Local machine  ──WS──▶  Relay service  ◀──HTTPS──  WhatsApp webhook
 *
 * The relay is stateless message-forwarding only; all task state stays local.
 *
 * TODO: Replace the placeholder relay URL with something configurable / self-hosted.
 */

export interface TunnelOptions {
  /** The relay service WebSocket URL */
  relayUrl: string;
  /** A unique machine identifier (persisted) so the relay can route to us */
  machineId: string;
  /** Callback when a message arrives from the relay */
  onMessage: (data: unknown) => void;
  /** Callback on status changes */
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

export class Tunnel {
  private ws: WebSocket | null = null;
  private options: TunnelOptions;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  constructor(options: TunnelOptions) {
    this.options = options;
  }

  /** Open the outbound tunnel */
  open(): void {
    this.shouldReconnect = true;
    this.connect();
  }

  /** Close the tunnel permanently (until next `open()` call) */
  close(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.options.onStatusChange?.('disconnected');
  }

  /** Send a message through the tunnel to the relay */
  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // -------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------

  private connect(): void {
    if (this.ws) {
      this.ws.close();
    }

    this.options.onStatusChange?.('connecting');

    const url = `${this.options.relayUrl}?machineId=${encodeURIComponent(this.options.machineId)}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.options.onStatusChange?.('error');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.options.onStatusChange?.('connected');
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(event.data));
        this.options.onMessage(parsed);
      } catch {
        // Ignore non-JSON frames
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect) {
        this.options.onStatusChange?.('disconnected');
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.options.onStatusChange?.('error');
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.shouldReconnect) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, 5_000);
  }
}
