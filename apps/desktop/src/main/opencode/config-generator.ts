import { app } from 'electron';
import path from 'path';
import {
  generateConfig,
  ACCOMPLISH_AGENT_NAME,
  buildProviderConfigs,
  syncApiKeysToOpenCodeAuth as coreSyncApiKeysToOpenCodeAuth,
  getOpenCodeAuthPath,
  isTokenExpired,
  refreshAccessToken,
} from '@accomplish_ai/agent-core';
import { getApiKey, getAllApiKeys } from '../store/secureStorage';
import { getStorage } from '../store/storage';
import { getNodePath } from '../utils/bundled-node';
import { skillsManager } from '../skills';
import { PERMISSION_API_PORT, QUESTION_API_PORT } from '@accomplish_ai/agent-core';
import { ensureHuggingFaceLocalServer } from '../providers';

export { ACCOMPLISH_AGENT_NAME };

const HF_PROVIDER_PREFIX = 'huggingface-local/';
const HF_QUANTIZATIONS = ['q4', 'q8', 'fp16', 'fp32'] as const;
const HF_DEVICE_PREFERENCES = ['auto', 'webgpu', 'wasm', 'cpu'] as const;

function parseHuggingFaceSelectedModelId(selectedModelId: string): {
  modelId: string;
  quantization?: (typeof HF_QUANTIZATIONS)[number];
  devicePreference?: (typeof HF_DEVICE_PREFERENCES)[number];
} {
  const raw = selectedModelId.startsWith(HF_PROVIDER_PREFIX)
    ? selectedModelId.slice(HF_PROVIDER_PREFIX.length)
    : selectedModelId;

  const [modelIdRaw, quantizationRaw, deviceRaw] = raw.split('::');
  const modelId = modelIdRaw || '';

  const quantization = HF_QUANTIZATIONS.includes(quantizationRaw as (typeof HF_QUANTIZATIONS)[number])
    ? (quantizationRaw as (typeof HF_QUANTIZATIONS)[number])
    : undefined;
  const devicePreference = HF_DEVICE_PREFERENCES.includes(deviceRaw as (typeof HF_DEVICE_PREFERENCES)[number])
    ? (deviceRaw as (typeof HF_DEVICE_PREFERENCES)[number])
    : undefined;

  return {
    modelId,
    quantization,
    devicePreference,
  };
}

/**
 * Returns the path to MCP tools directory.
 * Electron-specific: uses app.isPackaged and process.resourcesPath.
 */
export function getMcpToolsPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp-tools');
  } else {
    return path.join(app.getAppPath(), '..', '..', 'packages', 'agent-core', 'mcp-tools');
  }
}

/**
 * Returns the OpenCode config directory.
 * Electron-specific: uses app.isPackaged and process.resourcesPath.
 */
export function getOpenCodeConfigDir(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  } else {
    return path.join(app.getAppPath(), '..', '..', 'packages', 'agent-core');
  }
}

/**
 * Generates the OpenCode configuration file.
 *
 * @param azureFoundryToken - Optional Azure Foundry token for Entra ID auth
 * @returns Path to the generated config file
 */
export async function generateOpenCodeConfig(azureFoundryToken?: string): Promise<string> {
  const mcpToolsPath = getMcpToolsPath();
  const userDataPath = app.getPath('userData');
  const nodePath = getNodePath();
  const bundledNodeBinPath = nodePath ? path.dirname(nodePath) : undefined;

  console.log('[OpenCode Config] MCP tools path:', mcpToolsPath);
  console.log('[OpenCode Config] User data path:', userDataPath);
  const storage = getStorage();

  // Use the extracted buildProviderConfigs from core package
  const providerConfigResult = await buildProviderConfigs({
    getApiKey,
    azureFoundryToken,
  });
  const providerConfigs = Array.isArray(providerConfigResult.providerConfigs)
    ? [...providerConfigResult.providerConfigs]
    : [];
  const enabledProviders = Array.isArray(providerConfigResult.enabledProviders)
    ? [...providerConfigResult.enabledProviders]
    : [];
  let modelOverride = providerConfigResult.modelOverride;
  const activeModel = typeof storage.getActiveProviderModel === 'function'
    ? storage.getActiveProviderModel()
    : null;
  const selectedModel = typeof storage.getSelectedModel === 'function'
    ? storage.getSelectedModel()
    : null;

  const hfProvider = typeof storage.getConnectedProvider === 'function'
    ? storage.getConnectedProvider('huggingface-local')
    : null;
  if (
    hfProvider?.connectionStatus === 'connected' &&
    hfProvider.credentials.type === 'huggingface-local' &&
    hfProvider.selectedModelId
  ) {
    const selectedModelId = hfProvider.selectedModelId;
    const parsedSelectedModel = parseHuggingFaceSelectedModelId(selectedModelId);
    const modelId = parsedSelectedModel.modelId;
    if (!modelId) {
      throw new Error('Hugging Face Local selected model is invalid');
    }
    const selectedModelMeta =
      hfProvider.availableModels?.find((model) => model.id === selectedModelId) ??
      hfProvider.availableModels?.find(
        (model) => model.id === `${HF_PROVIDER_PREFIX}${modelId}`
      );
    const quantization =
      parsedSelectedModel.quantization ??
      selectedModelMeta?.quantization ??
      hfProvider.credentials.quantization;
    const devicePreference =
      parsedSelectedModel.devicePreference ??
      selectedModelMeta?.devicePreference ??
      hfProvider.credentials.devicePreference;

    const shouldEnsureServer =
      activeModel?.provider === 'huggingface-local' ||
      selectedModel?.provider === 'huggingface-local';

    let baseURL = 'http://127.0.0.1:9231';
    if (shouldEnsureServer) {
      const serverInfo = await ensureHuggingFaceLocalServer({
        modelId,
        quantization,
        devicePreference,
      });
      baseURL = serverInfo.baseURL;
    }

    providerConfigs.push({
      id: 'huggingface-local',
      npm: '@ai-sdk/openai-compatible',
      name: 'Hugging Face Local',
      options: {
        baseURL: `${baseURL}/v1`,
        apiKey: 'accomplish-local',
      },
      models: {
        [modelId]: { name: modelId, tools: false },
      },
    });

    if (!enabledProviders.includes('huggingface-local')) {
      enabledProviders.push('huggingface-local');
    }

    if (activeModel?.provider === 'huggingface-local' && activeModel.model) {
      const parsedActiveModel = parseHuggingFaceSelectedModelId(activeModel.model);
      const canonicalModel = `${HF_PROVIDER_PREFIX}${parsedActiveModel.modelId}`;
      modelOverride = {
        model: canonicalModel,
        smallModel: canonicalModel,
      };
    }
  }

  // Inject store:false for OpenAI to prevent 403 errors
  // with project-scoped keys (sk-proj-...) that lack /v1/chat/completions storage permission
  const openAiApiKey = getApiKey('openai');
  if (openAiApiKey) {
    const existingOpenAi = providerConfigs.find(p => p.id === 'openai');
    if (existingOpenAi) {
      existingOpenAi.options = existingOpenAi.options || {};
      existingOpenAi.options.store = false;
    } else {
      providerConfigs.push({
        id: 'openai',
        options: { store: false },
      });
    }
  }

  const enabledSkills = await skillsManager.getEnabled();

  // Fetch enabled connectors with valid tokens
  const enabledConnectors = storage.getEnabledConnectors();
  const connectors: Array<{ id: string; name: string; url: string; accessToken: string }> = [];

  for (const connector of enabledConnectors) {
    if (connector.status !== 'connected') continue;

    let tokens = storage.getConnectorTokens(connector.id);
    if (!tokens?.accessToken) {
      console.warn(`[Connectors] Missing access token for ${connector.name}`);
      storage.setConnectorStatus(connector.id, 'error');
      continue;
    }

    // Refresh token if expired
    if (isTokenExpired(tokens)) {
      if (tokens.refreshToken && connector.oauthMetadata && connector.clientRegistration) {
        try {
          tokens = await refreshAccessToken({
            tokenEndpoint: connector.oauthMetadata.tokenEndpoint,
            refreshToken: tokens.refreshToken,
            clientId: connector.clientRegistration.clientId,
            clientSecret: connector.clientRegistration.clientSecret,
          });
          storage.storeConnectorTokens(connector.id, tokens);
        } catch (err) {
          console.warn(`[Connectors] Token refresh failed for ${connector.name}:`, err);
          storage.setConnectorStatus(connector.id, 'error');
          continue;
        }
      } else {
        console.warn(`[Connectors] Access token expired for ${connector.name} and cannot be refreshed`);
        storage.setConnectorStatus(connector.id, 'error');
        continue;
      }
    }

    connectors.push({
      id: connector.id,
      name: connector.name,
      url: connector.url,
      accessToken: tokens.accessToken,
    });
  }

  const result = generateConfig({
    platform: process.platform,
    mcpToolsPath,
    userDataPath,
    isPackaged: app.isPackaged,
    bundledNodeBinPath,
    skills: enabledSkills,
    providerConfigs,
    permissionApiPort: PERMISSION_API_PORT,
    questionApiPort: QUESTION_API_PORT,
    enabledProviders,
    model: modelOverride?.model,
    smallModel: modelOverride?.smallModel,
    connectors: connectors.length > 0 ? connectors : undefined,
  });

  process.env.OPENCODE_CONFIG = result.configPath;
  process.env.OPENCODE_CONFIG_DIR = path.dirname(result.configPath);

  console.log('[OpenCode Config] Generated config at:', result.configPath);
  console.log('[OpenCode Config] OPENCODE_CONFIG env set to:', process.env.OPENCODE_CONFIG);
  console.log('[OpenCode Config] OPENCODE_CONFIG_DIR env set to:', process.env.OPENCODE_CONFIG_DIR);

  return result.configPath;
}

/**
 * Returns the path to the OpenCode config file.
 */
export function getOpenCodeConfigPath(): string {
  return path.join(app.getPath('userData'), 'opencode', 'opencode.json');
}

// Re-export getOpenCodeAuthPath from core for consumers that import from this module
export { getOpenCodeAuthPath };

/**
 * Syncs API keys to the OpenCode auth.json file.
 * Uses Electron-specific path resolution and secure storage access.
 */
export async function syncApiKeysToOpenCodeAuth(): Promise<void> {
  const apiKeys = await getAllApiKeys();
  const authPath = getOpenCodeAuthPath();

  await coreSyncApiKeysToOpenCodeAuth(authPath, apiKeys);
}
