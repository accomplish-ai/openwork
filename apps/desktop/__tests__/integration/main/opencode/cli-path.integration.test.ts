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

const originalPlatform = process.platform;
const originalHome = process.env.HOME;
const originalUseGlobal = process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE;

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

vi.mock('@accomplish_ai/agent-core', () => {
  type CliResolverConfig = { isPackaged: boolean; resourcesPath?: string; appPath?: string };
  type ResolvedCliPaths = { cliPath: string; cliDir: string; source: 'bundled' | 'local' | 'global' };

  const getOpenCodePlatformInfo = () => {
    if (process.platform === 'win32') {
      return { packageName: 'opencode-windows-x64', binaryName: 'opencode.exe' };
    }
    return { packageName: 'opencode-ai', binaryName: 'opencode' };
  };

  const getNvmOpenCodePaths = (): string[] => {
    const homeDir = process.env.HOME || '';
    const nvmVersionsDir = path.join(homeDir, '.nvm/versions/node');
    const paths: string[] = [];
    try {
      if (mockFs.existsSync(nvmVersionsDir)) {
        const versions = mockFs.readdirSync(nvmVersionsDir) as string[];
        for (const version of versions) {
          const opencodePath = path.join(nvmVersionsDir, version, 'bin', 'opencode');
          if (mockFs.existsSync(opencodePath)) {
            paths.push(opencodePath);
          }
        }
      }
    } catch {
    }
    return paths;
  };

  const isOpenCodeOnPath = (): boolean => {
    try {
      const command = process.platform === 'win32' ? 'where opencode' : 'which opencode';
      mockExecSync(command, { stdio: ['pipe', 'pipe', 'pipe'] });
      return true;
    } catch {
      return false;
    }
  };

  const resolveCliPath = (config: CliResolverConfig): ResolvedCliPaths | null => {
    const { isPackaged, resourcesPath, appPath } = config;

    if (isPackaged && resourcesPath) {
      const { packageName, binaryName } = getOpenCodePlatformInfo();
      const cliPath = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', packageName, 'bin', binaryName);
      if (mockFs.existsSync(cliPath)) {
        return { cliPath, cliDir: path.dirname(cliPath), source: 'bundled' };
      }
      return null;
    }

    const preferGlobal = process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE === '1';
    if (appPath && !preferGlobal) {
      const binName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
      const devCliPath = path.join(appPath, 'node_modules', '.bin', binName);
      if (mockFs.existsSync(devCliPath)) {
        return { cliPath: devCliPath, cliDir: path.dirname(devCliPath), source: 'local' };
      }
    }

    const nvmPaths = getNvmOpenCodePaths();
    for (const opencodePath of nvmPaths) {
      return { cliPath: opencodePath, cliDir: path.dirname(opencodePath), source: 'global' };
    }

    const globalOpenCodePaths = process.platform === 'win32'
      ? [
          path.join(process.env.APPDATA || '', 'npm', 'opencode.cmd'),
          path.join(process.env.LOCALAPPDATA || '', 'npm', 'opencode.cmd'),
        ]
      : ['/usr/local/bin/opencode', '/opt/homebrew/bin/opencode'];

    for (const opencodePath of globalOpenCodePaths) {
      if (mockFs.existsSync(opencodePath)) {
        return { cliPath: opencodePath, cliDir: path.dirname(opencodePath), source: 'global' };
      }
    }

    if (appPath) {
      const binName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
      const devCliPath = path.join(appPath, 'node_modules', '.bin', binName);
      if (mockFs.existsSync(devCliPath)) {
        return { cliPath: devCliPath, cliDir: path.dirname(devCliPath), source: 'local' };
      }
    }

    if (isOpenCodeOnPath()) {
      return { cliPath: 'opencode', cliDir: '', source: 'global' };
    }

    return null;
  };

  return {
    DEV_BROWSER_PORT: 9222,
    resolveCliPath,
    isCliAvailable: (config: CliResolverConfig) => resolveCliPath(config) !== null,
    buildCliArgs: vi.fn(() => []),
    buildOpenCodeEnvironment: vi.fn((env: NodeJS.ProcessEnv) => env),
    ensureDevBrowserServer: vi.fn(),
    getAzureEntraToken: vi.fn(async () => ({ success: true, token: 'mock-token' })),
    getModelDisplayName: vi.fn(() => 'Mock Model'),
  };
});

describe('OpenCode CLI Path Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state
    vi.resetModules();
    // Make path resolution deterministic across host OS
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    // Reset packaged state
    mockApp.isPackaged = false;
    // Reset HOME environment variable
    process.env.HOME = '/Users/testuser';
    delete process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalUseGlobal === undefined) {
      delete process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE;
    } else {
      process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE = originalUseGlobal;
    }
  });

  describe('getOpenCodeCliPath()', () => {
    describe('Development Mode', () => {
      it('should return nvm OpenCode path when available', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const nvmVersionsDir = path.join('/Users/testuser', '.nvm', 'versions', 'node');
        const expectedPath = path.join(nvmVersionsDir, 'v20.10.0', 'bin', 'opencode');

        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === nvmVersionsDir) return true;
          if (p === expectedPath) return true;
          return false;
        });
        mockFs.readdirSync.mockImplementation((p: string) => {
          if (p === nvmVersionsDir) return ['v20.10.0'];
          return [];
        });

        // Act
        const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
        const result = getOpenCodeCliPath();

        // Assert
        expect(result.command).toBe(expectedPath);
        expect(result.args).toEqual([]);
      });

      it('should return global npm OpenCode path when nvm not available', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const globalPath = '/usr/local/bin/opencode';

        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === globalPath) return true;
          return false;
        });
        mockFs.readdirSync.mockReturnValue([]);

        // Act
        const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
        const result = getOpenCodeCliPath();

        // Assert
        expect(result.command).toBe(globalPath);
        expect(result.args).toEqual([]);
      });

      it('should return Homebrew OpenCode path on Apple Silicon', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const homebrewPath = '/opt/homebrew/bin/opencode';

        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === homebrewPath) return true;
          return false;
        });
        mockFs.readdirSync.mockReturnValue([]);

        // Act
        const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
        const result = getOpenCodeCliPath();

        // Assert
        expect(result.command).toBe(homebrewPath);
        expect(result.args).toEqual([]);
      });

      it('should return bundled CLI path in node_modules when global not found', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const appPath = '/mock/app/path';
        const bundledPath = path.join(appPath, 'node_modules', '.bin', 'opencode');

        mockApp.getAppPath.mockReturnValue(appPath);
        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === bundledPath) return true;
          return false;
        });
        mockFs.readdirSync.mockReturnValue([]);

        // Act
        const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
        const result = getOpenCodeCliPath();

        // Assert
        expect(result.command).toBe(bundledPath);
        expect(result.args).toEqual([]);
      });

      it('should fallback to PATH-based opencode when no paths found', async () => {
        // Arrange
        mockApp.isPackaged = false;
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);

        // Act
        const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
        const result = getOpenCodeCliPath();

        // Assert
        expect(result.command).toBe('opencode');
        expect(result.args).toEqual([]);
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
          binary
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

      it('should fallback to opencode on PATH when bundled CLI not found in packaged app', async () => {
        // Arrange
        mockApp.isPackaged = true;
        const resourcesPath = '/Applications/Accomplish.app/Contents/Resources';
        (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = resourcesPath;

        mockFs.existsSync.mockReturnValue(false);

        // Act
        const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
        const result = getOpenCodeCliPath();

        // Assert - falls back to system PATH instead of throwing
        expect(result.command).toBe('opencode');
        expect(result.args).toEqual([]);
      });
    });
  });

  describe('isOpenCodeBundled()', () => {
    describe('Development Mode', () => {
      it('should return true when nvm OpenCode is available', async () => {
        // Arrange
        mockApp.isPackaged = false;
        const nvmVersionsDir = '/Users/testuser/.nvm/versions/node';
        const opencodePath = path.join(nvmVersionsDir, 'v20.10.0', 'bin', 'opencode');

        mockFs.existsSync.mockImplementation((p: string) => {
          if (p === nvmVersionsDir) return true;
          if (p === opencodePath) return true;
          return false;
        });
        mockFs.readdirSync.mockImplementation((p: string) => {
          if (p === nvmVersionsDir) return ['v20.10.0'];
          return [];
        });

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
        const bundledPath = path.join(appPath, 'node_modules', '.bin', 'opencode');

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

      it('should return true when opencode is available on PATH', async () => {
        // Arrange
        mockApp.isPackaged = false;
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockReturnValue('/usr/local/bin/opencode');

        // Act
        const { isOpenCodeBundled } = await import('@main/opencode/electron-options');
        const result = isOpenCodeBundled();

        // Assert
        expect(result).toBe(true);
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
          binary
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
    const getPlatformPackageName = () =>
      process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-ai';

    describe('Packaged Mode', () => {
      it('should read version from package.json in unpacked asar', async () => {
        // Arrange
        mockApp.isPackaged = true;
        const resourcesPath = '/Applications/Accomplish.app/Contents/Resources';
        (process as NodeJS.Process & { resourcesPath: string }).resourcesPath = resourcesPath;

        const packageJsonPath = path.join(
          resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          getPlatformPackageName(),
          'package.json'
        );

        mockFs.existsSync.mockImplementation((p: string) => p === packageJsonPath);
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
        const bundledPath = path.join(appPath, 'node_modules', '.bin', 'opencode');

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
        const bundledPath = path.join(appPath, 'node_modules', '.bin', 'opencode');

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
        const bundledPath = path.join(appPath, 'node_modules', '.bin', 'opencode');

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

  describe('NVM Path Scanning', () => {
    it('should scan multiple nvm versions and return first found', async () => {
      // Arrange
      mockApp.isPackaged = false;
      const nvmVersionsDir = path.join('/Users/testuser', '.nvm', 'versions', 'node');
      const v18Path = path.join(nvmVersionsDir, 'v18.17.0', 'bin', 'opencode');
      const v20Path = path.join(nvmVersionsDir, 'v20.10.0', 'bin', 'opencode');

      mockFs.existsSync.mockImplementation((p: string) => {
        if (p === nvmVersionsDir) return true;
        if (p === v20Path) return true;
        if (p === v18Path) return false;
        return false;
      });
      mockFs.readdirSync.mockImplementation((p: string) => {
        if (p === nvmVersionsDir) return ['v18.17.0', 'v20.10.0'];
        return [];
      });

      // Act
      const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
      const result = getOpenCodeCliPath();

      // Assert
      expect(result.command).toBe(v20Path);
    });

    it('should handle missing nvm directory gracefully', async () => {
      // Arrange
      mockApp.isPackaged = false;
      process.env.HOME = '/Users/testuser';

      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);

      // Act
      const { getOpenCodeCliPath } = await import('@main/opencode/electron-options');
      const result = getOpenCodeCliPath();

      // Assert - should fallback to opencode on PATH
      expect(result.command).toBe('opencode');
    });
  });
});
