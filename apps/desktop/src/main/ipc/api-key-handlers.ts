import type { IpcMainInvokeEvent } from 'electron';
import {
  storeApiKey,
  getApiKey,
  deleteApiKey,
  getAllApiKeys,
  hasAnyApiKey,
  listStoredCredentials,
} from '../store/secureStorage';
import { handle, sanitizeString } from './message-utils';
import {
  ALLOWED_API_KEY_PROVIDERS,
  toMaskedApiKeyPayload,
  validateAnthropicApiKey,
  validateProviderApiKey,
} from './api-key-validation';

/**
 * Register all API key related IPC handlers
 */
export function registerApiKeyHandlers(): void {
  // Settings: Get API keys
  handle('settings:api-keys', async (_event: IpcMainInvokeEvent) => {
    const storedCredentials = await listStoredCredentials();

    return storedCredentials
      .filter((credential) => credential.account.startsWith('apiKey:'))
      .map((credential) => {
        const provider = credential.account.replace('apiKey:', '');
        const keyPrefix =
          credential.password && credential.password.length > 0
            ? `${credential.password.substring(0, 8)}...`
            : '';

        return {
          id: `local-${provider}`,
          provider,
          label: 'Local API Key',
          keyPrefix,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
      });
  });

  // Settings: Add API key (stores securely in OS keychain)
  handle(
    'settings:add-api-key',
    async (_event: IpcMainInvokeEvent, provider: string, key: string, label?: string) => {
      if (!ALLOWED_API_KEY_PROVIDERS.has(provider)) {
        throw new Error('Unsupported API key provider');
      }
      const sanitizedKey = sanitizeString(key, 'apiKey', 256);
      const sanitizedLabel = label ? sanitizeString(label, 'label', 128) : undefined;

      // Store the API key securely in OS keychain
      await storeApiKey(provider, sanitizedKey);

      return {
        id: `local-${provider}`,
        provider,
        label: sanitizedLabel || 'Local API Key',
        keyPrefix: sanitizedKey.substring(0, 8) + '...',
        isActive: true,
        createdAt: new Date().toISOString(),
      };
    }
  );

  // Settings: Remove API key
  handle('settings:remove-api-key', async (_event: IpcMainInvokeEvent, id: string) => {
    const sanitizedId = sanitizeString(id, 'id', 128);
    const provider = sanitizedId.replace('local-', '');
    await deleteApiKey(provider);
  });

  // API Key: Check if API key exists
  handle('api-key:exists', async (_event: IpcMainInvokeEvent) => {
    const apiKey = await getApiKey('anthropic');
    return Boolean(apiKey);
  });

  // API Key: Set API key
  handle('api-key:set', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    await storeApiKey('anthropic', sanitizedKey);
    console.log('[API Key] Key set', { keyPrefix: sanitizedKey.substring(0, 8) });
  });

  // API Key: Get API key
  handle('api-key:get', async (_event: IpcMainInvokeEvent) => {
    const apiKey = getApiKey('anthropic');
    return toMaskedApiKeyPayload(apiKey);
  });

  // API Key: Validate API key by making a test request
  handle('api-key:validate', async (_event: IpcMainInvokeEvent, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    console.log('[API Key] Validation requested');

    const result = await validateAnthropicApiKey(sanitizedKey);

    if (result.valid) {
      console.log('[API Key] Validation succeeded');
    } else {
      console.warn('[API Key] Validation failed', { error: result.error });
    }

    return result;
  });

  // API Key: Validate API key for any provider
  handle('api-key:validate-provider', async (_event: IpcMainInvokeEvent, provider: string, key: string) => {
    const sanitizedKey = sanitizeString(key, 'apiKey', 256);
    console.log(`[API Key] Validation requested for provider: ${provider}`);

    const result = await validateProviderApiKey(provider, sanitizedKey);

    if (result.valid) {
      console.log(`[API Key] Validation succeeded for ${provider}`);
    } else {
      console.warn(`[API Key] Validation failed for ${provider}`, { error: result.error });
    }

    return result;
  });

  // API Key: Clear API key
  handle('api-key:clear', async (_event: IpcMainInvokeEvent) => {
    await deleteApiKey('anthropic');
    console.log('[API Key] Key cleared');
  });

  // API Keys: Get all API keys (with masked values)
  handle('api-keys:all', async (_event: IpcMainInvokeEvent) => {
    const keys = await getAllApiKeys();
    const masked: Record<string, { exists: boolean; prefix?: string }> = {};
    for (const [provider, key] of Object.entries(keys)) {
      masked[provider] = toMaskedApiKeyPayload(key);
    }
    return masked;
  });

  // API Keys: Check if any key exists
  handle('api-keys:has-any', async (_event: IpcMainInvokeEvent) => {
    return hasAnyApiKey();
  });
}
