import type { AppUpdater } from 'electron-updater';
import { app, dialog, BrowserWindow } from 'electron';
import Store from 'electron-store';
import fs from 'fs';
import path from 'path';

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

let mainWindow: BrowserWindow | null = null;
let downloadedVersion: string | null = null;
let availableVersion: string | null = null;
let onUpdateDownloadedCallback: (() => void) | null = null;

let _autoUpdater: AppUpdater | null = null;
async function lazyAutoUpdater(): Promise<AppUpdater> {
  if (!_autoUpdater) {
    // electron-updater caches app.getVersion() in its constructor — set valid version first
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
      availableVersion = info.version;
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
    if (!silent) showWindowsUpdateDialog();
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
  return { updateAvailable: !!downloadedVersion, downloadedVersion, availableVersion };
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

async function showWindowsUpdateDialog(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'info', title: 'Check for Updates',
    message: 'Please visit our releases page to check for the latest version.',
    buttons: ['Open Downloads', 'Cancel'], defaultId: 0, cancelId: 1,
  });
  if (response === 0) {
    const { shell } = await import('electron');
    shell.openExternal('https://github.com/accomplish-ai/accomplish-enterprise/releases');
  }
}
