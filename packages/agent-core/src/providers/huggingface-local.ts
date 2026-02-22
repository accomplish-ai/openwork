import type { ToolSupportStatus } from '../common/types/providerSettings.js';
import type { HuggingFaceLocalConfig } from '../common/types/provider.js';

import { getModelDisplayName } from '../common/constants/model-display.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { validateHttpUrl } from '../utils/url.js';
import { sanitizeString } from '../utils/sanitize.js';

/** Default timeout for HuggingFace local server API requests in milliseconds */
const HF_LOCAL_API_TIMEOUT_MS = 15000;

/** Default server URL for the local HuggingFace inference server */
export const HF_LOCAL_DEFAULT_URL = 'http://localhost:8787';

/** Models recommended for initial setup */
export const HF_RECOMMENDED_MODELS = [
  {
    id: 'onnx-community/Llama-3.2-1B-Instruct-q4f16',
    displayName: 'Llama 3.2 1B Instruct (Q4)',
    size: 750_000_000,
    quantization: 'q4f16',
  },
  {
    id: 'onnx-community/Phi-3-mini-4k-instruct-onnx-web',
    displayName: 'Phi-3 Mini 4K Instruct',
    size: 2_300_000_000,
    quantization: 'fp16',
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    displayName: 'Qwen 2.5 0.5B Instruct',
    size: 500_000_000,
    quantization: 'q4f16',
  },
];

export interface HuggingFaceLocalModel {
  id: string;
  displayName: string;
  size: number;
  quantization?: string;
  toolSupport?: ToolSupportStatus;
}

export interface HuggingFaceLocalConnectionResult {
  success: boolean;
  error?: string;
  models?: HuggingFaceLocalModel[];
}

export interface HuggingFaceModelDownloadProgress {
  modelId: string;
  status: 'downloading' | 'complete' | 'error';
  progress: number;
  totalBytes: number;
  downloadedBytes: number;
  error?: string;
}

/** Response type from local HuggingFace server /v1/models endpoint */
interface HFModelsResponse {
  data?: Array<{
    id: string;
    object: string;
    owned_by?: string;
  }>;
}

/**
 * Tests connection to a local HuggingFace inference server.
 *
 * The server exposes an OpenAI-compatible API (via @huggingface/transformers
 * running in a Node.js process with ONNX Runtime).
 *
 * @param url - The server URL (default: http://localhost:8787)
 * @returns Connection result with success status and available models
 */
export async function testHuggingFaceLocalConnection(
  url: string,
): Promise<HuggingFaceLocalConnectionResult> {
  const sanitizedUrl = sanitizeString(url, 'huggingFaceLocalUrl', 256);

  try {
    validateHttpUrl(sanitizedUrl, 'HuggingFace Local URL');
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Invalid URL format' };
  }

  try {
    const response = await fetchWithTimeout(
      `${sanitizedUrl}/v1/models`,
      { method: 'GET' },
      HF_LOCAL_API_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`HuggingFace Local server returned status ${response.status}`);
    }

    const data = (await response.json()) as HFModelsResponse;
    const rawModels = data.data || [];

    const models: HuggingFaceLocalModel[] = rawModels.map((m) => ({
      id: m.id,
      displayName: getModelDisplayName(m.id),
      size: 0,
      toolSupport: 'unknown' as ToolSupportStatus,
    }));

    return { success: true, models };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Connection timed out. Make sure the HuggingFace local inference server is running.',
      };
    }
    return { success: false, error: `Cannot connect to HuggingFace Local: ${message}` };
  }
}

/**
 * Validates a HuggingFace Local configuration.
 */
export function validateHuggingFaceLocalConfig(config: HuggingFaceLocalConfig): void {
  if (!config.serverUrl) {
    throw new Error('Server URL is required');
  }
  validateHttpUrl(config.serverUrl, 'HuggingFace Local server URL');
}

/**
 * Fetches available models from the local HuggingFace inference server
 * by querying the OpenAI-compatible /v1/models endpoint.
 *
 * @param options.baseUrl - The server URL (e.g. http://localhost:8787)
 * @returns Array of available models with their metadata
 * @throws If the server is unreachable or returns an error
 */
export async function fetchHuggingFaceLocalModels(options: {
  baseUrl: string;
}): Promise<HuggingFaceLocalModel[]> {
  const result = await testHuggingFaceLocalConnection(options.baseUrl);
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch models');
  }
  return result.models || [];
}
