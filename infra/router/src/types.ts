export interface RoutingConfig {
  /** Web build ID served by default (e.g., "0.1.0-27") */
  default: string;

  /** Maps desktop (Electron) app version ranges to web build IDs */
  overrides?: Array<{
    desktopRange: string;
    webBuildId: string;
  }>;

  /** All currently deployed web build IDs — used to validate cookies */
  activeVersions: string[];
}

export interface Env {
  ROUTING_CONFIG: KVNamespace;
  KV_CONFIG_KEY?: string;
}
