/**
 * Disabled sandbox provider — passthrough, no restrictions.
 *
 * Returns spawn arguments unchanged. This is the default provider
 * when sandbox mode is 'disabled'.
 */

import type { SandboxConfig, SandboxProvider, SpawnArgs } from '../common/types/sandbox.js';

export class DisabledSandboxProvider implements SandboxProvider {
  readonly name = 'disabled';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async wrapSpawnArgs(args: SpawnArgs, _config: SandboxConfig): Promise<SpawnArgs> {
    return args;
  }

  buildSandboxEnvironment(_config: SandboxConfig): Record<string, string> {
    return {};
  }

  async dispose(): Promise<void> {
    // nothing to clean up
  }
}
