import type { CloudBrowserConfig, CloudBrowserCredentials } from '@accomplish_ai/agent-core';
import type { CloudBrowserSession } from './cloudBrowserAgentCore';

export interface CloudBrowserProvider {
  name: string;
  validateConfig(config: CloudBrowserConfig): { valid: boolean; error?: string };
  createSession?(config: CloudBrowserConfig, credentials: CloudBrowserCredentials | null): Promise<CloudBrowserSession>;
}

/**
 * Validates that a URL uses HTTP or HTTPS protocol
 */
function validateHttpUrl(url: string, urlType: 'CDP endpoint' | 'AgentCore API URL'): { valid: boolean; error?: string } {
  try {
    const parsedUrl = new URL(url);
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
      return { valid: false, error: `${urlType} must use HTTP or HTTPS protocol` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `Invalid ${urlType} format` };
  }
}

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
      const validation = validateHttpUrl(config.cdpEndpoint, 'CDP endpoint');
      if (!validation.valid) {
        return validation;
      }
    }

    if (config.agentCoreApiUrl) {
      const validation = validateHttpUrl(config.agentCoreApiUrl, 'AgentCore API URL');
      if (!validation.valid) {
        return validation;
      }
    }

    return { valid: true };
  }
}

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

export const cloudBrowserProviderRegistry = new CloudBrowserProviderRegistry();
