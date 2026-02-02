/**
 * Constants for OpenCode configuration generation
 *
 * This module contains all constant values used throughout the config-generator:
 * - Provider IDs and mappings
 * - MCP server configuration
 * - Z.AI model definitions
 * - API key mappings for auth sync
 *
 * @module config-generator/constants
 */

import type { ProviderId } from '@accomplish/shared';
import type { ZaiProviderModelConfig } from './types';

// =============================================================================
// Provider IDs - Use these instead of string literals
// =============================================================================

/**
 * Provider ID constants
 * Use these instead of hardcoded strings for type safety
 */
export const PROVIDER_IDS = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GOOGLE: 'google',
  XAI: 'xai',
  DEEPSEEK: 'deepseek',
  MOONSHOT: 'moonshot',
  ZAI: 'zai',
  BEDROCK: 'bedrock',
  AZURE_FOUNDRY: 'azure-foundry',
  OLLAMA: 'ollama',
  OPENROUTER: 'openrouter',
  LITELLM: 'litellm',
  MINIMAX: 'minimax',
  LMSTUDIO: 'lmstudio',
} as const;

/**
 * OpenCode CLI provider name constants
 * These are the names OpenCode CLI uses internally
 */
export const OPENCODE_PROVIDER_NAMES = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GOOGLE: 'google',
  XAI: 'xai',
  DEEPSEEK: 'deepseek',
  MOONSHOT: 'moonshot',
  ZAI_CODING_PLAN: 'zai-coding-plan',
  AMAZON_BEDROCK: 'amazon-bedrock',
  AZURE_FOUNDRY: 'azure-foundry',
  OLLAMA: 'ollama',
  OPENROUTER: 'openrouter',
  LITELLM: 'litellm',
  MINIMAX: 'minimax',
  LMSTUDIO: 'lmstudio',
} as const;

// =============================================================================
// Provider Mappings
// =============================================================================

/**
 * Provider ID to OpenCode CLI provider name mapping
 * Maps our internal provider IDs to the names used by OpenCode CLI
 */
export const PROVIDER_ID_TO_OPENCODE: Record<ProviderId, string> = {
  [PROVIDER_IDS.ANTHROPIC]: OPENCODE_PROVIDER_NAMES.ANTHROPIC,
  [PROVIDER_IDS.OPENAI]: OPENCODE_PROVIDER_NAMES.OPENAI,
  [PROVIDER_IDS.GOOGLE]: OPENCODE_PROVIDER_NAMES.GOOGLE,
  [PROVIDER_IDS.XAI]: OPENCODE_PROVIDER_NAMES.XAI,
  [PROVIDER_IDS.DEEPSEEK]: OPENCODE_PROVIDER_NAMES.DEEPSEEK,
  [PROVIDER_IDS.MOONSHOT]: OPENCODE_PROVIDER_NAMES.MOONSHOT,
  [PROVIDER_IDS.ZAI]: OPENCODE_PROVIDER_NAMES.ZAI_CODING_PLAN,
  [PROVIDER_IDS.BEDROCK]: OPENCODE_PROVIDER_NAMES.AMAZON_BEDROCK,
  [PROVIDER_IDS.AZURE_FOUNDRY]: OPENCODE_PROVIDER_NAMES.AZURE_FOUNDRY,
  [PROVIDER_IDS.OLLAMA]: OPENCODE_PROVIDER_NAMES.OLLAMA,
  [PROVIDER_IDS.OPENROUTER]: OPENCODE_PROVIDER_NAMES.OPENROUTER,
  [PROVIDER_IDS.LITELLM]: OPENCODE_PROVIDER_NAMES.LITELLM,
  [PROVIDER_IDS.MINIMAX]: OPENCODE_PROVIDER_NAMES.MINIMAX,
  [PROVIDER_IDS.LMSTUDIO]: OPENCODE_PROVIDER_NAMES.LMSTUDIO,
};

/**
 * Base providers that are always enabled in OpenCode config
 * Uses OpenCode CLI provider names (not our internal IDs)
 * Does not include local providers (ollama, lmstudio, litellm)
 * which require explicit configuration
 */
export const BASE_ENABLED_PROVIDERS = [
  OPENCODE_PROVIDER_NAMES.ANTHROPIC,
  OPENCODE_PROVIDER_NAMES.OPENAI,
  OPENCODE_PROVIDER_NAMES.OPENROUTER,
  OPENCODE_PROVIDER_NAMES.GOOGLE,
  OPENCODE_PROVIDER_NAMES.XAI,
  OPENCODE_PROVIDER_NAMES.DEEPSEEK,
  OPENCODE_PROVIDER_NAMES.MOONSHOT,
  OPENCODE_PROVIDER_NAMES.ZAI_CODING_PLAN,
  OPENCODE_PROVIDER_NAMES.AMAZON_BEDROCK,
  OPENCODE_PROVIDER_NAMES.MINIMAX,
] as const;

/**
 * Special providers that have dedicated builder functions
 * (not handled by the standard provider builder)
 */
export const SPECIAL_PROVIDER_IDS = [
  PROVIDER_IDS.BEDROCK,
  PROVIDER_IDS.AZURE_FOUNDRY,
  PROVIDER_IDS.ZAI,
] as const;

/**
 * Standard providers handled by the generic provider builder
 */
export const STANDARD_PROVIDER_IDS = [
  PROVIDER_IDS.OLLAMA,
  PROVIDER_IDS.OPENROUTER,
  PROVIDER_IDS.MOONSHOT,
  PROVIDER_IDS.LITELLM,
  PROVIDER_IDS.LMSTUDIO,
] as const;

// =============================================================================
// NPM Packages & URLs
// =============================================================================

/**
 * NPM packages for openai-compatible providers
 * All these providers use the @ai-sdk/openai-compatible package
 */
export const NPM_PACKAGES = {
  [PROVIDER_IDS.OLLAMA]: '@ai-sdk/openai-compatible',
  [PROVIDER_IDS.OPENROUTER]: '@ai-sdk/openai-compatible',
  [PROVIDER_IDS.MOONSHOT]: '@ai-sdk/openai-compatible',
  [PROVIDER_IDS.LITELLM]: '@ai-sdk/openai-compatible',
  [PROVIDER_IDS.ZAI]: '@ai-sdk/openai-compatible',
  [PROVIDER_IDS.LMSTUDIO]: '@ai-sdk/openai-compatible',
  [PROVIDER_IDS.AZURE_FOUNDRY]: '@ai-sdk/openai-compatible',
} as const;

/**
 * Provider API URLs
 */
export const PROVIDER_URLS = {
  [PROVIDER_IDS.OPENROUTER]: 'https://openrouter.ai/api/v1',
  [PROVIDER_IDS.MOONSHOT]: 'https://api.moonshot.ai/v1',
  [PROVIDER_IDS.ZAI]: {
    china: 'https://open.bigmodel.cn/api/paas/v4',
    international: 'https://api.z.ai/api/coding/paas/v4',
  },
} as const;

// =============================================================================
// MCP Server Configuration
// =============================================================================

/**
 * MCP server names used by Accomplish
 */
export const MCP_SERVERS = [
  'file-permission',
  'ask-user-question',
  'dev-browser-mcp',
  'complete-task',
  'start-task',
] as const;

export type McpServerName = (typeof MCP_SERVERS)[number];

/**
 * MCP server configuration defaults
 */
export const MCP_SERVER_CONFIG = {
  TIMEOUT_MS: 30000,
  TYPE: 'local' as const,
  ENABLED: true,
  SOURCE_FILE: 'src/index.ts',
  DIST_FILE: 'dist/index.mjs',
} as const;


// =============================================================================
// Z.AI Models
// =============================================================================

/**
 * Z.AI Coding Plan model definitions
 * All models support tool calling
 */
export const ZAI_MODELS: Record<string, ZaiProviderModelConfig> = {
  'glm-4.7-flashx': { name: 'GLM-4.7 FlashX (Latest)', tools: true },
  'glm-4.7': { name: 'GLM-4.7', tools: true },
  'glm-4.7-flash': { name: 'GLM-4.7 Flash', tools: true },
  'glm-4.6': { name: 'GLM-4.6', tools: true },
  'glm-4.5-flash': { name: 'GLM-4.5 Flash', tools: true },
};

// =============================================================================
// Auth Sync Configuration
// =============================================================================

/**
 * API key mappings for syncing to OpenCode CLI's auth.json
 * Only these providers need their keys synced (others use env vars)
 *
 * Maps Openwork provider ID -> OpenCode CLI provider ID
 * Note: zai maps to 'zai-coding-plan' in OpenCode CLI
 */
export const AUTH_SYNC_PROVIDER_MAPPINGS: Record<string, string> = {
  [PROVIDER_IDS.DEEPSEEK]: OPENCODE_PROVIDER_NAMES.DEEPSEEK,
  [PROVIDER_IDS.ZAI]: OPENCODE_PROVIDER_NAMES.ZAI_CODING_PLAN,
  [PROVIDER_IDS.MINIMAX]: OPENCODE_PROVIDER_NAMES.MINIMAX,
};

// =============================================================================
// Agent Configuration
// =============================================================================

/**
 * Agent name used by Accomplish
 */
export const ACCOMPLISH_AGENT_NAME = 'accomplish';
