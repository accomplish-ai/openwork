import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  resolveCliPath,
  isCliAvailable,
  getCliVersion,
} from '../../../src/opencode/cli-resolver.js';

describe('CLI Resolver', () => {
  let testDir: string;

  function createLocalCli(appRoot: string): { cliPath: string; cliDir: string; binName: string } {
    if (process.platform === 'win32') {
      const binName = 'opencode.exe';
      const cliDir = path.join(appRoot, 'node_modules', 'opencode-windows-x64', 'bin');
      const cliPath = path.join(cliDir, binName);
      fs.mkdirSync(cliDir, { recursive: true });
      fs.writeFileSync(cliPath, 'binary');
      return { cliPath, cliDir, binName };
    }

    const binName = 'opencode';
    const cliDir = path.join(appRoot, 'node_modules', '.bin');
    const cliPath = path.join(cliDir, binName);
    fs.mkdirSync(cliDir, { recursive: true });
    fs.writeFileSync(cliPath, '#!/bin/bash\necho "opencode"');
    return { cliPath, cliDir, binName };
  }

  function createWindowsNestedLocalCli(
    appRoot: string,
  ): { cliPath: string; cliDir: string } | null {
    if (process.platform !== 'win32') {
      return null;
    }

    const cliDir = path.join(
      appRoot,
      'node_modules',
      'opencode-ai',
      'node_modules',
      'opencode-windows-x64',
      'bin',
    );
    const cliPath = path.join(cliDir, 'opencode.exe');
    fs.mkdirSync(cliDir, { recursive: true });
    fs.writeFileSync(cliPath, 'binary');
    return { cliPath, cliDir };
  }

  function createWindowsPackageCli(
    appRoot: string,
    packageName: string,
  ): { cliPath: string; cliDir: string } {
    const cliDir = path.join(appRoot, 'node_modules', packageName, 'bin');
    const cliPath = path.join(cliDir, 'opencode.exe');
    fs.mkdirSync(cliDir, { recursive: true });
    fs.writeFileSync(cliPath, 'binary');
    return { cliPath, cliDir };
  }

  beforeEach(() => {
    // Create a unique temporary directory for each test
    testDir = path.join(
      os.tmpdir(),
      `cli-resolver-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(testDir, { recursive: true });

    // Suppress console.log during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('resolveCliPath', () => {
    describe('packaged app', () => {
      it('should find CLI in bundled resources', () => {
        // Create fake bundled CLI structure
        const binName = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
        const packageName = process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-ai';
        const cliDir = path.join(
          testDir,
          'resources',
          'app.asar.unpacked',
          'node_modules',
          packageName,
          'bin',
        );
        fs.mkdirSync(cliDir, { recursive: true });
        fs.writeFileSync(path.join(cliDir, binName), '#!/bin/bash\necho "opencode"');

        const result = resolveCliPath({
          isPackaged: true,
          resourcesPath: path.join(testDir, 'resources'),
        });

        expect(result).not.toBeNull();
        expect(result?.source).toBe('bundled');
        expect(result?.cliPath).toContain(binName);
      });

      it('should return null when bundled CLI not found in packaged app', () => {
        const result = resolveCliPath({
          isPackaged: true,
          resourcesPath: path.join(testDir, 'nonexistent'),
        });

        expect(result).toBeNull();
      });
    });

    describe('development mode', () => {
      it('should find CLI in node_modules/.bin', () => {
        const appRoot = path.join(testDir, 'app');
        const { binName } = createLocalCli(appRoot);

        const result = resolveCliPath({
          isPackaged: false,
          appPath: appRoot,
        });

        expect(result).not.toBeNull();
        expect(result?.source).toBe('local');
        expect(result?.cliPath).toContain(binName);
      });

      it('should return null when not found in node_modules', () => {
        const result = resolveCliPath({
          isPackaged: false,
          appPath: path.join(testDir, 'app-without-cli'),
        });

        expect(result).toBeNull();
      });

      it('should find Windows CLI in nested opencode-ai optional dependency path', () => {
        if (process.platform !== 'win32') {
          return;
        }

        const appRoot = path.join(testDir, 'app');
        const nestedCli = createWindowsNestedLocalCli(appRoot);

        const result = resolveCliPath({
          isPackaged: false,
          appPath: appRoot,
        });

        expect(nestedCli).not.toBeNull();
        expect(result).not.toBeNull();
        expect(result?.source).toBe('local');
        expect(result?.cliPath).toBe(nestedCli?.cliPath);
      });
    });

    describe('multiple locations search', () => {
      it('should check multiple locations and return first found', () => {
        const appRoot = path.join(testDir, 'app');
        const { cliDir } = createLocalCli(appRoot);

        const result = resolveCliPath({
          isPackaged: false,
          appPath: appRoot,
        });

        expect(result).not.toBeNull();
        expect(result?.cliDir).toBe(cliDir);
      });
    });
  });

  describe('isCliAvailable', () => {
    it('should return true when CLI is found', () => {
      const appRoot = path.join(testDir, 'app');
      createLocalCli(appRoot);

      const result = isCliAvailable({
        isPackaged: false,
        appPath: appRoot,
      });

      expect(result).toBe(true);
    });

    it('should return false when CLI is not found (in isolated test)', () => {
      // Use a path that definitely doesn't exist and no global fallback
      const result = isCliAvailable({
        isPackaged: true, // Packaged mode only checks bundled
        resourcesPath: path.join(testDir, 'nonexistent-resources'),
      });

      expect(result).toBe(false);
    });
  });

  describe('getCliVersion', () => {
    it('should return version from package.json', async () => {
      // Create fake package structure
      const packageName = process.platform === 'win32' ? 'opencode-windows-x64' : 'opencode-ai';
      const packageDir = path.join(testDir, 'node_modules', packageName);
      const binDir = path.join(testDir, 'node_modules', '.bin');

      fs.mkdirSync(packageDir, { recursive: true });
      fs.mkdirSync(binDir, { recursive: true });

      // Create package.json
      fs.writeFileSync(
        path.join(packageDir, 'package.json'),
        JSON.stringify({ name: packageName, version: '1.2.3' }),
      );

      // Create dummy binary
      const binName = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
      const cliPath =
        process.platform === 'win32'
          ? path.join(packageDir, 'bin', binName)
          : path.join(binDir, binName);
      fs.mkdirSync(path.dirname(cliPath), { recursive: true });
      fs.writeFileSync(cliPath, '#!/bin/bash\necho "1.2.3"');
      const version = await getCliVersion(cliPath);

      expect(version).toBe('1.2.3');
    });

    it('should return null for non-existent CLI', async () => {
      const version = await getCliVersion('/nonexistent/path/opencode');
      expect(version).toBeNull();
    });
  });

  describe('platform-specific behavior', () => {
    it('should use correct binary name for current platform', () => {
      const appRoot = path.join(testDir, 'app');
      const { binName } = createLocalCli(appRoot);

      const result = resolveCliPath({
        isPackaged: false,
        appPath: appRoot,
      });

      expect(result).not.toBeNull();
      expect(result?.cliPath).toContain(binName);
    });
  });

  describe('windows arm64 compatibility', () => {
    it('should resolve to local x64 OpenCode package on Windows ARM64 in development', () => {
      const appRoot = path.join(testDir, 'app');
      const x64Cli = createWindowsPackageCli(appRoot, 'opencode-windows-x64');

      const result = resolveCliPath({
        isPackaged: false,
        appPath: appRoot,
        platform: 'win32',
        arch: 'arm64',
      });

      expect(result).not.toBeNull();
      expect(result?.source).toBe('local');
      expect(result?.cliPath).toBe(x64Cli.cliPath);
    });

    it('should resolve to bundled x64 OpenCode package on Windows ARM64 when packaged', () => {
      const resourcesPath = path.join(testDir, 'resources');
      const cliDir = path.join(
        resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        'opencode-windows-x64',
        'bin',
      );
      const cliPath = path.join(cliDir, 'opencode.exe');
      fs.mkdirSync(cliDir, { recursive: true });
      fs.writeFileSync(cliPath, 'binary');

      const result = resolveCliPath({
        isPackaged: true,
        resourcesPath,
        platform: 'win32',
        arch: 'arm64',
      });

      expect(result).not.toBeNull();
      expect(result?.source).toBe('bundled');
      expect(result?.cliPath).toBe(cliPath);
    });

    it('should log actionable diagnostics when Windows ARM64 local binaries are missing', () => {
      const appRoot = path.join(testDir, 'app-without-cli');
      const warnSpy = vi.spyOn(console, 'warn');

      const result = resolveCliPath({
        isPackaged: false,
        appPath: appRoot,
        platform: 'win32',
        arch: 'arm64',
      });

      expect(result).toBeNull();
      const warningText = warnSpy.mock.calls.flat().join(' ');
      expect(warningText).toContain('Windows ARM64 detected');
      expect(warningText).toContain('Run "pnpm install"');
    });
  });
});
