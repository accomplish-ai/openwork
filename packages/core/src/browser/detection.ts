/**
 * Browser detection utilities
 *
 * Platform-independent functions to detect installed browsers
 * (System Chrome and Playwright Chromium).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Check if system Chrome is installed
 */
export function isSystemChromeInstalled(): boolean {
  if (process.platform === 'darwin') {
    return fs.existsSync('/Applications/Google Chrome.app');
  } else if (process.platform === 'win32') {
    // Check common Windows Chrome locations
    const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    return (
      fs.existsSync(path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe')) ||
      fs.existsSync(path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    );
  }
  // Linux - check common paths
  return fs.existsSync('/usr/bin/google-chrome') || fs.existsSync('/usr/bin/chromium-browser');
}

/**
 * Check if Playwright Chromium is installed
 */
export function isPlaywrightInstalled(): boolean {
  const homeDir = os.homedir();
  const possiblePaths = [
    path.join(homeDir, 'Library', 'Caches', 'ms-playwright'), // macOS
    path.join(homeDir, '.cache', 'ms-playwright'), // Linux
  ];

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    possiblePaths.unshift(path.join(process.env.LOCALAPPDATA, 'ms-playwright'));
  }

  for (const playwrightDir of possiblePaths) {
    if (fs.existsSync(playwrightDir)) {
      try {
        const entries = fs.readdirSync(playwrightDir);
        if (entries.some((entry) => entry.startsWith('chromium'))) {
          return true;
        }
      } catch {
        continue;
      }
    }
  }
  return false;
}

/**
 * Check if any browser is available (Chrome or Playwright)
 */
export function hasBrowserAvailable(): boolean {
  return isSystemChromeInstalled() || isPlaywrightInstalled();
}
