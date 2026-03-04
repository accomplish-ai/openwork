/**
 * Integration tests for System PATH utilities
 *
 * Tests the system-path module which builds extended PATH strings for
 * finding Node.js tools in macOS packaged apps.
 *
 * @module __tests__/integration/main/utils/system-path.integration.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import _path from 'path';

// Store original values
const originalPlatform = process.platform;
const originalEnv = { ...process.env };

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
  let _getExtendedNodePath: typeof import('../../../../src/main/utils/system-path').getExtendedNodePath;
  let findCommandInPath: typeof import('../../../../src/main/utils/system-path').findCommandInPath;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset environment
    process.env = { ...originalEnv };
    process.env.HOME = '/Users/testuser';

    // Re-import module to get fresh state
    const module = await import('../../../../src/main/utils/system-path');
    _getExtendedNodePath = module.getExtendedNodePath;
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
        const module = await import('../../../../src/main/utils/system-path');

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
        const module = await import('../../../../src/main/utils/system-path');

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
          const existingPaths = ['/opt/homebrew/bin', '/usr/local/bin'];
          return existingPaths.includes(p);
        });
        mockFs.readdirSync.mockReturnValue([]);
        mockExecSync.mockReturnValue('PATH="/usr/bin:/bin"; export PATH;');

        // Re-import for platform change
        vi.resetModules();
        const module = await import('../../../../src/main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('/original/path');

        // Assert
        const normalizedResult = result.replace(/\\/g, '/');
        expect(normalizedResult).toContain('/opt/homebrew/bin');
        expect(normalizedResult).toContain('/usr/local/bin');
      });

      it('should include NVM paths when available', async () => {
        // Arrange
        const nvmPath = '/Users/testuser/.nvm/versions/node/v20.10.0/bin';

        mockFs.existsSync.mockImplementation((p: string) => {
          const np = p.replace(/\\/g, '/');
          if (np === '/Users/testuser/.nvm/versions/node') return true;
          if (np === nvmPath) return true;
          return false;
        });
        mockFs.readdirSync.mockImplementation((p: string) => {
          const np = p.replace(/\\/g, '/');
          if (np === '/Users/testuser/.nvm/versions/node') return ['v20.10.0'];
          return [];
        });
        mockExecSync.mockReturnValue('PATH="/usr/bin"; export PATH;');

        // Re-import
        vi.resetModules();
        const module = await import('../../../../src/main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('');

        // Assert
        expect(result.replace(/\\/g, '/')).toContain(nvmPath);
      });

      it('should include fnm paths when available', async () => {
        // Arrange
        const fnmPath = '/Users/testuser/.fnm/node-versions/v20.10.0/installation/bin';

        mockFs.existsSync.mockImplementation((p: string) => {
          const np = p.replace(/\\/g, '/');
          if (np === '/Users/testuser/.fnm/node-versions') return true;
          if (np === fnmPath) return true;
          return false;
        });
        mockFs.readdirSync.mockImplementation((p: string) => {
          const np = p.replace(/\\/g, '/');
          if (np === '/Users/testuser/.fnm/node-versions') return ['v20.10.0'];
          return [];
        });
        mockExecSync.mockReturnValue('PATH="/usr/bin"; export PATH;');

        // Re-import
        vi.resetModules();
        const module = await import('../../../../src/main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('');

        // Assert
        expect(result.replace(/\\/g, '/')).toContain(fnmPath);
      });

      it('should sort NVM versions with newest first', async () => {
        // Arrange
        const nvmDir = '/Users/testuser/.nvm/versions/node';

        mockFs.existsSync.mockImplementation((p: string) => {
          const np = p.replace(/\\/g, '/');
          if (np === nvmDir) return true;
          if (np.includes('.nvm/versions/node/v')) return true;
          return false;
        });
        mockFs.readdirSync.mockImplementation((p: string) => {
          const np = p.replace(/\\/g, '/');
          if (np === nvmDir) return ['v18.17.0', 'v20.10.0', 'v16.20.0'];
          return [];
        });
        mockExecSync.mockReturnValue('PATH="/usr/bin"; export PATH;');

        // Re-import
        vi.resetModules();
        const module = await import('../../../../src/main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('');
        const pathParts = result.split(':');

        const v18Index = pathParts.findIndex((p: string) => p.includes('v18.17.0'));
        const v20Index = pathParts.findIndex((p: string) => p.includes('v20.10.0'));
        const v16Index = pathParts.findIndex((p: string) => p.includes('v16.20.0'));

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
        const module = await import('../../../../src/main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('');

        // Assert
        expect(result.replace(/\\/g, '/')).toContain('/custom/path');
        expect(result.replace(/\\/g, '/')).toContain('/another/path');
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
        const module = await import('../../../../src/main/utils/system-path');

        // Act - should not throw
        const result = module.getExtendedNodePath('/base/path');

        // Assert
        expect(result.replace(/\\/g, '/')).toContain('/base/path');
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
        const module = await import('../../../../src/main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('/usr/local/bin');

        // Assert - /usr/local/bin should appear only once
        const pathParts = result.split(':');
        const localBinCount = pathParts.filter((p: string) => p === '/usr/local/bin').length;
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
        const module = await import('../../../../src/main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath();

        // Assert
        expect(result.replace(/\\/g, '/')).toContain('/default/env/path');
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
        const module = await import('../../../../src/main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('');

        // Assert
        expect(result.replace(/\\/g, '/')).toContain(voltaPath);
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
        const module = await import('../../../../src/main/utils/system-path');

        // Act
        const result = module.getExtendedNodePath('');

        // Assert
        expect(result.replace(/\\/g, '/')).toContain(asdfPath);
      });
    });
  });

  describe('findCommandInPath()', () => {
    it('should find executable command in PATH', () => {
      // Arrange
      const delimiter = process.platform === 'win32' ? ';' : ':';
      const searchPath = ['/usr/bin', '/usr/local/bin'].join(delimiter);
      const expectedPath = '/usr/local/bin/node';

      mockFs.existsSync.mockImplementation((p: string) => {
        const normalized = p.replace(/\\/g, '/');
        return normalized === expectedPath.replace(/\\/g, '/');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true });
      mockFs.accessSync.mockImplementation(() => {}); // No throw = executable

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result?.replace(/\\/g, '/')).toBe(expectedPath);
    });

    it('should return null when command not found', () => {
      // Arrange
      const delimiter = process.platform === 'win32' ? ';' : ':';
      const searchPath = ['/usr/bin', '/usr/local/bin'].join(delimiter);
      mockFs.existsSync.mockReturnValue(false);

      // Act
      const result = findCommandInPath('nonexistent', searchPath);

      // Assert
      expect(result).toBeNull();
    });

    it('should skip non-file entries', () => {
      // Arrange
      const delimiter = process.platform === 'win32' ? ';' : ':';
      const searchPath = ['/usr/bin'].join(delimiter);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isFile: () => false }); // Directory

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result).toBeNull();
    });

    it('should skip non-executable files', () => {
      // Arrange
      const delimiter = process.platform === 'win32' ? ';' : ':';
      const searchPath = ['/usr/bin'].join(delimiter);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isFile: () => true });
      mockFs.accessSync.mockImplementation(() => {
        throw new Error('Not executable');
      });

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      // On Windows findCommandInPath returns true because it skips accessSync, so we only test null return if on non-win32.
      // Or to be robust, we override process.platform to darwin if we're doing the assertion.
      if (process.platform === 'win32') {
        expect(result?.replace(/\\/g, '/')).toBe('/usr/bin/node');
      } else {
        expect(result).toBeNull();
      }
    });

    it('should search directories in order', () => {
      // Arrange
      const delimiter = process.platform === 'win32' ? ';' : ':';
      const searchPath = ['/first/bin', '/second/bin'].join(delimiter);
      const firstPath = '/first/bin/node';
      const secondPath = '/second/bin/node';

      mockFs.existsSync.mockImplementation((p: string) => {
        const normalized = p.replace(/\\/g, '/');
        return (
          normalized === firstPath.replace(/\\/g, '/') ||
          normalized === secondPath.replace(/\\/g, '/')
        );
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true });
      mockFs.accessSync.mockImplementation(() => {});

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result?.replace(/\\/g, '/')).toBe(firstPath);
    });

    it('should handle empty path segments', () => {
      // Arrange
      const delimiter = process.platform === 'win32' ? ';' : ':';
      const searchPath = ['/usr/bin', '', '/usr/local/bin'].join(delimiter);
      const expectedPath = '/usr/local/bin/node';

      mockFs.existsSync.mockImplementation((p: string) => {
        const normalized = p.replace(/\\/g, '/');
        return normalized === expectedPath.replace(/\\/g, '/');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true });
      mockFs.accessSync.mockImplementation(() => {});

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result?.replace(/\\/g, '/')).toBe(expectedPath);
    });

    it('should handle directory access errors gracefully', () => {
      // Arrange
      const delimiter = process.platform === 'win32' ? ';' : ':';
      const searchPath = ['/nonexistent', '/usr/local/bin'].join(delimiter);
      const expectedPath = '/usr/local/bin/node';

      mockFs.existsSync.mockImplementation((p: string) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized.startsWith('/nonexistent')) {
          throw new Error('Directory does not exist');
        }
        return normalized === expectedPath.replace(/\\/g, '/');
      });
      mockFs.statSync.mockReturnValue({ isFile: () => true });
      mockFs.accessSync.mockImplementation(() => {});

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result?.replace(/\\/g, '/')).toBe(expectedPath);
    });

    it('should handle statSync errors gracefully', () => {
      // Arrange
      const delimiter = process.platform === 'win32' ? ';' : ':';
      const searchPath = ['/error/bin', '/usr/local/bin'].join(delimiter);
      const expectedPath = '/usr/local/bin/node';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockImplementation((p: string) => {
        const normalized = p.replace(/\\/g, '/');
        if (normalized.startsWith('/error')) {
          throw new Error('Permission denied');
        }
        return { isFile: () => true };
      });
      mockFs.accessSync.mockImplementation(() => {});

      // Act
      const result = findCommandInPath('node', searchPath);

      // Assert
      expect(result?.replace(/\\/g, '/')).toBe(expectedPath);
    });
  });

  describe('Path Priority Order', () => {
    it('should prioritize version manager paths over system paths', async () => {
      // Arrange
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const nvmPath = '/Users/testuser/.nvm/versions/node/v20.10.0/bin';

      mockFs.existsSync.mockImplementation((p: string) => {
        if (p === '/Users/testuser/.nvm/versions/node') return true;
        if (p === nvmPath) return true;
        if (p === '/opt/homebrew/bin') return true;
        if (p === '/usr/local/bin') return true;
        return false;
      });
      mockFs.readdirSync.mockImplementation((p: string) => {
        if (p === '/Users/testuser/.nvm/versions/node') return ['v20.10.0'];
        return [];
      });
      mockExecSync.mockReturnValue('PATH="/usr/bin"; export PATH;');

      // Re-import
      vi.resetModules();
      const module = await import('../../../../src/main/utils/system-path');

      // Act
      const result = module.getExtendedNodePath('');
      // Assert - NVM should come before Homebrew
      const delimiter = _path.delimiter || (process.platform === 'win32' ? ';' : ':');
      const pathParts = result.split(delimiter).map((p: string) => p.replace(/\\/g, '/'));
      const nvmIndex = pathParts.findIndex((p: string) => p.includes('.nvm'));
      const homebrewIndex = pathParts.findIndex((p: string) => p.includes('homebrew'));

      expect(nvmIndex).toBeLessThan(homebrewIndex);
    });
  });
});
