/**
 * Unit tests for Screencast IPC handlers
 *
 * Tests the browser live-view IPC handlers:
 * - browser:start-screencast
 * - browser:stop-screencast
 *
 * Verifies WebSocket lifecycle, cleanup, error handling,
 * and idempotency to prevent memory leaks and duplicate streams.
 *
 * @module __tests__/unit/main/ipc/handlers.screencast.unit.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// ── Mock WebSocket (class-based, usable with `new`) ─────────────────────

type WsListener = (...args: unknown[]) => void;

interface MockWsInstance {
  url: string;
  on: Mock;
  close: Mock;
  send: Mock;
  listeners: Record<string, WsListener>;
  emit(event: string, ...args: unknown[]): void;
}

/** All mock WebSocket instances created during the current test */
const wsInstances: MockWsInstance[] = [];

/**
 * A real ES class that can be used with `new`.
 * `handlers.ts` line 1250 does `new WsDefault(url)`, so
 * vi.fn(() => plain-object) won't work – arrow functions
 * are not constructors.
 */
class FakeWebSocket {
  url: string;
  on: Mock;
  close: Mock;
  send: Mock;
  listeners: Record<string, WsListener>;

  constructor(url: string) {
    this.url = url;
    this.listeners = {};
    this.on = vi.fn((event: string, cb: WsListener) => {
      this.listeners[event] = cb;
    });
    this.close = vi.fn();
    this.send = vi.fn();
    wsInstances.push(this as unknown as MockWsInstance);
  }

  /** Fire a listener registered via `.on()` */
  emit(event: string, ...args: unknown[]): void {
    this.listeners[event]?.(...args);
  }
}

vi.mock('ws', () => ({
  default: FakeWebSocket,
}));

// ── Mock Electron ───────────────────────────────────────────────────────

const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mockHandlers.set(channel, handler);
    }),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
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
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  nativeTheme: { themeSource: 'system', shouldUseDarkColors: false, on: vi.fn(), off: vi.fn() },
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp/test-app') },
}));

// ── Mock opencode ───────────────────────────────────────────────────────

vi.mock('@main/opencode', () => ({
  getTaskManager: vi.fn(() => ({
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
  })),
  disposeTaskManager: vi.fn(),
  isOpenCodeCliInstalled: vi.fn(() => Promise.resolve(true)),
  getOpenCodeCliVersion: vi.fn(() => Promise.resolve('1.0.0')),
  cleanupVertexServiceAccountKey: vi.fn(),
}));

vi.mock('@main/opencode/auth-browser', () => ({
  loginOpenAiWithChatGpt: vi.fn(() => Promise.resolve({ openedUrl: undefined })),
}));

// ── Mock storage ────────────────────────────────────────────────────────

vi.mock('@main/store/storage', () => ({
  getStorage: vi.fn(() => ({
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
    deleteApiKey: vi.fn(),
    getAllApiKeys: vi.fn(() => Promise.resolve({})),
    storeBedrockCredentials: vi.fn(),
    getBedrockCredentials: vi.fn(() => null),
    hasAnyApiKey: vi.fn(() => Promise.resolve(false)),
    listStoredCredentials: vi.fn(() => []),
    clearSecureStorage: vi.fn(),
    getTheme: vi.fn(() => 'system'),
    setTheme: vi.fn(),
    getAllConnectors: vi.fn(() => []),
    addConnector: vi.fn(),
    deleteConnector: vi.fn(),
    setConnectorEnabled: vi.fn(),
    getConnector: vi.fn(() => null),
    updateConnector: vi.fn(),
  })),
}));

// ── Mock agent-core ─────────────────────────────────────────────────────

vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@accomplish_ai/agent-core')>();
  return {
    validateApiKey: vi.fn(() => Promise.resolve({ valid: true })),
    validateBedrockCredentials: vi.fn(() => Promise.resolve({ valid: true })),
    fetchBedrockModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    validateAzureFoundry: vi.fn(() => Promise.resolve({ valid: true })),
    testAzureFoundryConnection: vi.fn(() => Promise.resolve({ success: true })),
    fetchOpenRouterModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    fetchProviderModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    testLiteLLMConnection: vi.fn(() => Promise.resolve({ success: true })),
    fetchLiteLLMModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    validateHttpUrl: actual.validateHttpUrl,
    sanitizeString: vi.fn((input: unknown, _fieldName: string, _maxLength = 255) => {
      if (typeof input !== 'string') throw new Error('must be a string');
      return input.trim();
    }),
    generateTaskSummary: vi.fn(() => Promise.resolve('Mock summary')),
    validateTaskConfig: actual.validateTaskConfig,
    createTaskId: vi.fn(() => `task_${Date.now()}`),
    createMessageId: vi.fn(() => `msg-${Date.now()}`),
    testOllamaConnection: vi.fn(() => Promise.resolve({ success: true })),
    testLMStudioConnection: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    fetchLMStudioModels: vi.fn(() => Promise.resolve({ success: true, models: [] })),
    validateLMStudioConfig: vi.fn(),
    getOpenAiOauthStatus: vi.fn(() => ({ connected: false })),
    discoverOAuthMetadata: vi.fn(),
    registerOAuthClient: vi.fn(),
    generatePkceChallenge: vi.fn(),
    buildAuthorizationUrl: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
    DEFAULT_PROVIDERS: actual.DEFAULT_PROVIDERS,
    ALLOWED_API_KEY_PROVIDERS: actual.ALLOWED_API_KEY_PROVIDERS,
    STANDARD_VALIDATION_PROVIDERS: actual.STANDARD_VALIDATION_PROVIDERS,
    ZAI_ENDPOINTS: actual.ZAI_ENDPOINTS ?? {},
    DEV_BROWSER_PORT: 9224,
    validate: actual.validate,
    permissionResponseSchema: actual.permissionResponseSchema,
    taskConfigSchema: actual.taskConfigSchema,
    resumeSessionSchema: actual.resumeSessionSchema,
    getAzureEntraToken: vi.fn(() => Promise.resolve({ success: true, token: 'mock' })),
  };
});

vi.mock('@accomplish_ai/agent-core/common', () => ({
  DEV_BROWSER_PORT: 9224,
}));

// ── Mock remaining dependencies ─────────────────────────────────────────

vi.mock('@main/store/secureStorage', () => ({
  storeApiKey: vi.fn(),
  getApiKey: vi.fn(() => null),
  deleteApiKey: vi.fn(),
  getAllApiKeys: vi.fn(() => Promise.resolve({})),
  hasAnyApiKey: vi.fn(() => Promise.resolve(false)),
  getBedrockCredentials: vi.fn(() => null),
}));

vi.mock('@main/permission-api', () => ({
  startPermissionApiServer: vi.fn(),
  startQuestionApiServer: vi.fn(),
  initPermissionApi: vi.fn(),
  resolvePermission: vi.fn(() => false),
  resolveQuestion: vi.fn(() => true),
  isFilePermissionRequest: vi.fn(() => false),
  isQuestionRequest: vi.fn(() => false),
}));

vi.mock('@main/ipc/validation', () => ({
  normalizeIpcError: vi.fn((err: Error) => err),
  validate: vi.fn((_schema: unknown, data: unknown) => data),
  permissionResponseSchema: {},
}));

vi.mock('@main/ipc/task-callbacks', () => ({
  createTaskCallbacks: vi.fn(() => ({})),
}));

vi.mock('@main/test-utils/mock-task-flow', () => ({
  isMockTaskEventsEnabled: vi.fn(() => false),
  createMockTask: vi.fn(),
  executeMockTaskFlow: vi.fn(),
  detectScenarioFromPrompt: vi.fn(),
}));

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

vi.mock('@main/providers', () => ({
  registerVertexHandlers: vi.fn(),
}));

vi.mock('@main/logging', () => ({
  getLogCollector: vi.fn(() => ({
    addLog: vi.fn(),
    getLogs: vi.fn(() => []),
    exportLogs: vi.fn(() => Promise.resolve({ success: true, path: '/tmp/logs.txt' })),
  })),
}));

vi.mock('@main/services/speechToText', () => ({
  validateElevenLabsApiKey: vi.fn(() => Promise.resolve({ valid: true })),
  transcribeAudio: vi.fn(() => Promise.resolve({ success: true, result: { text: '' } })),
  isElevenLabsConfigured: vi.fn(() => false),
}));

vi.mock('@main/config', () => ({
  getDesktopConfig: vi.fn(() => ({})),
}));

// ── Mock global fetch ───────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Import handler registration (after all mocks) ───────────────────────

import { registerIPCHandlers } from '@main/ipc/handlers';

// ── Test helpers ────────────────────────────────────────────────────────

function createMockEvent() {
  return {
    sender: {
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
    },
  };
}

async function invokeHandler(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = mockHandlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  return handler(createMockEvent(), ...args);
}

async function invokeHandlerWithEvent(
  channel: string,
  event: ReturnType<typeof createMockEvent>,
  ...args: unknown[]
): Promise<unknown> {
  const handler = mockHandlers.get(channel);
  if (!handler) {
    throw new Error(`No handler registered for channel: ${channel}`);
  }
  return handler(event, ...args);
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Screencast IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandlers.clear();
    wsInstances.length = 0;

    // Default: the screencast HTTP start endpoint succeeds
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    registerIPCHandlers();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── browser:start-screencast ────────────────────────────────────────

  describe('browser:start-screencast', () => {
    it('should register the handler', () => {
      expect(mockHandlers.has('browser:start-screencast')).toBe(true);
    });

    it('should POST to the dev-browser start endpoint with pageName', async () => {
      await invokeHandler('browser:start-screencast', 'test-page');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9224/screencast/start',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageName: 'test-page' }),
        }),
      );
    });

    it('should create a WebSocket to the correct ws:// URL', async () => {
      await invokeHandler('browser:start-screencast', 'my-page');

      expect(wsInstances).toHaveLength(1);
      expect(wsInstances[0].url).toBe('ws://127.0.0.1:9224/screencast/ws');
    });

    it('should register message, close, and error listeners on the WebSocket', async () => {
      await invokeHandler('browser:start-screencast', 'my-page');

      const ws = wsInstances[0];
      expect(ws.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should throw when the start endpoint returns an error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Page not found' }),
      });

      await expect(invokeHandler('browser:start-screencast', 'bad-page')).rejects.toThrow(
        'Failed to start screencast: Page not found',
      );

      // No WebSocket should have been created
      expect(wsInstances).toHaveLength(0);
    });

    it('should forward frame messages to the renderer via IPC', async () => {
      const event = createMockEvent();
      await invokeHandlerWithEvent('browser:start-screencast', event, 'test-page');

      const ws = wsInstances[0];

      // Simulate a frame message from the dev-browser
      const framePayload = JSON.stringify({
        type: 'frame',
        data: 'base64imagedata',
        pageUrl: 'https://example.com',
        timestamp: 1000,
      });
      ws.emit('message', Buffer.from(framePayload));

      expect(event.sender.send).toHaveBeenCalledWith('browser:frame', {
        data: 'base64imagedata',
        pageUrl: 'https://example.com',
        timestamp: 1000,
      });
    });

    it('should send idle status when WebSocket closes', async () => {
      const event = createMockEvent();
      await invokeHandlerWithEvent('browser:start-screencast', event, 'test-page');

      const ws = wsInstances[0];
      ws.emit('close');

      expect(event.sender.send).toHaveBeenCalledWith('browser:status', { status: 'idle' });
    });

    it('should send error status when WebSocket errors', async () => {
      const event = createMockEvent();
      await invokeHandlerWithEvent('browser:start-screencast', event, 'test-page');

      const ws = wsInstances[0];
      ws.emit('error', new Error('Connection refused'));

      expect(event.sender.send).toHaveBeenCalledWith('browser:status', {
        status: 'error',
        error: 'Connection refused',
      });
    });

    it('should close the WebSocket when sender is destroyed', async () => {
      const event = createMockEvent();
      await invokeHandlerWithEvent('browser:start-screencast', event, 'test-page');

      const ws = wsInstances[0];

      // Mark sender as destroyed
      event.sender.isDestroyed.mockReturnValue(true);

      // Simulate incoming message — should auto-close
      ws.emit('message', Buffer.from(JSON.stringify({ type: 'frame', data: 'x' })));

      expect(ws.close).toHaveBeenCalled();
    });
  });

  // ── browser:stop-screencast ──────────────────────────────────────────

  describe('browser:stop-screencast', () => {
    it('should register the handler', () => {
      expect(mockHandlers.has('browser:stop-screencast')).toBe(true);
    });

    it('should close the active WebSocket', async () => {
      // Start a screencast first
      await invokeHandler('browser:start-screencast', 'test-page');
      const ws = wsInstances[0];

      // Stop the screencast
      await invokeHandler('browser:stop-screencast');

      expect(ws.close).toHaveBeenCalled();
    });

    it('should POST to the dev-browser stop endpoint', async () => {
      await invokeHandler('browser:start-screencast', 'test-page');
      mockFetch.mockClear();

      await invokeHandler('browser:stop-screencast');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9224/screencast/stop',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should be safe to call when no screencast is active', async () => {
      await expect(invokeHandler('browser:stop-screencast')).resolves.not.toThrow();
    });

    it('should handle fetch errors gracefully when stopping', async () => {
      await invokeHandler('browser:start-screencast', 'test-page');
      mockFetch.mockRejectedValueOnce(new Error('Server not running'));

      // Should not throw even if the stop endpoint is unreachable
      await expect(invokeHandler('browser:stop-screencast')).resolves.not.toThrow();
    });
  });

  // ── Idempotency (memory leak prevention) ─────────────────────────────

  describe('idempotency (memory leak prevention)', () => {
    it('should close the previous WebSocket when start is called twice', async () => {
      // First start
      await invokeHandler('browser:start-screencast', 'page-1');
      const firstWs = wsInstances[0];

      // Second start — should close the first
      await invokeHandler('browser:start-screencast', 'page-2');

      expect(firstWs.close).toHaveBeenCalled();
      expect(wsInstances).toHaveLength(2);
    });

    it('should send different pageName for each start call', async () => {
      await invokeHandler('browser:start-screencast', 'page-1');
      await invokeHandler('browser:start-screencast', 'page-2');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9224/screencast/start',
        expect.objectContaining({ body: JSON.stringify({ pageName: 'page-1' }) }),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9224/screencast/start',
        expect.objectContaining({ body: JSON.stringify({ pageName: 'page-2' }) }),
      );
    });

    it('should not leak after start-stop-start cycle', async () => {
      // Start → Stop → Start
      await invokeHandler('browser:start-screencast', 'page-1');
      const firstWs = wsInstances[0];
      await invokeHandler('browser:stop-screencast');
      await invokeHandler('browser:start-screencast', 'page-2');

      expect(firstWs.close).toHaveBeenCalled();
      expect(wsInstances).toHaveLength(2);
    });
  });
});
