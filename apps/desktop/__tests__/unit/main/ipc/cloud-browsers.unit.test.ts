/**
 * Unit tests for Browserbase cloud browser IPC handlers
 *
 * Tests the registration and invocation of IPC handlers for:
 * - get-browserbase-config (retrieve stored config + credential info)
 * - validate-browserbase (validate API key + project ID via fetch)
 * - connect-browserbase (validate, then store credentials + config)
 * - disconnect-browserbase (remove config + credentials)
 *
 * NOTE: This is a UNIT test. All dependent modules are mocked.
 * The validate and connect handlers call global fetch() directly,
 * so we use vi.stubGlobal to mock it.
 *
 * @module __tests__/unit/main/ipc/cloud-browsers.unit.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock state ───────────────────────────────────────────────────────────────

let mockApiKeys: Record<string, string | null> = {};
let mockCloudBrowserConfigs: Record<
  string,
  { config: string; enabled: boolean; lastValidated: number | null } | undefined
> = {};

// ── Mock electron ────────────────────────────────────────────────────────────

const mockHandlers = new Map<string, Function>();
const mockListeners = new Map<string, Set<Function>>();

vi.mock('electron', () => ({
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
      webContents: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
    })),
    getFocusedWindow: vi.fn(() => ({
      id: 1,
      isDestroyed: vi.fn(() => false),
    })),
    getAllWindows: vi.fn(() => [{ id: 1, webContents: { send: vi.fn() } }]),
  },
  shell: { openExternal: vi.fn() },
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/test-app'),
  },
  dialog: { showOpenDialog: vi.fn() },
  nativeTheme: { themeSource: 'system', shouldUseDarkColors: false },
}));

// ── Mock task manager ────────────────────────────────────────────────────────

const mockTaskManager = {
  startTask: vi.fn(),
  cancelTask: vi.fn(),
  interruptTask: vi.fn(),
  sendResponse: vi.fn(),
  hasActiveTask: vi.fn(() => false),
  getActiveTaskId: vi.fn(() => null),
  getSessionId: vi.fn(() => null),
  isTaskQueued: vi.fn(() => false),
  cancelQueuedTask: vi.fn(),
  dispose: vi.fn(),
};

vi.mock('@main/opencode', () => ({
  getTaskManager: vi.fn(() => mockTaskManager),
  disposeTaskManager: vi.fn(),
  isOpenCodeCliInstalled: vi.fn(() => Promise.resolve(true)),
  getOpenCodeCliVersion: vi.fn(() => Promise.resolve('1.0.0')),
  cleanupVertexServiceAccountKey: vi.fn(),
}));

vi.mock('@main/opencode/auth-browser', () => ({
  loginOpenAiWithChatGpt: vi.fn(() => Promise.resolve({ openedUrl: undefined })),
}));

// ── Mock agent-core ──────────────────────────────────────────────────────────

vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@accomplish_ai/agent-core')>();

  const storageMethods = {
    // Task history
    getTasks: vi.fn(() => []),
    getTask: vi.fn(() => null),
    saveTask: vi.fn(),
    updateTaskStatus: vi.fn(),
    updateTaskSessionId: vi.fn(),
    updateTaskSummary: vi.fn(),
    addTaskMessage: vi.fn(),
    deleteTask: vi.fn(),
    clearHistory: vi.fn(),
    saveTodosForTask: vi.fn(),
    getTodosForTask: vi.fn(() => []),
    clearTodosForTask: vi.fn(),

    // App settings
    getDebugMode: vi.fn(() => false),
    setDebugMode: vi.fn(),
    getAppSettings: vi.fn(() => ({
      debugMode: false,
      onboardingComplete: false,
      selectedModel: null,
      openaiBaseUrl: '',
    })),
    getOnboardingComplete: vi.fn(() => false),
    setOnboardingComplete: vi.fn(),
    getSelectedModel: vi.fn(() => null),
    setSelectedModel: vi.fn(),
    getOpenAiBaseUrl: vi.fn(() => ''),
    setOpenAiBaseUrl: vi.fn(),
    getOllamaConfig: vi.fn(() => null),
    setOllamaConfig: vi.fn(),
    getAzureFoundryConfig: vi.fn(() => null),
    setAzureFoundryConfig: vi.fn(),
    getLiteLLMConfig: vi.fn(() => null),
    setLiteLLMConfig: vi.fn(),
    getLMStudioConfig: vi.fn(() => null),
    setLMStudioConfig: vi.fn(),
    clearAppSettings: vi.fn(),

    // Provider settings
    getProviderSettings: vi.fn(() => ({
      activeProviderId: 'anthropic',
      connectedProviders: {},
      debugMode: false,
    })),
    setActiveProvider: vi.fn(),
    getActiveProviderModel: vi.fn(() => ({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
    })),
    getConnectedProvider: vi.fn(() => null),
    setConnectedProvider: vi.fn(),
    removeConnectedProvider: vi.fn(),
    updateProviderModel: vi.fn(),
    setProviderDebugMode: vi.fn(),
    getProviderDebugMode: vi.fn(() => false),
    hasReadyProvider: vi.fn(() => true),
    getConnectedProviderIds: vi.fn(() => ['anthropic']),
    getActiveProviderId: vi.fn(() => 'anthropic'),
    clearProviderSettings: vi.fn(),

    // Cloud browser storage methods
    getCloudBrowserConfig: vi.fn((providerId: string) => mockCloudBrowserConfigs[providerId] ?? null),
    setCloudBrowserConfig: vi.fn((providerId: string, config: string, enabled: boolean) => {
      mockCloudBrowserConfigs[providerId] = {
        config,
        enabled,
        lastValidated: null,
      };
    }),
    deleteCloudBrowserConfig: vi.fn((providerId: string) => {
      delete mockCloudBrowserConfigs[providerId];
    }),
    setCloudBrowserLastValidated: vi.fn((providerId: string, timestamp: number) => {
      if (mockCloudBrowserConfigs[providerId]) {
        mockCloudBrowserConfigs[providerId]!.lastValidated = timestamp;
      }
    }),

    // Connectors
    getConnectors: vi.fn(() => []),
    getConnectorById: vi.fn(() => null),
    upsertConnector: vi.fn(),
    deleteConnector: vi.fn(),
    deleteConnectorTokens: vi.fn(),
    setConnectorStatus: vi.fn(),

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
  };

  return {
    // Use actual constants
    BROWSERBASE_VALID_REGION_IDS: actual.BROWSERBASE_VALID_REGION_IDS,

    // Use actual implementations for validation
    validateApiKey: actual.validateApiKey,
    validateHttpUrl: actual.validateHttpUrl,
    validateTaskConfig: actual.validateTaskConfig,
    ALLOWED_API_KEY_PROVIDERS: actual.ALLOWED_API_KEY_PROVIDERS,
    STANDARD_VALIDATION_PROVIDERS: actual.STANDARD_VALIDATION_PROVIDERS,
    validate: actual.validate,
    permissionResponseSchema: actual.permissionResponseSchema,
    DEFAULT_PROVIDERS: actual.DEFAULT_PROVIDERS,
    ZAI_ENDPOINTS: actual.ZAI_ENDPOINTS,

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
    safeParseJson: vi.fn((s: string | null) => {
      if (!s) {
        return { success: false, error: 'Input is null or empty' };
      }
      try {
        return { success: true, data: JSON.parse(s) };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }),

    // Storage methods at module level
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

    // Functions used by handlers but not in storage
    fetchBedrockModels: vi.fn(() => Promise.resolve([])),
    validateAzureFoundry: vi.fn(() => Promise.resolve({ valid: true })),
    testAzureFoundryConnection: vi.fn(() => Promise.resolve({ success: true })),
    fetchOpenRouterModels: vi.fn(() => Promise.resolve([])),
    fetchProviderModels: vi.fn(() => Promise.resolve([])),
    testLiteLLMConnection: vi.fn(() => Promise.resolve({ success: true })),
    fetchLiteLLMModels: vi.fn(() => Promise.resolve([])),
    testOllamaModelToolSupport: vi.fn(() => Promise.resolve({ supported: true })),
    testOllamaConnection: vi.fn(() => Promise.resolve({ success: true })),

    // OAuth
    discoverOAuthMetadata: vi.fn(),
    registerOAuthClient: vi.fn(),
    generatePkceChallenge: vi.fn(),
    buildAuthorizationUrl: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
  };
});

// ── Mock secure storage ──────────────────────────────────────────────────────

vi.mock('@main/store/secureStorage', () => ({
  storeApiKey: vi.fn((provider: string, key: string) => {
    mockApiKeys[provider] = key;
  }),
  getApiKey: vi.fn((provider: string) => mockApiKeys[provider] || null),
  deleteApiKey: vi.fn((provider: string) => {
    delete mockApiKeys[provider];
  }),
  getAllApiKeys: vi.fn(() => Promise.resolve({})),
  hasAnyApiKey: vi.fn(() => Promise.resolve(false)),
  listStoredCredentials: vi.fn(() => []),
  getBedrockCredentials: vi.fn(() => null),
}));

// ── Mock config ──────────────────────────────────────────────────────────────

vi.mock('@main/config', () => ({
  getDesktopConfig: vi.fn(() => ({})),
}));

// ── Mock permission API ──────────────────────────────────────────────────────

vi.mock('@main/permission-api', () => ({
  startPermissionApiServer: vi.fn(),
  startQuestionApiServer: vi.fn(),
  initPermissionApi: vi.fn(),
  resolvePermission: vi.fn(() => true),
  resolveQuestion: vi.fn(() => true),
  isFilePermissionRequest: vi.fn((id: string) => id.startsWith('filereq_')),
  isQuestionRequest: vi.fn((id: string) => id.startsWith('question_')),
  QUESTION_API_PORT: 9227,
}));

// ── Mock logging ─────────────────────────────────────────────────────────────

vi.mock('@main/logging', () => ({
  getLogCollector: vi.fn(() => ({
    addEvent: vi.fn(),
  })),
}));

// ── Mock services ────────────────────────────────────────────────────────────

vi.mock('@main/services/speechToText', () => ({
  validateElevenLabsApiKey: vi.fn(() => Promise.resolve({ valid: true })),
  transcribeAudio: vi.fn(() => Promise.resolve('')),
  isElevenLabsConfigured: vi.fn(() => false),
}));

vi.mock('@main/skills', () => ({
  skillsManager: {
    getSkillsForProvider: vi.fn(() => []),
    getMcpSkillConfigs: vi.fn(() => []),
  },
}));

vi.mock('@main/providers', () => ({
  registerVertexHandlers: vi.fn(),
}));

// ── Import under test ────────────────────────────────────────────────────────

import { registerIPCHandlers } from '@main/ipc/handlers';
import { ipcMain } from 'electron';

type MockedIpcMain = typeof ipcMain & {
  _getHandler: (channel: string) => Function | undefined;
  _getHandlers: () => Map<string, Function>;
  _clear: () => void;
};

const mockedIpcMain = ipcMain as MockedIpcMain;

/**
 * Helper to invoke a registered IPC handler
 */
async function invokeHandler(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockedIpcMain._getHandler(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  const mockEvent = {
    sender: {
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
    },
  };
  return handler(mockEvent, ...args);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Browserbase Cloud Browser IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIpcMain._clear();
    mockApiKeys = {};
    mockCloudBrowserConfigs = {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('Handler Registration', () => {
    it('should register all 4 cloud browser handlers', () => {
      registerIPCHandlers();
      const handlers = mockedIpcMain._getHandlers();

      expect(handlers.has('cloud-browsers:get-browserbase-config')).toBe(true);
      expect(handlers.has('cloud-browsers:validate-browserbase')).toBe(true);
      expect(handlers.has('cloud-browsers:connect-browserbase')).toBe(true);
      expect(handlers.has('cloud-browsers:disconnect-browserbase')).toBe(true);
    });
  });

  describe('cloud-browsers:get-browserbase-config', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('should return null config when no config exists', async () => {
      const result = await invokeHandler('cloud-browsers:get-browserbase-config') as {
        config: unknown;
        hasCredentials: boolean;
        credentialPrefix: string | null;
      };

      expect(result.config).toBeNull();
      expect(result.hasCredentials).toBe(false);
      expect(result.credentialPrefix).toBeNull();
    });

    it('should return config with credential prefix when connected', async () => {
      mockCloudBrowserConfigs['browserbase'] = {
        config: JSON.stringify({ region: 'us-west-2', projectId: 'proj-123' }),
        enabled: true,
        lastValidated: Date.now(),
      };
      mockApiKeys['cloud-browser-browserbase'] = JSON.stringify({
        apiKey: 'bb_live_abcdef1234567890',
        projectId: 'proj-123',
      });

      const result = await invokeHandler('cloud-browsers:get-browserbase-config') as {
        config: { region: string; projectId: string; enabled: boolean; lastValidated: number };
        hasCredentials: boolean;
        credentialPrefix: string | null;
      };

      expect(result.config).not.toBeNull();
      expect(result.config.region).toBe('us-west-2');
      expect(result.config.projectId).toBe('proj-123');
      expect(result.config.enabled).toBe(true);
      expect(result.hasCredentials).toBe(true);
      expect(result.credentialPrefix).toBe('bb_live_...');
    });

    it('should return hasCredentials false when no API key stored', async () => {
      mockCloudBrowserConfigs['browserbase'] = {
        config: JSON.stringify({ region: 'us-east-1', projectId: 'proj-456' }),
        enabled: true,
        lastValidated: null,
      };

      const result = await invokeHandler('cloud-browsers:get-browserbase-config') as {
        config: unknown;
        hasCredentials: boolean;
        credentialPrefix: string | null;
      };

      expect(result.config).not.toBeNull();
      expect(result.hasCredentials).toBe(false);
      expect(result.credentialPrefix).toBeNull();
    });

    it('should handle malformed credential JSON gracefully', async () => {
      mockApiKeys['cloud-browser-browserbase'] = 'not-valid-json{{{';

      const result = await invokeHandler('cloud-browsers:get-browserbase-config') as {
        config: unknown;
        hasCredentials: boolean;
        credentialPrefix: string | null;
      };

      expect(result.hasCredentials).toBe(true);
      expect(result.credentialPrefix).toBeNull();
    });
  });

  describe('cloud-browsers:validate-browserbase', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should return valid for successful API response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      }));

      const result = await invokeHandler(
        'cloud-browsers:validate-browserbase',
        'bb_live_testkey1234',
        'proj-abc123',
      ) as { valid: boolean };

      expect(result.valid).toBe(true);

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.browserbase.com/v1/projects/proj-abc123/usage',
        expect.objectContaining({
          headers: { 'X-BB-API-Key': 'bb_live_testkey1234' },
        }),
      );
    });

    it('should return error for 401 (invalid API key)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }));

      const result = await invokeHandler(
        'cloud-browsers:validate-browserbase',
        'bb_live_badkey',
        'proj-abc123',
      ) as { valid: boolean; error: string };

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('should return error for 404 (invalid project ID)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }));

      const result = await invokeHandler(
        'cloud-browsers:validate-browserbase',
        'bb_live_validkey',
        'proj-nonexistent',
      ) as { valid: boolean; error: string };

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid project ID');
    });

    it('should handle timeout errors', async () => {
      const timeoutErr = new Error('The operation was aborted due to timeout');
      timeoutErr.name = 'TimeoutError';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutErr));

      const result = await invokeHandler(
        'cloud-browsers:validate-browserbase',
        'bb_live_testkey',
        'proj-abc123',
      ) as { valid: boolean; error: string };

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Connection timed out');
    });

    it('should reject non-string inputs', async () => {
      await expect(
        invokeHandler('cloud-browsers:validate-browserbase', 123, 'proj-abc123'),
      ).rejects.toThrow('Invalid credentials: expected strings');

      await expect(
        invokeHandler('cloud-browsers:validate-browserbase', 'bb_live_key', 456),
      ).rejects.toThrow('Invalid credentials: expected strings');
    });
  });

  describe('cloud-browsers:connect-browserbase', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should validate then store credentials on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      }));

      await invokeHandler(
        'cloud-browsers:connect-browserbase',
        'bb_live_goodkey12',
        'proj-store123',
        'us-west-2',
      );

      expect(mockApiKeys['cloud-browser-browserbase']).toBeDefined();
      const storedCreds = JSON.parse(mockApiKeys['cloud-browser-browserbase']!);
      expect(storedCreds.apiKey).toBe('bb_live_goodkey12');
      expect(storedCreds.projectId).toBe('proj-store123');
    });

    it('should throw when validation fails (401)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }));

      await expect(
        invokeHandler(
          'cloud-browsers:connect-browserbase',
          'bb_live_badkey',
          'proj-abc',
          'us-west-2',
        ),
      ).rejects.toThrow('Invalid API key');
    });

    it('should reject invalid region', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      }));

      await expect(
        invokeHandler(
          'cloud-browsers:connect-browserbase',
          'bb_live_key123456',
          'proj-abc',
          'us-north-1',
        ),
      ).rejects.toThrow('Invalid Browserbase region');
    });

    it('should store config with correct structure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      }));

      const { setCloudBrowserConfig, setCloudBrowserLastValidated } =
        await import('@accomplish_ai/agent-core');

      await invokeHandler(
        'cloud-browsers:connect-browserbase',
        'bb_live_structkey1',
        'proj-struct',
        'eu-central-1',
      );

      expect(setCloudBrowserConfig).toHaveBeenCalledWith(
        'browserbase',
        JSON.stringify({ region: 'eu-central-1', projectId: 'proj-struct' }),
        true,
      );
      expect(setCloudBrowserLastValidated).toHaveBeenCalledWith(
        'browserbase',
        expect.any(Number),
      );
    });
  });

  describe('cloud-browsers:disconnect-browserbase', () => {
    beforeEach(() => {
      registerIPCHandlers();
    });

    it('should remove config and credentials', async () => {
      mockCloudBrowserConfigs['browserbase'] = {
        config: JSON.stringify({ region: 'us-west-2', projectId: 'proj-rm' }),
        enabled: true,
        lastValidated: Date.now(),
      };
      mockApiKeys['cloud-browser-browserbase'] = JSON.stringify({
        apiKey: 'bb_live_removekey',
        projectId: 'proj-rm',
      });

      await invokeHandler('cloud-browsers:disconnect-browserbase');

      const { deleteCloudBrowserConfig } = await import('@accomplish_ai/agent-core');
      expect(deleteCloudBrowserConfig).toHaveBeenCalledWith('browserbase');

      const { deleteApiKey } = await import('@main/store/secureStorage');
      expect(deleteApiKey).toHaveBeenCalledWith('cloud-browser-browserbase');
    });

    it('should not throw when no config exists', async () => {
      await expect(
        invokeHandler('cloud-browsers:disconnect-browserbase'),
      ).resolves.not.toThrow();

      const { deleteCloudBrowserConfig } = await import('@accomplish_ai/agent-core');
      expect(deleteCloudBrowserConfig).toHaveBeenCalledWith('browserbase');
    });
  });
});
