import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockTaskManager, mockCreateTaskId, mockCreateMessageId, mockValidateTaskConfig,
  mockMapResultToStatus, mockGenerateTaskSummary } = vi.hoisted(() => ({
  mockTaskManager: {
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
  },
  mockCreateTaskId: vi.fn(() => 'generated-task-id'),
  mockCreateMessageId: vi.fn(() => 'generated-msg-id'),
  mockValidateTaskConfig: vi.fn((config: Record<string, unknown>) => ({ ...config })),
  mockMapResultToStatus: vi.fn(() => 'completed'),
  mockGenerateTaskSummary: vi.fn(() => Promise.resolve('Test summary')),
}));

vi.mock('@accomplish_ai/agent-core', () => ({
  createTaskManager: () => mockTaskManager,
  createTaskId: mockCreateTaskId,
  createMessageId: mockCreateMessageId,
  validateTaskConfig: mockValidateTaskConfig,
  mapResultToStatus: mockMapResultToStatus,
  generateTaskSummary: mockGenerateTaskSummary,
  getModelDisplayName: vi.fn(() => 'Mock Model'),
  ensureDevBrowserServer: vi.fn(() => Promise.resolve()),
  resolveCliPath: vi.fn(() => null),
  isCliAvailable: vi.fn(() => true),
  buildCliArgs: vi.fn(() => ['--arg']),
  buildOpenCodeEnvironment: vi.fn((env: Record<string, unknown>) => env),
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
    getApiKey: vi.fn(),
    getAllApiKeys: vi.fn(() => ({})),
    getBedrockCredentials: vi.fn(() => null),
    deleteTask: vi.fn(),
    clearHistory: vi.fn(),
    getTodosForTask: vi.fn(() => []),
  };
}

describe('TaskService', () => {
  let service: TaskService;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = createMockStorage();
    service = new TaskService(mockStorage as never, { userDataPath: '/tmp/test', mcpToolsPath: '/tmp/mcp-tools' });
  });

  describe('startTask', () => {
    it('should create task with generated taskId when none provided', async () => {
      mockTaskManager.startTask.mockResolvedValue({
        id: 'generated-task-id',
        status: 'running',
        prompt: 'test prompt',
        messages: [],
        createdAt: '2024-01-01',
      });

      const task = await service.startTask({ prompt: 'test prompt' });

      expect(mockCreateTaskId).toHaveBeenCalled();
      expect(task.id).toBe('generated-task-id');
      expect(mockTaskManager.startTask).toHaveBeenCalledWith(
        'generated-task-id',
        expect.objectContaining({
          taskId: 'generated-task-id',
          prompt: 'test prompt',
        }),
        expect.any(Object),
      );
    });

    it('should use provided taskId', async () => {
      mockTaskManager.startTask.mockResolvedValue({
        id: 'custom-id',
        status: 'running',
        prompt: 'test',
        messages: [],
        createdAt: '2024-01-01',
      });

      const task = await service.startTask({ prompt: 'test', taskId: 'custom-id' });
      expect(mockCreateTaskId).not.toHaveBeenCalled();
      expect(task.id).toBe('custom-id');
      expect(mockTaskManager.startTask).toHaveBeenCalledWith(
        'custom-id',
        expect.objectContaining({ taskId: 'custom-id' }),
        expect.any(Object),
      );
    });

    it('should use validated task config returned by validator', async () => {
      mockValidateTaskConfig.mockImplementationOnce((config: Record<string, unknown>) => ({
        ...config,
        prompt: 'validated prompt',
      }));
      mockTaskManager.startTask.mockResolvedValue({
        id: 'generated-task-id',
        status: 'running',
        prompt: 'test',
        messages: [],
        createdAt: '2024-01-01',
      });

      await service.startTask({ prompt: 'test' });

      expect(mockTaskManager.startTask).toHaveBeenCalledWith(
        'generated-task-id',
        expect.objectContaining({
          taskId: 'generated-task-id',
          prompt: 'validated prompt',
        }),
        expect.any(Object),
      );
    });

    it('should use storage active provider model', async () => {
      mockStorage.getActiveProviderModel.mockReturnValue({ model: 'claude-3', provider: 'anthropic' });
      mockTaskManager.startTask.mockResolvedValue({
        id: 'generated-task-id',
        status: 'running',
        prompt: 'test',
        messages: [],
        createdAt: '2024-01-01',
      });

      await service.startTask({ prompt: 'test' });

      expect(mockTaskManager.startTask).toHaveBeenCalledWith(
        'generated-task-id',
        expect.objectContaining({ modelId: 'claude-3' }),
        expect.any(Object),
      );
    });

    it('should fall back to selectedModel when no active provider model', async () => {
      mockStorage.getActiveProviderModel.mockReturnValue(null);
      mockStorage.getSelectedModel.mockReturnValue({ model: 'gpt-4', provider: 'openai' });
      mockTaskManager.startTask.mockResolvedValue({
        id: 'generated-task-id',
        status: 'running',
        prompt: 'test',
        messages: [],
        createdAt: '2024-01-01',
      });

      await service.startTask({ prompt: 'test' });

      expect(mockTaskManager.startTask).toHaveBeenCalledWith(
        'generated-task-id',
        expect.objectContaining({ modelId: 'gpt-4' }),
        expect.any(Object),
      );
    });

    it('should save task to storage', async () => {
      mockTaskManager.startTask.mockResolvedValue({
        id: 'generated-task-id',
        status: 'running',
        prompt: 'test',
        messages: [],
        createdAt: '2024-01-01',
      });

      await service.startTask({ prompt: 'test' });

      expect(mockStorage.saveTask).toHaveBeenCalled();
    });

    it('should add initial user message to task', async () => {
      mockTaskManager.startTask.mockResolvedValue({
        id: 'generated-task-id',
        status: 'running',
        prompt: 'test prompt',
        messages: [],
        createdAt: '2024-01-01',
      });

      const task = await service.startTask({ prompt: 'test prompt' });

      expect(task.messages).toHaveLength(1);
      expect(task.messages[0]).toEqual(
        expect.objectContaining({
          type: 'user',
          content: 'test prompt',
        }),
      );
    });

    it('should generate summary asynchronously', async () => {
      mockTaskManager.startTask.mockResolvedValue({
        id: 'generated-task-id',
        status: 'running',
        prompt: 'test',
        messages: [],
        createdAt: '2024-01-01',
      });

      await service.startTask({ prompt: 'test' });

      await vi.waitFor(() => {
        expect(mockGenerateTaskSummary).toHaveBeenCalled();
      });
    });

    it('should swallow summary generation failures', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockGenerateTaskSummary.mockRejectedValueOnce(new Error('summary-failure'));
      mockTaskManager.startTask.mockResolvedValue({
        id: 'generated-task-id',
        status: 'running',
        prompt: 'test',
        messages: [],
        createdAt: '2024-01-01',
      });

      await service.startTask({ prompt: 'test' });

      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          '[TaskService] Failed to generate task summary:',
          expect.any(Error),
        );
      });

      warnSpy.mockRestore();
    });

    it('should emit summary event after generation', async () => {
      mockTaskManager.startTask.mockResolvedValue({
        id: 'generated-task-id',
        status: 'running',
        prompt: 'test',
        messages: [],
        createdAt: '2024-01-01',
      });

      const summaryHandler = vi.fn();
      service.on('summary', summaryHandler);

      await service.startTask({ prompt: 'test' });

      await vi.waitFor(() => {
        expect(summaryHandler).toHaveBeenCalledWith({
          taskId: 'generated-task-id',
          summary: 'Test summary',
        });
      });
    });
  });

  describe('stopTask', () => {
    it('should cancel queued tasks', async () => {
      mockTaskManager.isTaskQueued.mockReturnValue(true);

      await service.stopTask({ taskId: 'task-1' });

      expect(mockTaskManager.cancelQueuedTask).toHaveBeenCalledWith('task-1');
      expect(mockStorage.updateTaskStatus).toHaveBeenCalledWith('task-1', 'cancelled', expect.any(String));
    });

    it('should cancel active tasks', async () => {
      mockTaskManager.isTaskQueued.mockReturnValue(false);
      mockTaskManager.hasActiveTask.mockReturnValue(true);
      mockTaskManager.cancelTask.mockResolvedValue(undefined);

      await service.stopTask({ taskId: 'task-1' });

      expect(mockTaskManager.cancelTask).toHaveBeenCalledWith('task-1');
      expect(mockStorage.updateTaskStatus).toHaveBeenCalledWith('task-1', 'cancelled', expect.any(String));
    });

    it('should do nothing for unknown tasks', async () => {
      mockTaskManager.isTaskQueued.mockReturnValue(false);
      mockTaskManager.hasActiveTask.mockReturnValue(false);

      await service.stopTask({ taskId: 'unknown' });

      expect(mockTaskManager.cancelQueuedTask).not.toHaveBeenCalled();
      expect(mockTaskManager.cancelTask).not.toHaveBeenCalled();
      expect(mockStorage.updateTaskStatus).not.toHaveBeenCalled();
    });
  });

  describe('interruptTask', () => {
    it('should delegate to taskManager for active tasks', async () => {
      mockTaskManager.hasActiveTask.mockReturnValue(true);
      mockTaskManager.interruptTask.mockResolvedValue(undefined);

      await service.interruptTask({ taskId: 'task-1' });

      expect(mockTaskManager.interruptTask).toHaveBeenCalledWith('task-1');
    });

    it('should do nothing for non-active tasks', async () => {
      mockTaskManager.hasActiveTask.mockReturnValue(false);

      await service.interruptTask({ taskId: 'task-1' });

      expect(mockTaskManager.interruptTask).not.toHaveBeenCalled();
    });
  });

  describe('resumeSession', () => {
    it('should create new taskId when none provided', async () => {
      mockTaskManager.startTask.mockResolvedValue({
        id: 'generated-task-id',
        status: 'running',
        prompt: 'continue',
        messages: [],
        createdAt: '2024-01-01',
      });

      await service.resumeSession({ sessionId: 'session-1', prompt: 'continue' });

      expect(mockCreateTaskId).toHaveBeenCalled();
    });

    it('should use existing taskId when provided', async () => {
      mockTaskManager.startTask.mockResolvedValue({
        id: 'existing-task',
        status: 'running',
        prompt: 'continue',
        messages: [],
        createdAt: '2024-01-01',
      });

      await service.resumeSession({
        sessionId: 'session-1',
        prompt: 'continue',
        existingTaskId: 'existing-task',
      });

      expect(mockCreateTaskId).not.toHaveBeenCalled();
      expect(mockTaskManager.startTask).toHaveBeenCalledWith(
        'existing-task',
        expect.objectContaining({
          taskId: 'existing-task',
          prompt: 'continue',
          sessionId: 'session-1',
        }),
        expect.any(Object),
      );
    });

    it('should add user message for existing tasks', async () => {
      mockTaskManager.startTask.mockResolvedValue({
        id: 'existing-task',
        status: 'running',
        prompt: 'continue',
        messages: [],
        createdAt: '2024-01-01',
      });

      await service.resumeSession({
        sessionId: 'session-1',
        prompt: 'continue',
        existingTaskId: 'existing-task',
      });

      expect(mockStorage.addTaskMessage).toHaveBeenCalledWith(
        'existing-task',
        expect.objectContaining({ type: 'user', content: 'continue' }),
      );
    });

    it('should start task with session config', async () => {
      mockStorage.getActiveProviderModel.mockReturnValue({ model: 'claude-3', provider: 'anthropic' });
      mockTaskManager.startTask.mockResolvedValue({
        id: 'generated-task-id',
        status: 'running',
        prompt: 'continue',
        messages: [],
        createdAt: '2024-01-01',
      });

      await service.resumeSession({ sessionId: 'session-1', prompt: 'continue' });

      expect(mockTaskManager.startTask).toHaveBeenCalledWith(
        'generated-task-id',
        expect.objectContaining({
          prompt: 'continue',
          sessionId: 'session-1',
          modelId: 'claude-3',
        }),
        expect.any(Object),
      );
    });

    it('should update task status for existing tasks', async () => {
      mockTaskManager.startTask.mockResolvedValue({
        id: 'existing-task',
        status: 'running',
        prompt: 'continue',
        messages: [],
        createdAt: '2024-01-01',
      });

      await service.resumeSession({
        sessionId: 'session-1',
        prompt: 'continue',
        existingTaskId: 'existing-task',
      });

      expect(mockStorage.updateTaskStatus).toHaveBeenCalledWith(
        'existing-task',
        'running',
        expect.any(String),
      );
    });
  });

  describe('listTasks', () => {
    it('should return tasks from storage', () => {
      const tasks = [{ id: 'task-1' }, { id: 'task-2' }];
      mockStorage.getTasks.mockReturnValue(tasks);

      const result = service.listTasks();
      expect(result).toEqual(tasks);
    });
  });

  describe('getTaskStatus', () => {
    it('should return task status for existing task', () => {
      mockStorage.getTask.mockReturnValue({
        id: 'task-1',
        status: 'completed',
        prompt: 'test',
        createdAt: '2024-01-01',
      });

      const result = service.getTaskStatus({ taskId: 'task-1' });

      expect(result).toEqual({
        taskId: 'task-1',
        status: 'completed',
        prompt: 'test',
        createdAt: '2024-01-01',
      });
    });

    it('should return null for non-existent task', () => {
      mockStorage.getTask.mockReturnValue(null);

      const result = service.getTaskStatus({ taskId: 'nonexistent' });
      expect(result).toBeNull();
    });
  });

  describe('getActiveTaskId', () => {
    it('should delegate to taskManager', () => {
      mockTaskManager.getActiveTaskId.mockReturnValue('task-1');
      expect(service.getActiveTaskId()).toBe('task-1');
    });
  });

  describe('hasActiveTask', () => {
    it('should delegate to taskManager', () => {
      mockTaskManager.hasActiveTask.mockReturnValue(true);
      expect(service.hasActiveTask('task-1')).toBe(true);
    });
  });

  describe('getActiveTaskCount', () => {
    it('should delegate to taskManager', () => {
      mockTaskManager.getActiveTaskCount.mockReturnValue(3);
      expect(service.getActiveTaskCount()).toBe(3);
    });
  });

  describe('sendResponse', () => {
    it('should delegate to taskManager', async () => {
      mockTaskManager.sendResponse.mockResolvedValue(undefined);
      await service.sendResponse('task-1', 'yes');
      expect(mockTaskManager.sendResponse).toHaveBeenCalledWith('task-1', 'yes');
    });
  });

  describe('dispose', () => {
    it('should call taskManager.dispose', () => {
      service.dispose();
      expect(mockTaskManager.dispose).toHaveBeenCalled();
    });
  });

  describe('event callbacks', () => {
    let callbacks: Record<string, Function>;

    beforeEach(async () => {
      mockTaskManager.startTask.mockImplementation((_id: string, _config: unknown, cbs: Record<string, Function>) => {
        callbacks = cbs;
        return Promise.resolve({
          id: 'generated-task-id',
          status: 'running',
          prompt: 'test',
          messages: [],
          createdAt: '2024-01-01',
        });
      });

      await service.startTask({ prompt: 'test' });
    });

    it('should emit message event and store messages on onBatchedMessages', () => {
      const messageHandler = vi.fn();
      service.on('message', messageHandler);

      const messages = [{ id: 'msg-1', type: 'assistant', content: 'hello', timestamp: '2024-01-01' }];
      callbacks.onBatchedMessages(messages);

      expect(messageHandler).toHaveBeenCalledWith({
        taskId: 'generated-task-id',
        messages,
      });
      expect(mockStorage.addTaskMessage).toHaveBeenCalledWith('generated-task-id', messages[0]);
    });

    it('should emit progress event on onProgress', () => {
      const progressHandler = vi.fn();
      service.on('progress', progressHandler);

      callbacks.onProgress({ stage: 'running', message: 'Working...' });

      expect(progressHandler).toHaveBeenCalledWith({
        taskId: 'generated-task-id',
        stage: 'running',
        message: 'Working...',
      });
    });

    it('should emit permission event on onPermissionRequest', () => {
      const permissionHandler = vi.fn();
      service.on('permission', permissionHandler);

      const request = { requestId: 'fp_1', tool: 'bash' };
      callbacks.onPermissionRequest(request);

      expect(permissionHandler).toHaveBeenCalledWith(request);
    });

    it('should emit complete event and update storage on onComplete', () => {
      const completeHandler = vi.fn();
      service.on('complete', completeHandler);
      mockMapResultToStatus.mockReturnValue('completed');
      mockTaskManager.getSessionId.mockReturnValue('session-123');

      const result = { status: 'success', sessionId: 'session-123' };
      callbacks.onComplete(result);

      expect(completeHandler).toHaveBeenCalledWith({
        taskId: 'generated-task-id',
        result,
      });
      expect(mockStorage.updateTaskStatus).toHaveBeenCalledWith(
        'generated-task-id',
        'completed',
        expect.any(String),
      );
      expect(mockStorage.updateTaskSessionId).toHaveBeenCalledWith(
        'generated-task-id',
        'session-123',
      );
    });

    it('should clear todos on successful completion', () => {
      mockMapResultToStatus.mockReturnValue('completed');
      const result = { status: 'success' };
      callbacks.onComplete(result);

      expect(mockStorage.clearTodosForTask).toHaveBeenCalledWith('generated-task-id');
    });

    it('should not clear todos on non-success completion', () => {
      mockMapResultToStatus.mockReturnValue('failed');
      const result = { status: 'error' };
      callbacks.onComplete(result);

      expect(mockStorage.clearTodosForTask).not.toHaveBeenCalled();
    });

    it('should emit error event and update storage on onError', () => {
      const errorHandler = vi.fn();
      service.on('error', errorHandler);

      callbacks.onError(new Error('test error'));

      expect(errorHandler).toHaveBeenCalledWith({
        taskId: 'generated-task-id',
        error: 'test error',
      });
      expect(mockStorage.updateTaskStatus).toHaveBeenCalledWith(
        'generated-task-id',
        'failed',
        expect.any(String),
      );
    });

    it('should emit statusChange event and update storage on onStatusChange', () => {
      const statusHandler = vi.fn();
      service.on('statusChange', statusHandler);

      callbacks.onStatusChange('running');

      expect(statusHandler).toHaveBeenCalledWith({
        taskId: 'generated-task-id',
        status: 'running',
      });
      expect(mockStorage.updateTaskStatus).toHaveBeenCalledWith(
        'generated-task-id',
        'running',
        expect.any(String),
      );
    });

    it('should save todos on onTodoUpdate', () => {
      const todos = [{ id: '1', text: 'Test todo', completed: false }];
      callbacks.onTodoUpdate(todos);

      expect(mockStorage.saveTodosForTask).toHaveBeenCalledWith('generated-task-id', todos);
    });
  });
});
