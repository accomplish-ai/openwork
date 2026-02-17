import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
    TaskManagerOptions,
    TaskCallbacks,
    TaskConfig,
    CliResolverConfig,
    PlatformConfig,
    resolveCliPath,
    isCliAvailable as coreIsCliAvailable,
    buildCliArgs as coreBuildCliArgs,
    buildOpenCodeEnvironment,
    EnvironmentConfig,
    generateConfig,
    syncApiKeysToOpenCodeAuth,
    getOpenCodeAuthPath,
    getBundledNodePaths,
    getExtendedNodePath,
    logBundledNodeInfo,
    VertexCredentials,
    AzureFoundryCredentials,
    BedrockCredentials,
    BedrockAccessKeyCredentials,
    BedrockProfileCredentials,
    BedrockApiKeyCredentials,
    getAzureEntraToken,
    ensureDevBrowserServer,
    BrowserServerConfig,
    DEV_BROWSER_PORT,
} from '@accomplish_ai/agent-core';

import { getStorage, getUserDataPath } from './services/storage.js';
import { getMcpToolsPath } from './services/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const USER_DATA_PATH = getUserDataPath();
const VERTEX_SA_KEY_FILENAME = 'vertex-sa-key.json';

// getCliResolverConfig needs to satisfy PlatformConfig (for bundled node)
function getCliResolverConfig(): PlatformConfig & CliResolverConfig {
    return {
        platform: process.platform,
        arch: process.arch as any,
        isPackaged: false,
        resourcesPath: path.join(__dirname, '..', '..', '..'),
        appPath: process.cwd(),
        userDataPath: USER_DATA_PATH,
        tempPath: os.tmpdir(),
    };
}

export function getOpenCodeCliPath(): { command: string; args: string[] } {
    const resolved = resolveCliPath(getCliResolverConfig());
    if (resolved) {
        return { command: resolved.cliPath, args: [] };
    }
    return { command: 'opencode', args: [] };
}

export async function isCliAvailable(): Promise<boolean> {
    return coreIsCliAvailable(getCliResolverConfig());
}

export async function buildEnvironment(taskId: string): Promise<NodeJS.ProcessEnv> {
    let env: NodeJS.ProcessEnv = { ...process.env };

    // TODO: Add bundled node logic if we bundle node with daemon

    // const apiKeys = await getAllApiKeys(); // Removed in favor of storage
    const storage = getStorage();
    const apiKeys = await storage.getAllApiKeys();

    // Convert storage record to typed BedrockCredentials
    const rawBedrockCreds = getStorage().getBedrockCredentials();
    let bedrockCredentials: BedrockCredentials | undefined;

    if (rawBedrockCreds) {
        if (rawBedrockCreds.authType === 'accessKeys') {
            bedrockCredentials = rawBedrockCreds as unknown as BedrockAccessKeyCredentials;
        } else if (rawBedrockCreds.authType === 'profile') {
            bedrockCredentials = rawBedrockCreds as unknown as BedrockProfileCredentials;
        } else if (rawBedrockCreds.authType === 'apiKey') {
            bedrockCredentials = rawBedrockCreds as unknown as BedrockApiKeyCredentials;
        }
    }

    const bundledNode = getBundledNodePaths(getCliResolverConfig());

    const configuredOpenAiBaseUrl = apiKeys.openai ? storage.getOpenAiBaseUrl().trim() : undefined;

    const activeModel = storage.getActiveProviderModel();
    const selectedModel = storage.getSelectedModel();
    let ollamaHost: string | undefined;
    if (activeModel?.provider === 'ollama' && activeModel.baseUrl) {
        ollamaHost = activeModel.baseUrl;
    } else if (selectedModel?.provider === 'ollama' && selectedModel.baseUrl) {
        ollamaHost = selectedModel.baseUrl;
    }

    // Same as electron, but using fs/path directly
    let vertexCredentials: VertexCredentials | undefined;
    let vertexServiceAccountKeyPath: string | undefined;
    const vertexCredsJson = getStorage().getApiKey('vertex');
    if (vertexCredsJson) {
        try {
            const parsed = JSON.parse(vertexCredsJson) as VertexCredentials;
            vertexCredentials = parsed;
            if (parsed.authType === 'serviceAccount' && parsed.serviceAccountJson) {
                vertexServiceAccountKeyPath = path.join(USER_DATA_PATH, VERTEX_SA_KEY_FILENAME);
                fs.mkdirSync(path.dirname(vertexServiceAccountKeyPath), { recursive: true });
                fs.writeFileSync(vertexServiceAccountKeyPath, parsed.serviceAccountJson, { mode: 0o600 });
            }
        } catch (e) {
            console.warn('Failed to parse vertex creds', e);
        }
    }

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

    env = buildOpenCodeEnvironment(env, envConfig);
    return env;
}

export async function buildCliArgs(config: TaskConfig, _taskId: string): Promise<string[]> {
    const storage = getStorage();
    const activeModel = storage.getActiveProviderModel();
    const selectedModel = activeModel || storage.getSelectedModel();

    return coreBuildCliArgs({
        prompt: config.prompt,
        sessionId: config.sessionId,
        selectedModel: selectedModel ? {
            provider: selectedModel.provider,
            model: selectedModel.model,
        } : null,
    });
}

export async function onBeforeStart(): Promise<void> {
    const apiKeys = await getStorage().getAllApiKeys();
    const authPath = path.join(USER_DATA_PATH, 'auth.json');

    await syncApiKeysToOpenCodeAuth(
        path.join(USER_DATA_PATH, 'auth.json'),
        apiKeys
    );

    let azureFoundryToken: string | undefined;
    // ... Azure logic (same as electron) ...

    await generateConfig({
        platform: process.platform,
        mcpToolsPath: getMcpToolsPath(),
        userDataPath: USER_DATA_PATH,
        isPackaged: false,
        azureFoundryToken,
        // Default ports for daemon
        permissionApiPort: 9226,
        questionApiPort: 9227,
    });
}

function getBrowserServerConfig(): BrowserServerConfig {
    const bundledPaths = getBundledNodePaths(getCliResolverConfig());
    return {
        mcpToolsPath: getMcpToolsPath(),
        bundledNodeBinPath: bundledPaths?.binDir,
        devBrowserPort: DEV_BROWSER_PORT,
    };
}

export async function onBeforeTaskStart(
    callbacks: TaskCallbacks,
    isFirstTask: boolean
): Promise<void> {
    if (isFirstTask) {
        callbacks.onProgress({ stage: 'browser', message: 'Preparing browser...', isFirstTask });
    }

    const browserConfig = getBrowserServerConfig();
    await ensureDevBrowserServer(browserConfig, callbacks.onProgress);
}

export function createDaemonTaskManagerOptions(): TaskManagerOptions {
    return {
        adapterOptions: {
            platform: process.platform,
            isPackaged: false, // For now
            tempPath: os.tmpdir(),
            getCliCommand: getOpenCodeCliPath,
            buildEnvironment,
            onBeforeStart,
            getModelDisplayName: (model: any) => model, // Simple pass-through
            buildCliArgs,
        },
        defaultWorkingDirectory: os.tmpdir(),
        maxConcurrentTasks: 10,
        isCliAvailable,
        onBeforeTaskStart,
    };
}
