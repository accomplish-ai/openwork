import { shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { URL } from 'url';
import {
  isOpenCodeCliInstalled,
  getOpenCodeCliVersion,
} from '../opencode/adapter';
import {
  getDebugMode,
  setDebugMode,
  getAppSettings,
  getOnboardingComplete,
  setOnboardingComplete,
  getSelectedModel,
  setSelectedModel,
  getOllamaConfig,
  setOllamaConfig,
  getDesktopControlPreflight,
  setDesktopControlPreflight,
  getLiveScreenSampling,
  setLiveScreenSampling,
  setAllowMouseControl,
  getAllowDesktopContext,
  setAllowDesktopContext,
  getDesktopContextBackgroundPolling,
  setDesktopContextBackgroundPolling,
} from '../store/appSettings';
import {
  initializeDesktopContextPolling,
} from '../services/desktop-context-polling';
import type {
  SelectedModel,
  OllamaConfig,
} from '@accomplish/shared';
import { handle, sanitizeString } from './message-utils';
import {
  fetchWithTimeout,
  API_KEY_VALIDATION_TIMEOUT_MS,
} from './api-key-validation';

interface OllamaModel {
  id: string;
  displayName: string;
  size: number;
}

/**
 * Register settings, model, ollama, onboarding, and debug IPC handlers
 */
export function registerSettingsHandlers(): void {
  // OpenCode CLI: Check if installed
  handle('opencode:check', async (_event: IpcMainInvokeEvent) => {
    const installed = await isOpenCodeCliInstalled();
    const version = installed ? await getOpenCodeCliVersion() : null;
    return {
      installed,
      version,
      installCommand: 'npm install -g opencode-ai',
    };
  });

  // OpenCode CLI: Get version
  handle('opencode:version', async (_event: IpcMainInvokeEvent) => {
    return getOpenCodeCliVersion();
  });

  // Model: Get selected model
  handle('model:get', async (_event: IpcMainInvokeEvent) => {
    return getSelectedModel();
  });

  // Model: Set selected model
  handle('model:set', async (_event: IpcMainInvokeEvent, model: SelectedModel) => {
    if (!model || typeof model.provider !== 'string' || typeof model.model !== 'string') {
      throw new Error('Invalid model configuration');
    }
    setSelectedModel(model);
  });

  // Ollama: Test connection and get models
  handle('ollama:test-connection', async (_event: IpcMainInvokeEvent, url: string) => {
    const sanitizedUrl = sanitizeString(url, 'ollamaUrl', 256);

    // Validate URL format and protocol
    try {
      const parsed = new URL(sanitizedUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { success: false, error: 'Only http and https URLs are allowed' };
      }
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }

    try {
      const response = await fetchWithTimeout(
        `${sanitizedUrl}/api/tags`,
        { method: 'GET' },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }

      const data = await response.json() as { models?: Array<{ name: string; size: number }> };
      const models: OllamaModel[] = (data.models || []).map((m) => ({
        id: m.name,
        displayName: m.name,
        size: m.size,
      }));

      console.log(`[Ollama] Connection successful, found ${models.length} models`);
      return { success: true, models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      console.warn('[Ollama] Connection failed:', message);

      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Connection timed out. Make sure Ollama is running.' };
      }
      return { success: false, error: `Cannot connect to Ollama: ${message}` };
    }
  });

  // Ollama: Get stored config
  handle('ollama:get-config', async (_event: IpcMainInvokeEvent) => {
    return getOllamaConfig();
  });

  // Ollama: Set config
  handle('ollama:set-config', async (_event: IpcMainInvokeEvent, config: OllamaConfig | null) => {
    if (config !== null) {
      if (typeof config.baseUrl !== 'string' || typeof config.enabled !== 'boolean') {
        throw new Error('Invalid Ollama configuration');
      }
      // Validate URL format and protocol
      try {
        const parsed = new URL(config.baseUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('Only http and https URLs are allowed');
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('http')) {
          throw e;
        }
        throw new Error('Invalid base URL format');
      }
      if (config.lastValidated !== undefined && typeof config.lastValidated !== 'number') {
        throw new Error('Invalid Ollama configuration');
      }
      if (config.models !== undefined) {
        if (!Array.isArray(config.models)) {
          throw new Error('Invalid Ollama configuration: models must be an array');
        }
        for (const model of config.models) {
          if (typeof model.id !== 'string' || typeof model.displayName !== 'string' || typeof model.size !== 'number') {
            throw new Error('Invalid Ollama configuration: invalid model format');
          }
        }
      }
    }
    setOllamaConfig(config);
    console.log('[Ollama] Config saved:', config);
  });

  // Settings: Get debug mode setting
  handle('settings:debug-mode', async (_event: IpcMainInvokeEvent) => {
    return getDebugMode();
  });

  // Settings: Set debug mode setting
  handle('settings:set-debug-mode', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid debug mode flag');
    }
    setDebugMode(enabled);
  });

  // Settings: Get all app settings
  handle('settings:app-settings', async (_event: IpcMainInvokeEvent) => {
    return getAppSettings();
  });

  // Settings: Get desktopControlPreflight flag
  handle('settings:get-desktop-control-preflight', async (_event: IpcMainInvokeEvent) => {
    return getDesktopControlPreflight();
  });

  // Settings: Set desktopControlPreflight flag
  handle('settings:set-desktop-control-preflight', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid desktopControlPreflight flag');
    }
    setDesktopControlPreflight(enabled);
  });

  // Settings: Get liveScreenSampling flag
  handle('settings:get-live-screen-sampling', async (_event: IpcMainInvokeEvent) => {
    return getLiveScreenSampling();
  });

  // Settings: Set liveScreenSampling flag
  handle('settings:set-live-screen-sampling', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid liveScreenSampling flag');
    }
    setLiveScreenSampling(enabled);
  });

  // Settings: Set allowMouseControl flag
  handle('settings:set-allow-mouse-control', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid allowMouseControl flag');
    }
    setAllowMouseControl(enabled);
  });

  // Settings: Get allowDesktopContext flag
  handle('settings:get-allow-desktop-context', async (_event: IpcMainInvokeEvent) => {
    return getAllowDesktopContext();
  });

  // Settings: Set allowDesktopContext flag
  handle('settings:set-allow-desktop-context', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid allowDesktopContext flag');
    }
    setAllowDesktopContext(enabled);
    // Initialize or stop polling based on new setting
    initializeDesktopContextPolling();
  });

  // Settings: Get desktopContextBackgroundPolling flag
  handle('settings:get-desktop-context-background-polling', async (_event: IpcMainInvokeEvent) => {
    return getDesktopContextBackgroundPolling();
  });

  // Settings: Set desktopContextBackgroundPolling flag
  handle('settings:set-desktop-context-background-polling', async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid desktopContextBackgroundPolling flag');
    }
    setDesktopContextBackgroundPolling(enabled);
    // Initialize or stop polling based on new setting
    initializeDesktopContextPolling();
  });

  // Onboarding: Get onboarding complete status
  handle('onboarding:complete', async (_event: IpcMainInvokeEvent) => {
    return getOnboardingComplete();
  });

  // Onboarding: Set onboarding complete status
  handle('onboarding:set-complete', async (_event: IpcMainInvokeEvent, complete: boolean) => {
    setOnboardingComplete(complete);
  });

  // Shell: Open URL in external browser
  handle('shell:open-external', async (_event: IpcMainInvokeEvent, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only http and https URLs are allowed');
      }
      await shell.openExternal(url);
    } catch (error) {
      console.error('Failed to open external URL:', error);
      throw error;
    }
  });

  // Log event handler - now just returns ok (no external logging)
  handle(
    'log:event',
    async (
      _event: IpcMainInvokeEvent,
      _payload: { level?: string; message?: string; context?: Record<string, unknown> }
    ) => {
      // No-op: external logging removed
      return { ok: true };
    }
  );
}
