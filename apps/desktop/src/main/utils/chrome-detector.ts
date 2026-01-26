/**
 * Chrome browser detection utility
 *
 * Detects Chrome/Chromium across platforms (darwin, win32, linux) and returns
 * verbose error information if not found. Used by AppInitManager to check
 * dev-browser-mcp prerequisites.
 *
 * @module main/utils/chrome-detector
 */

import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { InitError } from '@accomplish/shared';

const execFileAsync = promisify(execFile);

export interface ChromeDetectionResult {
  found: boolean;
  path: string | null;
  version: string | null;
  error: InitError | null;
}

/**
 * Get platform-specific Chrome installation paths to check.
 * Returns paths in order of preference.
 */
export function getChromePaths(platform: string): string[] {
  switch (platform) {
    case 'darwin':
      return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
      ];
    case 'win32':
      return [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      ];
    case 'linux':
      return [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
      ];
    default:
      return [];
  }
}

/**
 * Check if a file exists at the given path.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Chrome version by running chrome --version.
 * Returns null if unable to get version (not executable, timeout, etc).
 */
async function getChromeVersion(chromePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(chromePath, ['--version'], { timeout: 5000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Detect Chrome installation on the system.
 *
 * Searches platform-specific installation paths and validates that Chrome
 * is executable by running --version. Returns verbose error info if not found.
 *
 * @returns Detection result with path, version, or structured error
 */
export async function detectChrome(): Promise<ChromeDetectionResult> {
  const searchPaths = getChromePaths(process.platform);

  for (const chromePath of searchPaths) {
    if (await fileExists(chromePath)) {
      const version = await getChromeVersion(chromePath);
      if (version) {
        return { found: true, path: chromePath, version, error: null };
      }
      // File exists but couldn't get version - try next path
    }
  }

  // Not found - return verbose error for debugging
  return {
    found: false,
    path: null,
    version: null,
    error: {
      code: 'CHROME_NOT_FOUND',
      component: 'chrome',
      message: 'Chrome browser not found',
      guidance: 'Install Google Chrome from https://google.com/chrome and restart the app.',
      debugInfo: {
        platform: `${process.platform}-${process.arch}`,
        searchedPaths: searchPaths,
        actualPath: null,
        env: { PATH: process.env.PATH || '' },
      },
    },
  };
}
