/**
 * Daemon Client
 *
 * High-level typed client for the Electron main process to communicate with
 * the daemon. Wraps the raw JSON-RPC transport with strongly-typed methods
 * that mirror the current IPC handler API surface.
 *
 * Usage in Electron main process:
 *   const client = new DaemonClient();
 *   await client.connect();
 *   const task = await client.startTask({ prompt: 'Fix the bug' });
 *   client.on('task.update.batch', (data) => { ... });
 */

import { DaemonTransportClient } from './transport';
import { DaemonMethod, DaemonEvent, getDaemonSocketPath } from './protocol';
import { EventEmitter } from 'events';
import type {
  TaskConfig,
  Task,
  PermissionResponse,
  SelectedModel,
  TodoItem,
  Skill,
  McpConnector,
  OllamaConfig,
  AzureFoundryConfig,
  LiteLLMConfig,
  LMStudioConfig,
  ToolSupportStatus,
} from '@accomplish_ai/agent-core';

export interface DaemonClientConfig {
  /** Custom socket path (defaults to getDaemonSocketPath()) */
  socketPath?: string;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
}

/**
 * High-level daemon client for the Electron UI process.
 *
 * Emits typed events for all daemon push notifications, making it easy
 * to wire them into Electron IPC (sender.send) or other transports.
 */
export class DaemonClient extends EventEmitter {
  private transport: DaemonTransportClient;

  constructor(config?: DaemonClientConfig) {
    super();
    this.transport = new DaemonTransportClient({
      socketPath: config?.socketPath ?? getDaemonSocketPath(),
      autoReconnect: config?.autoReconnect ?? true,
    });

    // Re-emit transport events
    this.transport.on('connected', () => this.emit('connected'));
    this.transport.on('disconnected', () => this.emit('disconnected'));
    this.transport.on('reconnecting', (attempt: number) => this.emit('reconnecting', attempt));
    this.transport.on('reconnect-failed', () => this.emit('reconnect-failed'));
    this.transport.on('error', (err: Error) => this.emit('error', err));

    // Re-emit all daemon notifications as typed events
    this.transport.on('notification', (method: string, params: Record<string, unknown>) => {
      this.emit(method, params);
      // Also emit convenience short names
      this.emit('daemon-event', method, params);
    });
  }

  get connected(): boolean {
    return this.transport.connected;
  }

  async connect(): Promise<void> {
    return this.transport.connect();
  }

  disconnect(): void {
    this.transport.disconnect();
  }

  private async rpc(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    return this.transport.request(method, params, timeoutMs);
  }

  // -----------------------------------------------------------------------
  // Health / Lifecycle
  // -----------------------------------------------------------------------

  async ping(): Promise<{ pong: boolean; timestamp: number }> {
    return this.rpc(DaemonMethod.PING) as Promise<{ pong: boolean; timestamp: number }>;
  }

  async shutdown(): Promise<void> {
    await this.rpc(DaemonMethod.SHUTDOWN);
  }

  async getStatus(): Promise<{
    uptime: number;
    clients: number;
    memoryUsage: NodeJS.MemoryUsage;
    version: string;
  }> {
    return this.rpc(DaemonMethod.GET_STATUS) as any;
  }

  // -----------------------------------------------------------------------
  // Task Operations
  // -----------------------------------------------------------------------

  async startTask(config: TaskConfig): Promise<Task> {
    return this.rpc(DaemonMethod.TASK_START, config as any) as Promise<Task>;
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.rpc(DaemonMethod.TASK_CANCEL, { taskId });
  }

  async interruptTask(taskId: string): Promise<void> {
    await this.rpc(DaemonMethod.TASK_INTERRUPT, { taskId });
  }

  async getTask(taskId: string): Promise<Task | null> {
    return this.rpc(DaemonMethod.TASK_GET, { taskId }) as Promise<Task | null>;
  }

  async listTasks(): Promise<Task[]> {
    return this.rpc(DaemonMethod.TASK_LIST) as Promise<Task[]>;
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.rpc(DaemonMethod.TASK_DELETE, { taskId });
  }

  async clearTaskHistory(): Promise<void> {
    await this.rpc(DaemonMethod.TASK_CLEAR_HISTORY);
  }

  async getTodosForTask(taskId: string): Promise<TodoItem[]> {
    return this.rpc(DaemonMethod.TASK_GET_TODOS, { taskId }) as Promise<TodoItem[]>;
  }

  async resumeSession(sessionId: string, prompt: string, taskId?: string): Promise<Task> {
    return this.rpc(DaemonMethod.SESSION_RESUME, { sessionId, prompt, taskId }) as Promise<Task>;
  }

  // -----------------------------------------------------------------------
  // Permission
  // -----------------------------------------------------------------------

  async respondToPermission(response: PermissionResponse): Promise<void> {
    await this.rpc(DaemonMethod.PERMISSION_RESPOND, response as any);
  }

  // -----------------------------------------------------------------------
  // Settings
  // -----------------------------------------------------------------------

  async getApiKeys(): Promise<unknown[]> {
    return this.rpc(DaemonMethod.SETTINGS_GET_API_KEYS) as Promise<unknown[]>;
  }

  async addApiKey(provider: string, key: string, label?: string): Promise<unknown> {
    return this.rpc(DaemonMethod.SETTINGS_ADD_API_KEY, { provider, key, label });
  }

  async removeApiKey(provider: string): Promise<void> {
    await this.rpc(DaemonMethod.SETTINGS_REMOVE_API_KEY, { provider });
  }

  async getDebugMode(): Promise<boolean> {
    return this.rpc(DaemonMethod.SETTINGS_GET_DEBUG_MODE) as Promise<boolean>;
  }

  async setDebugMode(enabled: boolean): Promise<void> {
    await this.rpc(DaemonMethod.SETTINGS_SET_DEBUG_MODE, { enabled });
  }

  async getTheme(): Promise<string> {
    return this.rpc(DaemonMethod.SETTINGS_GET_THEME) as Promise<string>;
  }

  async setTheme(theme: string): Promise<void> {
    await this.rpc(DaemonMethod.SETTINGS_SET_THEME, { theme });
  }

  async getAppSettings(): Promise<{ debugMode: boolean; onboardingComplete: boolean; theme: string }> {
    return this.rpc(DaemonMethod.SETTINGS_GET_APP_SETTINGS) as any;
  }

  async getOpenAiBaseUrl(): Promise<string> {
    return this.rpc(DaemonMethod.SETTINGS_GET_OPENAI_BASE_URL) as Promise<string>;
  }

  async setOpenAiBaseUrl(baseUrl: string): Promise<void> {
    await this.rpc(DaemonMethod.SETTINGS_SET_OPENAI_BASE_URL, { baseUrl });
  }

  async getOpenAiOauthStatus(): Promise<{ connected: boolean; expires?: number }> {
    return this.rpc(DaemonMethod.SETTINGS_GET_OPENAI_OAUTH_STATUS) as any;
  }

  // -----------------------------------------------------------------------
  // API Key Management
  // -----------------------------------------------------------------------

  async hasApiKey(): Promise<boolean> {
    return this.rpc(DaemonMethod.API_KEY_EXISTS) as Promise<boolean>;
  }

  async setApiKey(provider: string, key: string): Promise<void> {
    await this.rpc(DaemonMethod.API_KEY_SET, { provider, key });
  }

  async getApiKey(provider?: string): Promise<string | null> {
    return this.rpc(DaemonMethod.API_KEY_GET, { provider }) as Promise<string | null>;
  }

  async validateApiKey(key: string): Promise<{ valid: boolean; error?: string }> {
    return this.rpc(DaemonMethod.API_KEY_VALIDATE, { key }) as any;
  }

  async validateApiKeyForProvider(
    provider: string,
    key: string,
    options?: Record<string, any>
  ): Promise<{ valid: boolean; error?: string }> {
    return this.rpc(DaemonMethod.API_KEY_VALIDATE_PROVIDER, { provider, key, options }) as any;
  }

  async clearApiKey(): Promise<void> {
    await this.rpc(DaemonMethod.API_KEY_CLEAR);
  }

  async getAllApiKeys(): Promise<Record<string, { exists: boolean; prefix?: string }>> {
    return this.rpc(DaemonMethod.API_KEYS_ALL) as any;
  }

  async hasAnyApiKey(): Promise<boolean> {
    return this.rpc(DaemonMethod.API_KEYS_HAS_ANY) as Promise<boolean>;
  }

  // -----------------------------------------------------------------------
  // Model Selection
  // -----------------------------------------------------------------------

  async getSelectedModel(): Promise<SelectedModel | null> {
    return this.rpc(DaemonMethod.MODEL_GET) as Promise<SelectedModel | null>;
  }

  async setSelectedModel(model: SelectedModel): Promise<void> {
    await this.rpc(DaemonMethod.MODEL_SET, model as any);
  }

  // -----------------------------------------------------------------------
  // Provider Settings
  // -----------------------------------------------------------------------

  async getProviderSettings(): Promise<unknown> {
    return this.rpc(DaemonMethod.PROVIDER_SETTINGS_GET);
  }

  async setProviderSetting(providerId: string, provider: unknown): Promise<void> {
    await this.rpc(DaemonMethod.PROVIDER_SETTINGS_SET, { providerId, provider } as any);
  }

  async removeProviderSetting(providerId: string): Promise<void> {
    await this.rpc(DaemonMethod.PROVIDER_SETTINGS_REMOVE, { providerId });
  }

  async fetchModels(providerId: string, options?: unknown): Promise<unknown> {
    return this.rpc(DaemonMethod.FETCH_MODELS, { providerId, options } as any);
  }

  // -----------------------------------------------------------------------
  // Ollama
  // -----------------------------------------------------------------------

  async testOllamaConnection(baseUrl: string): Promise<unknown> {
    return this.rpc(DaemonMethod.OLLAMA_TEST, { baseUrl });
  }

  async testOllamaToolSupport(modelName: string, baseUrl: string): Promise<ToolSupportStatus> {
    return this.rpc(DaemonMethod.OLLAMA_TOOL_SUPPORT, { modelName, baseUrl }) as Promise<ToolSupportStatus>;
  }

  async setOllamaConfig(config: OllamaConfig): Promise<void> {
    await this.rpc(DaemonMethod.OLLAMA_SET_CONFIG, { config } as any);
  }

  async getOllamaConfig(): Promise<OllamaConfig | null> {
    return this.rpc(DaemonMethod.OLLAMA_GET_CONFIG) as Promise<OllamaConfig | null>;
  }

  // -----------------------------------------------------------------------
  // Azure Foundry
  // -----------------------------------------------------------------------

  async testAzureFoundryConnection(config: unknown): Promise<unknown> {
    return this.rpc(DaemonMethod.AZURE_FOUNDRY_TEST, config as any);
  }

  async validateAzureFoundry(config: unknown): Promise<unknown> {
    return this.rpc(DaemonMethod.AZURE_FOUNDRY_VALIDATE, config as any);
  }

  async setAzureFoundryConfig(config: AzureFoundryConfig): Promise<void> {
    await this.rpc(DaemonMethod.AZURE_FOUNDRY_SET_CONFIG, { config } as any);
  }

  async getAzureFoundryConfig(): Promise<AzureFoundryConfig | null> {
    return this.rpc(DaemonMethod.AZURE_FOUNDRY_GET_CONFIG) as Promise<AzureFoundryConfig | null>;
  }

  // -----------------------------------------------------------------------
  // LiteLLM
  // -----------------------------------------------------------------------

  async testLiteLLMConnection(baseUrl: string): Promise<unknown> {
    return this.rpc(DaemonMethod.LITELLM_TEST, { baseUrl });
  }

  async setLiteLLMConfig(config: LiteLLMConfig): Promise<void> {
    await this.rpc(DaemonMethod.LITELLM_SET_CONFIG, { config } as any);
  }

  async getLiteLLMConfig(): Promise<LiteLLMConfig | null> {
    return this.rpc(DaemonMethod.LITELLM_GET_CONFIG) as Promise<LiteLLMConfig | null>;
  }

  async fetchLiteLLMModels(baseUrl: string): Promise<unknown> {
    return this.rpc(DaemonMethod.LITELLM_FETCH_MODELS, { baseUrl });
  }

  // -----------------------------------------------------------------------
  // LM Studio
  // -----------------------------------------------------------------------

  async testLMStudioConnection(baseUrl: string): Promise<unknown> {
    return this.rpc(DaemonMethod.LMSTUDIO_TEST, { baseUrl });
  }

  async validateLMStudioConfig(config: unknown): Promise<unknown> {
    return this.rpc(DaemonMethod.LMSTUDIO_VALIDATE, config as any);
  }

  async setLMStudioConfig(config: LMStudioConfig): Promise<void> {
    await this.rpc(DaemonMethod.LMSTUDIO_SET_CONFIG, { config } as any);
  }

  async getLMStudioConfig(): Promise<LMStudioConfig | null> {
    return this.rpc(DaemonMethod.LMSTUDIO_GET_CONFIG) as Promise<LMStudioConfig | null>;
  }

  async fetchLMStudioModels(baseUrl: string): Promise<unknown> {
    return this.rpc(DaemonMethod.LMSTUDIO_FETCH_MODELS, { baseUrl });
  }

  // -----------------------------------------------------------------------
  // OpenRouter
  // -----------------------------------------------------------------------

  async fetchOpenRouterModels(): Promise<unknown> {
    return this.rpc(DaemonMethod.OPENROUTER_FETCH_MODELS);
  }

  // -----------------------------------------------------------------------
  // Bedrock
  // -----------------------------------------------------------------------

  async validateBedrockCredentials(credentials: unknown): Promise<unknown> {
    return this.rpc(DaemonMethod.BEDROCK_VALIDATE, credentials as any);
  }

  async fetchBedrockModels(credentials: unknown): Promise<unknown> {
    return this.rpc(DaemonMethod.BEDROCK_FETCH_MODELS, credentials as any);
  }

  async setBedrockCredentials(credentials: unknown): Promise<void> {
    await this.rpc(DaemonMethod.BEDROCK_SET_CREDENTIALS, { credentials } as any);
  }

  async getBedrockCredentials(): Promise<unknown> {
    return this.rpc(DaemonMethod.BEDROCK_GET_CREDENTIALS);
  }

  // -----------------------------------------------------------------------
  // Onboarding
  // -----------------------------------------------------------------------

  async getOnboardingComplete(): Promise<boolean> {
    return this.rpc(DaemonMethod.ONBOARDING_GET_COMPLETE) as Promise<boolean>;
  }

  async setOnboardingComplete(complete: boolean): Promise<void> {
    await this.rpc(DaemonMethod.ONBOARDING_SET_COMPLETE, { complete });
  }

  // -----------------------------------------------------------------------
  // OpenCode CLI
  // -----------------------------------------------------------------------

  async checkOpenCodeCli(): Promise<{
    installed: boolean;
    version: string | null;
    installCommand: string;
  }> {
    return this.rpc(DaemonMethod.OPENCODE_CHECK) as any;
  }

  async getOpenCodeVersion(): Promise<string | null> {
    return this.rpc(DaemonMethod.OPENCODE_VERSION) as Promise<string | null>;
  }

  // -----------------------------------------------------------------------
  // Skills
  // -----------------------------------------------------------------------

  async listSkills(): Promise<Skill[]> {
    return this.rpc(DaemonMethod.SKILLS_LIST) as Promise<Skill[]>;
  }

  async getSkill(id: string): Promise<Skill | null> {
    return this.rpc(DaemonMethod.SKILLS_GET, { id }) as Promise<Skill | null>;
  }

  async addSkill(skill: unknown): Promise<Skill> {
    return this.rpc(DaemonMethod.SKILLS_ADD, skill as any) as Promise<Skill>;
  }

  async updateSkill(id: string, data: unknown): Promise<Skill> {
    return this.rpc(DaemonMethod.SKILLS_UPDATE, { id, data } as any) as Promise<Skill>;
  }

  async deleteSkill(id: string): Promise<void> {
    await this.rpc(DaemonMethod.SKILLS_DELETE, { id });
  }

  async toggleSkill(id: string, enabled: boolean): Promise<void> {
    await this.rpc(DaemonMethod.SKILLS_TOGGLE, { id, enabled });
  }

  // -----------------------------------------------------------------------
  // Connectors (MCP)
  // -----------------------------------------------------------------------

  async listConnectors(): Promise<McpConnector[]> {
    return this.rpc(DaemonMethod.CONNECTORS_LIST) as Promise<McpConnector[]>;
  }

  async addConnector(connector: McpConnector): Promise<void> {
    await this.rpc(DaemonMethod.CONNECTORS_ADD, connector as any);
  }

  async updateConnector(id: string, data: Partial<McpConnector>): Promise<void> {
    await this.rpc(DaemonMethod.CONNECTORS_UPDATE, { id, data } as any);
  }

  async deleteConnector(id: string): Promise<void> {
    await this.rpc(DaemonMethod.CONNECTORS_DELETE, { id });
  }

  // -----------------------------------------------------------------------
  // App Info
  // -----------------------------------------------------------------------

  async getVersion(): Promise<string> {
    return this.rpc(DaemonMethod.APP_VERSION) as Promise<string>;
  }

  async getPlatform(): Promise<string> {
    return this.rpc(DaemonMethod.APP_PLATFORM) as Promise<string>;
  }
}
