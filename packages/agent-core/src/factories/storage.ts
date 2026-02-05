/**
 * Factory for creating Storage instances
 * This factory composes all storage repositories and secure storage into a unified StorageAPI.
 */

import {
  initializeDatabase,
  closeDatabase,
  isDatabaseInitialized,
  getDatabasePath,
} from '../storage/database.js';

// Task History repository functions
import {
  getTasks,
  getTask,
  saveTask,
  updateTaskStatus,
  addTaskMessage,
  updateTaskSessionId,
  updateTaskSummary,
  deleteTask,
  clearHistory,
  getTodosForTask,
  saveTodosForTask,
  clearTodosForTask,
} from '../storage/repositories/taskHistory.js';

// App Settings repository functions
import {
  getDebugMode,
  setDebugMode,
  getOnboardingComplete,
  setOnboardingComplete,
  getSelectedModel,
  setSelectedModel,
  getOllamaConfig,
  setOllamaConfig,
  getLiteLLMConfig,
  setLiteLLMConfig,
  getAzureFoundryConfig,
  setAzureFoundryConfig,
  getLMStudioConfig,
  setLMStudioConfig,
  getOpenAiBaseUrl,
  setOpenAiBaseUrl,
  getAppSettings,
  clearAppSettings,
} from '../storage/repositories/appSettings.js';

// Provider Settings repository functions
import {
  getProviderSettings,
  setActiveProvider,
  getActiveProviderId,
  getConnectedProvider,
  setConnectedProvider,
  removeConnectedProvider,
  updateProviderModel,
  setProviderDebugMode,
  getProviderDebugMode,
  clearProviderSettings,
  getActiveProviderModel,
  hasReadyProvider,
  getConnectedProviderIds,
} from '../storage/repositories/providerSettings.js';

// Secure Storage
import { SecureStorage } from '../internal/classes/SecureStorage.js';

// Types
import type { StorageAPI, StorageOptions } from '../types/storage.js';

/**
 * Creates a Storage instance that implements the StorageAPI interface.
 * This factory composes all repository functions and secure storage into
 * a single unified interface for all storage operations.
 *
 * @param options - Configuration options for the storage system
 * @returns A StorageAPI instance
 */
export function createStorage(options: StorageOptions = {}): StorageAPI {
  const {
    databasePath,
    runMigrations = true,
    userDataPath,
  } = options;

  // Create secure storage instance
  // Use userDataPath if provided, otherwise use a default location
  const storagePath = userDataPath || process.cwd();
  const secureStorage = new SecureStorage({
    storagePath,
    appId: 'agent-core',
  });

  // Track initialization state
  let initialized = false;

  return {
    // ==========================================================================
    // Task History Operations
    // ==========================================================================

    getTasks() {
      return getTasks();
    },

    getTask(taskId: string) {
      return getTask(taskId);
    },

    saveTask(task) {
      return saveTask(task);
    },

    updateTaskStatus(taskId, status, completedAt) {
      return updateTaskStatus(taskId, status, completedAt);
    },

    addTaskMessage(taskId, message) {
      return addTaskMessage(taskId, message);
    },

    updateTaskSessionId(taskId, sessionId) {
      return updateTaskSessionId(taskId, sessionId);
    },

    updateTaskSummary(taskId, summary) {
      return updateTaskSummary(taskId, summary);
    },

    deleteTask(taskId) {
      return deleteTask(taskId);
    },

    clearHistory() {
      return clearHistory();
    },

    getTodosForTask(taskId) {
      return getTodosForTask(taskId);
    },

    saveTodosForTask(taskId, todos) {
      return saveTodosForTask(taskId, todos);
    },

    clearTodosForTask(taskId) {
      return clearTodosForTask(taskId);
    },

    // ==========================================================================
    // App Settings Operations
    // ==========================================================================

    getDebugMode() {
      return getDebugMode();
    },

    setDebugMode(enabled) {
      return setDebugMode(enabled);
    },

    getOnboardingComplete() {
      return getOnboardingComplete();
    },

    setOnboardingComplete(complete) {
      return setOnboardingComplete(complete);
    },

    getSelectedModel() {
      return getSelectedModel();
    },

    setSelectedModel(model) {
      return setSelectedModel(model);
    },

    getOllamaConfig() {
      return getOllamaConfig();
    },

    setOllamaConfig(config) {
      return setOllamaConfig(config);
    },

    getLiteLLMConfig() {
      return getLiteLLMConfig();
    },

    setLiteLLMConfig(config) {
      return setLiteLLMConfig(config);
    },

    getAzureFoundryConfig() {
      return getAzureFoundryConfig();
    },

    setAzureFoundryConfig(config) {
      return setAzureFoundryConfig(config);
    },

    getLMStudioConfig() {
      return getLMStudioConfig();
    },

    setLMStudioConfig(config) {
      return setLMStudioConfig(config);
    },

    getOpenAiBaseUrl() {
      return getOpenAiBaseUrl();
    },

    setOpenAiBaseUrl(baseUrl) {
      return setOpenAiBaseUrl(baseUrl);
    },

    getAppSettings() {
      return getAppSettings();
    },

    clearAppSettings() {
      return clearAppSettings();
    },

    // ==========================================================================
    // Provider Settings Operations
    // ==========================================================================

    getProviderSettings() {
      return getProviderSettings();
    },

    setActiveProvider(providerId) {
      return setActiveProvider(providerId);
    },

    getActiveProviderId() {
      return getActiveProviderId();
    },

    getConnectedProvider(providerId) {
      return getConnectedProvider(providerId);
    },

    setConnectedProvider(providerId, provider) {
      return setConnectedProvider(providerId, provider);
    },

    removeConnectedProvider(providerId) {
      return removeConnectedProvider(providerId);
    },

    updateProviderModel(providerId, modelId) {
      return updateProviderModel(providerId, modelId);
    },

    setProviderDebugMode(enabled) {
      return setProviderDebugMode(enabled);
    },

    getProviderDebugMode() {
      return getProviderDebugMode();
    },

    clearProviderSettings() {
      return clearProviderSettings();
    },

    getActiveProviderModel() {
      return getActiveProviderModel();
    },

    hasReadyProvider() {
      return hasReadyProvider();
    },

    getConnectedProviderIds() {
      return getConnectedProviderIds();
    },

    // ==========================================================================
    // Secure Storage Operations
    // ==========================================================================

    storeApiKey(provider, apiKey) {
      return secureStorage.storeApiKey(provider, apiKey);
    },

    getApiKey(provider) {
      return secureStorage.getApiKey(provider);
    },

    deleteApiKey(provider) {
      return secureStorage.deleteApiKey(provider);
    },

    getAllApiKeys() {
      return secureStorage.getAllApiKeys();
    },

    storeBedrockCredentials(credentials) {
      return secureStorage.storeBedrockCredentials(credentials);
    },

    getBedrockCredentials() {
      return secureStorage.getBedrockCredentials();
    },

    hasAnyApiKey() {
      return secureStorage.hasAnyApiKey();
    },

    clearSecureStorage() {
      return secureStorage.clearSecureStorage();
    },

    // ==========================================================================
    // Lifecycle Operations
    // ==========================================================================

    initialize() {
      if (initialized && isDatabaseInitialized()) {
        return;
      }

      const dbPath = databasePath || `${storagePath}/agent-core.db`;
      initializeDatabase({
        databasePath: dbPath,
        runMigrations,
      });

      initialized = true;
    },

    close() {
      closeDatabase();
      initialized = false;
    },

    isDatabaseInitialized() {
      return isDatabaseInitialized();
    },

    getDatabasePath() {
      return getDatabasePath();
    },
  };
}

// Re-export types for convenience
export type { StorageAPI, StorageOptions };
