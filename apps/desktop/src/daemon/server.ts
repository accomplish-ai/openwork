/**
 * Daemon Server — RPC Handler Registry
 *
 * Maps JSON-RPC method names to handler functions. The daemon server dispatches
 * incoming requests to these handlers and pushes events back to connected clients.
 *
 * This module owns the "headless" services: storage, task manager, permission API,
 * thought stream, skills, speech — everything that should run without a UI.
 */

import type {
  TaskConfig,
  PermissionResponse,
  SelectedModel,
  ProviderId,
  StorageAPI,
  TaskManagerAPI,
  TaskCallbacks,
  TaskMessage,
  TaskResult,
  TaskStatus,
  TodoItem,
  OllamaConfig,
  AzureFoundryConfig,
  LiteLLMConfig,
  LMStudioConfig,
  ToolSupportStatus,
} from '@accomplish_ai/agent-core';

import {
  createStorage,
  createTaskManager,
  createPermissionHandler,
  createThoughtStreamHandler,
  createSkillsManager,
  validateApiKey,
  validateBedrockCredentials,
  fetchBedrockModels,
  validateAzureFoundry,
  testAzureFoundryConnection,
  fetchOpenRouterModels,
  fetchProviderModels,
  testLiteLLMConnection,
  fetchLiteLLMModels,
  testOllamaConnection,
  testOllamaModelToolSupport,
  testLMStudioConnection,
  fetchLMStudioModels,
  validateLMStudioConfig,
  validateHttpUrl,
  sanitizeString,
  generateTaskSummary,
  validateTaskConfig,
  createTaskId,
  createMessageId,
  mapResultToStatus,
  isFilePermissionRequest,
  isQuestionRequest,
  getOpenAiOauthStatus,
} from '@accomplish_ai/agent-core';

import type { DaemonClientConnection } from './transport';
import { DaemonTransportServer } from './transport';
import {
  DaemonMethod,
  DaemonEvent,
  RPC_ERROR,
  getDaemonSocketPath,
  type RpcRequest,
} from './protocol';

// ---------------------------------------------------------------------------
// Handler type
// ---------------------------------------------------------------------------

type RpcHandler = (params: Record<string, unknown>) => Promise<unknown>;

// ---------------------------------------------------------------------------
// DaemonServer
// ---------------------------------------------------------------------------

export interface DaemonServerOptions {
  /** Path to the SQLite database */
  databasePath: string;
  /** Path to user data directory (for secure storage, skills, etc.) */
  userDataPath: string;
  /** Application version string */
  appVersion: string;
  /** Whether the app is packaged (production) */
  isPackaged: boolean;
  /** Path to bundled skills */
  bundledSkillsPath?: string;
  /** Custom socket path (defaults to getDaemonSocketPath()) */
  socketPath?: string;
  /** Factory to create the task manager (allows Electron-specific options) */
  createTaskManagerFn?: () => TaskManagerAPI;
  /** Function to get an API key by provider (for task summary generation) */
  getApiKeyFn?: (provider: string) => string | null;
}

export class DaemonServer {
  private transport: DaemonTransportServer;
  private handlers = new Map<string, RpcHandler>();
  private storage: StorageAPI;
  private taskManager: TaskManagerAPI;
  private permissionHandler;
  private thoughtStreamHandler;
  private skillsManager;
  private opts: DaemonServerOptions;

  // Track active task → client mapping for event routing
  private taskClientMap = new Map<string, Set<string>>();

  constructor(opts: DaemonServerOptions) {
    this.opts = opts;
    const socketPath = opts.socketPath ?? getDaemonSocketPath();
    this.transport = new DaemonTransportServer(socketPath);

    // Initialize storage
    this.storage = createStorage({
      databasePath: opts.databasePath,
      runMigrations: true,
      userDataPath: opts.userDataPath,
      secureStorageFileName: opts.isPackaged
        ? 'secure-storage.json'
        : 'secure-storage-dev.json',
    });

    if (!this.storage.isDatabaseInitialized()) {
      this.storage.initialize();
    }

    // Initialize task manager
    this.taskManager = opts.createTaskManagerFn
      ? opts.createTaskManagerFn()
      : createTaskManager({ maxConcurrentTasks: 10 } as any);

    // Initialize headless services
    this.permissionHandler = createPermissionHandler();
    this.thoughtStreamHandler = createThoughtStreamHandler();
    this.skillsManager = createSkillsManager({
      userDataPath: opts.userDataPath,
      bundledSkillsPath: opts.bundledSkillsPath,
    });

    this.registerHandlers();
  }

  // -----------------------------------------------------------------------
  // Server lifecycle
  // -----------------------------------------------------------------------

  async start(): Promise<void> {
    // Initialize skills
    await this.skillsManager.initialize();

    // Start transport
    this.transport.on('connection', (client) => this.onClientConnected(client));
    await this.transport.listen();

    console.log(`[Daemon] Listening on ${this.opts.socketPath ?? getDaemonSocketPath()}`);
  }

  async stop(): Promise<void> {
    console.log('[Daemon] Shutting down...');
    const errors: Error[] = [];

    try {
      this.taskManager.dispose();
    } catch (err) {
      console.error('[Daemon] Error disposing task manager:', err);
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }

    try {
      this.storage.close();
    } catch (err) {
      console.error('[Daemon] Error closing storage:', err);
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }

    try {
      await this.transport.close();
    } catch (err) {
      console.error('[Daemon] Error closing transport:', err);
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }

    console.log('[Daemon] Shut down complete');
    if (errors.length > 0) {
      throw new AggregateError(errors, `Daemon shutdown completed with ${errors.length} error(s)`);
    }
  }

  // -----------------------------------------------------------------------
  // Client connection handling
  // -----------------------------------------------------------------------

  private onClientConnected(client: DaemonClientConnection): void {
    console.log(`[Daemon] Client connected: ${client.id}`);

    client.on('message', async (msg: any) => {
      if (!('method' in msg) || !('id' in msg)) return;
      await this.handleRequest(client, msg as RpcRequest);
    });

    client.on('close', () => {
      console.log(`[Daemon] Client disconnected: ${client.id}`);
      // Clean up task→client mapping
      for (const [taskId, clients] of this.taskClientMap) {
        clients.delete(client.id);
        if (clients.size === 0) {
          this.taskClientMap.delete(taskId);
        }
      }
    });
  }

  private async handleRequest(client: DaemonClientConnection, req: RpcRequest): Promise<void> {
    const handler = this.handlers.get(req.method);
    if (!handler) {
      client.respondError(req.id, RPC_ERROR.METHOD_NOT_FOUND, `Unknown method: ${req.method}`);
      return;
    }

    try {
      const result = await handler(req.params ?? {});
      client.respond(req.id, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Daemon] Handler error for ${req.method}:`, message);
      client.respondError(req.id, RPC_ERROR.INTERNAL_ERROR, message);
    }
  }

  // -----------------------------------------------------------------------
  // Event broadcasting
  // -----------------------------------------------------------------------

  /** Broadcast an event to all connected clients */
  private broadcast(event: string, data: Record<string, unknown>): void {
    this.transport.broadcast(event, data);
  }

  // -----------------------------------------------------------------------
  // Task callbacks factory (bridges agent events → RPC push notifications)
  // -----------------------------------------------------------------------

  private createTaskCallbacks(taskId: string, clientId: string): TaskCallbacks {
    // Track which client started this task
    if (!this.taskClientMap.has(taskId)) {
      this.taskClientMap.set(taskId, new Set());
    }
    this.taskClientMap.get(taskId)!.add(clientId);

    const storage = this.storage;
    const taskManager = this.taskManager;
    const broadcast = this.broadcast.bind(this);

    return {
      onBatchedMessages: (messages: TaskMessage[]) => {
        broadcast(DaemonEvent.TASK_UPDATE_BATCH, { taskId, messages });
        for (const msg of messages) {
          storage.addTaskMessage(taskId, msg);
        }
      },

      onProgress: (progress: { stage: string; message?: string }) => {
        broadcast(DaemonEvent.TASK_PROGRESS, { taskId, ...progress });
      },

      onPermissionRequest: (request: unknown) => {
        broadcast(DaemonEvent.PERMISSION_REQUEST, request as Record<string, unknown>);
      },

      onComplete: (result: TaskResult) => {
        broadcast(DaemonEvent.TASK_COMPLETE, { taskId, type: 'complete', result: result as any });

        const taskStatus = mapResultToStatus(result);
        storage.updateTaskStatus(taskId, taskStatus, new Date().toISOString());

        const sessionId = result.sessionId || taskManager.getSessionId(taskId);
        if (sessionId) {
          storage.updateTaskSessionId(taskId, sessionId);
        }

        if (result.status === 'success') {
          storage.clearTodosForTask(taskId);
        }

        // Unregister thought stream
        this.thoughtStreamHandler.unregisterTask(taskId);
      },

      onError: (error: Error) => {
        broadcast(DaemonEvent.TASK_UPDATE, {
          taskId,
          type: 'error',
          error: error.message,
        });
        storage.updateTaskStatus(taskId, 'failed', new Date().toISOString());
      },

      onDebug: (log: { type: string; message: string; data?: unknown }) => {
        if (storage.getDebugMode()) {
          broadcast(DaemonEvent.DEBUG_LOG, {
            taskId,
            timestamp: new Date().toISOString(),
            ...log,
          });
        }
      },

      onStatusChange: (status: TaskStatus) => {
        broadcast(DaemonEvent.TASK_STATUS_CHANGE, { taskId, status });
        storage.updateTaskStatus(taskId, status, new Date().toISOString());
      },

      onTodoUpdate: (todos: TodoItem[]) => {
        storage.saveTodosForTask(taskId, todos);
        broadcast(DaemonEvent.TODO_UPDATE, { taskId, todos: todos as any });
      },

      onAuthError: (error: { providerId: string; message: string }) => {
        broadcast(DaemonEvent.AUTH_ERROR, error);
      },
    };
  }

  // -----------------------------------------------------------------------
  // Handler registration
  // -----------------------------------------------------------------------

  private registerHandlers(): void {
    const storage = this.storage;
    const taskManager = this.taskManager;
    const skillsManager = this.skillsManager;
    const getApiKeyFn = this.opts.getApiKeyFn ?? ((provider: string) => storage.getApiKey(provider));

    // -- Health & lifecycle -------------------------------------------------

    this.handle(DaemonMethod.PING, async () => ({ pong: true, timestamp: Date.now() }));

    this.handle(DaemonMethod.SHUTDOWN, async () => {
      // Graceful shutdown: run cleanup, then exit
      const result = { shutting_down: true };
      // Schedule stop + exit after responding to the client
      setTimeout(async () => {
        try {
          await this.stop();
        } catch (err) {
          console.error('[Daemon] Error during shutdown:', err);
        } finally {
          process.exit(0);
        }
      }, 100);
      return result;
    });

    this.handle(DaemonMethod.GET_STATUS, async () => ({
      uptime: process.uptime(),
      clients: this.transport.clientCount,
      memoryUsage: process.memoryUsage(),
      version: this.opts.appVersion,
    }));

    // -- Task operations ----------------------------------------------------

    this.handle(DaemonMethod.TASK_START, async (params) => {
      const config = params as unknown as TaskConfig;
      const clientId = (params as any).__clientId ?? 'unknown';
      const validatedConfig = validateTaskConfig(config);

      if (!storage.hasReadyProvider()) {
        throw new Error('No provider is ready. Please connect a provider and select a model in Settings.');
      }

      const taskId = createTaskId();

      const activeModel = storage.getActiveProviderModel();
      const selectedModel = activeModel || storage.getSelectedModel();
      if (selectedModel?.model) {
        validatedConfig.modelId = selectedModel.model;
      }

      const callbacks = this.createTaskCallbacks(taskId, clientId);

      // Register with thought stream
      this.thoughtStreamHandler.registerTask(taskId);

      const task = await taskManager.startTask(taskId, validatedConfig, callbacks);

      const initialUserMessage: TaskMessage = {
        id: createMessageId(),
        type: 'user',
        content: validatedConfig.prompt,
        timestamp: new Date().toISOString(),
      };
      task.messages = [initialUserMessage];

      storage.saveTask(task);

      // Fire-and-forget summary generation
      generateTaskSummary(validatedConfig.prompt, getApiKeyFn)
        .then((summary) => {
          storage.updateTaskSummary(taskId, summary);
          this.broadcast(DaemonEvent.TASK_SUMMARY, { taskId, summary });
        })
        .catch((err) => {
          console.warn('[Daemon] Failed to generate task summary:', err);
        });

      return task;
    });

    this.handle(DaemonMethod.TASK_CANCEL, async (params) => {
      const taskId = params.taskId as string | undefined;
      if (!taskId) return;

      if (taskManager.isTaskQueued(taskId)) {
        taskManager.cancelQueuedTask(taskId);
        storage.updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
        return;
      }

      if (taskManager.hasActiveTask(taskId)) {
        await taskManager.cancelTask(taskId);
        storage.updateTaskStatus(taskId, 'cancelled', new Date().toISOString());
      }
    });

    this.handle(DaemonMethod.TASK_INTERRUPT, async (params) => {
      const taskId = params.taskId as string | undefined;
      if (!taskId) return;
      if (taskManager.hasActiveTask(taskId)) {
        await taskManager.interruptTask(taskId);
      }
    });

    this.handle(DaemonMethod.TASK_GET, async (params) => {
      return storage.getTask(params.taskId as string) || null;
    });

    this.handle(DaemonMethod.TASK_LIST, async () => {
      return storage.getTasks();
    });

    this.handle(DaemonMethod.TASK_DELETE, async (params) => {
      storage.deleteTask(params.taskId as string);
    });

    this.handle(DaemonMethod.TASK_CLEAR_HISTORY, async () => {
      storage.clearHistory();
    });

    this.handle(DaemonMethod.TASK_GET_TODOS, async (params) => {
      return storage.getTodosForTask(params.taskId as string);
    });

    // -- Session resume -----------------------------------------------------

    this.handle(DaemonMethod.SESSION_RESUME, async (params) => {
      const sessionId = sanitizeString(params.sessionId as string, 'sessionId', 128);
      const prompt = sanitizeString(params.prompt as string, 'prompt');
      const existingTaskId = params.taskId
        ? sanitizeString(params.taskId as string, 'taskId', 128)
        : undefined;
      const clientId = (params as any).__clientId ?? 'unknown';

      if (!storage.hasReadyProvider()) {
        throw new Error('No provider is ready. Please connect a provider and select a model in Settings.');
      }

      const taskId = existingTaskId || createTaskId();

      if (existingTaskId) {
        const userMessage: TaskMessage = {
          id: createMessageId(),
          type: 'user',
          content: prompt,
          timestamp: new Date().toISOString(),
        };
        storage.addTaskMessage(existingTaskId, userMessage);
      }

      const activeModel = storage.getActiveProviderModel();
      const selectedModel = activeModel || storage.getSelectedModel();

      const callbacks = this.createTaskCallbacks(taskId, clientId);

      this.thoughtStreamHandler.registerTask(taskId);

      const task = await taskManager.startTask(taskId, {
        prompt,
        sessionId,
        taskId,
        modelId: selectedModel?.model,
      }, callbacks);

      if (existingTaskId) {
        storage.updateTaskStatus(existingTaskId, task.status, new Date().toISOString());
      }

      return task;
    });

    // -- Permission handling ------------------------------------------------

    this.handle(DaemonMethod.PERMISSION_RESPOND, async (params) => {
      const response = params as unknown as PermissionResponse;
      const { taskId, decision, requestId } = response as any;

      if (requestId && isFilePermissionRequest(requestId)) {
        const allowed = decision === 'allow';
        const resolved = this.permissionHandler.resolvePermissionRequest(requestId, allowed);
        if (resolved) return;
      }

      if (requestId && isQuestionRequest(requestId)) {
        const denied = decision === 'deny';
        const resolved = this.permissionHandler.resolveQuestionRequest(requestId, {
          selectedOptions: (response as any).selectedOptions,
          customText: (response as any).customText,
          denied,
        });
        if (resolved) return;
      }

      if (!taskManager.hasActiveTask(taskId)) return;

      if (decision === 'allow') {
        const message = (response as any).selectedOptions?.join(', ')
          || (response as any).message
          || 'yes';
        await taskManager.sendResponse(taskId, sanitizeString(message, 'permissionResponse', 1024));
      } else {
        await taskManager.sendResponse(taskId, 'no');
      }
    });

    // -- Settings -----------------------------------------------------------

    this.handle(DaemonMethod.SETTINGS_GET_API_KEYS, async () => {
      // Returns a summarized list of configured API keys
      const keys: Array<Record<string, unknown>> = [];
      const allKeys = await storage.getAllApiKeys();
      for (const [provider, apiKey] of Object.entries(allKeys)) {
        if (!apiKey) continue;
        let keyPrefix = apiKey.length > 0 ? `${apiKey.substring(0, 8)}...` : '';
        keys.push({
          id: `local-${provider}`,
          provider,
          label: 'Local API Key',
          keyPrefix,
          isActive: true,
          createdAt: new Date().toISOString(),
        });
      }
      return keys;
    });

    this.handle(DaemonMethod.SETTINGS_ADD_API_KEY, async (params) => {
      const provider = params.provider as string;
      const key = params.key as string;
      storage.storeApiKey(provider, key);
      return { success: true };
    });

    this.handle(DaemonMethod.SETTINGS_REMOVE_API_KEY, async (params) => {
      const provider = params.provider as string;
      storage.deleteApiKey(provider);
      return { success: true };
    });

    this.handle(DaemonMethod.SETTINGS_GET_DEBUG_MODE, async () => {
      return storage.getDebugMode();
    });

    this.handle(DaemonMethod.SETTINGS_SET_DEBUG_MODE, async (params) => {
      storage.setDebugMode(params.enabled as boolean);
      this.broadcast(DaemonEvent.DEBUG_MODE_CHANGED, { enabled: params.enabled as boolean });
    });

    this.handle(DaemonMethod.SETTINGS_GET_THEME, async () => {
      return storage.getTheme();
    });

    this.handle(DaemonMethod.SETTINGS_SET_THEME, async (params) => {
      storage.setTheme(params.theme as any);
      this.broadcast(DaemonEvent.THEME_CHANGED, { theme: params.theme as string });
    });

    this.handle(DaemonMethod.SETTINGS_GET_APP_SETTINGS, async () => {
      return {
        debugMode: storage.getDebugMode(),
        onboardingComplete: storage.getOnboardingComplete(),
        theme: storage.getTheme(),
      };
    });

    this.handle(DaemonMethod.SETTINGS_GET_OPENAI_BASE_URL, async () => {
      return storage.getOpenAiBaseUrl();
    });

    this.handle(DaemonMethod.SETTINGS_SET_OPENAI_BASE_URL, async (params) => {
      storage.setOpenAiBaseUrl(params.baseUrl as string);
    });

    this.handle(DaemonMethod.SETTINGS_GET_OPENAI_OAUTH_STATUS, async () => {
      return getOpenAiOauthStatus();
    });

    // -- API key management -------------------------------------------------

    this.handle(DaemonMethod.API_KEY_EXISTS, async () => {
      return storage.hasAnyApiKey();
    });

    this.handle(DaemonMethod.API_KEY_SET, async (params) => {
      storage.storeApiKey(params.provider as string ?? 'anthropic', params.key as string);
    });

    this.handle(DaemonMethod.API_KEY_GET, async (params) => {
      return storage.getApiKey(params.provider as string ?? 'anthropic');
    });

    this.handle(DaemonMethod.API_KEY_VALIDATE, async (params) => {
      return validateApiKey(params.provider as string, params.key as string);
    });

    this.handle(DaemonMethod.API_KEY_VALIDATE_PROVIDER, async (params) => {
      return validateApiKey(
        params.provider as string,
        params.key as string,
        params.options as Record<string, any> | undefined
      );
    });

    this.handle(DaemonMethod.API_KEY_CLEAR, async () => {
      storage.clearSecureStorage();
    });

    this.handle(DaemonMethod.API_KEYS_ALL, async () => {
      return storage.getAllApiKeys();
    });

    this.handle(DaemonMethod.API_KEYS_HAS_ANY, async () => {
      return storage.hasAnyApiKey();
    });

    // -- Model selection ----------------------------------------------------

    this.handle(DaemonMethod.MODEL_GET, async () => {
      return storage.getSelectedModel();
    });

    this.handle(DaemonMethod.MODEL_SET, async (params) => {
      storage.setSelectedModel(params as any);
    });

    // -- Provider settings --------------------------------------------------

    this.handle(DaemonMethod.PROVIDER_SETTINGS_GET, async () => {
      return storage.getProviderSettings();
    });

    this.handle(DaemonMethod.PROVIDER_SETTINGS_SET, async (params) => {
      const providerId = params.providerId as string;
      const provider = params.provider as any;
      storage.setConnectedProvider(providerId as any, provider);
    });

    this.handle(DaemonMethod.PROVIDER_SETTINGS_REMOVE, async (params) => {
      storage.removeConnectedProvider(params.providerId as any);
    });

    this.handle(DaemonMethod.FETCH_MODELS, async (params) => {
      return fetchProviderModels(
        params.providerId as string,
        getApiKeyFn,
        params.options as any
      );
    });

    // -- Ollama -------------------------------------------------------------

    this.handle(DaemonMethod.OLLAMA_TEST, async (params) => {
      return testOllamaConnection(params.baseUrl as string);
    });

    this.handle(DaemonMethod.OLLAMA_TOOL_SUPPORT, async (params) => {
      return testOllamaModelToolSupport(
        params.modelName as string,
        params.baseUrl as string
      );
    });

    this.handle(DaemonMethod.OLLAMA_SET_CONFIG, async (params) => {
      storage.setOllamaConfig(params.config as any);
    });

    this.handle(DaemonMethod.OLLAMA_GET_CONFIG, async () => {
      return storage.getOllamaConfig();
    });

    // -- Azure Foundry ------------------------------------------------------

    this.handle(DaemonMethod.AZURE_FOUNDRY_TEST, async (params) => {
      return testAzureFoundryConnection(params as any);
    });

    this.handle(DaemonMethod.AZURE_FOUNDRY_VALIDATE, async (params) => {
      return validateAzureFoundry(params as any);
    });

    this.handle(DaemonMethod.AZURE_FOUNDRY_SET_CONFIG, async (params) => {
      storage.setAzureFoundryConfig(params.config as any);
    });

    this.handle(DaemonMethod.AZURE_FOUNDRY_GET_CONFIG, async () => {
      return storage.getAzureFoundryConfig();
    });

    // -- LiteLLM ------------------------------------------------------------

    this.handle(DaemonMethod.LITELLM_TEST, async (params) => {
      return testLiteLLMConnection(params.baseUrl as string);
    });

    this.handle(DaemonMethod.LITELLM_SET_CONFIG, async (params) => {
      storage.setLiteLLMConfig(params.config as any);
    });

    this.handle(DaemonMethod.LITELLM_GET_CONFIG, async () => {
      return storage.getLiteLLMConfig();
    });

    this.handle(DaemonMethod.LITELLM_FETCH_MODELS, async (params) => {
      return fetchLiteLLMModels(params.baseUrl as string);
    });

    // -- LM Studio ----------------------------------------------------------

    this.handle(DaemonMethod.LMSTUDIO_TEST, async (params) => {
      return testLMStudioConnection(params.baseUrl as string);
    });

    this.handle(DaemonMethod.LMSTUDIO_VALIDATE, async (params) => {
      return validateLMStudioConfig(params as any);
    });

    this.handle(DaemonMethod.LMSTUDIO_SET_CONFIG, async (params) => {
      storage.setLMStudioConfig(params.config as any);
    });

    this.handle(DaemonMethod.LMSTUDIO_GET_CONFIG, async () => {
      return storage.getLMStudioConfig();
    });

    this.handle(DaemonMethod.LMSTUDIO_FETCH_MODELS, async (params) => {
      return fetchLMStudioModels(params.baseUrl as string);
    });

    // -- OpenRouter ----------------------------------------------------------

    this.handle(DaemonMethod.OPENROUTER_FETCH_MODELS, async () => {
      return fetchOpenRouterModels();
    });

    // -- Bedrock ------------------------------------------------------------

    this.handle(DaemonMethod.BEDROCK_VALIDATE, async (params) => {
      return validateBedrockCredentials(params as any);
    });

    this.handle(DaemonMethod.BEDROCK_FETCH_MODELS, async (params) => {
      return fetchBedrockModels(params as any);
    });

    this.handle(DaemonMethod.BEDROCK_SET_CREDENTIALS, async (params) => {
      storage.storeBedrockCredentials(JSON.stringify(params.credentials));
    });

    this.handle(DaemonMethod.BEDROCK_GET_CREDENTIALS, async () => {
      return storage.getBedrockCredentials();
    });

    // -- Onboarding ---------------------------------------------------------

    this.handle(DaemonMethod.ONBOARDING_GET_COMPLETE, async () => {
      return storage.getOnboardingComplete();
    });

    this.handle(DaemonMethod.ONBOARDING_SET_COMPLETE, async (params) => {
      storage.setOnboardingComplete(params.complete as boolean);
    });

    // -- Skills -------------------------------------------------------------

    this.handle(DaemonMethod.SKILLS_LIST, async () => {
      return skillsManager.list();
    });

    this.handle(DaemonMethod.SKILLS_GET, async (params) => {
      return skillsManager.get(params.id as string);
    });

    this.handle(DaemonMethod.SKILLS_ADD, async (params) => {
      return skillsManager.add(params as any);
    });

    this.handle(DaemonMethod.SKILLS_UPDATE, async (params) => {
      return skillsManager.update(params.id as string, params.data as any);
    });

    this.handle(DaemonMethod.SKILLS_DELETE, async (params) => {
      return skillsManager.delete(params.id as string);
    });

    this.handle(DaemonMethod.SKILLS_TOGGLE, async (params) => {
      return skillsManager.toggle(params.id as string, params.enabled as boolean);
    });

    // -- Connectors (MCP) ---------------------------------------------------

    this.handle(DaemonMethod.CONNECTORS_LIST, async () => {
      return storage.getMcpConnectors();
    });

    this.handle(DaemonMethod.CONNECTORS_ADD, async (params) => {
      storage.addMcpConnector(params as any);
    });

    this.handle(DaemonMethod.CONNECTORS_UPDATE, async (params) => {
      storage.updateMcpConnector(params.id as string, params.data as any);
    });

    this.handle(DaemonMethod.CONNECTORS_DELETE, async (params) => {
      storage.deleteMcpConnector(params.id as string);
    });

    // -- App info -----------------------------------------------------------

    this.handle(DaemonMethod.APP_VERSION, async () => {
      return this.opts.appVersion;
    });

    this.handle(DaemonMethod.APP_PLATFORM, async () => {
      return process.platform;
    });
  }

  // -----------------------------------------------------------------------
  // Helper
  // -----------------------------------------------------------------------

  private handle(method: string, handler: RpcHandler): void {
    this.handlers.set(method, handler);
  }
}
