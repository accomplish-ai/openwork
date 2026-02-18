export type CloudBrowserProviderId = 'aws-agentcore';

export interface AwsAgentCoreConfig {
  region: string;
  authType: 'profile' | 'accessKeys';
  profileName?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface CloudBrowserConfig {
  providerId: CloudBrowserProviderId;
  config: string;
  enabled: boolean;
  lastValidated?: number;
}
