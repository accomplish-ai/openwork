import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const {
  mockTaskManager,
  mockCreateTaskManager,
  getCapturedTaskManagerOptions,
  resetCapturedTaskManagerOptions,
  mockBuildCliArgs,
  mockBuildOpenCodeEnvironment,
  mockResolveCliPath,
  mockIsCliAvailable,
  mockEnsureDevBrowserServer,
  mockGenerateConfig,
  mockBuildProviderConfigs,
  mockSyncApiKeysToOpenCodeAuth,
  mockGetOpenCodeAuthPath,
  mockGetBundledNodePaths,
} = vi.hoisted(() => {
  const manager = {
    startTask: vi.fn(),
    cancelTask: vi.fn(),
    cancelQueuedTask: vi.fn(),
    interruptTask: vi.fn(),
    isTaskQueued: vi.fn(),
    hasActiveTask: vi.fn(),
    getActiveTaskId: vi.fn(),
    getActiveTaskCount: vi.fn(),
    getSessionId: vi.fn(),
    sendResponse: vi.fn(),
    dispose: vi.fn(),
  };

  let capturedOptions: Record<string, unknown> | null = null;

  return {
    mockTaskManager: manager,
    mockCreateTaskManager: vi.fn((options: Record<string, unknown>) => {
      capturedOptions = options;
      return manager;
    }),
    getCapturedTaskManagerOptions: () => capturedOptions,
    resetCapturedTaskManagerOptions: () => {
      capturedOptions = null;
    },
    mockBuildCliArgs: vi.fn(() => ['--mock-cli-arg']),
    mockBuildOpenCodeEnvironment: vi.fn((env: Record<string, unknown>) => env),
    mockResolveCliPath: vi.fn(() => null),
    mockIsCliAvailable: vi.fn(() => true),
    mockEnsureDevBrowserServer: vi.fn(() => Promise.resolve()),
    mockGenerateConfig: vi.fn(() => ({ configPath: '/tmp/opencode/generated.json' })),
    mockBuildProviderConfigs: vi.fn(async () => ({
      providerConfigs: [],
      enabledProviders: [],
      modelOverride: undefined,
    })),
    mockSyncApiKeysToOpenCodeAuth: vi.fn(async () => {}),
    mockGetOpenCodeAuthPath: vi.fn(() => '/tmp/opencode/auth.json'),
    mockGetBundledNodePaths: vi.fn(() => null),
  };
});

vi.mock('@accomplish_ai/agent-core', () => ({
  createTaskManager: mockCreateTaskManager,
  createTaskId: vi.fn(() => 'generated-task-id'),
  createMessageId: vi.fn(() => 'generated-msg-id'),
  validateTaskConfig: vi.fn((config: Record<string, unknown>) => ({ ...config })),
  mapResultToStatus: vi.fn(() => 'completed'),
  generateTaskSummary: vi.fn(() => Promise.resolve('summary')),
  getModelDisplayName: vi.fn(() => 'Mock Model'),
  ensureDevBrowserServer: mockEnsureDevBrowserServer,
  resolveCliPath: mockResolveCliPath,
  isCliAvailable: mockIsCliAvailable,
  buildCliArgs: mockBuildCliArgs,
  buildOpenCodeEnvironment: mockBuildOpenCodeEnvironment,
  generateConfig: mockGenerateConfig,
  buildProviderConfigs: mockBuildProviderConfigs,
  syncApiKeysToOpenCodeAuth: mockSyncApiKeysToOpenCodeAuth,
  getOpenCodeAuthPath: mockGetOpenCodeAuthPath,
  getBundledNodePaths: mockGetBundledNodePaths,
  DEV_BROWSER_PORT: 9224,
}));

vi.mock('node:os', () => ({
  tmpdir: () => '/tmp',
  homedir: () => '/home/testuser',
}));

import { TaskService } from '../../src/task-service.js';

function createMockStorage() {
  return {
    getActiveProviderModel: vi.fn(() => null),
    getSelectedModel: vi.fn(() => null),
    saveTask: vi.fn(),
    getTask: vi.fn(),
    getTasks: vi.fn(() => []),
    addTaskMessage: vi.fn(),
    updateTaskStatus: vi.fn(),
    updateTaskSummary: vi.fn(),
    updateTaskSessionId: vi.fn(),
    clearTodosForTask: vi.fn(),
    saveTodosForTask: vi.fn(),
    getApiKey: vi.fn(() => null),
    getAllApiKeys: vi.fn(async () => ({})),
    getBedrockCredentials: vi.fn(() => null),
    deleteTask: vi.fn(),
    clearHistory: vi.fn(),
    getTodosForTask: vi.fn(() => []),
  };
}

describe('TaskService internal wiring', () => {
  let service: TaskService;
  let mockStorage: ReturnType<typeof createMockStorage>;
  let originalPermissionPort: string | undefined;
  let originalQuestionPort: string | undefined;
  let originalAuthToken: string | undefined;
  let originalOpenCodeConfig: string | undefined;
  let originalOpenCodeConfigDir: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCapturedTaskManagerOptions();
    mockStorage = createMockStorage();
    service = new TaskService(mockStorage as never, {
      userDataPath: '/user-data',
      mcpToolsPath: '/mcp-tools',
      isPackaged: true,
      resourcesPath: '/resources',
      appPath: '/app',
    });

    originalPermissionPort = process.env.ACCOMPLISH_PERMISSION_API_PORT;
    originalQuestionPort = process.env.ACCOMPLISH_QUESTION_API_PORT;
    originalAuthToken = process.env.ACCOMPLISH_DAEMON_AUTH_TOKEN;
    originalOpenCodeConfig = process.env.OPENCODE_CONFIG;
    originalOpenCodeConfigDir = process.env.OPENCODE_CONFIG_DIR;
  });

  afterEach(() => {
    if (originalPermissionPort === undefined) {
      delete process.env.ACCOMPLISH_PERMISSION_API_PORT;
    } else {
      process.env.ACCOMPLISH_PERMISSION_API_PORT = originalPermissionPort;
    }

    if (originalQuestionPort === undefined) {
      delete process.env.ACCOMPLISH_QUESTION_API_PORT;
    } else {
      process.env.ACCOMPLISH_QUESTION_API_PORT = originalQuestionPort;
    }

    if (originalAuthToken === undefined) {
      delete process.env.ACCOMPLISH_DAEMON_AUTH_TOKEN;
    } else {
      process.env.ACCOMPLISH_DAEMON_AUTH_TOKEN = originalAuthToken;
    }

    if (originalOpenCodeConfig === undefined) {
      delete process.env.OPENCODE_CONFIG;
    } else {
      process.env.OPENCODE_CONFIG = originalOpenCodeConfig;
    }

    if (originalOpenCodeConfigDir === undefined) {
      delete process.env.OPENCODE_CONFIG_DIR;
    } else {
      process.env.OPENCODE_CONFIG_DIR = originalOpenCodeConfigDir;
    }
  });

  it('should configure task manager with expected defaults', () => {
    const options = getCapturedTaskManagerOptions() as {
      defaultWorkingDirectory: string;
      maxConcurrentTasks: number;
      adapterOptions: {
        isPackaged: boolean;
        tempPath: string;
      };
    };

    expect(mockCreateTaskManager).toHaveBeenCalledTimes(1);
    expect(options.defaultWorkingDirectory).toBe('/home/testuser');
    expect(options.maxConcurrentTasks).toBe(10);
    expect(options.adapterOptions.isPackaged).toBe(true);
    expect(options.adapterOptions.tempPath).toBe('/tmp');
  });

  it('should use resolved CLI path when available', () => {
    mockResolveCliPath.mockReturnValueOnce({ cliPath: '/custom/opencode' });
    const options = getCapturedTaskManagerOptions() as {
      adapterOptions: {
        getCliCommand: () => { command: string; args: string[] };
      };
    };

    const command = options.adapterOptions.getCliCommand();

    expect(command).toEqual({ command: '/custom/opencode', args: [] });
    expect(mockResolveCliPath).toHaveBeenCalledWith({
      isPackaged: true,
      resourcesPath: '/resources',
      appPath: '/app',
    });
  });

  it('should fall back to global opencode command when resolver returns null', () => {
    const options = getCapturedTaskManagerOptions() as {
      adapterOptions: {
        getCliCommand: () => { command: string; args: string[] };
      };
    };

    const command = options.adapterOptions.getCliCommand();

    expect(command).toEqual({ command: 'opencode', args: [] });
  });

  it('should build environment with ollama host from active model', async () => {
    mockStorage.getAllApiKeys.mockResolvedValue({ anthropic: 'a-key' });
    mockStorage.getActiveProviderModel.mockReturnValue({
      provider: 'ollama',
      model: 'ollama/mistral',
      baseUrl: 'http://localhost:11434',
    });

    const options = getCapturedTaskManagerOptions() as {
      adapterOptions: {
        buildEnvironment: (taskId: string) => Promise<NodeJS.ProcessEnv>;
      };
    };

    await options.adapterOptions.buildEnvironment('task-1');

    expect(mockBuildOpenCodeEnvironment).toHaveBeenCalledWith(
      expect.any(Object),
      {
        apiKeys: { anthropic: 'a-key' },
        bedrockCredentials: undefined,
        taskId: 'task-1',
        ollamaHost: 'http://localhost:11434',
      },
    );
  });

  it('should fall back to selected model for ollama host when active provider is not ollama', async () => {
    mockStorage.getActiveProviderModel.mockReturnValue({
      provider: 'anthropic',
      model: 'claude',
    });
    mockStorage.getSelectedModel.mockReturnValue({
      provider: 'ollama',
      model: 'ollama/llama3',
      baseUrl: 'http://localhost:11435',
    });

    const options = getCapturedTaskManagerOptions() as {
      adapterOptions: {
        buildEnvironment: (taskId: string) => Promise<NodeJS.ProcessEnv>;
      };
    };

    await options.adapterOptions.buildEnvironment('task-2');

    expect(mockBuildOpenCodeEnvironment).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        taskId: 'task-2',
        ollamaHost: 'http://localhost:11435',
      }),
    );
  });

  it('should build CLI args using active provider model first', async () => {
    mockStorage.getActiveProviderModel.mockReturnValue({
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
    });
    mockStorage.getSelectedModel.mockReturnValue({
      provider: 'openai',
      model: 'gpt-4o',
    });

    const options = getCapturedTaskManagerOptions() as {
      adapterOptions: {
        buildCliArgs: (config: { prompt: string; sessionId?: string }, taskId: string) => Promise<string[]>;
      };
    };

    await options.adapterOptions.buildCliArgs(
      { prompt: 'hello', sessionId: 'session-1' },
      'task-1',
    );

    expect(mockBuildCliArgs).toHaveBeenCalledWith({
      prompt: 'hello',
      sessionId: 'session-1',
      selectedModel: {
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
      },
    });
  });

  it('should delegate CLI availability check with resolver config', async () => {
    mockIsCliAvailable.mockReturnValueOnce(false);

    const options = getCapturedTaskManagerOptions() as {
      isCliAvailable: () => Promise<boolean>;
    };

    const available = await options.isCliAvailable();

    expect(available).toBe(false);
    expect(mockIsCliAvailable).toHaveBeenCalledWith({
      isPackaged: true,
      resourcesPath: '/resources',
      appPath: '/app',
    });
  });

  it('should run onBeforeStart and set OpenCode env vars', async () => {
    process.env.ACCOMPLISH_PERMISSION_API_PORT = '9001';
    process.env.ACCOMPLISH_QUESTION_API_PORT = '9002';
    process.env.ACCOMPLISH_DAEMON_AUTH_TOKEN = 'daemon-token';

    mockStorage.getAllApiKeys.mockResolvedValue({ deepseek: 'key-1' });
    mockBuildProviderConfigs.mockResolvedValue({
      providerConfigs: [{ id: 'openrouter', options: {} }],
      enabledProviders: ['openrouter'],
      modelOverride: { model: 'openrouter/model-a', smallModel: 'openrouter/model-b' },
    });
    mockGenerateConfig.mockReturnValue({
      configPath: '/tmp/opencode/generated.json',
    });
    mockGetBundledNodePaths.mockReturnValue({
      binDir: '/bundled/node/bin',
    });

    const options = getCapturedTaskManagerOptions() as {
      adapterOptions: {
        onBeforeStart: () => Promise<void>;
      };
    };

    await options.adapterOptions.onBeforeStart();

    expect(mockGetOpenCodeAuthPath).toHaveBeenCalled();
    expect(mockSyncApiKeysToOpenCodeAuth).toHaveBeenCalledWith(
      '/tmp/opencode/auth.json',
      { deepseek: 'key-1' },
    );
    expect(mockBuildProviderConfigs).toHaveBeenCalledWith({
      getApiKey: expect.any(Function),
    });

    const getApiKey = mockBuildProviderConfigs.mock.calls[0][0].getApiKey as (provider: string) => string | null;
    mockStorage.getApiKey.mockReturnValue('provider-key');
    expect(getApiKey('anthropic')).toBe('provider-key');
    expect(mockStorage.getApiKey).toHaveBeenCalledWith('anthropic');

    expect(mockGenerateConfig).toHaveBeenCalledWith({
      platform: process.platform,
      mcpToolsPath: '/mcp-tools',
      userDataPath: '/user-data',
      isPackaged: true,
      bundledNodeBinPath: '/bundled/node/bin',
      providerConfigs: [{ id: 'openrouter', options: {} }],
      enabledProviders: ['openrouter'],
      permissionApiPort: 9001,
      questionApiPort: 9002,
      authToken: 'daemon-token',
      model: 'openrouter/model-a',
      smallModel: 'openrouter/model-b',
    });
    expect(process.env.OPENCODE_CONFIG).toBe('/tmp/opencode/generated.json');
    expect(process.env.OPENCODE_CONFIG_DIR).toBe('/tmp/opencode');
  });

  it('should start browser server and emit progress for first task', async () => {
    mockGetBundledNodePaths.mockReturnValue({
      binDir: '/bundled/node/bin',
    });

    const progressHandler = vi.fn();
    const options = getCapturedTaskManagerOptions() as {
      onBeforeTaskStart: (
        callbacks: { onProgress: (progress: { stage: string; message?: string; isFirstTask?: boolean }) => void },
        isFirst: boolean
      ) => Promise<void>;
    };

    await options.onBeforeTaskStart({ onProgress: progressHandler }, true);

    expect(progressHandler).toHaveBeenCalledWith({
      stage: 'browser',
      message: 'Preparing browser...',
      isFirstTask: true,
    });
    expect(mockEnsureDevBrowserServer).toHaveBeenCalledWith(
      {
        mcpToolsPath: '/mcp-tools',
        bundledNodeBinPath: '/bundled/node/bin',
        devBrowserPort: 9224,
      },
      progressHandler,
    );
  });
});
