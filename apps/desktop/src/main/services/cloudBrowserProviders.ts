import type { CloudBrowserConfig, CloudBrowserCredentials } from '@accomplish_ai/agent-core';

/**
 * Interface for cloud browser providers
 */
export interface CloudBrowserProvider {
  name: string;
  validateConfig(config: CloudBrowserConfig): { valid: boolean; error?: string };
  createSession?(config: CloudBrowserConfig, credentials: CloudBrowserCredentials | null): Promise<any>;
}

/**
 * AWS AgentCore Provider Implementation
 */
class AwsAgentCoreProvider implements CloudBrowserProvider {
  name = 'aws-agentcore';

  validateConfig(config: CloudBrowserConfig): { valid: boolean; error?: string } {
    if (config.provider !== 'aws-agentcore') {
      return { valid: false, error: 'Invalid provider for AWS AgentCore' };
    }

    if (typeof config.enabled !== 'boolean') {
      return { valid: false, error: 'enabled must be boolean' };
    }

    if (!config.region || typeof config.region !== 'string') {
      return { valid: false, error: 'region is required and must be string' };
    }

    if (config.authMode !== 'accessKeys' && config.authMode !== 'profile') {
      return { valid: false, error: 'authMode must be accessKeys or profile' };
    }

    if (config.cdpEndpoint) {
      try {
        new URL(config.cdpEndpoint);
        if (!['https:', 'http:'].includes(new URL(config.cdpEndpoint).protocol)) {
          return { valid: false, error: 'CDP endpoint must use HTTP or HTTPS protocol' };
        }
      } catch {
        return { valid: false, error: 'Invalid CDP endpoint URL format' };
      }
    }

    if (config.agentCoreApiUrl) {
      try {
        new URL(config.agentCoreApiUrl);
        if (!['https:', 'http:'].includes(new URL(config.agentCoreApiUrl).protocol)) {
          return { valid: false, error: 'AgentCore API URL must use HTTP or HTTPS protocol' };
        }
      } catch {
        return { valid: false, error: 'Invalid AgentCore API URL format' };
      }
    }

    return { valid: true };
  }
}

/**
 * Registry for cloud browser providers
 */
class CloudBrowserProviderRegistry {
  private providers = new Map<string, CloudBrowserProvider>();

  constructor() {
    // Register built-in providers
    this.register(new AwsAgentCoreProvider());
  }

  register(provider: CloudBrowserProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): CloudBrowserProvider | undefined {
    return this.providers.get(name);
  }

  validateConfig(config: CloudBrowserConfig): { valid: boolean; error?: string } {
    const provider = this.get(config.provider);
    if (!provider) {
      return { valid: false, error: `Unsupported cloud browser provider: ${config.provider}` };
    }
    return provider.validateConfig(config);
  }

  getSupportedProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Export singleton instance
export const cloudBrowserProviderRegistry = new CloudBrowserProviderRegistry();
