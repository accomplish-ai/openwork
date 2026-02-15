/**
 * Integration tests for System PATH utilities
 *
 * Tests the system-path module which builds extended PATH strings for
 * finding Node.js tools in macOS packaged apps.
 *
 * @module __tests__/integration/main/utils/system-path.integration.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import path from 'path';

// Store original values
const originalPlatform = process.platform;
const originalEnv = { ...process.env };
const normalizePath = (p: string) => p.replace(/\\/g, '/');

// Mock fs module
const mockFs = {
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  accessSync: vi.fn(),
  constants: {
    X_OK: 1,
  },
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  readdirSync: mockFs.readdirSync,
  statSync: mockFs.statSync,
  accessSync: mockFs.accessSync,
  constants: mockFs.constants,
}));

// Mock child_process
const mockExecSync = vi.fn();

vi.mock('child_process', () => ({
  execSync: mockExecSync,
  execFile: vi.fn(),
}));

describe('System PATH Utilities', () => {
  let getExtendedNodePath: typeof import('@main/utils/system-path').getExtendedNodePath;
  let findCommandInPath: typeof import('@main/utils/system-path').findCommandInPath;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset environment
    process.env = { ...originalEnv };
    process.env.HOME = '/Users/testuser';
    process.env.PATH = '';
    process.env.Path = '';

    // Re-import module to get fresh state
    const module = await import('@main/utils/system-path');
    getExtendedNodePath = module.getExtendedNodePath;
    findCommandInPath = module.findCommandInPath;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = originalEnv;
  });

  describe('getExtendedNodePath()', () => {
    describe('Non-macOS Platforms', () => {
      it('should return base PATH unchanged on Linux', async () => {
        // Arrange
        Object.defineProperty(process, 'platform', { value: 'linux' });
        const basePath = '/usr/bin:/usr/local/bin';

        // Re-import for platform change
        vi.resetModules();
        const module = await import('@main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath(basePath);

        // Assert
        expect(result).toBe(basePath);
      });

      it('should return base PATH unchanged on Windows', async () => {
        // Arrange
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const basePath = 'C:\\Windows\\System32';

        // Re-import for platform change
        vi.resetModules();
        const module = await import('@main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath(basePath);

        // Assert
        expect(result).toBe(basePath);
      });
    });

    describe('macOS Platform', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should include common Node.js paths', async () => {
        // Arrange
        mockFs.existsSync.mockImplementation((p: string) => {
          const existingPaths = [
            '/opt/homebrew/bin',
            '/usr/local/bin',
          ];
          return existingPaths.includes(p);
        });
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockReturnValue('PATH="/usr/bin:/bin"; export PATH;');

        // Re-import for platform change
        vi.resetModules();
        const module = await import('@main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('/original/path');

        // Assert
        expect(result).toContain('/opt/homebrew/bin');
        expect(result).toContain('/usr/local/bin');
      });

      it('should include NVM paths when available', async () => {
        // Arrange
        const nvmVersionsDir = path.join('/Users/testuser', '.nvm', 'versions', 'node');
        const nvmPath = path.join(nvmVersionsDir, 'v20.10.0', 'bin');

        mockFs.existsSync.mockImplementation((p: string) => {
          if (normalizePath(p) === normalizePath(nvmVersionsDir)) return true;
          if (normalizePath(p) === normalizePath(nvmPath)) return true;
          return false;
        });
        mockFs.readdirSync.mockImplementation((p: string) => {
          if (normalizePath(p) === normalizePath(nvmVersionsDir)) return ['v20.10.0'];
          return [];
        });
        mockExecSync.mockReturnValue('PATH="/usr/bin"; export PATH;');

        // Re-import
        vi.resetModules();
        const module = await import('@main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('');

        // Assert
        expect(result).toContain(nvmPath);
      });

      it('should include fnm paths when available', async () => {
        // Arrange
        const fnmVersionsDir = path.join('/Users/testuser', '.fnm', 'node-versions');
        const fnmPath = path.join(fnmVersionsDir, 'v20.10.0', 'installation', 'bin');

        mockFs.existsSync.mockImplementation((p: string) => {
          if (normalizePath(p) === normalizePath(fnmVersionsDir)) return true;
          if (normalizePath(p) === normalizePath(fnmPath)) return true;
          return false;
        });
        mockFs.readdirSync.mockImplementation((p: string) => {
          if (normalizePath(p) === normalizePath(fnmVersionsDir)) return ['v20.10.0'];
          return [];
        });
        mockExecSync.mockReturnValue('PATH="/usr/bin"; export PATH;');

        // Re-import
        vi.resetModules();
        const module = await import('@main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('');

        // Assert
        expect(result).toContain(fnmPath);
      });

      it('should sort NVM versions with newest first', async () => {
        // Arrange
        const nvmDir = path.join('/Users/testuser', '.nvm', 'versions', 'node');

        mockFs.existsSync.mockImplementation((p: string) => {
          if (normalizePath(p) === normalizePath(nvmDir)) return true;
          if (normalizePath(p).includes('/.nvm/versions/node/v')) return true;
          return false;
        });
        mockFs.readdirSync.mockImplementation((p: string) => {
          if (normalizePath(p) === normalizePath(nvmDir)) return ['v18.17.0', 'v20.10.0', 'v16.20.0'];
          return [];
        });
        mockExecSync.mockReturnValue('PATH="/usr/bin"; export PATH;');

        // Re-import
        vi.resetModules();
        const module = await import('@main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('');
        const pathParts = result.split(':');

        // Assert - v20 should come before v18 which should come before v16
        const v20Index = pathParts.findIndex((p) => p.includes('v20'));
        const v18Index = pathParts.findIndex((p) => p.includes('v18'));
        const v16Index = pathParts.findIndex((p) => p.includes('v16'));

        expect(v20Index).toBeLessThan(v18Index);
        expect(v18Index).toBeLessThan(v16Index);
      });

      it('should include path_helper output', async () => {
        // Arrange
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockReturnValue('PATH="/custom/path:/another/path"; export PATH;');

        // Re-import
        vi.resetModules();
        const module = await import('@main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('');

        // Assert
        expect(result).toContain('/custom/path');
        expect(result).toContain('/another/path');
      });

      it('should handle path_helper failure gracefully', async () => {
        // Arrange
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockImplementation(() => {
          throw new Error('path_helper failed');
        });

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Re-import
        vi.resetModules();
        const module = await import('@main/utils/system-path');

        // Act - should not throw
        const result = module.getExtendedNodePath('/base/path');

        // Assert
        expect(result).toContain('/base/path');
        warnSpy.mockRestore();
      });

      it('should deduplicate paths', async () => {
        // Arrange
        mockFs.existsSync.mockImplementation((p: string) => {
          return p === '/usr/local/bin';
        });
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockReturnValue('PATH="/usr/local/bin:/usr/bin"; export PATH;');

        // Re-import
        vi.resetModules();
        const module = await import('@main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('/usr/local/bin');

        // Assert - /usr/local/bin should appear only once
        const pathParts = result.split(':');
        const localBinCount = pathParts.filter((p) => p === '/usr/local/bin').length;
        expect(localBinCount).toBe(1);
      });

      it('should use process.env.PATH as default base', async () => {
        // Arrange
        process.env.PATH = '/default/env/path';
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockReturnValue('PATH="/usr/bin"; export PATH;');

        // Re-import
        vi.resetModules();
        const module = await import('@main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath();

        // Assert
        expect(result).toContain('/default/env/path');
      });

      it('should include Volta path when available', async () => {
        // Arrange
        const voltaPath = '/Users/testuser/.volta/bin';

        mockFs.existsSync.mockImplementation((p: string) => {
          return p === voltaPath;
        });
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockReturnValue('PATH="/usr/bin"; export PATH;');

        // Re-import
        vi.resetModules();
        const module = await import('@main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('');

        // Assert
        expect(result).toContain(voltaPath);
      });

      it('should include asdf shims path when available', async () => {
        // Arrange
        const asdfPath = '/Users/testuser/.asdf/shims';

        mockFs.existsSync.mockImplementation((p: string) => {
          return p === asdfPath;
        });
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockReturnValue('PATH="/usr/bin"; export PATH;');

        // Re-import
        vi.resetModules();
        const module = await import('@main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('');

        // Assert
        expect(result).toContain(asdfPath);
      });
    });
  });

  describe('findCommandInPath()', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
    });

    it('should find executable command in PATH', () => {
      // Arrange
      const searchPath = '/usr/bin:/usr/local/bin';
      const expectedPath = path.join('/usr/local/bin', 'node');

      mockFs.existsSync.mockImplementation((p: string) => {
        return p === expectedPath;
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true });
      mockFs.accessSync.mockImplementation(() => {}); // No throw = executable

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result).toBe(expectedPath);
    });

    it('should return null when command not found', () => {
      // Arrange
      const searchPath = '/usr/bin:/usr/local/bin';
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = findCommandInPath('nonexistent', searchPath);

      // Assert
      expect(result).toBeNull();
    });

    it('should skip non-file entries', () => {
      // Arrange
      const searchPath = '/usr/bin';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isFile: () => false }); // Directory

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result).toBeNull();
    });

    it('should skip non-executable files', () => {
      // Arrange
      const searchPath = '/usr/bin';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isFile: () => true });
      mockFs.accessSync.mockImplementation(() => {
        throw new Error('Not executable');
      });

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result).toBeNull();
    });

    it('should search directories in order', () => {
      // Arrange
      const searchPath = '/first/bin:/second/bin';
      const firstPath = path.join('/first/bin', 'node');
      const secondPath = path.join('/second/bin', 'node');

      mockFs.existsSync.mockImplementation((p: string) => {
        return p === firstPath || p === secondPath;
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true });
      mockFs.accessSync.mockImplementation(() => {});

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result).toBe(firstPath);
    });

    it('should handle empty path segments', () => {
      // Arrange
      const searchPath = '/usr/bin::/usr/local/bin';
      const expectedPath = path.join('/usr/local/bin', 'node');

      mockFs.existsSync.mockImplementation((p: string) => {
        return p === expectedPath;
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true });
      mockFs.accessSync.mockImplementation(() => {});

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result).toBe(expectedPath);
    });

    it('should handle directory access errors gracefully', () => {
      // Arrange
      const searchPath = '/nonexistent:/usr/local/bin';
      const expectedPath = path.join('/usr/local/bin', 'node');

      mockFs.existsSync.mockImplementation((p: string) => {
        if (normalizePath(p).startsWith('/nonexistent')) {
          throw new Error('Directory does not exist');
        }
        return p === expectedPath;
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true });
      mockFs.accessSync.mockImplementation(() => {});

      // Act - should not throw
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result).toBe(expectedPath);
    });

    it('should handle statSync errors gracefully', () => {
      // Arrange
      const searchPath = '/usr/bin:/usr/local/bin';
      const expectedPath = path.join('/usr/local/bin', 'node');
      const usrBinPath = path.join('/usr/bin', 'node');

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockImplementation((p: string) => {
        if (p === usrBinPath) {
          throw new Error('Stat error');
        }
        return { isFile: () => p === expectedPath };
      });
      mockFs.accessSync.mockImplementation(() => {});

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result).toBe(expectedPath);
    });
  });

  describe('Path Priority Order', () => {
    it('should prioritize version manager paths over system paths', async () => {
      // Arrange
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const nvmVersionsDir = path.join('/Users/testuser', '.nvm', 'versions', 'node');
      const nvmPath = path.join(nvmVersionsDir, 'v20.10.0', 'bin');

      mockFs.existsSync.mockImplementation((p: string) => {
        if (normalizePath(p) === normalizePath(nvmVersionsDir)) return true;
        if (normalizePath(p) === normalizePath(nvmPath)) return true;
        if (p === '/opt/homebrew/bin') return true;
        if (p === '/usr/local/bin') return true;
        return false;
      });
      mockFs.readdirSync.mockImplementation((p: string) => {
        if (normalizePath(p) === normalizePath(nvmVersionsDir)) return ['v20.10.0'];
        return [];
      });
      mockExecSync.mockReturnValue('PATH="/usr/bin"; export PATH;');

      // Re-import
      vi.resetModules();
      const module = await import('@main/utils/system-path');

      // Act
      const result = module.getExtendedNodePath('');
      const pathParts = result.split(':');

      // Assert - NVM should come before Homebrew
      const nvmIndex = pathParts.findIndex((p) => p.includes('.nvm'));
      const homebrewIndex = pathParts.findIndex((p) => p.includes('homebrew'));

      expect(nvmIndex).toBeLessThan(homebrewIndex);
    });
  });
});
