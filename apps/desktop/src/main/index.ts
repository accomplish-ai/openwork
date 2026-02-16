import { config } from "dotenv";
import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  nativeImage,
  dialog,
  nativeTheme,
} from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { registerHuggingFaceHandlers } from "./ipc/huggingface";

const APP_DATA_NAME = "Accomplish";
app.setPath("userData", path.join(app.getPath("appData"), APP_DATA_NAME));

if (process.platform === "win32") {
  app.setAppUserModelId("ai.accomplish.desktop");
}

import { registerIPCHandlers } from "./ipc/handlers";
import { FutureSchemaError } from "@accomplish_ai/agent-core";
import {
  initThoughtStreamApi,
  startThoughtStreamServer,
} from "./thought-stream-api";
import type { ProviderId } from "@accomplish_ai/agent-core";
import { disposeTaskManager, cleanupVertexServiceAccountKey } from "./opencode";
import { oauthBrowserFlow } from "./opencode/auth-browser";
import { migrateLegacyData } from "./store/legacyMigration";
import {
  initializeStorage,
  closeStorage,
  getStorage,
  resetStorageSingleton,
} from "./store/storage";
import { getApiKey, clearSecureStorage } from "./store/secureStorage";
import {
  initializeLogCollector,
  shutdownLogCollector,
  getLogCollector,
} from "./logging";
import { skillsManager } from "./skills";

if (process.argv.includes("--e2e-skip-auth")) {
  (global as Record<string, unknown>).E2E_SKIP_AUTH = true;
}
if (
  process.argv.includes("--e2e-mock-tasks") ||
  process.env.E2E_MOCK_TASK_EVENTS === "1"
) {
  (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS = true;
}

if (process.env.CLEAN_START === "1") {
  const userDataPath = app.getPath("userData");
  console.log("[Clean Mode] Clearing userData directory:", userDataPath);
  try {
    if (fs.existsSync(userDataPath)) {
      fs.rmSync(userDataPath, { recursive: true, force: true });
      console.log("[Clean Mode] Successfully cleared userData");
    }
  } catch (err) {
    console.error("[Clean Mode] Failed to clear userData:", err);
  }
  // Clear secure storage first (while singleton still exists), then null the reference.
  // Reversing this order would cause getStorage() to re-create the singleton.
  clearSecureStorage();
  resetStorageSingleton();
  console.log("[Clean Mode] All singletons reset");
}

app.setName("Accomplish");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = app.isPackaged
  ? path.join(process.resourcesPath, ".env")
  : path.join(__dirname, "../../.env");
config({ path: envPath });

process.env.APP_ROOT = path.join(__dirname, "../..");

export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function getPreloadPath(): string {
  return path.join(__dirname, "../preload/index.cjs");
}

function createWindow() {
  console.log("[Main] Creating main application window");

  const iconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, iconFile)
    : path.join(process.env.APP_ROOT!, "resources", iconFile);
  const icon = nativeImage.createFromPath(iconPath);
  if (process.platform === "darwin" && app.dock && !icon.isEmpty()) {
    app.dock.setIcon(icon);
  }

  const preloadPath = getPreloadPath();
  console.log("[Main] Using preload script:", preloadPath);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Accomplish",
    icon: icon.isEmpty() ? undefined : icon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#171717" : "#f9f9f9",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  console.log("[Main] BrowserWindow created");

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.maximize();
  console.log("[Main] Window maximized");

  const isE2EMode = (global as Record<string, unknown>).E2E_SKIP_AUTH === true;
  const isTestEnv = process.env.NODE_ENV === "test";
  if (!app.isPackaged && !isE2EMode && !isTestEnv) {
    mainWindow.webContents.openDevTools({ mode: "right" });
    console.log("[Main] DevTools opened");
  }

  if (VITE_DEV_SERVER_URL) {
    console.log("[Main] Loading from Vite dev server:", VITE_DEV_SERVER_URL);
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(RENDERER_DIST, "index.html");
    console.log("[Main] Loading from file:", indexPath);
    mainWindow.loadFile(indexPath);
  }

  console.log("[Main] Window content loading initiated");
}

process.on("uncaughtException", (error) => {
  console.error("[Main] Uncaught exception:", error);
  try {
    const collector = getLogCollector();
    collector.log("ERROR", "main", `Uncaught exception: ${error.message}`, {
      name: error.name,
      stack: error.stack,
    });
  } catch {}
});

process.on("unhandledRejection", (reason) => {
  console.error("[Main] Unhandled rejection:", reason);
  try {
    const collector = getLogCollector();
    collector.log("ERROR", "main", "Unhandled promise rejection", { reason });
  } catch {}
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log("[Main] Second instance attempted; quitting");
  app.quit();
} else {
  console.log("[Main] Got single instance lock");
  initializeLogCollector();
  getLogCollector().logEnv("INFO", "App starting", {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  });

  app.on("second-instance", (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      console.log(
        "[Main] Focused existing instance after second-instance event",
      );

      if (process.platform === "win32") {
        const protocolUrl = commandLine.find((arg) =>
          arg.startsWith("accomplish://"),
        );
        if (protocolUrl) {
          console.log(
            "[Main] Received protocol URL from second-instance:",
            protocolUrl,
          );
          if (protocolUrl.startsWith("accomplish://callback/mcp")) {
            mainWindow.webContents.send("auth:mcp-callback", protocolUrl);
          } else if (protocolUrl.startsWith("accomplish://callback")) {
            mainWindow.webContents.send("auth:callback", protocolUrl);
          }
        }
      }
    }
  });

  app.whenReady().then(async () => {
    console.log("[Main] ========================================");
    console.log("[Main] Electron app ready, version:", app.getVersion());
    console.log("[Main] ========================================");

    if (process.env.CLEAN_START !== "1") {
      try {
        console.log("[Main] Starting legacy data migration check...");
        const didMigrate = migrateLegacyData();
        if (didMigrate) {
          console.log("[Main] Migrated data from legacy userData path");
        }
        console.log("[Main] Migration check complete");
      } catch (err) {
        console.error("[Main] Legacy data migration failed:", err);
      }
    }

    try {
      console.log("[Main] Initializing storage...");
      initializeStorage();
      console.log("[Main] Storage initialized successfully");
    } catch (err) {
      console.error("[Main] Storage initialization failed:", err);
      if (err instanceof FutureSchemaError) {
        await dialog.showMessageBox({
          type: "error",
          title: "Update Required",
          message: `This data was created by a newer version of Accomplish (schema v${err.storedVersion}).`,
          detail: `Your app supports up to schema v${err.appVersion}. Please update Accomplish to continue.`,
          buttons: ["Quit"],
        });
        app.quit();
        return;
      }
      throw err;
    }

    try {
      console.log("[Main] Validating provider settings...");
      const storage = getStorage();
      const settings = storage.getProviderSettings();
      console.log("[Main] Got provider settings");
      for (const [id, provider] of Object.entries(
        settings.connectedProviders,
      )) {
        const providerId = id as ProviderId;
        const credType = provider?.credentials?.type;
        if (!credType || credType === "api_key") {
          const key = getApiKey(providerId);
          if (!key) {
            console.warn(
              `[Main] Provider ${providerId} has api_key auth but key not found in secure storage`,
            );
            storage.removeConnectedProvider(providerId);
            console.log(
              `[Main] Removed provider ${providerId} due to missing API key`,
            );
          }
        }
      }
      console.log("[Main] Provider validation complete");
    } catch (err) {
      console.error("[Main] Provider validation failed:", err);
    }

    console.log("[Main] Initializing skills manager...");
    try {
      await skillsManager.initialize();
      console.log("[Main] Skills manager initialized successfully");
    } catch (err) {
      console.error("[Main] Skills manager initialization failed:", err);
    }

    if (process.platform === "darwin" && app.dock) {
      const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, "icon.png")
        : path.join(process.env.APP_ROOT!, "resources", "icon.png");
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
      }
    }

    // Must run before createWindow() so backgroundColor matches the theme
    try {
      console.log("[Main] Setting theme...");
      const storage = getStorage();
      nativeTheme.themeSource = storage.getTheme();
      console.log("[Main] Theme set to:", nativeTheme.themeSource);
    } catch (err) {
      // First launch or corrupt DB — nativeTheme stays 'system'
      console.log("[Main] Using default theme (system), error:", err);
    }

    console.log("[Main] Registering IPC handlers...");
    
    try {
      // Ensure storage is initialized and valid before registering HuggingFace handlers
      getStorage();
      registerHuggingFaceHandlers();
    } catch (err) {
      console.error(
        "[Main] Skipping HuggingFace IPC handler registration; storage not initialized or invalid:",
        err,
      );
    }
    registerIPCHandlers();
    console.log("[Main] IPC handlers registered");

    console.log("[Main] ========================================");
    console.log("[Main] About to call createWindow()...");
    console.log("[Main] ========================================");

    try {
      createWindow();
      console.log("[Main] createWindow() returned");
    } catch (err) {
      console.error("[Main] ERROR in createWindow():", err);
      throw err;
    }

    if (mainWindow) {
      console.log("[Main] Main window exists, initializing thought stream API");
      try {
        initThoughtStreamApi(mainWindow);
        startThoughtStreamServer();
        console.log("[Main] Thought stream API initialized");
      } catch (err) {
        console.error("[Main] Thought stream API initialization failed:", err);
      }
    } else {
      console.error("[Main] ERROR: mainWindow is null after createWindow()!");
    }

    console.log("[Main] Setting up activate handler...");
    app.on("activate", () => {
      console.log("[Main] Activate event fired");
      if (BrowserWindow.getAllWindows().length === 0) {
        console.log("[Main] No windows, creating new window");
        createWindow();
        console.log("[Main] Application reactivated; recreated window");
      } else {
        console.log(
          "[Main] Windows exist:",
          BrowserWindow.getAllWindows().length,
        );
      }
    });

    console.log("[Main] ========================================");
    console.log("[Main] App initialization complete!");
    console.log("[Main] ========================================");
  });
}

app.on("window-all-closed", () => {
  console.log("[Main] All windows closed");
  if (process.platform !== "darwin") {
    console.log("[Main] Quitting app (not macOS)");
    app.quit();
  }
});

if (process.platform === "win32" && !app.isPackaged) {
  app.setAsDefaultProtocolClient("accomplish", process.execPath, [
    path.resolve(process.argv[1]),
  ]);
} else {
  app.setAsDefaultProtocolClient("accomplish");
}

function handleProtocolUrlFromArgs(): void {
  if (process.platform === "win32") {
    const protocolUrl = process.argv.find((arg) =>
      arg.startsWith("accomplish://"),
    );
    if (protocolUrl) {
      console.log("[Main] Protocol URL found in args:", protocolUrl);
      app.whenReady().then(() => {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            console.log("[Main] Sending protocol URL to renderer");
            if (protocolUrl.startsWith("accomplish://callback/mcp")) {
              mainWindow.webContents.send("auth:mcp-callback", protocolUrl);
            } else if (protocolUrl.startsWith("accomplish://callback")) {
              mainWindow.webContents.send("auth:callback", protocolUrl);
            }
          }
        }, 1000);
      });
    }
  }
}

handleProtocolUrlFromArgs();

app.on("open-url", (event, url) => {
  console.log("[Main] Open URL event:", url);
  event.preventDefault();
  if (url.startsWith("accomplish://callback/mcp")) {
    mainWindow?.webContents?.send("auth:mcp-callback", url);
  } else if (url.startsWith("accomplish://callback")) {
    mainWindow?.webContents?.send("auth:callback", url);
  }
});

ipcMain.handle("app:version", () => {
  return app.getVersion();
});

ipcMain.handle("app:platform", () => {
  return process.platform;
});

ipcMain.handle("app:is-e2e-mode", () => {
  return (
    (global as Record<string, unknown>).E2E_MOCK_TASK_EVENTS === true ||
    process.env.E2E_MOCK_TASK_EVENTS === "1"
  );
});
