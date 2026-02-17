import http from 'http';
import {
  createTaskId,
  createMessageId,
  validateTaskConfig,
  sanitizeString,
  generateTaskSummary,
  mapResultToStatus,
} from '@accomplish_ai/agent-core';
import type {
  TaskManagerAPI,
  TaskCallbacks,
  TaskMessage,
  TaskResult,
  TaskStatus,
  StorageAPI,
  TodoItem,
  ProviderId,
  ConnectedProvider,
} from '@accomplish_ai/agent-core';
import { broadcast } from './websocket.js';
import { registerActiveTask, unregisterActiveTask } from './mcp-bridges.js';

const DAEMON_PORT = 9229;

interface RouteContext {
  taskManager: TaskManagerAPI;
  storage: StorageAPI;
}

type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse, ctx: RouteContext, params: Record<string, string>) => Promise<void>;

async function parseBody<T>(req: http.IncomingMessage): Promise<T> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body) as T;
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Create task callbacks that broadcast events via WebSocket and persist to storage.
 */
function createDaemonTaskCallbacks(taskId: string, storage: StorageAPI, taskManager: TaskManagerAPI): TaskCallbacks {
  return {
    onBatchedMessages(messages: TaskMessage[]) {
      broadcast({ type: 'task:update', taskId, data: messages });
      for (const msg of messages) storage.addTaskMessage(taskId, msg);
    },
    onProgress(progress) {
      broadcast({ type: 'task:progress', taskId, data: progress });
    },
    onPermissionRequest(request) {
      broadcast({ type: 'permission:request', data: request });
    },
    onComplete(result: TaskResult) {
      broadcast({ type: 'task:complete', taskId, data: result });
      storage.updateTaskStatus(taskId, mapResultToStatus(result), new Date().toISOString());
      const sessionId = result.sessionId || taskManager.getSessionId(taskId);
      if (sessionId) storage.updateTaskSessionId(taskId, sessionId);
      if (result.status === 'success') storage.clearTodosForTask(taskId);
      unregisterActiveTask(taskId);
    },
    onError(error: Error) {
      broadcast({ type: 'task:error', taskId, error: error.message });
      storage.updateTaskStatus(taskId, 'failed', new Date().toISOString());
      unregisterActiveTask(taskId);
    },
    onStatusChange(status: TaskStatus) {
      broadcast({ type: 'task:status-change', taskId, status });
      storage.updateTaskStatus(taskId, status, new Date().toISOString());
    },
    onTodoUpdate(todos: TodoItem[]) {
      storage.saveTodosForTask(taskId, todos);
      broadcast({ type: 'task:todo-update', taskId, data: todos });
    },
    onAuthError(error) {
      broadcast({ type: 'auth:error', data: error });
    },
  };
}

// --- Route handlers ---

const startTask: RouteHandler = async (req, res, { taskManager, storage }) => {
  const config = validateTaskConfig(await parseBody(req));

  if (!storage.hasReadyProvider()) {
    return json(res, 400, { error: 'No provider ready. Connect a provider first.' });
  }

  const taskId = createTaskId();
  const model = storage.getActiveProviderModel() || storage.getSelectedModel();
  if (model?.model) config.modelId = model.model;

  const callbacks = createDaemonTaskCallbacks(taskId, storage, taskManager);
  registerActiveTask(taskId);

  const task = await taskManager.startTask(taskId, config, callbacks);
  task.messages = [{
    id: createMessageId(),
    type: 'user',
    content: config.prompt,
    timestamp: new Date().toISOString(),
  }];
  storage.saveTask(task);

  // Generate summary in background
  generateTaskSummary(config.prompt, (p: string) => storage.getApiKey(p))
    .then((summary) => storage.updateTaskSummary(taskId, summary))
    .catch(() => {});

  json(res, 201, task);
};

const cancelTask: RouteHandler = async (_req, res, { taskManager, storage }, params) => {
  const { id } = params;
  if (taskManager.isTaskQueued(id)) {
    taskManager.cancelQueuedTask(id);
    storage.updateTaskStatus(id, 'cancelled', new Date().toISOString());
  } else if (taskManager.hasActiveTask(id)) {
    await taskManager.cancelTask(id);
    storage.updateTaskStatus(id, 'cancelled', new Date().toISOString());
  }
  json(res, 200, { ok: true });
};

const getTask: RouteHandler = async (_req, res, { storage }, params) => {
  const task = storage.getTask(params.id);
  json(res, task ? 200 : 404, task || { error: 'Not found' });
};

const listTasks: RouteHandler = async (_req, res, { storage }) => {
  json(res, 200, storage.getTasks());
};

const deleteTask: RouteHandler = async (_req, res, { storage }, params) => {
  storage.deleteTask(params.id);
  json(res, 200, { ok: true });
};

const interruptTask: RouteHandler = async (_req, res, { taskManager }, params) => {
  if (taskManager.hasActiveTask(params.id)) await taskManager.interruptTask(params.id);
  json(res, 200, { ok: true });
};

const respondToTask: RouteHandler = async (req, res, { taskManager }, params) => {
  const { response } = await parseBody<{ response: string }>(req);
  await taskManager.sendResponse(params.id, sanitizeString(response, 'response', 1024));
  json(res, 200, { ok: true });
};

const getProviderSettings: RouteHandler = async (_req, res, { storage }) => {
  json(res, 200, storage.getProviderSettings());
};

const getSelectedModel: RouteHandler = async (_req, res, { storage }) => {
  json(res, 200, storage.getSelectedModel() || null);
};

const setSelectedModel: RouteHandler = async (req, res, { storage }) => {
  const model = await parseBody(req);
  storage.setSelectedModel(model as Parameters<StorageAPI['setSelectedModel']>[0]);
  json(res, 200, { ok: true });
};

const storeApiKey: RouteHandler = async (req, res, { storage }, params) => {
  const { key } = await parseBody<{ key: string }>(req);
  storage.storeApiKey(params.provider, sanitizeString(key, 'apiKey', 256));
  json(res, 200, { ok: true });
};

const deleteApiKey: RouteHandler = async (_req, res, { storage }, params) => {
  storage.deleteApiKey(params.provider);
  json(res, 200, { ok: true });
};

const connectProvider: RouteHandler = async (req, res, { storage }, params) => {
  const { key, modelId } = await parseBody<{ key: string; modelId: string }>(req);
  const providerId = params.id as ProviderId;

  storage.storeApiKey(providerId, sanitizeString(key, 'apiKey', 256));

  const provider: ConnectedProvider = {
    providerId,
    connectionStatus: 'connected',
    selectedModelId: modelId,
    credentials: { type: 'api_key', keyPrefix: key.slice(0, 8) + '...' },
    lastConnectedAt: new Date().toISOString(),
  };
  storage.setConnectedProvider(providerId, provider);
  storage.setActiveProvider(providerId);

  json(res, 200, { ok: true, providerId, modelId });
};

const updateProviderModel: RouteHandler = async (req, res, { storage }, params) => {
  const { modelId } = await parseBody<{ modelId: string }>(req);
  storage.updateProviderModel(params.id as ProviderId, modelId);
  json(res, 200, { ok: true });
};

const activateProvider: RouteHandler = async (_req, res, { storage }, params) => {
  storage.setActiveProvider(params.id as ProviderId);
  json(res, 200, { ok: true });
};

const removeProvider: RouteHandler = async (_req, res, { storage }, params) => {
  storage.removeConnectedProvider(params.id as ProviderId);
  storage.deleteApiKey(params.id);
  json(res, 200, { ok: true });
};

const healthCheck: RouteHandler = async (_req, res, { taskManager }) => {
  json(res, 200, {
    status: 'ok',
    pid: process.pid,
    uptime: process.uptime(),
    activeTasks: taskManager.getActiveTaskCount(),
    queuedTasks: taskManager.getQueueLength(),
  });
};

const shutdown: RouteHandler = async (_req, res) => {
  json(res, 200, { status: 'shutting down' });
  // Give time for response to be sent
  setTimeout(() => process.exit(0), 100);
};

// --- Router ---

interface Route { method: string; pattern: RegExp; handler: RouteHandler; paramNames: string[] }

function route(method: string, path: string, handler: RouteHandler): Route {
  const paramNames: string[] = [];
  const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_m, name) => {
    paramNames.push(name);
    return '([^/]+)';
  }) + '$');
  return { method, pattern, handler, paramNames };
}

const routes: Route[] = [
  route('GET',    '/health',                healthCheck),
  route('POST',   '/shutdown',              shutdown),
  route('POST',   '/tasks',                 startTask),
  route('GET',    '/tasks',                 listTasks),
  route('GET',    '/tasks/:id',             getTask),
  route('DELETE', '/tasks/:id',             deleteTask),
  route('POST',   '/tasks/:id/cancel',      cancelTask),
  route('POST',   '/tasks/:id/interrupt',   interruptTask),
  route('POST',   '/tasks/:id/respond',     respondToTask),
  route('GET',    '/settings/providers',    getProviderSettings),
  route('GET',    '/settings/model',        getSelectedModel),
  route('PUT',    '/settings/model',        setSelectedModel),
  route('POST',   '/api-keys/:provider',    storeApiKey),
  route('DELETE', '/api-keys/:provider',    deleteApiKey),
  route('POST',   '/providers/:id/connect',  connectProvider),
  route('PUT',    '/providers/:id/model',    updateProviderModel),
  route('POST',   '/providers/:id/activate', activateProvider),
  route('DELETE', '/providers/:id',          removeProvider),
];

export function createApiServer(taskManager: TaskManagerAPI, storage: StorageAPI): http.Server {
  const ctx: RouteContext = { taskManager, storage };

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const url = req.url?.split('?')[0] || '/';

    for (const r of routes) {
      if (req.method !== r.method) continue;
      const match = url.match(r.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      r.paramNames.forEach((name, i) => { params[name] = match[i + 1]; });

      await r.handler(req, res, ctx, params);
      return;
    }

    json(res, 404, { error: 'Not found' });
  });

  return server;
}

export { DAEMON_PORT };
