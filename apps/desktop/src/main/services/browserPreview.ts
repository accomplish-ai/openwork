import { BrowserWindow } from 'electron';
import { DEV_BROWSER_CDP_PORT, DEV_BROWSER_PORT } from '@accomplish_ai/agent-core';

const DEFAULT_PAGE_NAME = 'main';
const DEV_BROWSER_HOST = '127.0.0.1';
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const SCREENCAST_QUALITY = 50;
const SCREENCAST_EVERY_NTH_FRAME = 3;
const SCREENCAST_MAX_WIDTH = 960;
const SCREENCAST_MAX_HEIGHT = 640;
const COMMAND_TIMEOUT_MS = 10000;

type PreviewStatus = 'starting' | 'streaming' | 'loading' | 'ready' | 'stopped' | 'error';

interface CdpCommandResponse {
  id: number;
  result?: unknown;
  error?: { message?: string };
}

interface CdpEvent {
  method?: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface BrowserPreviewSession {
  pageName: string;
  cdp: CdpClient;
  cdpSessionId: string;
  unsubscribe: () => void;
}

class CdpClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCommand>();
  private listeners = new Set<(event: CdpEvent) => void>();

  async connect(endpoint: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = new WebSocket(endpoint);

    await new Promise<void>((resolve, reject) => {
      const handleOpen = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error(`Failed to connect to CDP endpoint: ${endpoint}`));
      };
      const cleanup = () => {
        ws.removeEventListener('open', handleOpen);
        ws.removeEventListener('error', handleError);
      };

      ws.addEventListener('open', handleOpen);
      ws.addEventListener('error', handleError);
    });

    ws.addEventListener('message', (event) => {
      void this.handleMessage(event.data);
    });
    ws.addEventListener('close', () => {
      this.rejectAllPending(new Error('CDP websocket closed'));
    });
    ws.addEventListener('error', () => {
      this.rejectAllPending(new Error('CDP websocket error'));
    });

    this.ws = ws;
  }

  onEvent(listener: (event: CdpEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async sendCommand(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string
  ): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('CDP websocket is not connected');
    }

    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method };
    if (params) {
      payload.params = params;
    }
    if (sessionId) {
      payload.sessionId = sessionId;
    }

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, COMMAND_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timeout });
      this.ws?.send(JSON.stringify(payload));
    });
  }

  async disconnect(): Promise<void> {
    this.rejectAllPending(new Error('CDP disconnected'));
    if (this.ws && this.ws.readyState < WebSocket.CLOSING) {
      this.ws.close();
    }
    this.ws = null;
  }

  private async handleMessage(rawData: unknown): Promise<void> {
    const raw = await this.toText(rawData);
    if (!raw) {
      return;
    }

    let message: CdpCommandResponse & CdpEvent;
    try {
      message = JSON.parse(raw) as CdpCommandResponse & CdpEvent;
    } catch {
      return;
    }

    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeout);
      this.pending.delete(message.id);

      if (message.error?.message) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }

    for (const listener of this.listeners) {
      listener(message);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private async toText(rawData: unknown): Promise<string | null> {
    if (typeof rawData === 'string') {
      return rawData;
    }
    if (rawData instanceof ArrayBuffer) {
      return Buffer.from(rawData).toString('utf8');
    }
    if (ArrayBuffer.isView(rawData)) {
      return Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength).toString('utf8');
    }
    if (typeof Blob !== 'undefined' && rawData instanceof Blob) {
      return rawData.text();
    }
    return null;
  }
}

const sessions = new Map<string, BrowserPreviewSession>();
const startTokens = new Map<string, number>();

function sendToRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

function emitStatus(taskId: string, pageName: string, status: PreviewStatus, message?: string): void {
  sendToRenderer('browser:status', {
    taskId,
    pageName,
    status,
    message,
    timestamp: Date.now(),
  });
}

function emitFrame(
  taskId: string,
  pageName: string,
  data: string,
  width?: number,
  height?: number
): void {
  sendToRenderer('browser:frame', {
    taskId,
    pageName,
    data,
    width,
    height,
    timestamp: Date.now(),
  });
}

function emitNavigate(taskId: string, pageName: string, url: string): void {
  sendToRenderer('browser:navigate', {
    taskId,
    pageName,
    url,
    timestamp: Date.now(),
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveTargetId(taskId: string, pageName: string): Promise<string> {
  const fullPageName = `${taskId}-${pageName}`;
  const result = await fetchJson<{ targetId: string }>(
    `http://${DEV_BROWSER_HOST}:${DEV_BROWSER_PORT}/pages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fullPageName, viewport: DEFAULT_VIEWPORT }),
    }
  );

  if (!result.targetId) {
    throw new Error(`No targetId for page ${fullPageName}`);
  }

  return result.targetId;
}

async function resolveBrowserWsEndpoint(): Promise<string> {
  const info = await fetchJson<{ webSocketDebuggerUrl: string }>(
    `http://${DEV_BROWSER_HOST}:${DEV_BROWSER_CDP_PORT}/json/version`
  );

  if (!info.webSocketDebuggerUrl) {
    throw new Error('CDP endpoint missing webSocketDebuggerUrl');
  }

  return info.webSocketDebuggerUrl;
}

export async function startBrowserPreviewStream(taskId: string, pageName = DEFAULT_PAGE_NAME): Promise<void> {
  const normalizedPageName =
    typeof pageName === 'string' && pageName.trim()
      ? pageName.trim()
      : DEFAULT_PAGE_NAME;
  const token = (startTokens.get(taskId) ?? 0) + 1;
  startTokens.set(taskId, token);

  const existing = sessions.get(taskId);
  if (existing && existing.pageName === normalizedPageName) {
    return;
  }

  emitStatus(taskId, normalizedPageName, 'starting');
  await stopBrowserPreviewStream(taskId, false);

  const cdp = new CdpClient();

  try {
    const [targetId, browserWsEndpoint] = await Promise.all([
      resolveTargetId(taskId, normalizedPageName),
      resolveBrowserWsEndpoint(),
    ]);

    if (startTokens.get(taskId) !== token) {
      return;
    }

    await cdp.connect(browserWsEndpoint);

    const attached = (await cdp.sendCommand('Target.attachToTarget', {
      targetId,
      flatten: true,
    })) as { sessionId?: string };

    if (!attached.sessionId) {
      throw new Error('Failed to attach to CDP target');
    }

    const cdpSessionId = attached.sessionId;

    const unsubscribe = cdp.onEvent((event) => {
      if (event.sessionId !== cdpSessionId || !event.method) {
        return;
      }

      switch (event.method) {
        case 'Page.screencastFrame': {
          const params = event.params as {
            data?: string;
            sessionId?: number;
            metadata?: { deviceWidth?: number; deviceHeight?: number };
          };
          if (!params?.data) {
            return;
          }

          emitFrame(
            taskId,
            normalizedPageName,
            params.data,
            params.metadata?.deviceWidth,
            params.metadata?.deviceHeight
          );

          if (typeof params.sessionId === 'number') {
            void cdp.sendCommand('Page.screencastFrameAck', { sessionId: params.sessionId }, cdpSessionId)
              .catch(() => {});
          }
          break;
        }
        case 'Page.frameNavigated': {
          const frame = (event.params as { frame?: { parentId?: string; url?: string } })?.frame;
          if (!frame || frame.parentId) {
            return;
          }
          emitNavigate(taskId, normalizedPageName, frame.url ?? '');
          emitStatus(taskId, normalizedPageName, 'loading');
          break;
        }
        case 'Page.loadEventFired':
          emitStatus(taskId, normalizedPageName, 'ready');
          break;
      }
    });

    await cdp.sendCommand('Page.enable', {}, cdpSessionId);
    await cdp.sendCommand('Page.startScreencast', {
      format: 'jpeg',
      quality: SCREENCAST_QUALITY,
      everyNthFrame: SCREENCAST_EVERY_NTH_FRAME,
      maxWidth: SCREENCAST_MAX_WIDTH,
      maxHeight: SCREENCAST_MAX_HEIGHT,
    }, cdpSessionId);

    const targetInfo = (await cdp.sendCommand('Target.getTargetInfo', { targetId })) as {
      targetInfo?: { url?: string };
    };
    if (targetInfo.targetInfo?.url) {
      emitNavigate(taskId, normalizedPageName, targetInfo.targetInfo.url);
    }

    sessions.set(taskId, {
      pageName: normalizedPageName,
      cdp,
      cdpSessionId,
      unsubscribe,
    });
    emitStatus(taskId, normalizedPageName, 'streaming');
  } catch (error) {
    await cdp.disconnect();
    const message = error instanceof Error ? error.message : String(error);
    emitStatus(taskId, normalizedPageName, 'error', message);
    throw error;
  }
}

export async function stopBrowserPreviewStream(taskId: string, emitStopped = true): Promise<void> {
  const session = sessions.get(taskId);
  if (!session) {
    startTokens.delete(taskId);
    return;
  }

  sessions.delete(taskId);
  startTokens.delete(taskId);
  session.unsubscribe();

  try {
    await session.cdp.sendCommand('Page.stopScreencast', {}, session.cdpSessionId);
  } catch {
  }

  try {
    await session.cdp.sendCommand('Target.detachFromTarget', { sessionId: session.cdpSessionId });
  } catch {
  }

  await session.cdp.disconnect();

  if (emitStopped) {
    emitStatus(taskId, session.pageName, 'stopped');
  }
}

export async function stopAllBrowserPreviewStreams(): Promise<void> {
  const activeTaskIds = Array.from(sessions.keys());
  for (const taskId of activeTaskIds) {
    await stopBrowserPreviewStream(taskId);
  }
}
