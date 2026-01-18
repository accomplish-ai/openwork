/**
 * SharedOpenCodeServer - Manages a single OpenCode server instance shared across all adapters
 *
 * This ensures that session context is maintained across follow-up messages.
 * The OpenCode server maintains session state, so we need to keep it alive
 * rather than killing it when individual adapters are disposed.
 */

import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import { getOpenCodeCliPath, isOpenCodeBundled } from './cli-path';
import { getAllApiKeys, getBedrockCredentials } from '../store/secureStorage';
import { getSelectedModel } from '../store/appSettings';
import { generateOpenCodeConfig, syncApiKeysToOpenCodeAuth } from './config-generator';
import { getExtendedNodePath } from '../utils/system-path';
import { getBundledNodePaths, logBundledNodeInfo } from '../utils/bundled-node';

/**
 * Singleton shared server manager
 */
class SharedOpenCodeServer {
  private serverProcess: ChildProcess | null = null;
  private serverPort: number | null = null;
  private serverReady: boolean = false;
  private startupPromise: Promise<void> | null = null;
  private workingDirectory: string | null = null;
  private refCount: number = 0;

  /**
   * Get the server port (null if not running)
   */
  getPort(): number | null {
    return this.serverPort;
  }

  /**
   * Check if server is ready
   */
  isReady(): boolean {
    return this.serverReady;
  }

  /**
   * Acquire a reference to the server.
   * Call release() when done to allow cleanup.
   */
  acquire(): void {
    this.refCount++;
    console.log(`[SharedServer] Reference acquired. Count: ${this.refCount}`);
  }

  /**
   * Release a reference to the server.
   * Server may be stopped if no references remain (after a delay).
   */
  release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    console.log(`[SharedServer] Reference released. Count: ${this.refCount}`);

    // Don't immediately stop - keep server warm for potential follow-ups
    // Server will be stopped on app quit via dispose()
  }

  /**
   * Ensure the server is running. Returns when server is ready.
   * If server is already running, returns immediately.
   */
  async ensureRunning(workingDirectory?: string): Promise<number> {
    // If already starting, wait for that to complete
    if (this.startupPromise) {
      await this.startupPromise;
      return this.serverPort!;
    }

    // If already running, return the port
    if (this.serverReady && this.serverPort) {
      // Health check to ensure server is still responsive
      try {
        const response = await fetch(`http://localhost:${this.serverPort}/global/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          console.log('[SharedServer] Server already running on port', this.serverPort);
          return this.serverPort;
        }
      } catch {
        // Server not responding, need to restart
        console.log('[SharedServer] Server not responding, restarting...');
        this.serverReady = false;
        this.serverProcess = null;
      }
    }

    // Start the server
    this.workingDirectory = workingDirectory || this.workingDirectory;
    this.startupPromise = this.startServer();

    try {
      await this.startupPromise;
      return this.serverPort!;
    } finally {
      this.startupPromise = null;
    }
  }

  /**
   * Start the OpenCode server
   */
  private async startServer(): Promise<void> {
    // Sync API keys first
    console.log('[SharedServer] Syncing API keys...');
    await syncApiKeysToOpenCodeAuth();

    // Generate config
    console.log('[SharedServer] Generating config...');
    const configPath = await generateOpenCodeConfig();
    console.log('[SharedServer] Config generated at:', configPath);

    // Find an available port
    this.serverPort = await this.findAvailablePort();

    const { command, args: baseArgs } = getOpenCodeCliPath();
    const env = await this.buildEnvironment();
    const safeCwd = this.workingDirectory || app.getPath('temp');

    const serverArgs = [...baseArgs, 'serve', '--port', String(this.serverPort)];

    console.log('[SharedServer] Starting server on port', this.serverPort);
    console.log('[SharedServer] Command:', command, serverArgs.join(' '));

    return new Promise((resolve, reject) => {
      this.serverProcess = spawn(command, serverArgs, {
        cwd: safeCwd,
        env: env as NodeJS.ProcessEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const startupTimeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 30000);

      this.serverProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('[SharedServer stdout]:', output);

        // Check if server is ready
        if (output.includes('listening') || output.includes('started') || output.includes(String(this.serverPort))) {
          clearTimeout(startupTimeout);
          this.serverReady = true;
          console.log('[SharedServer] Server is ready');
          resolve();
        }
      });

      this.serverProcess.stderr?.on('data', (data: Buffer) => {
        console.error('[SharedServer stderr]:', data.toString());
      });

      this.serverProcess.on('error', (err) => {
        clearTimeout(startupTimeout);
        console.error('[SharedServer] Process error:', err);
        reject(err);
      });

      this.serverProcess.on('exit', (code, signal) => {
        console.log('[SharedServer] Process exited:', code, signal);
        this.serverReady = false;
        this.serverProcess = null;
        this.serverPort = null;
      });

      // Also try to detect ready state by polling the health endpoint
      this.pollServerReady().then(() => {
        clearTimeout(startupTimeout);
        this.serverReady = true;
        resolve();
      }).catch(() => {
        // Polling failed, rely on stdout detection
      });
    });
  }

  /**
   * Poll the server health endpoint until ready
   */
  private async pollServerReady(): Promise<void> {
    const maxAttempts = 30;
    const delay = 500;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`http://localhost:${this.serverPort}/global/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          console.log('[SharedServer] Health check passed');
          return;
        }
      } catch {
        // Server not ready yet
      }
      await new Promise(r => setTimeout(r, delay));
    }
    throw new Error('Server health check timeout');
  }

  /**
   * Find an available port
   */
  private async findAvailablePort(): Promise<number> {
    const net = await import('net');

    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 40000;
        server.close(() => {
          resolve(port);
        });
      });
      server.on('error', () => {
        resolve(40000 + Math.floor(Math.random() * 10000));
      });
    });
  }

  /**
   * Build environment variables
   */
  private async buildEnvironment(): Promise<NodeJS.ProcessEnv> {
    const env: NodeJS.ProcessEnv = { ...process.env };

    if (app.isPackaged) {
      env.ELECTRON_RUN_AS_NODE = '1';
      logBundledNodeInfo();

      const bundledNode = getBundledNodePaths();
      if (bundledNode) {
        const delimiter = process.platform === 'win32' ? ';' : ':';
        env.PATH = `${bundledNode.binDir}${delimiter}${env.PATH || ''}`;
        env.NODE_BIN_PATH = bundledNode.binDir;
      }

      if (process.platform === 'darwin') {
        env.PATH = getExtendedNodePath(env.PATH);
      }
    }

    const apiKeys = await getAllApiKeys();
    if (apiKeys.anthropic) env.ANTHROPIC_API_KEY = apiKeys.anthropic;
    if (apiKeys.openai) env.OPENAI_API_KEY = apiKeys.openai;
    if (apiKeys.google) env.GOOGLE_GENERATIVE_AI_API_KEY = apiKeys.google;
    if (apiKeys.xai) env.XAI_API_KEY = apiKeys.xai;
    if (apiKeys.deepseek) env.DEEPSEEK_API_KEY = apiKeys.deepseek;
    if (apiKeys.zai) env.ZAI_API_KEY = apiKeys.zai;

    const bedrockCredentials = getBedrockCredentials();
    if (bedrockCredentials) {
      if (bedrockCredentials.authType === 'accessKeys') {
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

    const selectedModel = getSelectedModel();
    if (selectedModel?.provider === 'ollama' && selectedModel.baseUrl) {
      env.OLLAMA_HOST = selectedModel.baseUrl;
    }

    if (process.env.OPENCODE_CONFIG) {
      env.OPENCODE_CONFIG = process.env.OPENCODE_CONFIG;
    }

    return env;
  }

  /**
   * Stop the server (called on app quit)
   */
  dispose(): void {
    console.log('[SharedServer] Disposing server...');

    if (this.serverProcess) {
      try {
        this.serverProcess.kill();
      } catch (error) {
        console.error('[SharedServer] Error killing server:', error);
      }
      this.serverProcess = null;
    }

    this.serverReady = false;
    this.serverPort = null;
    this.refCount = 0;

    console.log('[SharedServer] Server disposed');
  }
}

// Singleton instance
let sharedServerInstance: SharedOpenCodeServer | null = null;

/**
 * Get the shared OpenCode server instance
 */
export function getSharedServer(): SharedOpenCodeServer {
  if (!sharedServerInstance) {
    sharedServerInstance = new SharedOpenCodeServer();
  }
  return sharedServerInstance;
}

/**
 * Dispose the shared server (call on app quit)
 */
export function disposeSharedServer(): void {
  if (sharedServerInstance) {
    sharedServerInstance.dispose();
    sharedServerInstance = null;
  }
}
