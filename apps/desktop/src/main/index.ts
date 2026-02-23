import { config } from 'dotenv';
import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  nativeImage,
  session,
  desktopCapturer,
  screen,
  Tray,
  Menu,
  globalShortcut,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { registerIPCHandlers } from './ipc/handlers';
import { disposeTaskManager } from './opencode/task-manager';
import { checkAndCleanupFreshInstall } from './store/freshInstallCleanup';
import { initializeSmartTrigger, disposeSmartTrigger } from './smart-trigger';
import { storeApiKey, getApiKey } from './store/secureStorage';
import { getDesktopContextService } from './services/desktop-context-service';
import {
  initializeDesktopContextPolling,
  getDesktopContextPollingService,
} from './services/desktop-context-polling';

process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason);
});

// Clean mode - wipe all stored data for a fresh start
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
}

// Set app name
app.name = 'Screen Agent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file from app root
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '../../.env');
config({ path: envPath });

// Auto-load API keys from .env into secure storage (if not already stored)
// This allows users to set API keys via .env file
if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  const existingKey = getApiKey('google');
  if (!existingKey) {
    storeApiKey('google', process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    console.log('[Main] Loaded Google AI API key from .env file');
  }
}
if (process.env.ANTHROPIC_API_KEY) {
  const existingKey = getApiKey('anthropic');
  if (!existingKey) {
    storeApiKey('anthropic', process.env.ANTHROPIC_API_KEY);
    console.log('[Main] Loaded Anthropic API key from .env file');
  }
}
if (process.env.OPENAI_API_KEY) {
  const existingKey = getApiKey('openai');
  if (!existingKey) {
    storeApiKey('openai', process.env.OPENAI_API_KEY);
    console.log('[Main] Loaded OpenAI API key from .env file');
  }
}
if (process.env.XAI_API_KEY) {
  const existingKey = getApiKey('xai');
  if (!existingKey) {
    storeApiKey('xai', process.env.XAI_API_KEY);
    console.log('[Main] Loaded xAI API key from .env file');
  }
}
if (process.env.OPENROUTER_API_KEY) {
  const existingKey = getApiKey('openrouter');
  if (!existingKey) {
    storeApiKey('openrouter', process.env.OPENROUTER_API_KEY);
    console.log('[Main] Loaded OpenRouter API key from .env file');
  }
}

process.env.APP_ROOT = path.join(__dirname, '../..');

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
let expandedWindowBounds: { x: number; y: number; width: number; height: number } | null = null;
let isCollapsedToIcon = false;
let tray: Tray | null = null;

const TOGGLE_MICROPHONE_SHORTCUT = 'Control+Command+M';
const TOGGLE_MICROPHONE_CHANNEL = 'voice:toggle-dictation';

const DEFAULT_WINDOW_MIN_WIDTH = 380;
const DEFAULT_WINDOW_MIN_HEIGHT = 500;
const DEFAULT_WINDOW_MAX_WIDTH = 600;
const DEFAULT_WINDOW_MAX_HEIGHT = 900;
const ICON_WINDOW_SCALE = 4;
const ICON_WINDOW_SIZE = 160 * ICON_WINDOW_SCALE;
const ICON_WINDOW_MARGIN = 16;

function getIconWindowBounds(targetWindow: BrowserWindow): { x: number; y: number; width: number; height: number } {
  const display = screen.getDisplayMatching(targetWindow.getBounds());
  const { x, y, width, height } = display.workArea;

  return {
    width: ICON_WINDOW_SIZE,
    height: ICON_WINDOW_SIZE,
    x: x + width - ICON_WINDOW_SIZE - ICON_WINDOW_MARGIN,
    y: y + height - ICON_WINDOW_SIZE - ICON_WINDOW_MARGIN,
  };
}

function getActiveMainWindow(): BrowserWindow | null {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    mainWindow.webContents.isDestroyed()
  ) {
    return null;
  }
  return mainWindow;
}

function withActiveMainWindow(
  action: (window: BrowserWindow) => void,
  onUnavailable?: () => void
): void {
  const activeWindow = getActiveMainWindow();
  if (!activeWindow) {
    onUnavailable?.();
    return;
  }

  try {
    action(activeWindow);
  } catch (error) {
    console.warn('[Main] Window action skipped because window is unavailable', error);
    onUnavailable?.();
  }
}

// Get the preload script path
function getPreloadPath(): string {
  return path.join(__dirname, '../preload/index.cjs');
}

function createWindow() {
  console.log('[Main] Creating Screen Agent window');

  // Get app icon
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(process.env.APP_ROOT!, 'resources', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  const preloadPath = getPreloadPath();
  console.log('[Main] Using preload script:', preloadPath);

  // Get screen dimensions to position the floating window
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Floating window dimensions
  const windowWidth = 460;
  const windowHeight = 680;

  // Position in bottom-right corner with some padding
  const x = screenWidth - windowWidth - 20;
  const y = screenHeight - windowHeight - 20;

  const createdWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    minWidth: DEFAULT_WINDOW_MIN_WIDTH,
    minHeight: DEFAULT_WINDOW_MIN_HEIGHT,
    maxWidth: DEFAULT_WINDOW_MAX_WIDTH,
    maxHeight: DEFAULT_WINDOW_MAX_HEIGHT,
    title: 'Screen Agent',
    icon: icon.isEmpty() ? undefined : icon,
    // Floating window style
    frame: false, // No native title bar
    transparent: true, // Allow transparent background
    vibrancy: 'under-window', // macOS blur effect
    visualEffectState: 'active',
    hasShadow: true,
    alwaysOnTop: false, // User can toggle this
    skipTaskbar: false,
    resizable: true,
    movable: true,
    // macOS specific
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 }, // Hide traffic lights
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow = createdWindow;
  createdWindow.on('closed', () => {
    if (mainWindow === createdWindow) {
      mainWindow = null;
    }
    expandedWindowBounds = null;
    isCollapsedToIcon = false;
  });

  // Open external links in browser
  createdWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Open DevTools only for interactive local development.
  // In automated runs (CI/tests/diagnostics), detached DevTools can become the first window
  // and break startup healthchecks that expect the renderer window.
  if (!app.isPackaged && process.env.CI !== 'true' && process.env.NODE_ENV !== 'test') {
    // Use detached devtools for floating window
    createdWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Load the local UI
  if (VITE_DEV_SERVER_URL) {
    console.log('[Main] Loading from Vite dev server:', VITE_DEV_SERVER_URL);
    createdWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(RENDERER_DIST, 'index.html');
    console.log('[Main] Loading from file:', indexPath);
    createdWindow.loadFile(indexPath);
  }
}

function getAppIcon(): Electron.NativeImage {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(process.env.APP_ROOT!, 'resources', 'icon.png');
  return nativeImage.createFromPath(iconPath);
}

function ensureMainWindowVisibleAndFocused(): void {
  const activeWindow = getActiveMainWindow();
  if (!activeWindow) {
    createWindow();
    return;
  }

  if (isCollapsedToIcon) {
    activeWindow.setResizable(true);
    activeWindow.setMinimumSize(DEFAULT_WINDOW_MIN_WIDTH, DEFAULT_WINDOW_MIN_HEIGHT);
    activeWindow.setMaximumSize(DEFAULT_WINDOW_MAX_WIDTH, DEFAULT_WINDOW_MAX_HEIGHT);
    activeWindow.setVibrancy('under-window');
    activeWindow.setHasShadow(true);

    if (expandedWindowBounds) {
      activeWindow.setBounds(expandedWindowBounds, false);
    }

    isCollapsedToIcon = false;
  }

  if (activeWindow.isMinimized()) {
    activeWindow.restore();
  }

  activeWindow.show();
  activeWindow.focus();
}

function requestDictationToggle(): void {
  ensureMainWindowVisibleAndFocused();

  const activeWindow = getActiveMainWindow();
  if (!activeWindow) {
    return;
  }

  activeWindow.webContents.send(TOGGLE_MICROPHONE_CHANNEL);
}

function createTray() {
  if (process.platform !== 'darwin' || tray) {
    return;
  }

  const trayIcon = getAppIcon();
  if (trayIcon.isEmpty()) {
    console.warn('[Main] Tray icon could not be created');
    return;
  }

  tray = new Tray(trayIcon.resize({ width: 18, height: 18 }));
  tray.setToolTip('Screen Agent');

  const buildContextMenu = () => Menu.buildFromTemplate([
    {
      label: 'Open Screen Agent',
      click: () => ensureMainWindowVisibleAndFocused(),
    },
    {
      label: `Toggle Microphone (${TOGGLE_MICROPHONE_SHORTCUT})`,
      click: () => requestDictationToggle(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(buildContextMenu());
  tray.on('click', () => ensureMainWindowVisibleAndFocused());
}

function registerGlobalShortcuts() {
  const registered = globalShortcut.register(TOGGLE_MICROPHONE_SHORTCUT, () => {
    requestDictationToggle();
  });

  if (!registered) {
    console.warn(`[Main] Failed to register global shortcut: ${TOGGLE_MICROPHONE_SHORTCUT}`);
  } else {
    console.log(`[Main] Registered global shortcut: ${TOGGLE_MICROPHONE_SHORTCUT}`);
  }
}

// Use single-instance lock only for packaged apps.
// In dev we allow running alongside an installed build.
const shouldUseSingleInstanceLock = app.isPackaged;
const gotTheLock = shouldUseSingleInstanceLock
  ? app.requestSingleInstanceLock()
  : true;

if (shouldUseSingleInstanceLock && !gotTheLock) {
  console.log('[Main] Second instance attempted; quitting');
  app.quit();
} else {
  if (shouldUseSingleInstanceLock) {
    app.on('second-instance', () => {
      withActiveMainWindow((activeWindow) => {
        if (activeWindow.isMinimized()) activeWindow.restore();
        activeWindow.show();
        activeWindow.focus();
        console.log('[Main] Focused existing instance after second-instance event');
      }, () => {
        if (app.isReady()) {
          createWindow();
          console.log('[Main] Recreated window after second-instance event');
        }
      });
    });
  }

  app.whenReady().then(async () => {
    console.log('[Main] Electron app ready, version:', app.getVersion());

    // Check for fresh install and cleanup old data
    try {
      const didCleanup = await checkAndCleanupFreshInstall();
      if (didCleanup) {
        console.log('[Main] Cleaned up data from previous installation');
      }
    } catch (err) {
      console.error('[Main] Fresh install cleanup failed:', err);
    }

    // Set dock icon on macOS
    if (process.platform === 'darwin' && app.dock) {
      const icon = getAppIcon();
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
      }
    }

    // Register IPC handlers before creating window
    registerIPCHandlers();
    console.log('[Main] IPC handlers registered');

    // Set up session permission handler for screen capture
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      // Allow screen capture permissions
      const allowedPermissions = ['media', 'display-capture', 'mediaKeySystem'];
      if (allowedPermissions.includes(permission)) {
        callback(true);
      } else {
        callback(false);
      }
    });

    // Handle display media request for screen capture
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
        // Grant access to the first screen source by default
        if (sources.length > 0) {
          callback({ video: sources[0], audio: 'loopback' });
        } else {
          callback({});
        }
      }).catch((err) => {
        console.error('[Main] Failed to get desktop sources:', err);
        callback({});
      });
    });
    console.log('[Main] Screen capture permissions configured');

    createWindow();
    createTray();
    registerGlobalShortcuts();

    // Initialize smart trigger service after window is created
    const activeWindow = getActiveMainWindow();
    if (activeWindow) {
      initializeSmartTrigger(activeWindow);
    }

    // Initialize desktop context polling if enabled
    initializeDesktopContextPolling();

    app.on('activate', () => {
      withActiveMainWindow((active) => {
        active.show();
        active.focus();
      }, () => {
        createWindow();
        console.log('[Main] Application reactivated; recreated window');
      });
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    console.log('[Main] All windows closed; quitting app');
    app.quit();
  }
});

// Dispose TaskManager, SmartTrigger, DesktopContextService, and polling before quitting
app.on('before-quit', () => {
  console.log('[Main] App before-quit event fired');
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  disposeTaskManager();
  disposeSmartTrigger();
  getDesktopContextService().shutdown();
  getDesktopContextPollingService().stop();
});

// Handle custom protocol
app.setAsDefaultProtocolClient('screenagent');

app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('[Main] Received protocol URL:', url);
  if (url.startsWith('screenagent://callback')) {
    withActiveMainWindow((activeWindow) => {
      activeWindow.webContents.send('auth:callback', url);
    }, () => {
      console.warn('[Main] Ignoring auth callback because no active window is available');
    });
  }
});

// IPC Handlers for window control
ipcMain.handle('app:version', () => {
  return app.getVersion();
});

ipcMain.handle('app:platform', () => {
  return process.platform;
});

// Toggle always on top
ipcMain.handle('window:toggle-always-on-top', () => {
  const activeWindow = getActiveMainWindow();
  if (activeWindow) {
    const isOnTop = activeWindow.isAlwaysOnTop();
    activeWindow.setAlwaysOnTop(!isOnTop);
    return !isOnTop;
  }
  return false;
});

// Minimize window
ipcMain.handle('window:minimize', () => {
  const activeWindow = getActiveMainWindow();
  activeWindow?.minimize();
});

// Show window
ipcMain.handle('window:show', () => {
  const activeWindow = getActiveMainWindow();
  if (activeWindow) {
    activeWindow.show();
    activeWindow.focus();
  }
});

ipcMain.handle('window:collapse-to-icon', () => {
  const activeWindow = getActiveMainWindow();
  if (!activeWindow) return;

  if (!isCollapsedToIcon) {
    expandedWindowBounds = activeWindow.getBounds();
  }

  activeWindow.setMinimumSize(1, 1);
  activeWindow.setMaximumSize(9999, 9999);
  activeWindow.setResizable(false);
  activeWindow.setVibrancy(null);
  activeWindow.setHasShadow(false);
  activeWindow.setBounds(getIconWindowBounds(activeWindow), false);
  isCollapsedToIcon = true;
});

ipcMain.handle('window:expand-from-icon', () => {
  const activeWindow = getActiveMainWindow();
  if (!activeWindow) return;

  activeWindow.setResizable(true);
  activeWindow.setMinimumSize(DEFAULT_WINDOW_MIN_WIDTH, DEFAULT_WINDOW_MIN_HEIGHT);
  activeWindow.setMaximumSize(DEFAULT_WINDOW_MAX_WIDTH, DEFAULT_WINDOW_MAX_HEIGHT);
  activeWindow.setVibrancy('under-window');
  activeWindow.setHasShadow(true);

  if (expandedWindowBounds) {
    activeWindow.setBounds(expandedWindowBounds, false);
  }

  activeWindow.show();
  activeWindow.focus();
  isCollapsedToIcon = false;
});
