import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock electron
const mockApp = {
  isPackaged: false,
  getAppPath: vi.fn(() => '/mock/app/path'),
};

vi.mock('electron', () => ({
  app: mockApp,
}));

// Mock child_process
const mockChildProcess = new EventEmitter();
Object.assign(mockChildProcess, { kill: vi.fn() });

const mockSpawn = vi.fn(() => mockChildProcess);

vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

// Mock agent-core
const mockResolveCliPath = vi.fn();

vi.mock('@accomplish_ai/agent-core', () => ({
  resolveCliPath: mockResolveCliPath,
}));

// We need to reset module state between tests since warmUpPromise is module-level
let warmUpCliExecutable: typeof import('../../../../src/main/opencode/warm-up').warmUpCliExecutable;
let getWarmUpPromise: typeof import('../../../../src/main/opencode/warm-up').getWarmUpPromise;

describe('warm-up', () => {
  const originalPlatform = process.platform;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();

    // Re-import to reset module-level state
    const mod = await import('../../../../src/main/opencode/warm-up');
    warmUpCliExecutable = mod.warmUpCliExecutable;
    getWarmUpPromise = mod.getWarmUpPromise;

    // Reset mock child process listeners
    mockChildProcess.removeAllListeners();
    Object.assign(mockChildProcess, { kill: vi.fn() });
    mockSpawn.mockReturnValue(mockChildProcess);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('resolves immediately on non-win32 platforms', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    warmUpCliExecutable();
    await expect(getWarmUpPromise()).resolves.toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('resolves immediately when CLI is not found', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockResolveCliPath.mockReturnValue(null);

    warmUpCliExecutable();
    await expect(getWarmUpPromise()).resolves.toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('spawns CLI on win32 and resolves on exit', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockResolveCliPath.mockReturnValue({
      cliPath: '/mock/opencode.exe',
      cliDir: '/mock',
      source: 'bundled',
    });

    warmUpCliExecutable();

    expect(mockSpawn).toHaveBeenCalledWith('/mock/opencode.exe', ['--version'], {
      stdio: 'ignore',
      windowsHide: true,
    });

    mockChildProcess.emit('exit');
    await expect(getWarmUpPromise()).resolves.toBeUndefined();
  });

  it('resolves without throwing when spawn emits error', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mockResolveCliPath.mockReturnValue({
      cliPath: '/mock/opencode.exe',
      cliDir: '/mock',
      source: 'bundled',
    });

    warmUpCliExecutable();

    mockChildProcess.emit('error', new Error('ENOENT'));
    await expect(getWarmUpPromise()).resolves.toBeUndefined();
  });

  it('returns resolved promise when getWarmUpPromise called before warmUp', async () => {
    await expect(getWarmUpPromise()).resolves.toBeUndefined();
  });
});
