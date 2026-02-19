import { getAllCloudProviders } from '../storage/repositories/cloudProviders.js';
import type { BrowserbaseConfig } from '../common/types/cloudProviders.js';

export interface BrowserConnectionEnv {
  BROWSERBASE_API_KEY?: string;
  BROWSERBASE_PROJECT_ID?: string;
}

export class BrowserFactory {
  /**
   * Determines the environment variables needed for the dev-browser process.
   * If a cloud provider is enabled, it returns the credentials.
   * Otherwise, it returns an empty object (local browser).
   */
  static getBrowserConnectionEnv(): BrowserConnectionEnv {
    try {
      const providers = getAllCloudProviders();
      const enabledProvider = providers.find((p) => p.enabled);

      if (enabledProvider && enabledProvider.providerId === 'browserbase') {
        const config = enabledProvider.config as BrowserbaseConfig;
        if (config.apiKey && config.projectId) {
          console.log(`[BrowserFactory] Using Cloud Browser: ${enabledProvider.name}`);
          return {
            BROWSERBASE_API_KEY: config.apiKey,
            BROWSERBASE_PROJECT_ID: config.projectId,
          };
        }
      }
    } catch (error) {
      console.error('[BrowserFactory] Failed to determine browser connection env:', error);
    }

    console.log('[BrowserFactory] Using Local Browser');
    return {};
  }
}
