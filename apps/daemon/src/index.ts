import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    createStorage,
    createTaskManager,
    createSkillsManager,
    createLogWriter,
    TaskCallbacks,
    TaskConfig,
    validateTaskConfig,
    createTaskId,
    createMessageId,
    TaskMessage,
    generateTaskSummary,
    sanitizeString,
    validate,
    taskConfigSchema,
    resumeSessionSchema,
    validateApiKey,
    fetchProviderModels,
    ALLOWED_API_KEY_PROVIDERS,
} from '@accomplish_ai/agent-core';
import type { ProviderType } from '@accomplish_ai/agent-core';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../../.env');
config({ path: envPath });

const fastify = Fastify({
    logger: true,
});

// Initialize Core Services

import { createDaemonTaskManagerOptions } from './daemon-options.js';
import { initializeStorage, getStorage } from './services/storage.js';

import { getBundledSkillsPath, getUserSkillsPath } from './services/config.js';

const skillsManager = createSkillsManager({
    bundledSkillsPath: getBundledSkillsPath(),
    userSkillsPath: getUserSkillsPath(),
});
const logWriter = createLogWriter({
    logDir: path.join(process.cwd(), 'daemon-logs'),
});

const taskManager = createTaskManager(createDaemonTaskManagerOptions());

console.log('Daemon setup complete, starting main...');

async function main() {
    console.log('Entering main function...');
    await fastify.register(cors, {
        origin: '*', // need to secure
    });

    await fastify.register(websocket);

    // Initialize Storage & Skills
    try {
        initializeStorage();
        await skillsManager.initialize();
        fastify.log.info('Storage and Skills Manager initialized');
    } catch (err) {
        fastify.log.error(err as Error);
        process.exit(1);
    }

    // WebSocket for events
    fastify.get('/ws', { websocket: true }, (connection, req) => {
        fastify.log.info('Client connected to WebSocket');
        // TODO: Handle messages
    });

    function broadcast(event: string, payload: any) {
        if (fastify.websocketServer) {
            fastify.websocketServer.clients.forEach((client) => {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({ event, payload }));
                }
            });
        }
    }

    function createCallbacks(taskId: string): TaskCallbacks {
        return {

            onBatchedMessages: (messages: TaskMessage[]) => {
                messages.forEach((msg: TaskMessage) => getStorage().addTaskMessage(taskId, msg));
                broadcast('task:messages', { taskId, messages });
            },

            onProgress: (progress: any) => {
                broadcast('task:progress', { taskId, progress });
            },

            onPermissionRequest: (req: any) => {
                broadcast('permission:request', { taskId, req });
                // We cannot return a decision here significantly easily without pausing.
                // The PermissionHandler in agent-core handles the waiting.
                // This callback is just to NOTIFY the UI.
            },

            onComplete: (result: any) => {
                broadcast('task:finish', { taskId, result });
                getStorage().updateTaskStatus(taskId, result.status, new Date().toISOString());
            },

            onError: (error: Error) => {
                broadcast('task:error', { taskId, error });
                getStorage().updateTaskStatus(taskId, 'failed', new Date().toISOString());
            },

            onStatusChange: (status: any) => {
                broadcast('task:status', { taskId, status });
            }
        };
    }

    // --- API Routes ---

    fastify.get('/ping', async () => {
        return { status: 'ok', message: 'Daemon is running' };
    });

    // TASK MANAGEMENT

    fastify.get('/tasks', async () => {
        return getStorage().getTasks();
    });

    fastify.get('/tasks/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const task = getStorage().getTask(id);
        if (!task) {
            reply.code(404);
            return { error: 'Task not found' };
        }
        return task;
    });

    fastify.post('/tasks', async (request, reply) => {
        try {
            const body = request.body as TaskConfig;
            const validatedConfig = validateTaskConfig(body);
            const storage = getStorage();

            if (!storage.hasReadyProvider()) {
                reply.code(400);
                return { error: 'No provider is ready. Please configure a provider.' };
            }

            const taskId = createTaskId();
            const activeModel = storage.getActiveProviderModel();
            const selectedModel = activeModel || storage.getSelectedModel();
            if (selectedModel?.model) {
                validatedConfig.modelId = selectedModel.model;
            }

            const callbacks = createCallbacks(taskId);
            const task = await taskManager.startTask(taskId, validatedConfig, callbacks);

            const initialUserMessage: TaskMessage = {
                id: createMessageId(),
                type: 'user',
                content: validatedConfig.prompt,
                timestamp: new Date().toISOString(),
            };
            task.messages = [initialUserMessage];
            storage.saveTask(task);

            // Generate summary in background
            generateTaskSummary(validatedConfig.prompt, storage.getApiKey)
                .then((summary: string) => {
                    storage.updateTaskSummary(taskId, summary);
                    broadcast('task:summary', { taskId, summary });
                })
                .catch(() => { });

            return task;
        } catch (err: any) {
            request.log.error(err);
            reply.code(500);
            return { error: err.message };
        }
    });

    fastify.delete('/tasks/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        getStorage().deleteTask(id);
        return { success: true };
    });

    fastify.post('/tasks/:id/cancel', async (request, reply) => {
        const { id } = request.params as { id: string };
        if (taskManager.isTaskQueued(id)) {
            taskManager.cancelQueuedTask(id);
            getStorage().updateTaskStatus(id, 'cancelled', new Date().toISOString());
        } else if (taskManager.hasActiveTask(id)) {
            await taskManager.cancelTask(id);
            getStorage().updateTaskStatus(id, 'cancelled', new Date().toISOString());
        }
        return { status: 'cancelled' };
    });

    fastify.post('/tasks/:id/interrupt', async (request, reply) => {
        const { id } = request.params as { id: string };
        if (taskManager.hasActiveTask(id)) {
            await taskManager.interruptTask(id);
        }
        return { status: 'interrupted' };
    });

    fastify.get('/tasks/:id/todos', async (request, reply) => {
        const { id } = request.params as { id: string };
        return getStorage().getTodosForTask(id);
    });

    // SESSION RESUME

    fastify.post('/session/resume', async (request, reply) => {
        try {
            const body = request.body as { sessionId: string; prompt: string; existingTaskId?: string };
            const validated = validate(resumeSessionSchema, body);
            const { sessionId, prompt, existingTaskId } = validated;

            const storage = getStorage();
            if (!storage.hasReadyProvider()) {
                reply.code(400);
                return { error: 'No provider is ready.' };
            }

            const taskId = existingTaskId || createTaskId();

            if (existingTaskId) {
                const userMessage: TaskMessage = {
                    id: createMessageId(),
                    type: 'user',
                    content: prompt,
                    timestamp: new Date().toISOString(),
                };
                storage.addTaskMessage(existingTaskId, userMessage);
            }

            const activeModel = storage.getActiveProviderModel();
            const selectedModel = activeModel || storage.getSelectedModel();

            const callbacks = createCallbacks(taskId);

            const task = await taskManager.startTask(taskId, {
                prompt,
                sessionId,
                taskId,
                modelId: selectedModel?.model,
            }, callbacks);

            if (existingTaskId) {
                storage.updateTaskStatus(existingTaskId, task.status, new Date().toISOString());
            }

            return task;
        } catch (err: any) {
            request.log.error(err);
            reply.code(500);
            return { error: err.message };
        }
    });

    // SETTINGS & PROVIDERS

    fastify.get('/settings/api-keys', async () => {
        const storage = getStorage();
        const storedKeys = await storage.getAllApiKeys();
        return storedKeys;
    });

    fastify.post('/settings/api-keys', async (request, reply) => {
        const { provider, key } = request.body as { provider: string; key: string };
        if (!provider || !key) {
            reply.code(400);
            return { error: 'Provider and key are required' };
        }
        await getStorage().storeApiKey(provider, key);
        return { success: true };
    });

    fastify.delete('/settings/api-keys/:provider', async (request, reply) => {
        const { provider } = request.params as { provider: string };
        await getStorage().deleteApiKey(provider);
        return { success: true };
    });

    fastify.get('/settings/model', async () => {
        return getStorage().getSelectedModel();
    });

    fastify.post('/settings/model', async (request, reply) => {
        const model = request.body as any;
        if (!model || !model.provider || !model.model) {
            reply.code(400);
            return { error: 'Invalid model configuration' };
        }
        getStorage().setSelectedModel(model);
        return { success: true };
    });

    // SYSTEM

    fastify.get('/system/status', async () => {
        return {
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        };
    });

    // PROVIDER VALIDATION & MODELS

    fastify.post('/providers/:id/validate', async (request, reply) => {
        const { id } = request.params as { id: string };
        const { key } = request.body as { key: string };

        if (!ALLOWED_API_KEY_PROVIDERS.has(id)) {
            reply.code(400);
            return { error: 'Unsupported provider' };
        }

        const sanitizedKey = sanitizeString(key, 'apiKey', 256);
        const result = await validateApiKey(id as ProviderType, sanitizedKey, {
            timeout: 15000,
            baseUrl: id === 'openai' ? getStorage().getOpenAiBaseUrl().trim() || undefined : undefined,
        });

        return result;
    });

    fastify.get('/providers/:id/models', async (request, reply) => {
        const { id } = request.params as { id: string };
        // TODO: Support fetching models for a specific provider
        // For now, return empty or implement similar logic to desktop's fetchProviderModels
        return { models: [] };
    });

    try {
        const port = 3333;
        await fastify.listen({ port, host: '127.0.0.1' });
        console.log(`Daemon listening on http://127.0.0.1:${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

main();
