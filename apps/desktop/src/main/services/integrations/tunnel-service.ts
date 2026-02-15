/**
 * Tunnel Service
 *
 * Provides a secure tunnel connection to expose a local HTTP endpoint
 * for receiving messages from messaging platforms.
 *
 * Similar to OpenClaw tunnel approach - creates an HTTP server locally
 * and establishes a tunnel to make it accessible from the internet.
 *
 * In production, this would use a service like:
 * - cloudflared (Cloudflare Tunnel)
 * - ngrok
 * - localtunnel
 * - A custom tunnel server
 *
 * This implementation provides the architecture with a local HTTP server
 * that can be fronted by any tunnel provider.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import type { TunnelState } from './types';

export interface TunnelConfig {
  /** Port for the local HTTP server */
  port?: number;
  /** Secret token for authenticating tunnel requests */
  authToken?: string;
}

export class TunnelService extends EventEmitter {
  private server: Server | null = null;
  private state: TunnelState = { active: false };
  private config: TunnelConfig;
  private messageHandler: ((body: unknown) => void) | null = null;
  private authToken: string;

  constructor(config: TunnelConfig = {}) {
    super();
    this.config = config;
    this.authToken = config.authToken || crypto.randomBytes(32).toString('hex');
  }

  /** Get the current tunnel state */
  getState(): TunnelState {
    return { ...this.state };
  }

  /** Get the auth token for this tunnel */
  getAuthToken(): string {
    return this.authToken;
  }

  /** Set handler for incoming messages through the tunnel */
  setMessageHandler(handler: (body: unknown) => void): void {
    this.messageHandler = handler;
  }

  /** Start the local HTTP server and tunnel */
  async start(): Promise<TunnelState> {
    if (this.server) {
      return this.state;
    }

    return new Promise((resolve, reject) => {
      const port = this.config.port || 0; // 0 = auto-assign

      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error: Error) => {
        console.error('[Tunnel] Server error:', error);
        this.updateState({ active: false, lastError: error.message });
        reject(error);
      });

      this.server.listen(port, '127.0.0.1', () => {
        const address = this.server!.address();
        const actualPort = typeof address === 'object' && address ? address.port : port;

        // In production, this is where you'd start the tunnel:
        // e.g., cloudflared tunnel --url http://127.0.0.1:${actualPort}
        // For now, we use the local URL
        const localUrl = `http://127.0.0.1:${actualPort}`;

        this.updateState({
          active: true,
          url: localUrl,
          connectedAt: new Date().toISOString(),
        });

        console.log(`[Tunnel] Local server started on ${localUrl}`);
        console.log(`[Tunnel] Auth token: ${this.authToken.substring(0, 8)}...`);

        resolve(this.state);
      });
    });
  }

  /** Stop the tunnel and local server */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.updateState({ active: false });
          console.log('[Tunnel] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /** Handle incoming HTTP requests */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
      return;
    }

    // Message endpoint - receives messages from messaging platforms
    if (req.method === 'POST' && req.url === '/api/message') {
      // Verify auth token
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${this.authToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (this.messageHandler) {
            this.messageHandler(parsed);
          }
          this.emit('message', parsed);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'received' }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // Task status endpoint - allows querying task progress
    if (req.method === 'GET' && req.url?.startsWith('/api/task/')) {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${this.authToken}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      // Emit a task-status-request event so the integration manager can respond
      const taskId = req.url.replace('/api/task/', '');
      this.emit('task-status-request', taskId, (statusData: unknown) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(statusData || { error: 'Task not found' }));
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private updateState(state: TunnelState): void {
    this.state = state;
    this.emit('state-change', state);
  }
}
