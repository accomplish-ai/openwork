/**
 * Electron-specific wrapper for bundled Node.js utilities.
 *
 * This module provides zero-argument convenience functions that read from
 * Electron APIs and delegate to the core package's bundled-node utilities.
 */

import { app } from 'electron';
import {
  getBundledNodePaths as coreGetBundledNodePaths,
  isBundledNodeAvailable as coreIsBundledNodeAvailable,
  getNodePath as coreGetNodePath,
  getNpmPath as coreGetNpmPath,
  getNpxPath as coreGetNpxPath,
  logBundledNodeInfo as coreLogBundledNodeInfo,
  type BundledNodePathsExtended,
} from '@accomplish/core';
import type { PlatformConfig } from '@accomplish/core';

export type { BundledNodePathsExtended as BundledNodePaths };

/**
 * Build PlatformConfig from Electron APIs.
 */
function getElectronPlatformConfig(): PlatformConfig {
  return {
    userDataPath: app.getPath('userData'),
    tempPath: app.getPath('temp'),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    platform: process.platform,
    arch: process.arch,
  };
}

/**
 * Get paths to the bundled Node.js binaries.
 *
 * In packaged apps, returns paths to the bundled Node.js installation.
 * In development mode, returns null (use system Node.js).
 *
 * @returns Paths to bundled Node.js binaries, or null if not available
 */
export function getBundledNodePaths(): BundledNodePathsExtended | null {
  return coreGetBundledNodePaths(getElectronPlatformConfig());
}

/**
 * Check if bundled Node.js is available and accessible.
 *
 * @returns true if bundled Node.js exists and is accessible
 */
export function isBundledNodeAvailable(): boolean {
  return coreIsBundledNodeAvailable(getElectronPlatformConfig());
}

/**
 * Get the node binary path (bundled or system fallback).
 *
 * In packaged apps, returns the bundled node path.
 * In development or if bundled node is unavailable, returns 'node' to use system PATH.
 *
 * @returns Absolute path to node binary or 'node' for system fallback
 */
export function getNodePath(): string {
  return coreGetNodePath(getElectronPlatformConfig());
}

/**
 * Get the npm binary path (bundled or system fallback).
 *
 * @returns Absolute path to npm binary or 'npm' for system fallback
 */
export function getNpmPath(): string {
  return coreGetNpmPath(getElectronPlatformConfig());
}

/**
 * Get the npx binary path (bundled or system fallback).
 *
 * @returns Absolute path to npx binary or 'npx' for system fallback
 */
export function getNpxPath(): string {
  return coreGetNpxPath(getElectronPlatformConfig());
}

/**
 * Log information about the bundled Node.js for debugging.
 */
export function logBundledNodeInfo(): void {
  coreLogBundledNodeInfo(getElectronPlatformConfig());
}
