import { app } from 'electron';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { TaskManagerOptions, TaskCallbacks } from '@accomplish_ai/agent-core';
import type { TaskConfig } from '@accomplish_ai/agent-core';
import { DEV_BROWSER_PORT } from '@accomplish_ai/agent-core';
import {
  getAzureEntraToken,
  ensureDevBrowserServer,
  resolveCliPath,
  isCliAvailable as coreIsCliAvailable,
  buildCliArgs as coreBuildCliArgs,
  buildOpenCodeEnvironment,
  type BrowserServerConfig,
  type CliResolverConfig,
  type EnvironmentConfig,
} from '@accomplish_ai/agent-core';
import { getModelDisplayName } from '@accomplish_ai/agent-core';
import type {
  AzureFoundryCredentials,
  BedrockCredentials,
  VertexCredentials,
} from '@accomplish_ai/agent-core';
import { getStorage } from '../store/storage';
import { getAllApiKeys, getBedrockCredentials, getApiKey } from '../store/secureStorage';
import {
  generateOpenCodeConfig,
  getMcpToolsPath,
  syncApiKeysToOpenCodeAuth,
} from './config-generator';
import { getExtendedNodePath } from '../utils/system-path';
import { getBundledNodePaths, logBundledNodeInfo } from '../utils/bundled-node';

const VERTEX_SA_KEY_FILENAME = 'vertex-sa-key.json';
const CLI_PREWARM_TIMEOUT_MS = 15000;

let coldStartPrewarmStarted = false;
let browserServerReady = false;
let browserServerWarmupPromise: Promise<void> | null = null;
let cliPrewarmAttempted = false;
let cliPrewarmPromise: Promise<void> | null = null;

/**
 * Removes the Vertex AI service account key file from disk if it exists.
 * Called when the Vertex provider is disconnected or the app quits.
 */
export function cleanupVertexServiceAccountKey(): void {
  try {
    const keyPath = path.join(app.getPath('userData'), VERTEX_SA_KEY_FILENAME);
    if (fs.existsSync(keyPath)) {
      fs.unlinkSync(keyPath);
      console.log('[Vertex] Cleaned up service account key file');
    }
  } catch (error) {
    console.warn('[Vertex] Failed to clean up service account key file:', error);
  }
}

function getCliResolverConfig(): CliResolverConfig {
  return {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  };
}

export function getOpenCodeCliPath(): { command: string; args: string[] } {
  const resolved = resolveCliPath(getCliResolverConfig());
  if (resolved) {
    return { command: resolved.cliPath, args: [] };
  }
  console.log('[CLI Path] Falling back to opencode command on PATH');
  return { command: 'opencode', args: [] };
}

export function isOpenCodeBundled(): boolean {
  return coreIsCliAvailable(getCliResolverConfig());
}

export function getBundledOpenCodeVersion(): string | null {
  const { command } = getOpenCodeCliPath();
  if (app.isPackaged) {
    try {
      const packageName = process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-ai';
      const packageJsonPath = path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        packageName,
        'package.json',
      );

      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return pkg.version;
      }
    } catch {
      // intentionally empty
    }
  }

  try {
    const fullCommand = `"${command}" --version`;
    const output = execSync(fullCommand, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : output;
  } catch {
    return null;
  }
}

export async function buildEnvironment(taskId: string): Promise<NodeJS.ProcessEnv> {
  // Start with base environment
  let env: NodeJS.ProcessEnv = { ...process.env };

  // Handle Electron-specific environment setup for packaged app
  if (app.isPackaged) {
    env.ELECTRON_RUN_AS_NODE = '1';

    logBundledNodeInfo();

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
      console.log('[OpenCode CLI] Added bundled Node.js to PATH:', bundledNode.binDir);
    }

    if (process.platform === 'darwin') {
      env.PATH = getExtendedNodePath(env.PATH);
    }
  }

  // Gather configuration for the reusable environment builder
  const apiKeys = await getAllApiKeys();
  const bedrockCredentials = getBedrockCredentials() as BedrockCredentials | null;
  const bundledNode = getBundledNodePaths();

  // Determine OpenAI base URL
  const storage = getStorage();
  const configuredOpenAiBaseUrl = apiKeys.openai ? storage.getOpenAiBaseUrl().trim() : undefined;

  // Determine Ollama host
  const activeModel = storage.getActiveProviderModel();
  const selectedModel = storage.getSelectedModel();
  let ollamaHost: string | undefined;
  if (activeModel?.provider === 'ollama' && activeModel.baseUrl) {
    ollamaHost = activeModel.baseUrl;
  } else if (selectedModel?.provider === 'ollama' && selectedModel.baseUrl) {
    ollamaHost = selectedModel.baseUrl;
  }

  // Handle Vertex AI credentials
  let vertexCredentials: VertexCredentials | undefined;
  let vertexServiceAccountKeyPath: string | undefined;
  const vertexCredsJson = getApiKey('vertex');
  if (vertexCredsJson) {
    try {
      const parsed = JSON.parse(vertexCredsJson) as VertexCredentials;
      vertexCredentials = parsed;
      if (parsed.authType === 'serviceAccount' && parsed.serviceAccountJson) {
        const userDataPath = app.getPath('userData');
        vertexServiceAccountKeyPath = path.join(userDataPath, VERTEX_SA_KEY_FILENAME);
        fs.writeFileSync(vertexServiceAccountKeyPath, parsed.serviceAccountJson, { mode: 0o600 });
      }
    } catch {
      console.warn('[OpenCode CLI] Failed to parse Vertex credentials');
    }
  }

  // Build environment configuration
  const envConfig: EnvironmentConfig = {
    apiKeys,
    bedrockCredentials: bedrockCredentials || undefined,
    vertexCredentials,
    vertexServiceAccountKeyPath,
    bundledNodeBinPath: bundledNode?.binDir,
    taskId: taskId || undefined,
    openAiBaseUrl: configuredOpenAiBaseUrl || undefined,
    ollamaHost,
  };

  // Use the core function to set API keys and credentials
  env = buildOpenCodeEnvironment(env, envConfig);

  if (taskId) {
    console.log('[OpenCode CLI] Task ID in environment:', taskId);
  }

  return env;
}

export async function buildCliArgs(config: TaskConfig, _taskId: string): Promise<string[]> {
  const storage = getStorage();
  const activeModel = storage.getActiveProviderModel();
  const selectedModel = activeModel || storage.getSelectedModel();

  return coreBuildCliArgs({
    prompt: config.prompt,
    sessionId: config.sessionId,
    selectedModel: selectedModel
      ? {
          provider: selectedModel.provider,
          model: selectedModel.model,
        }
      : null,
  });
}

export function getCliCommand(): { command: string; args: string[] } {
  return getOpenCodeCliPath();
}

export async function isCliAvailable(): Promise<boolean> {
  return isOpenCodeBundled();
}

export async function onBeforeStart(): Promise<void> {
  await syncApiKeysToOpenCodeAuth();

  let azureFoundryToken: string | undefined;
  const storage = getStorage();
  const activeModel = storage.getActiveProviderModel();
  const selectedModel = activeModel || storage.getSelectedModel();
  const azureFoundryConfig = storage.getAzureFoundryConfig();
  const azureFoundryProvider = storage.getConnectedProvider('azure-foundry');
  const azureFoundryCredentials = azureFoundryProvider?.credentials as
    | AzureFoundryCredentials
    | undefined;

  const isAzureFoundryEntraId =
    (selectedModel?.provider === 'azure-foundry' &&
      azureFoundryCredentials?.authMethod === 'entra-id') ||
    (selectedModel?.provider === 'azure-foundry' && azureFoundryConfig?.authType === 'entra-id');

  if (isAzureFoundryEntraId) {
    const tokenResult = await getAzureEntraToken();
    if (!tokenResult.success) {
      throw new Error(tokenResult.error);
    }
    azureFoundryToken = tokenResult.token;
  }

  await generateOpenCodeConfig(azureFoundryToken);
}

function getBrowserServerConfig(): BrowserServerConfig {
  const bundledPaths = getBundledNodePaths();
  return {
    mcpToolsPath: getMcpToolsPath(),
    bundledNodeBinPath: bundledPaths?.binDir,
    devBrowserPort: DEV_BROWSER_PORT,
  };
}

async function ensureBrowserServerReady(
  onProgress?: (progress: { stage: string; message?: string }) => void,
): Promise<void> {
  if (browserServerReady) {
    return;
  }

  if (!browserServerWarmupPromise) {
    const startedAt = Date.now();
    const browserConfig = getBrowserServerConfig();
    browserServerWarmupPromise = ensureDevBrowserServer(browserConfig, onProgress)
      .then((result) => {
        const durationMs = Date.now() - startedAt;
        if (result.ready) {
          browserServerReady = true;
          console.log(`[OpenCode Warmup] Browser server ready in ${durationMs}ms`);
          return;
        }
        console.warn(
          `[OpenCode Warmup] Browser server startup completed but not ready after ${durationMs}ms`,
        );
      })
      .catch((error) => {
        console.warn('[OpenCode Warmup] Browser server warmup failed:', error);
      })
      .finally(() => {
        if (!browserServerReady) {
          browserServerWarmupPromise = null;
        }
      });
  }

  await browserServerWarmupPromise;
}

async function prewarmWindowsCli(): Promise<void> {
  if (process.platform !== 'win32' || cliPrewarmAttempted) {
    return;
  }

  if (!cliPrewarmPromise) {
    cliPrewarmPromise = (async () => {
      const startedAt = Date.now();
      try {
        const { command, args } = getOpenCodeCliPath();
        if (!command.toLowerCase().endsWith('.exe')) {
          console.warn(
            `[OpenCode Warmup] Skipping CLI prewarm because command is not an .exe: ${command}`,
          );
          return;
        }

        await new Promise<void>((resolve) => {
          const child = spawn(command, [...args, '--version'], {
            stdio: 'ignore',
            windowsHide: true,
          });

          const timeout = setTimeout(() => {
            try {
              child.kill();
            } catch {
              // intentionally empty
            }
            console.warn(
              `[OpenCode Warmup] CLI prewarm timed out after ${CLI_PREWARM_TIMEOUT_MS}ms`,
            );
            resolve();
          }, CLI_PREWARM_TIMEOUT_MS);

          child.once('error', (error) => {
            clearTimeout(timeout);
            console.warn('[OpenCode Warmup] CLI prewarm spawn failed:', error);
            resolve();
          });

          child.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        const durationMs = Date.now() - startedAt;
        console.log(`[OpenCode Warmup] CLI prewarm completed in ${durationMs}ms`);
      } catch (error) {
        console.warn('[OpenCode Warmup] CLI prewarm failed:', error);
      } finally {
        cliPrewarmAttempted = true;
        cliPrewarmPromise = null;
      }
    })();
  }

  await cliPrewarmPromise;
}

export function startColdStartPrewarm(): void {
  if (coldStartPrewarmStarted || process.platform !== 'win32') {
    return;
  }
  coldStartPrewarmStarted = true;

  const startedAt = Date.now();
  void Promise.allSettled([ensureBrowserServerReady(), prewarmWindowsCli()]).then((results) => {
    const durationMs = Date.now() - startedAt;
    const failedCount = results.filter((result) => result.status === 'rejected').length;
    if (failedCount > 0) {
      console.warn(
        `[OpenCode Warmup] Background warmup finished in ${durationMs}ms with ${failedCount} rejected task(s)`,
      );
      return;
    }
    console.log(`[OpenCode Warmup] Background warmup finished in ${durationMs}ms`);
  });
}

export async function onBeforeTaskStart(
  callbacks: TaskCallbacks,
  isFirstTask: boolean,
): Promise<void> {
  if (isFirstTask) {
    callbacks.onProgress({ stage: 'browser', message: 'Preparing browser...', isFirstTask });
  }

  await ensureBrowserServerReady(callbacks.onProgress);
}

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
