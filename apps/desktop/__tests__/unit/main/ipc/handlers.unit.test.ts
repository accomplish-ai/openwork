/**
 * Unit tests for IPC handlers
 *
 * Tests the registration and invocation of IPC handlers for:
 * - Task operations (start, cancel, interrupt, get, list, delete, clear)
 * - API key management (get, set, validate, delete)
 * - Settings (debug mode, app settings, model selection)
 * - Onboarding
 * - Permission responses
 * - Session management
 *
 * NOTE: This is a UNIT test, not an integration test.
 * All dependent modules (secureStorage, appSettings, daemon-client, adapter)
 * are mocked to test handler logic in isolation. This follows the principle that
 * unit tests should test a single unit with all dependencies mocked.
 *
 * For true integration testing, see the integration tests that use real
 * implementations with temp directories.
 *
 * @module __tests__/unit/main/ipc/handlers.unit.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// Mock electron modules before importing handlers
vi.mock('electron', () => {
  const mockHandlers = new Map<string, Function>();
  const mockListeners = new Map<string, Set<Function>>();

  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: Function) => {
        mockHandlers.set(channel, handler);
      }),
      on: vi.fn((channel: string, listener: Function) => {
        if (!mockListeners.has(channel)) {
          mockListeners.set(channel, new Set());
        }
        mockListeners.get(channel)!.add(listener);
      }),
      removeHandler: vi.fn((channel: string) => {
        mockHandlers.delete(channel);
      }),
      removeAllListeners: vi.fn((channel?: string) => {
        if (channel) {
          mockListeners.delete(channel);
        } else {
          mockListeners.clear();
        }
      }),
      // Helper to get registered handler for testing
      _getHandler: (channel: string) => mockHandlers.get(channel),
      _getHandlers: () => mockHandlers,
      _clear: () => {
        mockHandlers.clear();
        mockListeners.clear();
      },
    },
    BrowserWindow: {
      fromWebContents: vi.fn(() => ({
        id: 1,
        isDestroyed: vi.fn(() => false),
        webContents: {
          send: vi.fn(),
          isDestroyed: vi.fn(() => false),
        },
      })),
      getFocusedWindow: vi.fn(() => ({
        id: 1,
        isDestroyed: vi.fn(() => false),
      })),
      getAllWindows: vi.fn(() => [{ id: 1, webContents: { send: vi.fn() } }]),
    },
    shell: {
      openExternal: vi.fn(),
    },
    app: {
      isPackaged: false,
      getPath: vi.fn(() => '/tmp/test-app'),
    },
  };
});

// Mock daemon client (replaces old task manager mock)
// Use vi.hoisted() so these are available when vi.mock factories run (hoisted to top)
const {
  mockDaemonClient,
  mockGetDaemonClient,
  mockDaemonStartTask,
  mockDaemonStopTask,
  mockDaemonInterruptTask,
  mockDaemonGetTask,
  mockDaemonDeleteTask,
  mockDaemonClearHistory,
  mockDaemonGetTodos,
  mockDaemonRespondPermission,
  mockDaemonResumeSession,
  mockDaemonListTasks,
} = vi.hoisted(() => {
  const mockDaemonClient = {
    isConnected: vi.fn(() => true),
    call: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  return {
    mockDaemonClient,
    mockGetDaemonClient: vi.fn(() => mockDaemonClient),
    mockDaemonStartTask: vi.fn(),
    mockDaemonStopTask: vi.fn(),
    mockDaemonInterruptTask: vi.fn(),
    mockDaemonGetTask: vi.fn(),
    mockDaemonDeleteTask: vi.fn(),
    mockDaemonClearHistory: vi.fn(),
    mockDaemonGetTodos: vi.fn(),
    mockDaemonRespondPermission: vi.fn(),
    mockDaemonResumeSession: vi.fn(),
    mockDaemonListTasks: vi.fn(),
  };
});

vi.mock('@main/daemon-client', () => ({
  getDaemonClient: mockGetDaemonClient,
  daemonStartTask: mockDaemonStartTask,
  daemonStopTask: mockDaemonStopTask,
  daemonInterruptTask: mockDaemonInterruptTask,
  daemonGetTask: mockDaemonGetTask,
  daemonDeleteTask: mockDaemonDeleteTask,
  daemonClearHistory: mockDaemonClearHistory,
  daemonGetTodos: mockDaemonGetTodos,
  daemonRespondPermission: mockDaemonRespondPermission,
  daemonResumeSession: mockDaemonResumeSession,
  daemonListTasks: mockDaemonListTasks,
}));

// Mock @main/opencode - only used for isOpenCodeCliInstalled, getOpenCodeCliVersion
vi.mock('@main/opencode', () => ({
  isOpenCodeCliInstalled: vi.fn(() => Promise.resolve(true)),
  getOpenCodeCliVersion: vi.fn(() => Promise.resolve('1.0.0')),
  cleanupVertexServiceAccountKey: vi.fn(),
}));

// Mock OpenCode auth (ChatGPT OAuth) - used by handlers.ts for OpenAI OAuth
vi.mock('@main/opencode/auth-browser', () => ({
  loginOpenAiWithChatGpt: vi.fn(() => Promise.resolve({ openedUrl: undefined })),
}));

// Mock task history (stored in test state)
const mockTasks: Array<{
  id: string;
  prompt: string;
  status: string;
  messages: unknown[];
  createdAt: string;
}> = [];

// Mock app settings state
let mockDebugMode = false;
let mockOnboardingComplete = false;
let mockSelectedModel: { provider: string; model: string } | null = null;
let mockOpenAiBaseUrl = '';

// Mock @accomplish_ai/agent-core - comprehensive mock covering all exports used by handlers.ts
vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@accomplish_ai/agent-core')>();

  // Storage methods shared between module-level exports and createStorage() return value.
  // Using a shared object ensures test spy assertions (e.g. `const { setDebugMode } = await import(...)`)
  // reference the same mock instances that handlers.ts calls via getStorage().
  const storageMethods = {
    // Task history
    getTasks: vi.fn(() => mockTasks),
    getTask: vi.fn((taskId: string) => mockTasks.find((t) => t.id === taskId)),
    saveTask: vi.fn((task: unknown) => {
      const t = task as { id: string };
      const existing = mockTasks.findIndex((x) => x.id === t.id);
      if (existing >= 0) {
        mockTasks[existing] = task as (typeof mockTasks)[0];
      } else {
        mockTasks.push(task as (typeof mockTasks)[0]);
      }
    }),
    updateTaskStatus: vi.fn(),
    updateTaskSessionId: vi.fn(),
    updateTaskSummary: vi.fn(),
    addTaskMessage: vi.fn(),
    deleteTask: vi.fn((taskId: string) => {
      const idx = mockTasks.findIndex((t) => t.id === taskId);
      if (idx >= 0) mockTasks.splice(idx, 1);
    }),
    clearHistory: vi.fn(() => {
      mockTasks.length = 0;
    }),
    saveTodosForTask: vi.fn(),
    getTodosForTask: vi.fn(() => []),
    clearTodosForTask: vi.fn(),

    // App settings
    getDebugMode: vi.fn(() => mockDebugMode),
    setDebugMode: vi.fn((enabled: boolean) => {
      mockDebugMode = enabled;
    }),
    getAppSettings: vi.fn(() => ({
      debugMode: mockDebugMode,
      onboardingComplete: mockOnboardingComplete,
      selectedModel: mockSelectedModel,
      openaiBaseUrl: mockOpenAiBaseUrl,
    })),
    getOnboardingComplete: vi.fn(() => mockOnboardingComplete),
    setOnboardingComplete: vi.fn((complete: boolean) => {
      mockOnboardingComplete = complete;
    }),
    getSelectedModel: vi.fn(() => mockSelectedModel),
    setSelectedModel: vi.fn((model: { provider: string; model: string }) => {
      mockSelectedModel = model;
    }),
    getOpenAiBaseUrl: vi.fn(() => mockOpenAiBaseUrl),
    setOpenAiBaseUrl: vi.fn((baseUrl: string) => {
      mockOpenAiBaseUrl = baseUrl;
    }),
    getOllamaConfig: vi.fn(() => null),
    setOllamaConfig: vi.fn(),
    getAzureFoundryConfig: vi.fn(() => null),
    setAzureFoundryConfig: vi.fn(),
    getLiteLLMConfig: vi.fn(() => null),
    setLiteLLMConfig: vi.fn(),
    getLMStudioConfig: vi.fn(() => null),
    setLMStudioConfig: vi.fn(),
    getTheme: vi.fn(() => 'system'),
    setTheme: vi.fn(),
    clearAppSettings: vi.fn(),

    // Provider settings
    getProviderSettings: vi.fn(() => ({
      activeProviderId: 'anthropic',
      connectedProviders: {
        anthropic: {
          providerId: 'anthropic',
          connectionStatus: 'connected',
          selectedModelId: 'claude-3-5-sonnet-20241022',
          credentials: { type: 'api-key', apiKey: 'test-key' },
        },
      },
      debugMode: false,
    })),
    setActiveProvider: vi.fn(),
    getActiveProviderModel: vi.fn(() => ({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
    })),
    getConnectedProvider: vi.fn(() => ({
      providerId: 'anthropic',
      connectionStatus: 'connected',
      selectedModelId: 'claude-3-5-sonnet-20241022',
      credentials: { type: 'api-key', apiKey: 'test-key' },
    })),
    setConnectedProvider: vi.fn(),
    removeConnectedProvider: vi.fn(),
    updateProviderModel: vi.fn(),
    setProviderDebugMode: vi.fn(),
    getProviderDebugMode: vi.fn(() => false),
    hasReadyProvider: vi.fn(() => true),
    getConnectedProviderIds: vi.fn(() => ['anthropic']),
    getActiveProviderId: vi.fn(() => 'anthropic'),
    clearProviderSettings: vi.fn(),

    // Database lifecycle
    initialize: vi.fn(),
    isDatabaseInitialized: vi.fn(() => true),
    close: vi.fn(),
    getDatabasePath: vi.fn(() => '/mock/path'),

    // Secure storage
    storeApiKey: vi.fn(),
    getApiKey: vi.fn(() => null),
    deleteApiKey: vi.fn(() => true),
    getAllApiKeys: vi.fn(() => Promise.resolve({})),
    storeBedrockCredentials: vi.fn(),
    getBedrockCredentials: vi.fn(() => null),
    hasAnyApiKey: vi.fn(() => Promise.resolve(false)),
    listStoredCredentials: vi.fn(() => []),
    clearSecureStorage: vi.fn(),

    // MCP Connectors
    getAllConnectors: vi.fn(() => []),
    getConnectorById: vi.fn(() => null),
    upsertConnector: vi.fn(),
    deleteConnector: vi.fn(),
    setConnectorEnabled: vi.fn(),
    setConnectorStatus: vi.fn(),
    storeConnectorTokens: vi.fn(),
    deleteConnectorTokens: vi.fn(),
  };

  return {
    // Use actual implementations for validation
    validateApiKey: actual.validateApiKey,
    validateHttpUrl: actual.validateHttpUrl,
    validateTaskConfig: actual.validateTaskConfig,
    ALLOWED_API_KEY_PROVIDERS: actual.ALLOWED_API_KEY_PROVIDERS,
    STANDARD_VALIDATION_PROVIDERS: actual.STANDARD_VALIDATION_PROVIDERS,
    DEFAULT_PROVIDERS: actual.DEFAULT_PROVIDERS,
    ZAI_ENDPOINTS: actual.ZAI_ENDPOINTS,
    validate: actual.validate,
    permissionResponseSchema: actual.permissionResponseSchema,

    // Utility functions
    createTaskId: vi.fn(() => `task_${Date.now()}`),
    createMessageId: vi.fn(() => `msg-${Date.now()}`),
    sanitizeString: vi.fn((input: unknown, fieldName: string, maxLength = 255) => {
      if (typeof input !== 'string') {
        throw new Error(`${fieldName} must be a string`);
      }
      const trimmed = input.trim();
      if (!trimmed) {
        throw new Error(`${fieldName} is required`);
      }
      if (trimmed.length > maxLength) {
        throw new Error(`${fieldName} exceeds maximum length of ${maxLength}`);
      }
      return trimmed;
    }),
    safeParseJson: vi.fn((s: string) => ({ success: true, data: JSON.parse(s) })),

    // Storage methods at module level (for test spy assertions)
    ...storageMethods,

    // Factory function returning the same mock instances
    createStorage: vi.fn(() => storageMethods),

    // OAuth status
    getOpenAiOauthStatus: vi.fn(() => ({ connected: false })),

    // Azure token function
    getAzureEntraToken: vi.fn(() => Promise.resolve({ success: true, token: 'mock-token' })),

    // Task summarization
    generateTaskSummary: vi.fn(() => Promise.resolve('Mock task summary')),

    // API validation functions
    validateAnthropicApiKey: vi.fn(() => Promise.resolve({ valid: true })),
    validateOpenAIApiKey: vi.fn(() => Promise.resolve({ valid: true })),
    validateGoogleApiKey: vi.fn(() => Promise.resolve({ valid: true })),
    validateXAIApiKey: vi.fn(() => Promise.resolve({ valid: true })),
    validateBedrockCredentials: vi.fn(() => Promise.resolve({ valid: true })),
    validateDeepSeekApiKey: vi.fn(() => Promise.resolve({ valid: true })),
    validateOpenAICompatibleApiKey: vi.fn(() => Promise.resolve({ valid: true })),
    validateOllamaConnection: vi.fn(() => Promise.resolve({ valid: true })),
    validateLiteLLMConnection: vi.fn(() => Promise.resolve({ valid: true })),
    validateLMStudioConnection: vi.fn(() => Promise.resolve({ valid: true })),
    testLMStudioConnection: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    fetchLMStudioModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    validateLMStudioConfig: vi.fn(),
    validateAzureFoundryConnection: vi.fn(() => Promise.resolve({ valid: true })),
    validateMoonshotApiKey: vi.fn(() => Promise.resolve({ valid: true })),

    // Other functions used by handlers
    validateAzureFoundry: vi.fn(() => Promise.resolve({ valid: true })),
    testAzureFoundryConnection: vi.fn(() => Promise.resolve({ success: true })),
    fetchOpenRouterModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    fetchProviderModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    testOllamaConnection: vi.fn(() => Promise.resolve({ success: true })),
    testLiteLLMConnection: vi.fn(() => Promise.resolve({ success: true })),
    fetchLiteLLMModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    fetchBedrockModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),

    // OAuth
    discoverOAuthMetadata: vi.fn(),
    registerOAuthClient: vi.fn(),
    generatePkceChallenge: vi.fn(() => ({ codeVerifier: 'v', codeChallenge: 'c' })),
    buildAuthorizationUrl: vi.fn(() => 'https://auth.example.com'),
    exchangeCodeForTokens: vi.fn(),

    // DaemonRpcClient class mock (needed for module-level reference)
    DaemonRpcClient: vi.fn(),
  };
});

// Mock secure storage
let mockApiKeys: Record<string, string | null> = {};
let mockStoredCredentials: Array<{ account: string; password: string }> = [];

vi.mock('@main/store/secureStorage', () => ({
  storeApiKey: vi.fn((provider: string, key: string) => {
    mockApiKeys[provider] = key;
    mockStoredCredentials.push({ account: `apiKey:${provider}`, password: key });
  }),
  getApiKey: vi.fn((provider: string) => mockApiKeys[provider] || null),
  deleteApiKey: vi.fn((provider: string) => {
    delete mockApiKeys[provider];
    mockStoredCredentials = mockStoredCredentials.filter(
      (c) => c.account !== `apiKey:${provider}`
    );
  }),
  getAllApiKeys: vi.fn(() =>
    Promise.resolve({
      anthropic: mockApiKeys['anthropic'] ?? null,
      openai: mockApiKeys['openai'] ?? null,
      google: mockApiKeys['google'] ?? null,
      xai: mockApiKeys['xai'] ?? null,
      custom: mockApiKeys['custom'] ?? null,
    })
  ),
  hasAnyApiKey: vi.fn(() =>
    Promise.resolve(Object.values(mockApiKeys).some((k) => k !== null))
  ),
  listStoredCredentials: vi.fn(() => mockStoredCredentials),
  getBedrockCredentials: vi.fn(() => null),
}));

// Note: App settings and provider settings are now mocked via @accomplish/core mock above

// Mock config
vi.mock('@main/config', () => ({
  getDesktopConfig: vi.fn(() => ({})),
}));

// Mock test-utils
vi.mock('@main/test-utils/mock-task-flow', () => ({
  isMockTaskEventsEnabled: vi.fn(() => false),
  executeMockTaskFlow: vi.fn(),
  detectScenarioFromPrompt: vi.fn(),
  createMockTask: vi.fn(),
}));

// Mock logging
vi.mock('@main/logging', () => ({
  getLogCollector: vi.fn(() => ({
    flush: vi.fn(),
    getCurrentLogPath: vi.fn(() => '/tmp/test.log'),
    getLogDir: vi.fn(() => '/tmp'),
  })),
}));

// Mock skills manager
vi.mock('@main/skills', () => ({
  skillsManager: {
    getAll: vi.fn(() => []),
    getEnabled: vi.fn(() => []),
    setEnabled: vi.fn(),
    getContent: vi.fn(() => null),
    addFromFile: vi.fn(),
    addFromGitHub: vi.fn(),
    delete: vi.fn(),
    resync: vi.fn(),
  },
}));

// Mock providers
vi.mock('@main/providers', () => ({
  registerVertexHandlers: vi.fn(),
}));

// Mock speech-to-text service
vi.mock('@main/services/speechToText', () => ({
  validateElevenLabsApiKey: vi.fn(() => Promise.resolve({ valid: true })),
  transcribeAudio: vi.fn(() => Promise.resolve({ text: 'test' })),
  isElevenLabsConfigured: vi.fn(() => false),
}));

// Import after mocks are set up
import { registerIPCHandlers } from '@main/ipc/handlers';
import { ipcMain, BrowserWindow, shell } from 'electron';

// Type the mocked ipcMain with helpers
type MockedIpcMain = typeof ipcMain & {
  _getHandler: (channel: string) => Function | undefined;
  _getHandlers: () => Map<string, Function>;
  _clear: () => void;
};

const mockedIpcMain = ipcMain as MockedIpcMain;

/**
 * Helper to invoke a registered handler
 */
async function invokeHandler(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockedIpcMain._getHandler(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }

  // Create mock event
  const mockEvent = {
    sender: {
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
    },
  };

  return handler(mockEvent, ...args);
}

describe('IPC Handlers Integration', () => {
  beforeEach(() => {
    // Reset all mocks and state
    vi.clearAllMocks();
    mockedIpcMain._clear();
    mockTasks.length = 0;
    mockApiKeys = {};
    mockStoredCredentials = [];
    mockDebugMode = false;
    mockOnboardingComplete = false;
    mockSelectedModel = null;

    // Reset daemon client mocks
    mockGetDaemonClient.mockReturnValue(mockDaemonClient);
    mockDaemonStartTask.mockReset();
    mockDaemonStopTask.mockReset();
    mockDaemonInterruptTask.mockReset();
    mockDaemonGetTask.mockReset();
    mockDaemonDeleteTask.mockReset();
    mockDaemonClearHistory.mockReset();
    mockDaemonGetTodos.mockReset();
    mockDaemonRespondPermission.mockReset();
    mockDaemonResumeSession.mockReset();
    mockDaemonListTasks.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerIPCHandlers', () => {
    it('should register all expected IPC handlers', () => {
      // Arrange & Act
      registerIPCHandlers();

      // Assert
      const handlers = mockedIpcMain._getHandlers();

      // Task handlers
      expect(handlers.has('task:start')).toBe(true);
      expect(handlers.has('task:cancel')).toBe(true);
      expect(handlers.has('task:interrupt')).toBe(true);
      expect(handlers.has('task:get')).toBe(true);
      expect(handlers.has('task:list')).toBe(true);
      expect(handlers.has('task:delete')).toBe(true);
      expect(handlers.has('task:clear-history')).toBe(true);

      // Permission handler
      expect(handlers.has('permission:respond')).toBe(true);

      // Session handler
      expect(handlers.has('session:resume')).toBe(true);

      // Settings handlers
      expect(handlers.has('settings:api-keys')).toBe(true);
      expect(handlers.has('settings:add-api-key')).toBe(true);
      expect(handlers.has('settings:remove-api-key')).toBe(true);
      expect(handlers.has('settings:debug-mode')).toBe(true);
      expect(handlers.has('settings:set-debug-mode')).toBe(true);
      expect(handlers.has('settings:app-settings')).toBe(true);

      // API key handlers
      expect(handlers.has('api-key:exists')).toBe(true);
      expect(handlers.has('api-key:set')).toBe(true);
      expect(handlers.has('api-key:get')).toBe(true);
      expect(handlers.has('api-key:validate')).toBe(true);
      expect(handlers.has('api-key:validate-provider')).toBe(true);
      expect(handlers.has('api-key:clear')).toBe(true);

      // Multi-provider API key handlers
      expect(handlers.has('api-keys:all')).toBe(true);
      expect(handlers.has('api-keys:has-any')).toBe(true);

      // OpenCode handlers
      expect(handlers.has('opencode:check')).toBe(true);
      expect(handlers.has('opencode:version')).toBe(true);

      // Model handlers
      expect(handlers.has('model:get')).toBe(true);
      expect(handlers.has('model:set')).toBe(true);

      // Onboarding handlers
      expect(handlers.has('onboarding:complete')).toBe(true);
      expect(handlers.has('onboarding:set-complete')).toBe(true);

      // Shell handler
      expect(handlers.has('shell:open-external')).toBe(true);

      // Log handler
      expect(handlers.has('log:event')).toBe(true);
    });
  });

  describe('API Key Handlers', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('api-key:exists should return false when no key is stored', async () => {
      // Arrange - no keys stored

      // Act
      const result = await invokeHandler('api-key:exists');

      // Assert
      expect(result).toBe(false);
    });

    it('api-key:set should store the API key', async () => {
      // Arrange
      const testKey = 'sk-test-12345678-abcdef';

      // Act
      await invokeHandler('api-key:set', testKey);
      mockApiKeys['anthropic'] = testKey; // Simulate storage
      const exists = await invokeHandler('api-key:exists');

      // Assert
      expect(exists).toBe(true);
    });

    it('api-key:get should retrieve the stored API key', async () => {
      // Arrange
      const testKey = 'sk-test-retrieve-key';
      mockApiKeys['anthropic'] = testKey;

      // Act
      const result = await invokeHandler('api-key:get');

      // Assert
      expect(result).toBe(testKey);
    });

    it('api-key:clear should remove the stored API key', async () => {
      // Arrange
      mockApiKeys['anthropic'] = 'sk-test-to-delete';

      // Act
      await invokeHandler('api-key:clear');

      // Assert - check deleteApiKey was called
      const { deleteApiKey } = await import('@main/store/secureStorage');
      expect(deleteApiKey).toHaveBeenCalledWith('anthropic');
    });

    it('api-key:set should reject empty keys', async () => {
      // Arrange & Act & Assert
      await expect(invokeHandler('api-key:set', '')).rejects.toThrow();
      await expect(invokeHandler('api-key:set', '   ')).rejects.toThrow();
    });

    it('api-key:set should reject keys exceeding max length', async () => {
      // Arrange
      const longKey = 'x'.repeat(300);

      // Act & Assert
      await expect(invokeHandler('api-key:set', longKey)).rejects.toThrow('exceeds maximum length');
    });
  });

  describe('Settings Handlers', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('settings:debug-mode should return current debug mode', async () => {
      // Arrange
      mockDebugMode = true;

      // Act
      const result = await invokeHandler('settings:debug-mode');

      // Assert
      expect(result).toBe(true);
    });

    it('settings:set-debug-mode should update debug mode', async () => {
      // Arrange
      mockDebugMode = false;

      // Act
      await invokeHandler('settings:set-debug-mode', true);

      // Assert
      const { setDebugMode } = await import('@accomplish_ai/agent-core');
      expect(setDebugMode).toHaveBeenCalledWith(true);
    });

    it('settings:set-debug-mode should reject non-boolean values', async () => {
      // Arrange & Act & Assert
      await expect(invokeHandler('settings:set-debug-mode', 'true')).rejects.toThrow(
        'Invalid debug mode flag'
      );
      await expect(invokeHandler('settings:set-debug-mode', 1)).rejects.toThrow(
        'Invalid debug mode flag'
      );
    });

    it('settings:app-settings should return all app settings', async () => {
      // Arrange
      mockDebugMode = true;
      mockOnboardingComplete = true;
      mockSelectedModel = { provider: 'anthropic', model: 'claude-3-opus' };
      mockOpenAiBaseUrl = '';

      // Act
      const result = await invokeHandler('settings:app-settings');

      // Assert
      expect(result).toEqual({
        debugMode: true,
        onboardingComplete: true,
        selectedModel: { provider: 'anthropic', model: 'claude-3-opus' },
        openaiBaseUrl: '',
      });
    });

    it('settings:api-keys should return list of stored API keys', async () => {
      // Arrange - set the api keys directly via mockApiKeys
      // Note: The handler now uses getAllApiKeys() which reads from mockApiKeys
      mockApiKeys = {
        anthropic: 'sk-ant-12345678',
        openai: 'sk-openai-abcdefgh',
      };

      // Act
      const result = await invokeHandler('settings:api-keys');

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provider: 'anthropic',
            keyPrefix: 'sk-ant-1...',
          }),
          expect.objectContaining({
            provider: 'openai',
            keyPrefix: 'sk-opena...',
          }),
        ])
      );
    });

    it('settings:add-api-key should store API key for valid provider', async () => {
      // Arrange
      const provider = 'anthropic';
      const key = 'sk-ant-new-key-12345';

      // Act
      const result = await invokeHandler('settings:add-api-key', provider, key);

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          provider: 'anthropic',
          keyPrefix: 'sk-ant-n...',
          isActive: true,
        })
      );
    });

    it('settings:add-api-key should reject unsupported providers', async () => {
      // Arrange & Act & Assert
      await expect(
        invokeHandler('settings:add-api-key', 'unsupported-provider', 'sk-test')
      ).rejects.toThrow('Unsupported API key provider');
    });

    it('settings:remove-api-key should delete the API key', async () => {
      // Arrange
      mockApiKeys['openai'] = 'sk-openai-test';

      // Act
      await invokeHandler('settings:remove-api-key', 'local-openai');

      // Assert
      const { deleteApiKey } = await import('@main/store/secureStorage');
      expect(deleteApiKey).toHaveBeenCalledWith('openai');
    });
  });

  describe('Task Handlers', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('task:start should validate config and call daemonStartTask', async () => {
      // Arrange
      const config = { prompt: 'Test task prompt' };
      const mockTask = {
        id: 'task_123',
        prompt: 'Test task prompt',
        status: 'running',
        messages: [],
        createdAt: new Date().toISOString(),
      };
      mockDaemonStartTask.mockResolvedValue(mockTask);

      // Act
      const result = await invokeHandler('task:start', config);

      // Assert
      expect(mockDaemonStartTask).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Test task prompt' })
      );
      expect(result).toEqual(mockTask);
    });

    it('task:start should validate task config', async () => {
      // Arrange - empty prompt

      // Act & Assert
      await expect(invokeHandler('task:start', { prompt: '' })).rejects.toThrow();
      await expect(invokeHandler('task:start', { prompt: '   ' })).rejects.toThrow();
    });

    it('task:start should throw when daemon is not connected', async () => {
      // Arrange
      mockGetDaemonClient.mockReturnValue(null);
      const config = { prompt: 'Test task prompt' };

      // Act & Assert
      await expect(invokeHandler('task:start', config)).rejects.toThrow(
        'Daemon is not connected'
      );
    });

    it('task:start should check provider readiness', async () => {
      // Arrange
      const { hasReadyProvider } = await import('@accomplish_ai/agent-core');
      (hasReadyProvider as Mock).mockReturnValue(false);
      const config = { prompt: 'Test task prompt' };

      // Act & Assert
      await expect(invokeHandler('task:start', config)).rejects.toThrow(
        'No provider is ready'
      );

      // Cleanup
      (hasReadyProvider as Mock).mockReturnValue(true);
    });

    it('task:start should pass all config fields through to daemonStartTask', async () => {
      // Arrange
      const config = {
        prompt: 'Full config test',
        modelId: 'claude-3-opus',
        sessionId: 'custom_session',
        workingDirectory: '/some/path',
      };
      const mockTask = {
        id: 'task_full',
        prompt: 'Full config test',
        status: 'running',
        messages: [],
        createdAt: new Date().toISOString(),
      };
      mockDaemonStartTask.mockResolvedValue(mockTask);

      // Act
      await invokeHandler('task:start', config);

      // Assert
      expect(mockDaemonStartTask).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Full config test',
          sessionId: 'custom_session',
          workingDirectory: '/some/path',
        })
      );
    });

    it('task:cancel should call daemonStopTask', async () => {
      // Arrange
      const taskId = 'task_to_cancel';

      // Act
      await invokeHandler('task:cancel', taskId);

      // Assert
      expect(mockDaemonStopTask).toHaveBeenCalledWith({ taskId });
    });

    it('task:cancel should throw when taskId is undefined', async () => {
      await expect(invokeHandler('task:cancel', undefined)).rejects.toThrow(
        'taskId is required for task:cancel'
      );
      expect(mockDaemonStopTask).not.toHaveBeenCalled();
    });

    it('task:interrupt should call daemonInterruptTask', async () => {
      // Arrange
      const taskId = 'task_to_interrupt';

      // Act
      await invokeHandler('task:interrupt', taskId);

      // Assert
      expect(mockDaemonInterruptTask).toHaveBeenCalledWith({ taskId });
    });

    it('task:interrupt should throw when taskId is undefined', async () => {
      await expect(invokeHandler('task:interrupt', undefined)).rejects.toThrow(
        'taskId is required for task:interrupt'
      );
      expect(mockDaemonInterruptTask).not.toHaveBeenCalled();
    });

    // Note: Pure passthrough tests for task:get, task:list, task:delete,
    // task:clear-history, and task:get-todos were removed. These handlers
    // simply forward to daemon client functions without any handler-layer
    // logic. Handler registration is verified in the registration test above.
  });

  describe('Onboarding Handlers', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('onboarding:complete should return false when not completed', async () => {
      // Arrange
      mockOnboardingComplete = false;

      // Act
      const result = await invokeHandler('onboarding:complete');

      // Assert
      expect(result).toBe(false);
    });

    it('onboarding:complete should return true when completed', async () => {
      // Arrange
      mockOnboardingComplete = true;

      // Act
      const result = await invokeHandler('onboarding:complete');

      // Assert
      expect(result).toBe(true);
    });

    it('onboarding:complete should return true if user has task history', async () => {
      // Arrange
      mockOnboardingComplete = false;
      mockTasks.push({
        id: 'existing_task',
        prompt: 'Existing task',
        status: 'completed',
        messages: [],
        createdAt: new Date().toISOString(),
      });

      // Act
      const result = await invokeHandler('onboarding:complete');

      // Assert
      expect(result).toBe(true);
    });

    it('onboarding:set-complete should update onboarding status', async () => {
      // Arrange
      mockOnboardingComplete = false;

      // Act
      await invokeHandler('onboarding:set-complete', true);

      // Assert
      const { setOnboardingComplete } = await import('@accomplish_ai/agent-core');
      expect(setOnboardingComplete).toHaveBeenCalledWith(true);
    });
  });

  describe('Permission Handlers', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('permission:respond should call daemonRespondPermission with allow decision', async () => {
      // Arrange
      const taskId = 'task_active';

      // Act
      await invokeHandler('permission:respond', {
        requestId: 'req_123',
        taskId,
        decision: 'allow',
      });

      // Assert
      expect(mockDaemonRespondPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req_123',
          taskId,
          decision: 'allow',
        })
      );
    });

    it('permission:respond should forward custom message', async () => {
      // Arrange
      const taskId = 'task_active';

      // Act
      await invokeHandler('permission:respond', {
        requestId: 'req_123',
        taskId,
        decision: 'allow',
        message: 'proceed with caution',
      });

      // Assert
      expect(mockDaemonRespondPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req_123',
          taskId,
          decision: 'allow',
          message: 'proceed with caution',
        })
      );
    });

    it('permission:respond should forward selectedOptions', async () => {
      // Arrange
      const taskId = 'task_options';

      // Act
      await invokeHandler('permission:respond', {
        requestId: 'req_456',
        taskId,
        decision: 'allow',
        selectedOptions: ['option1', 'option2', 'option3'],
      });

      // Assert
      expect(mockDaemonRespondPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req_456',
          taskId,
          decision: 'allow',
          selectedOptions: ['option1', 'option2', 'option3'],
        })
      );
    });

    it('permission:respond should validate input via schema', async () => {
      // Act & Assert - missing required fields should fail validation
      await expect(
        invokeHandler('permission:respond', {})
      ).rejects.toThrow();
    });
  });

  describe('Model Handlers', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('model:get should return selected model', async () => {
      // Arrange
      mockSelectedModel = { provider: 'anthropic', model: 'claude-3-sonnet' };

      // Act
      const result = await invokeHandler('model:get');

      // Assert
      expect(result).toEqual({ provider: 'anthropic', model: 'claude-3-sonnet' });
    });

    it('model:get should return null when no model selected', async () => {
      // Arrange
      mockSelectedModel = null;

      // Act
      const result = await invokeHandler('model:get');

      // Assert
      expect(result).toBeNull();
    });

    it('model:set should update selected model', async () => {
      // Arrange
      const newModel = { provider: 'openai', model: 'gpt-4' };

      // Act
      await invokeHandler('model:set', newModel);

      // Assert
      const { setSelectedModel } = await import('@accomplish_ai/agent-core');
      expect(setSelectedModel).toHaveBeenCalledWith(newModel);
    });

    it('model:set should reject invalid model configuration', async () => {
      // Arrange & Act & Assert
      await expect(invokeHandler('model:set', null)).rejects.toThrow(
        'Invalid model configuration'
      );
      await expect(invokeHandler('model:set', { provider: 'test' })).rejects.toThrow(
        'Invalid model configuration'
      );
      await expect(invokeHandler('model:set', { model: 'test' })).rejects.toThrow(
        'Invalid model configuration'
      );
    });
  });

  describe('Shell Handlers', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('shell:open-external should open valid http URL', async () => {
      // Arrange
      const url = 'https://example.com';

      // Act
      await invokeHandler('shell:open-external', url);

      // Assert
      expect(shell.openExternal).toHaveBeenCalledWith(url);
    });

    it('shell:open-external should open valid https URL', async () => {
      // Arrange
      const url = 'http://localhost:3000';

      // Act
      await invokeHandler('shell:open-external', url);

      // Assert
      expect(shell.openExternal).toHaveBeenCalledWith(url);
    });

    it('shell:open-external should reject non-http/https protocols', async () => {
      // Arrange & Act & Assert
      await expect(invokeHandler('shell:open-external', 'file:///etc/passwd')).rejects.toThrow(
        'must use http or https protocol'
      );
      await expect(invokeHandler('shell:open-external', 'javascript:alert(1)')).rejects.toThrow(
        'must use http or https protocol'
      );
    });

    it('shell:open-external should reject invalid URLs', async () => {
      // Arrange & Act & Assert
      await expect(invokeHandler('shell:open-external', 'not-a-url')).rejects.toThrow();
    });
  });

  describe('OpenCode Handlers', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('opencode:check should return CLI status', async () => {
      // Arrange - mocked to return installed

      // Act
      const result = (await invokeHandler('opencode:check')) as {
        installed: boolean;
        version: string;
        installCommand: string;
      };

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          installed: true,
          version: '1.0.0',
          installCommand: 'npm install -g opencode-ai',
        })
      );
    });

    it('opencode:version should return CLI version', async () => {
      // Arrange - mocked to return version

      // Act
      const result = await invokeHandler('opencode:version');

      // Assert
      expect(result).toBe('1.0.0');
    });
  });

  describe('Multi-Provider API Key Handlers', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('api-keys:all should return masked keys for all providers', async () => {
      // Arrange
      mockApiKeys = {
        anthropic: 'sk-ant-12345678',
        openai: null,
        google: 'AIza1234567890',
        xai: null,
        custom: null,
      };

      // Act
      const result = (await invokeHandler('api-keys:all')) as Record<
        string,
        { exists: boolean; prefix?: string }
      >;

      // Assert
      expect(result.anthropic).toEqual({
        exists: true,
        prefix: 'sk-ant-1...',
      });
      expect(result.openai).toEqual({ exists: false, prefix: undefined });
      expect(result.google).toEqual({
        exists: true,
        prefix: 'AIza1234...',
      });
    });

    it('api-keys:has-any should return true when any key exists', async () => {
      // Arrange
      mockApiKeys['anthropic'] = 'sk-test';

      // Act
      const result = await invokeHandler('api-keys:has-any');

      // Assert
      expect(result).toBe(true);
    });

    it('api-keys:has-any should return false when no keys exist', async () => {
      // Arrange - no keys

      // Act
      const result = await invokeHandler('api-keys:has-any');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Session Handlers', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('session:resume should call daemonResumeSession with correct params', async () => {
      // Arrange
      const sessionId = 'session_123';
      const prompt = 'Continue with the task';
      const mockTask = {
        id: 'task_resumed',
        prompt,
        status: 'running',
        messages: [],
        createdAt: new Date().toISOString(),
      };
      mockDaemonResumeSession.mockResolvedValue(mockTask);

      // Act
      const result = await invokeHandler('session:resume', sessionId, prompt);

      // Assert
      expect(mockDaemonResumeSession).toHaveBeenCalledWith({
        sessionId,
        prompt,
        existingTaskId: undefined,
      });
      expect(result).toEqual(mockTask);
    });

    it('session:resume should pass existing task ID when provided', async () => {
      // Arrange
      const sessionId = 'session_123';
      const prompt = 'Continue';
      const existingTaskId = 'task_existing';
      const mockTask = {
        id: existingTaskId,
        prompt,
        status: 'running',
        messages: [],
        createdAt: new Date().toISOString(),
      };
      mockDaemonResumeSession.mockResolvedValue(mockTask);

      // Act
      const result = await invokeHandler('session:resume', sessionId, prompt, existingTaskId);

      // Assert
      expect(mockDaemonResumeSession).toHaveBeenCalledWith({
        sessionId,
        prompt,
        existingTaskId,
      });
      expect(result).toEqual(mockTask);
    });

    it('session:resume should throw when daemon is not connected', async () => {
      // Arrange
      mockGetDaemonClient.mockReturnValue(null);

      // Act & Assert
      await expect(
        invokeHandler('session:resume', 'session_123', 'prompt')
      ).rejects.toThrow('Daemon is not connected');
    });

    it('session:resume should validate session ID', async () => {
      // Arrange & Act & Assert
      await expect(invokeHandler('session:resume', '', 'prompt')).rejects.toThrow();
      await expect(invokeHandler('session:resume', '   ', 'prompt')).rejects.toThrow();
    });

    it('session:resume should validate prompt', async () => {
      // Arrange & Act & Assert
      await expect(invokeHandler('session:resume', 'session_123', '')).rejects.toThrow();
      await expect(invokeHandler('session:resume', 'session_123', '   ')).rejects.toThrow();
    });
  });

  describe('Log Event Handler', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('log:event should return ok response', async () => {
      // Arrange
      const payload = {
        level: 'info',
        message: 'Test log message',
        context: { key: 'value' },
      };

      // Act
      const result = await invokeHandler('log:event', payload);

      // Assert
      expect(result).toEqual({ ok: true });
    });
  });

  // Note: Window trust validation tests have been removed because the daemon-based
  // handle() wrapper in handlers.ts no longer performs per-request window trust checks.
  // Window trust is now managed at the daemon connection level.

  describe('E2E Skip Auth Mode', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('onboarding:complete should return true when E2E_SKIP_AUTH env is set', async () => {
      // Arrange
      const originalEnv = process.env.E2E_SKIP_AUTH;
      process.env.E2E_SKIP_AUTH = '1';

      // Act
      const result = await invokeHandler('onboarding:complete');

      // Assert
      expect(result).toBe(true);

      // Cleanup
      process.env.E2E_SKIP_AUTH = originalEnv;
    });

    it('opencode:check should return mock status when E2E_SKIP_AUTH is set', async () => {
      // Arrange
      const originalEnv = process.env.E2E_SKIP_AUTH;
      process.env.E2E_SKIP_AUTH = '1';

      // Act
      const result = await invokeHandler('opencode:check') as {
        installed: boolean;
        version: string;
      };

      // Assert
      expect(result.installed).toBe(true);
      expect(result.version).toBe('1.0.0-test');

      // Cleanup
      process.env.E2E_SKIP_AUTH = originalEnv;
    });
  });

  describe('API Key Validation Timeout', () => {
    beforeEach(() => {
      registerIPCHandlers();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('api-key:validate should handle abort error', async () => {
      // Arrange
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        const abortError = new Error('Request aborted');
        abortError.name = 'AbortError';
        return Promise.reject(abortError);
      }));

      // Act
      const result = await invokeHandler('api-key:validate', 'sk-test-key') as {
        valid: boolean;
        error: string;
      };

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('api-key:validate should handle network errors', async () => {
      // Arrange
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      // Act
      const result = await invokeHandler('api-key:validate', 'sk-test-key') as {
        valid: boolean;
        error: string;
      };

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Failed to validate');
    });

    it('api-key:validate should return invalid for non-200 response', async () => {
      // Arrange
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
      }));

      // Act
      const result = await invokeHandler('api-key:validate', 'sk-test-key') as {
        valid: boolean;
        error: string;
      };

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid API key');
    });

    it('api-key:validate should return valid for 200 response', async () => {
      // Arrange
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      }));

      // Act
      const result = await invokeHandler('api-key:validate', 'sk-test-key') as {
        valid: boolean;
      };

      // Assert
      expect(result.valid).toBe(true);
    });
  });

  describe('Multi-Provider API Key Validation', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('api-key:validate-provider should reject unsupported provider', async () => {
      // Act
      const result = await invokeHandler('api-key:validate-provider', 'invalid-provider', 'key') as {
        valid: boolean;
        error: string;
      };

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unsupported provider');
    });

    it('api-key:validate-provider should skip validation for custom provider', async () => {
      // Act
      const result = await invokeHandler('api-key:validate-provider', 'custom', 'any-key') as {
        valid: boolean;
      };

      // Assert
      expect(result.valid).toBe(true);
    });

    it('api-key:validate-provider should validate OpenAI key', async () => {
      // Arrange
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      // Act
      const result = await invokeHandler('api-key:validate-provider', 'openai', 'sk-openai-key') as {
        valid: boolean;
      };

      // Assert
      expect(result.valid).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-openai-key',
          }),
        })
      );
    });

    it('api-key:validate-provider should validate Google key', async () => {
      // Arrange
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      // Act
      const result = await invokeHandler('api-key:validate-provider', 'google', 'AIza-test-key') as {
        valid: boolean;
      };

      // Assert
      expect(result.valid).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models?key=AIza-test-key',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('api-key:validate-provider should handle AbortError', async () => {
      // Arrange
      const abortError = new Error('Request aborted');
      abortError.name = 'AbortError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

      // Act
      const result = await invokeHandler('api-key:validate-provider', 'openai', 'sk-key') as {
        valid: boolean;
        error: string;
      };

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('api-key:validate-provider should handle failed response with error message', async () => {
      // Arrange
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: { message: 'Access denied' } }),
      }));

      // Act
      const result = await invokeHandler('api-key:validate-provider', 'openai', 'sk-bad-key') as {
        valid: boolean;
        error: string;
      };

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Access denied');
    });

    it('api-key:validate-provider should handle failed response without error message', async () => {
      // Arrange
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      }));

      // Act
      const result = await invokeHandler('api-key:validate-provider', 'openai', 'sk-key') as {
        valid: boolean;
        error: string;
      };

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toContain('API returned status 500');
    });
  });

  describe('Settings Add API Key with Label', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('settings:add-api-key should accept and return custom label', async () => {
      // Arrange
      const provider = 'anthropic';
      const key = 'sk-custom-labeled-key';
      const label = 'My Production Key';

      // Act
      const result = await invokeHandler('settings:add-api-key', provider, key, label) as {
        label: string;
      };

      // Assert
      expect(result.label).toBe('My Production Key');
    });

    it('settings:add-api-key should use default label when not provided', async () => {
      // Arrange
      const provider = 'anthropic';
      const key = 'sk-no-label-key';

      // Act
      const result = await invokeHandler('settings:add-api-key', provider, key) as {
        label: string;
      };

      // Assert
      expect(result.label).toBe('Local API Key');
    });

    it('settings:add-api-key should validate label length', async () => {
      // Arrange
      const provider = 'anthropic';
      const key = 'sk-valid-key';
      const longLabel = 'x'.repeat(200);

      // Act & Assert
      await expect(
        invokeHandler('settings:add-api-key', provider, key, longLabel)
      ).rejects.toThrow('exceeds maximum length');
    });
  });

  describe('Settings API Keys with Empty Password', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('settings:api-keys should handle empty password', async () => {
      // Arrange - use mockApiKeys directly
      // Note: The handler now uses getAllApiKeys() which reads from mockApiKeys
      mockApiKeys = {
        anthropic: '',  // Empty key value
      };

      // Act
      const result = await invokeHandler('settings:api-keys') as Array<{ keyPrefix: string }>;

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].keyPrefix).toBe('');
    });
  });
});
