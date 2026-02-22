import { config } from 'dotenv';
import { app, BrowserWindow, shell, ipcMain, nativeImage, dialog, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const APP_DATA_NAME = 'Accomplish';
app.setPath('userData', path.join(app.getPath('appData'), APP_DATA_NAME));

if (process.platform === 'win32') {
  app.setAppUserModelId('ai.accomplish.desktop');
}

import { registerIPCHandlers } from './ipc/handlers';
import {
  FutureSchemaError,
} from '@accomplish_ai/agent-core';
import type { ProviderId } from '@accomplish_ai/agent-core';
import { cleanupVertexServiceAccountKey } from './opencode';
import { oauthBrowserFlow } from './opencode/auth-browser';
import { migrateLegacyData } from './store/legacyMigration';
import { initializeStorage, closeStorage, getStorage, resetStorageSingleton } from './store/storage';
import { getApiKey, clearSecureStorage } from './store/secureStorage';
import { initializeLogCollector, shutdownLogCollector, getLogCollector } from './logging';
import { skillsManager } from './skills';
import { connectToDaemon, disconnectFromDaemon, isDaemonRunning } from './daemon-client';
import { getSocketPath } from '@accomplish_ai/agent-core';
import { spawn } from 'child_process';

if (process.argv.includes('--e2e-skip-auth')) {
  (global as Record<string, unknown>).E2E_SKIP_AUTH = true;
}
if (process.argv.includes('--e2e-mock-tasks') || process.env.E2E_MOCK_TASK_EVENTS === '1') {
  (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS = true;
}

if (process.env.CLEAN_START === '1') {
  const userDataPath = app.getPath('userData');
  console.log('[Clean Mode] Clearing userData directory:', userDataPath);
  try {
    if (fs.existsSync(userDataPath)) {
      fs.rmSync(userDataPath, { recursive: true, force: true });
      console.log('[Clean Mode] Successfully cleared userData');
    }
  } catch (err) {
    console.error('[Clean Mode] Failed to clear userData:', err);
  }
  // Clear secure storage first (while singleton still exists), then null the reference.
  // Reversing this order would cause getStorage() to re-create the singleton.
  clearSecureStorage();
  resetStorageSingleton();
  console.log('[Clean Mode] All singletons reset');
}

app.setName('Accomplish');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '../../.env');
config({ path: envPath });

process.env.APP_ROOT = path.join(__dirname, '../..');

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
let daemonChild: import('child_process').ChildProcess | null = null;
let isQuitting = false;

async function startDaemonProcess(): Promise<void> {
  const socketPath = getSocketPath();
  const dataDir = app.getPath('userData');

  let daemonEntry: string;
  let args: string[];

  if (app.isPackaged) {
    // ABI strategy: ELECTRON_RUN_AS_NODE=1 causes the spawned process to use
    // Electron's bundled Node.js runtime. Native modules (e.g. better-sqlite3)
    // must therefore be compiled against Electron's ABI. This is handled by
    // electron-rebuild during the build step.
    const asarUnpackedModules = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules');
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: asarUnpackedModules,
      MCP_TOOLS_PATH: path.join(process.resourcesPath, 'mcp-tools'),
      ACCOMPLISH_IS_PACKAGED: '1',
      ACCOMPLISH_RESOURCES_PATH: process.resourcesPath,
      ACCOMPLISH_APP_PATH: app.getAppPath(),
    };

    daemonEntry = path.join(process.resourcesPath, 'daemon', 'index.js');
    args = ['--socket-path', socketPath, '--data-dir', dataDir];
    const child = spawn(process.execPath, [daemonEntry, ...args], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      console.log('[Daemon Process]', chunk.toString().trim());
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      console.error('[Daemon Process]', chunk.toString().trim());
    });
    child.on('error', (err) => {
      console.error('[Daemon Process] spawn error:', err.message);
    });
    child.on('exit', (code, signal) => {
      if (code !== null && code !== 0) {
        console.error(`[Daemon Process] exited with code ${code}`);
      } else if (signal) {
        console.warn(`[Daemon Process] killed by signal ${signal}`);
      }
    });
    daemonChild = child;
    child.unref();
  } else {
    const monorepoRoot = path.join(__dirname, '..', '..', '..', '..');
    daemonEntry = path.join(monorepoRoot, 'apps', 'daemon', 'src', 'index.ts');
    args = ['--socket-path', socketPath, '--data-dir', dataDir];

    // Use Electron's own Node binary (via ELECTRON_RUN_AS_NODE) so the daemon
    // loads native modules compiled by electron-rebuild for the same ABI.
    const daemonDir = path.join(monorepoRoot, 'apps', 'daemon');
    const tsxCli = path.join(daemonDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const child = spawn(process.execPath, [tsxCli, daemonEntry, ...args], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: monorepoRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PATH: `${path.join(monorepoRoot, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH ?? ''}` },
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      console.log('[Daemon Process]', chunk.toString().trim());
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      console.error('[Daemon Process]', chunk.toString().trim());
    });
    child.on('error', (err) => {
      console.error('[Daemon Process] spawn error:', err.message);
    });
    child.on('exit', (code, signal) => {
      if (code !== null && code !== 0) {
        console.error(`[Daemon Process] exited with code ${code}`);
      } else if (signal) {
        console.warn(`[Daemon Process] killed by signal ${signal}`);
      }
    });
    daemonChild = child;
    child.unref();
  }

  const maxWait = 10_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (isQuitting) {
      throw new Error('Daemon startup cancelled: app is quitting');
    }
    const running = await isDaemonRunning();
    if (running) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Daemon did not start within 10 seconds');
}

function getPreloadPath(): string {
  return path.join(__dirname, '../preload/index.cjs');
}

function createWindow() {
  console.log('[Main] Creating main application window');

  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, iconFile)
    : path.join(process.env.APP_ROOT!, 'resources', iconFile);
  const icon = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin' && app.dock && !icon.isEmpty()) {
    app.dock.setIcon(icon);
  }

  const preloadPath = getPreloadPath();
  console.log('[Main] Using preload script:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Accomplish',
    icon: icon.isEmpty() ? undefined : icon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171717' : '#f9f9f9',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.maximize();

  const isE2EMode = (global as Record<string, unknown>).E2E_SKIP_AUTH === true;
  const isTestEnv = process.env.NODE_ENV === 'test';
  if (!app.isPackaged && !isE2EMode && !isTestEnv) {
    mainWindow.webContents.openDevTools({ mode: 'right' });
  }

  if (VITE_DEV_SERVER_URL) {
    console.log('[Main] Loading from Vite dev server:', VITE_DEV_SERVER_URL);
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(RENDERER_DIST, 'index.html');
    console.log('[Main] Loading from file:', indexPath);
    mainWindow.loadFile(indexPath);
  }
}

process.on('uncaughtException', (error) => {
  try {
    const collector = getLogCollector();
    collector.log('ERROR', 'main', `Uncaught exception: ${error.message}`, {
      name: error.name,
      stack: error.stack,
    });
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  try {
    const collector = getLogCollector();
    collector.log('ERROR', 'main', 'Unhandled promise rejection', { reason });
  } catch {}
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Main] Second instance attempted; quitting');
  app.quit();
} else {
  initializeLogCollector();
  getLogCollector().logEnv('INFO', 'App starting', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  });

  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      console.log('[Main] Focused existing instance after second-instance event');

      if (process.platform === 'win32') {
        const protocolUrl = commandLine.find((arg) => arg.startsWith('accomplish://'));
        if (protocolUrl) {
          console.log('[Main] Received protocol URL from second-instance:', protocolUrl);
          if (protocolUrl.startsWith('accomplish://callback/mcp')) {
            mainWindow.webContents.send('auth:mcp-callback', protocolUrl);
          } else if (protocolUrl.startsWith('accomplish://callback')) {
            mainWindow.webContents.send('auth:callback', protocolUrl);
          }
        }
      }
    }
  });

  app.whenReady().then(async () => {
    console.log('[Main] Electron app ready, version:', app.getVersion());

    if (process.env.CLEAN_START !== '1') {
      try {
        const didMigrate = migrateLegacyData();
        if (didMigrate) {
          console.log('[Main] Migrated data from legacy userData path');
        }
      } catch (err) {
        console.error('[Main] Legacy data migration failed:', err);
      }
    }

    try {
      initializeStorage();
    } catch (err) {
      if (err instanceof FutureSchemaError) {
        await dialog.showMessageBox({
          type: 'error',
          title: 'Update Required',
          message: `This data was created by a newer version of Accomplish (schema v${err.storedVersion}).`,
          detail: `Your app supports up to schema v${err.appVersion}. Please update Accomplish to continue.`,
          buttons: ['Quit'],
        });
        app.quit();
        return;
      }
      throw err;
    }

    try {
      const storage = getStorage();
      const settings = storage.getProviderSettings();
      for (const [id, provider] of Object.entries(settings.connectedProviders)) {
        const providerId = id as ProviderId;
        const credType = provider?.credentials?.type;
        if (!credType || credType === 'api_key') {
          const key = getApiKey(providerId);
          if (!key) {
            console.warn(`[Main] Provider ${providerId} has api_key auth but key not found in secure storage`);
            storage.removeConnectedProvider(providerId);
            console.log(`[Main] Removed provider ${providerId} due to missing API key`);
          }
        }
      }
    } catch (err) {
      console.error('[Main] Provider validation failed:', err);
    }

    await skillsManager.initialize();

    if (process.platform === 'darwin' && app.dock) {
      const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(process.env.APP_ROOT!, 'resources', 'icon.png');
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
      }
    }

    // Must run before createWindow() so backgroundColor matches the theme
    try {
      const storage = getStorage();
      nativeTheme.themeSource = storage.getTheme();
    } catch {
      // First launch or corrupt DB — nativeTheme stays 'system'
    }

    if (!(global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS) {
      try {
        const running = await isDaemonRunning();
        if (!running) {
          console.log('[Main] Daemon not running, starting...');
          await startDaemonProcess();
        }
        await connectToDaemon();
        console.log('[Main] Connected to daemon');
      } catch (err) {
        console.error('[Main] Failed to connect to daemon:', err);
        dialog.showMessageBox({
          type: 'warning',
          title: 'Daemon Connection Failed',
          message: 'Could not connect to the Accomplish daemon.',
          detail: `Task execution will be unavailable until the daemon is running.\n\nError: ${err instanceof Error ? err.message : String(err)}`,
          buttons: ['OK'],
        }).catch(() => {});
      }
    } else {
      console.log('[Main] E2E mock mode — skipping daemon startup');
    }

    registerIPCHandlers();
    console.log('[Main] IPC handlers registered');

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        console.log('[Main] Application reactivated; recreated window');
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let isCleaningUp = false;

app.on('before-quit', (event) => {
  isQuitting = true;

  if (isCleaningUp) {
    // Second call after async cleanup finished — let quit proceed
    return;
  }

  // First call: prevent quit, run async cleanup, then re-trigger quit
  event.preventDefault();
  isCleaningUp = true;

  (async () => {
    if (daemonChild && !daemonChild.killed) {
      daemonChild.kill('SIGTERM');
      daemonChild = null;
    }
    try {
      await disconnectFromDaemon();
    } catch {
      // Best-effort disconnect
    }
    cleanupVertexServiceAccountKey();
    oauthBrowserFlow.dispose();
    closeStorage();
    shutdownLogCollector();
  })().finally(() => {
    app.quit();
  });
});

if (process.platform === 'win32' && !app.isPackaged) {
  app.setAsDefaultProtocolClient('accomplish', process.execPath, [
    path.resolve(process.argv[1]),
  ]);
} else {
  app.setAsDefaultProtocolClient('accomplish');
}

function handleProtocolUrlFromArgs(): void {
  if (process.platform === 'win32') {
    const protocolUrl = process.argv.find((arg) => arg.startsWith('accomplish://'));
    if (protocolUrl) {
      app.whenReady().then(() => {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (protocolUrl.startsWith('accomplish://callback/mcp')) {
              mainWindow.webContents.send('auth:mcp-callback', protocolUrl);
            } else if (protocolUrl.startsWith('accomplish://callback')) {
              mainWindow.webContents.send('auth:callback', protocolUrl);
            }
          }
        }, 1000);
      });
    }
  }
}

handleProtocolUrlFromArgs();

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('accomplish://callback/mcp')) {
    mainWindow?.webContents?.send('auth:mcp-callback', url);
  } else if (url.startsWith('accomplish://callback')) {
    mainWindow?.webContents?.send('auth:callback', url);
  }
});

ipcMain.handle('app:version', () => {
  return app.getVersion();
});

ipcMain.handle('app:platform', () => {
  return process.platform;
});

ipcMain.handle('app:is-e2e-mode', () => {
  return (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS === true ||
    process.env.E2E_MOCK_TASK_EVENTS === '1';
});
