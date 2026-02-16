/**
 * Accomplish API - Interface to the Electron main process
 *
 * This module provides type-safe access to the accomplish API
 * exposed by the preload script via contextBridge.
 */

import type {
  Task,
  TaskConfig,
  TaskUpdateEvent,
  TaskStatus,
  PermissionRequest,
  PermissionResponse,
  TaskProgress,
  ApiKeyConfig,
  TaskMessage,
  BedrockCredentials,
  VertexCredentials,
  ProviderSettings,
  ProviderId,
  ConnectedProvider,
  TodoItem,
  ToolSupportStatus,
  Skill,
  McpConnector,
} from "@accomplish_ai/agent-core/common";

// Define the API interface
interface AccomplishAPI {
  // App info
  getVersion(): Promise<string>;
  getPlatform(): Promise<string>;

  // Shell
  openExternal(url: string): Promise<void>;

  // Task operations
  startTask(config: TaskConfig): Promise<Task>;
  cancelTask(taskId: string): Promise<void>;
  interruptTask(taskId: string): Promise<void>;
  getTask(taskId: string): Promise<Task | null>;
  listTasks(): Promise<Task[]>;
  deleteTask(taskId: string): Promise<void>;
  clearTaskHistory(): Promise<void>;

  // Permission responses
  respondToPermission(response: PermissionResponse): Promise<void>;

  // Session management
  resumeSession(
    sessionId: string,
    prompt: string,
    taskId?: string,
  ): Promise<Task>;

  // Settings
  getApiKeys(): Promise<ApiKeyConfig[]>;
  addApiKey(
    provider:
      | "anthropic"
      | "openai"
      | "openrouter"
      | "google"
      | "xai"
      | "deepseek"
      | "moonshot"
      | "zai"
      | "azure-foundry"
      | "custom"
      | "bedrock"
      | "litellm"
      | "lmstudio"
      | "elevenlabs",
    key: string,
    label?: string,
  ): Promise<ApiKeyConfig>;
  removeApiKey(id: string): Promise<void>;
  getDebugMode(): Promise<boolean>;
  setDebugMode(enabled: boolean): Promise<void>;
  getTheme(): Promise<string>;
  setTheme(theme: string): Promise<void>;
  onThemeChange?(
    callback: (data: { theme: string; resolved: string }) => void,
  ): () => void;
  getAppSettings(): Promise<{
    debugMode: boolean;
    onboardingComplete: boolean;
    theme: string;
  }>;
  getOpenAiBaseUrl(): Promise<string>;
  setOpenAiBaseUrl(baseUrl: string): Promise<void>;
  getOpenAiOauthStatus(): Promise<{ connected: boolean; expires?: number }>;
  loginOpenAiWithChatGpt(): Promise<{ ok: boolean; openedUrl?: string }>;

  // API Key management
  hasApiKey(): Promise<boolean>;
  setApiKey(key: string): Promise<void>;
  getApiKey(): Promise<string | null>;
  validateApiKey(key: string): Promise<{ valid: boolean; error?: string }>;
  validateApiKeyForProvider(
    provider: string,
    key: string,
    options?: Record<string, any>,
  ): Promise<{ valid: boolean; error?: string }>;
  clearApiKey(): Promise<void>;

  // Multi-provider API keys
  getAllApiKeys(): Promise<
    Record<string, { exists: boolean; prefix?: string }>
  >;
  hasAnyApiKey(): Promise<boolean>;

  // Onboarding
  getOnboardingComplete(): Promise<boolean>;
  setOnboardingComplete(complete: boolean): Promise<void>;

  // Claude CLI
  checkClaudeCli(): Promise<{
    installed: boolean;
    version: string | null;
    installCommand: string;
  }>;
  getClaudeVersion(): Promise<string | null>;

  // Model selection
  getSelectedModel(): Promise<{
    provider: string;
    model: string;
    baseUrl?: string;
    deploymentName?: string;
  } | null>;
  setSelectedModel(model: {
    provider: string;
    model: string;
    baseUrl?: string;
    deploymentName?: string;
  }): Promise<void>;

  // Ollama configuration
  testOllamaConnection(url: string): Promise<{
    success: boolean;
    models?: Array<{
      id: string;
      displayName: string;
      size: number;
      toolSupport?: ToolSupportStatus;
    }>;
    error?: string;
  }>;
  getOllamaConfig(): Promise<{
    baseUrl: string;
    enabled: boolean;
    lastValidated?: number;
    models?: Array<{
      id: string;
      displayName: string;
      size: number;
      toolSupport?: ToolSupportStatus;
    }>;
  } | null>;
  setOllamaConfig(
    config: {
      baseUrl: string;
      enabled: boolean;
      lastValidated?: number;
      models?: Array<{
        id: string;
        displayName: string;
        size: number;
        toolSupport?: ToolSupportStatus;
      }>;
    } | null,
  ): Promise<void>;

  // Azure Foundry configuration
  getAzureFoundryConfig(): Promise<{
    baseUrl: string;
    deploymentName: string;
    authType: "api-key" | "entra-id";
    enabled: boolean;
    lastValidated?: number;
  } | null>;
  setAzureFoundryConfig(
    config: {
      baseUrl: string;
      deploymentName: string;
      authType: "api-key" | "entra-id";
      enabled: boolean;
      lastValidated?: number;
    } | null,
  ): Promise<void>;
  testAzureFoundryConnection(config: {
    endpoint: string;
    deploymentName: string;
    authType: "api-key" | "entra-id";
    apiKey?: string;
  }): Promise<{ success: boolean; error?: string }>;
  saveAzureFoundryConfig(config: {
    endpoint: string;
    deploymentName: string;
    authType: "api-key" | "entra-id";
    apiKey?: string;
  }): Promise<void>;

  // Dynamic model fetching (generic, config-driven)
  fetchProviderModels(
    providerId: string,
    options?: { baseUrl?: string; zaiRegion?: string },
  ): Promise<{
    success: boolean;
    models?: Array<{ id: string; name: string }>;
    error?: string;
  }>;

  // OpenRouter configuration
  fetchOpenRouterModels(): Promise<{
    success: boolean;
    models?: Array<{
      id: string;
      name: string;
      provider: string;
      contextLength: number;
    }>;
    error?: string;
  }>;

  // LiteLLM configuration
  testLiteLLMConnection(
    url: string,
    apiKey?: string,
  ): Promise<{
    success: boolean;
    models?: Array<{
      id: string;
      name: string;
      provider: string;
      contextLength: number;
    }>;
    error?: string;
  }>;
  fetchLiteLLMModels(): Promise<{
    success: boolean;
    models?: Array<{
      id: string;
      name: string;
      provider: string;
      contextLength: number;
    }>;
    error?: string;
  }>;
  getLiteLLMConfig(): Promise<{
    baseUrl: string;
    enabled: boolean;
    lastValidated?: number;
    models?: Array<{
      id: string;
      name: string;
      provider: string;
      contextLength: number;
    }>;
  } | null>;
  setLiteLLMConfig(
    config: {
      baseUrl: string;
      enabled: boolean;
      lastValidated?: number;
      models?: Array<{
        id: string;
        name: string;
        provider: string;
        contextLength: number;
      }>;
    } | null,
  ): Promise<void>;

  // LM Studio configuration
  testLMStudioConnection(url: string): Promise<{
    success: boolean;
    models?: Array<{
      id: string;
      name: string;
      toolSupport: ToolSupportStatus;
    }>;
    error?: string;
  }>;
  fetchLMStudioModels(): Promise<{
    success: boolean;
    models?: Array<{
      id: string;
      name: string;
      toolSupport: ToolSupportStatus;
    }>;
    error?: string;
  }>;
  getLMStudioConfig(): Promise<{
    baseUrl: string;
    enabled: boolean;
    lastValidated?: number;
    models?: Array<{
      id: string;
      name: string;
      toolSupport: ToolSupportStatus;
    }>;
  } | null>;
  setLMStudioConfig(
    config: {
      baseUrl: string;
      enabled: boolean;
      lastValidated?: number;
      models?: Array<{
        id: string;
        name: string;
        toolSupport: ToolSupportStatus;
      }>;
    } | null,
  ): Promise<void>;

  // Bedrock configuration
  validateBedrockCredentials(
    credentials: string,
  ): Promise<{ valid: boolean; error?: string }>;
  saveBedrockCredentials(credentials: string): Promise<ApiKeyConfig>;
  getBedrockCredentials(): Promise<BedrockCredentials | null>;
  fetchBedrockModels(credentials: string): Promise<{
    success: boolean;
    models: Array<{ id: string; name: string; provider: string }>;
    error?: string;
  }>;

  // Vertex AI configuration
  validateVertexCredentials(
    credentials: string,
  ): Promise<{ valid: boolean; error?: string }>;
  saveVertexCredentials(credentials: string): Promise<ApiKeyConfig>;
  getVertexCredentials(): Promise<VertexCredentials | null>;
  fetchVertexModels(credentials: string): Promise<{
    success: boolean;
    models: Array<{ id: string; name: string; provider: string }>;
    error?: string;
  }>;
  detectVertexProject(): Promise<{
    success: boolean;
    projectId: string | null;
  }>;
  listVertexProjects(): Promise<{
    success: boolean;
    projects: Array<{ projectId: string; name: string }>;
    error?: string;
  }>;

  // E2E Testing
  isE2EMode(): Promise<boolean>;

  // Provider Settings API
  getProviderSettings(): Promise<ProviderSettings>;
  setActiveProvider(providerId: ProviderId | null): Promise<void>;
  getConnectedProvider(
    providerId: ProviderId,
  ): Promise<ConnectedProvider | null>;
  setConnectedProvider(
    providerId: ProviderId,
    provider: ConnectedProvider,
  ): Promise<void>;
  removeConnectedProvider(providerId: ProviderId): Promise<void>;
  updateProviderModel(
    providerId: ProviderId,
    modelId: string | null,
  ): Promise<void>;
  setProviderDebugMode(enabled: boolean): Promise<void>;
  getProviderDebugMode(): Promise<boolean>;

  // Todo operations
  getTodosForTask(taskId: string): Promise<TodoItem[]>;

  // Event subscriptions
  onTaskUpdate(callback: (event: TaskUpdateEvent) => void): () => void;
  onTaskUpdateBatch?(
    callback: (event: { taskId: string; messages: TaskMessage[] }) => void,
  ): () => void;
  onPermissionRequest(
    callback: (request: PermissionRequest) => void,
  ): () => void;
  onTaskProgress(callback: (progress: TaskProgress) => void): () => void;
  onDebugLog(callback: (log: unknown) => void): () => void;
  onDebugModeChange?(
    callback: (data: { enabled: boolean }) => void,
  ): () => void;
  onTaskStatusChange?(
    callback: (data: { taskId: string; status: TaskStatus }) => void,
  ): () => void;
  onTaskSummary?(
    callback: (data: { taskId: string; summary: string }) => void,
  ): () => void;
  onTodoUpdate?(
    callback: (data: { taskId: string; todos: TodoItem[] }) => void,
  ): () => void;
  onAuthError?(
    callback: (data: { providerId: string; message: string }) => void,
  ): () => void;

  // Speech-to-Text
  speechIsConfigured(): Promise<boolean>;
  speechGetConfig(): Promise<{
    enabled: boolean;
    hasApiKey: boolean;
    apiKeyPrefix?: string;
  }>;
  speechValidate(apiKey?: string): Promise<{ valid: boolean; error?: string }>;
  speechTranscribe(
    audioData: ArrayBuffer,
    mimeType?: string,
  ): Promise<
    | {
        success: true;
        result: {
          text: string;
          confidence?: number;
          duration: number;
          timestamp: number;
        };
      }
    | {
        success: false;
        error: { code: string; message: string };
      }
  >;

  // Logging
  logEvent(payload: {
    level?: string;
    message: string;
    context?: Record<string, unknown>;
  }): Promise<unknown>;
  exportLogs(): Promise<{
    success: boolean;
    path?: string;
    error?: string;
    reason?: string;
  }>;

  // Skills management
  getSkills(): Promise<Skill[]>;
  getEnabledSkills(): Promise<Skill[]>;
  setSkillEnabled(id: string, enabled: boolean): Promise<void>;
  getSkillContent(id: string): Promise<string | null>;
  pickSkillFile(): Promise<string | null>;
  addSkillFromFile(filePath: string): Promise<Skill>;
  addSkillFromGitHub(rawUrl: string): Promise<Skill>;
  deleteSkill(id: string): Promise<void>;
  resyncSkills(): Promise<Skill[]>;
  openSkillInEditor(filePath: string): Promise<void>;
  showSkillInFolder(filePath: string): Promise<void>;

  // MCP Connectors
  getConnectors(): Promise<McpConnector[]>;
  addConnector(name: string, url: string): Promise<McpConnector>;
  deleteConnector(id: string): Promise<void>;
  setConnectorEnabled(id: string, enabled: boolean): Promise<void>;
  startConnectorOAuth(
    connectorId: string,
  ): Promise<{ state: string; authUrl: string }>;
  completeConnectorOAuth(state: string, code: string): Promise<McpConnector>;
  disconnectConnector(connectorId: string): Promise<void>;
  onMcpAuthCallback?(callback: (url: string) => void): () => void;

  // HuggingFace Local Models
  huggingface?: {
    searchModels(
      query: string,
      limit?: number,
    ): Promise<
      Array<{
        id: string;
        name: string;
        description: string;
        size: number;
        quantizations: string[];
        tags: string[];
        downloads: number;
      }>
    >;

    getModelInfo(modelId: string): Promise<{
      id: string;
      name: string;
      description: string;
      size: number;
      quantizations: string[];
      tags: string[];
      downloads: number;
    } | null>;

    getInstalledModels(): Promise<
      Array<{
        id: string;
        name: string;
        size: number;
        loaded: boolean;
      }>
    >;

    getRecommendedModels(): Promise<
      Array<{
        id: string;
        name: string;
        description: string;
      }>
    >;

    isModelInstalled(modelId: string): Promise<boolean>;

    loadModel(config: {
      modelId: string;
      quantization: string;
      device: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      cacheDir?: string;
    }): Promise<{ success: boolean; message: string }>;

    unloadModel(modelId: string): Promise<{ success: boolean }>;
    removeModel(modelId: string): Promise<{ success: boolean }>;

    generate(
      modelId: string,
      messages: Array<{ role: string; content: string }>,
      options?: { temperature?: number; maxTokens?: number; topP?: number },
    ): Promise<string>;

    generateStream(
      modelId: string,
      messages: Array<{ role: string; content: string }>,
      options?: { temperature?: number; maxTokens?: number; topP?: number },
    ): Promise<{ success: boolean }>;

    getCacheStats(): Promise<{
      totalSize: number;
      modelCount: number;
      cacheDir: string;
      modelSizes: Array<{ modelId: string; size: number }>;
    }>;

    getLoadedModelInfo(modelId: string): Promise<{
      modelId: string;
      quantization: string;
      device: string;
    } | null>;

    getLoadedModels(): Promise<string[]>;

    onDownloadProgress(
      callback: (progress: {
        modelId: string;
        status: string;
        progress: number;
        downloadedBytes: number;
        totalBytes: number;
        error?: string;
      }) => void,
    ): () => void;

    onStreamChunk(
      callback: (data: { modelId: string; chunk: string }) => void,
    ): () => void;
    onStreamEnd(callback: (data: { modelId: string }) => void): () => void;
    onStreamError(
      callback: (data: { modelId: string; error: string }) => void,
    ): () => void;
  };
}

interface AccomplishShell {
  version: string;
  platform: string;
  isElectron: true;
}

// Extend Window interface
declare global {
  interface Window {
    accomplish: AccomplishAPI;
    accomplishShell?: AccomplishShell;
  }
}

/**
 * Check if running in Electron shell
 */
export function isRunningInElectron(): boolean {
  return window.accomplishShell?.isElectron === true;
}

/**
 * Get shell version if available
 */
export function getShellVersion(): string | null {
  return window.accomplishShell?.version ?? null;
}

/**
 * Get shell platform if available
 */
export function getShellPlatform(): string | null {
  return window.accomplishShell?.platform ?? null;
}

// Create a mock API for browser environments
function createMockAPI(): AccomplishAPI {
  const notAvailable = (methodName: string) => {
    throw new Error(
      `Accomplish API method '${methodName}' not available - not running in Electron`,
    );
  };

  return new Proxy({} as AccomplishAPI, {
    get(target, prop: string) {
      // Return a function that throws an error when called
      return (...args: any[]) => {
        console.warn(
          `Accomplish API method '${prop}' called but not available in browser environment`,
        );
        notAvailable(prop);
      };
    },
  });
}

export function getAccomplish(): AccomplishAPI {
  if (!window.accomplish) {
    console.warn(
      "Accomplish API not available - returning mock API for browser environment",
    );
    return createMockAPI();
  }

  return {
    ...window.accomplish,

    validateBedrockCredentials: async (
      credentials: string,
    ): Promise<{ valid: boolean; error?: string }> => {
      return window.accomplish!.validateBedrockCredentials(credentials);
    },

    saveBedrockCredentials: async (
      credentials: string,
    ): Promise<ApiKeyConfig> => {
      return window.accomplish!.saveBedrockCredentials(credentials);
    },

    getBedrockCredentials: async (): Promise<BedrockCredentials | null> => {
      return window.accomplish!.getBedrockCredentials();
    },

    fetchBedrockModels: (credentials: string) =>
      window.accomplish!.fetchBedrockModels(credentials),

    validateVertexCredentials: async (
      credentials: string,
    ): Promise<{ valid: boolean; error?: string }> => {
      return window.accomplish!.validateVertexCredentials(credentials);
    },

    saveVertexCredentials: async (
      credentials: string,
    ): Promise<ApiKeyConfig> => {
      return window.accomplish!.saveVertexCredentials(credentials);
    },

    getVertexCredentials: async (): Promise<VertexCredentials | null> => {
      return window.accomplish!.getVertexCredentials();
    },

    fetchVertexModels: (credentials: string) =>
      window.accomplish!.fetchVertexModels(credentials),

    detectVertexProject: () => window.accomplish!.detectVertexProject(),

    listVertexProjects: () => window.accomplish!.listVertexProjects(),
  };
}

/**
 * React hook to use the accomplish API
 */
export function useAccomplish(): AccomplishAPI {
  return getAccomplish();
}
