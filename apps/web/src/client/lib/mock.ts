import { Task, ProviderSettings, TaskMessage } from '@accomplish_ai/agent-core/common';

export function setupMockAccomplish() {
  if (typeof window === 'undefined') return;

  // Only mock if not already present (i.e., not running in Electron)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).accomplish) return;

  console.log('Setting up mock Accomplish API for browser development');

  // Mock Data
  const mockTask: Task = {
    id: 'mock-task-1',
    prompt: 'Research about AI agents',
    status: 'running',
    messages: [
      {
        id: 'msg-1',
        type: 'user',
        content: 'Research about AI agents',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-2',
        type: 'assistant',
        content: 'I will start researching AI agents for you.',
        timestamp: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  };

  const mockProviderSettings: ProviderSettings = {
    activeProviderId: 'openai',
    debugMode: true,
    connectedProviders: {
      openai: {
        providerId: 'openai',
        connectionStatus: 'connected',
        selectedModelId: 'gpt-4o',
        credentials: { type: 'api_key', keyPrefix: 'sk-...' },
        lastConnectedAt: new Date().toISOString(),
      },
      anthropic: {
        providerId: 'anthropic',
        connectionStatus: 'disconnected',
        selectedModelId: null,
        credentials: { type: 'api_key', keyPrefix: '' },
        lastConnectedAt: '',
      },
    },
  };

  const mockAPI = {
    // App info
    getVersion: async () => '0.0.1-mock',
    getPlatform: async () => 'web-mock',

    // Shell
    openExternal: async (url: string) => console.log('Mock openExternal:', url),

    // Task operations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    startTask: async (config: any) => ({
      ...mockTask,
      id: config.taskId || `mock-task-${Date.now()}`,
      prompt: config.prompt,
      messages: [
        {
          id: `msg-${Date.now()}`,
          type: 'user',
          content: config.prompt,
          timestamp: new Date().toISOString(),
        },
      ],
    }),
    cancelTask: async () => console.log('Mock cancelTask'),
    interruptTask: async () => console.log('Mock interruptTask'),
    getTask: async () => mockTask,
    listTasks: async () => [mockTask],
    deleteTask: async () => console.log('Mock deleteTask'),
    clearTaskHistory: async () => console.log('Mock clearTaskHistory'),

    // Permission responses
    respondToPermission: async () => console.log('Mock respondToPermission'),

    // Session management
    resumeSession: async (sessionId: string, prompt: string) => ({
      ...mockTask,
      sessionId,
      messages: [
        ...mockTask.messages,
        {
          id: `msg-${Date.now()}`,
          type: 'user',
          content: prompt,
          timestamp: new Date().toISOString(),
        } as TaskMessage,
      ],
    }),

    // Settings
    getApiKeys: async () => [],
    addApiKey: async () => ({ id: 'mock-key', provider: 'openai', key: 'sk-...' }),
    removeApiKey: async () => console.log('Mock removeApiKey'),
    getDebugMode: async () => true,
    setDebugMode: async () => console.log('Mock setDebugMode'),
    getTheme: async () => localStorage.getItem('theme') || 'system',
    setTheme: async (t: string) => {
      console.log('Mock setTheme:', t);
      // The frontend `applyTheme` already updates localStorage, so we don't strictly need to do it here for the mock
      // unless we want to simulate backend latency or failure.
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onThemeChange: (_cb: any) => {
      console.log('Mock onThemeChange registered');
      return () => {};
    },
    getAppSettings: async () => ({
      debugMode: true,
      onboardingComplete: true,
      theme: localStorage.getItem('theme') || 'system',
    }),
    getOpenAiBaseUrl: async () => '',
    setOpenAiBaseUrl: async () => console.log('Mock setOpenAiBaseUrl'),
    getOpenAiOauthStatus: async () => ({ connected: false }),
    loginOpenAiWithChatGpt: async () => ({ ok: true }),

    // API Key management
    hasApiKey: async () => true,
    setApiKey: async () => console.log('Mock setApiKey'),
    getApiKey: async () => 'sk-mock-key',
    validateApiKey: async () => ({ valid: true }),
    validateApiKeyForProvider: async () => ({ valid: true }),
    clearApiKey: async () => console.log('Mock clearApiKey'),

    // Multi-provider API keys
    getAllApiKeys: async () => ({}),
    hasAnyApiKey: async () => true,

    // Onboarding
    getOnboardingComplete: async () => true,
    setOnboardingComplete: async () => console.log('Mock setOnboardingComplete'),

    // OpenCode CLI
    checkOpenCodeCli: async () => ({ installed: true, version: '1.0.0', installCommand: '' }),
    getOpenCodeVersion: async () => '1.0.0',

    // Model selection
    getSelectedModel: async () => ({ provider: 'openai', model: 'gpt-4o' }),
    setSelectedModel: async () => console.log('Mock setSelectedModel'),

    // Ollama configuration
    testOllamaConnection: async () => ({ success: true }),
    getOllamaConfig: async () => null,
    setOllamaConfig: async () => console.log('Mock setOllamaConfig'),

    // Azure Foundry configuration
    getAzureFoundryConfig: async () => null,
    setAzureFoundryConfig: async () => console.log('Mock setAzureFoundryConfig'),
    testAzureFoundryConnection: async () => ({ success: true }),
    saveAzureFoundryConfig: async () => console.log('Mock saveAzureFoundryConfig'),

    // Dynamic model fetching
    fetchProviderModels: async () => ({
      success: true,
      models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
    }),

    // OpenRouter configuration
    fetchOpenRouterModels: async () => ({ success: true, models: [] }),

    // LiteLLM configuration
    testLiteLLMConnection: async () => ({ success: true }),
    fetchLiteLLMModels: async () => ({ success: true, models: [] }),
    getLiteLLMConfig: async () => null,
    setLiteLLMConfig: async () => console.log('Mock setLiteLLMConfig'),

    // LM Studio configuration
    testLMStudioConnection: async () => ({ success: true }),
    fetchLMStudioModels: async () => ({ success: true, models: [] }),
    getLMStudioConfig: async () => null,
    setLMStudioConfig: async () => console.log('Mock setLMStudioConfig'),

    // Bedrock configuration
    validateBedrockCredentials: async () => ({ valid: true }),
    saveBedrockCredentials: async () => ({ id: 'mock-bedrock', provider: 'bedrock', key: '...' }),
    getBedrockCredentials: async () => null,
    fetchBedrockModels: async () => ({ success: true, models: [] }),

    // Vertex AI configuration
    validateVertexCredentials: async () => ({ valid: true }),
    saveVertexCredentials: async () => ({ id: 'mock-vertex', provider: 'google', key: '...' }),
    getVertexCredentials: async () => null,
    fetchVertexModels: async () => ({ success: true, models: [] }),
    detectVertexProject: async () => ({ success: true, projectId: 'mock-project' }),
    listVertexProjects: async () => ({ success: true, projects: [] }),

    // E2E Testing
    isE2EMode: async () => false,

    // Provider Settings API
    getProviderSettings: async () => mockProviderSettings,
    setActiveProvider: async () => console.log('Mock setActiveProvider'),
    getConnectedProvider: async () => mockProviderSettings.connectedProviders['openai'],
    setConnectedProvider: async () => console.log('Mock setConnectedProvider'),
    removeConnectedProvider: async () => console.log('Mock removeConnectedProvider'),
    updateProviderModel: async () => console.log('Mock updateProviderModel'),
    setProviderDebugMode: async () => console.log('Mock setProviderDebugMode'),
    getProviderDebugMode: async () => true,

    // Todo operations
    getTodosForTask: async () => [],

    // Event subscriptions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onTaskUpdate: (_cb: any) => {
      console.log('Mock onTaskUpdate registered');
      return () => {};
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onTaskUpdateBatch: (_cb: any) => {
      console.log('Mock onTaskUpdateBatch registered');
      return () => {};
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onPermissionRequest: (_cb: any) => {
      console.log('Mock onPermissionRequest registered');
      return () => {};
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onTaskProgress: (_cb: any) => {
      console.log('Mock onTaskProgress registered');
      return () => {};
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDebugLog: (_cb: any) => {
      console.log('Mock onDebugLog registered');
      return () => {};
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onDebugModeChange: (_cb: any) => {
      console.log('Mock onDebugModeChange registered');
      return () => {};
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onTaskStatusChange: (_cb: any) => {
      console.log('Mock onTaskStatusChange registered');
      return () => {};
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onTaskSummary: (_cb: any) => {
      console.log('Mock onTaskSummary registered');
      return () => {};
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onTodoUpdate: (_cb: any) => {
      console.log('Mock onTodoUpdate registered');
      return () => {};
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onAuthError: (_cb: any) => {
      console.log('Mock onAuthError registered');
      return () => {};
    },

    // Speech-to-Text
    speechIsConfigured: async () => false,
    speechGetConfig: async () => ({ enabled: false, hasApiKey: false }),
    speechValidate: async () => ({ valid: true }),
    speechTranscribe: async () => ({
      success: false,
      error: { code: 'not_implemented', message: 'Mock implementation' },
    }),

    // Logging
    logEvent: async () => null,
    exportLogs: async () => ({ success: true }),

    // Skills management
    getSkills: async () => [],
    getEnabledSkills: async () => [],
    setSkillEnabled: async () => console.log('Mock setSkillEnabled'),
    getSkillContent: async () => null,
    pickSkillFile: async () => null,
    addSkillFromFile: async () => ({ id: 'mock-skill', name: 'Mock Skill' }),
    addSkillFromGitHub: async () => ({ id: 'mock-skill-gh', name: 'Mock GitHub Skill' }),
    deleteSkill: async () => console.log('Mock deleteSkill'),
    resyncSkills: async () => [],
    openSkillInEditor: async () => console.log('Mock openSkillInEditor'),
    showSkillInFolder: async () => console.log('Mock showSkillInFolder'),

    // MCP Connectors
    getConnectors: async () => [],
    addConnector: async () => ({ id: 'mock-connector', name: 'Mock Connector' }),
    deleteConnector: async () => console.log('Mock deleteConnector'),
    setConnectorEnabled: async () => console.log('Mock setConnectorEnabled'),
    startConnectorOAuth: async () => ({ state: 'mock', authUrl: '#' }),
    completeConnectorOAuth: async () => ({ id: 'mock-connector', name: 'Mock Connector' }),
    disconnectConnector: async () => console.log('Mock disconnectConnector'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onMcpAuthCallback: (_cb: any) => {
      console.log('Mock onMcpAuthCallback registered');
      return () => {};
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).accomplish = mockAPI;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).accomplishShell = {
    version: '0.0.1-mock',
    platform: 'web-mock',
    isElectron: true, // Fake it so check passes
  };
}
