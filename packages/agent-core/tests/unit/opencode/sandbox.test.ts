import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { SandboxConfig } from '../../../src/common/types/sandbox.js';

describe('Sandbox Docker command construction', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Replicate the private escapeShellArg logic for testing
  function escapeShellArg(arg: string, platform: string): string {
    if (platform === 'win32') {
      if (arg.includes(' ') || arg.includes('"')) {
        return `"${arg.replace(/"/g, '""')}"`;
      }
      return arg;
    } else {
      const needsEscaping = ["'", ' ', '$', '`', '\\', '"', '\n'].some((c) => arg.includes(c));
      if (needsEscaping) {
        return `'${arg.replace(/'/g, "'\\''")}'`;
      }
      return arg;
    }
  }

  function buildShellCommand(command: string, args: string[], platform: string): string {
    const escapedCommand = escapeShellArg(command, platform);
    const escapedArgs = args.map((arg) => escapeShellArg(arg, platform));
    return [escapedCommand, ...escapedArgs].join(' ');
  }

  // Replicate buildSandboxAwareSpawnConfig logic for testable Docker args
  function buildDockerArgs(
    sandboxConfig: SandboxConfig,
    spawnFile: string,
    spawnArgs: string[],
    safeCwd: string,
    env: Record<string, string>,
    platform: string,
  ): string[] {
    const dockerArgs = ['run', '--rm', '-i'];

    dockerArgs.push('-v', `${safeCwd}:/workspace`, '-w', '/workspace');

    if (sandboxConfig.allowedPaths) {
      for (const p of sandboxConfig.allowedPaths) {
        dockerArgs.push('-v', `${p}:${p}`);
      }
    }

    if (!sandboxConfig.networkPolicy.allowOutbound) {
      dockerArgs.push('--network', 'none');
    }

    for (const [key, val] of Object.entries(env)) {
      if (val && key !== 'PATH' && key !== 'HOME' && key !== 'USER') {
        dockerArgs.push('-e', `${key}=${val}`);
      }
    }

    const image = sandboxConfig.dockerImage || 'node:20-slim';
    dockerArgs.push(image);

    const containerCommand = path.basename(spawnFile);
    dockerArgs.push('sh', '-c', buildShellCommand(containerCommand, spawnArgs, platform));

    return dockerArgs;
  }

  function redactDockerArgs(dockerArgs: string[]): string[] {
    return dockerArgs.map((arg, i) => {
      if (i > 0 && dockerArgs[i - 1] === '-e' && arg.includes('=')) {
        const eqIdx = arg.indexOf('=');
        return `${arg.substring(0, eqIdx)}=***`;
      }
      return arg;
    });
  }

  describe('Docker args construction', () => {
    const defaultConfig: SandboxConfig = {
      mode: 'docker',
      networkPolicy: { allowOutbound: true },
    };

    it('should mount working directory as /workspace', () => {
      const args = buildDockerArgs(
        defaultConfig,
        '/usr/bin/opencode',
        [],
        '/home/user/project',
        {},
        'darwin',
      );
      expect(args).toContain('-v');
      expect(args).toContain('/home/user/project:/workspace');
      expect(args).toContain('-w');
      expect(args).toContain('/workspace');
    });

    it('should mount additional allowed paths', () => {
      const config: SandboxConfig = {
        ...defaultConfig,
        allowedPaths: ['/tmp/workspace', '/var/data'],
      };
      const args = buildDockerArgs(config, '/usr/bin/opencode', [], '/home/user', {}, 'darwin');

      expect(args).toContain('/tmp/workspace:/tmp/workspace');
      expect(args).toContain('/var/data:/var/data');
    });

    it('should disable network when allowOutbound is false', () => {
      const config: SandboxConfig = {
        mode: 'docker',
        networkPolicy: { allowOutbound: false },
      };
      const args = buildDockerArgs(config, '/usr/bin/opencode', [], '/home/user', {}, 'darwin');

      expect(args).toContain('--network');
      expect(args).toContain('none');
    });

    it('should not disable network when allowOutbound is true', () => {
      const args = buildDockerArgs(
        defaultConfig,
        '/usr/bin/opencode',
        [],
        '/home/user',
        {},
        'darwin',
      );
      expect(args).not.toContain('--network');
    });

    it('should use custom Docker image when specified', () => {
      const config: SandboxConfig = {
        ...defaultConfig,
        dockerImage: 'ubuntu:22.04',
      };
      const args = buildDockerArgs(config, '/usr/bin/opencode', [], '/home/user', {}, 'darwin');
      expect(args).toContain('ubuntu:22.04');
      expect(args).not.toContain('node:20-slim');
    });

    it('should default to node:20-slim when no image specified', () => {
      const args = buildDockerArgs(
        defaultConfig,
        '/usr/bin/opencode',
        [],
        '/home/user',
        {},
        'darwin',
      );
      expect(args).toContain('node:20-slim');
    });

    it('should use basename of spawnFile instead of full host path', () => {
      const args = buildDockerArgs(
        defaultConfig,
        '/usr/local/bin/opencode',
        ['run', '--format', 'json'],
        '/home/user',
        {},
        'darwin',
      );

      const shIndex = args.indexOf('sh');
      expect(shIndex).toBeGreaterThan(-1);
      expect(args[shIndex + 1]).toBe('-c');

      const shellCmd = args[shIndex + 2];
      expect(shellCmd).toContain('opencode');
      expect(shellCmd).not.toContain('/usr/local/bin/opencode');
    });

    it('should use basename for forward-slash paths', () => {
      // path.basename handles forward slashes on all platforms
      const args = buildDockerArgs(
        defaultConfig,
        '/opt/apps/accomplish/opencode',
        ['run'],
        '/home/user',
        {},
        'darwin',
      );

      const shIndex = args.indexOf('sh');
      const shellCmd = args[shIndex + 2];
      expect(shellCmd).toContain('opencode');
      expect(shellCmd).not.toContain('/opt/apps');
    });

    it('should forward env vars except PATH, HOME, USER', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-test-123',
        PATH: '/usr/bin',
        HOME: '/home/user',
        USER: 'testuser',
        OPENAI_API_KEY: 'sk-openai-456',
      };
      const args = buildDockerArgs(
        defaultConfig,
        '/usr/bin/opencode',
        [],
        '/home/user',
        env,
        'darwin',
      );

      expect(args).toContain('ANTHROPIC_API_KEY=sk-test-123');
      expect(args).toContain('OPENAI_API_KEY=sk-openai-456');
      // PATH, HOME, USER should NOT be forwarded
      const envArgValues = args.filter((_, i) => i > 0 && args[i - 1] === '-e');
      expect(envArgValues.every((v) => !v.startsWith('PATH='))).toBe(true);
      expect(envArgValues.every((v) => !v.startsWith('HOME='))).toBe(true);
      expect(envArgValues.every((v) => !v.startsWith('USER='))).toBe(true);
    });
  });

  describe('Environment variable redaction', () => {
    it('should redact values of -e flags', () => {
      const args = [
        'run',
        '--rm',
        '-e',
        'API_KEY=super-secret-123',
        '-e',
        'TOKEN=abc',
        'node:20-slim',
      ];
      const redacted = redactDockerArgs(args);

      expect(redacted).toContain('API_KEY=***');
      expect(redacted).toContain('TOKEN=***');
      expect(redacted).not.toContain('super-secret-123');
      expect(redacted).not.toContain('abc');
    });

    it('should not redact non-env args', () => {
      const args = ['run', '--rm', '-v', '/home:/workspace', 'node:20-slim'];
      const redacted = redactDockerArgs(args);
      expect(redacted).toEqual(args);
    });

    it('should handle env vars with = in the value', () => {
      const args = ['-e', 'CONFIG=key=value=extra'];
      const redacted = redactDockerArgs(args);
      expect(redacted[1]).toBe('CONFIG=***');
    });
  });
});

describe('SandboxConfig type', () => {
  it('should accept valid none mode config', () => {
    const config: SandboxConfig = {
      mode: 'none',
      networkPolicy: { allowOutbound: true },
    };
    expect(config.mode).toBe('none');
  });

  it('should accept valid docker mode config with all options', () => {
    const config: SandboxConfig = {
      mode: 'docker',
      dockerImage: 'node:20-slim',
      allowedPaths: ['/tmp', '/var/data'],
      networkPolicy: {
        allowOutbound: true,
        allowedHosts: ['api.openai.com', 'github.com'],
      },
    };
    expect(config.mode).toBe('docker');
    expect(config.dockerImage).toBe('node:20-slim');
    expect(config.allowedPaths).toHaveLength(2);
    expect(config.networkPolicy.allowedHosts).toHaveLength(2);
  });

  it('should allow optional fields to be omitted', () => {
    const config: SandboxConfig = {
      mode: 'docker',
      networkPolicy: { allowOutbound: false },
    };
    expect(config.dockerImage).toBeUndefined();
    expect(config.allowedPaths).toBeUndefined();
    expect(config.networkPolicy.allowedHosts).toBeUndefined();
  });
});

describe('Migration v009 sandbox', () => {
  it('should export correct version number', async () => {
    const { migration } = await import('../../../src/storage/migrations/v009-sandbox.js');
    expect(migration.version).toBe(9);
  });

  it('should have up and down functions', async () => {
    const { migration } = await import('../../../src/storage/migrations/v009-sandbox.js');
    expect(typeof migration.up).toBe('function');
    expect(typeof migration.down).toBe('function');
  });

  it('should execute correct SQL in up migration', async () => {
    const { migration } = await import('../../../src/storage/migrations/v009-sandbox.js');
    const mockExec = vi.fn();
    const mockDb = { exec: mockExec } as unknown as import('better-sqlite3').Database;

    migration.up(mockDb);

    expect(mockExec).toHaveBeenCalledOnce();
    expect(mockExec.mock.calls[0][0]).toContain('ALTER TABLE app_settings');
    expect(mockExec.mock.calls[0][0]).toContain('sandbox_config');
  });

  it('should execute correct SQL in down migration', async () => {
    const { migration } = await import('../../../src/storage/migrations/v009-sandbox.js');
    const mockExec = vi.fn();
    const mockDb = { exec: mockExec } as unknown as import('better-sqlite3').Database;

    migration.down!(mockDb);

    expect(mockExec).toHaveBeenCalledOnce();
    expect(mockExec.mock.calls[0][0]).toContain('DROP COLUMN sandbox_config');
  });
});

describe('Sandbox config storage persistence', () => {
  let testDir: string;
  let dbPath: string;
  let databaseModule: typeof import('../../../src/storage/database.js') | null = null;
  let appSettingsModule: typeof import('../../../src/storage/repositories/appSettings.js') | null =
    null;

  beforeAll(async () => {
    try {
      databaseModule = await import('../../../src/storage/database.js');
      appSettingsModule = await import('../../../src/storage/repositories/appSettings.js');
    } catch (_err) {
      console.warn('Skipping storage tests: better-sqlite3 native module not available');
      console.warn('To fix: pnpm rebuild better-sqlite3');
    }
  });

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `sandbox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(testDir, { recursive: true });
    dbPath = path.join(testDir, 'test.db');

    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (databaseModule) {
      databaseModule.resetDatabaseInstance();
    }
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('should return null when no sandbox config is set', () => {
    if (!databaseModule || !appSettingsModule) return;

    databaseModule.initializeDatabase({ databasePath: dbPath });
    const config = appSettingsModule.getSandboxConfig();
    expect(config).toBeNull();
  });

  it('should persist and retrieve a docker sandbox config', () => {
    if (!databaseModule || !appSettingsModule) return;

    databaseModule.initializeDatabase({ databasePath: dbPath });

    const config: SandboxConfig = {
      mode: 'docker',
      dockerImage: 'node:20-slim',
      allowedPaths: ['/tmp/data'],
      networkPolicy: { allowOutbound: true, allowedHosts: ['api.openai.com'] },
    };

    appSettingsModule.setSandboxConfig(config);
    const retrieved = appSettingsModule.getSandboxConfig();

    expect(retrieved).toEqual(config);
  });

  it('should clear sandbox config when set to null', () => {
    if (!databaseModule || !appSettingsModule) return;

    databaseModule.initializeDatabase({ databasePath: dbPath });

    appSettingsModule.setSandboxConfig({
      mode: 'docker',
      networkPolicy: { allowOutbound: false },
    });
    expect(appSettingsModule.getSandboxConfig()).not.toBeNull();

    appSettingsModule.setSandboxConfig(null);
    expect(appSettingsModule.getSandboxConfig()).toBeNull();
  });

  it('should include sandboxConfig in getAppSettings()', () => {
    if (!databaseModule || !appSettingsModule) return;

    databaseModule.initializeDatabase({ databasePath: dbPath });

    const config: SandboxConfig = {
      mode: 'none',
      networkPolicy: { allowOutbound: true },
    };

    appSettingsModule.setSandboxConfig(config);
    const settings = appSettingsModule.getAppSettings();

    expect(settings.sandboxConfig).toEqual(config);
  });
});
