/**
 * Factory function for creating sandbox providers.
 *
 * Returns the appropriate provider based on the configured sandbox mode.
 */

import type { SandboxConfig, SandboxProvider } from '../common/types/sandbox.js';
import { DisabledSandboxProvider } from '../sandbox/disabled-provider.js';
import { NativeSandboxProvider } from '../sandbox/native-provider.js';

export function createSandboxProvider(
  config: SandboxConfig,
  platform?: NodeJS.Platform,
): SandboxProvider {
  switch (config.mode) {
    case 'native':
      return new NativeSandboxProvider(platform);
    case 'disabled':
    default:
      return new DisabledSandboxProvider();
  }
}
