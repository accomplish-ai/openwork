import type { ProviderType } from '../common/types/provider.js';
import { DEFAULT_PROVIDERS, STANDARD_VALIDATION_PROVIDERS, ZAI_ENDPOINTS } from '../common/types/provider.js';
import type { ZaiRegion } from '../common/types/providerSettings.js';

import { fetchWithTimeout } from '../utils/fetch.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ValidationOptions {
  baseUrl?: string;
  timeout?: number;
  zaiRegion?: ZaiRegion;
}

const DEFAULT_TIMEOUT_MS = 10000;

interface StandardValidationRequest {
  url: string;
  init: RequestInit;
}

function buildStandardValidationRequest(
  provider: ProviderType,
  apiKey: string,
  options?: ValidationOptions
): StandardValidationRequest | null {
  if (!STANDARD_VALIDATION_PROVIDERS.has(provider)) {
    return null;
  }

  const providerConfig = DEFAULT_PROVIDERS.find((config) => config.id === provider);
  const modelsEndpoint = providerConfig?.modelsEndpoint;

  if (!modelsEndpoint) {
    return null;
  }

  let url = modelsEndpoint.url;
  if (provider === 'openai' && options?.baseUrl) {
    const normalizedBaseUrl = options.baseUrl.replace(/\/+$/, '');
    url = `${normalizedBaseUrl}/models`;
  }
  if (provider === 'zai') {
    const zaiRegion = options?.zaiRegion ?? 'international';
    url = `${ZAI_ENDPOINTS[zaiRegion]}/models`;
  }

  const headers: Record<string, string> = { ...(modelsEndpoint.extraHeaders ?? {}) };

  if (modelsEndpoint.authStyle === 'bearer') {
    headers.Authorization = `Bearer ${apiKey}`;
  } else if (modelsEndpoint.authStyle === 'x-api-key') {
    headers['x-api-key'] = apiKey;
  } else if (modelsEndpoint.authStyle === 'query-param') {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}key=${encodeURIComponent(apiKey)}`;
  }

  const init: RequestInit = { method: 'GET' };
  if (Object.keys(headers).length > 0) {
    init.headers = headers;
  }

  return { url, init };
}

export async function validateApiKey(
  provider: ProviderType,
  apiKey: string,
  options?: ValidationOptions
): Promise<ValidationResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

  try {
    let response: Response;

    switch (provider) {
      case 'openrouter':
        response = await fetchWithTimeout(
          'https://openrouter.ai/api/v1/auth/key',
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
          timeout
        );
        break;

      case 'minimax':
        response = await fetchWithTimeout(
          'https://api.minimax.io/anthropic/v1/messages',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'MiniMax-M2',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }],
            }),
          },
          timeout
        );
        break;

      case 'ollama':
      case 'bedrock':
      case 'vertex':
      case 'azure-foundry':
      case 'litellm':
      case 'lmstudio':
      case 'custom':
        return { valid: true };

      default: {
        const request = buildStandardValidationRequest(provider, apiKey, options);
        if (!request) {
          return { valid: true };
        }
        response = await fetchWithTimeout(request.url, request.init, timeout);
        break;
      }
    }

    if (response.ok) {
      return { valid: true };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { error?: { message?: string } })?.error?.message ||
      `API returned status ${response.status}`;

    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }

    return { valid: false, error: errorMessage };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        valid: false,
        error: 'Request timed out. Please check your internet connection and try again.',
      };
    }
    return {
      valid: false,
      error: 'Failed to validate API key. Check your internet connection.',
    };
  }
}
