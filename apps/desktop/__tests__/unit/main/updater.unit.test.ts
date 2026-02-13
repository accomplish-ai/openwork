import { describe, it, expect, vi, beforeEach } from 'vitest';

const storeData: Record<string, unknown> = {};

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.3.8'), setVersion: vi.fn(), getPath: vi.fn(() => '/tmp/test-userdata'), getAppPath: vi.fn(() => '/tmp/test-app'), isPackaged: false, name: 'Accomplish' },
  dialog: { showMessageBox: vi.fn(() => Promise.resolve({ response: 1 })), showErrorBox: vi.fn() },
  BrowserWindow: vi.fn(),
  shell: { openExternal: vi.fn() },
}));

const mockAutoUpdater = {
  autoDownload: true, autoInstallOnAppQuit: false, forceDevUpdateConfig: false,
  setFeedURL: vi.fn(), checkForUpdates: vi.fn(() => Promise.resolve()),
  quitAndInstall: vi.fn(), on: vi.fn(),
};
vi.mock('electron-updater', () => ({ autoUpdater: mockAutoUpdater }));

vi.mock('electron-store', () => {
  class MockStore {
    get(key: string) { return storeData[key]; }
    set(key: string, val: unknown) { storeData[key] = val; }
  }
  return { default: MockStore };
});

vi.mock('../../../src/main/opencode', () => ({ disposeTaskManager: vi.fn() }));
vi.stubGlobal('__APP_TIER__', 'enterprise');
vi.stubGlobal('__APP_VERSION__', '0.3.8');
vi.stubEnv('ACCOMPLISH_UPDATER_URL', 'https://downloads.openwork.me');

describe('updater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(storeData)) delete storeData[key];
  });

  describe('shouldAutoCheck', () => {
    it('returns true on first launch (no previous check)', async () => {
      const { shouldAutoCheck } = await import('../../../src/main/updater');
      expect(shouldAutoCheck()).toBe(true);
    });

    it('returns false when last check was recent', async () => {
      storeData['lastUpdateCheck'] = Date.now();
      const { shouldAutoCheck } = await import('../../../src/main/updater');
      expect(shouldAutoCheck()).toBe(false);
    });

    it('returns true when last check was over 7 days ago', async () => {
      storeData['lastUpdateCheck'] = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const { shouldAutoCheck } = await import('../../../src/main/updater');
      expect(shouldAutoCheck()).toBe(true);
    });
  });

  describe('getUpdateState', () => {
    it('returns initial state with no update', async () => {
      const { getUpdateState } = await import('../../../src/main/updater');
      const state = getUpdateState();
      expect(state.updateAvailable).toBe(false);
      expect(state.downloadedVersion).toBeNull();
      expect(state.availableVersion).toBeNull();
    });
  });

  describe('initUpdater', () => {
    it('configures autoUpdater with correct settings', async () => {
      const { initUpdater } = await import('../../../src/main/updater');
      const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;
      await initUpdater(mockWindow);
      expect(mockAutoUpdater.autoDownload).toBe(true);
      expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
      expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic', url: 'https://downloads.openwork.me', channel: 'enterprise',
      });
    });

    it('sets channel to latest for lite tier', async () => {
      vi.stubGlobal('__APP_TIER__', 'lite');
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);
        expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith(
          expect.objectContaining({ channel: 'latest' }),
        );
      } finally {
        vi.stubGlobal('__APP_TIER__', 'enterprise');
      }
    });

    it('registers event handlers for update-available, download-progress, update-downloaded, error', async () => {
      const { initUpdater } = await import('../../../src/main/updater');
      const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;
      await initUpdater(mockWindow);
      const registeredEvents = mockAutoUpdater.on.mock.calls.map((c: unknown[]) => c[0]);
      expect(registeredEvents).toContain('update-available');
      expect(registeredEvents).toContain('download-progress');
      expect(registeredEvents).toContain('update-downloaded');
      expect(registeredEvents).toContain('error');
    });
  });

  describe('checkForUpdates', () => {
    it('on darwin, calls autoUpdater.checkForUpdates', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(true);
        expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });

    it('on win32 with silent=true, does not call checkForUpdates or show dialog', async () => {
      const { dialog } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(true);
        expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
        expect(dialog.showMessageBox).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });

    it('on win32 with silent=false, shows Windows update dialog', async () => {
      const { dialog } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(false);
        expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
        expect(dialog.showMessageBox).toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });

    it('sets lastUpdateCheck in store after successful check', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        expect(storeData['lastUpdateCheck']).toBeUndefined();
        await checkForUpdates(true);
        expect(storeData['lastUpdateCheck']).toBeDefined();
        expect(typeof storeData['lastUpdateCheck']).toBe('number');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });

    it('on check failure with silent=false, shows error box', async () => {
      const { dialog } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      mockAutoUpdater.checkForUpdates.mockReturnValue(Promise.reject(new Error('Network error')));
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(false);
        await vi.waitFor(() => {
          expect(dialog.showErrorBox).toHaveBeenCalledWith('Update Check Failed', 'Network error');
        });
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        mockAutoUpdater.checkForUpdates.mockReturnValue(Promise.resolve());
      }
    });

    it('on check failure with silent=true, does not show error box', async () => {
      const { dialog } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      mockAutoUpdater.checkForUpdates.mockReturnValue(Promise.reject(new Error('Network error')));
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(true);
        // Give the promise time to reject
        await new Promise((r) => setTimeout(r, 50));
        expect(dialog.showErrorBox).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        mockAutoUpdater.checkForUpdates.mockReturnValue(Promise.resolve());
      }
    });
  });

  describe('autoCheckForUpdates', () => {
    it('calls checkForUpdates(true) when shouldAutoCheck returns true', async () => {
      // No lastUpdateCheck → shouldAutoCheck returns true
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        const { autoCheckForUpdates } = await import('../../../src/main/updater');
        autoCheckForUpdates();
        await vi.waitFor(() => {
          expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
        });
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });

    it('does not call checkForUpdates when shouldAutoCheck returns false', async () => {
      storeData['lastUpdateCheck'] = Date.now();
      const { autoCheckForUpdates } = await import('../../../src/main/updater');
      autoCheckForUpdates();
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });
  });

  describe('event handlers', () => {
    it('update-available handler sets availableVersion and env var without showing dialog', async () => {
      const { dialog } = await import('electron');
      const { initUpdater, getUpdateState } = await import('../../../src/main/updater');
      const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;
      await initUpdater(mockWindow);

      const updateAvailableHandler = mockAutoUpdater.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'update-available'
      )?.[1] as (info: { version: string }) => void;

      updateAvailableHandler({ version: '1.2.3' });
      expect(getUpdateState().availableVersion).toBe('1.2.3');
      expect(process.env.__UPDATER_AVAILABLE__).toBe('1.2.3');
      expect(dialog.showMessageBox).not.toHaveBeenCalled();
    });

    it('download-progress handler updates progress bar', async () => {
      const { initUpdater } = await import('../../../src/main/updater');
      const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;
      await initUpdater(mockWindow);

      const progressHandler = mockAutoUpdater.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'download-progress'
      )?.[1] as (progress: { percent: number }) => void;

      progressHandler({ percent: 50 });
      expect(mockWindow.setProgressBar).toHaveBeenCalledWith(0.5);
    });

    it('update-downloaded handler sets downloadedVersion, calls callback, and shows dialog', async () => {
      const { dialog } = await import('electron');
      const { initUpdater, getUpdateState, setOnUpdateDownloaded } = await import('../../../src/main/updater');
      const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;
      const callback = vi.fn();
      setOnUpdateDownloaded(callback);
      await initUpdater(mockWindow);

      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'update-downloaded'
      )?.[1] as (info: { version: string }) => void;

      downloadedHandler({ version: '1.2.3' });
      expect(getUpdateState().downloadedVersion).toBe('1.2.3');
      expect(getUpdateState().updateAvailable).toBe(true);
      expect(mockWindow.setProgressBar).toHaveBeenCalledWith(-1);
      expect(callback).toHaveBeenCalled();
      expect(dialog.showMessageBox).toHaveBeenCalled();
    });

    it('error handler clears progress bar and logs error', async () => {
      const { initUpdater } = await import('../../../src/main/updater');
      const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;
      await initUpdater(mockWindow);

      const errorHandler = mockAutoUpdater.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'error'
      )?.[1] as (error: Error) => void;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      errorHandler(new Error('Something broke'));
      expect(mockWindow.setProgressBar).toHaveBeenCalledWith(-1);
      expect(consoleSpy).toHaveBeenCalledWith('[Updater] Error:', 'Something broke');
      consoleSpy.mockRestore();
    });

    it('update-downloaded handler suppresses dialog when __UPDATER_AUTO_ACCEPT__ is set', async () => {
      const { dialog } = await import('electron');
      process.env.__UPDATER_AUTO_ACCEPT__ = 'true';
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);

        const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
          (c: unknown[]) => c[0] === 'update-downloaded'
        )?.[1] as (info: { version: string }) => void;

        downloadedHandler({ version: '2.0.0' });
        await new Promise((r) => setTimeout(r, 50));
        expect(dialog.showMessageBox).not.toHaveBeenCalled();
      } finally {
        delete process.env.__UPDATER_AUTO_ACCEPT__;
      }
    });

    it('update-downloaded dialog "Restart Now" (response=0) triggers quitAndInstall', async () => {
      const { dialog } = await import('electron');
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 0 } as any);
      const { initUpdater } = await import('../../../src/main/updater');
      const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;
      await initUpdater(mockWindow);

      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'update-downloaded'
      )?.[1] as (info: { version: string }) => void;

      downloadedHandler({ version: '2.0.0' });
      await vi.waitFor(() => {
        expect(dialog.showMessageBox).toHaveBeenCalled();
      });
      // quitAndInstall waits 2s then calls autoUpdater.quitAndInstall
      await vi.waitFor(() => {
        expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled();
      }, { timeout: 5000 });
    });
  });

  describe('quitAndInstall', () => {
    it('disposes task manager then calls autoUpdater.quitAndInstall', async () => {
      const { disposeTaskManager } = await import('../../../src/main/opencode');
      const { quitAndInstall } = await import('../../../src/main/updater');
      // Ensure autoUpdater is initialized
      const { initUpdater } = await import('../../../src/main/updater');
      const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;
      await initUpdater(mockWindow);

      await quitAndInstall();
      expect(disposeTaskManager).toHaveBeenCalled();
      expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled();
    });
  });

  describe('initUpdater edge cases', () => {
    it('falls back to UPDATE_SERVER_URL when ACCOMPLISH_UPDATER_URL is unset', async () => {
      const originalUrl = process.env.ACCOMPLISH_UPDATER_URL;
      delete process.env.ACCOMPLISH_UPDATER_URL;
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);
        // setFeedURL should still be called with the hardcoded fallback URL
        expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith(
          expect.objectContaining({ url: 'https://downloads.openwork.me' }),
        );
      } finally {
        process.env.ACCOMPLISH_UPDATER_URL = originalUrl;
      }
    });

    it('catches and logs errors if autoUpdater setup throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Make setFeedURL throw to trigger the catch block
      mockAutoUpdater.setFeedURL.mockImplementationOnce(() => { throw new Error('Feed setup failed'); });

      const { initUpdater } = await import('../../../src/main/updater');
      const mockWindow = { setProgressBar: vi.fn() } as unknown as import('electron').BrowserWindow;
      await initUpdater(mockWindow);

      expect(consoleSpy).toHaveBeenCalledWith('[Updater] initUpdater crashed:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('Windows update dialog', () => {
    it('on win32 with silent=false and response=0, opens external releases page', async () => {
      const { dialog, shell } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 0 } as any);
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(false);
        await vi.waitFor(() => {
          expect(shell.openExternal).toHaveBeenCalledWith('https://github.com/accomplish-ai/accomplish-enterprise/releases');
        });
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
      }
    });
  });

  describe('checkForUpdates error suppression with __UPDATER_AUTO_ACCEPT__', () => {
    it('on check failure with silent=false but __UPDATER_AUTO_ACCEPT__ set, does not show error box', async () => {
      const { dialog } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      process.env.__UPDATER_AUTO_ACCEPT__ = 'true';
      mockAutoUpdater.checkForUpdates.mockReturnValue(Promise.reject(new Error('Network error')));
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(false);
        await new Promise((r) => setTimeout(r, 50));
        expect(dialog.showErrorBox).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
        delete process.env.__UPDATER_AUTO_ACCEPT__;
        mockAutoUpdater.checkForUpdates.mockReturnValue(Promise.resolve());
      }
    });
  });
});
