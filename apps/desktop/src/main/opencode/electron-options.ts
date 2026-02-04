/**
 * Electron-specific options for OpenCode adapter and task manager
 *
 * This module provides Electron-specific implementations of the callbacks
 * required by @accomplish/core's OpenCodeAdapter and TaskManager.
 *
 * Desktop-specific concerns:
 * - Path resolution via Electron's app module
 * - Bundled Node.js and CLI paths
 * - API key loading from secure storage
 * - Environment variable building with Electron context
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { AdapterOptions, TaskManagerOptions, TaskCallbacks } from '@accomplish/core';
import type { TaskConfig } from '@accomplish/shared';
import { DEV_BROWSER_PORT } from '@accomplish/shared';
import {
  getSelectedModel,
  getAzureFoundryConfig,
  getActiveProviderModel,
  getConnectedProvider,
  getAzureEntraToken,
  getModelDisplayName,
  ensureDevBrowserServer,
  type BrowserServerConfig,
} from '@accomplish/core';
import type { AzureFoundryCredentials } from '@accomplish/shared';
import {
  getOpenCodeCliPath,
  isOpenCodeBundled,
} from './cli-path';
import { getAllApiKeys, getBedrockCredentials } from '../store/secureStorage';
import { getOpenAiBaseUrl } from '@accomplish/core';
import { generateOpenCodeConfig, getMcpToolsPath, syncApiKeysToOpenCodeAuth } from './config-generator';
import { getExtendedNodePath } from '../utils/system-path';
import { getBundledNodePaths, logBundledNodeInfo } from '../utils/bundled-node';

/**
 * Build environment variables with all API keys and Electron-specific settings
 */
export async function buildEnvironment(): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
  };

  if (app.isPackaged) {
    // Run the bundled CLI with Electron acting as Node (no system Node required).
    env.ELECTRON_RUN_AS_NODE = '1';

    // Log bundled Node.js configuration
    logBundledNodeInfo();

    // Add bundled Node.js to PATH (highest priority)
    const bundledNode = getBundledNodePaths();
    if (bundledNode) {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      const existingPath = env.PATH ?? env.Path ?? '';
      const combinedPath = existingPath
        ? `${bundledNode.binDir}${delimiter}${existingPath}`
        : bundledNode.binDir;
      env.PATH = combinedPath;
      if (process.platform === 'win32') {
        env.Path = combinedPath;
      }
      env.NODE_BIN_PATH = bundledNode.binDir;
      console.log('[OpenCode CLI] Added bundled Node.js to PATH:', bundledNode.binDir);
    }

    // For packaged apps on macOS, extend PATH to include common Node.js locations
    if (process.platform === 'darwin') {
      env.PATH = getExtendedNodePath(env.PATH);
    }
  }

  // Load all API keys from secure storage
  const apiKeys = await getAllApiKeys();

  if (apiKeys.anthropic) {
    env.ANTHROPIC_API_KEY = apiKeys.anthropic;
  }
  if (apiKeys.openai) {
    env.OPENAI_API_KEY = apiKeys.openai;
    const configuredOpenAiBaseUrl = getOpenAiBaseUrl().trim();
    if (configuredOpenAiBaseUrl) {
      env.OPENAI_BASE_URL = configuredOpenAiBaseUrl;
    }
  }
  if (apiKeys.google) {
    env.GOOGLE_GENERATIVE_AI_API_KEY = apiKeys.google;
  }
  if (apiKeys.xai) {
    env.XAI_API_KEY = apiKeys.xai;
  }
  if (apiKeys.deepseek) {
    env.DEEPSEEK_API_KEY = apiKeys.deepseek;
  }
  if (apiKeys.moonshot) {
    env.MOONSHOT_API_KEY = apiKeys.moonshot;
  }
  if (apiKeys.zai) {
    env.ZAI_API_KEY = apiKeys.zai;
  }
  if (apiKeys.openrouter) {
    env.OPENROUTER_API_KEY = apiKeys.openrouter;
  }
  if (apiKeys.litellm) {
    env.LITELLM_API_KEY = apiKeys.litellm;
  }
  if (apiKeys.minimax) {
    env.MINIMAX_API_KEY = apiKeys.minimax;
  }

  // Set Bedrock credentials if configured
  const bedrockCredentials = getBedrockCredentials();
  if (bedrockCredentials) {
    if (bedrockCredentials.authType === 'apiKey') {
      env.AWS_BEARER_TOKEN_BEDROCK = bedrockCredentials.apiKey;
    } else if (bedrockCredentials.authType === 'accessKeys') {
      env.AWS_ACCESS_KEY_ID = bedrockCredentials.accessKeyId;
      env.AWS_SECRET_ACCESS_KEY = bedrockCredentials.secretAccessKey;
      if (bedrockCredentials.sessionToken) {
        env.AWS_SESSION_TOKEN = bedrockCredentials.sessionToken;
      }
    } else if (bedrockCredentials.authType === 'profile') {
      env.AWS_PROFILE = bedrockCredentials.profileName;
    }
    if (bedrockCredentials.region) {
      env.AWS_REGION = bedrockCredentials.region;
    }
  }

  // Set Ollama host if configured
  const activeModel = getActiveProviderModel();
  const selectedModel = getSelectedModel();
  if (activeModel?.provider === 'ollama' && activeModel.baseUrl) {
    env.OLLAMA_HOST = activeModel.baseUrl;
  } else if (selectedModel?.provider === 'ollama' && selectedModel.baseUrl) {
    env.OLLAMA_HOST = selectedModel.baseUrl;
  }

  return env;
}

/**
 * Build CLI arguments for task execution
 */
export async function buildCliArgs(config: TaskConfig, _taskId: string): Promise<string[]> {
  const args: string[] = [];

  // Session resume mode
  if (config.sessionId) {
    args.push('--resume', config.sessionId);
  }

  // Prompt is passed as positional argument
  args.push(config.prompt);

  return args;
}

/**
 * Get the CLI command and arguments for spawning OpenCode
 */
export function getCliCommand(): { command: string; args: string[] } {
  return getOpenCodeCliPath();
}

/**
 * Check if OpenCode CLI is available
 */
export async function isCliAvailable(): Promise<boolean> {
  return isOpenCodeBundled();
}

/**
 * Run pre-start setup: generate config, sync API keys, get Azure token if needed
 */
export async function onBeforeStart(): Promise<void> {
  // Sync API keys to OpenCode CLI's auth.json
  await syncApiKeysToOpenCodeAuth();

  // Get Azure Entra ID token if needed
  let azureFoundryToken: string | undefined;
  const activeModel = getActiveProviderModel();
  const selectedModel = activeModel || getSelectedModel();
  const azureFoundryConfig = getAzureFoundryConfig();
  const azureFoundryProvider = getConnectedProvider('azure-foundry');
  const azureFoundryCredentials = azureFoundryProvider?.credentials as AzureFoundryCredentials | undefined;

  const isAzureFoundryEntraId =
    (selectedModel?.provider === 'azure-foundry' && azureFoundryCredentials?.authMethod === 'entra-id') ||
    (selectedModel?.provider === 'azure-foundry' && azureFoundryConfig?.authType === 'entra-id');

  if (isAzureFoundryEntraId) {
    const tokenResult = await getAzureEntraToken();
    if (!tokenResult.success) {
      throw new Error(tokenResult.error);
    }
    azureFoundryToken = tokenResult.token;
  }

  // Generate OpenCode config file
  await generateOpenCodeConfig(azureFoundryToken);
}

/**
 * Get browser server configuration for the dev-browser
 */
function getBrowserServerConfig(): BrowserServerConfig {
  const bundledPaths = getBundledNodePaths();
  return {
    mcpToolsPath: getMcpToolsPath(),
    bundledNodeBinPath: bundledPaths?.binDir,
    devBrowserPort: DEV_BROWSER_PORT,
  };
}

/**
 * Callback before starting a task (browser setup)
 */
export async function onBeforeTaskStart(
  callbacks: TaskCallbacks,
  isFirstTask: boolean
): Promise<void> {
  if (isFirstTask) {
    callbacks.onProgress({ stage: 'browser', message: 'Preparing browser...', isFirstTask });
  }

  // Ensure browser is available (may download Playwright if needed)
  const browserConfig = getBrowserServerConfig();
  await ensureDevBrowserServer(browserConfig, callbacks.onProgress);
}

/**
 * Create Electron-specific adapter options
 */
export function createElectronAdapterOptions(): AdapterOptions {
  return {
    platform: process.platform,
    isPackaged: app.isPackaged,
    tempPath: app.getPath('temp'),
    getCliCommand,
    buildEnvironment,
    buildCliArgs: (config: TaskConfig) => buildCliArgs(config, ''),
    onBeforeStart,
    getModelDisplayName,
  };
}

/**
 * Create Electron-specific task manager options
 */
export function createElectronTaskManagerOptions(): TaskManagerOptions {
  return {
    adapterOptions: {
      platform: process.platform,
      isPackaged: app.isPackaged,
      tempPath: app.getPath('temp'),
      getCliCommand,
      buildEnvironment,
      onBeforeStart,
      getModelDisplayName,
      buildCliArgs,
    },
    defaultWorkingDirectory: app.getPath('temp'),
    maxConcurrentTasks: 10,
    isCliAvailable,
    onBeforeTaskStart,
  };
}
