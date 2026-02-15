/**
 * Unique identifier for each supported AI provider.
 */
export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'moonshot'
  | 'zai'
  | 'bedrock'
  | 'azure-foundry'
  | 'ollama'
  | 'openrouter'
  | 'litellm'
  | 'minimax'
  | 'lmstudio'
  | 'vertex';

/**
 * Categorization of providers based on their hosting/integration type.
 * - 'classic': Standard SaaS APIs (OpenAI, Anthropic)
 * - 'aws': AWS Bedrock
 * - 'gcp': Google Vertex AI
 * - 'azure': Azure AI Foundry
 * - 'local': Locally hosted models (Ollama, LM Studio)
 * - 'proxy': API aggregators (OpenRouter)
 * - 'hybrid': Self-hosted proxies (LiteLLM)
 */
export type ProviderCategory = 'classic' | 'aws' | 'gcp' | 'azure' | 'local' | 'proxy' | 'hybrid';

/**
 * Metadata definition for UI presentation of a provider.
 */
export interface ProviderMeta {
  /** The unique ID of the provider. */
  id: ProviderId;
  /** Display name shown in the UI. */
  name: string;
  /** The category this provider belongs to. */
  category: ProviderCategory;
  /** Label for the credentials field (e.g. "API Key", "Service"). */
  label: string;
  /** Icon key for rendering the provider's logo. */
  logoKey: string;
  /** URL to the provider's dashboard for obtaining keys. */
  helpUrl?: string;
}

/**
 * Registry of metadata for all supported providers.
 * Used to generate the settings UI and provider selection lists.
 */
export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  anthropic: { id: 'anthropic', name: 'Anthropic', category: 'classic', label: 'Service', logoKey: 'claude', helpUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { id: 'openai', name: 'OpenAI', category: 'classic', label: 'Service', logoKey: 'open-ai', helpUrl: 'https://platform.openai.com/api-keys' },
  google: { id: 'google', name: 'Gemini', category: 'classic', label: 'Service', logoKey: 'google-gen-ai', helpUrl: 'https://aistudio.google.com/app/apikey' },
  xai: { id: 'xai', name: 'XAI', category: 'classic', label: 'Service', logoKey: 'Xai', helpUrl: 'https://x.ai/api' },
  deepseek: { id: 'deepseek', name: 'DeepSeek', category: 'classic', label: 'Service', logoKey: 'Deepseek', helpUrl: 'https://platform.deepseek.com/api_keys' },
  moonshot: { id: 'moonshot', name: 'Moonshot AI', category: 'classic', label: 'Service', logoKey: 'moonshot', helpUrl: 'https://platform.moonshot.ai/docs/guide/start-using-kimi-api' },
  zai: { id: 'zai', name: 'Z-AI', category: 'classic', label: 'Service', logoKey: 'z-ai' },
  bedrock: { id: 'bedrock', name: 'AWS Bedrock', category: 'aws', label: 'Service', logoKey: 'aws-bedrock' },
  vertex: { id: 'vertex', name: 'Vertex AI', category: 'gcp', label: 'Service', logoKey: 'vertex' },
  'azure-foundry': { id: 'azure-foundry', name: 'Azure AI Foundry', category: 'azure', label: 'Service', logoKey: 'azure', helpUrl: 'https://ai.azure.com' },
  ollama: { id: 'ollama', name: 'Ollama', category: 'local', label: 'Local Models', logoKey: 'olama' },
  openrouter: { id: 'openrouter', name: 'OpenRouter', category: 'proxy', label: 'Service', logoKey: 'open-router', helpUrl: 'https://openrouter.ai/keys' },
  litellm: { id: 'litellm', name: 'LiteLLM', category: 'hybrid', label: 'Service', logoKey: 'liteLLM' },
  minimax: { id: 'minimax', name: 'MiniMax', category: 'classic', label: 'Service', logoKey: 'minimax', helpUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key' },
  lmstudio: { id: 'lmstudio', name: 'LM Studio', category: 'local', label: 'Local Models', logoKey: 'lmstudio', helpUrl: 'https://lmstudio.ai/' },
};

/**
 * Represents the state of a provider's connection.
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Standard API-key based credentials.
 */
export interface ApiKeyCredentials {
  type: 'api_key';
  /** The prefix of the stored key (for display only). */
  keyPrefix: string;
}

/**
 * AWS Bedrock authentication credentials.
 */
export interface BedrockProviderCredentials {
  type: 'bedrock';
  /** The method used to authenticate with AWS. */
  authMethod: 'accessKey' | 'profile' | 'apiKey';
  /** The AWS region to connect to. */
  region: string;
  /** Prefix of the access key ID (if using access key). */
  accessKeyIdPrefix?: string;
  /** Name of the local AWS profile (if using profile). */
  profileName?: string;
  /** Prefix of the API key (if using API key wrapper). */
  apiKeyPrefix?: string;
}

/**
 * Configuration for connecting to an Ollama server.
 */
export interface OllamaCredentials {
  type: 'ollama';
  /** The URL of the Ollama server (e.g., http://localhost:11434). */
  serverUrl: string;
}

/**
 * OpenRouter authentication credentials.
 */
export interface OpenRouterCredentials {
  type: 'openrouter';
  /** The prefix of the OpenRouter API key. */
  keyPrefix: string;
}

/**
 * LiteLLM proxy configuration keys.
 */
export interface LiteLLMCredentials {
  type: 'litellm';
  /** The base URL of the LiteLLM proxy. */
  serverUrl: string;
  /** Whether an API key is configured. */
  hasApiKey: boolean;
  /** Prefix of the configured API key. */
  keyPrefix?: string;
}

/**
 * Supported regions for Zai provider.
 */
export type ZaiRegion = 'china' | 'international';

/**
 * Zai provider credentials.
 */
export interface ZaiCredentials {
  type: 'zai';
  /** The prefix of the API key. */
  keyPrefix: string;
  /** The selected service region. */
  region: ZaiRegion;
}

/**
 * LM Studio connection settings.
 */
export interface LMStudioCredentials {
  type: 'lmstudio';
  /** The local server URL for LM Studio. */
  serverUrl: string;
}

/**
 * Azure AI Foundry connection settings.
 */
export interface AzureFoundryCredentials {
  type: 'azure-foundry';
  /** Authentication method (Key or Entra ID). */
  authMethod: 'api-key' | 'entra-id';
  /** The Azure endpoint URL. */
  endpoint: string;
  /** The deployment name for the model. */
  deploymentName: string;
  /** Prefix of the API key (if applicable). */
  keyPrefix?: string;
}

/**
 * Configuration for AWS AgentCore cloud browser integration.
 */
export interface AwsAgentCoreConfig {
  /** AWS Region (e.g., us-west-2) */
  region: string;
  /** Optional Access Key ID */
  accessKeyId?: string;
  /** Optional Secret Access Key */
  secretAccessKey?: string;
  /** Optional AWS Profile name */
  profile?: string;
}

/**
 * Google Vertex AI credentials.
 */
export interface VertexProviderCredentials {
  type: 'vertex';
  /** Auth method: Service Account JSON or Application Default Credentials. */
  authMethod: 'serviceAccount' | 'adc';
  /** The Google Cloud Project ID. */
  projectId: string;
  /** The region/location for Vertex AI resources. */
  location: string;
  /** The email of the service account (for display). */
  serviceAccountEmail?: string;
}

/**
 * OAuth-based credentials (e.g. for ChatGPT Web).
 */
export interface OAuthCredentials {
  type: 'oauth';
  /** The provider supported by this OAuth flow. */
  oauthProvider: 'chatgpt';
}

/**
 * Union type of all possible provider credential configurations.
 */
export type ProviderCredentials =
  | ApiKeyCredentials
  | BedrockProviderCredentials
  | VertexProviderCredentials
  | OllamaCredentials
  | OpenRouterCredentials
  | LiteLLMCredentials
  | ZaiCredentials
  | AzureFoundryCredentials
  | LMStudioCredentials
  | OAuthCredentials;

/**
 * Status of tool calling support for a model.
 */
export type ToolSupportStatus = 'supported' | 'unsupported' | 'unknown';

/**
 * Represents a provider that has been configured and verified.
 */
export interface ConnectedProvider {
  /** The ID of the provider. */
  providerId: ProviderId;
  /** Current connection health status. */
  connectionStatus: ConnectionStatus;
  /** ID of the currently selected model for this provider. */
  selectedModelId: string | null;
  /** The credentials used to connect. */
  credentials: ProviderCredentials;
  /** Timestamp of the last successful connection. */
  lastConnectedAt: string;
  /** List of models available from this provider. */
  availableModels?: Array<{ id: string; name: string; toolSupport?: ToolSupportStatus }>;
}

/**
 * Global provider configuration settings.
 */
export interface ProviderSettings {
  /** The ID of the currently active provider. */
  activeProviderId: ProviderId | null;
  /** Map of configured providers and their details. */
  connectedProviders: Partial<Record<ProviderId, ConnectedProvider>>;
  /** Whether debug mode is enabled for providers. */
  debugMode: boolean;
  /** Cloud browser integration settings. */
  cloudBrowser?: {
    /** The selected cloud browser provider. */
    provider: 'aws-agent-core' | 'browserbase' | null;
    /** AWS specific configuration. */
    aws?: AwsAgentCoreConfig;
  };
}

/**
 * Checks if a provider is fully connected and ready for use (has status 'connected' and a selected model).
 * @param provider - The provider configuration to check
 */
export function isProviderReady(provider: ConnectedProvider | undefined): boolean {
  if (!provider) return false;
  return provider.connectionStatus === 'connected' && provider.selectedModelId !== null;
}

/**
 * Checks if any configured provider is ready for use.
 */
export function hasAnyReadyProvider(settings: ProviderSettings | null | undefined): boolean {
  if (!settings?.connectedProviders) return false;
  return Object.values(settings.connectedProviders).some(isProviderReady);
}

/**
 * Retrieves the currently active provider configuration.
 */
export function getActiveProvider(settings: ProviderSettings | null | undefined): ConnectedProvider | null {
  if (!settings?.activeProviderId) return null;
  return settings.connectedProviders?.[settings.activeProviderId] ?? null;
}

/**
 * Default model for each provider.
 * For providers with `defaultModelId` in DEFAULT_PROVIDERS, that value is canonical.
 * This map covers providers that don't have modelsEndpoint (bedrock) or as fallback.
 */
export const DEFAULT_MODELS: Partial<Record<ProviderId, string>> = {
  anthropic: 'anthropic/claude-opus-4-6',
  openai: 'openai/gpt-5.2',
  google: 'google/gemini-3-pro-preview',
  xai: 'xai/grok-4',
  deepseek: 'deepseek/deepseek-chat',
  moonshot: 'moonshot/kimi-k2.5',
  zai: 'zai/glm-4.7-flashx',
  minimax: 'minimax/MiniMax-M2',
  bedrock: 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0',
};

export function getDefaultModelForProvider(providerId: ProviderId): string | null {
  return DEFAULT_MODELS[providerId] ?? null;
}

/**
 * Maps internal ProviderId to OpenCode CLI provider names.
 * Used when generating OpenCode configuration.
 */
export const PROVIDER_ID_TO_OPENCODE: Record<ProviderId, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
  xai: 'xai',
  deepseek: 'deepseek',
  moonshot: 'moonshot',
  zai: 'zai-coding-plan',
  bedrock: 'amazon-bedrock',
  'azure-foundry': 'azure-foundry',
  ollama: 'ollama',
  openrouter: 'openrouter',
  litellm: 'litellm',
  minimax: 'minimax',
  lmstudio: 'lmstudio',
  vertex: 'vertex',
};
