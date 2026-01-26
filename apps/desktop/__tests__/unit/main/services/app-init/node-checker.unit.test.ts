import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecFileAsync = vi.fn();

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}));

const mockExistsSync = vi.fn();

const mockFs = {
  existsSync: mockExistsSync,
};

vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockExistsSync,
}));

vi.mock('@main/utils/bundled-node', () => ({
  getBundledNodePaths: vi.fn(),
}));

describe('NodeChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkBundledNode', () => {
    it('returns healthy when bundled node runs successfully', async () => {
      const bundledNode = await import('@main/utils/bundled-node');

      vi.mocked(bundledNode.getBundledNodePaths).mockReturnValue({
        nodePath: '/fake/node',
        npmPath: '/fake/npm',
        npxPath: '/fake/npx',
        binDir: '/fake/bin',
        nodeDir: '/fake',
      });

      mockExistsSync.mockReturnValue(true);

      mockExecFileAsync.mockResolvedValue({ stdout: 'v20.18.1\n', stderr: '' });

      const { checkBundledNode } = await import('@main/services/app-init/checkers/node-checker');
      const result = await checkBundledNode();

      expect(result.status).toBe('healthy');
      expect(result.error).toBeNull();
    });

    it('returns healthy in development mode when paths are null', async () => {
      const bundledNode = await import('@main/utils/bundled-node');

      vi.mocked(bundledNode.getBundledNodePaths).mockReturnValue(null);

      const { checkBundledNode } = await import('@main/services/app-init/checkers/node-checker');
      const result = await checkBundledNode();

      expect(result.status).toBe('healthy');
      expect(result.version).toBe(process.version);
    });

    it('returns failed when node binary not found', async () => {
      const bundledNode = await import('@main/utils/bundled-node');

      vi.mocked(bundledNode.getBundledNodePaths).mockReturnValue({
        nodePath: '/fake/node',
        npmPath: '/fake/npm',
        npxPath: '/fake/npx',
        binDir: '/fake/bin',
        nodeDir: '/fake',
      });

      mockExistsSync.mockReturnValue(false);

      const { checkBundledNode } = await import('@main/services/app-init/checkers/node-checker');
      const result = await checkBundledNode();

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('BUNDLED_NODE_NOT_FOUND');
      expect(result.error?.debugInfo.expectedPath).toBe('/fake/node');
    });

    it('returns failed with stderr when node crashes', async () => {
      const bundledNode = await import('@main/utils/bundled-node');

      vi.mocked(bundledNode.getBundledNodePaths).mockReturnValue({
        nodePath: '/fake/node',
        npmPath: '/fake/npm',
        npxPath: '/fake/npx',
        binDir: '/fake/bin',
        nodeDir: '/fake',
      });

      mockExistsSync.mockReturnValue(true);

      const error = new Error('spawn failed') as Error & { code: number; stderr?: string };
      error.code = 127;
      error.stderr = 'node: not found';
      mockExecFileAsync.mockRejectedValue(error);

      const { checkBundledNode } = await import('@main/services/app-init/checkers/node-checker');
      const result = await checkBundledNode();

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('BUNDLED_NODE_FAILED');
      expect(result.error?.debugInfo.stderr).toContain('not found');
      expect(result.error?.debugInfo.exitCode).toBe(127);
    });
  });

  describe('toComponentHealth', () => {
    it('converts healthy result to ComponentHealth', async () => {
      const { toComponentHealth } = await import('@main/services/app-init/checkers/node-checker');

      const result = {
        status: 'healthy' as const,
        version: 'v20.18.1',
        error: null,
      };

      const health = toComponentHealth(result);

      expect(health.name).toBe('bundled-node');
      expect(health.displayName).toBe('Bundled Node.js');
      expect(health.status).toBe('healthy');
      expect(health.error).toBeNull();
      expect(health.retryCount).toBe(0);
    });

    it('converts failed result to ComponentHealth', async () => {
      const { toComponentHealth } = await import('@main/services/app-init/checkers/node-checker');

      const result = {
        status: 'failed' as const,
        version: null,
        error: {
          code: 'BUNDLED_NODE_FAILED',
          component: 'bundled-node',
          message: 'Failed',
          guidance: 'Reinstall',
          debugInfo: {
            platform: 'darwin-arm64',
          },
        },
      };

      const health = toComponentHealth(result);

      expect(health.name).toBe('bundled-node');
      expect(health.status).toBe('failed');
      expect(health.error).toBeTruthy();
    });
  });
});
