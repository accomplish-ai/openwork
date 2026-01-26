/**
 * MCP Server Health Checker
 *
 * Verifies MCP server source files exist in the skills directory.
 * Used during app initialization to detect incomplete installations.
 *
 * Note: MCP servers are spawned by OpenCode at runtime via `npx tsx`,
 * not directly by the Electron app. This checker only verifies the
 * source files are present.
 *
 * @module services/app-init/checkers/mcp-checker
 */

import fs from 'fs';
import type { ComponentHealth, InitError } from '@accomplish/shared';

export interface MCPCheckResult {
  status: 'healthy' | 'failed';
  error: InitError | null;
}

/**
 * Check if an MCP server's source files exist.
 *
 * MCP servers are spawned by OpenCode via `npx tsx src/index.ts`,
 * so we only verify the source file exists. The actual spawning
 * and health of running MCPs is managed by OpenCode at runtime.
 *
 * @param mcpName - Internal name of the MCP server (e.g., 'dev-browser-mcp')
 * @param entryPath - Absolute path to the MCP server entry point
 * @returns Health check result with detailed error information if failed
 */
export async function checkMCPServer(
  mcpName: string,
  entryPath: string
): Promise<MCPCheckResult> {
  // Check entry point exists
  if (!fs.existsSync(entryPath)) {
    return {
      status: 'failed',
      error: {
        code: 'MCP_ENTRY_NOT_FOUND',
        component: `mcp:${mcpName}`,
        message: `MCP server entry point not found: ${mcpName}`,
        guidance: 'The app installation may be incomplete. Try reinstalling the app.',
        debugInfo: {
          platform: `${process.platform}-${process.arch}`,
          expectedPath: entryPath,
          actualPath: null,
        },
      },
    };
  }

  // File exists - consider healthy
  // Actual MCP spawning is done by OpenCode at runtime
  return { status: 'healthy', error: null };
}

/**
 * Convert MCP check result to ComponentHealth format.
 *
 * @param mcpName - Internal name of the MCP server
 * @param displayName - Human-readable name for UI display
 * @param result - Result from checkMCPServer
 * @returns ComponentHealth object for system health tracking
 */
export function toComponentHealth(
  mcpName: string,
  displayName: string,
  result: MCPCheckResult
): ComponentHealth {
  return {
    name: `mcp:${mcpName}`,
    displayName,
    status: result.status,
    lastCheck: Date.now(),
    error: result.error,
    retryCount: 0,
  };
}
