/**
 * Daemon ↔ Electron IPC Bridge
 *
 * Bridges daemon push events to Electron's IPC system (sender.send)
 * and registers ipcMain.handle() handlers that delegate to the daemon client.
 *
 * This is the key integration point: the renderer's preload API stays
 * exactly the same, but all requests now flow through the daemon instead
 * of being handled directly in the Electron main process.
 *
 * MIGRATION STRATEGY:
 * This bridge exists so the existing preload/renderer code doesn't need
 * to change at all. The IPC channel names remain identical. The only
 * difference is that handlers delegate to DaemonClient instead of
 * directly calling agent-core APIs.
 */

import { ipcMain, BrowserWindow, nativeTheme } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { DaemonClient } from './client';
import { DaemonEvent } from './protocol';

const VALID_THEMES = ['system', 'light', 'dark'] as const;
type ThemeSource = (typeof VALID_THEMES)[number];

function isValidTheme(value: string): value is ThemeSource {
  return (VALID_THEMES as readonly string[]).includes(value);
}

/**
 * Register IPC handlers that bridge Electron renderer ↔ daemon.
 *
 * @param getDaemonClient - Returns the connected daemon client.
 *   Use a getter so the client can be lazy-initialized or reconnected.
 */
export function registerDaemonBridgeHandlers(
  getDaemonClient: () => DaemonClient
): void {
  const handle = <T>(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<T>) => {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await handler(event, ...args);
      } catch (error) {
        console.error(`[DaemonBridge] IPC handler ${channel} failed:`, error);
        throw error instanceof Error ? error : new Error(String(error));
      }
    });
  };

  const client = () => getDaemonClient();

  // -- Task operations (delegate to daemon) --------------------------------

  handle('task:start', async (_event, config) => {
    return client().startTask(config);
  });

  handle('task:cancel', async (_event, taskId?: string) => {
    if (!taskId) throw new Error('taskId is required');
    await client().cancelTask(taskId);
  });

  handle('task:interrupt', async (_event, taskId?: string) => {
    if (!taskId) throw new Error('taskId is required');
    await client().interruptTask(taskId);
  });

  handle('task:get', async (_event, taskId: string) => {
    return client().getTask(taskId);
  });

  handle('task:list', async () => {
    return client().listTasks();
  });

  handle('task:delete', async (_event, taskId: string) => {
    return client().deleteTask(taskId);
  });

  handle('task:clear-history', async () => {
    return client().clearTaskHistory();
  });

  handle('task:get-todos', async (_event, taskId: string) => {
    return client().getTodosForTask(taskId);
  });

  // -- Permission -----------------------------------------------------------

  handle('permission:respond', async (_event, response) => {
    return client().respondToPermission(response);
  });

  // -- Session resume -------------------------------------------------------

  handle('session:resume', async (_event, sessionId: string, prompt: string, taskId?: string) => {
    return client().resumeSession(sessionId, prompt, taskId);
  });

  // -- Settings -------------------------------------------------------------

  handle('settings:api-keys', async () => {
    return client().getApiKeys();
  });

  handle('settings:add-api-key', async (_event, provider: string, key: string, label?: string) => {
    return client().addApiKey(provider, key, label);
  });

  handle('settings:remove-api-key', async (_event, id: string) => {
    return client().removeApiKey(id);
  });

  handle('settings:debug-mode', async () => {
    return client().getDebugMode();
  });

  handle('settings:set-debug-mode', async (_event, enabled: boolean) => {
    return client().setDebugMode(enabled);
  });

  handle('settings:theme', async () => {
    return client().getTheme();
  });

  handle('settings:set-theme', async (_event, theme: string) => {
    const validatedTheme: ThemeSource = isValidTheme(theme) ? theme : 'system';
    if (!isValidTheme(theme)) {
      console.warn(`[DaemonBridge] Invalid theme value "${theme}", falling back to "system"`);
    }
    await client().setTheme(validatedTheme);
    // Also update native theme locally for window chrome
    nativeTheme.themeSource = validatedTheme;
  });

  handle('settings:app-settings', async () => {
    return client().getAppSettings();
  });

  handle('settings:openai-base-url:get', async () => {
    return client().getOpenAiBaseUrl();
  });

  handle('settings:openai-base-url:set', async (_event, baseUrl: string) => {
    return client().setOpenAiBaseUrl(baseUrl);
  });

  handle('opencode:auth:openai:status', async () => {
    return client().getOpenAiOauthStatus();
  });

  // -- API key management ---------------------------------------------------

  handle('api-key:exists', async () => {
    return client().hasApiKey();
  });

  handle('api-key:set', async (_event, key: string) => {
    return client().setApiKey('anthropic', key);
  });

  handle('api-key:get', async () => {
    return client().getApiKey();
  });

  handle('api-key:validate', async (_event, key: string) => {
    return client().validateApiKey(key);
  });

  handle('api-key:validate-provider', async (_event, provider: string, key: string, options?: Record<string, any>) => {
    return client().validateApiKeyForProvider(provider, key, options);
  });

  handle('api-key:clear', async () => {
    return client().clearApiKey();
  });

  handle('api-keys:all', async () => {
    return client().getAllApiKeys();
  });

  handle('api-keys:has-any', async () => {
    return client().hasAnyApiKey();
  });

  // -- Onboarding -----------------------------------------------------------

  handle('onboarding:complete', async () => {
    return client().getOnboardingComplete();
  });

  handle('onboarding:set-complete', async (_event, complete: boolean) => {
    return client().setOnboardingComplete(complete);
  });

  // -- Model selection ------------------------------------------------------

  handle('model:get', async () => {
    return client().getSelectedModel();
  });

  handle('model:set', async (_event, model) => {
    return client().setSelectedModel(model);
  });

  // -- Provider settings ----------------------------------------------------

  handle('provider-settings:get', async () => {
    return client().getProviderSettings();
  });

  handle('provider-settings:set', async (_event, providerId: string, provider: unknown) => {
    return client().setProviderSetting(providerId, provider);
  });

  handle('provider-settings:remove', async (_event, providerId: string) => {
    return client().removeProviderSetting(providerId);
  });

  handle('models:fetch', async (_event, providerId: string, options?: unknown) => {
    return client().fetchModels(providerId, options);
  });

  // -- Ollama ---------------------------------------------------------------

  handle('ollama:test', async (_event, baseUrl: string) => {
    return client().testOllamaConnection(baseUrl);
  });

  handle('ollama:tool-support', async (_event, modelName: string, baseUrl: string) => {
    return client().testOllamaToolSupport(modelName, baseUrl);
  });

  handle('ollama:set-config', async (_event, config) => {
    return client().setOllamaConfig(config);
  });

  handle('ollama:get-config', async () => {
    return client().getOllamaConfig();
  });

  // -- Azure Foundry --------------------------------------------------------

  handle('azure-foundry:test', async (_event, config) => {
    return client().testAzureFoundryConnection(config);
  });

  handle('azure-foundry:validate', async (_event, config) => {
    return client().validateAzureFoundry(config);
  });

  handle('azure-foundry:set-config', async (_event, config) => {
    return client().setAzureFoundryConfig(config);
  });

  handle('azure-foundry:get-config', async () => {
    return client().getAzureFoundryConfig();
  });

  // -- LiteLLM --------------------------------------------------------------

  handle('litellm:test', async (_event, baseUrl: string) => {
    return client().testLiteLLMConnection(baseUrl);
  });

  handle('litellm:set-config', async (_event, config) => {
    return client().setLiteLLMConfig(config);
  });

  handle('litellm:get-config', async () => {
    return client().getLiteLLMConfig();
  });

  handle('litellm:fetch-models', async (_event, baseUrl: string) => {
    return client().fetchLiteLLMModels(baseUrl);
  });

  // -- LM Studio ------------------------------------------------------------

  handle('lmstudio:test', async (_event, baseUrl: string) => {
    return client().testLMStudioConnection(baseUrl);
  });

  handle('lmstudio:validate', async (_event, config) => {
    return client().validateLMStudioConfig(config);
  });

  handle('lmstudio:set-config', async (_event, config) => {
    return client().setLMStudioConfig(config);
  });

  handle('lmstudio:get-config', async () => {
    return client().getLMStudioConfig();
  });

  handle('lmstudio:fetch-models', async (_event, baseUrl: string) => {
    return client().fetchLMStudioModels(baseUrl);
  });

  // -- OpenRouter -----------------------------------------------------------

  handle('openrouter:fetch-models', async () => {
    return client().fetchOpenRouterModels();
  });

  // -- Bedrock --------------------------------------------------------------

  handle('bedrock:validate', async (_event, credentials) => {
    return client().validateBedrockCredentials(credentials);
  });

  handle('bedrock:fetch-models', async (_event, credentials) => {
    return client().fetchBedrockModels(credentials);
  });

  handle('bedrock:set-credentials', async (_event, credentials) => {
    return client().setBedrockCredentials(credentials);
  });

  handle('bedrock:get-credentials', async () => {
    return client().getBedrockCredentials();
  });

  // -- Skills ---------------------------------------------------------------

  handle('skills:list', async () => {
    return client().listSkills();
  });

  handle('skills:get', async (_event, id: string) => {
    return client().getSkill(id);
  });

  handle('skills:add', async (_event, skill) => {
    return client().addSkill(skill);
  });

  handle('skills:update', async (_event, id: string, data) => {
    return client().updateSkill(id, data);
  });

  handle('skills:delete', async (_event, id: string) => {
    return client().deleteSkill(id);
  });

  handle('skills:toggle', async (_event, id: string, enabled: boolean) => {
    return client().toggleSkill(id, enabled);
  });

  // -- Connectors -----------------------------------------------------------

  handle('connectors:list', async () => {
    return client().listConnectors();
  });

  handle('connectors:add', async (_event, connector) => {
    return client().addConnector(connector);
  });

  handle('connectors:update', async (_event, id: string, data) => {
    return client().updateConnector(id, data);
  });

  handle('connectors:delete', async (_event, id: string) => {
    return client().deleteConnector(id);
  });
}

// ---------------------------------------------------------------------------
// Event bridging: daemon push events → renderer IPC
// ---------------------------------------------------------------------------

/**
 * Bridge daemon push events to the Electron renderer via webContents.send().
 *
 * Maps daemon notification events to the existing Electron IPC channel names
 * so the renderer/preload code doesn't need to change.
 *
 * @returns A cleanup function that removes all registered listeners.
 *          Call this when reconnecting to the daemon or tearing down.
 */
export function bridgeDaemonEventsToRenderer(
  daemonClient: DaemonClient,
  getMainWindow: () => BrowserWindow | null
): () => void {
  const registeredListeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  const forward = (daemonEvent: string, electronChannel: string) => {
    const handler = (data: Record<string, unknown>) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(electronChannel, data);
      }
    };
    daemonClient.on(daemonEvent, handler);
    registeredListeners.push({ event: daemonEvent, handler });
  };

  // Map daemon events → existing Electron IPC channels
  forward(DaemonEvent.TASK_UPDATE, 'task:update');
  forward(DaemonEvent.TASK_UPDATE_BATCH, 'task:update:batch');
  forward(DaemonEvent.TASK_PROGRESS, 'task:progress');
  forward(DaemonEvent.TASK_STATUS_CHANGE, 'task:status-change');
  forward(DaemonEvent.TASK_SUMMARY, 'task:summary');
  forward(DaemonEvent.TASK_COMPLETE, 'task:update');
  forward(DaemonEvent.PERMISSION_REQUEST, 'permission:request');
  forward(DaemonEvent.TODO_UPDATE, 'todo:update');
  forward(DaemonEvent.DEBUG_LOG, 'debug:log');
  forward(DaemonEvent.AUTH_ERROR, 'auth:error');
  forward(DaemonEvent.THEME_CHANGED, 'settings:theme-changed');
  forward(DaemonEvent.DEBUG_MODE_CHANGED, 'settings:debug-mode-changed');

  // Return cleanup function
  return () => {
    for (const { event, handler } of registeredListeners) {
      daemonClient.off(event, handler);
    }
    registeredListeners.length = 0;
  };
}
