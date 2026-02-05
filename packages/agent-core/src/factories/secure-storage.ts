/**
 * Factory function for creating SecureStorage instances
 *
 * This factory provides a secure storage instance for API keys and credentials.
 * Unlike the full StorageAPI (createStorage), this is a lightweight storage
 * specifically for encrypted credential management.
 */

import { SecureStorage, type SecureStorageOptions } from '../internal/classes/SecureStorage.js';

/**
 * Public API for secure storage operations (subset of SecureStorage class)
 */
export interface SecureStorageAPI {
  /** Store an API key securely */
  storeApiKey(provider: string, apiKey: string): void;
  /** Retrieve a stored API key */
  getApiKey(provider: string): string | null;
  /** Delete a stored API key */
  deleteApiKey(provider: string): boolean;
  /** Get all stored API keys */
  getAllApiKeys(): Promise<Record<string, string | null>>;
  /** Store AWS Bedrock credentials */
  storeBedrockCredentials(credentials: string): void;
  /** Get stored AWS Bedrock credentials */
  getBedrockCredentials(): Record<string, string> | null;
  /** Check if any API key is stored */
  hasAnyApiKey(): Promise<boolean>;
  /** List all stored credentials (for debugging) */
  listStoredCredentials(): Array<{ account: string; password: string }>;
  /** Clear all secure storage */
  clearSecureStorage(): void;
}

// Re-export options type for convenience
export type { SecureStorageOptions };

/**
 * Create a new secure storage instance
 * @param options - Configuration including storage path and app ID
 * @returns SecureStorageAPI instance
 */
export function createSecureStorage(options: SecureStorageOptions): SecureStorageAPI {
  return new SecureStorage(options);
}
