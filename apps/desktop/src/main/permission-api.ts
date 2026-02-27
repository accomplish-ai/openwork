/**
 * Permission API Server
 *
 * HTTP server that the file-permission MCP server calls to request
 * user permission for file operations. This bridges the MCP server
 * (separate process) with the Electron UI.
 */

import http from 'http';
import type { BrowserWindow } from 'electron';
import type { PermissionRequest, FileOperation } from '@accomplish/shared';

export const PERMISSION_API_PORT = 9226;
const allowedCorsOrigins = new Set(
  (process.env.PERMISSION_API_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

interface PendingPermission {
  resolve: (allowed: boolean) => void;
  timeoutId: NodeJS.Timeout;
  warningId?: NodeJS.Timeout;
}

// Store pending permission requests waiting for user response
const pendingPermissions = new Map<string, PendingPermission>();

// Store reference to main window and task manager
let mainWindow: BrowserWindow | null = null;
let getActiveTaskId: (() => string | null) | null = null;

function hasActiveRendererWindow(window: BrowserWindow | null): window is BrowserWindow {
  return Boolean(window && !window.isDestroyed() && !window.webContents.isDestroyed());
}

function sendToRenderer(channel: string, payload: unknown): boolean {
  if (!hasActiveRendererWindow(mainWindow)) {
    return false;
  }

  try {
    mainWindow.webContents.send(channel, payload);
    return true;
  } catch (error) {
    console.warn(`[Permission API] Failed to send ${channel} to renderer`, error);
    return false;
  }
}

function getRequestOrigin(req: http.IncomingMessage): string | null {
  return typeof req.headers.origin === 'string' ? req.headers.origin : null;
}

function applyCorsPolicy(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const origin = getRequestOrigin(req);

  // MCP skill requests come from Node fetch/curl and do not include browser Origin headers.
  if (!origin) {
    return true;
  }

  if (!allowedCorsOrigins.has(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

/**
 * Initialize the permission API with dependencies
 */
export function initPermissionApi(
  window: BrowserWindow,
  taskIdGetter: () => string | null
): void {
  mainWindow = window;
  getActiveTaskId = taskIdGetter;
}

/**
 * Resolve a pending permission request from the MCP server
 * Called when user responds via the UI
 */
export function resolvePermission(requestId: string, allowed: boolean): boolean {
  const pending = pendingPermissions.get(requestId);
  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeoutId);
  if (pending.warningId) {
    clearTimeout(pending.warningId);
  }
  pending.resolve(allowed);
  pendingPermissions.delete(requestId);
  return true;
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `filereq_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create and start the HTTP server for permission requests
 */
export function startPermissionApiServer(port = PERMISSION_API_PORT): http.Server {
  const server = http.createServer(async (req, res) => {
    if (!applyCorsPolicy(req, res)) {
      return;
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      if (!getRequestOrigin(req)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Origin header is required for preflight requests' }));
        return;
      }
      res.writeHead(204);
      res.end();
      return;
    }

    // Only handle POST /permission
    if (req.method !== 'POST' || req.url !== '/permission') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Parse request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let data: {
      operation?: string;
      filePath?: string;
      targetPath?: string;
      contentPreview?: string;
    };

    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Validate required fields
    if (!data.operation || !data.filePath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'operation and filePath are required' }));
      return;
    }

    // Validate operation type
    const validOperations = ['read', 'create', 'delete', 'rename', 'move', 'modify', 'overwrite'];
    if (!validOperations.includes(data.operation)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Invalid operation. Must be one of: ${validOperations.join(', ')}` }));
      return;
    }

    // Check if we have the necessary dependencies
    if (!hasActiveRendererWindow(mainWindow) || !getActiveTaskId) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Permission API not initialized' }));
      return;
    }

    const taskId = getActiveTaskId();
    if (!taskId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No active task' }));
      return;
    }

    const requestId = generateRequestId();

    // Create permission request for the UI
    const permissionRequest: PermissionRequest = {
      id: requestId,
      taskId,
      type: 'file',
      fileOperation: data.operation as FileOperation,
      filePath: data.filePath,
      targetPath: data.targetPath,
      contentPreview: data.contentPreview?.substring(0, 500),
      createdAt: new Date().toISOString(),
    };

    // Send to renderer
    if (!sendToRenderer('permission:request', permissionRequest)) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Permission UI unavailable' }));
      return;
    }

    // Wait for user response (with 5 minute timeout)
    const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;
    const PERMISSION_WARNING_MS = 4 * 60 * 1000; // Warn 1 minute before timeout

    try {
      const allowed = await new Promise<boolean>((resolve, reject) => {
        // Send a warning to the UI 1 minute before timeout
        const warningId = setTimeout(() => {
          sendToRenderer('permission:timeout-warning', {
            requestId,
            remainingSeconds: 60,
          });
        }, PERMISSION_WARNING_MS);

        const timeoutId = setTimeout(() => {
          clearTimeout(warningId);
          pendingPermissions.delete(requestId);
          reject(new Error('Permission request timed out'));
        }, PERMISSION_TIMEOUT_MS);

        pendingPermissions.set(requestId, { resolve, timeoutId, warningId });
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ allowed }));
    } catch (error) {
      res.writeHead(408, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request timed out', allowed: false }));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    const listeningPort = typeof address === 'object' && address ? address.port : port;
    console.log(`[Permission API] Server listening on port ${listeningPort}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[Permission API] Port ${port} already in use, skipping server start`);
    } else {
      console.error('[Permission API] Server error:', error);
    }
  });

  return server;
}

/**
 * Check if a request ID is a file permission request from the MCP server
 */
export function isFilePermissionRequest(requestId: string): boolean {
  return requestId.startsWith('filereq_');
}
