import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const storeData: Record<string, unknown> = {};

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '0.3.8'),
    setVersion: vi.fn(),
    getPath: vi.fn(() => '/tmp/test-userdata'),
    getAppPath: vi.fn(() => '/tmp/test-app'),
    isPackaged: false,
    name: 'Accomplish',
  },
  dialog: { showMessageBox: vi.fn(() => Promise.resolve({ response: 1 })), showErrorBox: vi.fn() },
  BrowserWindow: vi.fn(),
  shell: { openExternal: vi.fn() },
  clipboard: { writeText: vi.fn() },
}));

const mockAutoUpdater = {
  autoDownload: true,
  autoInstallOnAppQuit: false,
  forceDevUpdateConfig: false,
  setFeedURL: vi.fn(),
  checkForUpdates: vi.fn(() => Promise.resolve()),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
};
vi.mock('electron-updater', () => ({ autoUpdater: mockAutoUpdater }));

vi.mock('electron-store', () => {
  class MockStore {
    get(key: string) {
      return storeData[key];
    }
    set(key: string, val: unknown) {
      storeData[key] = val;
    }
  }
  return { default: MockStore };
});

// Mock https for Windows update flow
function createMockHttpsResponse(statusCode: number, body: string) {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;
  setTimeout(() => {
    res.emit('data', body);
    res.emit('end');
  }, 0);
  return res;
}

const mockHttpsGet = vi.fn();
vi.mock('https', () => ({
  default: { get: (...args: unknown[]) => mockHttpsGet(...args) },
  get: (...args: unknown[]) => mockHttpsGet(...args),
}));

vi.mock('../../../src/main/opencode', () => ({ disposeTaskManager: vi.fn() }));
vi.stubGlobal('__APP_TIER__', 'enterprise');
vi.stubGlobal('__APP_VERSION__', '0.3.8');
vi.stubEnv('ACCOMPLISH_UPDATER_URL', 'https://downloads.openwork.me');

describe('updater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(storeData)) delete storeData[key];
    mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
      const res = createMockHttpsResponse(
        200,
        `version: 1.0.0\npath: https://example.com/installer.exe\nsha512: abc123\nreleaseDate: '2026-01-01'\n`,
      );
      cb(res);
      return { on: vi.fn() };
    });
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
    it('configures autoUpdater with correct settings on non-win32', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);
        expect(mockAutoUpdater.autoDownload).toBe(true);
        expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
        expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
          provider: 'generic',
          url: 'https://downloads.openwork.me',
          channel: 'enterprise',
        });
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('returns early on win32 without configuring autoUpdater', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);
        expect(mockAutoUpdater.setFeedURL).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('sets channel to latest for lite tier', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      vi.stubGlobal('__APP_TIER__', 'lite');
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);
        expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith(
          expect.objectContaining({ channel: 'latest' }),
        );
      } finally {
        vi.stubGlobal('__APP_TIER__', 'enterprise');
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('registers event handlers for update-available, download-progress, update-downloaded, error', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);
        const registeredEvents = mockAutoUpdater.on.mock.calls.map((c: unknown[]) => c[0]);
        expect(registeredEvents).toContain('update-available');
        expect(registeredEvents).toContain('download-progress');
        expect(registeredEvents).toContain('update-downloaded');
        expect(registeredEvents).toContain('error');
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
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
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('on win32, does not call autoUpdater.checkForUpdates', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(true);
        expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('on win32 with newer version available, shows update dialog', async () => {
      const { dialog } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        const res = createMockHttpsResponse(
          200,
          `version: 1.0.0\npath: https://example.com/installer.exe\nsha512: abc\nreleaseDate: '2026-01-01'\n`,
        );
        cb(res);
        return { on: vi.fn() };
      });
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(false);
        expect(dialog.showMessageBox).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Update Available' }),
        );
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('on win32 with same version, shows no-update dialog when not silent', async () => {
      const { dialog } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        const res = createMockHttpsResponse(
          200,
          `version: 0.3.8\npath: https://example.com/installer.exe\nsha512: abc\nreleaseDate: '2026-01-01'\n`,
        );
        cb(res);
        return { on: vi.fn() };
      });
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(false);
        expect(dialog.showMessageBox).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'No Updates' }),
        );
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('on win32 with fetch failure and silent=true, does not show dialog', async () => {
      const { dialog } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        const res = createMockHttpsResponse(500, '');
        cb(res);
        return { on: vi.fn() };
      });
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(true);
        expect(dialog.showMessageBox).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('on win32 with fetch failure and silent=false, shows error dialog', async () => {
      const { dialog } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      mockHttpsGet.mockImplementation((_url: string, cb: (res: unknown) => void) => {
        const res = createMockHttpsResponse(500, '');
        cb(res);
        return { on: vi.fn() };
      });
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(false);
        expect(dialog.showMessageBox).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Update Check Failed' }),
        );
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('on win32 update dialog Download button opens external URL', async () => {
      const { dialog, shell } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({
        response: 0,
      } as Awaited<ReturnType<typeof dialog.showMessageBox>>);
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(false);
        expect(shell.openExternal).toHaveBeenCalledWith('https://example.com/installer.exe');
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('on win32 update dialog Copy URL button copies to clipboard', async () => {
      const { dialog, clipboard } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({
        response: 1,
      } as Awaited<ReturnType<typeof dialog.showMessageBox>>);
      try {
        const { checkForUpdates } = await import('../../../src/main/updater');
        await checkForUpdates(false);
        expect(clipboard.writeText).toHaveBeenCalledWith('https://example.com/installer.exe');
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
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
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
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
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
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
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
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
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
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
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        const { initUpdater, getUpdateState } = await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);

        const updateAvailableHandler = mockAutoUpdater.on.mock.calls.find(
          (c: unknown[]) => c[0] === 'update-available',
        )?.[1] as (info: { version: string }) => void;

        updateAvailableHandler({ version: '1.2.3' });
        expect(getUpdateState().availableVersion).toBe('1.2.3');
        expect(process.env.__UPDATER_AVAILABLE__).toBe('1.2.3');
        expect(dialog.showMessageBox).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('download-progress handler updates progress bar', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);

        const progressHandler = mockAutoUpdater.on.mock.calls.find(
          (c: unknown[]) => c[0] === 'download-progress',
        )?.[1] as (progress: { percent: number }) => void;

        progressHandler({ percent: 50 });
        expect(mockWindow.setProgressBar).toHaveBeenCalledWith(0.5);
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('update-downloaded handler sets downloadedVersion, calls callback, and shows dialog', async () => {
      const { dialog } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        const { initUpdater, getUpdateState, setOnUpdateDownloaded } =
          await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        const callback = vi.fn();
        setOnUpdateDownloaded(callback);
        await initUpdater(mockWindow);

        const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
          (c: unknown[]) => c[0] === 'update-downloaded',
        )?.[1] as (info: { version: string }) => void;

        downloadedHandler({ version: '1.2.3' });
        expect(getUpdateState().downloadedVersion).toBe('1.2.3');
        expect(mockWindow.setProgressBar).toHaveBeenCalledWith(-1);
        expect(callback).toHaveBeenCalled();
        expect(dialog.showMessageBox).toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('error handler clears progress bar and logs error', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);

        const errorHandler = mockAutoUpdater.on.mock.calls.find(
          (c: unknown[]) => c[0] === 'error',
        )?.[1] as (error: Error) => void;

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        errorHandler(new Error('Something broke'));
        expect(mockWindow.setProgressBar).toHaveBeenCalledWith(-1);
        expect(consoleSpy).toHaveBeenCalledWith('[Updater] Error:', 'Something broke');
        consoleSpy.mockRestore();
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('update-downloaded handler suppresses dialog when __UPDATER_AUTO_ACCEPT__ is set', async () => {
      const { dialog } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      process.env.__UPDATER_AUTO_ACCEPT__ = 'true';
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);

        const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
          (c: unknown[]) => c[0] === 'update-downloaded',
        )?.[1] as (info: { version: string }) => void;

        downloadedHandler({ version: '2.0.0' });
        await new Promise((r) => setTimeout(r, 50));
        expect(dialog.showMessageBox).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
        delete process.env.__UPDATER_AUTO_ACCEPT__;
      }
    });

    it('update-downloaded dialog "Restart Now" (response=0) triggers quitAndInstall', async () => {
      const { dialog } = await import('electron');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({
        response: 0,
      } as Awaited<ReturnType<typeof dialog.showMessageBox>>);
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);

        const downloadedHandler = mockAutoUpdater.on.mock.calls.find(
          (c: unknown[]) => c[0] === 'update-downloaded',
        )?.[1] as (info: { version: string }) => void;

        downloadedHandler({ version: '2.0.0' });
        await vi.waitFor(() => {
          expect(dialog.showMessageBox).toHaveBeenCalled();
        });
        // quitAndInstall waits 2s then calls autoUpdater.quitAndInstall
        await vi.waitFor(
          () => {
            expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled();
          },
          { timeout: 5000 },
        );
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });
  });

  describe('quitAndInstall', () => {
    it('disposes task manager then calls autoUpdater.quitAndInstall', async () => {
      const { disposeTaskManager } = await import('../../../src/main/opencode');
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        const { quitAndInstall, initUpdater } = await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);

        await quitAndInstall();
        expect(disposeTaskManager).toHaveBeenCalled();
        expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled();
      } finally {
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });
  });

  describe('initUpdater edge cases', () => {
    it('falls back to UPDATE_SERVER_URL when ACCOMPLISH_UPDATER_URL is unset', async () => {
      const originalUrl = process.env.ACCOMPLISH_UPDATER_URL;
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      delete process.env.ACCOMPLISH_UPDATER_URL;
      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);
        // setFeedURL should still be called with the hardcoded fallback URL
        expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith(
          expect.objectContaining({ url: 'https://downloads.openwork.me' }),
        );
      } finally {
        process.env.ACCOMPLISH_UPDATER_URL = originalUrl;
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
      }
    });

    it('catches and logs errors if autoUpdater setup throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      // Make setFeedURL throw to trigger the catch block
      mockAutoUpdater.setFeedURL.mockImplementationOnce(() => {
        throw new Error('Feed setup failed');
      });

      try {
        const { initUpdater } = await import('../../../src/main/updater');
        const mockWindow = {
          setProgressBar: vi.fn(),
        } as unknown as import('electron').BrowserWindow;
        await initUpdater(mockWindow);

        expect(consoleSpy).toHaveBeenCalledWith(
          '[Updater] initUpdater crashed:',
          expect.any(Error),
        );
      } finally {
        consoleSpy.mockRestore();
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
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
        Object.defineProperty(process, 'platform', {
          value: originalPlatform,
          configurable: true,
        });
        delete process.env.__UPDATER_AUTO_ACCEPT__;
        mockAutoUpdater.checkForUpdates.mockReturnValue(Promise.resolve());
      }
    });
  });
});
