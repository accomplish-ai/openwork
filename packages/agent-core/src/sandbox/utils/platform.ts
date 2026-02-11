/**
 * Platform detection utilities
 */

import * as fs from 'fs'

export type Platform = 'macos' | 'linux' | 'windows' | 'unknown'

/**
 * Get the WSL version (1 or 2+) if running in WSL.
 * Returns undefined if not running in WSL.
 */
export function getWslVersion(): string | undefined {
  if (process.platform !== 'linux') {
    return undefined
  }

  try {
    const procVersion = fs.readFileSync('/proc/version', { encoding: 'utf8' })

    // Check for explicit WSL version markers (e.g., "WSL2", "WSL3", etc.)
    const wslVersionMatch = procVersion.match(/WSL(\d+)/i)
    if (wslVersionMatch && wslVersionMatch[1]) {
      return wslVersionMatch[1]
    }

    // If no explicit WSL version but contains Microsoft, assume WSL1
    // This handles the original WSL1 format: "4.4.0-19041-Microsoft"
    if (procVersion.toLowerCase().includes('microsoft')) {
      return '1'
    }

    return undefined
  } catch {
    return undefined
  }
}

/**
 * Detect the current platform.
 * Note: All Linux including WSL returns 'linux'. Use getWslVersion() to detect WSL1 (unsupported).
 */
export function getPlatform(): Platform {
  switch (process.platform) {
    case 'darwin':
      return 'macos'
    case 'linux':
      // WSL2+ is treated as Linux (same sandboxing)
      // WSL1 is also returned as 'linux' but will fail isSupportedPlatform check
      return 'linux'
    case 'win32':
      return 'windows'
    default:
      return 'unknown'
  }
}
