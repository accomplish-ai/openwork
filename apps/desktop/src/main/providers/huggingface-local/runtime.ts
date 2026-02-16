import { EventEmitter } from 'events';
import http from 'http';
import type { Socket } from 'net';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import type {
  HuggingFaceDevicePreference,
  HuggingFaceQuantization,
} from '@accomplish_ai/agent-core';

const SERVER_PORT = 9231;
const MAX_REQUEST_SIZE = 10 * 1024 * 1024;
const REQUEST_BODY_TIMEOUT_MS = 30_000;
const SERVER_SHUTDOWN_TIMEOUT_MS = 3_000;
const MANIFEST_VERSION = 1;

const CURATED_MODELS: Array<{
  modelId: string;
  displayName: string;
  family: string;
  suggestedQuantizations: HuggingFaceQuantization[];
}> = [
  {
    modelId: 'onnx-community/Llama-3.2-1B-Instruct',
    displayName: 'Llama 3.2 1B Instruct',
    family: 'Llama 3.2',
    suggestedQuantizations: ['q4', 'q8'],
  },
  {
    modelId: 'onnx-community/Llama-3.2-3B-Instruct',
    displayName: 'Llama 3.2 3B Instruct',
    family: 'Llama 3.2',
    suggestedQuantizations: ['q4', 'q8'],
  },
  {
    modelId: 'onnx-community/Phi-3.5-mini-instruct-onnx',
    displayName: 'Phi-3.5 Mini Instruct',
    family: 'Phi-3',
    suggestedQuantizations: ['q4', 'q8', 'fp16'],
  },
  {
    modelId: 'onnx-community/gemma-2-2b-it',
    displayName: 'Gemma 2 2B Instruct',
    family: 'Gemma',
    suggestedQuantizations: ['q4', 'q8'],
  },
  {
    modelId: 'onnx-community/Qwen2.5-1.5B-Instruct',
    displayName: 'Qwen2.5 1.5B Instruct',
    family: 'Qwen2',
    suggestedQuantizations: ['q4', 'q8', 'fp16'],
  },
];

export interface HuggingFaceLocalRuntimeConfig {
  modelId: string;
  quantization: HuggingFaceQuantization;
  devicePreference: HuggingFaceDevicePreference;
}

export interface HuggingFaceHubModel {
  modelId: string;
  displayName: string;
  likes: number;
  downloads: number;
  lastModified: string;
  tags: string[];
  suggestedQuantizations: HuggingFaceQuantization[];
}

export interface HuggingFaceInstalledModel {
  id: string;
  modelId: string;
  displayName: string;
  quantization: HuggingFaceQuantization;
  devicePreference: HuggingFaceDevicePreference;
  downloadedAt: string;
  sizeBytes?: number;
  status: 'ready' | 'downloading' | 'error';
  error?: string;
}

interface HuggingFaceManifest {
  version: number;
  models: HuggingFaceInstalledModel[];
  updatedAt: string;
}

export interface HuggingFaceDownloadProgressEvent {
  modelId: string;
  quantization: HuggingFaceQuantization;
  devicePreference: HuggingFaceDevicePreference;
  phase: 'starting' | 'downloading' | 'loading' | 'ready' | 'error';
  progress: number;
  loadedBytes?: number;
  totalBytes?: number;
  file?: string;
  message?: string;
}

export interface HuggingFaceHardwareInfo {
  webGpuLikelyAvailable: boolean;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  cpuModel: string;
  cpuCount: number;
}

interface PipelineRuntime {
  generator: any;
  transformers: any;
}

const progressEvents = new EventEmitter();
const runtimeByKey = new Map<string, Promise<PipelineRuntime>>();
const downloadByKey = new Map<string, Promise<HuggingFaceInstalledModel>>();
const activeSockets = new Set<Socket>();

let server: http.Server | null = null;
let activeConfig: HuggingFaceLocalRuntimeConfig | null = null;

function getRootDir(): string {
  return path.join(app.getPath('userData'), 'huggingface-local');
}

function getCacheDir(): string {
  return path.join(getRootDir(), 'cache');
}

function getManifestPath(): string {
  return path.join(getRootDir(), 'manifest.json');
}

function ensureDirs(): void {
  const root = getRootDir();
  const cache = getCacheDir();

  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  if (!fs.existsSync(cache)) {
    fs.mkdirSync(cache, { recursive: true });
  }
}

function defaultManifest(): HuggingFaceManifest {
  return {
    version: MANIFEST_VERSION,
    models: [],
    updatedAt: new Date().toISOString(),
  };
}

function readManifest(): HuggingFaceManifest {
  ensureDirs();
  const manifestPath = getManifestPath();

  if (!fs.existsSync(manifestPath)) {
    return defaultManifest();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Partial<HuggingFaceManifest>;

    if (!Array.isArray(parsed.models)) {
      return defaultManifest();
    }

    return {
      version: typeof parsed.version === 'number' ? parsed.version : MANIFEST_VERSION,
      models: parsed.models,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return defaultManifest();
  }
}

function writeManifest(manifest: HuggingFaceManifest): void {
  ensureDirs();
  const nextManifest: HuggingFaceManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(getManifestPath(), JSON.stringify(nextManifest, null, 2));
}

function runtimeKey(config: HuggingFaceLocalRuntimeConfig): string {
  return `${config.modelId}::${config.quantization}::${config.devicePreference}`;
}

function modelDisplayName(modelId: string): string {
  const curated = CURATED_MODELS.find((m) => m.modelId === modelId);
  if (curated) return curated.displayName;
  const tail = modelId.split('/').pop() || modelId;
  return tail.replace(/[-_]+/g, ' ').trim();
}

function modelRecordId(
  modelId: string,
  quantization: HuggingFaceQuantization,
  devicePreference: HuggingFaceDevicePreference
): string {
  return `huggingface-local/${modelId}::${quantization}::${devicePreference}`;
}

function upsertManifestModel(model: HuggingFaceInstalledModel): HuggingFaceInstalledModel {
  const manifest = readManifest();
  const existingIndex = manifest.models.findIndex(
    (m) =>
      m.modelId === model.modelId &&
      m.quantization === model.quantization &&
      m.devicePreference === model.devicePreference
  );

  if (existingIndex >= 0) {
    manifest.models[existingIndex] = model;
  } else {
    manifest.models.push(model);
  }

  writeManifest(manifest);
  return model;
}

function listInstalledModelsInternal(): HuggingFaceInstalledModel[] {
  return readManifest().models;
}

function emitProgress(event: HuggingFaceDownloadProgressEvent): void {
  progressEvents.emit('progress', event);
}

function parseProgressEvent(raw: Record<string, unknown>): {
  phase: HuggingFaceDownloadProgressEvent['phase'];
  progress: number;
  loadedBytes?: number;
  totalBytes?: number;
  file?: string;
  message?: string;
} {
  const status = typeof raw.status === 'string' ? raw.status.toLowerCase() : '';
  const progress = typeof raw.progress === 'number'
    ? Math.max(0, Math.min(100, raw.progress <= 1 ? raw.progress * 100 : raw.progress))
    : 0;

  const loaded = typeof raw.loaded === 'number' ? raw.loaded : undefined;
  const total = typeof raw.total === 'number' ? raw.total : undefined;

  let phase: HuggingFaceDownloadProgressEvent['phase'] = 'downloading';
  if (status.includes('init') || status.includes('download')) {
    phase = 'downloading';
  } else if (status.includes('ready') || status.includes('done')) {
    phase = 'ready';
  } else if (status.includes('load')) {
    phase = 'loading';
  }

  return {
    phase,
    progress,
    loadedBytes: loaded,
    totalBytes: total,
    file: typeof raw.file === 'string' ? raw.file : undefined,
    message: typeof raw.status === 'string' ? raw.status : undefined,
  };
}

function estimateWebGpuAvailability(): boolean {
  if (process.platform === 'darwin') {
    return true;
  }

  if (process.platform === 'win32') {
    return true;
  }

  return process.platform === 'linux';
}

async function loadTransformersModule(): Promise<any> {
  const packageName = '@huggingface/transformers';
  const dynamicImport = new Function('moduleName', 'return import(moduleName)') as (
    moduleName: string
  ) => Promise<any>;

  try {
    return await dynamicImport(packageName);
  } catch {
    throw new Error(
      'Transformers.js package is not available. Install @huggingface/transformers in apps/desktop dependencies.'
    );
  }
}

function normalizeDevice(devicePreference: HuggingFaceDevicePreference): string | undefined {
  switch (devicePreference) {
    case 'auto':
      return undefined;
    case 'cpu':
      return 'cpu';
    case 'wasm':
      return 'wasm';
    case 'webgpu':
      return 'webgpu';
    default:
      return undefined;
  }
}

function normalizeQuantization(quantization: HuggingFaceQuantization): {
  dtype?: string;
  quantized?: boolean;
} {
  switch (quantization) {
    case 'q4':
      return { dtype: 'q4', quantized: true };
    case 'q8':
      return { dtype: 'q8', quantized: true };
    case 'fp16':
      return { dtype: 'fp16', quantized: false };
    case 'fp32':
      return { dtype: 'fp32', quantized: false };
    default:
      return { quantized: true };
  }
}

function buildPromptFromMessages(messages: Array<Record<string, unknown>>): string {
  const lines: string[] = [];

  for (const message of messages) {
    const role = typeof message.role === 'string' ? message.role : 'user';
    const content = message.content;
    let text = '';

    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object' && 'text' in entry) {
            const textValue = (entry as { text?: unknown }).text;
            return typeof textValue === 'string' ? textValue : '';
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    if (!text.trim()) continue;

    if (role === 'system') {
      lines.push(`System: ${text}`);
      continue;
    }

    if (role === 'assistant') {
      lines.push(`Assistant: ${text}`);
      continue;
    }

    if (role === 'tool') {
      lines.push(`Tool: ${text}`);
      continue;
    }

    lines.push(`User: ${text}`);
  }

  lines.push('Assistant:');
  return lines.join('\n\n');
}

function extractGeneratedText(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  if (Array.isArray(result) && result.length > 0) {
    const first = result[0] as Record<string, unknown>;
    if (typeof first.generated_text === 'string') {
      return first.generated_text;
    }
  }

  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if (typeof record.generated_text === 'string') {
      return record.generated_text;
    }
  }

  return '';
}

async function ensurePipeline(config: HuggingFaceLocalRuntimeConfig): Promise<PipelineRuntime> {
  const key = runtimeKey(config);
  const existing = runtimeByKey.get(key);
  if (existing) {
    return existing;
  }

  const loader = (async (): Promise<PipelineRuntime> => {
    const transformers = await loadTransformersModule();

    ensureDirs();

    if (transformers.env) {
      transformers.env.allowRemoteModels = true;
      transformers.env.allowLocalModels = true;
      transformers.env.cacheDir = getCacheDir();

      if (transformers.env.backends?.onnx?.wasm) {
        transformers.env.backends.onnx.wasm.proxy = false;
      }
    }

    const quantizationOptions = normalizeQuantization(config.quantization);

    const generator = await transformers.pipeline('text-generation', config.modelId, {
      device: normalizeDevice(config.devicePreference),
      ...quantizationOptions,
      progress_callback: (rawEvent: Record<string, unknown>) => {
        const parsed = parseProgressEvent(rawEvent);
        emitProgress({
          modelId: config.modelId,
          quantization: config.quantization,
          devicePreference: config.devicePreference,
          ...parsed,
        });
      },
    });

    return { generator, transformers };
  })();

  runtimeByKey.set(key, loader);

  try {
    return await loader;
  } catch (error) {
    runtimeByKey.delete(key);
    throw error;
  }
}

async function ensureModelDownloaded(config: HuggingFaceLocalRuntimeConfig): Promise<HuggingFaceInstalledModel> {
  const key = runtimeKey(config);
  const inFlight = downloadByKey.get(key);
  if (inFlight) {
    return inFlight;
  }

  const downloadTask = (async () => {
    emitProgress({
      modelId: config.modelId,
      quantization: config.quantization,
      devicePreference: config.devicePreference,
      phase: 'starting',
      progress: 0,
      message: 'Starting model download',
    });

    upsertManifestModel({
      id: modelRecordId(config.modelId, config.quantization, config.devicePreference),
      modelId: config.modelId,
      displayName: modelDisplayName(config.modelId),
      quantization: config.quantization,
      devicePreference: config.devicePreference,
      downloadedAt: new Date().toISOString(),
      status: 'downloading',
    });

    try {
      await ensurePipeline(config);

      const readyModel = upsertManifestModel({
        id: modelRecordId(config.modelId, config.quantization, config.devicePreference),
        modelId: config.modelId,
        displayName: modelDisplayName(config.modelId),
        quantization: config.quantization,
        devicePreference: config.devicePreference,
        downloadedAt: new Date().toISOString(),
        status: 'ready',
      });

      emitProgress({
        modelId: config.modelId,
        quantization: config.quantization,
        devicePreference: config.devicePreference,
        phase: 'ready',
        progress: 100,
        message: 'Model ready',
      });

      return readyModel;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load model';

      upsertManifestModel({
        id: modelRecordId(config.modelId, config.quantization, config.devicePreference),
        modelId: config.modelId,
        displayName: modelDisplayName(config.modelId),
        quantization: config.quantization,
        devicePreference: config.devicePreference,
        downloadedAt: new Date().toISOString(),
        status: 'error',
        error: message,
      });

      emitProgress({
        modelId: config.modelId,
        quantization: config.quantization,
        devicePreference: config.devicePreference,
        phase: 'error',
        progress: 0,
        message,
      });

      throw error;
    }
  })();

  downloadByKey.set(key, downloadTask);

  try {
    return await downloadTask;
  } finally {
    downloadByKey.delete(key);
  }
}

function createCompletionId(): string {
  return `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidApiPath(pathname: string): boolean {
  if (pathname === '/health') return true;
  if (pathname === '/v1/models') return true;
  if (pathname === '/v1/chat/completions') return true;
  return false;
}

async function readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let settled = false;

    const cleanup = (): void => {
      clearTimeout(timeout);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAborted);
    };

    const finishResolve = (body: Buffer): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(body);
    };

    const finishReject = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const timeout = setTimeout(() => {
      finishReject(new Error('Request body timed out'));
      req.destroy();
    }, REQUEST_BODY_TIMEOUT_MS);

    const onData = (chunk: Buffer | string): void => {
      const buffer = Buffer.from(chunk);
      totalSize += buffer.length;

      if (totalSize > MAX_REQUEST_SIZE) {
        finishReject(new Error('Request too large'));
        req.destroy();
        return;
      }

      chunks.push(buffer);
    };

    const onEnd = (): void => {
      finishResolve(Buffer.concat(chunks));
    };

    const onError = (error: Error): void => {
      finishReject(error);
    };

    const onAborted = (): void => {
      finishReject(new Error('Request aborted'));
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
  });
}

async function handleChatCompletions(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!activeConfig) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'HuggingFace local model is not configured',
    }));
    return;
  }

  let payload: Record<string, unknown>;
  try {
    const body = await readRequestBody(req);
    payload = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : 'Invalid request payload',
    }));
    return;
  }

  const messages = Array.isArray(payload.messages)
    ? (payload.messages as Array<Record<string, unknown>>)
    : [];
  const prompt = buildPromptFromMessages(messages);

  const maxTokensRaw = payload.max_tokens ?? payload.max_completion_tokens;
  const maxTokens = typeof maxTokensRaw === 'number' ? Math.max(1, Math.min(4096, maxTokensRaw)) : 1024;
  const temperature = typeof payload.temperature === 'number'
    ? Math.max(0, Math.min(2, payload.temperature))
    : 0.7;
  const stream = payload.stream === true;

  const completionId = createCompletionId();
  const created = Math.floor(Date.now() / 1000);
  const modelName = activeConfig.modelId;

  try {
    const runtime = await ensurePipeline(activeConfig);
    const generator = runtime.generator;

    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const writeChunk = (chunk: Record<string, unknown>) => {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      };

      writeChunk({
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model: modelName,
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
      });

      const tokenizer = generator?.tokenizer;
      const TextStreamer = runtime.transformers?.TextStreamer;

      if (tokenizer && TextStreamer) {
        const streamer = new TextStreamer(tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: (text: string) => {
            if (!text) return;
            writeChunk({
              id: completionId,
              object: 'chat.completion.chunk',
              created,
              model: modelName,
              choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
            });
          },
        });

        await generator(prompt, {
          max_new_tokens: maxTokens,
          temperature,
          return_full_text: false,
          streamer,
        });
      } else {
        const result = await generator(prompt, {
          max_new_tokens: maxTokens,
          temperature,
          return_full_text: false,
        });
        const text = extractGeneratedText(result);
        if (text) {
          writeChunk({
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model: modelName,
            choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
          });
        }
      }

      writeChunk({
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model: modelName,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const result = await generator(prompt, {
      max_new_tokens: maxTokens,
      temperature,
      return_full_text: false,
    });

    const text = extractGeneratedText(result);
    const responseBody = {
      id: completionId,
      object: 'chat.completion',
      created,
      model: modelName,
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: text,
          },
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(responseBody));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }
}

function handleServerRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url || '/', 'http://localhost');

  if (!isValidApiPath(url.pathname)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      model: activeConfig?.modelId || null,
      port: SERVER_PORT,
    }));
    return;
  }

  if (url.pathname === '/v1/models') {
    const models = listInstalledModelsInternal().filter((model) => model.status === 'ready');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      object: 'list',
      data: models.map((model) => ({
        id: model.modelId,
        object: 'model',
        owned_by: 'huggingface-local',
      })),
    }));
    return;
  }

  if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
    void handleChatCompletions(req, res);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

export function onHuggingFaceDownloadProgress(
  listener: (event: HuggingFaceDownloadProgressEvent) => void
): () => void {
  progressEvents.on('progress', listener);
  return () => {
    progressEvents.off('progress', listener);
  };
}

export async function searchHuggingFaceHubModels(query: string): Promise<HuggingFaceHubModel[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return CURATED_MODELS.map((model) => ({
      modelId: model.modelId,
      displayName: model.displayName,
      likes: 0,
      downloads: 0,
      lastModified: '',
      tags: [model.family],
      suggestedQuantizations: model.suggestedQuantizations,
    }));
  }

  const url = new URL('https://huggingface.co/api/models');
  url.searchParams.set('search', trimmed);
  url.searchParams.set('limit', '25');
  url.searchParams.set('sort', 'downloads');
  url.searchParams.set('direction', '-1');
  url.searchParams.set('pipeline_tag', 'text-generation');

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Hugging Face model search failed with status ${response.status}`);
  }

  const data = (await response.json()) as Array<Record<string, unknown>>;

  return data
    .map((item) => {
      const modelId = typeof item.id === 'string' ? item.id : '';
      if (!modelId) return null;

      const curated = CURATED_MODELS.find((model) => model.modelId === modelId);

      return {
        modelId,
        displayName: curated?.displayName || modelDisplayName(modelId),
        likes: typeof item.likes === 'number' ? item.likes : 0,
        downloads: typeof item.downloads === 'number' ? item.downloads : 0,
        lastModified: typeof item.lastModified === 'string' ? item.lastModified : '',
        tags: Array.isArray(item.tags)
          ? item.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
        suggestedQuantizations: curated?.suggestedQuantizations || ['q4', 'q8', 'fp16'],
      } as HuggingFaceHubModel;
    })
    .filter((item): item is HuggingFaceHubModel => Boolean(item));
}

export async function downloadHuggingFaceModel(
  config: HuggingFaceLocalRuntimeConfig
): Promise<HuggingFaceInstalledModel> {
  return ensureModelDownloaded(config);
}

export function listHuggingFaceInstalledModels(): HuggingFaceInstalledModel[] {
  return listInstalledModelsInternal();
}

export async function ensureHuggingFaceLocalServer(
  config: HuggingFaceLocalRuntimeConfig
): Promise<{ baseURL: string; port: number }> {
  await ensureModelDownloaded(config);

  activeConfig = config;

  if (!server) {
    server = http.createServer(handleServerRequest);
    server.on('connection', (socket: Socket) => {
      activeSockets.add(socket);
      socket.once('close', () => {
        activeSockets.delete(socket);
      });
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out starting Hugging Face local server'));
      }, 5000);

      server!.once('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        server = null;
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${SERVER_PORT} is already in use`));
          return;
        }
        reject(error);
      });

      server!.listen(SERVER_PORT, '127.0.0.1', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  return {
    baseURL: `http://127.0.0.1:${SERVER_PORT}`,
    port: SERVER_PORT,
  };
}

export async function stopHuggingFaceLocalServer(): Promise<void> {
  activeConfig = null;

  if (!server) {
    return;
  }

  const serverToClose = server;
  server = null;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (typeof serverToClose.closeAllConnections === 'function') {
        serverToClose.closeAllConnections();
      } else {
        for (const socket of activeSockets) {
          socket.destroy();
        }
      }
      activeSockets.clear();
      resolve();
    }, SERVER_SHUTDOWN_TIMEOUT_MS);

    serverToClose.close((error) => {
      clearTimeout(timeout);
      activeSockets.clear();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });

    if (typeof serverToClose.closeAllConnections === 'function') {
      serverToClose.closeAllConnections();
    } else {
      for (const socket of activeSockets) {
        socket.end();
      }
    }
  });
}

export function getHuggingFaceHardwareInfo(): HuggingFaceHardwareInfo {
  const cpus = os.cpus();
  return {
    webGpuLikelyAvailable: estimateWebGpuAvailability(),
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    cpuModel: cpus[0]?.model || 'Unknown',
    cpuCount: cpus.length,
  };
}

export function getHuggingFaceCacheDir(): string {
  ensureDirs();
  return getCacheDir();
}
