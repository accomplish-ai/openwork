/**
 * Browser Screencast Manager
 *
 * Connects to the dev-browser HTTP server's SSE endpoint to receive
 * live CDP screencast frames and forwards them to the Electron renderer
 * via IPC. This bridges the gap between the detached dev-browser process
 * and the Electron UI.
 *
 * Architecture:
 *   dev-browser (Express :9224) -- SSE /screencast/stream --> this module -- IPC --> renderer
 */

import { BrowserWindow } from 'electron';
import { DEV_BROWSER_PORT } from '@accomplish_ai/agent-core';

const DEV_BROWSER_URL = `http://localhost:${DEV_BROWSER_PORT}`;

interface ScreencastState {
  abortController: AbortController;
  pageName: string;
}

let activeScreencast: ScreencastState | null = null;
let targetWindow: BrowserWindow | null = null;

function forwardToRenderer(channel: string, data: unknown) {
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.webContents.send(channel, data);
  }
}

/**
 * Start receiving screencast frames from the dev-browser server
 * and forwarding them to the renderer.
 */
export async function startScreencastRelay(
  window: BrowserWindow,
  pageName = 'main'
): Promise<{ success: boolean; error?: string }> {
  // Stop any existing relay first
  stopScreencastRelay();

  targetWindow = window;

  // First, tell the dev-browser server to start screencasting
  try {
    const startRes = await fetch(`${DEV_BROWSER_URL}/screencast/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: pageName,
        quality: 50,
        everyNthFrame: 2,
        maxWidth: 800,
        maxHeight: 600,
      }),
    });

    if (!startRes.ok) {
      const body = (await startRes.json().catch(() => ({}))) as { error?: string };
      return { success: false, error: body.error || `HTTP ${startRes.status}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Cannot reach dev-browser server: ${msg}` };
  }

  // Now connect to the SSE stream
  const abortController = new AbortController();
  activeScreencast = { abortController, pageName };

  connectSSE(pageName, abortController.signal);

  return { success: true };
}

/**
 * Connect to the SSE stream and process events.
 * Automatically reconnects on failure (unless aborted).
 */
async function connectSSE(pageName: string, signal: AbortSignal) {
  const url = `${DEV_BROWSER_URL}/screencast/stream?page=${encodeURIComponent(pageName)}`;

  while (!signal.aborted) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed: HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from the buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let currentEvent = '';
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
          } else if (line === '') {
            // End of event
            if (currentEvent && currentData) {
              handleSSEEvent(currentEvent, currentData);
            }
            currentEvent = '';
            currentData = '';
          }
        }
      }
    } catch (err) {
      if (signal.aborted) return;

      // Wait before reconnecting
      console.log('[Screencast] SSE connection lost, reconnecting in 2s...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

function handleSSEEvent(event: string, data: string) {
  try {
    const parsed = JSON.parse(data);

    switch (event) {
      case 'frame':
        forwardToRenderer('browser:frame', {
          data: parsed.data,
          timestamp: parsed.timestamp,
        });
        break;

      case 'navigate':
        forwardToRenderer('browser:navigate', {
          url: parsed.url,
        });
        break;

      case 'status':
        forwardToRenderer('browser:status', {
          loading: parsed.loading,
        });
        break;
    }
  } catch {
    // Ignore malformed events
  }
}

/**
 * Stop the screencast relay.
 */
export function stopScreencastRelay() {
  if (activeScreencast) {
    activeScreencast.abortController.abort();

    // Also tell the dev-browser server to stop
    fetch(`${DEV_BROWSER_URL}/screencast/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: activeScreencast.pageName }),
    }).catch(() => {});

    activeScreencast = null;
  }
}

/**
 * Check whether a screencast relay is currently active.
 */
export function isScreencastActive(): boolean {
  return activeScreencast !== null;
}

/**
 * Auto-start the screencast relay when the dev-browser server is available.
 * This is called from the task lifecycle so it streams automatically.
 */
export async function autoStartScreencast(window: BrowserWindow): Promise<void> {
  try {
    // Check if the dev-browser server is running
    const res = await fetch(`${DEV_BROWSER_URL}/screencast/status`).catch(() => null);
    if (!res || !res.ok) return;

    // Find a page that has an active screencast, or start one for 'main'
    const status = (await res.json()) as { active: boolean; sessions: string[] };
    if (status.active && status.sessions.length > 0) {
      // Already running — just connect the SSE relay
      const pageName = status.sessions[0];
      await startScreencastRelay(window, pageName);
    }
  } catch {
    // Server not ready yet; will be started later when a browser tool is used
  }
}
