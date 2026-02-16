/**
 * HuggingFace Local Inference Server
 *
 * A lightweight HTTP server that wraps Transformers.js to provide
 * an OpenAI-compatible /v1/chat/completions API endpoint.
 * This allows the opencode CLI to use local models seamlessly.
 */

import http from 'http';
import { app } from 'electron';
import path from 'path';

/**
 * Structure of a chat message in the conversation.
 */
interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * Request payload for the chat completion API.
 */
interface ChatCompletionRequest {
    model?: string;
    messages: ChatMessage[];
    stream?: boolean;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
}

/**
 * Internal state of the inference server.
 */
interface ServerState {
    server: http.Server | null;
    port: number | null;
    loadedModelId: string | null;
    pipeline: unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenizer: ((...args: any[]) => any) & Record<string, any> | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: Record<string, any> | null;
    isLoading: boolean;
}

const state: ServerState = {
    server: null,
    port: null,
    loadedModelId: null,
    pipeline: null,
    tokenizer: null,
    model: null,
    isLoading: false,
};

/**
 * Load a model into memory using Transformers.js.
 */
async function loadModel(modelId: string): Promise<void> {
    if (state.loadedModelId === modelId && state.tokenizer && state.model) {
        console.log(`[HF Server] Model ${modelId} already loaded`);
        return;
    }

    state.isLoading = true;
    console.log(`[HF Server] Loading model: ${modelId}`);

    try {
        const { env, AutoTokenizer, AutoModelForCausalLM } = await import('@huggingface/transformers');

        const cacheDir = path.join(app.getPath('userData'), 'hf-models');
        env.cacheDir = cacheDir;
        env.allowLocalModels = true;

        // Stage new model and tokenizer
        const tokenizer = await AutoTokenizer.from_pretrained(modelId, {
            cache_dir: cacheDir,
            local_files_only: true,
        });

        let model;
        try {
            model = await AutoModelForCausalLM.from_pretrained(modelId, {
                cache_dir: cacheDir,
                dtype: 'q4',
                local_files_only: true,
            });
        } catch (err) {
            console.warn(`[HF Server] Failed to load q4 model, trying fp32: ${err}`);
            model = await AutoModelForCausalLM.from_pretrained(modelId, {
                cache_dir: cacheDir,
                dtype: 'fp32',
                local_files_only: true,
            });
        }

        // Successfully loaded new model, safe to dispose old one
        if (state.model) {
            try {
                await state.model.dispose?.();
            } catch {
                // Ignore dispose errors
            }
        }

        state.tokenizer = tokenizer;
        state.model = model;

        state.loadedModelId = modelId;
        console.log(`[HF Server] Model loaded: ${modelId}`);
    } catch (error) {
        console.error(`[HF Server] Failed to load model: ${modelId}`, error);
        throw error;
    } finally {
        state.isLoading = false;
    }
}

/**
 * Format chat messages into a prompt string.
 * Uses the tokenizer's chat template if available.
 */
function formatChatPrompt(messages: ChatMessage[], tokenizer: any): string {
    try {
        if (tokenizer.apply_chat_template) {
            const formatted = tokenizer.apply_chat_template(messages, {
                tokenize: false,
                add_generation_prompt: true,
            });
            return formatted;
        }
    } catch {
        // Fall through to manual formatting
    }

    // Manual fallback
    return messages
        .map((m) => {
            if (m.role === 'system') {
                return `System: ${m.content}`;
            }
            if (m.role === 'user') {
                return `User: ${m.content}`;
            }
            return `Assistant: ${m.content}`;
        })
        .join('\n') + '\nAssistant:';
}

/**
 * Handle a chat completion request (non-streaming).
 */
async function handleChatCompletion(req: ChatCompletionRequest): Promise<object> {
    if (!state.tokenizer || !state.model) {
        throw new Error('No model loaded');
    }

    const prompt = formatChatPrompt(req.messages, state.tokenizer);
    const inputs = state.tokenizer(prompt, { return_tensors: 'pt' });

    const maxNewTokens = req.max_tokens || 512;
    const temperature = req.temperature ?? 0.7;
    const topP = req.top_p ?? 0.9;

    const outputs = await state.model.generate({
        ...inputs,
        max_new_tokens: maxNewTokens,
        temperature,
        top_p: topP,
        do_sample: temperature > 0,
    });

    const promptLength = inputs.input_ids.dims?.[1] || 0;
    const generatedTokens = outputs.slice(null, [promptLength, null]);
    const text = state.tokenizer.decode(generatedTokens[0], { skip_special_tokens: true });

    const completionTokens = generatedTokens.dims?.[1] || 0;
    const totalTokens = promptLength + completionTokens;

    return {
        id: `chatcmpl-hf-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: state.loadedModelId,
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: text.trim(),
                },
                finish_reason: 'stop',
            },
        ],
        usage: {
            prompt_tokens: promptLength,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
        },
    };
}

/**
 * Handle a streaming chat completion request via SSE.
 */
async function handleStreamingCompletion(
    req: ChatCompletionRequest,
    res: http.ServerResponse,
): Promise<void> {
    if (!state.tokenizer || !state.model) {
        throw new Error('No model loaded');
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });

    const prompt = formatChatPrompt(req.messages, state.tokenizer);
    const inputs = state.tokenizer(prompt, { return_tensors: 'pt' });
    const maxNewTokens = req.max_tokens || 512;
    const temperature = req.temperature ?? 0.7;
    const topP = req.top_p ?? 0.9;

    const completionId = `chatcmpl-hf-${Date.now()}`;

    try {
        await state.model.generate({
            ...inputs,
            max_new_tokens: maxNewTokens,
            temperature,
            top_p: topP,
            do_sample: temperature > 0,
            callback_function: (output: any) => {
                const lastToken = output.slice(null, [-1, null]);
                const tokenText = state.tokenizer!.decode(lastToken[0], { skip_special_tokens: true });

                if (tokenText) {
                    const chunk = {
                        id: completionId,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: state.loadedModelId,
                        choices: [
                            {
                                index: 0,
                                delta: { content: tokenText },
                                finish_reason: null,
                            },
                        ],
                    };
                    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                }
            },
        });

        const stopChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: state.loadedModelId,
            choices: [
                {
                    index: 0,
                    delta: {},
                    finish_reason: 'stop',
                },
            ],
        };
        res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
    } catch (error) {
        const errorChunk = {
            error: {
                message: error instanceof Error ? error.message : 'Generation failed',
                type: 'server_error',
            },
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
    } finally {
        res.end();
    }
}

/**
 * Read the full request body as a string.
 */
/**
 * Read the full request body as a string.
 * Enforces a max size limit (default 10MB) to prevent OOM.
 */
function readBody(req: http.IncomingMessage, limitBytes = 10 * 1024 * 1024): Promise<string> {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks: Buffer[] = [];

        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > limitBytes) {
                req.destroy(); // Stop receiving data
                reject(new Error('PayloadTooLarge'));
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
    });
}

/**
 * Start the local inference HTTP server.
 */
export async function startServer(
    modelId: string,
): Promise<{ success: boolean; port?: number; error?: string }> {
    if (state.server) {
        // Server already running - just load the new model
        try {
            await loadModel(modelId);
            return { success: true, port: state.port! };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to load model' };
        }
    }

    try {
        await loadModel(modelId);
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to load model' };
    }

    return new Promise((resolve) => {
        const server = http.createServer(async (req, res) => {
            // CORS headers
            const origin = req.headers.origin;
            if (origin && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
            } else {
                res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1');
            }
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            const url = req.url || '';

            try {
                // GET /v1/models
                if (req.method === 'GET' && url === '/v1/models') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(
                        JSON.stringify({
                            object: 'list',
                            data: state.loadedModelId
                                ? [
                                    {
                                        id: state.loadedModelId,
                                        object: 'model',
                                        created: Math.floor(Date.now() / 1000),
                                        owned_by: 'huggingface-local',
                                    },
                                ]
                                : [],
                        }),
                    );
                    return;
                }

                // POST /v1/chat/completions
                if (req.method === 'POST' && url === '/v1/chat/completions') {
                    if (state.isLoading) {
                        res.writeHead(503, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: { message: 'Model is loading, please wait', type: 'server_error' } }));
                        return;
                    }

                    if (!state.model || !state.tokenizer) {
                        res.writeHead(503, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: { message: 'No model loaded', type: 'server_error' } }));
                        return;
                    }

                    const body = await readBody(req);
                    let chatReq: ChatCompletionRequest;
                    try {
                        chatReq = JSON.parse(body);
                    } catch {
                        res.end(JSON.stringify({ error: { message: 'Invalid JSON in request body', type: 'invalid_request_error' } }));
                        return;
                    }

                    if (!Array.isArray(chatReq.messages) || chatReq.messages.length === 0) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: { message: 'messages must be a non-empty array', type: 'invalid_request_error' } }));
                        return;
                    }

                    for (const message of chatReq.messages) {
                        if (
                            !message ||
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (message as any).role === undefined ||
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (message as any).content === undefined ||
                            typeof message.content !== 'string'
                        ) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: { message: 'Invalid message format', type: 'invalid_request_error' } }));
                            return;
                        }
                    }

                    if (chatReq.stream) {
                        await handleStreamingCompletion(chatReq, res);
                    } else {
                        const result = await handleChatCompletion(chatReq);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(result));
                    }
                    return;
                }

                // Health check
                if (req.method === 'GET' && (url === '/health' || url === '/')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(
                        JSON.stringify({
                            status: 'ok',
                            model: state.loadedModelId,
                            isLoading: state.isLoading,
                        }),
                    );
                    return;
                }

                // 404 for everything else
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Not found', type: 'invalid_request' } }));
            } catch (error: any) {
                console.error('[HF Server] Request error:', error);

                if (error.message === 'PayloadTooLarge') {
                    if (!res.headersSent) {
                        res.writeHead(413, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: { message: 'Request entity too large', type: 'invalid_request_error' } }));
                    }
                    return;
                }

                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                }
                res.end(
                    JSON.stringify({
                        error: {
                            message: error instanceof Error ? error.message : 'Internal server error',
                            type: 'server_error',
                        },
                    }),
                );
            }
        });

        // Listen on a random available port on localhost only
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (address && typeof address !== 'string') {
                state.server = server;
                state.port = address.port;
                console.log(`[HF Server] Listening on http://127.0.0.1:${address.port}`);
                resolve({ success: true, port: address.port });
            } else {
                resolve({ success: false, error: 'Failed to get server address' });
            }
        });

        server.on('error', (error) => {
            console.error('[HF Server] Server error:', error);
            resolve({ success: false, error: error.message });
        });
    });
}

/**
 * Stop the local inference server and unload the model.
 */
export async function stopServer(): Promise<void> {
    if (state.model) {
        try {
            await state.model.dispose?.();
        } catch {
            // Ignore dispose errors
        }
    }

    if (state.server) {
        return new Promise((resolve) => {
            state.server!.close(() => {
                console.log('[HF Server] Server stopped');
                state.server = null;
                state.port = null;
                state.loadedModelId = null;
                state.pipeline = null;
                state.tokenizer = null;
                state.model = null;
                state.isLoading = false;
                resolve();
            });
        });
    }

    state.loadedModelId = null;
    state.pipeline = null;
    state.tokenizer = null;
    state.model = null;
    state.isLoading = false;
}

/**
 * Get the current server status.
 */
export function getServerStatus(): {
    running: boolean;
    port: number | null;
    loadedModel: string | null;
    isLoading: boolean;
} {
    return {
        running: state.server !== null,
        port: state.port,
        loadedModel: state.loadedModelId,
        isLoading: state.isLoading,
    };
}

/**
 * Test that the server is running and responsive.
 */
export async function testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!state.server || !state.port) {
        return { success: false, error: 'Server is not running' };
    }

    try {
        const response = await fetch(`http://127.0.0.1:${state.port}/health`);
        if (response.ok) {
            return { success: true };
        }
        return { success: false, error: `Health check failed with status ${response.status}` };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
    }
}
