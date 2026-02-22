/** Supported cloud browser provider IDs */
export type CloudBrowserProvider = 'browserbase';

/** Configuration for a cloud browser provider */
export interface CloudBrowserProviderConfig {
  /** Provider identifier */
  provider: CloudBrowserProvider;
  /** Whether this provider is enabled */
  enabled: boolean;
  /** API key for the provider */
  apiKey?: string;
  /** Project ID (Browserbase) */
  projectId?: string;
  /** Region or endpoint URL */
  endpoint?: string;
}

/** Top-level cloud browser configuration stored in app_settings */
export interface CloudBrowserConfig {
  /** Which provider is active (null = use local browser) */
  activeProvider: CloudBrowserProvider | null;
  /** Per-provider configurations */
  providers: Partial<Record<CloudBrowserProvider, CloudBrowserProviderConfig>>;
}
