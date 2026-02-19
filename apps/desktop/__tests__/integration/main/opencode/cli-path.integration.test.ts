/**
 * Integration tests for OpenCode CLI path resolution
 *
 * Tests the electron-options module which resolves paths to the OpenCode CLI binary
 * in both development and packaged app modes. Uses @accomplish/core's cli-resolver
 * with Electron-specific configuration.
 *
 * @module __tests__/integration/main/opencode/cli-path.integration.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import path from 'path';

// Mock electron module before importing the module under test
const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => '/mock/app/path'),
};

vi.mock('electron', () => ({
  app: mockApp,
}));

// Mock fs module
const mockFs = {
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  readdirSync: mockFs.readdirSync,
  readFileSync: mockFs.readFileSync,
}));

// Mock child_process
const mockExecSync = vi.fn();

vi.mock('child_process', () => ({
  execSync: mockExecSync,
  execFile: vi.fn(),
}));

// Mock @accomplish_ai/agent-core cli-resolver functions - they use fs internally which is already mocked
// We need to pass through to the actual implementation since it uses the mocked fs
vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@accomplish_ai/agent-core')>();
  return {
    ...actual,
    // The cli-resolver functions should use the mocked fs, so we don't need to mock them
    // But we need to ensure other imports don't break the tests
    getSelectedModel: vi.fn(() => null),
    getAzureFoundryConfig: vi.fn(() => null),
    getActiveProviderModel: vi.fn(() => null),
    getConnectedProvider: vi.fn(() => null),
    getAzureEntraToken: vi.fn(() => ({ success: true, token: 'mock-token' })),
    getModelDisplayName: vi.fn(() => 'Mock Model'),
    ensureDevBrowserServer: vi.fn(),
    getOpenAiBaseUrl: vi.fn(() => ''),
  };
});

describe('OpenCode CLI Path Module', () => {
  const getLocalDevCliPath = (appPath: string): string =>
    process.platform === 'win32'
      ? path.join(appPath, 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe')
      : path.join(appPath, 'node_modules', '.bin', 'opencode');

  const getNestedWindowsDevCliPath = (appPath: string): string =>
    path.join(
      appPath,
      'node_modules',
      'opencode-ai',
      'node_modules',
      'opencode-windows-x64',
      'bin',
      'opencode.exe',
    );

  const getPrimaryGlobalDevCliPath = (): string =>
    process.platform === 'win32'
      ? path.join(
          process.env.APPDATA || '',
          'npm',
          'node_modules',
          'opencode-windows-x64',
          'bin',
          'opencode.exe',
        )
      : '/usr/local/bin/opencode';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state
    vi.resetModules();
    // Reset packaged state
    mockApp.isPackaged = false;
    // Reset HOME environment variable
    process.env.HOME = '/Users/testuser';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getOpenCodeCliPath()', () => {
    describe('Development Mode', () => {
      it('should return local CLI path in node_modules', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const appPath = '/mock/app/path';
        const localPath = getLocalDevCliPath(appPath);

        mockApp.getAppPath.mockReturnValue(appPath);
        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === localPath) return true;
          return false;
        });
        mockFs.readdirSync.mockReturnValue([]);

        // Act
        const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
        const result = getOpenCodeCliPath();

        // Assert
        expect(result.command).toBe(localPath);
        expect(result.args).toEqual([]);
      });

      it('should return nested Windows local CLI path under opencode-ai', async () => {
        if (process.platform !== 'win32') {
          return;
        }

        // Arrange
        mockApp.isPackaged = false;
        const appPath = '/mock/app/path';
        const nestedLocalPath = getNestedWindowsDevCliPath(appPath);

        mockApp.getAppPath.mockReturnValue(appPath);
        mockFs.existsSync.mockImplementation((p: string) => p === nestedLocalPath);
        mockFs.readdirSync.mockReturnValue([]);

        // Act
        const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
        const result = getOpenCodeCliPath();

        // Assert
        expect(result.command).toBe(nestedLocalPath);
        expect(result.args).toEqual([]);
      });

      it('should throw when only global CLI path exists', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const globalPath = getPrimaryGlobalDevCliPath();
        mockFs.existsSync.mockImplementation((p: string) => p === globalPath);
        mockFs.readdirSync.mockReturnValue([]);

        // Act
        const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');

        // Assert
        expect(() => getOpenCodeCliPath()).toThrow('OpenCode CLI executable not found');
      });

      it('should throw when no local OpenCode CLI path can be resolved', async () => {
        // Arrange
        mockApp.isPackaged = false;
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockImplementation(() => {
          throw new Error('Command not found');
        });

        // Act
        const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');

        // Assert
        expect(() => getOpenCodeCliPath()).toThrow('OpenCode CLI executable not found');
      });
    });

    describe('Packaged Mode', () => {
      // Helper to get platform-specific package info
      const getPlatformInfo = () => {
        return {
          pkg: process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-ai',
          binary: process.platform === 'win32' ? 'opencode.exe' : 'opencode',
        };
      };

      it('should return unpacked asar path when packaged', async () => {
        // Arrange
        mockApp.isPackaged = true;
        const resourcesPath = '/Applications/Accomplish.app/Contents/Resources';
        (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = resourcesPath;

        const { pkg, binary } = getPlatformInfo();
        const expectedPath = path.join(
          resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          pkg,
          'bin',
          binary,
        );

        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === expectedPath) return true;
          return false;
        });

        // Act
        const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
        const result = getOpenCodeCliPath();

        // Assert
        expect(result.command).toBe(expectedPath);
        expect(result.args).toEqual([]);
      });

      it('should throw when bundled CLI is missing in packaged app', async () => {
        // Arrange
        mockApp.isPackaged = true;
        const resourcesPath = '/Applications/Accomplish.app/Contents/Resources';
        (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = resourcesPath;

        mockFs.existsSync.mockReturnValue(false);
        mockExecSync.mockImplementation(() => {
          throw new Error('Command not found');
        });

        // Act
        const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');

        // Assert
        expect(() => getOpenCodeCliPath()).toThrow('OpenCode CLI executable not found');
      });
    });
  });

  describe('isOpenCodeBundled()', () => {
    describe('Development Mode', () => {
      it('should return true when local OpenCode CLI is available', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const appPath = '/mock/app/path';
        const localPath = getLocalDevCliPath(appPath);

        mockApp.getAppPath.mockReturnValue(appPath);
        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === localPath) return true;
          return false;
        });
        mockFs.readdirSync.mockReturnValue([]);

        // Act
        const { isOpenCodeBundled } = await import('@main/opencode/electron-options');
        const result = isOpenCodeBundled();

        // Assert
        expect(result).toBe(true);
      });

      it('should return true when bundled CLI exists in node_modules', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const appPath = '/mock/app/path';
        const bundledPath = getLocalDevCliPath(appPath);

        mockApp.getAppPath.mockReturnValue(appPath);
        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === bundledPath) return true;
          return false;
        });
        mockFs.readdirSync.mockReturnValue([]);

        // Act
        const { isOpenCodeBundled } = await import('@main/opencode/electron-options');
        const result = isOpenCodeBundled();

        // Assert
        expect(result).toBe(true);
      });

      it('should return false when only global CLI is available', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const globalPath = getPrimaryGlobalDevCliPath();
        mockFs.existsSync.mockImplementation((p: string) => p === globalPath);
        mockFs.readdirSync.mockReturnValue([]);

        // Act
        const { isOpenCodeBundled } = await import('@main/opencode/electron-options');
        const result = isOpenCodeBundled();

        // Assert
        expect(result).toBe(false);
      });

      it('should return false when no CLI is found anywhere', async () => {
        // Arrange
        mockApp.isPackaged = false;
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockImplementation(() => {
          throw new Error('Command not found');
        });

        // Act
        const { isOpenCodeBundled } = await import('@main/opencode/electron-options');
        const result = isOpenCodeBundled();

        // Assert
        expect(result).toBe(false);
      });
    });

    describe('Packaged Mode', () => {
      // Helper to get platform-specific package info
      const getPlatformInfo = () => {
        return {
          pkg: process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-ai',
          binary: process.platform === 'win32' ? 'opencode.exe' : 'opencode',
        };
      };

      it('should return true when bundled CLI exists in unpacked asar', async () => {
        // Arrange
        mockApp.isPackaged = true;
        const resourcesPath = '/Applications/Accomplish.app/Contents/Resources';
        (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = resourcesPath;

        const { pkg, binary } = getPlatformInfo();
        const cliPath = path.join(
          resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          pkg,
          'bin',
          binary,
        );

        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === cliPath) return true;
          return false;
        });

        // Act
        const { isOpenCodeBundled } = await import('@main/opencode/electron-options');
        const result = isOpenCodeBundled();

        // Assert
        expect(result).toBe(true);
      });

      it('should return false when bundled CLI missing in unpacked asar', async () => {
        // Arrange
        mockApp.isPackaged = true;
        const resourcesPath = '/Applications/Accomplish.app/Contents/Resources';
        (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = resourcesPath;

        mockFs.existsSync.mockReturnValue(false);

        // Act
        const { isOpenCodeBundled } = await import('@main/opencode/electron-options');
        const result = isOpenCodeBundled();

        // Assert
        expect(result).toBe(false);
      });
    });
  });

  describe('getBundledOpenCodeVersion()', () => {
    const getPlatformInfo = () => ({
      pkg: process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-ai',
      binary: process.platform === 'win32' ? 'opencode.exe' : 'opencode',
    });

    describe('Packaged Mode', () => {
      it('should read version from package.json in unpacked asar', async () => {
        // Arrange
        mockApp.isPackaged = true;
        const resourcesPath = '/Applications/Accomplish.app/Contents/Resources';
        (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = resourcesPath;

        const { pkg, binary } = getPlatformInfo();
        const cliPath = path.join(
          resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          pkg,
          'bin',
          binary,
        );
        const packageJsonPath = path.join(
          resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          pkg,
          'package.json',
        );

        mockFs.existsSync.mockImplementation((p: string) => p === cliPath || p === packageJsonPath);
        mockFs.readFileSync.mockImplementation((p: string) => {
          if (p === packageJsonPath) {
            return JSON.stringify({ version: '1.2.3' });
          }
          return '';
        });

        // Act
        const { getBundledOpenCodeVersion } = await import('@main/opencode/electron-options');
        const result = getBundledOpenCodeVersion();

        // Assert
        expect(result).toBe('1.2.3');
      });

      it('should return null when package.json not found', async () => {
        // Arrange
        mockApp.isPackaged = true;
        const resourcesPath = '/Applications/Accomplish.app/Contents/Resources';
        (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = resourcesPath;

        mockFs.existsSync.mockReturnValue(false);

        // Act
        const { getBundledOpenCodeVersion } = await import('@main/opencode/electron-options');
        const result = getBundledOpenCodeVersion();

        // Assert
        expect(result).toBeNull();
      });
    });

    describe('Development Mode', () => {
      it('should execute CLI with --version flag and parse output', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const appPath = '/mock/app/path';
        const bundledPath = getLocalDevCliPath(appPath);

        mockApp.getAppPath.mockReturnValue(appPath);
        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === bundledPath) return true;
          return false;
        });
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockReturnValue('opencode 1.5.0\n');

        // Act
        const { getBundledOpenCodeVersion } = await import('@main/opencode/electron-options');
        const result = getBundledOpenCodeVersion();

        // Assert
        expect(result).toBe('1.5.0');
      });

      it('should parse version from simple version string', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const appPath = '/mock/app/path';
        const bundledPath = getLocalDevCliPath(appPath);

        mockApp.getAppPath.mockReturnValue(appPath);
        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === bundledPath) return true;
          return false;
        });
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockReturnValue('2.0.1');

        // Act
        const { getBundledOpenCodeVersion } = await import('@main/opencode/electron-options');
        const result = getBundledOpenCodeVersion();

        // Assert
        expect(result).toBe('2.0.1');
      });

      it('should return null when version command fails', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const appPath = '/mock/app/path';
        const bundledPath = getLocalDevCliPath(appPath);

        mockApp.getAppPath.mockReturnValue(appPath);
        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === bundledPath) return true;
          return false;
        });
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockImplementation(() => {
          throw new Error('Command failed');
        });

        // Act
        const { getBundledOpenCodeVersion } = await import('@main/opencode/electron-options');
        const result = getBundledOpenCodeVersion();

        // Assert
        expect(result).toBeNull();
      });
    });
  });
});
