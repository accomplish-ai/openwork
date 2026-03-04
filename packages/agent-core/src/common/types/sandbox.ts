/**
 * Sandbox configuration types for restricting agent FS/Network access.
 *
 * Used by the SandboxProvider abstraction in packages/agent-core/src/sandbox/.
 */

/** Sandbox enforcement mode */
export type SandboxMode = 'disabled' | 'native';

/** User-configurable sandbox settings */
export interface SandboxConfig {
  /** Which sandbox backend to use */
  mode: SandboxMode;
  /** Allowed filesystem paths the agent may read/write */
  allowedPaths: string[];
  /** Whether outbound network access is restricted */
  networkRestricted: boolean;
  /** Hosts exempt from network restriction (e.g. API endpoints) */
  allowedHosts: string[];
}

/** Default (disabled) sandbox configuration */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  mode: 'disabled',
  allowedPaths: [],
  networkRestricted: false,
  allowedHosts: [],
};

/** Arguments passed through the sandbox provider spawn wrapper */
export interface SpawnArgs {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

/**
 * Pluggable sandbox provider interface.
 *
 * Implementations wrap the pty.spawn() call to enforce FS/network policies.
 */
export interface SandboxProvider {
  /** Human-readable name of this sandbox backend */
  readonly name: string;

  /** Check whether this sandbox backend is available on the current platform */
  isAvailable(): Promise<boolean>;

  /**
   * Wrap spawn arguments to apply sandbox restrictions.
   *
   * - Native provider: injects env vars and/or wraps command with OS sandbox
   * - Disabled provider: returns args unchanged (passthrough)
   */
  wrapSpawnArgs(args: SpawnArgs, config: SandboxConfig): Promise<SpawnArgs>;

  /** Build sandbox-specific environment variables */
  buildSandboxEnvironment(config: SandboxConfig): Record<string, string>;

  /** Cleanup resources on disposal */
  dispose(): Promise<void>;
}
