import type { AppUpdater, UpdateInfo } from 'electron-updater';
import { app, dialog, BrowserWindow, shell, clipboard } from 'electron';
import Store from 'electron-store';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const UPDATE_SERVER_URL = 'https://downloads.openwork.me';

function getFeedUrl(): string {
  return process.env.ACCOMPLISH_UPDATER_URL || UPDATE_SERVER_URL;
}

let store: Store<{ lastUpdateCheck: number }>;
function getStore(): Store<{ lastUpdateCheck: number }> {
  if (!store) {
    store = new Store<{ lastUpdateCheck: number }>({
      name: 'updater',
      defaults: { lastUpdateCheck: 0 },
    });
  }
  return store;
}

// Windows update info from yml
interface WindowsUpdateInfo {
  version: string;
  path: string;
  sha512: string;
  releaseDate: string;
}

/**
 * Fetch and parse the latest-win.yml manifest
 */
async function fetchWindowsUpdateInfo(): Promise<WindowsUpdateInfo | null> {
  const tier = __APP_TIER__;
  const manifestName = tier === 'enterprise' ? 'latest-win-enterprise.yml' : 'latest-win.yml';
  const url = `${getFeedUrl()}/${manifestName}`;

  return new Promise((resolve) => {
    const get = url.startsWith('http://') ? http.get : https.get;
    get(url, (res) => {
      if (res.statusCode !== 200) {
        console.error(`[Updater] Failed to fetch ${manifestName}: ${res.statusCode}`);
        resolve(null);
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const lines = data.split('\n');
          const info: Partial<WindowsUpdateInfo> = {};

          for (const line of lines) {
            const match = line.match(/^(\w+):\s*['"]?([^'"]+)['"]?\s*$/);
            if (match) {
              const [, key, value] = match;
              if (key === 'version') info.version = value;
              if (key === 'path') info.path = value;
              if (key === 'sha512') info.sha512 = value;
              if (key === 'releaseDate') info.releaseDate = value;
            }
          }

          if (info.version && info.path) {
            resolve(info as WindowsUpdateInfo);
          } else {
            console.error('[Updater] Invalid manifest format');
            resolve(null);
          }
        } catch (error) {
          console.error('[Updater] Failed to parse manifest:', error);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error('[Updater] Failed to fetch manifest:', error);
      resolve(null);
    });
  });
}

/**
 * Compare semantic versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Show update available dialog with download URL (Windows)
 */
async function showWindowsUpdateDialog(
  currentVersion: string,
  newVersion: string,
  downloadUrl: string,
): Promise<void> {
  const response = await dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `A new version of Accomplish is available!`,
    detail: `Version ${newVersion} is available.\nYou are currently on version ${currentVersion}.\n\nClick "Download" to open the download page in your browser.`,
    buttons: ['Download', 'Copy URL', 'Later'],
    defaultId: 0,
    cancelId: 2,
  });

  if (response.response === 0) {
    await shell.openExternal(downloadUrl);
  } else if (response.response === 1) {
    clipboard.writeText(downloadUrl);
  }
}

/**
 * Check for updates on Windows by fetching latest-win.yml
 */
async function checkForUpdatesWindows(silent: boolean): Promise<void> {
  const currentVersion = app.getVersion();

  const updateInfo = await fetchWindowsUpdateInfo();

  if (!updateInfo) {
    if (!silent) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'Could not check for updates',
        detail: 'Failed to fetch update information. Please try again later.',
        buttons: ['OK'],
      });
    }
    return;
  }

  getStore().set('lastUpdateCheck', Date.now());
  const isNewer = compareVersions(updateInfo.version, currentVersion) > 0;

  if (!isNewer) {
    if (!silent) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'No Updates',
        message: `You're up to date!`,
        detail: `Accomplish ${currentVersion} is the latest version.`,
        buttons: ['OK'],
      });
    }
    return;
  }

  const downloadUrl = updateInfo.path.startsWith('http://') || updateInfo.path.startsWith('https://')
    ? updateInfo.path
    : `${getFeedUrl()}/${updateInfo.path}`;

  updateAvailable = {
    version: updateInfo.version,
    releaseDate: updateInfo.releaseDate,
  } as UpdateInfo;
  process.env.__UPDATER_AVAILABLE__ = updateInfo.version;

  if (!process.env.__UPDATER_AUTO_ACCEPT__) {
    await showWindowsUpdateDialog(currentVersion, updateInfo.version, downloadUrl);
  }
}

let mainWindow: BrowserWindow | null = null;
let downloadedVersion: string | null = null;
let updateAvailable: UpdateInfo | null = null;
let onUpdateDownloadedCallback: (() => void) | null = null;

let _autoUpdater: AppUpdater | null = null;
async function lazyAutoUpdater(): Promise<AppUpdater> {
  if (!_autoUpdater) {
    if (!app.isPackaged) {
      (app as any).setVersion(__APP_VERSION__);
    }
    const mod = await import('electron-updater');
    _autoUpdater = mod.autoUpdater;
  }
  return _autoUpdater;
}

export async function initUpdater(window: BrowserWindow): Promise<void> {
  if (!getFeedUrl()) {
    console.log('[Updater] No ACCOMPLISH_UPDATER_URL configured, skipping updater init');
    return;
  }
  try {
    mainWindow = window;

    // Windows uses manifest-based update check, not electron-updater autoDownload
    if (process.platform === 'win32') return;

    const autoUpdater = await lazyAutoUpdater();
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    if (!app.isPackaged) {
      const appPath = app.getAppPath();
      fs.mkdirSync(appPath, { recursive: true });
      fs.writeFileSync(path.join(appPath, 'dev-app-update.yml'), `provider: generic\nurl: ${getFeedUrl()}\n`);
      autoUpdater.forceDevUpdateConfig = true;
    }
    const tier = __APP_TIER__;
    const channel = tier === 'enterprise' ? 'enterprise' : 'latest';
    autoUpdater.setFeedURL({ provider: 'generic', url: getFeedUrl(), channel });

    autoUpdater.on('update-available', (info) => {
      console.log('[Updater] update-available:', info.version);
      updateAvailable = info;
      process.env.__UPDATER_AVAILABLE__ = info.version;
    });
    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.setProgressBar(progress.percent / 100);
    });
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Updater] update-downloaded:', info.version);
      mainWindow?.setProgressBar(-1);
      downloadedVersion = info.version;
      process.env.__UPDATER_DOWNLOADED__ = info.version;
      onUpdateDownloadedCallback?.();
      if (!process.env.__UPDATER_AUTO_ACCEPT__) {
        showUpdateReadyDialog(info.version);
      }
    });
    autoUpdater.on('error', (error) => {
      mainWindow?.setProgressBar(-1);
      console.error('[Updater] Error:', error.message);
    });
  } catch (err) {
    console.error('[Updater] initUpdater crashed:', err);
  }
}

export async function checkForUpdates(silent: boolean): Promise<void> {
  if (!getFeedUrl()) return;

  if (process.platform === 'win32') {
    await checkForUpdatesWindows(silent);
    return;
  }

  try {
    const autoUpdater = await lazyAutoUpdater();
    await autoUpdater.checkForUpdates();
    getStore().set('lastUpdateCheck', Date.now());
  } catch (err: any) {
    if (!silent && !process.env.__UPDATER_AUTO_ACCEPT__) dialog.showErrorBox('Update Check Failed', err.message);
    console.error('[Updater] Check failed:', err.message);
  }
}

export async function quitAndInstall(): Promise<void> {
  const { disposeTaskManager } = await import('@main/opencode');
  disposeTaskManager();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const autoUpdater = await lazyAutoUpdater();
  autoUpdater.quitAndInstall();
}

export function shouldAutoCheck(): boolean {
  const lastCheck = getStore().get('lastUpdateCheck');
  if (!lastCheck) return true;
  return Date.now() - lastCheck > CHECK_INTERVAL_MS;
}

export function autoCheckForUpdates(): void {
  if (!shouldAutoCheck()) return;
  checkForUpdates(true);
}

export function getUpdateState(): { updateAvailable: boolean; downloadedVersion: string | null; availableVersion: string | null } {
  return { updateAvailable: !!updateAvailable, downloadedVersion, availableVersion: updateAvailable?.version || null };
}

export function setOnUpdateDownloaded(callback: () => void): void {
  onUpdateDownloadedCallback = callback;
}

async function showUpdateReadyDialog(version: string): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'info', title: 'Update Ready',
    message: `Version ${version} has been downloaded.`,
    detail: 'The update will be installed when you restart the app. Would you like to restart now?',
    buttons: ['Restart Now', 'Later'], defaultId: 0, cancelId: 1,
  });
  if (response === 0) await quitAndInstall();
}
