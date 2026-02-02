/**
 * Core interfaces for @accomplish/core package
 */

import type {
  PermissionRequest,
  PermissionResponse,
  Task,
  TaskMessage,
  TaskProgress,
  TaskResult,
} from '@accomplish/shared';

/**
 * Platform-specific configuration provided by the host application
 */
export interface PlatformConfig {
  /** Path to user data directory (for databases, configs) */
  userDataPath: string;
  /** Path to temporary directory */
  tempPath: string;
  /** Whether the app is packaged (production) or running in dev */
  isPackaged: boolean;
  /** Path to app resources (for bundled assets) */
  resourcesPath?: string;
  /** Path to the app installation */
  appPath?: string;
  /** Operating system platform */
  platform: NodeJS.Platform;
  /** CPU architecture */
  arch: string;
}

/**
 * Handler for permission requests from OpenCode CLI
 */
export interface PermissionHandler {
  /**
   * Request permission from the user for a tool or operation
   * @param request The permission request details
   * @returns Promise resolving to the user's response
   */
  requestPermission(request: PermissionRequest): Promise<PermissionResponse>;
}

/**
 * Event handlers for task execution events
 */
export interface TaskEventHandler {
  /** Called when a new message is received */
  onMessage(taskId: string, message: TaskMessage): void;
  /** Called when task progress updates */
  onProgress(taskId: string, progress: TaskProgress): void;
  /** Called when a tool is being used */
  onToolUse(taskId: string, toolName: string, toolInput: unknown): void;
  /** Called when task completes successfully */
  onComplete(taskId: string, result: TaskResult): void;
  /** Called when task encounters an error */
  onError(taskId: string, error: Error): void;
  /** Called when task is cancelled */
  onCancelled(taskId: string): void;
}

/**
 * Configuration for storage layer initialization
 */
export interface StorageConfig {
  /** Path to the SQLite database file */
  databasePath: string;
  /** Path for secure storage (keychain integration) */
  secureStoragePath: string;
}

/**
 * Configuration for OpenCode CLI adapter
 */
export interface OpenCodeConfig {
  /** Platform configuration */
  platform: PlatformConfig;
  /** Handler for permission requests */
  permissionHandler: PermissionHandler;
  /** Handler for task events */
  eventHandler: TaskEventHandler;
  /** Working directory for task execution */
  workingDirectory: string;
  /** Path to MCP tools directory */
  mcpToolsPath: string;
  /** Path to bundled Node.js bin directory (for npx) */
  bundledNodeBinPath?: string;
}

/**
 * Configuration for CLI path resolution
 */
export interface CliResolverConfig {
  /** Whether the app is packaged (production) */
  isPackaged: boolean;
  /** Path to app resources */
  resourcesPath?: string;
  /** Path to the app installation */
  appPath?: string;
}

/**
 * Resolved paths for OpenCode CLI
 */
export interface ResolvedCliPaths {
  /** Full path to the CLI executable */
  cliPath: string;
  /** Directory containing the CLI */
  cliDir: string;
  /** Source of the CLI (bundled, local, global) */
  source: 'bundled' | 'local' | 'global';
}

/**
 * Paths to bundled Node.js executables
 */
export interface BundledNodePaths {
  /** Path to node executable */
  nodePath: string;
  /** Path to npm executable */
  npmPath: string;
  /** Path to npx executable */
  npxPath: string;
  /** Directory containing the executables */
  binDir: string;
}

// Re-export shared types for convenience
export type {
  PermissionRequest,
  PermissionResponse,
  Task,
  TaskMessage,
  TaskProgress,
  TaskResult,
};
