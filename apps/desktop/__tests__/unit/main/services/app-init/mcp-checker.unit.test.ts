/**
 * Unit tests for MCP Server health checker
 *
 * Tests MCP server startup health checks with comprehensive error reporting.
 *
 * @module __tests__/unit/main/services/app-init/mcp-checker.unit.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron app
const mockApp = {
  isPackaged: true, // Default to packaged mode for testing spawn logic
};

vi.mock('electron', () => ({
  app: mockApp,
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

vi.mock('@main/utils/bundled-node', () => ({
  getNodePath: vi.fn(),
  buildNodeEnv: vi.fn(),
}));

describe('MCPChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApp.isPackaged = true; // Default to packaged mode for spawn tests
  });

  describe('checkMCPServer', () => {
    it('returns healthy when MCP server starts and stays alive', async () => {
      const fs = await import('fs');
      const cp = await import('child_process');
      const bundledNode = await import('@main/utils/bundled-node');

      vi.mocked(fs.default.existsSync).mockReturnValue(true);
      vi.mocked(bundledNode.getNodePath).mockReturnValue('/fake/node');
      vi.mocked(bundledNode.buildNodeEnv).mockReturnValue({ PATH: '/fake/bin' });

      const mockProcess = {
        pid: 1234,
        kill: vi.fn(),
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(cp.spawn).mockReturnValue(mockProcess as any);

      vi.resetModules();
      const { checkMCPServer } = await import('@main/services/app-init/checkers/mcp-checker');

      // Start check
      const resultPromise = checkMCPServer('dev-browser-mcp', '/fake/skills/dev-browser-mcp/dist/index.mjs');

      // Simulate process staying alive for 2 seconds
      await new Promise(r => setTimeout(r, 100));

      // Get result
      const result = await resultPromise;

      expect(result.status).toBe('healthy');
      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('returns failed when MCP entry point missing', async () => {
      const fs = await import('fs');

      vi.mocked(fs.default.existsSync).mockReturnValue(false);

      vi.resetModules();
      const { checkMCPServer } = await import('@main/services/app-init/checkers/mcp-checker');
      const result = await checkMCPServer('dev-browser-mcp', '/fake/missing.mjs');

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('MCP_ENTRY_NOT_FOUND');
      expect(result.error?.debugInfo.expectedPath).toBe('/fake/missing.mjs');
    });

    it('returns healthy in dev mode when file exists (skips spawn)', async () => {
      const fs = await import('fs');
      const cp = await import('child_process');

      mockApp.isPackaged = false; // Development mode
      vi.mocked(fs.default.existsSync).mockReturnValue(true);

      vi.resetModules();
      const { checkMCPServer } = await import('@main/services/app-init/checkers/mcp-checker');
      const result = await checkMCPServer('dev-browser-mcp', '/fake/src/index.ts');

      expect(result.status).toBe('healthy');
      expect(result.error).toBeNull();
      // spawn should NOT be called in dev mode
      expect(cp.spawn).not.toHaveBeenCalled();
    });

    it('returns failed with stderr when MCP crashes on startup', async () => {
      const fs = await import('fs');
      const cp = await import('child_process');
      const bundledNode = await import('@main/utils/bundled-node');

      vi.mocked(fs.default.existsSync).mockReturnValue(true);
      vi.mocked(bundledNode.getNodePath).mockReturnValue('/fake/node');
      vi.mocked(bundledNode.buildNodeEnv).mockReturnValue({ PATH: '/fake/bin' });

      let exitCallback: (code: number) => void;
      let stderrCallback: (data: Buffer) => void;

      const mockProcess = {
        pid: 1234,
        kill: vi.fn(),
        on: vi.fn((event: string, cb: any) => {
          if (event === 'exit') exitCallback = cb;
        }),
        stdout: { on: vi.fn() },
        stderr: {
          on: vi.fn((event: string, cb: any) => {
            if (event === 'data') stderrCallback = cb;
          }),
        },
      };
      vi.mocked(cp.spawn).mockReturnValue(mockProcess as any);

      vi.resetModules();
      const { checkMCPServer } = await import('@main/services/app-init/checkers/mcp-checker');

      const resultPromise = checkMCPServer('dev-browser-mcp', '/fake/index.mjs');

      // Simulate crash
      await new Promise(r => setTimeout(r, 50));
      stderrCallback!(Buffer.from('Error: Cannot find module'));
      exitCallback!(1);

      const result = await resultPromise;

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('MCP_SPAWN_FAILED');
      expect(result.error?.debugInfo.stderr).toContain('Cannot find module');
      expect(result.error?.debugInfo.exitCode).toBe(1);
    });
  });

  describe('toComponentHealth', () => {
    it('converts healthy result to ComponentHealth', async () => {
      vi.resetModules();
      const { toComponentHealth } = await import('@main/services/app-init/checkers/mcp-checker');

      const result = {
        status: 'healthy' as const,
        error: null,
      };

      const health = toComponentHealth('dev-browser-mcp', 'Browser MCP', result);

      expect(health.name).toBe('mcp:dev-browser-mcp');
      expect(health.displayName).toBe('Browser MCP');
      expect(health.status).toBe('healthy');
      expect(health.error).toBeNull();
      expect(health.retryCount).toBe(0);
      expect(health.lastCheck).toBeGreaterThan(0);
    });

    it('converts failed result to ComponentHealth with error', async () => {
      vi.resetModules();
      const { toComponentHealth } = await import('@main/services/app-init/checkers/mcp-checker');

      const error = {
        code: 'MCP_ENTRY_NOT_FOUND',
        component: 'mcp:dev-browser-mcp',
        message: 'MCP server entry point not found',
        guidance: 'Reinstall the app',
        debugInfo: {
          platform: 'darwin-x64',
          expectedPath: '/fake/missing.mjs',
          actualPath: null,
        },
      };

      const result = {
        status: 'failed' as const,
        error,
      };

      const health = toComponentHealth('dev-browser-mcp', 'Browser MCP', result);

      expect(health.name).toBe('mcp:dev-browser-mcp');
      expect(health.status).toBe('failed');
      expect(health.error).toEqual(error);
    });
  });
});
