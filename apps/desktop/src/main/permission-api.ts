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

interface PendingPermission {
  resolve: (allowed: boolean) => void;
  timeoutId: NodeJS.Timeout;
}

// Store pending permission requests waiting for user response
const pendingPermissions = new Map<string, PendingPermission>();

// Store reference to main window, task manager, and HTTP server
let mainWindow: BrowserWindow | null = null;
let getActiveTaskId: (() => string | null) | null = null;
let permissionServer: http.Server | null = null;

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
export function startPermissionApiServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS headers for local requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
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
    const validOperations = ['create', 'delete', 'rename', 'move', 'modify', 'overwrite'];
    if (!validOperations.includes(data.operation)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Invalid operation. Must be one of: ${validOperations.join(', ')}` }));
      return;
    }

    // Check if we have the necessary dependencies
    if (!mainWindow || mainWindow.isDestroyed() || !getActiveTaskId) {
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
    mainWindow.webContents.send('permission:request', permissionRequest);

    // Wait for user response (with 5 minute timeout)
    const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

    try {
      const allowed = await new Promise<boolean>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingPermissions.delete(requestId);
          reject(new Error('Permission request timed out'));
        }, PERMISSION_TIMEOUT_MS);

        pendingPermissions.set(requestId, { resolve, timeoutId });
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ allowed }));
    } catch (error) {
      res.writeHead(408, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request timed out', allowed: false }));
    }
  });

  server.listen(PERMISSION_API_PORT, '127.0.0.1', () => {
    console.log(`[Permission API] Server listening on port ${PERMISSION_API_PORT}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[Permission API] Port ${PERMISSION_API_PORT} already in use, skipping server start`);
    } else {
      console.error('[Permission API] Server error:', error);
    }
  });

  permissionServer = server;
  return server;
}

/**
 * Stop the permission API server and clean up pending requests
 * Called on app quit to ensure clean shutdown
 */
export function stopPermissionApiServer(): void {
  // Reject all pending permission requests
  for (const [requestId, pending] of pendingPermissions) {
    clearTimeout(pending.timeoutId);
    pending.resolve(false);
    pendingPermissions.delete(requestId);
  }

  if (permissionServer) {
    permissionServer.close(() => {
      console.log('[Permission API] Server closed');
    });
    permissionServer = null;
  }

  mainWindow = null;
  getActiveTaskId = null;
}

/**
 * Check if a request ID is a file permission request from the MCP server
 */
export function isFilePermissionRequest(requestId: string): boolean {
  return requestId.startsWith('filereq_');
}
