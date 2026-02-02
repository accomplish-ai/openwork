/**
 * Provider Registry
 *
 * Central registry for provider specifications. Maps provider IDs to their
 * configurations including URL patterns, credentials types, and model ID prefixes.
 *
 * This module handles "standard" providers that follow a common pattern
 * (openai-compatible SDK). Special providers (bedrock, azure-foundry, zai)
 * have their own dedicated builder modules.
 *
 * @module config-generator/providers/registry
 */

import type { ProviderId, ProviderCredentials } from '@accomplish/shared';
import {
  PROVIDER_URLS,
  NPM_PACKAGES,
  PROVIDER_IDS,
  OPENCODE_PROVIDER_NAMES,
  SPECIAL_PROVIDER_IDS,
} from '../constants';

/**
 * Provider specification defining how to build configs for a provider
 */
export interface ProviderSpec {
  /** Internal provider ID */
  id: string;
  /** OpenCode CLI provider name */
  openCodeId: string;
  /** Display name for the provider */
  displayName: string;
  /** NPM package used by the provider */
  npm: string;
  /** Expected credentials type for validation */
  credentialsType: string;
  /** Prefix used in model IDs (e.g., "ollama/") */
  modelIdPrefix: string;
  /** Whether this provider requires an API key */
  requiresApiKey: boolean;
  /** Default tool support value for models */
  defaultToolSupport: boolean;
}

/**
 * Standard provider specifications
 * These providers use the @ai-sdk/openai-compatible package
 */
export const PROVIDER_SPECS: Record<string, ProviderSpec> = {
  [PROVIDER_IDS.OLLAMA]: {
    id: PROVIDER_IDS.OLLAMA,
    openCodeId: OPENCODE_PROVIDER_NAMES.OLLAMA,
    displayName: 'Ollama (local)',
    npm: NPM_PACKAGES[PROVIDER_IDS.OLLAMA],
    credentialsType: PROVIDER_IDS.OLLAMA,
    modelIdPrefix: `${PROVIDER_IDS.OLLAMA}/`,
    requiresApiKey: false,
    defaultToolSupport: true,
  },
  [PROVIDER_IDS.OPENROUTER]: {
    id: PROVIDER_IDS.OPENROUTER,
    openCodeId: OPENCODE_PROVIDER_NAMES.OPENROUTER,
    displayName: 'OpenRouter',
    npm: NPM_PACKAGES[PROVIDER_IDS.OPENROUTER],
    credentialsType: PROVIDER_IDS.OPENROUTER,
    modelIdPrefix: `${PROVIDER_IDS.OPENROUTER}/`,
    requiresApiKey: true,
    defaultToolSupport: true,
  },
  [PROVIDER_IDS.MOONSHOT]: {
    id: PROVIDER_IDS.MOONSHOT,
    openCodeId: OPENCODE_PROVIDER_NAMES.MOONSHOT,
    displayName: 'Moonshot AI',
    npm: NPM_PACKAGES[PROVIDER_IDS.MOONSHOT],
    credentialsType: 'api_key', // Matches shared ApiKeyCredentials type
    modelIdPrefix: `${PROVIDER_IDS.MOONSHOT}/`,
    requiresApiKey: true,
    defaultToolSupport: true,
  },
  [PROVIDER_IDS.LITELLM]: {
    id: PROVIDER_IDS.LITELLM,
    openCodeId: OPENCODE_PROVIDER_NAMES.LITELLM,
    displayName: 'LiteLLM',
    npm: NPM_PACKAGES[PROVIDER_IDS.LITELLM],
    credentialsType: PROVIDER_IDS.LITELLM,
    modelIdPrefix: `${PROVIDER_IDS.LITELLM}/`,
    requiresApiKey: false, // API key is optional for LiteLLM
    defaultToolSupport: true,
  },
  [PROVIDER_IDS.LMSTUDIO]: {
    id: PROVIDER_IDS.LMSTUDIO,
    openCodeId: OPENCODE_PROVIDER_NAMES.LMSTUDIO,
    displayName: 'LM Studio',
    npm: NPM_PACKAGES[PROVIDER_IDS.LMSTUDIO],
    credentialsType: PROVIDER_IDS.LMSTUDIO,
    modelIdPrefix: `${PROVIDER_IDS.LMSTUDIO}/`,
    requiresApiKey: false,
    defaultToolSupport: false, // Tool support varies by model
  },
};

/**
 * Special providers that have dedicated builder modules
 * These are NOT handled by the standard builder
 * Re-exported from constants for backward compatibility
 */
export const SPECIAL_PROVIDERS = SPECIAL_PROVIDER_IDS;

/**
 * Standard provider IDs (handled by the generic builder)
 */
export const STANDARD_PROVIDER_IDS = Object.keys(PROVIDER_SPECS) as string[];

/**
 * Get provider spec by ID
 *
 * @param providerId - The provider ID to look up
 * @returns Provider spec or undefined if not found
 */
export function getProviderSpec(providerId: string): ProviderSpec | undefined {
  return PROVIDER_SPECS[providerId];
}

/**
 * Check if a provider is a "special" provider with dedicated builder
 *
 * @param providerId - The provider ID to check
 * @returns True if the provider is special
 */
export function isSpecialProvider(providerId: string): boolean {
  return SPECIAL_PROVIDERS.includes(providerId as (typeof SPECIAL_PROVIDERS)[number]);
}

/**
 * Check if a provider is a "standard" provider handled by the generic builder
 *
 * @param providerId - The provider ID to check
 * @returns True if the provider is standard
 */
export function isStandardProvider(providerId: string): boolean {
  return STANDARD_PROVIDER_IDS.includes(providerId);
}

/**
 * Get list of standard provider IDs
 *
 * @returns Array of standard provider IDs
 */
export function getStandardProviderIds(): string[] {
  return [...STANDARD_PROVIDER_IDS];
}

/**
 * Strip the provider prefix from a model ID
 *
 * @param modelId - The full model ID (e.g., "ollama/llama3")
 * @returns The model ID without the provider prefix (e.g., "llama3")
 */
export function stripModelIdPrefix(modelId: string): string {
  if (!modelId) return modelId;

  for (const spec of Object.values(PROVIDER_SPECS)) {
    if (modelId.startsWith(spec.modelIdPrefix)) {
      return modelId.slice(spec.modelIdPrefix.length);
    }
  }

  return modelId;
}

/**
 * Add provider prefix to a model ID if not already present
 *
 * @param providerId - The provider ID
 * @param modelId - The model ID (with or without prefix)
 * @returns The model ID with the provider prefix
 */
export function addModelIdPrefix(providerId: string, modelId: string): string {
  const spec = PROVIDER_SPECS[providerId];
  const prefix = spec?.modelIdPrefix ?? `${providerId}/`;

  if (modelId.startsWith(prefix)) {
    return modelId;
  }

  return `${prefix}${modelId}`;
}

/**
 * Get the base URL for a provider
 *
 * @param providerId - The provider ID
 * @param credentials - The provider credentials (for local providers with custom URLs)
 * @param proxyURL - Optional proxy URL override (for moonshot)
 * @returns The base URL or undefined if not available
 */
export function getBaseURL(
  providerId: string,
  credentials?: ProviderCredentials,
  proxyURL?: string
): string | undefined {
  switch (providerId) {
    case 'ollama': {
      if (credentials?.type === 'ollama') {
        const serverUrl = credentials.serverUrl.replace(/\/$/, '');
        return `${serverUrl}/v1`;
      }
      return undefined;
    }

    case 'openrouter':
      return PROVIDER_URLS.openrouter;

    case 'moonshot':
      // Moonshot requires a proxy for proper functionality
      return proxyURL ?? PROVIDER_URLS.moonshot;

    case 'litellm': {
      if (credentials?.type === 'litellm') {
        const serverUrl = credentials.serverUrl.replace(/\/$/, '');
        return `${serverUrl}/v1`;
      }
      return undefined;
    }

    case 'lmstudio': {
      if (credentials?.type === 'lmstudio') {
        const serverUrl = credentials.serverUrl.replace(/\/$/, '');
        return `${serverUrl}/v1`;
      }
      return undefined;
    }

    default:
      return undefined;
  }
}
