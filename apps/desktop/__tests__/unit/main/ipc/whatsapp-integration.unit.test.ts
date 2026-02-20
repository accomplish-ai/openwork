import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('electron', () => {
  const mockHandlers = new Map<string, Function>();
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: Function) => {
        mockHandlers.set(channel, handler);
      }),
      on: vi.fn(),
      removeHandler: vi.fn(),
      removeAllListeners: vi.fn(),
      _getHandler: (channel: string) => mockHandlers.get(channel),
      _getHandlers: () => mockHandlers,
      _clear: () => mockHandlers.clear(),
    },
    BrowserWindow: {
      fromWebContents: vi.fn(() => ({
        id: 1,
        isDestroyed: vi.fn(() => false),
        webContents: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
      })),
      getFocusedWindow: vi.fn(() => ({ id: 1, isDestroyed: vi.fn(() => false) })),
      getAllWindows: vi.fn(() => [{ id: 1, webContents: { send: vi.fn() } }]),
    },
    shell: { openExternal: vi.fn() },
    app: {
      isPackaged: false,
      getPath: vi.fn(() => '/tmp/test-app'),
    },
  };
});

// Mock WhatsApp singleton — vi.hoisted runs before imports
const { mockService, mockGetOrCreate, mockGetService, mockClearService, mockDispose, mockSetActiveBridge, mockGetActiveBridge } = vi.hoisted(() => {
  // Manual EventEmitter-like implementation (can't import modules in vi.hoisted)
  const listeners = new Map<string, Function[]>();
  let activeBridge: unknown = null;
  const mockService = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    dispose: vi.fn(),
    sendMessage: vi.fn(),
    getStatus: vi.fn(() => 'disconnected'),
    on(event: string, fn: Function) {
      if (!listeners.has(event)) { listeners.set(event, []); }
      listeners.get(event)!.push(fn);
      return mockService;
    },
    emit(event: string, ...args: unknown[]) {
      const fns = listeners.get(event) || [];
      for (const fn of fns) { fn(...args); }
    },
    removeAllListeners() { listeners.clear(); },
  };
  return {
    mockService,
    mockGetOrCreate: vi.fn(() => mockService),
    mockGetService: vi.fn((): typeof mockService | null => mockService),
    mockClearService: vi.fn(),
    mockDispose: vi.fn(() => { activeBridge = null; }),
    mockSetActiveBridge: vi.fn((bridge: unknown) => { activeBridge = bridge; }),
    mockGetActiveBridge: vi.fn(() => activeBridge),
  };
});

vi.mock('@main/services/whatsapp/singleton', () => ({
  getOrCreateWhatsAppService: mockGetOrCreate,
  getWhatsAppService: mockGetService,
  clearWhatsAppService: mockClearService,
  disposeWhatsAppService: mockDispose,
  setActiveWhatsAppBridge: mockSetActiveBridge,
  getActiveWhatsAppBridge: mockGetActiveBridge,
}));

const { MockTaskBridgeInstance, capturedOnTaskRequest } = vi.hoisted(() => {
  const captured: { fn: ((senderId: string, senderName: string | undefined, text: string) => Promise<void>) | null } = { fn: null };
  return {
    MockTaskBridgeInstance: {
      setActiveTask: vi.fn(),
      clearActiveTask: vi.fn(),
      hasActiveTask: vi.fn(() => false),
      dispose: vi.fn(),
      setOwnerJid: vi.fn(),
      getOwnerJid: vi.fn((): string | null => null),
      setOwnerLid: vi.fn(),
      getOwnerLid: vi.fn((): string | null => null),
      setEnabled: vi.fn(),
      getSessionForSender: vi.fn((): string | null => null),
      setSessionForSender: vi.fn(),
    },
    capturedOnTaskRequest: captured,
  };
});

vi.mock('@main/services/whatsapp/taskBridge', () => ({
  TaskBridge: class MockTaskBridge {
    constructor(_service: unknown, onTaskRequest: (senderId: string, senderName: string | undefined, text: string) => Promise<void>) {
      Object.assign(this, MockTaskBridgeInstance);
      capturedOnTaskRequest.fn = onTaskRequest;
    }
  },
  MAX_MESSAGE_LENGTH: 4096,
}));

const mockTaskManager = vi.hoisted(() => ({
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
}));

vi.mock('@main/opencode', () => ({
  getTaskManager: vi.fn(() => mockTaskManager),
  disposeTaskManager: vi.fn(),
  isOpenCodeCliInstalled: vi.fn(() => Promise.resolve(true)),
  getOpenCodeCliVersion: vi.fn(() => Promise.resolve('1.0.0')),
}));

vi.mock('@main/opencode/auth', () => ({
  getOpenAiOauthStatus: vi.fn(() => ({ connected: false })),
  loginOpenAiWithChatGpt: vi.fn(() => Promise.resolve({ openedUrl: undefined })),
}));

vi.mock('@main/opencode/auth-browser', () => ({
  oauthBrowserFlow: {
    startOAuthFlow: vi.fn(),
    dispose: vi.fn(),
  },
}));

vi.mock('@main/skills', () => ({
  skillsManager: {
    initialize: vi.fn(),
    getSkills: vi.fn(() => []),
    getSkillById: vi.fn(() => null),
    getSkillContent: vi.fn(() => null),
    syncSkills: vi.fn(),
    enableSkill: vi.fn(),
    disableSkill: vi.fn(),
    addSkill: vi.fn(),
    deleteSkill: vi.fn(),
    getEnabledSkills: vi.fn(() => []),
    getUserSkillsDir: vi.fn(() => '/mock/skills'),
  },
}));

vi.mock('@main/store/secureStorage', () => ({
  storeApiKey: vi.fn(),
  getApiKey: vi.fn(() => null),
  deleteApiKey: vi.fn(),
  getAllApiKeys: vi.fn(() => Promise.resolve({})),
  hasAnyApiKey: vi.fn(() => Promise.resolve(false)),
  listStoredCredentials: vi.fn(() => []),
}));

vi.mock('@main/config', () => ({
  getDesktopConfig: vi.fn(() => ({})),
}));

vi.mock('@main/permission-api', () => ({
  startPermissionApiServer: vi.fn(),
  startQuestionApiServer: vi.fn(),
  initPermissionApi: vi.fn(),
  resolvePermission: vi.fn(() => false),
  resolveQuestion: vi.fn(() => true),
  isFilePermissionRequest: vi.fn(() => false),
  isQuestionRequest: vi.fn(() => false),
  QUESTION_API_PORT: 9227,
}));

// Use vi.hoisted so the storage mock is available when vi.mock factory runs
const storageMethods = vi.hoisted(() => ({
  getMessagingConfig: vi.fn((): Record<string, unknown> | null => null),
  upsertMessagingConfig: vi.fn(),
  setMessagingStatus: vi.fn(),
  deleteMessagingConfig: vi.fn(),
  getTasks: vi.fn(() => []),
  getTask: vi.fn(),
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
    onboardingComplete: true,
    selectedModel: null,
    openaiBaseUrl: '',
  })),
  getOnboardingComplete: vi.fn(() => true),
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
  getActiveProviderModel: vi.fn(() => ({ provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' })),
  getConnectedProvider: vi.fn(),
  setConnectedProvider: vi.fn(),
  removeConnectedProvider: vi.fn(),
  updateProviderModel: vi.fn(),
  setProviderDebugMode: vi.fn(),
  getProviderDebugMode: vi.fn(() => false),
  hasReadyProvider: vi.fn(() => true),
  getConnectedProviderIds: vi.fn(() => ['anthropic']),
  getActiveProviderId: vi.fn(() => 'anthropic'),
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
  getConnectors: vi.fn(() => []),
  getConnector: vi.fn(() => null),
  upsertConnector: vi.fn(),
  deleteConnector: vi.fn(),
  clearAllConnectors: vi.fn(),
  setConnectorStatus: vi.fn(),
  getConnectorTokens: vi.fn(() => null),
  storeConnectorTokens: vi.fn(),
  deleteConnectorTokens: vi.fn(),
}));

vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@accomplish_ai/agent-core')>();
  return {
    validateApiKey: actual.validateApiKey,
    validateHttpUrl: actual.validateHttpUrl,
    validateTaskConfig: actual.validateTaskConfig,
    ALLOWED_API_KEY_PROVIDERS: actual.ALLOWED_API_KEY_PROVIDERS,
    STANDARD_VALIDATION_PROVIDERS: actual.STANDARD_VALIDATION_PROVIDERS,
    validate: actual.validate,
    permissionResponseSchema: actual.permissionResponseSchema,
    createTaskId: vi.fn(() => `task_${Date.now()}`),
    createMessageId: vi.fn(() => `msg-${Date.now()}`),
    sanitizeString: vi.fn((input: unknown, fieldName: string, maxLength = 255) => {
      if (typeof input !== 'string') { throw new Error(`${fieldName} must be a string`); }
      const trimmed = input.trim();
      if (!trimmed) { throw new Error(`${fieldName} is required`); }
      if (trimmed.length > maxLength) { throw new Error(`${fieldName} exceeds maximum length of ${maxLength}`); }
      return trimmed;
    }),
    safeParseJson: vi.fn((s: string) => ({ success: true, data: JSON.parse(s) })),
    ...storageMethods,
    createStorage: vi.fn(() => storageMethods),
    getOpenAiOauthStatus: vi.fn(() => ({ connected: false })),
    getAzureEntraToken: vi.fn(() => Promise.resolve({ success: true, token: 'mock-token' })),
    generateTaskSummary: vi.fn(() => Promise.resolve('Mock task summary')),
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
  };
});

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { registerIPCHandlers } from '@main/ipc/handlers';
import { ipcMain } from 'electron';

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
    sender: { send: vi.fn(), isDestroyed: vi.fn(() => false) },
  };
  return handler(mockEvent, ...args);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('WhatsApp Integration IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIpcMain._clear();
    mockService.removeAllListeners();
    mockService.connect.mockReset().mockResolvedValue(undefined);
    mockService.disconnect.mockReset().mockResolvedValue(undefined);
    mockService.dispose.mockReset();
    mockService.sendMessage.mockReset().mockResolvedValue(undefined);
    capturedOnTaskRequest.fn = null;
    mockSetActiveBridge(null);

    registerIPCHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handler registration', () => {
    it('should register all WhatsApp handlers', () => {
      const handlers = mockedIpcMain._getHandlers();
      expect(handlers.has('integrations:whatsapp:get-config')).toBe(true);
      expect(handlers.has('integrations:whatsapp:connect')).toBe(true);
      expect(handlers.has('integrations:whatsapp:disconnect')).toBe(true);
      expect(handlers.has('integrations:whatsapp:set-enabled')).toBe(true);
    });
  });

  describe('integrations:whatsapp:get-config', () => {
    it('should return null when no config exists', async () => {
      storageMethods.getMessagingConfig.mockReturnValueOnce(null);
      const result = await invokeHandler('integrations:whatsapp:get-config');
      expect(result).toBeNull();
      expect(storageMethods.getMessagingConfig).toHaveBeenCalledWith('whatsapp');
    });

    it('should return config when WhatsApp is configured', async () => {
      const config = {
        providerId: 'whatsapp',
        enabled: true,
        status: 'connected',
        phoneNumber: '1234567890',
        lastConnectedAt: Date.now(),
      };
      storageMethods.getMessagingConfig.mockReturnValueOnce(config);

      const result = await invokeHandler('integrations:whatsapp:get-config');
      expect(result).toEqual(config);
    });
  });

  describe('integrations:whatsapp:connect', () => {
    it('should create service and call connect', async () => {
      await invokeHandler('integrations:whatsapp:connect');
      expect(mockGetOrCreate).toHaveBeenCalled();
      expect(mockService.connect).toHaveBeenCalled();
    });

    it('should wire QR event to IPC sender', async () => {
      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      mockService.emit('qr', 'test-qr-string');
      expect(mockSender.send).toHaveBeenCalledWith('integrations:whatsapp:qr', 'test-qr-string');
    });

    it('should wire status event to IPC sender and storage', async () => {
      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      mockService.emit('status', 'connected');
      expect(mockSender.send).toHaveBeenCalledWith('integrations:whatsapp:status', 'connected');
      expect(storageMethods.upsertMessagingConfig).toHaveBeenCalledWith('whatsapp', {
        enabled: true,
        status: 'connected',
      });
    });

    it('should not send to destroyed sender', async () => {
      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => true) };
      await handler({ sender: mockSender });

      mockService.emit('qr', 'test-qr');
      expect(mockSender.send).not.toHaveBeenCalled();
    });

    it('should save phone number on phoneNumber event', async () => {
      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      mockService.emit('phoneNumber', '1234567890');
      expect(storageMethods.upsertMessagingConfig).toHaveBeenCalledWith('whatsapp', expect.objectContaining({
        enabled: true,
        status: 'connected',
        phoneNumber: '1234567890',
      }));
    });
  });

  describe('integrations:whatsapp:disconnect', () => {
    it('should disconnect and dispose service', async () => {
      await invokeHandler('integrations:whatsapp:disconnect');

      expect(mockService.disconnect).toHaveBeenCalled();
      expect(mockDispose).toHaveBeenCalled();
      expect(storageMethods.deleteMessagingConfig).toHaveBeenCalledWith('whatsapp');
    });

    it('should delete config even if service is null', async () => {
      mockGetService.mockReturnValueOnce(null);

      await invokeHandler('integrations:whatsapp:disconnect');
      expect(storageMethods.deleteMessagingConfig).toHaveBeenCalledWith('whatsapp');
    });
  });

  describe('integrations:whatsapp:set-enabled', () => {
    it('should update enabled flag when config exists', async () => {
      storageMethods.getMessagingConfig.mockReturnValueOnce({
        providerId: 'whatsapp',
        enabled: true,
        status: 'connected',
      });

      await invokeHandler('integrations:whatsapp:set-enabled', false);
      expect(storageMethods.upsertMessagingConfig).toHaveBeenCalledWith('whatsapp', expect.objectContaining({
        enabled: false,
      }));
    });

    it('should throw for non-boolean enabled value', async () => {
      await expect(invokeHandler('integrations:whatsapp:set-enabled', 'yes')).rejects.toThrow('Invalid enabled flag');
    });

    it('should do nothing when no config exists', async () => {
      storageMethods.getMessagingConfig.mockReturnValueOnce(null);
      await invokeHandler('integrations:whatsapp:set-enabled', true);
      expect(storageMethods.upsertMessagingConfig).not.toHaveBeenCalled();
    });
  });

  describe('ownerJid storage on phoneNumber event', () => {
    it('should store ownerJid when phoneNumber event fires', async () => {
      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      mockService.emit('phoneNumber', '919876543210');

      expect(storageMethods.upsertMessagingConfig).toHaveBeenCalledWith('whatsapp', expect.objectContaining({
        ownerJid: '919876543210@s.whatsapp.net',
      }));
    });

    it('should set ownerJid on the bridge when phoneNumber fires', async () => {
      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      mockService.emit('phoneNumber', '919876543210');

      expect(MockTaskBridgeInstance.setOwnerJid).toHaveBeenCalledWith('919876543210@s.whatsapp.net');
    });
  });

  describe('ownerJid restoration from DB on reconnect', () => {
    it('should call getMessagingConfig during connect to check for existing ownerJid', async () => {
      storageMethods.getMessagingConfig.mockReturnValueOnce({
        providerId: 'whatsapp',
        enabled: true,
        status: 'connected',
        ownerJid: '919876543210@s.whatsapp.net',
      });

      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      expect(storageMethods.getMessagingConfig).toHaveBeenCalledWith('whatsapp');
      expect(MockTaskBridgeInstance.setOwnerJid).toHaveBeenCalledWith('919876543210@s.whatsapp.net');
    });

    it('should not set ownerJid on bridge when existing config has no ownerJid', async () => {
      storageMethods.getMessagingConfig.mockReturnValueOnce({
        providerId: 'whatsapp',
        enabled: true,
        status: 'connected',
      });

      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      expect(storageMethods.getMessagingConfig).toHaveBeenCalledWith('whatsapp');
      expect(MockTaskBridgeInstance.setOwnerJid).not.toHaveBeenCalled();
    });
  });

  describe('ownerLid storage on ownerLid event', () => {
    it('should store ownerLid when ownerLid event fires', async () => {
      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      mockService.emit('ownerLid', '123456789@lid');

      expect(storageMethods.upsertMessagingConfig).toHaveBeenCalledWith('whatsapp', expect.objectContaining({
        ownerLid: '123456789@lid',
      }));
    });

    it('should set ownerLid on the bridge when ownerLid event fires', async () => {
      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      mockService.emit('ownerLid', '123456789@lid');

      expect(MockTaskBridgeInstance.setOwnerLid).toHaveBeenCalledWith('123456789@lid');
    });
  });

  describe('ownerLid restoration from DB on reconnect', () => {
    it('should restore ownerLid from existing config', async () => {
      storageMethods.getMessagingConfig.mockReturnValueOnce({
        providerId: 'whatsapp',
        enabled: true,
        status: 'connected',
        ownerJid: '919876543210@s.whatsapp.net',
        ownerLid: '123456789@lid',
      });

      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      expect(MockTaskBridgeInstance.setOwnerLid).toHaveBeenCalledWith('123456789@lid');
    });

    it('should not set ownerLid on bridge when existing config has no ownerLid', async () => {
      storageMethods.getMessagingConfig.mockReturnValueOnce({
        providerId: 'whatsapp',
        enabled: true,
        status: 'connected',
        ownerJid: '919876543210@s.whatsapp.net',
      });

      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      expect(MockTaskBridgeInstance.setOwnerLid).not.toHaveBeenCalled();
    });
  });

  describe('session continuity via getSessionForSender', () => {
    it('should pass null sessionId on first message (no prior session)', async () => {
      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      MockTaskBridgeInstance.getSessionForSender.mockReturnValueOnce(null);

      await capturedOnTaskRequest.fn!('sender@s.whatsapp.net', 'User', 'Hello');

      expect(mockTaskManager.startTask).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ sessionId: undefined }),
        expect.any(Object),
      );
    });

    it('should pass existing sessionId on follow-up message', async () => {
      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      MockTaskBridgeInstance.getSessionForSender.mockReturnValueOnce('ses_existing');

      await capturedOnTaskRequest.fn!('sender@s.whatsapp.net', 'User', 'Follow up');

      expect(mockTaskManager.startTask).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ sessionId: 'ses_existing' }),
        expect.any(Object),
      );
    });

    it('should store sessionId from result on task completion', async () => {
      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      await capturedOnTaskRequest.fn!('sender@s.whatsapp.net', 'User', 'Hello');

      const callbacks = mockTaskManager.startTask.mock.calls[0][2];
      callbacks.onComplete({ status: 'success', sessionId: 'ses_new123' });

      expect(MockTaskBridgeInstance.setSessionForSender).toHaveBeenCalledWith(
        'sender@s.whatsapp.net',
        'ses_new123',
      );
    });

    it('should not store sessionId when result has none', async () => {
      const handler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await handler({ sender: mockSender });

      await capturedOnTaskRequest.fn!('sender@s.whatsapp.net', 'User', 'Hello');

      const callbacks = mockTaskManager.startTask.mock.calls[0][2];
      callbacks.onComplete({ status: 'success' });

      expect(MockTaskBridgeInstance.setSessionForSender).not.toHaveBeenCalled();
    });
  });

  describe('set-enabled propagates to bridge', () => {
    it('should call bridge setEnabled after connect', async () => {
      // First, connect to create the bridge (which sets it via setActiveWhatsAppBridge)
      const connectHandler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await connectHandler({ sender: mockSender });

      // Now set-enabled should propagate to the bridge via getActiveWhatsAppBridge
      storageMethods.getMessagingConfig.mockReturnValueOnce({
        providerId: 'whatsapp',
        enabled: true,
        status: 'connected',
      });

      await invokeHandler('integrations:whatsapp:set-enabled', false);

      expect(MockTaskBridgeInstance.setEnabled).toHaveBeenCalledWith(false);
    });

    it('should not throw when no bridge exists and set-enabled is called', async () => {
      storageMethods.getMessagingConfig.mockReturnValueOnce({
        providerId: 'whatsapp',
        enabled: true,
        status: 'connected',
      });

      // Reset the active bridge to null
      mockSetActiveBridge(null);

      // set-enabled without prior connect should not throw
      await expect(invokeHandler('integrations:whatsapp:set-enabled', true)).resolves.not.toThrow();
    });
  });

  describe('disconnect cleans up bridge', () => {
    it('should dispose service and bridge on disconnect after connect', async () => {
      // Connect first to create the bridge
      const connectHandler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await connectHandler({ sender: mockSender });

      // Now disconnect — disposeWhatsAppService handles both service and bridge cleanup
      await invokeHandler('integrations:whatsapp:disconnect');

      expect(mockDispose).toHaveBeenCalled();
    });

    it('should set bridge reference to null after disconnect', async () => {
      // Connect first
      const connectHandler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await connectHandler({ sender: mockSender });

      // Disconnect — disposeWhatsAppService clears the bridge
      await invokeHandler('integrations:whatsapp:disconnect');

      // Calling set-enabled after disconnect should not call bridge.setEnabled
      // because the bridge reference should be null (disposeWhatsAppService sets it to null)
      MockTaskBridgeInstance.setEnabled.mockClear();
      storageMethods.getMessagingConfig.mockReturnValueOnce({
        providerId: 'whatsapp',
        enabled: true,
        status: 'connected',
      });
      await invokeHandler('integrations:whatsapp:set-enabled', false);

      expect(MockTaskBridgeInstance.setEnabled).not.toHaveBeenCalled();
    });
  });

  describe('onError sends generic error message', () => {
    it('should send a generic error message without leaking raw error details', async () => {
      let capturedCallbacks: Record<string, Function> = {};
      mockTaskManager.startTask.mockImplementation((_id: string, _config: unknown, callbacks: Record<string, Function>) => {
        capturedCallbacks = callbacks;
        return Promise.resolve({ id: _id, status: 'running', prompt: '', createdAt: new Date().toISOString(), messages: [] });
      });

      const connectHandler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await connectHandler({ sender: mockSender });

      // The mock constructor captured the onTaskRequest callback
      expect(capturedOnTaskRequest.fn).not.toBeNull();

      // Invoke the onTaskRequest to trigger task creation and capture callbacks
      await capturedOnTaskRequest.fn!('sender123@s.whatsapp.net', 'TestUser', 'hello');

      expect(mockTaskManager.startTask).toHaveBeenCalled();

      // Now invoke the onError callback with a sensitive error
      const sensitiveError = new Error('Sensitive internal database error: connection refused at 192.168.1.1');
      capturedCallbacks.onError(sensitiveError);

      // The handler should send a generic message, NOT the raw error message
      expect(mockService.sendMessage).toHaveBeenCalledWith(
        'sender123@s.whatsapp.net',
        'Sorry, the task encountered an error. Please try again.',
      );
      expect(mockService.sendMessage).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Sensitive internal database error'),
      );
    });

    it('should send a generic message when startTask itself throws', async () => {
      mockTaskManager.startTask.mockRejectedValueOnce(
        new Error('DB_CONNECTION_REFUSED: secret host 10.0.0.5'),
      );

      const connectHandler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await connectHandler({ sender: mockSender });

      expect(capturedOnTaskRequest.fn).not.toBeNull();

      // Invoke the onTaskRequest — startTask will reject
      await capturedOnTaskRequest.fn!('sender456@s.whatsapp.net', undefined, 'run something');

      // The catch block should send a generic message
      expect(mockService.sendMessage).toHaveBeenCalledWith(
        'sender456@s.whatsapp.net',
        'Sorry, I could not process your request.',
      );
      expect(mockService.sendMessage).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('DB_CONNECTION_REFUSED'),
      );
    });
  });

  describe('onBatchedMessages forwards agent response as WhatsApp reply', () => {
    it('should send last assistant content instead of generic success message', async () => {
      let capturedCallbacks: Record<string, Function> = {};
      mockTaskManager.startTask.mockImplementation((_id: string, _config: unknown, callbacks: Record<string, Function>) => {
        capturedCallbacks = callbacks;
        return Promise.resolve({ id: _id, status: 'running', prompt: '', createdAt: new Date().toISOString(), messages: [] });
      });

      const connectHandler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await connectHandler({ sender: mockSender });

      await capturedOnTaskRequest.fn!('owner@s.whatsapp.net', 'Owner', 'What is 2+2?');

      // Simulate agent sending batched messages with assistant content
      capturedCallbacks.onBatchedMessages([
        { id: 'msg-1', type: 'tool', content: 'Using tool: bash', timestamp: new Date().toISOString() },
        { id: 'msg-2', type: 'assistant', content: '2 + 2 = 4', timestamp: new Date().toISOString() },
      ]);

      capturedCallbacks.onComplete({ status: 'success' });

      expect(mockService.sendMessage).toHaveBeenCalledWith(
        'owner@s.whatsapp.net',
        '2 + 2 = 4',
      );
    });

    it('should use last assistant message when multiple batches arrive', async () => {
      let capturedCallbacks: Record<string, Function> = {};
      mockTaskManager.startTask.mockImplementation((_id: string, _config: unknown, callbacks: Record<string, Function>) => {
        capturedCallbacks = callbacks;
        return Promise.resolve({ id: _id, status: 'running', prompt: '', createdAt: new Date().toISOString(), messages: [] });
      });

      const connectHandler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await connectHandler({ sender: mockSender });

      await capturedOnTaskRequest.fn!('owner@s.whatsapp.net', 'Owner', 'Hello');

      // First batch with initial response
      capturedCallbacks.onBatchedMessages([
        { id: 'msg-1', type: 'assistant', content: 'Thinking...', timestamp: new Date().toISOString() },
      ]);
      // Second batch with final response
      capturedCallbacks.onBatchedMessages([
        { id: 'msg-2', type: 'assistant', content: 'Hello! How can I help?', timestamp: new Date().toISOString() },
      ]);

      capturedCallbacks.onComplete({ status: 'success' });

      expect(mockService.sendMessage).toHaveBeenCalledWith(
        'owner@s.whatsapp.net',
        'Hello! How can I help?',
      );
    });

    it('should fall back to generic message when no assistant content received', async () => {
      let capturedCallbacks: Record<string, Function> = {};
      mockTaskManager.startTask.mockImplementation((_id: string, _config: unknown, callbacks: Record<string, Function>) => {
        capturedCallbacks = callbacks;
        return Promise.resolve({ id: _id, status: 'running', prompt: '', createdAt: new Date().toISOString(), messages: [] });
      });

      const connectHandler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await connectHandler({ sender: mockSender });

      await capturedOnTaskRequest.fn!('owner@s.whatsapp.net', 'Owner', 'run task');

      // Only tool messages, no assistant content
      capturedCallbacks.onBatchedMessages([
        { id: 'msg-1', type: 'tool', content: 'Using bash', timestamp: new Date().toISOString() },
      ]);

      capturedCallbacks.onComplete({ status: 'success' });

      expect(mockService.sendMessage).toHaveBeenCalledWith(
        'owner@s.whatsapp.net',
        'Task completed successfully.',
      );
    });
  });

  describe('onComplete sends result message and clears active task', () => {
    it('should send success message and clear active task on successful completion', async () => {
      let capturedCallbacks: Record<string, Function> = {};
      mockTaskManager.startTask.mockImplementation((_id: string, _config: unknown, callbacks: Record<string, Function>) => {
        capturedCallbacks = callbacks;
        return Promise.resolve({ id: _id, status: 'running', prompt: '', createdAt: new Date().toISOString(), messages: [] });
      });

      const connectHandler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await connectHandler({ sender: mockSender });

      await capturedOnTaskRequest.fn!('owner@s.whatsapp.net', 'Owner', 'run task');

      capturedCallbacks.onComplete({ status: 'success' });

      expect(mockService.sendMessage).toHaveBeenCalledWith(
        'owner@s.whatsapp.net',
        'Task completed successfully.',
      );
      expect(MockTaskBridgeInstance.clearActiveTask).toHaveBeenCalledWith('owner@s.whatsapp.net');
    });

    it('should send status message for non-success results', async () => {
      let capturedCallbacks: Record<string, Function> = {};
      mockTaskManager.startTask.mockImplementation((_id: string, _config: unknown, callbacks: Record<string, Function>) => {
        capturedCallbacks = callbacks;
        return Promise.resolve({ id: _id, status: 'running', prompt: '', createdAt: new Date().toISOString(), messages: [] });
      });

      const connectHandler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await connectHandler({ sender: mockSender });

      await capturedOnTaskRequest.fn!('owner@s.whatsapp.net', undefined, 'run task');

      capturedCallbacks.onComplete({ status: 'cancelled' });

      expect(mockService.sendMessage).toHaveBeenCalledWith(
        'owner@s.whatsapp.net',
        'Task finished with status: cancelled',
      );
      expect(MockTaskBridgeInstance.clearActiveTask).toHaveBeenCalledWith('owner@s.whatsapp.net');
    });
  });

  describe('onError clears active task', () => {
    it('should clear active task when error callback fires', async () => {
      let capturedCallbacks: Record<string, Function> = {};
      mockTaskManager.startTask.mockImplementation((_id: string, _config: unknown, callbacks: Record<string, Function>) => {
        capturedCallbacks = callbacks;
        return Promise.resolve({ id: _id, status: 'running', prompt: '', createdAt: new Date().toISOString(), messages: [] });
      });

      const connectHandler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
      const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
      await connectHandler({ sender: mockSender });

      await capturedOnTaskRequest.fn!('owner@s.whatsapp.net', 'Owner', 'run task');

      capturedCallbacks.onError(new Error('something failed'));

      expect(MockTaskBridgeInstance.clearActiveTask).toHaveBeenCalledWith('owner@s.whatsapp.net');
    });
  });

    describe('onPermissionRequest sends denial message', () => {
      it('should send a denial message when a permission request arrives', async () => {
        let capturedCallbacks: Record<string, Function> = {};
        mockTaskManager.startTask.mockImplementation((_id: string, _config: unknown, callbacks: Record<string, Function>) => {
          capturedCallbacks = callbacks;
          return Promise.resolve({ id: _id, status: 'running', prompt: '', createdAt: new Date().toISOString(), messages: [] });
        });
        mockTaskManager.sendResponse.mockResolvedValue(undefined);

        const connectHandler = mockedIpcMain._getHandler('integrations:whatsapp:connect')!;
        const mockSender = { send: vi.fn(), isDestroyed: vi.fn(() => false) };
        await connectHandler({ sender: mockSender });

        expect(capturedOnTaskRequest.fn).not.toBeNull();

        // Trigger task creation to capture callbacks
        await capturedOnTaskRequest.fn!('sender789@s.whatsapp.net', 'Alice', 'do something risky');

        expect(capturedCallbacks.onPermissionRequest).toBeDefined();

        // Fire the permission request callback
        capturedCallbacks.onPermissionRequest();

        // It should send a denial message (not be a no-op)
        expect(mockService.sendMessage).toHaveBeenCalledWith(
          'sender789@s.whatsapp.net',
          'Task requires a permission that cannot be auto-approved. It has been denied for safety.',
        );
        expect(mockTaskManager.sendResponse).toHaveBeenCalledWith(expect.any(String), 'no');
      });
    });
});
