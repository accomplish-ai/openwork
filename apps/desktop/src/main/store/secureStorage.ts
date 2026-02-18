import type { ApiKeyProvider } from '@accomplish_ai/agent-core';
import { getStorage } from './storage';

export type { ApiKeyProvider };

export function storeApiKey(provider: string, apiKey: string): void {
  getStorage().storeApiKey(provider, apiKey);
}

export function getApiKey(provider: string): string | null {
  return getStorage().getApiKey(provider);
}

export function deleteApiKey(provider: string): boolean {
  return getStorage().deleteApiKey(provider);
}

export async function getAllApiKeys(): Promise<Record<ApiKeyProvider, string | null>> {
  return getStorage().getAllApiKeys() as Promise<Record<ApiKeyProvider, string | null>>;
}

export function storeBedrockCredentials(credentials: string): void {
  getStorage().storeBedrockCredentials(credentials);
}

export function getBedrockCredentials(): Record<string, string> | null {
  return getStorage().getBedrockCredentials();
}

export function storeCloudBrowserCredentials(credentials: string): void {
  getStorage().storeCloudBrowserCredentials(credentials);
}

export function getCloudBrowserCredentials(): Record<string, string> | null {
  return getStorage().getCloudBrowserCredentials();
}

/**
 * Migrate cdpSecret from legacy config to secure storage
 * This should be called during app startup to ensure secrets are properly secured
 */
export function migrateCloudBrowserSecret(): void {
  try {
    const storage = getStorage();
    const config = storage.getCloudBrowserConfig();
    
    if (config && 'cdpSecret' in config && (config as any).cdpSecret) {
      const legacySecret = (config as any).cdpSecret;
      const existingCreds = getCloudBrowserCredentials();
      
      // Store the secret in secure storage
      storeCloudBrowserCredentials(JSON.stringify({
        ...existingCreds,
        cdpSecret: legacySecret,
      }));
      
      // Remove secret from config
      const { cdpSecret, ...configWithoutSecret } = config as any;
      storage.setCloudBrowserConfig(configWithoutSecret);
    }
  } catch (error) {
    // Silently ignore migration errors
    console.warn('Failed to migrate cloud browser secret:', error);
  }
}

export async function hasAnyApiKey(): Promise<boolean> {
  return getStorage().hasAnyApiKey();
}

export function clearSecureStorage(): void {
  getStorage().clearSecureStorage();
}
