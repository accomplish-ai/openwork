/**
 * Unit tests for MCP Server health checker
 *
 * Tests MCP server file existence checks.
 * MCP spawning is done by OpenCode at runtime, not the Electron app.
 *
 * @module __tests__/unit/main/services/app-init/mcp-checker.unit.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

describe('MCPChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkMCPServer', () => {
    it('returns healthy when MCP source file exists', async () => {
      const fs = await import('fs');
      vi.mocked(fs.default.existsSync).mockReturnValue(true);

      vi.resetModules();
      const { checkMCPServer } = await import('@main/services/app-init/checkers/mcp-checker');
      const result = await checkMCPServer('dev-browser-mcp', '/fake/skills/dev-browser-mcp/src/index.ts');

      expect(result.status).toBe('healthy');
      expect(result.error).toBeNull();
    });

    it('returns failed when MCP entry point missing', async () => {
      const fs = await import('fs');
      vi.mocked(fs.default.existsSync).mockReturnValue(false);

      vi.resetModules();
      const { checkMCPServer } = await import('@main/services/app-init/checkers/mcp-checker');
      const result = await checkMCPServer('dev-browser-mcp', '/fake/missing.ts');

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('MCP_ENTRY_NOT_FOUND');
      expect(result.error?.debugInfo.expectedPath).toBe('/fake/missing.ts');
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
          expectedPath: '/fake/missing.ts',
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
