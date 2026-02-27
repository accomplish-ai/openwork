import { ipcMain, BrowserWindow, shell, app } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { URL } from 'url';
import {
  isOpenCodeCliInstalled,
  getOpenCodeCliVersion,
} from '../opencode/adapter';
import {
  getTaskManager,
  type TaskCallbacks,
} from '../opencode/task-manager';
import {
  storeApiKey,
  getApiKey,
  deleteApiKey,
  getAllApiKeys,
  hasAnyApiKey,
  listStoredCredentials,
} from '../store/secureStorage';
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
  getAllowMouseControl,
  setAllowMouseControl,
  getDesktopControlPreflight,
  setDesktopControlPreflight,
  getLiveScreenSampling,
  setLiveScreenSampling,
  getAllowDesktopContext,
  setAllowDesktopContext,
  getDesktopContextBackgroundPolling,
  setDesktopContextBackgroundPolling,
} from '../store/appSettings';
import {
  startPermissionApiServer,
  initPermissionApi,
  resolvePermission,
  isFilePermissionRequest,
} from '../permission-api';
import type {
  TaskConfig,
  PermissionResponse,
  OpenCodeMessage,
  TaskMessage,
  TaskResult,
  TaskStatus,
  SelectedModel,
  OllamaConfig,
  MouseMovePayload,
  MouseClickPayload,
} from '@accomplish/shared';
import {
  normalizeIpcError,
  permissionResponseSchema,
  validate,
  apiErrorResponseSchema,
  ollamaTagsResponseSchema,
  desktopControlStatusRequestSchema,
  desktopControlStatusResponseSchema,
  liveScreenStartOptionsSchema,
  liveScreenSessionStartResponseSchema,
  liveScreenFrameRequestSchema,
  liveScreenFrameResponseSchema,
  liveScreenStopRequestSchema,
  liveScreenStopResponseSchema,
} from './validation';
import {
  createMessageBatcher,
  flushAndCleanupBatcher,
  queueMessage,
  type MessageBatcher,
} from './messageBatching';
import { getDesktopControlService } from '../desktop-control/service';
import {
  getScreenSources,
  getPrimaryDisplay,
  getAllDisplays,
  getScreenSourceId,
} from '../services/screen-capture';
import { getDesktopContextService } from '../services/desktop-context-service';
import {
  initializeDesktopContextPolling,
  getDesktopContextPollingService,
} from '../services/desktop-context-polling';
import type {
  DesktopContextOptions,
  DesktopWindow,
  AccessibleNode,
  DesktopScreenshot,
} from '@accomplish/shared';

const MAX_TEXT_LENGTH = 8000;
const ALLOWED_API_KEY_PROVIDERS = new Set([
  'anthropic',
  'openai',
  'google',
  'xai',
  'openrouter',
  'custom',
]);
const API_KEY_VALIDATION_TIMEOUT_MS = 15000;

interface OllamaModel {
  id: string;
  displayName: string;
  size: number;
}

interface MaskedApiKeyPayload {
  exists: boolean;
  prefix?: string;
}

function toMaskedApiKeyPayload(apiKey: string | null): MaskedApiKeyPayload {
  if (!apiKey) {
    return { exists: false };
  }
  return {
    exists: true,
    prefix: `${apiKey.substring(0, 8)}...`,
  };
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function assertTrustedWindow(window: BrowserWindow | null): BrowserWindow {
  if (!window || window.isDestroyed()) {
    throw new Error('Untrusted window');
  }

  const focused = BrowserWindow.getFocusedWindow();
  if (BrowserWindow.getAllWindows().length > 1 && focused && focused.id !== window.id) {
    throw new Error('IPC request must originate from the focused window');
  }

  return window;
}

function sanitizeString(input: unknown, field: string, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof input !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${field} exceeds maximum length`);
  }
  return trimmed;
}

function validateTaskConfig(config: TaskConfig): TaskConfig {
  const prompt = sanitizeString(config.prompt, 'prompt');
  const validated: TaskConfig = { prompt };

  if (config.taskId) {
    validated.taskId = sanitizeString(config.taskId, 'taskId', 128);
  }
  if (config.sessionId) {
    validated.sessionId = sanitizeString(config.sessionId, 'sessionId', 128);
  }
  if (config.workingDirectory) {
    validated.workingDirectory = sanitizeString(config.workingDirectory, 'workingDirectory', 1024);
  }
  if (Array.isArray(config.allowedTools)) {
    validated.allowedTools = config.allowedTools
      .filter((tool): tool is string => typeof tool === 'string')
      .map((tool) => sanitizeString(tool, 'allowedTools', 64))
      .slice(0, 20);
  }
  if (config.systemPromptAppend) {
    validated.systemPromptAppend = sanitizeString(
      config.systemPromptAppend,
      'systemPromptAppend',
      MAX_TEXT_LENGTH
    );
  }
  if (config.outputSchema && typeof config.outputSchema === 'object') {
    validated.outputSchema = config.outputSchema;
  }

  return validated;
}

function handle<Args extends unknown[], ReturnType = unknown>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => ReturnType
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...(args as Args));
    } catch (error) {
      console.error(`IPC handler ${channel} failed`, error);
      throw normalizeIpcError(error);
    }
  });
}

/**
 * Register all IPC handlers
 */
export function registerIPCHandlers(): void {
  const taskManager = getTaskManager();

  // Start the permission API server for file-permission MCP
  // Initialize when we have a window (deferred until first task:start)
  let permissionApiInitialized = false;

  // Desktop control: Return preflight readiness status for screen/action tools
  handle(
    'desktopControl:getStatus',
    async (
      _event: IpcMainInvokeEvent,
      options?: { forceRefresh?: boolean }
    ) => {
      const request = validate(desktopControlStatusRequestSchema, options ?? {});
      const status = await getDesktopControlService().getReadinessStatus(request);
      return validate(desktopControlStatusResponseSchema, status);
    }
  );

  handle(
    'desktopControl:startLiveScreenSession',
    async (_event: IpcMainInvokeEvent, options?: unknown) => {
      const request = validate(liveScreenStartOptionsSchema, options);
      const payload = await getDesktopControlService().startLiveScreenSession(request);
      return validate(liveScreenSessionStartResponseSchema, payload);
    }
  );

  handle(
    'desktopControl:getLiveScreenFrame',
    async (_event: IpcMainInvokeEvent, request?: unknown) => {
      const payload = validate(liveScreenFrameRequestSchema, request ?? {});
      const frame = await getDesktopControlService().getLiveScreenFrame(payload.sessionId);
      return validate(liveScreenFrameResponseSchema, frame);
    }
  );

  handle(
    'desktopControl:refreshLiveScreenFrame',
    async (_event: IpcMainInvokeEvent, request?: unknown) => {
      const payload = validate(liveScreenFrameRequestSchema, request ?? {});
      const frame = await getDesktopControlService().refreshLiveScreenFrame(payload.sessionId);
      return validate(liveScreenFrameResponseSchema, frame);
    }
  );

  handle(
    'desktopControl:stopLiveScreenSession',
    async (_event: IpcMainInvokeEvent, request?: unknown) => {
      const payload = validate(liveScreenStopRequestSchema, request ?? {});
      const result = await getDesktopControlService().stopLiveScreenSession(payload.sessionId);
      return validate(liveScreenStopResponseSchema, result);
    }
  );

  // Task: Start a new task (send message to agent)
  handle('task:start', async (event: IpcMainInvokeEvent, config: TaskConfig) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedConfig = validateTaskConfig(config);

    // Initialize permission API server (once, when we have a window)
    if (!permissionApiInitialized) {
      initPermissionApi(window, () => taskManager.getActiveTaskId());
      startPermissionApiServer();
      permissionApiInitialized = true;
    }

    const taskId = createTaskId();

    // Setup event forwarding to renderer
    const forwardToRenderer = (channel: string, data: unknown) => {
      if (!window.isDestroyed() && !sender.isDestroyed()) {
        sender.send(channel, data);
      }
    };

    // Create task-scoped callbacks for the TaskManager
    const callbacks: TaskCallbacks = {
      onMessage: (message: OpenCodeMessage) => {
        const taskMessage = toTaskMessage(message);
        if (!taskMessage) return;

        // Queue message for batching instead of immediate send
        queueMessage(taskId, taskMessage, forwardToRenderer);
      },

      onProgress: (progress: { stage: string; message?: string }) => {
        forwardToRenderer('task:progress', {
          taskId,
          ...progress,
        });
      },

      onPermissionRequest: (request: unknown) => {
        // Flush pending messages before showing permission request
        flushAndCleanupBatcher(taskId);
        forwardToRenderer('permission:request', request);
      },

      onComplete: (result: TaskResult) => {
        // Flush any pending messages before completing
        flushAndCleanupBatcher(taskId);

        forwardToRenderer('task:update', {
          taskId,
          type: 'complete',
          result,
        });
      },

      onError: (error: Error) => {
        // Flush any pending messages before error
        flushAndCleanupBatcher(taskId);

        forwardToRenderer('task:update', {
          taskId,
          type: 'error',
          error: error.message,
        });
      },

      onDebug: (log: { type: string; message: string; data?: unknown }) => {
        if (getDebugMode()) {
          forwardToRenderer('debug:log', {
            taskId,
            timestamp: new Date().toISOString(),
            ...log,
          });
        }
      },

      onStatusChange: (status: TaskStatus) => {
        // Notify renderer of status change (e.g., queued -> running)
        forwardToRenderer('task:status-change', {
          taskId,
          status,
        });
      },
    };

    // Start the task via TaskManager (creates isolated adapter or queues if busy)
    const task = await taskManager.startTask(taskId, validatedConfig, callbacks);

    // Add initial user message with the prompt to the chat
    const initialUserMessage: TaskMessage = {
      id: createMessageId(),
      type: 'user',
      content: validatedConfig.prompt,
      timestamp: new Date().toISOString(),
    };
    task.messages = [initialUserMessage];

    return task;
  });

  // Task: Cancel current task (running or queued)
  handle('task:cancel', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) return;

    // Check if it's a queued task first
    if (taskManager.isTaskQueued(taskId)) {
      taskManager.cancelQueuedTask(taskId);
      return;
    }

    // Otherwise cancel the running task
    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.cancelTask(taskId);
    }
  });

  // Task: Interrupt current task (graceful Ctrl+C, doesn't kill process)
  handle('task:interrupt', async (_event: IpcMainInvokeEvent, taskId?: string) => {
    if (!taskId) return;

    if (taskManager.hasActiveTask(taskId)) {
      await taskManager.interruptTask(taskId);
      console.log(`[IPC] Task ${taskId} interrupted`);
    }
  });

  // Permission: Respond to permission request
  handle('permission:respond', async (_event: IpcMainInvokeEvent, response: PermissionResponse) => {
    const parsedResponse = validate(permissionResponseSchema, response);
    const { taskId, decision, requestId } = parsedResponse;

    // Check if this is a file permission request from the MCP server
    if (requestId && isFilePermissionRequest(requestId)) {
      const allowed = decision === 'allow';
      const resolved = resolvePermission(requestId, allowed);
      if (resolved) {
        console.log(`[IPC] File permission request ${requestId} resolved: ${allowed ? 'allowed' : 'denied'}`);
        return;
      }
      // If not found in pending, fall through to standard handling
      console.warn(`[IPC] File permission request ${requestId} not found in pending requests`);
    }

    // Check if the task is still active
    if (!taskManager.hasActiveTask(taskId)) {
      console.warn(`[IPC] Permission response for inactive task ${taskId}`);
      return;
    }

    if (decision === 'allow') {
      // Send the response to the correct task's CLI
      const message = parsedResponse.selectedOptions?.join(', ') || parsedResponse.message || 'yes';
      const sanitizedMessage = sanitizeString(message, 'permissionResponse', 1024);
      await taskManager.sendResponse(taskId, sanitizedMessage);
    } else {
      // Send denial to the correct task
      await taskManager.sendResponse(taskId, 'no');
    }
  });

  // Session: Resume (continue conversation)
  handle('session:resume', async (event: IpcMainInvokeEvent, sessionId: string, prompt: string) => {
    const window = assertTrustedWindow(BrowserWindow.fromWebContents(event.sender));
    const sender = event.sender;
    const validatedSessionId = sanitizeString(sessionId, 'sessionId', 128);
    const validatedPrompt = sanitizeString(prompt, 'prompt');

    const taskId = createTaskId();

    // Setup event forwarding to renderer
    const forwardToRenderer = (channel: string, data: unknown) => {
      if (!window.isDestroyed() && !sender.isDestroyed()) {
        sender.send(channel, data);
      }
    };

    // Create task-scoped callbacks for the TaskManager
    const callbacks: TaskCallbacks = {
      onMessage: (message: OpenCodeMessage) => {
        const taskMessage = toTaskMessage(message);
        if (!taskMessage) return;

        queueMessage(taskId, taskMessage, forwardToRenderer);
      },

      onProgress: (progress: { stage: string; message?: string }) => {
        forwardToRenderer('task:progress', {
          taskId,
          ...progress,
        });
      },

      onPermissionRequest: (request: unknown) => {
        flushAndCleanupBatcher(taskId);
        forwardToRenderer('permission:request', request);
      },

      onComplete: (result: TaskResult) => {
        flushAndCleanupBatcher(taskId);

        forwardToRenderer('task:update', {
          taskId,
          type: 'complete',
          result,
        });
      },

      onError: (error: Error) => {
        flushAndCleanupBatcher(taskId);

        forwardToRenderer('task:update', {
          taskId,
          type: 'error',
          error: error.message,
        });
      },

      onDebug: (log: { type: string; message: string; data?: unknown }) => {
        if (getDebugMode()) {
          forwardToRenderer('debug:log', {
            taskId,
            timestamp: new Date().toISOString(),
            ...log,
          });
        }
      },

      onStatusChange: (status: TaskStatus) => {
        forwardToRenderer('task:status-change', {
          taskId,
          status,
        });
      },
    };

    // Start the task via TaskManager with sessionId for resume
    const task = await taskManager.startTask(taskId, {
      prompt: validatedPrompt,
      sessionId: validatedSessionId,
      taskId,
    }, callbacks);

    return task;
  });

  // Settings: Get API keys
  handle('settings:api-keys', async (_event: IpcMainInvokeEvent) => {
    const storedCredentials = await listStoredCredentials();

    return storedCredentials
      .filter((credential) => credential.account.startsWith('apiKey:'))
      .map((credential) => {
        const provider = credential.account.replace('apiKey:', '');
        const keyPrefix =
          credential.password && credential.password.length > 0
            ? `${credential.password.substring(0, 8)}...`
            : '';

        return {
          id: `local-${provider}`,
          provider,
          label: 'Local API Key',
          keyPrefix,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
      });
  });

  // Settings: Add API key (stores securely in OS keychain)
  handle(
    'settings:add-api-key',
    async (_event: IpcMainInvokeEvent, provider: string, key: string, label?: string) => {
      if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
        throw new Error('Unsupported API key provider');
      }
      const sanitizedKey = sanitizeString(key, 'apiKey', 256);
      const sanitizedLabel = label ? sanitizeString(label, 'label', 128) : undefined;

      // Store the API key securely in OS keychain
      await storeApiKey(provider, sanitizedKey);

      return {
        id: `local-${provider}`,
        provider,
        label: sanitizedLabel || 'Local API Key',
        keyPrefix: sanitizedKey.substring(0, 8) + '...',
        isActive: true,
        createdAt: new Date().toISOString(),
      };
    }
  );

  // Settings: Remove API key
  handle('settings:remove-api-key', async (_event: IpcMainInvokeEvent, id: string) => {
    const sanitizedId = sanitizeString(id, 'id', 128);
    const provider = sanitizedId.replace('local-', '');
    await deleteApiKey(provider);
  });

  // API Key: Check if API key exists
  handle('api-key:exists', async (_event: IpcMainInvokeEvent) => {
    const apiKey = await getApiKey('anthropic');
    return Boolean(apiKey);
  });

  // API Key: Set API key
  handle('api-key:set', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    await storeApiKey('anthropic', sanitizedKey);
    console.log('[API Key] Key set', { keyPrefix: sanitizedKey.substring(0, 8) });
  });

  // API Key: Get API key
  handle('api-key:get', async (_event: IpcMainInvokeEvent) => {
    const apiKey = getApiKey('anthropic');
    return toMaskedApiKeyPayload(apiKey);
  });

  // API Key: Validate API key by making a test request
  handle('api-key:validate', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    console.log('[API Key] Validation requested');

    try {
      const response = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': sanitizedKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }],
          }),
        },
        API_KEY_VALIDATION_TIMEOUT_MS
      );

      if (response.ok) {
        console.log('[API Key] Validation succeeded');
        return { valid: true };
      }

      const errorData = apiErrorResponseSchema.safeParse(await response.json().catch(() => ({})));
      const errorMessage = (errorData.success ? errorData.data.error?.message : undefined) || `API returned status ${response.status}`;

      console.warn('[API Key] Validation failed', { status: response.status, error: errorMessage });

      return { valid: false, error: errorMessage };
    } catch (error) {
      console.error('[API Key] Validation error', { error: error instanceof Error ? error.message : String(error) });
      if (error instanceof Error && error.name === 'AbortError') {
        return { valid: false, error: 'Request timed out. Please check your internet connection and try again.' };
      }
      return { valid: false, error: 'Failed to validate API key. Check your internet connection.' };
    }
  });

  // API Key: Validate API key for any provider
  handle('api-key:validate-provider', async (_event: IpcMainInvokeEvent, provider: string, key: string) => {
    if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
      return { valid: false, error: 'Unsupported provider' };
    }
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    console.log(`[API Key] Validation requested for provider: ${provider}`);

    try {
      let response: Response;

      switch (provider) {
        case 'anthropic':
          response = await fetchWithTimeout(
            'https://api.anthropic.com/v1/messages',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': sanitizedKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'test' }],
              }),
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'openai':
          response = await fetchWithTimeout(
            'https://api.openai.com/v1/models',
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'google':
          response = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${sanitizedKey}`,
            {
              method: 'GET',
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'xai':
          response = await fetchWithTimeout(
            'https://api.x.ai/v1/models',
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        case 'openrouter':
          response = await fetchWithTimeout(
            'https://openrouter.ai/api/v1/models',
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${sanitizedKey}`,
              },
            },
            API_KEY_VALIDATION_TIMEOUT_MS
          );
          break;

        default:
          // For 'custom' provider, skip validation
          console.log('[API Key] Skipping validation for custom provider');
          return { valid: true };
      }

      if (response.ok) {
        console.log(`[API Key] Validation succeeded for ${provider}`);
        return { valid: true };
      }

      const errorData = apiErrorResponseSchema.safeParse(await response.json().catch(() => ({})));
      const errorMessage = (errorData.success ? errorData.data.error?.message : undefined) || `API returned status ${response.status}`;

      console.warn(`[API Key] Validation failed for ${provider}`, { status: response.status, error: errorMessage });
      return { valid: false, error: errorMessage };
    } catch (error) {
      console.error(`[API Key] Validation error for ${provider}`, { error: error instanceof Error ? error.message : String(error) });
      if (error instanceof Error && error.name === 'AbortError') {
        return { valid: false, error: 'Request timed out. Please check your internet connection and try again.' };
      }
      return { valid: false, error: 'Failed to validate API key. Check your internet connection.' };
    }
  });

  // API Key: Clear API key
  handle('api-key:clear', async (_event: IpcMainInvokeEvent) => {
    await deleteApiKey('anthropic');
    console.log('[API Key] Key cleared');
  });

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

      const rawData = await response.json();
      const parsed = ollamaTagsResponseSchema.safeParse(rawData);
      const modelsList = parsed.success ? parsed.data.models : [];
      const models: OllamaModel[] = modelsList.map((m) => ({
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

  // API Keys: Get all API keys (with masked values)
  handle('api-keys:all', async (_event: IpcMainInvokeEvent) => {
    const keys = await getAllApiKeys();
    const masked: Record<string, { exists: boolean; prefix?: string }> = {};
    for (const [provider, key] of Object.entries(keys)) {
      masked[provider] = toMaskedApiKeyPayload(key);
    }
    return masked;
  });

  // API Keys: Check if any key exists
  handle('api-keys:has-any', async (_event: IpcMainInvokeEvent) => {
    return hasAnyApiKey();
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

  // Screen Capture: Get available screen sources
  handle(
    'screen:get-sources',
    async (_event: IpcMainInvokeEvent, options?: { types?: ('screen' | 'window')[] }) => {
      try {
        return await getScreenSources({
          types: options?.types || ['screen', 'window'],
          thumbnailSize: { width: 320, height: 180 },
          fetchWindowIcons: true,
        });
      } catch (error) {
        console.error('[IPC] Failed to get screen sources:', error);
        throw error;
      }
    }
  );

  // Screen Capture: Get primary display info
  handle('screen:get-primary-display', async (_event: IpcMainInvokeEvent) => {
    return getPrimaryDisplay();
  });

  // Screen Capture: Get all displays
  handle('screen:get-all-displays', async (_event: IpcMainInvokeEvent) => {
    return getAllDisplays();
  });

  // Screen Capture: Get screen source ID for getUserMedia
  handle('screen:get-source-id', async (_event: IpcMainInvokeEvent, displayId?: string) => {
    try {
      return await getScreenSourceId(displayId);
    } catch (error) {
      console.error('[IPC] Failed to get screen source ID:', error);
      throw error;
    }
  });

  // Desktop Context: List all windows
  handle('desktop:listWindows', async (_event: IpcMainInvokeEvent) => {
    try {
      const service = getDesktopContextService();
      const windows = await service.listWindows();
      return windows;
    } catch (error) {
      console.error('[IPC] Failed to list windows:', error);
      throw error;
    }
  });

  // Desktop Context: Inspect window accessibility tree
  handle(
    'desktop:inspectWindow',
    async (
      _event: IpcMainInvokeEvent,
      windowId: number,
      maxDepth?: number,
      maxNodes?: number
    ) => {
      if (typeof windowId !== 'number' || !Number.isInteger(windowId)) {
        throw new Error('Invalid windowId');
      }
      try {
        const service = getDesktopContextService();
        const tree = await service.inspectWindow(
          windowId,
          maxDepth ?? 10,
          maxNodes ?? 1000
        );
        return tree;
      } catch (error) {
        console.error(`[IPC] Failed to inspect window ${windowId}:`, error);
        throw error;
      }
    }
  );

  // Desktop Context: Capture screenshot
  handle(
    'desktop:capture',
    async (
      _event: IpcMainInvokeEvent,
      options: {
        mode: 'screen' | 'window' | 'region';
        windowId?: number;
        rect?: { x: number; y: number; width: number; height: number };
      }
    ) => {
      if (!options || typeof options.mode !== 'string') {
        throw new Error('Invalid capture options');
      }
      try {
        const service = getDesktopContextService();
        const screenshot = await service.captureScreenshot(
          options.mode,
          options.windowId,
          options.rect
        );
        return screenshot;
      } catch (error) {
        console.error('[IPC] Failed to capture screenshot:', error);
        throw error;
      }
    }
  );

  // Desktop Context: Get full context snapshot
  handle(
    'desktop:getContext',
    async (_event: IpcMainInvokeEvent, options?: DesktopContextOptions) => {
      try {
        const service = getDesktopContextService();
        const context = await service.getDesktopContext(options ?? {});
        return {
          timestamp: new Date().toISOString(),
          ...context,
        };
      } catch (error) {
        console.error('[IPC] Failed to get desktop context:', error);
        throw error;
      }
    }
  );

  // Mouse control: move and click (gated by allowMouseControl setting)
  handle('mouse:move', async (_event: IpcMainInvokeEvent, payload: MouseMovePayload) => {
    if (!getAllowMouseControl()) {
      throw new Error('Mouse control is disabled in settings');
    }

    if (
      !payload ||
      typeof payload.x !== 'number' ||
      typeof payload.y !== 'number' ||
      !Number.isFinite(payload.x) ||
      !Number.isFinite(payload.y)
    ) {
      throw new Error('Invalid mouse move payload');
    }

    // TODO: Implement mouse movement via native automation library
    // This is a placeholder to keep IPC shape stable without changing behavior yet.
    return { ok: true };
  });

  handle('mouse:click', async (_event: IpcMainInvokeEvent, payload: MouseClickPayload) => {
    if (!getAllowMouseControl()) {
      throw new Error('Mouse control is disabled in settings');
    }

    if (!payload || typeof payload.button !== 'string') {
      throw new Error('Invalid mouse click payload');
    }

    if (!['left', 'right', 'middle'].includes(payload.button)) {
      throw new Error('Unsupported mouse button');
    }

    // TODO: Implement mouse click via native automation library
    // This is a placeholder to keep IPC shape stable without changing behavior yet.
    return { ok: true };
  });
}

function createTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Extract base64 screenshots from tool output
 */
function extractScreenshots(output: string): {
  cleanedText: string;
  attachments: Array<{ type: 'screenshot' | 'json'; data: string; label?: string }>;
} {
  const attachments: Array<{ type: 'screenshot' | 'json'; data: string; label?: string }> = [];

  const dataUrlRegex = /data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+/g;
  let match;
  while ((match = dataUrlRegex.exec(output)) !== null) {
    attachments.push({
      type: 'screenshot',
      data: match[0],
      label: 'Screenshot',
    });
  }

  const rawBase64Regex = /(?<![;,])(?:^|["\s])?(iVBORw0[A-Za-z0-9+/=]{100,})(?:["\s]|$)/g;
  while ((match = rawBase64Regex.exec(output)) !== null) {
    const base64Data = match[1];
    if (base64Data && base64Data.length > 100) {
      attachments.push({
        type: 'screenshot',
        data: `data:image/png;base64,${base64Data}`,
        label: 'Screenshot',
      });
    }
  }

  let cleanedText = output
    .replace(dataUrlRegex, '[Screenshot captured]')
    .replace(rawBase64Regex, '[Screenshot captured]');

  cleanedText = cleanedText
    .replace(/"[Screenshot captured]"/g, '"[Screenshot]"')
    .replace(/\[Screenshot captured\]\[Screenshot captured\]/g, '[Screenshot captured]');

  return { cleanedText, attachments };
}

/**
 * Sanitize tool output to remove technical details
 */
function sanitizeToolOutput(text: string, isError: boolean): string {
  let result = text;

  result = result.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  result = result.replace(/\x1B\[2m|\x1B\[22m|\x1B\[0m/g, '');
  result = result.replace(/ws:\/\/[^\s\]]+/g, '[connection]');
  result = result.replace(/\s*Call log:[\s\S]*/i, '');

  if (isError) {
    const timeoutMatch = result.match(/timed? ?out after (\d+)ms/i);
    if (timeoutMatch) {
      const seconds = Math.round(parseInt(timeoutMatch[1]) / 1000);
      return `Timed out after ${seconds}s`;
    }

    const protocolMatch = result.match(/Protocol error \([^)]+\):\s*(.+)/i);
    if (protocolMatch) {
      result = protocolMatch[1].trim();
    }

    result = result.replace(/^Error executing code:\s*/i, '');
    result = result.replace(/browserType\.connectOverCDP:\s*/i, '');
    result = result.replace(/\s+at\s+.+/g, '');
    result = result.replace(/\w+Error:\s*/g, '');
  }

  return result.trim();
}

function toTaskMessage(message: OpenCodeMessage): TaskMessage | null {
  if (message.type === 'text') {
    if (message.part.text) {
      return {
        id: createMessageId(),
        type: 'assistant',
        content: message.part.text,
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  if (message.type === 'tool_call') {
    return {
      id: createMessageId(),
      type: 'tool',
      content: `Using tool: ${message.part.tool}`,
      toolName: message.part.tool,
      toolInput: message.part.input,
      timestamp: new Date().toISOString(),
    };
  }

  if (message.type === 'tool_use') {
    const toolUseMsg = message as import('@accomplish/shared').OpenCodeToolUseMessage;
    const toolName = toolUseMsg.part.tool || 'unknown';
    const toolInput = toolUseMsg.part.state?.input;
    const toolOutput = toolUseMsg.part.state?.output || '';
    const status = toolUseMsg.part.state?.status;

    if (status === 'completed' || status === 'error') {
      const { cleanedText, attachments } = extractScreenshots(toolOutput);
      const isError = status === 'error';
      const sanitizedText = sanitizeToolOutput(cleanedText, isError);

      const displayText = sanitizedText.length > 500
        ? sanitizedText.substring(0, 500) + '...'
        : sanitizedText;

      return {
        id: createMessageId(),
        type: 'tool',
        content: displayText || `Tool ${toolName} ${status}`,
        toolName,
        toolInput,
        timestamp: new Date().toISOString(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };
    }
    return null;
  }

  return null;
}
