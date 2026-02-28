export const ALLOWED_API_KEY_PROVIDERS = new Set([
  'anthropic',
  'openai',
  'google',
  'xai',
  'openrouter',
  'custom',
]);

export const API_KEY_VALIDATION_TIMEOUT_MS = 15000;

export interface MaskedApiKeyPayload {
  exists: boolean;
  prefix?: string;
}

export function toMaskedApiKeyPayload(apiKey: string | null): MaskedApiKeyPayload {
  if (!apiKey) {
    return { exists: false };
  }
  return {
    exists: true,
    prefix: `${apiKey.substring(0, 8)}...`,
  };
}

/**
 * Fetch with timeout using AbortController
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validate an Anthropic API key by making a test request
 */
export async function validateAnthropicApiKey(
  sanitizedKey: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': sanitizedKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        }),
      },
      API_KEY_VALIDATION_TIMEOUT_MS
    );

    if (response.ok) {
      return { valid: true };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { error?: { message?: string } })?.error?.message ||
      `API returned status ${response.status}`;

    return { valid: false, error: errorMessage };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { valid: false, error: 'Request timed out. Please check your internet connection and try again.' };
    }
    return { valid: false, error: 'Failed to validate API key. Check your internet connection.' };
  }
}

/**
 * Validate an API key for any supported provider
 */
export async function validateProviderApiKey(
  provider: string,
  sanitizedKey: string
): Promise<{ valid: boolean; error?: string }> {
  if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
    return { valid: false, error: 'Unsupported provider' };
  }

  try {
    let response: Response;

    switch (provider) {
      case 'anthropic':
        response = await fetchWithTimeout(
          'https://api.anthropic.com/v1/messages',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': sanitizedKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }],
            }),
          },
          API_KEY_VALIDATION_TIMEOUT_MS
        );
        break;

      case 'openai':
        response = await fetchWithTimeout(
          'https://api.openai.com/v1/models',
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${sanitizedKey}`,
            },
          },
          API_KEY_VALIDATION_TIMEOUT_MS
        );
        break;

      case 'google':
        response = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${sanitizedKey}`,
          {
            method: 'GET',
          },
          API_KEY_VALIDATION_TIMEOUT_MS
        );
        break;

      case 'xai':
        response = await fetchWithTimeout(
          'https://api.x.ai/v1/models',
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${sanitizedKey}`,
            },
          },
          API_KEY_VALIDATION_TIMEOUT_MS
        );
        break;

      case 'openrouter':
        response = await fetchWithTimeout(
          'https://openrouter.ai/api/v1/models',
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${sanitizedKey}`,
            },
          },
          API_KEY_VALIDATION_TIMEOUT_MS
        );
        break;

      default:
        // For 'custom' provider, skip validation
        return { valid: true };
    }

    if (response.ok) {
      return { valid: true };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { error?: { message?: string } })?.error?.message ||
      `API returned status ${response.status}`;

    return { valid: false, error: errorMessage };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { valid: false, error: 'Request timed out. Please check your internet connection and try again.' };
    }
    return { valid: false, error: 'Failed to validate API key. Check your internet connection.' };
  }
}
