/**
 * Clean Start Utility
 *
 * Provides controlled userData directory cleanup for development purposes.
 * This utility includes safety checks to prevent accidental data loss in production.
 *
 * IMPORTANT: This feature is ONLY enabled in development mode (!app.isPackaged).
 * Any attempt to use CLEAN_START in production will be blocked and logged.
 *
 * @module main/utils/clean-start
 */

import { app } from 'electron';
import fs from 'fs';

/**
 * Check if clean start should be performed.
 *
 * Returns true only when:
 * 1. CLEAN_START environment variable is set to '1'
 * 2. App is NOT packaged (development mode only)
 *
 * @returns true if clean start should proceed, false otherwise
 */
export function shouldPerformCleanStart(): boolean {
  const cleanStartRequested = process.env.CLEAN_START === '1';

  if (!cleanStartRequested) {
    return false;
  }

  // CRITICAL SAFETY CHECK: Block in production builds
  if (app.isPackaged) {
    console.warn(
      '[Clean Start] CLEAN_START ignored: This feature is disabled in production builds for safety.'
    );
    return false;
  }

  return true;
}

/**
 * Perform clean start by clearing the userData directory.
 *
 * This function includes multiple safety checks:
 * 1. Only runs when CLEAN_START=1 is set
 * 2. Only runs in development mode (!app.isPackaged)
 * 3. Handles file system errors gracefully
 *
 * @returns true if cleanup was performed, false otherwise
 */
export function performCleanStart(): boolean {
  if (!shouldPerformCleanStart()) {
    return false;
  }

  const userDataPath = app.getPath('userData');
  console.log('[Clean Start] Clearing userData directory:', userDataPath);

  try {
    if (!fs.existsSync(userDataPath)) {
      console.log('[Clean Start] userData directory does not exist, skipping');
      return false;
    }

    fs.rmSync(userDataPath, { recursive: true, force: true });
    console.log('[Clean Start] Successfully cleared userData');
    return true;
  } catch (err) {
    console.error('[Clean Start] Failed to clear userData:', err);
    return false;
  }
}
