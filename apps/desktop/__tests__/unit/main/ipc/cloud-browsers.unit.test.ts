/**
 * Unit tests for Cloud Browser IPC handlers
 *
 * Tests the registration and invocation of IPC handlers for:
 * - cloud-browsers:get-aws-config
 * - cloud-browsers:validate-aws
 * - cloud-browsers:connect-aws
 * - cloud-browsers:disconnect-aws
 *
 * @module __tests__/unit/main/ipc/cloud-browsers.unit.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    },
    app: {
      isPackaged: false,
      getPath: vi.fn(() => '/tmp/test-app'),
    },
    dialog: {
      showSaveDialog: vi.fn(() => Promise.resolve({ canceled: true })),
      showOpenDialog: vi.fn(() => Promise.resolve({ canceled: true, filePaths: [] })),
    },
    nativeTheme: {
      themeSource: 'system',
      shouldUseDarkColors: false,
    },
  };
});

// Mock task manager
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

// Cloud browser storage state
let mockCloudBrowserConfig: Record<string, { providerId: string; config: string; enabled: boolean; lastValidated?: number } | null> = {};

// Mock storage
const mockStorage = {
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
  getProviderSettings: vi.fn(() => ({
    activeProviderId: 'anthropic',
    connectedProviders: {},
    debugMode: false,
  })),
  setActiveProvider: vi.fn(),
  getActiveProviderModel: vi.fn(() => null),
  getConnectedProvider: vi.fn(() => null),
  setConnectedProvider: vi.fn(),
  removeConnectedProvider: vi.fn(),
  updateProviderModel: vi.fn(),
  setProviderDebugMode: vi.fn(),
  getProviderDebugMode: vi.fn(() => false),
  hasReadyProvider: vi.fn(() => true),
  getConnectedProviderIds: vi.fn(() => []),
  getActiveProviderId: vi.fn(() => null),
  clearProviderSettings: vi.fn(),
  initialize: vi.fn(),
  isDatabaseInitialized: vi.fn(() => true),
  close: vi.fn(),
  getDatabasePath: vi.fn(() => '/mock/path'),
  storeApiKey: vi.fn(),
  getApiKey: vi.fn(() => null),
  deleteApiKey: vi.fn(() => true),
  getAllApiKeys: vi.fn(() => Promise.resolve({})),
  storeBedrockCredentials: vi.fn(),
  getBedrockCredentials: vi.fn(() => null),
  hasAnyApiKey: vi.fn(() => Promise.resolve(false)),
  listStoredCredentials: vi.fn(() => []),
  clearSecureStorage: vi.fn(),
  getTheme: vi.fn(() => 'system'),
  setTheme: vi.fn(),
  getAllConnectors: vi.fn(() => []),
  getConnectorById: vi.fn(() => null),
  upsertConnector: vi.fn(),
  deleteConnector: vi.fn(),
  setConnectorEnabled: vi.fn(),
  setConnectorStatus: vi.fn(),
  storeConnectorTokens: vi.fn(),
  getConnectorTokens: vi.fn(() => null),
  deleteConnectorTokens: vi.fn(),

  // Cloud browser methods
  getCloudBrowserConfig: vi.fn((providerId: string) => mockCloudBrowserConfig[providerId] || null),
  setCloudBrowserConfig: vi.fn((providerId: string, config: string, enabled: boolean) => {
    mockCloudBrowserConfig[providerId] = { providerId, config, enabled };
  }),
  deleteCloudBrowserConfig: vi.fn((providerId: string) => {
    delete mockCloudBrowserConfig[providerId];
  }),
  setCloudBrowserLastValidated: vi.fn((providerId: string, timestamp: number) => {
    const cfg = mockCloudBrowserConfig[providerId];
    if (cfg) {
      cfg.lastValidated = timestamp;
    }
  }),
};

vi.mock('@main/store/storage', () => ({
  getStorage: vi.fn(() => mockStorage),
}));

// Mock secure storage
let mockApiKeys: Record<string, string | null> = {};

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
  getBedrockCredentials: vi.fn(() => null),
}));

vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@accomplish_ai/agent-core')>();

  return {
    ...actual,
    validateBedrockCredentials: vi.fn(() => Promise.resolve({ valid: true })),
    createTaskId: vi.fn(() => `task_${Date.now()}`),
    createMessageId: vi.fn(() => `msg-${Date.now()}`),
    generateTaskSummary: vi.fn(() => Promise.resolve('Mock summary')),
    validateAnthropicApiKey: vi.fn(() => Promise.resolve({ valid: true })),
    validateOpenAIApiKey: vi.fn(() => Promise.resolve({ valid: true })),
    validateGoogleApiKey: vi.fn(() => Promise.resolve({ valid: true })),
    validateXAIApiKey: vi.fn(() => Promise.resolve({ valid: true })),
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
    testOllamaConnection: vi.fn(() => Promise.resolve({ valid: true })),
    testOllamaModelToolSupport: vi.fn(),
    testLiteLLMConnection: vi.fn(),
    fetchLiteLLMModels: vi.fn(),
    validateAzureFoundry: vi.fn(() => Promise.resolve({ valid: true })),
    testAzureFoundryConnection: vi.fn(),
    fetchOpenRouterModels: vi.fn(),
    fetchProviderModels: vi.fn(),
    fetchBedrockModels: vi.fn(),
    getOpenAiOauthStatus: vi.fn(() => ({ connected: false })),
    discoverOAuthMetadata: vi.fn(),
    registerOAuthClient: vi.fn(),
    generatePkceChallenge: vi.fn(),
    buildAuthorizationUrl: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
    getAzureEntraToken: vi.fn(() => Promise.resolve({ success: true, token: 'mock-token' })),
  };
});

vi.mock('@main/config', () => ({
  getDesktopConfig: vi.fn(() => ({})),
}));

vi.mock('@main/permission-api', () => ({
  startPermissionApiServer: vi.fn(),
  startQuestionApiServer: vi.fn(),
  initPermissionApi: vi.fn(),
  resolvePermission: vi.fn(),
  resolveQuestion: vi.fn(),
  isFilePermissionRequest: vi.fn(),
  isQuestionRequest: vi.fn(),
  QUESTION_API_PORT: 9227,
}));

vi.mock('@main/logging', () => ({
  getLogCollector: vi.fn(() => ({
    flush: vi.fn(),
    getCurrentLogPath: vi.fn(() => '/tmp/test.log'),
    getLogDir: vi.fn(() => '/tmp'),
  })),
}));

vi.mock('@main/services/speechToText', () => ({
  validateElevenLabsApiKey: vi.fn(),
  transcribeAudio: vi.fn(),
  isElevenLabsConfigured: vi.fn(() => false),
}));

vi.mock('@main/skills', () => ({
  skillsManager: {
    getAll: vi.fn(() => []),
    getEnabled: vi.fn(() => []),
    setEnabled: vi.fn(),
    getContent: vi.fn(),
    addFromFile: vi.fn(),
    addFromGitHub: vi.fn(),
    delete: vi.fn(),
    resync: vi.fn(),
  },
}));

vi.mock('@main/providers', () => ({
  registerVertexHandlers: vi.fn(),
}));

vi.mock('@main/test-utils/mock-task-flow', () => ({
  isMockTaskEventsEnabled: vi.fn(() => false),
  createMockTask: vi.fn(),
  executeMockTaskFlow: vi.fn(),
  detectScenarioFromPrompt: vi.fn(),
}));

// Import after mocks are set up
import { registerIPCHandlers } from '@main/ipc/handlers';
import { ipcMain } from 'electron';
import { validateBedrockCredentials } from '@accomplish_ai/agent-core';
import type { Mock } from 'vitest';

type MockedIpcMain = typeof ipcMain & {
  _getHandler: (channel: string) => Function | undefined;
  _getHandlers: () => Map<string, Function>;
  _clear: () => void;
};

const mockedIpcMain = ipcMain as MockedIpcMain;

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

describe('Cloud Browser IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIpcMain._clear();
    mockApiKeys = {};
    mockCloudBrowserConfig = {};
    (validateBedrockCredentials as Mock).mockResolvedValue({ valid: true });
    registerIPCHandlers();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('cloud-browsers:get-aws-config', () => {
    it('should return null config when no config exists', async () => {
      const result = await invokeHandler('cloud-browsers:get-aws-config') as {
        config: null;
        hasCredentials: boolean;
        credentialPrefix: string | null;
      };

      expect(result.config).toBeNull();
      expect(result.hasCredentials).toBe(false);
      expect(result.credentialPrefix).toBeNull();
    });

    it('should return config with credential prefix for access keys', async () => {
      mockCloudBrowserConfig['aws-agentcore'] = {
        providerId: 'aws-agentcore',
        config: JSON.stringify({ region: 'us-west-2', authType: 'accessKeys' }),
        enabled: true,
        lastValidated: 1700000000000,
      };
      mockApiKeys['cloud-browser-aws'] = JSON.stringify({
        authType: 'accessKeys',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
      });

      const result = await invokeHandler('cloud-browsers:get-aws-config') as {
        config: { region: string; authType: string; enabled: boolean; lastValidated: number };
        hasCredentials: boolean;
        credentialPrefix: string;
      };

      expect(result.config).not.toBeNull();
      expect(result.config.region).toBe('us-west-2');
      expect(result.config.authType).toBe('accessKeys');
      expect(result.config.enabled).toBe(true);
      expect(result.hasCredentials).toBe(true);
      expect(result.credentialPrefix).toBe('AKIAIOSF...');
    });

    it('should return config with profile name as prefix', async () => {
      mockCloudBrowserConfig['aws-agentcore'] = {
        providerId: 'aws-agentcore',
        config: JSON.stringify({ region: 'eu-west-1', authType: 'profile' }),
        enabled: true,
      };
      mockApiKeys['cloud-browser-aws'] = JSON.stringify({
        authType: 'profile',
        profileName: 'my-dev-profile',
      });

      const result = await invokeHandler('cloud-browsers:get-aws-config') as {
        config: { region: string; authType: string };
        hasCredentials: boolean;
        credentialPrefix: string;
      };

      expect(result.config).not.toBeNull();
      expect(result.config.region).toBe('eu-west-1');
      expect(result.config.authType).toBe('profile');
      expect(result.hasCredentials).toBe(true);
      expect(result.credentialPrefix).toBe('my-dev-profile');
    });

    it('should return hasCredentials false when no API key stored', async () => {
      mockCloudBrowserConfig['aws-agentcore'] = {
        providerId: 'aws-agentcore',
        config: JSON.stringify({ region: 'us-east-1', authType: 'profile' }),
        enabled: true,
      };

      const result = await invokeHandler('cloud-browsers:get-aws-config') as {
        config: { region: string };
        hasCredentials: boolean;
        credentialPrefix: string | null;
      };

      expect(result.config).not.toBeNull();
      expect(result.hasCredentials).toBe(false);
      expect(result.credentialPrefix).toBeNull();
    });

    it('should handle malformed credential JSON gracefully', async () => {
      mockApiKeys['cloud-browser-aws'] = 'not-valid-json';

      const result = await invokeHandler('cloud-browsers:get-aws-config') as {
        config: null;
        hasCredentials: boolean;
        credentialPrefix: string | null;
      };

      expect(result.hasCredentials).toBe(true);
      expect(result.credentialPrefix).toBeNull();
    });
  });

  describe('cloud-browsers:validate-aws', () => {
    it('should delegate to validateBedrockCredentials', async () => {
      const credentialsJson = JSON.stringify({
        authType: 'profile',
        profileName: 'default',
        region: 'us-east-1',
      });

      (validateBedrockCredentials as Mock).mockResolvedValue({ valid: true });

      const result = await invokeHandler('cloud-browsers:validate-aws', credentialsJson);

      expect(validateBedrockCredentials).toHaveBeenCalledWith(credentialsJson);
      expect(result).toEqual({ valid: true });
    });

    it('should return error for invalid credentials', async () => {
      const credentialsJson = JSON.stringify({
        authType: 'accessKeys',
        accessKeyId: 'bad-key',
        secretAccessKey: 'bad-secret',
        region: 'us-east-1',
      });

      (validateBedrockCredentials as Mock).mockResolvedValue({
        valid: false,
        error: 'Invalid AWS credentials',
      });

      const result = await invokeHandler('cloud-browsers:validate-aws', credentialsJson) as {
        valid: boolean;
        error: string;
      };

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid AWS credentials');
    });

    it('should propagate exceptions from validateBedrockCredentials', async () => {
      const credentialsJson = JSON.stringify({
        authType: 'profile',
        profileName: 'default',
        region: 'us-east-1',
      });

      (validateBedrockCredentials as Mock).mockRejectedValue(new Error('Network timeout'));

      await expect(
        invokeHandler('cloud-browsers:validate-aws', credentialsJson)
      ).rejects.toThrow('Network timeout');
    });
  });

  describe('cloud-browsers:connect-aws', () => {
    it('should validate then store credentials on success', async () => {
      const credentialsJson = JSON.stringify({
        authType: 'profile',
        profileName: 'production',
        region: 'us-west-2',
      });

      (validateBedrockCredentials as Mock).mockResolvedValue({ valid: true });

      await invokeHandler('cloud-browsers:connect-aws', credentialsJson);

      expect(validateBedrockCredentials).toHaveBeenCalledWith(credentialsJson);

      const { storeApiKey } = await import('@main/store/secureStorage');
      expect(storeApiKey).toHaveBeenCalledWith('cloud-browser-aws', credentialsJson);

      expect(mockStorage.setCloudBrowserConfig).toHaveBeenCalledWith(
        'aws-agentcore',
        JSON.stringify({ region: 'us-west-2', authType: 'profile' }),
        true
      );

      expect(mockStorage.setCloudBrowserLastValidated).toHaveBeenCalledWith(
        'aws-agentcore',
        expect.any(Number)
      );
    });

    it('should throw when validation fails', async () => {
      const credentialsJson = JSON.stringify({
        authType: 'accessKeys',
        accessKeyId: 'invalid',
        secretAccessKey: 'invalid',
        region: 'us-east-1',
      });

      (validateBedrockCredentials as Mock).mockResolvedValue({
        valid: false,
        error: 'Access denied',
      });

      await expect(
        invokeHandler('cloud-browsers:connect-aws', credentialsJson)
      ).rejects.toThrow('Access denied');

      const { storeApiKey } = await import('@main/store/secureStorage');
      expect(storeApiKey).not.toHaveBeenCalled();
    });

    it('should use fallback error message when result.error is undefined', async () => {
      const credentialsJson = JSON.stringify({
        authType: 'profile',
        profileName: 'test',
        region: 'us-east-1',
      });

      (validateBedrockCredentials as Mock).mockResolvedValue({
        valid: false,
        error: undefined,
      });

      await expect(
        invokeHandler('cloud-browsers:connect-aws', credentialsJson)
      ).rejects.toThrow('Validation failed');

      const { storeApiKey } = await import('@main/store/secureStorage');
      expect(storeApiKey).not.toHaveBeenCalled();
    });

    it('should use default region when not provided', async () => {
      const credentialsJson = JSON.stringify({
        authType: 'profile',
        profileName: 'default',
      });

      (validateBedrockCredentials as Mock).mockResolvedValue({ valid: true });

      await invokeHandler('cloud-browsers:connect-aws', credentialsJson);

      expect(mockStorage.setCloudBrowserConfig).toHaveBeenCalledWith(
        'aws-agentcore',
        JSON.stringify({ region: 'us-east-1', authType: 'profile' }),
        true
      );
    });
  });

  describe('cloud-browsers:disconnect-aws', () => {
    it('should remove config and credentials', async () => {
      mockCloudBrowserConfig['aws-agentcore'] = {
        providerId: 'aws-agentcore',
        config: JSON.stringify({ region: 'us-east-1', authType: 'profile' }),
        enabled: true,
      };
      mockApiKeys['cloud-browser-aws'] = JSON.stringify({ authType: 'profile', profileName: 'test' });

      await invokeHandler('cloud-browsers:disconnect-aws');

      expect(mockStorage.deleteCloudBrowserConfig).toHaveBeenCalledWith('aws-agentcore');

      const { deleteApiKey } = await import('@main/store/secureStorage');
      expect(deleteApiKey).toHaveBeenCalledWith('cloud-browser-aws');
    });

    it('should not throw when no config or credentials exist', async () => {
      await expect(
        invokeHandler('cloud-browsers:disconnect-aws')
      ).resolves.not.toThrow();

      expect(mockStorage.deleteCloudBrowserConfig).toHaveBeenCalledWith('aws-agentcore');

      const { deleteApiKey } = await import('@main/store/secureStorage');
      expect(deleteApiKey).toHaveBeenCalledWith('cloud-browser-aws');
    });
  });

  describe('Handler Registration', () => {
    it('should register all cloud browser handlers', () => {
      const handlers = mockedIpcMain._getHandlers();

      expect(handlers.has('cloud-browsers:get-aws-config')).toBe(true);
      expect(handlers.has('cloud-browsers:validate-aws')).toBe(true);
      expect(handlers.has('cloud-browsers:connect-aws')).toBe(true);
      expect(handlers.has('cloud-browsers:disconnect-aws')).toBe(true);
    });
  });
});
