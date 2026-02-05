/**
 * Storage API Interface
 *
 * This module defines the public interface for all storage operations in agent-core.
 * It provides a unified API for task history, app settings, provider settings, and secure storage.
 */

// Import types from common/types
import type { Task, TaskStatus, TaskMessage } from '../common/types/task.js';
import type { TodoItem } from '../common/types/todo.js';
import type {
  SelectedModel,
  OllamaConfig,
  LiteLLMConfig,
  AzureFoundryConfig,
  LMStudioConfig,
} from '../common/types/provider.js';
import type {
  ProviderId,
  ProviderSettings,
  ConnectedProvider,
} from '../common/types/providerSettings.js';

// ============================================================================
// Storage Configuration Types
// ============================================================================

/**
 * Options for initializing the storage system
 */
export interface StorageOptions {
  /** Path to the database file. If not provided, uses default location. */
  databasePath?: string;
  /** Whether to run migrations on initialization. Default: true */
  runMigrations?: boolean;
  /** Enable verbose logging for debugging. Default: false */
  verbose?: boolean;
  /** Custom user data directory for storage. */
  userDataPath?: string;
}

// ============================================================================
// Data Types
// ============================================================================

/**
 * Extended Task type with storage-specific fields.
 * Represents a task as stored in the database.
 */
export interface StoredTask {
  /** Unique identifier for the task */
  id: string;
  /** The user's prompt/request */
  prompt: string;
  /** AI-generated summary of the task */
  summary?: string;
  /** Current status of the task */
  status: TaskStatus;
  /** Messages exchanged during task execution */
  messages: TaskMessage[];
  /** Session ID for continuing conversations */
  sessionId?: string;
  /** ISO timestamp when the task was created */
  createdAt: string;
  /** ISO timestamp when task execution started */
  startedAt?: string;
  /** ISO timestamp when the task completed */
  completedAt?: string;
}

/**
 * Application-level settings
 */
export interface AppSettings {
  /** Whether debug mode is enabled */
  debugMode: boolean;
  /** Whether the user has completed onboarding */
  onboardingComplete: boolean;
  /** Currently selected model configuration */
  selectedModel: SelectedModel | null;
  /** Ollama local server configuration */
  ollamaConfig: OllamaConfig | null;
  /** LiteLLM proxy configuration */
  litellmConfig: LiteLLMConfig | null;
  /** Azure AI Foundry configuration */
  azureFoundryConfig: AzureFoundryConfig | null;
  /** LM Studio local server configuration */
  lmstudioConfig: LMStudioConfig | null;
  /** Custom base URL for OpenAI-compatible endpoints */
  openaiBaseUrl: string;
}

// ============================================================================
// Storage API Interface
// ============================================================================

/**
 * Unified storage API interface for all persistence operations.
 *
 * This interface consolidates all storage operations into a single contract:
 * - Task history management
 * - Application settings
 * - Provider configuration
 * - Secure credential storage
 * - Lifecycle management
 */
export interface StorageAPI {
  // ==========================================================================
  // Task History Operations
  // ==========================================================================

  /**
   * Get all stored tasks, ordered by creation date (newest first).
   * @returns Array of stored tasks
   */
  getTasks(): StoredTask[];

  /**
   * Get a specific task by ID.
   * @param taskId - The unique task identifier
   * @returns The task if found, undefined otherwise
   */
  getTask(taskId: string): StoredTask | undefined;

  /**
   * Save a task to storage. Creates new or updates existing.
   * @param task - The task to save
   */
  saveTask(task: Task): void;

  /**
   * Update the status of an existing task.
   * @param taskId - The task identifier
   * @param status - The new status
   * @param completedAt - Optional completion timestamp (ISO string)
   */
  updateTaskStatus(taskId: string, status: TaskStatus, completedAt?: string): void;

  /**
   * Add a message to an existing task.
   * @param taskId - The task identifier
   * @param message - The message to add
   */
  addTaskMessage(taskId: string, message: TaskMessage): void;

  /**
   * Update the session ID for a task.
   * @param taskId - The task identifier
   * @param sessionId - The new session ID
   */
  updateTaskSessionId(taskId: string, sessionId: string): void;

  /**
   * Update the summary for a task.
   * @param taskId - The task identifier
   * @param summary - The task summary
   */
  updateTaskSummary(taskId: string, summary: string): void;

  /**
   * Delete a specific task and its associated data.
   * @param taskId - The task identifier
   */
  deleteTask(taskId: string): void;

  /**
   * Clear all task history.
   */
  clearHistory(): void;

  /**
   * Get todo items associated with a task.
   * @param taskId - The task identifier
   * @returns Array of todo items
   */
  getTodosForTask(taskId: string): TodoItem[];

  /**
   * Save todo items for a task. Replaces existing todos.
   * @param taskId - The task identifier
   * @param todos - Array of todo items to save
   */
  saveTodosForTask(taskId: string, todos: TodoItem[]): void;

  /**
   * Clear all todos for a specific task.
   * @param taskId - The task identifier
   */
  clearTodosForTask(taskId: string): void;

  // ==========================================================================
  // App Settings Operations
  // ==========================================================================

  /**
   * Get the current debug mode setting.
   * @returns true if debug mode is enabled
   */
  getDebugMode(): boolean;

  /**
   * Set the debug mode setting.
   * @param enabled - Whether to enable debug mode
   */
  setDebugMode(enabled: boolean): void;

  /**
   * Check if onboarding has been completed.
   * @returns true if onboarding is complete
   */
  getOnboardingComplete(): boolean;

  /**
   * Set the onboarding completion status.
   * @param complete - Whether onboarding is complete
   */
  setOnboardingComplete(complete: boolean): void;

  /**
   * Get the currently selected model configuration.
   * @returns The selected model or null if none selected
   */
  getSelectedModel(): SelectedModel | null;

  /**
   * Set the selected model configuration.
   * @param model - The model configuration to set
   */
  setSelectedModel(model: SelectedModel): void;

  /**
   * Get the Ollama server configuration.
   * @returns Ollama config or null if not configured
   */
  getOllamaConfig(): OllamaConfig | null;

  /**
   * Set the Ollama server configuration.
   * @param config - The Ollama configuration, or null to clear
   */
  setOllamaConfig(config: OllamaConfig | null): void;

  /**
   * Get the LiteLLM proxy configuration.
   * @returns LiteLLM config or null if not configured
   */
  getLiteLLMConfig(): LiteLLMConfig | null;

  /**
   * Set the LiteLLM proxy configuration.
   * @param config - The LiteLLM configuration, or null to clear
   */
  setLiteLLMConfig(config: LiteLLMConfig | null): void;

  /**
   * Get the Azure AI Foundry configuration.
   * @returns Azure Foundry config or null if not configured
   */
  getAzureFoundryConfig(): AzureFoundryConfig | null;

  /**
   * Set the Azure AI Foundry configuration.
   * @param config - The Azure Foundry configuration, or null to clear
   */
  setAzureFoundryConfig(config: AzureFoundryConfig | null): void;

  /**
   * Get the LM Studio configuration.
   * @returns LM Studio config or null if not configured
   */
  getLMStudioConfig(): LMStudioConfig | null;

  /**
   * Set the LM Studio configuration.
   * @param config - The LM Studio configuration, or null to clear
   */
  setLMStudioConfig(config: LMStudioConfig | null): void;

  /**
   * Get the custom OpenAI base URL.
   * @returns The base URL or empty string if not set
   */
  getOpenAiBaseUrl(): string;

  /**
   * Set the custom OpenAI base URL.
   * @param baseUrl - The base URL to set
   */
  setOpenAiBaseUrl(baseUrl: string): void;

  /**
   * Get all app settings as a single object.
   * @returns Complete app settings
   */
  getAppSettings(): AppSettings;

  /**
   * Reset all app settings to defaults.
   */
  clearAppSettings(): void;

  // ==========================================================================
  // Provider Settings Operations
  // ==========================================================================

  /**
   * Get all provider settings.
   * @returns Complete provider settings including connected providers
   */
  getProviderSettings(): ProviderSettings;

  /**
   * Set the active provider for API calls.
   * @param providerId - The provider ID to activate, or null to clear
   */
  setActiveProvider(providerId: ProviderId | null): void;

  /**
   * Get the currently active provider ID.
   * @returns The active provider ID or null if none active
   */
  getActiveProviderId(): ProviderId | null;

  /**
   * Get a connected provider's configuration.
   * @param providerId - The provider ID to look up
   * @returns The connected provider or null if not connected
   */
  getConnectedProvider(providerId: ProviderId): ConnectedProvider | null;

  /**
   * Set or update a connected provider's configuration.
   * @param providerId - The provider ID
   * @param provider - The provider configuration
   */
  setConnectedProvider(providerId: ProviderId, provider: ConnectedProvider): void;

  /**
   * Remove a connected provider.
   * @param providerId - The provider ID to remove
   */
  removeConnectedProvider(providerId: ProviderId): void;

  /**
   * Update the selected model for a provider.
   * @param providerId - The provider ID
   * @param modelId - The model ID to select, or null to clear
   */
  updateProviderModel(providerId: ProviderId, modelId: string | null): void;

  /**
   * Set provider-level debug mode.
   * @param enabled - Whether to enable debug mode
   */
  setProviderDebugMode(enabled: boolean): void;

  /**
   * Get provider-level debug mode setting.
   * @returns true if provider debug mode is enabled
   */
  getProviderDebugMode(): boolean;

  /**
   * Clear all provider settings.
   */
  clearProviderSettings(): void;

  /**
   * Get the active provider and model combination.
   * @returns Object with provider, model, and optional baseUrl, or null if none ready
   */
  getActiveProviderModel(): {
    provider: ProviderId;
    model: string;
    baseUrl?: string;
  } | null;

  /**
   * Check if any provider is ready for use (connected with model selected).
   * @returns true if at least one provider is ready
   */
  hasReadyProvider(): boolean;

  /**
   * Get IDs of all connected providers.
   * @returns Array of connected provider IDs
   */
  getConnectedProviderIds(): ProviderId[];

  // ==========================================================================
  // Secure Storage Operations
  // ==========================================================================

  /**
   * Store an API key securely.
   * @param provider - The provider identifier
   * @param apiKey - The API key to store
   */
  storeApiKey(provider: string, apiKey: string): void;

  /**
   * Retrieve a stored API key.
   * @param provider - The provider identifier
   * @returns The API key or null if not found
   */
  getApiKey(provider: string): string | null;

  /**
   * Delete a stored API key.
   * @param provider - The provider identifier
   * @returns true if key was deleted, false if not found
   */
  deleteApiKey(provider: string): boolean;

  /**
   * Get all stored API keys.
   * @returns Promise resolving to a map of provider to API key (or null if not set)
   */
  getAllApiKeys(): Promise<Record<string, string | null>>;

  /**
   * Store AWS Bedrock credentials securely.
   * @param credentials - JSON string of Bedrock credentials
   */
  storeBedrockCredentials(credentials: string): void;

  /**
   * Get stored AWS Bedrock credentials.
   * @returns Parsed credentials object or null if not set
   */
  getBedrockCredentials(): Record<string, string> | null;

  /**
   * Check if any API key is stored.
   * @returns Promise resolving to true if at least one key exists
   */
  hasAnyApiKey(): Promise<boolean>;

  /**
   * Clear all secure storage (API keys, credentials).
   */
  clearSecureStorage(): void;

  // ==========================================================================
  // Lifecycle Operations
  // ==========================================================================

  /**
   * Initialize the storage system.
   * Creates database, runs migrations, and sets up connections.
   */
  initialize(): void;

  /**
   * Close the storage system and release resources.
   * Should be called during application shutdown.
   */
  close(): void;

  /**
   * Check if the database has been initialized.
   * @returns true if database is ready for operations
   */
  isDatabaseInitialized(): boolean;

  /**
   * Get the path to the database file.
   * @returns The database file path or null if not initialized
   */
  getDatabasePath(): string | null;
}

// ============================================================================
// Type Re-exports for Convenience
// ============================================================================

export type {
  Task,
  TaskStatus,
  TaskMessage,
  TodoItem,
  SelectedModel,
  OllamaConfig,
  LiteLLMConfig,
  AzureFoundryConfig,
  LMStudioConfig,
  ProviderId,
  ProviderSettings,
  ConnectedProvider,
};
