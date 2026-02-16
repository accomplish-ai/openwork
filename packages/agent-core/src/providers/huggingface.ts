import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import type { HuggingFaceModel } from '../common/types/provider.js';

export type { HuggingFaceModel };

export const HUGGINGFACE_DEFAULT_PORT = 9230;

interface ModelRegistryEntry {
  id: string;
  name: string;
  size: string;
  toolSupport: 'supported' | 'unsupported' | 'unknown';
}

const MODEL_REGISTRY: ModelRegistryEntry[] = [
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    name: 'Qwen 2.5 0.5B Instruct',
    size: '0.5B',
    toolSupport: 'unsupported',
  },
  {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    name: 'Qwen 2.5 1.5B Instruct',
    size: '1.5B',
    toolSupport: 'unsupported',
  },
  {
    id: 'onnx-community/Phi-3.5-mini-instruct-onnx-web',
    name: 'Phi 3.5 Mini Instruct',
    size: '3.8B',
    toolSupport: 'unsupported',
  },
  {
    id: 'onnx-community/Llama-3.2-1B-Instruct',
    name: 'Llama 3.2 1B Instruct',
    size: '1B',
    toolSupport: 'unsupported',
  },
  {
    id: 'onnx-community/gemma-2-2b-it-ONNX',
    name: 'Gemma 2 2B IT',
    size: '2B',
    toolSupport: 'unsupported',
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadedPipelines = new Map<string, any>();
let activeServer: http.Server | null = null;
let activeServerPort: number | null = null;

function checkDownloadedModels(modelsDir: string): Set<string> {
  const downloaded = new Set<string>();
  if (!fs.existsSync(modelsDir)) {
    return downloaded;
  }
  for (const model of MODEL_REGISTRY) {
    const onnxPath = path.join(modelsDir, ...model.id.split('/'), 'onnx', 'model_q4.onnx');
    if (fs.existsSync(onnxPath)) {
      downloaded.add(model.id);
    }
  }
  return downloaded;
}

function streamDownloadToFile(
  url: string,
  destPath: string,
  maxRedirects = 5,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, (response) => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        if (maxRedirects <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        streamDownloadToFile(response.headers.location, destPath, maxRedirects - 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`HTTP ${status} downloading ${path.basename(destPath)}`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', (err) => {
        fs.unlink(destPath, () => { });
        reject(err);
      });
      response.on('error', (err) => {
        file.destroy();
        fs.unlink(destPath, () => { });
        reject(err);
      });
    }).on('error', reject);
  });
}

async function configureTransformersEnv(modelsDir: string) {
  const { env } = await import('@huggingface/transformers');
  env.cacheDir = modelsDir;
  env.allowLocalModels = true;
  return import('@huggingface/transformers');
}

export function listHuggingFaceModels(modelsDir: string): HuggingFaceModel[] {
  const downloaded = checkDownloadedModels(modelsDir);
  return MODEL_REGISTRY.map((m) => ({
    id: m.id,
    name: m.name,
    size: m.size,
    toolSupport: m.toolSupport,
    downloaded: downloaded.has(m.id),
  }));
}

/** Files required by pipeline('text-generation', model, { dtype: 'q4' }) */
const REQUIRED_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'generation_config.json',
  'onnx/model_q4.onnx',
];

export async function downloadHuggingFaceModel(
  modelsDir: string,
  modelId: string,
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; error?: string }> {
  const modelInfo = MODEL_REGISTRY.find((m) => m.id === modelId);
  if (!modelInfo) {
    return { success: false, error: `Unknown model: ${modelId}` };
  }

  const downloaded = checkDownloadedModels(modelsDir);
  if (downloaded.has(modelId)) {
    return { success: true };
  }

  try {
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    onProgress?.(0);
    console.log(`[HuggingFace] Downloading model files: ${modelId}`);

    const modelCacheDir = path.join(modelsDir, ...modelId.split('/'));
    let filesCompleted = 0;

    for (const filename of REQUIRED_FILES) {
      const filePath = path.join(modelCacheDir, filename);

      if (fs.existsSync(filePath)) {
        filesCompleted++;
        onProgress?.(Math.round((filesCompleted / REQUIRED_FILES.length) * 100));
        continue;
      }

      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      const encodedPath = filename.split('/').map(encodeURIComponent).join('/');
      const downloadUrl = `https://huggingface.co/${modelId}/resolve/main/${encodedPath}`;

      console.log(`[HuggingFace]   Downloading ${filename}...`);
      await streamDownloadToFile(downloadUrl, filePath);

      filesCompleted++;
      onProgress?.(Math.round((filesCompleted / REQUIRED_FILES.length) * 100));
    }

    onProgress?.(100);
    console.log(`[HuggingFace] Model downloaded: ${modelId} (${REQUIRED_FILES.length} files)`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Download failed';
    console.error(`[HuggingFace] Download failed for ${modelId}:`, message);
    return { success: false, error: `Failed to download model: ${message}` };
  }
}

function jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function formatChatMessages(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((m) => {
      if (m.role === 'system') {
        return `System: ${m.content}`;
      }
      if (m.role === 'user') {
        return `User: ${m.content}`;
      }
      if (m.role === 'assistant') {
        return `Assistant: ${m.content}`;
      }
      return m.content;
    })
    .join('\n');
}

function createHuggingFaceServer(modelsDir: string): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost`);
    const pathname = url.pathname;

    try {
      if (req.method === 'GET' && pathname === '/health') {
        jsonResponse(res, 200, { status: 'ok' });
      } else if (req.method === 'GET' && pathname === '/v1/models') {
        const models = listHuggingFaceModels(modelsDir);
        jsonResponse(res, 200, {
          object: 'list',
          data: models.map((m) => ({
            id: m.id,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'huggingface',
            meta: {
              name: m.name,
              size: m.size,
              toolSupport: m.toolSupport,
              downloaded: m.downloaded,
            },
          })),
        });
      } else if (req.method === 'POST' && pathname === '/v1/chat/completions') {
        const body = await readBody(req);
        const model = body.model as string | undefined;
        const messages = body.messages as Array<{ role: string; content: string }> | undefined;
        const maxTokens = (body.max_tokens as number) || 512;

        if (!model) {
          jsonResponse(res, 400, { error: { message: 'model is required' } });
          return;
        }
        if (!messages || !Array.isArray(messages)) {
          jsonResponse(res, 400, { error: { message: 'messages array is required' } });
          return;
        }

        const downloadedModels = checkDownloadedModels(modelsDir);
        if (!downloadedModels.has(model)) {
          jsonResponse(res, 404, {
            error: { message: `Model ${model} is not downloaded. Download it first.` },
          });
          return;
        }

        try {
          let generator = loadedPipelines.get(model);
          if (!generator) {
            const { pipeline } = await configureTransformersEnv(modelsDir);

            console.log(`[HuggingFace] Loading model into memory: ${model}`);
            generator = await pipeline('text-generation', model, {
              dtype: 'q4',
              local_files_only: true,
            });
            loadedPipelines.set(model, generator);
            console.log(`[HuggingFace] Model loaded: ${model}`);
          }

          const prompt = formatChatMessages(messages);
          const result = await generator(prompt, {
            max_new_tokens: maxTokens,
            do_sample: true,
            temperature: 0.7,
          });

          const generatedText =
            Array.isArray(result) && result[0]?.generated_text
              ? (result[0].generated_text as string).slice(prompt.length).trim()
              : '';

          jsonResponse(res, 200, {
            id: `chatcmpl-hf-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: generatedText },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          });
        } catch (err) {
          console.error(`[HuggingFace] Inference error:`, err);
          jsonResponse(res, 500, {
            error: { message: `Inference failed: ${err instanceof Error ? err.message : 'Unknown error'}` },
          });
        }
      } else if (req.method === 'POST' && pathname === '/shutdown') {
        jsonResponse(res, 200, { status: 'shutting_down' });
        setTimeout(() => {
          server.close();
          activeServer = null;
          activeServerPort = null;
        }, 100);
      } else {
        jsonResponse(res, 404, { error: { message: 'Not found' } });
      }
    } catch (err) {
      console.error('[HuggingFace] Request error:', err);
      jsonResponse(res, 500, {
        error: { message: err instanceof Error ? err.message : 'Internal server error' },
      });
    }
  });

  return server;
}

export async function ensureHuggingFaceServer(
  config: { modelsDir: string; port?: number }
): Promise<{ ready: boolean; port: number }> {
  const port = config.port ?? HUGGINGFACE_DEFAULT_PORT;

  if (activeServer && activeServerPort === port) {
    return { ready: true, port };
  }

  if (!fs.existsSync(config.modelsDir)) {
    fs.mkdirSync(config.modelsDir, { recursive: true });
  }

  const server = createHuggingFaceServer(config.modelsDir);

  return new Promise((resolve) => {
    server.on('error', (err) => {
      console.error('[HuggingFace] Server error:', err);
      resolve({ ready: false, port });
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`[HuggingFace] In-process server listening on http://127.0.0.1:${port}`);
      activeServer = server;
      activeServerPort = port;
      resolve({ ready: true, port });
    });
  });
}

export async function stopHuggingFaceServer(port?: number): Promise<void> {
  const targetPort = port ?? HUGGINGFACE_DEFAULT_PORT;

  if (activeServer && activeServerPort === targetPort) {
    return new Promise((resolve) => {
      activeServer!.close(() => {
        console.log('[HuggingFace] Server stopped');
        activeServer = null;
        activeServerPort = null;
        resolve();
      });
    });
  }
}
